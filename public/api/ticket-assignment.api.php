<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_admin_auth.php';
require_once __DIR__ . '/_errors.php';
require_once __DIR__ . '/_security_headers.php';
require_once __DIR__ . '/_sqlserver.php';

api_apply_security_headers([
    'allow_methods' => 'POST, OPTIONS',
    'allow_headers' => 'Content-Type, Authorization',
]);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'OK'], JSON_UNESCAPED_UNICODE);
    exit;
}

function ticket_assignment_json(int $status, bool $success, string $message, array $data = []): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge([
        'success' => $success,
        'message' => $message,
    ], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function ticket_assignment_uuid_list(array $values): array {
    $out = [];
    foreach ($values as $value) {
        $id = trim((string)$value);
        if ($id === '' || !preg_match('/^[0-9a-f-]{36}$/i', $id)) continue;
        if (!in_array($id, $out, true)) $out[] = $id;
    }
    return $out;
}

function ticket_assignment_role(string $value, string $fallback = 'secondary'): string {
    $role = strtolower(trim($value));
    return in_array($role, ['primary', 'secondary', 'legal', 'observer'], true) ? $role : $fallback;
}

function ticket_assignment_parse_json($value, $fallback = []) {
    if (is_array($value)) return $value;
    if (!is_string($value) || trim($value) === '') return $fallback;
    $decoded = json_decode($value, true);
    return json_last_error() === JSON_ERROR_NONE ? $decoded : $fallback;
}

function ticket_assignment_handler(array $row, string $prefix = 'handler_'): ?array {
    $id = trim((string)($row[$prefix . 'id'] ?? ''));
    if ($id === '') return null;

    return [
        'id' => $id,
        'name' => $row[$prefix . 'name'] ?? null,
        'email' => $row[$prefix . 'email'] ?? null,
        'roles' => ticket_assignment_parse_json($row[$prefix . 'roles'] ?? null, []),
        'active' => isset($row[$prefix . 'active']) ? (bool)$row[$prefix . 'active'] : null,
    ];
}

function ticket_assignment_ticket(array $row): array {
    $ticket = $row;
    $ticket['metadata'] = ticket_assignment_parse_json($row['metadata'] ?? null, []);
    $ticket['email_notify'] = isset($row['email_notify']) ? (bool)$row['email_notify'] : false;
    $ticket['status_email_notify'] = isset($row['status_email_notify']) ? (bool)$row['status_email_notify'] : true;
    $ticket['is_anonymous'] = isset($row['is_anonymous']) ? (bool)$row['is_anonymous'] : false;
    $ticket['handlers'] = ticket_assignment_handler($row);
    unset(
        $ticket['handler_name'],
        $ticket['handler_email'],
        $ticket['handler_roles'],
        $ticket['handler_active']
    );
    return $ticket;
}

function ticket_assignment_ticket_handlers_from_rows(array $rows): array {
    return array_values(array_map(static function (array $row): array {
        return [
            'id' => $row['id'] ?? null,
            'ticket_id' => $row['ticket_id'] ?? null,
            'handler_id' => $row['handler_id'] ?? null,
            'role' => $row['role'] ?? null,
            'assigned_at' => $row['assigned_at'] ?? null,
            'created_at' => $row['created_at'] ?? null,
            'handler' => [
                'id' => $row['handler_id_ref'] ?? null,
                'name' => $row['handler_name'] ?? null,
                'email' => $row['handler_email'] ?? null,
                'roles' => ticket_assignment_parse_json($row['handler_roles'] ?? null, []),
                'active' => isset($row['handler_active']) ? (bool)$row['handler_active'] : null,
            ],
        ];
    }, $rows));
}

function ticket_assignment_decode_id_list($raw): array {
    $decoded = ticket_assignment_parse_json($raw, []);
    if (!is_array($decoded)) {
        return [];
    }

    $out = [];
    foreach ($decoded as $item) {
        $id = trim((string)(is_array($item) ? ($item['id'] ?? '') : $item));
        if ($id === '' || !preg_match('/^[0-9a-f-]{36}$/i', $id)) {
            continue;
        }
        if (!in_array($id, $out, true)) {
            $out[] = $id;
        }
    }

    return $out;
}

try {
    load_runtime_env(__DIR__);
    api_apply_no_store_headers();

    if (!sqlserver_is_configured()) {
        throw new Exception('SQL Server is not configured');
    }

    api_authz_require_active_handler(static function (int $status, string $message): void {
        ticket_assignment_json($status, false, $message);
    });

    $raw = file_get_contents('php://input');
    $payload = json_decode($raw ?: '', true);
    if (!is_array($payload)) $payload = [];

    $ticketId = trim((string)($payload['ticket_id'] ?? ''));
    if ($ticketId === '' || !preg_match('/^[0-9a-f-]{36}$/i', $ticketId)) {
        ticket_assignment_json(400, false, 'ticket_id is required');
    }

    $handlerIds = ticket_assignment_uuid_list(is_array($payload['handler_ids'] ?? null) ? $payload['handler_ids'] : []);
    $rolesByHandlerId = is_array($payload['roles_by_handler_id'] ?? null) ? $payload['roles_by_handler_id'] : [];

    $desiredAssignments = [];
    foreach ($handlerIds as $index => $handlerId) {
        $desiredAssignments[] = [
            'sort_order' => $index + 1,
            'handler_id' => $handlerId,
            'role' => ticket_assignment_role(
                (string)($rolesByHandlerId[$handlerId] ?? ($index === 0 ? 'primary' : 'secondary')),
                $index === 0 ? 'primary' : 'secondary'
            ),
        ];
    }

    $summarySql = <<<'SQL'
DECLARE @DesiredInput TABLE (
    sort_order INT NULL,
    handler_id UNIQUEIDENTIFIER NULL,
    role NVARCHAR(20) NULL
);

INSERT INTO @DesiredInput (sort_order, handler_id, role)
SELECT
    sort_order,
    handler_id,
    LOWER(LTRIM(RTRIM(COALESCE(role, N''))))
FROM OPENJSON(@desired_assignments_json)
WITH (
    sort_order INT '$.sort_order',
    handler_id UNIQUEIDENTIFIER '$.handler_id',
    role NVARCHAR(20) '$.role'
);

DECLARE @Desired TABLE (
    row_num INT NOT NULL,
    handler_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    role NVARCHAR(20) NOT NULL
);

INSERT INTO @Desired (row_num, handler_id, role)
SELECT
    ROW_NUMBER() OVER (ORDER BY MIN(COALESCE(sort_order, 2147483647)) ASC, handler_id ASC) AS row_num,
    handler_id,
    CASE
        WHEN MAX(CASE WHEN role = N'primary' THEN 1 ELSE 0 END) = 1 THEN N'primary'
        WHEN MAX(CASE WHEN role = N'legal' THEN 1 ELSE 0 END) = 1 THEN N'legal'
        WHEN MAX(CASE WHEN role = N'observer' THEN 1 ELSE 0 END) = 1 THEN N'observer'
        ELSE N'secondary'
    END AS role
FROM @DesiredInput
WHERE handler_id IS NOT NULL
GROUP BY handler_id;

IF EXISTS (SELECT 1 FROM @Desired) AND NOT EXISTS (SELECT 1 FROM @Desired WHERE role = N'primary')
BEGIN
    UPDATE @Desired
    SET role = N'primary'
    WHERE row_num = (SELECT MIN(row_num) FROM @Desired);
END;

;WITH ranked_primary AS (
    SELECT
        handler_id,
        role,
        ROW_NUMBER() OVER (ORDER BY CASE WHEN role = N'primary' THEN 0 ELSE 1 END, row_num ASC, handler_id ASC) AS primary_rank
    FROM @Desired
)
UPDATE d
SET role = CASE
    WHEN rp.role = N'primary' AND rp.primary_rank = 1 THEN N'primary'
    WHEN rp.role = N'primary' AND rp.primary_rank > 1 THEN N'secondary'
    ELSE rp.role
END
FROM @Desired d
INNER JOIN ranked_primary rp ON rp.handler_id = d.handler_id;

DECLARE @Previous TABLE (
    handler_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    role NVARCHAR(20) NULL
);

INSERT INTO @Previous (handler_id, role)
SELECT handler_id, role
FROM dbo.ticket_handlers
WHERE ticket_id = @ticket_id;

DELETE th
FROM dbo.ticket_handlers th
LEFT JOIN @Desired d ON d.handler_id = th.handler_id
WHERE th.ticket_id = @ticket_id
  AND d.handler_id IS NULL;

UPDATE th
SET
    role = d.role,
    assigned_at = ISNULL(th.assigned_at, SYSUTCDATETIME())
FROM dbo.ticket_handlers th
INNER JOIN @Desired d ON d.handler_id = th.handler_id
WHERE th.ticket_id = @ticket_id
  AND (ISNULL(th.role, N'') <> d.role OR th.assigned_at IS NULL);

INSERT INTO dbo.ticket_handlers (ticket_id, handler_id, role, assigned_at, created_at)
SELECT
    @ticket_id,
    d.handler_id,
    d.role,
    SYSUTCDATETIME(),
    SYSUTCDATETIME()
FROM @Desired d
LEFT JOIN dbo.ticket_handlers th
    ON th.ticket_id = @ticket_id
   AND th.handler_id = d.handler_id
WHERE th.handler_id IS NULL;

DECLARE @PrimaryHandlerId UNIQUEIDENTIFIER = (
    SELECT TOP 1 handler_id
    FROM @Desired
    WHERE role = N'primary'
    ORDER BY row_num ASC, handler_id ASC
);

IF @PrimaryHandlerId IS NULL
BEGIN
    SELECT TOP 1 @PrimaryHandlerId = handler_id
    FROM @Desired
    ORDER BY row_num ASC, handler_id ASC;
END;

UPDATE dbo.tickets
SET
    handler_id = @PrimaryHandlerId,
    last_update_at = SYSUTCDATETIME(),
    updated_at = SYSUTCDATETIME()
WHERE id = @ticket_id;

SELECT
    @PrimaryHandlerId AS primary_handler_id,
    COALESCE((
        SELECT handler_id AS id
        FROM @Previous
        ORDER BY handler_id
        FOR JSON PATH
    ), '[]') AS previous_ids_json,
    COALESCE((
        SELECT p.handler_id AS id
        FROM @Previous p
        WHERE NOT EXISTS (
            SELECT 1
            FROM @Desired d
            WHERE d.handler_id = p.handler_id
        )
        ORDER BY p.handler_id
        FOR JSON PATH
    ), '[]') AS removed_ids_json,
    COALESCE((
        SELECT d.handler_id AS id
        FROM @Desired d
        WHERE NOT EXISTS (
            SELECT 1
            FROM @Previous p
            WHERE p.handler_id = d.handler_id
        )
        ORDER BY d.row_num ASC, d.handler_id ASC
        FOR JSON PATH
    ), '[]') AS added_ids_json;
SQL;

    $results = sqlserver_run_commands([
        sqlserver_command(
            'query',
            $summarySql,
            [
                'ticket_id' => $ticketId,
                'desired_assignments_json' => json_encode($desiredAssignments, JSON_UNESCAPED_UNICODE),
            ]
        ),
        sqlserver_command(
            'query',
            'SELECT TOP 1
                t.*,
                h.id AS handler_id,
                h.name AS handler_name,
                h.email AS handler_email,
                h.roles AS handler_roles,
                h.active AS handler_active
             FROM dbo.tickets t
             LEFT JOIN dbo.handlers h ON h.id = t.handler_id
             WHERE t.id = @ticket_id',
            ['ticket_id' => $ticketId]
        ),
        sqlserver_command(
            'query',
            'SELECT
                th.*,
                h.id AS handler_id_ref,
                h.name AS handler_name,
                h.email AS handler_email,
                h.roles AS handler_roles,
                h.active AS handler_active
             FROM dbo.ticket_handlers th
             LEFT JOIN dbo.handlers h ON h.id = th.handler_id
             WHERE th.ticket_id = @ticket_id
             ORDER BY th.assigned_at ASC, th.created_at ASC',
            ['ticket_id' => $ticketId]
        ),
    ], true);

    $summary = sqlserver_result_rows($results, 0)[0] ?? [];
    $ticketRow = sqlserver_result_rows($results, 1)[0] ?? null;
    $ticket = is_array($ticketRow) ? ticket_assignment_ticket($ticketRow) : null;
    if (is_array($ticket)) {
        $ticket['ticket_handlers'] = ticket_assignment_ticket_handlers_from_rows(sqlserver_result_rows($results, 2));
    }

    ticket_assignment_json(200, true, 'Ticket handlers synchronized', ['data' => [
        'available' => true,
        'restricted' => false,
        'added_ids' => ticket_assignment_decode_id_list($summary['added_ids_json'] ?? null),
        'removed_ids' => ticket_assignment_decode_id_list($summary['removed_ids_json'] ?? null),
        'previous_ids' => ticket_assignment_decode_id_list($summary['previous_ids_json'] ?? null),
        'next_ids' => $handlerIds,
        'ticket' => $ticket,
    ]]);
} catch (Throwable $e) {
    $errorId = api_log_exception('ticket-assignment.api', $e);
    ticket_assignment_json(500, false, 'Internal server error', ['data' => ['error_id' => $errorId]]);
}
