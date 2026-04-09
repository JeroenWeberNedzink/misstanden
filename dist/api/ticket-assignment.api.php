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

    $existingRows = sqlserver_query(
        'SELECT handler_id, role FROM dbo.ticket_handlers WHERE ticket_id = @ticket_id',
        ['ticket_id' => $ticketId]
    );
    $existingIds = array_values(array_filter(array_map(static fn($row) => (string)($row['handler_id'] ?? ''), $existingRows)));
    $existingRoleMap = [];
    foreach ($existingRows as $row) {
        $existingRoleMap[(string)$row['handler_id']] = ticket_assignment_role((string)($row['role'] ?? ''), 'secondary');
    }

    $toRemove = array_values(array_filter($existingIds, static fn($id) => !in_array($id, $handlerIds, true)));
    $toAdd = array_values(array_filter($handlerIds, static fn($id) => !in_array($id, $existingIds, true)));

    if ($toRemove) {
        $params = ['ticket_id' => $ticketId];
        $placeholders = [];
        foreach ($toRemove as $index => $handlerId) {
            $key = 'remove_' . $index;
            $params[$key] = $handlerId;
            $placeholders[] = '@' . $key;
        }
        sqlserver_execute(
            'DELETE FROM dbo.ticket_handlers WHERE ticket_id = @ticket_id AND handler_id IN (' . implode(', ', $placeholders) . ')',
            $params
        );
    }

    foreach ($handlerIds as $index => $handlerId) {
        $role = ticket_assignment_role((string)($rolesByHandlerId[$handlerId] ?? ($index === 0 ? 'primary' : 'secondary')), $index === 0 ? 'primary' : 'secondary');
        if (in_array($handlerId, $toAdd, true)) {
            sqlserver_execute(
                'INSERT INTO dbo.ticket_handlers (ticket_id, handler_id, role, assigned_at, created_at)
                 VALUES (@ticket_id, @handler_id, @role, SYSUTCDATETIME(), SYSUTCDATETIME())',
                [
                    'ticket_id' => $ticketId,
                    'handler_id' => $handlerId,
                    'role' => $role,
                ]
            );
            continue;
        }

        if (($existingRoleMap[$handlerId] ?? 'secondary') !== $role) {
            sqlserver_execute(
                'UPDATE dbo.ticket_handlers SET role = @role WHERE ticket_id = @ticket_id AND handler_id = @handler_id',
                [
                    'ticket_id' => $ticketId,
                    'handler_id' => $handlerId,
                    'role' => $role,
                ]
            );
        }
    }

    ticket_assignment_json(200, true, 'Ticket handlers synchronized', ['data' => [
        'available' => true,
        'restricted' => false,
        'added_ids' => $toAdd,
        'removed_ids' => $toRemove,
        'previous_ids' => $existingIds,
        'next_ids' => $handlerIds,
    ]]);
} catch (Throwable $e) {
    $errorId = api_log_exception('ticket-assignment.api', $e);
    ticket_assignment_json(500, false, 'Internal server error', ['data' => ['error_id' => $errorId]]);
}
