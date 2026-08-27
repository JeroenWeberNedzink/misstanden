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

function ticket_read_json(int $status, bool $success, string $message, array $data = []): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge([
        'success' => $success,
        'message' => $message,
    ], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function ticket_read_parse_json($value, $fallback) {
    if (is_array($value)) return $value;
    if (!is_string($value) || trim($value) === '') return $fallback;
    $decoded = json_decode($value, true);
    return json_last_error() === JSON_ERROR_NONE ? $decoded : $fallback;
}

function ticket_read_handler(array $row, string $prefix = 'handler_'): ?array {
    $id = trim((string)($row[$prefix . 'id'] ?? ''));
    if ($id === '') return null;
    return [
        'id' => $id,
        'name' => $row[$prefix . 'name'] ?? null,
        'email' => $row[$prefix . 'email'] ?? null,
        'roles' => ticket_read_parse_json($row[$prefix . 'roles'] ?? null, []),
        'active' => isset($row[$prefix . 'active']) ? (bool)$row[$prefix . 'active'] : null,
    ];
}

function ticket_read_ticket(array $row): array {
    $ticket = ticket_crypto_decrypt_ticket_row($row, true);
    $ticket['metadata'] = ticket_read_parse_json($row['metadata'] ?? null, []);
    $ticket['email_notify'] = isset($row['email_notify']) ? (bool)$row['email_notify'] : false;
    $ticket['status_email_notify'] = isset($row['status_email_notify']) ? (bool)$row['status_email_notify'] : true;
    $ticket['is_anonymous'] = isset($row['is_anonymous']) ? (bool)$row['is_anonymous'] : false;
    if ($ticket['is_anonymous']) {
        $ticket['reporter_name'] = null;
        $ticket['reporter_phone'] = null;
        $ticket['reporter_email'] = null;
        if (is_array($ticket['metadata'] ?? null)) unset($ticket['metadata']['reporter_meta_client'], $ticket['metadata']['reporterMetaClient']);
    }
    $ticket['handlers'] = ticket_read_handler($row);
    unset(
        $ticket['access_code'],
        $ticket['handler_name'],
        $ticket['handler_email'],
        $ticket['handler_roles'],
        $ticket['handler_active']
    );
    return $ticket;
}

function ticket_read_ticket_summary(array $row): array {
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
    $ticket['handlers'] = ticket_read_handler($row);
    unset(
        $ticket['handler_name'],
        $ticket['handler_email'],
        $ticket['handler_roles'],
        $ticket['handler_active']
    );
    return $ticket;
}

function ticket_read_ticket_handlers_from_rows(array $rows): array {
    $map = [];
    foreach ($rows as $row) {
        $ticketId = (string)($row['ticket_id'] ?? '');
        if ($ticketId === '') continue;
        if (!isset($map[$ticketId])) $map[$ticketId] = [];
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
                'roles' => ticket_read_parse_json($row['handler_roles'] ?? null, []),
                'active' => isset($row['handler_active']) ? (bool)$row['handler_active'] : null,
            ],
        ];
    }
    return $map;
}

function ticket_read_ticket_handlers(array $ticketIds): array {
    if (!$ticketIds) return [];
    $params = [];
    $placeholders = [];
    foreach (array_values($ticketIds) as $index => $id) {
        $key = 'ticket_id_' . $index;
        $params[$key] = $id;
        $placeholders[] = '@' . $key;
    }

    $rows = sqlserver_query(
        'SELECT
            th.*,
            h.id AS handler_id_ref,
            h.name AS handler_name,
            h.email AS handler_email,
            h.roles AS handler_roles,
            h.active AS handler_active
         FROM dbo.ticket_handlers th
         LEFT JOIN dbo.handlers h ON h.id = th.handler_id
         WHERE th.ticket_id IN (' . implode(', ', $placeholders) . ')
         ORDER BY th.assigned_at ASC, th.created_at ASC',
        $params
    );

    return ticket_read_ticket_handlers_from_rows($rows);
}

