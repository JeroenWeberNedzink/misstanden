<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_ticket_crypto.php';
require_once __DIR__ . '/_admin_auth.php';
require_once __DIR__ . '/_errors.php';
require_once __DIR__ . '/_security_headers.php';
require_once __DIR__ . '/_sqlserver.php';

api_apply_security_headers([
    'allow_methods' => 'GET, OPTIONS',
    'allow_headers' => 'Content-Type, Authorization',
]);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'OK'], JSON_UNESCAPED_UNICODE);
    exit;
}

function handler_dashboard_json(int $status, bool $success, string $message, array $data = []): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge([
        'success' => $success,
        'message' => $message,
    ], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function handler_dashboard_bool_query(string $key, bool $default = false): bool {
    if (!array_key_exists($key, $_GET)) {
        return $default;
    }
    $raw = strtolower(trim((string)($_GET[$key] ?? '')));
    if ($raw === '') {
        return $default;
    }
    return in_array($raw, ['1', 'true', 'yes', 'on'], true);
}

function handler_dashboard_parse_json($value, $fallback) {
    if (is_array($value)) {
        return $value;
    }
    if (!is_string($value) || trim($value) === '') {
        return $fallback;
    }
    $decoded = json_decode($value, true);
    return json_last_error() === JSON_ERROR_NONE ? $decoded : $fallback;
}

function handler_dashboard_ticket_handler(array $row, string $prefix = 'handler_'): ?array {
    $id = trim((string)($row[$prefix . 'id'] ?? ''));
    if ($id === '') {
        return null;
    }
    return [
        'id' => $id,
        'name' => $row[$prefix . 'name'] ?? null,
        'email' => $row[$prefix . 'email'] ?? null,
        'roles' => handler_dashboard_parse_json($row[$prefix . 'roles'] ?? null, []),
        'active' => isset($row[$prefix . 'active']) ? (bool)$row[$prefix . 'active'] : null,
    ];
}

function handler_dashboard_ticket_summary(array $row): array {
    $ticket = $row;
    foreach ([
        'description' => 'description_encrypted',
        'location' => 'location_encrypted',
    ] as $plainField => $encryptedField) {
        $ticket = ticket_crypto_decrypt_field($ticket, $plainField, $encryptedField);
    }

    unset(
        $ticket['access_code'],
        $ticket['reporter_email'],
        $ticket['reporter_email_encrypted'],
        $ticket['reporter_email_hash'],
        $ticket['reporter_name'],
        $ticket['reporter_name_encrypted'],
        $ticket['reporter_phone'],
        $ticket['reporter_phone_encrypted']
    );

    $ticket['metadata'] = [];
    $ticket['email_notify'] = isset($row['email_notify']) ? (bool)$row['email_notify'] : false;
    $ticket['status_email_notify'] = isset($row['status_email_notify']) ? (bool)$row['status_email_notify'] : true;
    $ticket['is_anonymous'] = isset($row['is_anonymous']) ? (bool)$row['is_anonymous'] : false;
    $ticket['handlers'] = handler_dashboard_ticket_handler($row);
    unset(
        $ticket['handler_name'],
        $ticket['handler_email'],
        $ticket['handler_roles'],
        $ticket['handler_active']
    );
    return $ticket;
}

function handler_dashboard_ticket_handlers_from_rows(array $rows): array {
    $map = [];
    foreach ($rows as $row) {
        $ticketId = (string)($row['ticket_id'] ?? '');
        if ($ticketId === '') {
            continue;
        }
        if (!isset($map[$ticketId])) {
            $map[$ticketId] = [];
        }
        $map[$ticketId][] = [
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
                'roles' => handler_dashboard_parse_json($row['handler_roles'] ?? null, []),
                'active' => isset($row['handler_active']) ? (bool)$row['handler_active'] : null,
            ],
        ];
    }
    return $map;
}