try {
    load_runtime_env(__DIR__);
    api_apply_no_store_headers();

    if (!sqlserver_is_configured()) {
        throw new Exception('SQL Server is not configured');
    }

    api_authz_require_active_handler(static function (int $status, string $message): void {
        ticket_read_json($status, false, $message);
    });

    $action = strtolower(trim((string)($_GET['action'] ?? 'list')));

    if ($action === 'list') {
        $params = [];
        $where = ['1=1'];
        $summaryMode = in_array(strtolower(trim((string)($_GET['summary'] ?? ''))), ['1', 'true', 'yes', 'on'], true);

        $statusCode = trim((string)($_GET['status_code'] ?? ''));
        $severityCode = trim((string)($_GET['severity_code'] ?? ''));
        $workflowType = trim((string)($_GET['workflow_type'] ?? ''));
        $dateFrom = trim((string)($_GET['date_from'] ?? ''));
        $dateTo = trim((string)($_GET['date_to'] ?? ''));
        $search = trim((string)($_GET['search'] ?? ''));
        $filterHandlerId = trim((string)($_GET['handler_id'] ?? ''));

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

        if ($filterHandlerId !== '' && $filterHandlerId !== 'all') {
            $where[] = '(
                t.handler_id = @filter_handler_id
                OR EXISTS (SELECT 1 FROM dbo.ticket_handlers th WHERE th.ticket_id = t.id AND th.handler_id = @filter_handler_id)
                OR EXISTS (
                    SELECT 1
                    FROM dbo.workflows w
                    INNER JOIN dbo.handler_workflows hw ON hw.workflow_id = w.id
                    WHERE hw.handler_id = @filter_handler_id AND w.code = t.workflow_type
                )
            )';
            $params['filter_handler_id'] = $filterHandlerId;
        }

        // Use t.* in summary mode too so older databases without additive encrypted
        // columns do not fail at SQL parse time. The summary normalizer trims the
        // response and only decrypts fields needed by the dashboard list.
        $ticketSelect = 't.*';

        $ticketSql = 'SELECT
                ' . $ticketSelect . ',
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
        ], false);

        $rows = sqlserver_result_rows($results, 0);
        $tickets = array_map($summaryMode ? 'ticket_read_ticket_summary' : 'ticket_read_ticket', $rows);
        $ticketHandlersMap = ticket_read_ticket_handlers_from_rows(sqlserver_result_rows($results, 1));
        foreach ($tickets as &$ticket) {
            $ticket['ticket_handlers'] = $ticketHandlersMap[(string)($ticket['id'] ?? '')] ?? [];
        }
        unset($ticket);

        ticket_read_json(200, true, 'Tickets loaded', ['data' => ['rows' => $tickets]]);
    }

    if ($action === 'get') {
        $ticketId = trim((string)($_GET['ticket_id'] ?? ''));
        $includeRelations = in_array(strtolower(trim((string)($_GET['include_relations'] ?? ''))), ['1', 'true', 'yes', 'on'], true);
        if ($ticketId === '') {
            ticket_read_json(400, false, 'ticket_id is required');
        }

        $commands = [
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
        ];

        if ($includeRelations) {
            $commands[] = sqlserver_command('query', 'SELECT * FROM dbo.attachments WHERE ticket_id = @ticket_id ORDER BY created_at ASC', ['ticket_id' => $ticketId]);
            $commands[] = sqlserver_command('query', 'SELECT * FROM dbo.messages WHERE ticket_id = @ticket_id ORDER BY created_at ASC', ['ticket_id' => $ticketId]);
            $commands[] = sqlserver_command('query', 'SELECT * FROM dbo.ticket_comments WHERE ticket_id = @ticket_id ORDER BY created_at ASC', ['ticket_id' => $ticketId]);
            $commands[] = sqlserver_command('query', 'SELECT * FROM dbo.ticket_actions WHERE ticket_id = @ticket_id ORDER BY created_at ASC', ['ticket_id' => $ticketId]);
        }

        $results = sqlserver_run_commands($commands, false);
        $row = sqlserver_result_rows($results, 0)[0] ?? null;
        if (!$row) {
            ticket_read_json(404, false, 'Ticket not found');
        }

        $ticket = ticket_read_ticket($row);
        $ticketHandlersMap = ticket_read_ticket_handlers_from_rows(sqlserver_result_rows($results, 1));
        $ticket['ticket_handlers'] = $ticketHandlersMap[$ticketId] ?? [];
        $data = ['row' => $ticket];
        if ($includeRelations) {
            $data['relations'] = [
                'attachments' => array_map(static function (array $row): array {
                    $row['is_internal'] = isset($row['is_internal']) ? (bool)$row['is_internal'] : false;
                    return $row;
                }, sqlserver_result_rows($results, 2)),
                'messages' => array_map(static function (array $row): array {
                    $row = ticket_crypto_decrypt_message_row($row);
                    $row['is_internal'] = isset($row['is_internal']) ? (bool)$row['is_internal'] : false;
                    return $row;
                }, sqlserver_result_rows($results, 3)),
                'ticket_comments' => array_map('ticket_crypto_decrypt_comment_row', sqlserver_result_rows($results, 4)),
                'ticket_actions' => array_map('ticket_crypto_decrypt_action_row', sqlserver_result_rows($results, 5)),
            ];
        }
        ticket_read_json(200, true, 'Ticket loaded', ['data' => $data]);
    }

    if ($action === 'relations') {
        $ticketId = trim((string)($_GET['ticket_id'] ?? ''));
        if ($ticketId === '') {
            ticket_read_json(400, false, 'ticket_id is required');
        }

        $results = sqlserver_run_commands([
            sqlserver_command('query', 'SELECT * FROM dbo.attachments WHERE ticket_id = @ticket_id ORDER BY created_at ASC', ['ticket_id' => $ticketId]),
            sqlserver_command('query', 'SELECT * FROM dbo.messages WHERE ticket_id = @ticket_id ORDER BY created_at ASC', ['ticket_id' => $ticketId]),
            sqlserver_command('query', 'SELECT * FROM dbo.ticket_comments WHERE ticket_id = @ticket_id ORDER BY created_at ASC', ['ticket_id' => $ticketId]),
            sqlserver_command('query', 'SELECT * FROM dbo.ticket_actions WHERE ticket_id = @ticket_id ORDER BY created_at ASC', ['ticket_id' => $ticketId]),
        ], false);

        ticket_read_json(200, true, 'Ticket relations loaded', ['data' => [
            'attachments' => array_map(static function (array $row): array {
                $row['is_internal'] = isset($row['is_internal']) ? (bool)$row['is_internal'] : false;
                return $row;
            }, sqlserver_result_rows($results, 0)),
            'messages' => array_map(static function (array $row): array {
                $row = ticket_crypto_decrypt_message_row($row);
                $row['is_internal'] = isset($row['is_internal']) ? (bool)$row['is_internal'] : false;
                return $row;
            }, sqlserver_result_rows($results, 1)),
            'ticket_comments' => array_map('ticket_crypto_decrypt_comment_row', sqlserver_result_rows($results, 2)),
            'ticket_actions' => array_map('ticket_crypto_decrypt_action_row', sqlserver_result_rows($results, 3)),
        ]]);
    }

    ticket_read_json(400, false, 'Unsupported action');
} catch (Throwable $e) {
    $errorId = api_log_exception('ticket-read.api', $e);
    ticket_read_json(500, false, 'Internal server error', ['data' => ['error_id' => $errorId]]);
}