function handler_dashboard_normalize_status_row(array $row): array {
    $row['next_codes'] = handler_dashboard_parse_json($row['next_codes'] ?? null, []);
    return $row;
}

function handler_dashboard_filter_sql(array &$params): array {
    $where = ['1=1'];

    $statusCode = trim((string)($_GET['status_code'] ?? ''));
    $severityCode = trim((string)($_GET['severity_code'] ?? ''));
    $workflowType = trim((string)($_GET['workflow_type'] ?? ''));
    $dateFrom = trim((string)($_GET['date_from'] ?? ''));
    $dateTo = trim((string)($_GET['date_to'] ?? ''));
    $search = trim((string)($_GET['search'] ?? ''));

    if ($statusCode !== '' && $statusCode !== 'all') {
        $where[] = 't.status_code = @status_code';
        $params['status_code'] = $statusCode;
    }
    if ($severityCode !== '' && $severityCode !== 'all') {
        $where[] = 't.severity_code = @severity_code';
        $params['severity_code'] = $severityCode;
    }
    if ($workflowType !== '' && $workflowType !== 'all') {
        $where[] = 't.workflow_type = @workflow_type';
        $params['workflow_type'] = $workflowType;
    }
    if ($dateFrom !== '') {
        $where[] = 't.submitted_at >= @date_from';
        $params['date_from'] = $dateFrom;
    }
    if ($dateTo !== '') {
        $where[] = 't.submitted_at <= @date_to';
        $params['date_to'] = $dateTo;
    }
    if ($search !== '') {
        $where[] = '(t.ticket_number LIKE @search OR t.description LIKE @search OR t.reporter_name LIKE @search)';
        $params['search'] = '%' . $search . '%';
    }

    return $where;
}

try {
    load_runtime_env(__DIR__);
    api_apply_no_store_headers();

    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        handler_dashboard_json(405, false, 'Method not allowed');
    }
    if (!sqlserver_is_configured()) {
        throw new Exception('SQL Server is not configured');
    }

    $ctx = api_authz_require_active_handler(static function (int $status, string $message): void {
        handler_dashboard_json($status, false, $message);
    });
    $handler = (array)($ctx['handler'] ?? []);
    $isAdmin = api_authz_is_admin($handler);
    $handlerId = trim((string)($handler['id'] ?? ''));
    if ($handlerId === '') {
        handler_dashboard_json(403, false, 'Handler account not active or not found');
    }
    unset(
        $handler['resolved_role_codes'],
        $handler['resolved_permission_codes']
    );

    $includeInactive = handler_dashboard_bool_query('include_inactive', false);
    $params = [];
    $where = handler_dashboard_filter_sql($params);
    $accessSql = '(
        @dashboard_is_admin = 1
        OR t.handler_id = @current_handler_id
        OR EXISTS (
            SELECT 1
            FROM dbo.ticket_handlers th_scope
            WHERE th_scope.ticket_id = t.id AND th_scope.handler_id = @current_handler_id
        )
        OR EXISTS (
            SELECT 1
            FROM dbo.workflows w_scope
            INNER JOIN dbo.handler_workflows hw_scope ON hw_scope.workflow_id = w_scope.id
            WHERE hw_scope.handler_id = @current_handler_id AND w_scope.code = t.workflow_type
        )
    )';
    $where[] = $accessSql;
    $params['dashboard_is_admin'] = $isAdmin;
    $params['current_handler_id'] = $handlerId;

    $workflowParams = [];
    $workflowWhere = '';
    $statusWorkflowActiveJoin = '';
    if (!$includeInactive) {
        $workflowWhere = ' WHERE active = @workflow_active';
        $statusWorkflowActiveJoin = ' AND w.active = @workflow_active';
        $workflowParams['workflow_active'] = true;
    }

    $ticketSql = 'SELECT
            t.*,
            h.id AS handler_id,
            h.name AS handler_name,
            h.email AS handler_email,
            h.roles AS handler_roles,
            h.active AS handler_active
         FROM dbo.tickets t
         LEFT JOIN dbo.handlers h ON h.id = t.handler_id
         WHERE ' . implode(' AND ', $where) . '
         ORDER BY t.submitted_at DESC';

    $ticketHandlersSql = 'SELECT
            th.*,
            h.id AS handler_id_ref,
            h.name AS handler_name,
            h.email AS handler_email,
            h.roles AS handler_roles,
            h.active AS handler_active
         FROM dbo.ticket_handlers th
         LEFT JOIN dbo.handlers h ON h.id = th.handler_id
         WHERE th.ticket_id IN (
            SELECT t.id
            FROM dbo.tickets t
            WHERE ' . implode(' AND ', $where) . '
         )
         ORDER BY th.ticket_id ASC, th.assigned_at ASC, th.created_at ASC';

    $results = sqlserver_run_commands([
        sqlserver_command('query', $ticketSql, $params),
        sqlserver_command('query', $ticketHandlersSql, $params),
        sqlserver_command(
            'query',
            'SELECT id, code, name, description, icon_name, color_scheme, active, display_order, statutory_deadline_days
             FROM dbo.workflows' . $workflowWhere . '
             ORDER BY display_order ASC, name ASC',
            $workflowParams
        ),
        sqlserver_command(
            'query',
            'SELECT
                ws.id, ws.workflow_id, ws.code, ws.label, ws.color, ws.sort_order,
                ws.is_terminal, ws.is_first_response, ws.next_codes, ws.expected_duration_days
             FROM dbo.workflow_statuses ws
             INNER JOIN dbo.workflows w ON w.id = ws.workflow_id' . $statusWorkflowActiveJoin . '
             ORDER BY ws.workflow_id ASC, ws.sort_order ASC, ws.label ASC',
            $workflowParams
        ),
        sqlserver_command(
            'query',
            'SELECT id, code, label, color, sort_order, active
             FROM dbo.incident_severities
             WHERE active = @severity_active
             ORDER BY sort_order ASC, label ASC',
            ['severity_active' => true]
        ),
    ], false);

    $tickets = array_map('handler_dashboard_ticket_summary', sqlserver_result_rows($results, 0));
    $ticketHandlersMap = handler_dashboard_ticket_handlers_from_rows(sqlserver_result_rows($results, 1));
    foreach ($tickets as &$ticket) {
        $ticket['ticket_handlers'] = $ticketHandlersMap[(string)($ticket['id'] ?? '')] ?? [];
    }
    unset($ticket);

    $statusMap = [];
    foreach (sqlserver_result_rows($results, 3) as $statusRow) {
        $workflowId = trim((string)($statusRow['workflow_id'] ?? ''));
        if ($workflowId === '') {
            continue;
        }
        if (!isset($statusMap[$workflowId])) {
            $statusMap[$workflowId] = [];
        }
        $statusMap[$workflowId][] = handler_dashboard_normalize_status_row($statusRow);
    }

    $workflows = array_map(static function (array $workflow) use ($statusMap): array {
        $workflowId = trim((string)($workflow['id'] ?? ''));
        $workflow['statuses'] = $statusMap[$workflowId] ?? [];
        return $workflow;
    }, sqlserver_result_rows($results, 2));

    handler_dashboard_json(200, true, 'Handler dashboard loaded', ['data' => [
        'handler' => $handler,
        'is_admin' => $isAdmin,
        'tickets' => ['rows' => $tickets],
        'catalog' => [
            'workflows' => $workflows,
            'severities' => sqlserver_result_rows($results, 4),
        ],
        'claims_sub' => (string)($claims['sub'] ?? ''),
    ]]);
} catch (Throwable $e) {
    $errorId = api_log_exception('handler-dashboard.api', $e);
    handler_dashboard_json(500, false, 'Internal server error', ['data' => ['error_id' => $errorId]]);
}
