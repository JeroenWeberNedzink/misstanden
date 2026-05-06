<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_ticket_crypto.php';
require_once __DIR__ . '/_admin_auth.php';
require_once __DIR__ . '/_errors.php';
require_once __DIR__ . '/_security_headers.php';
require_once __DIR__ . '/_sqlserver.php';

api_apply_security_headers([
    'allow_methods' => 'GET, POST, OPTIONS',
    'allow_headers' => 'Content-Type, Authorization',
]);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'OK'], JSON_UNESCAPED_UNICODE);
    exit;
}

function guest_access_json(int $status, bool $success, string $message, array $data = []): void {
    http_response_code($status);
    echo json_encode(array_merge([
        'success' => $success,
        'message' => $message,
    ], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function guest_access_parse_json($value, $fallback = []) {
    if (is_array($value)) return $value;
    if (!is_string($value) || trim($value) === '') return $fallback;
    $decoded = json_decode($value, true);
    return json_last_error() === JSON_ERROR_NONE ? $decoded : $fallback;
}

function guest_access_normalize_token($raw): string {
    $token = trim((string)$raw);
    if ($token === '') return '';
    if (preg_match('/^[a-f0-9]{40,256}$/i', $token) === 1) return strtolower($token);
    if (preg_match('/^[A-Za-z0-9\-_]{24,256}$/', $token) === 1) return $token;
    return '';
}

function guest_access_download_url(?string $raw): ?string {
    $value = trim((string)$raw);
    if ($value === '' || preg_match('#^https?://#i', $value) === 1) {
        return $value !== '' ? $value : null;
    }
    return '/api/files.api.php?action=download&path=' . rawurlencode($value);
}

function guest_access_load_record(string $token): ?array {
    $rows = sqlserver_query(
        'SELECT TOP 1 id, ticket_id, token, role, expires_at, created_at
         FROM dbo.guest_access
         WHERE token = @token
         ORDER BY created_at DESC',
        ['token' => $token]
    );
    return $rows[0] ?? null;
}

function guest_access_assert_valid(array $row): void {
    $expiresAt = trim((string)($row['expires_at'] ?? ''));
    if ($expiresAt === '') {
        guest_access_json(403, false, 'Invalid guest access configuration');
    }
    $expiresTs = strtotime($expiresAt);
    if ($expiresTs !== false && $expiresTs < time()) {
        guest_access_json(410, false, 'Guest access link has expired');
    }
}

function guest_access_fetch_ticket(string $ticketId): ?array {
    $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.tickets WHERE id = @ticket_id', ['ticket_id' => $ticketId]);
    if (!$rows) return null;
    $ticket = ticket_crypto_decrypt_ticket_row($rows[0], true);
    $ticket['metadata'] = guest_access_parse_json($ticket['metadata'] ?? null, []);
    $ticket['email_notify'] = isset($ticket['email_notify']) ? (bool)$ticket['email_notify'] : false;
    $ticket['status_email_notify'] = isset($ticket['status_email_notify']) ? (bool)$ticket['status_email_notify'] : true;
    $ticket['is_anonymous'] = isset($ticket['is_anonymous']) ? (bool)$ticket['is_anonymous'] : false;
    $ticket['attachments'] = sqlserver_query(
        'SELECT * FROM dbo.attachments WHERE ticket_id = @ticket_id ORDER BY created_at ASC',
        ['ticket_id' => $ticketId]
    );
    $ticket['messages'] = array_map('ticket_crypto_decrypt_message_row', sqlserver_query(
        'SELECT * FROM dbo.messages WHERE ticket_id = @ticket_id ORDER BY created_at ASC',
        ['ticket_id' => $ticketId]
    ));
    return $ticket;
}

function guest_access_sanitize_ticket(array $ticket): array {
    unset(
        $ticket['access_code'],
        $ticket['reporter_email'],
        $ticket['reporter_email_encrypted'],
        $ticket['reporter_email_hash'],
        $ticket['description_encrypted'],
        $ticket['location_encrypted'],
        $ticket['reporter_name_encrypted'],
        $ticket['reporter_phone_encrypted']
    );

    $attachments = is_array($ticket['attachments'] ?? null) ? $ticket['attachments'] : [];
    $ticket['attachments'] = array_values(array_filter(array_map(static function ($att) {
        if (!is_array($att)) return null;
        if (!empty($att['is_internal']) || !empty($att['note_id'])) return null;
        return [
            'id' => $att['id'] ?? null,
            'file_name' => $att['file_name'] ?? null,
            'mime_type' => $att['mime_type'] ?? null,
            'size_bytes' => $att['size_bytes'] ?? null,
            'created_at' => $att['created_at'] ?? null,
            'file_url' => guest_access_download_url($att['file_url'] ?? null),
        ];
    }, $attachments)));

    $messages = is_array($ticket['messages'] ?? null) ? $ticket['messages'] : [];
    $ticket['messages'] = array_values(array_filter(array_map(static function ($msg) {
        if (!is_array($msg)) return null;
        if (!empty($msg['is_internal'])) return null;
        return [
            'id' => $msg['id'] ?? null,
            'sender' => $msg['sender'] ?? null,
            'body' => $msg['body'] ?? null,
            'created_at' => $msg['created_at'] ?? null,
            'read_at' => $msg['read_at'] ?? null,
        ];
    }, $messages)));

    $ticket['ticket_comments'] = [];
    unset($ticket['ticket_actions'], $ticket['handlers'], $ticket['ticket_handlers']);
    return $ticket;
}

function guest_access_build_public_url(string $path): string {
    $base = trim((string)(getenv('PORTAL_BASE_URL') ?: ''));
    if ($base !== '') return rtrim($base, '/') . $path;
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = trim((string)($_SERVER['HTTP_HOST'] ?? ''));
    return $host !== '' ? ($scheme . '://' . $host . $path) : $path;
}

try {
    load_runtime_env(__DIR__);
    api_apply_no_store_headers();

    if (!sqlserver_is_configured()) {
        throw new Exception('SQL Server is not configured');
    }

    $raw = file_get_contents('php://input');
    $payload = json_decode($raw ?? '', true);
    if (!is_array($payload)) $payload = [];

    $queryAction = strtolower(trim((string)($_GET['action'] ?? '')));
    $bodyAction = strtolower(trim((string)($payload['action'] ?? '')));
    $action = $bodyAction !== '' ? $bodyAction : ($queryAction !== '' ? $queryAction : 'fetch');

    if ($action === 'create') {
        $ctx = api_authz_require_active_handler(static function (int $status, string $message): void {
            guest_access_json($status, false, $message);
        });
        $adminHandler = (array)($ctx['handler'] ?? []);

        $ticketId = trim((string)($payload['ticket_id'] ?? ''));
        if ($ticketId === '') guest_access_json(400, false, 'ticket_id is required');

        $role = strtolower(trim((string)($payload['role'] ?? 'viewer')));
        if (!in_array($role, ['viewer', 'external_investigator'], true)) {
            guest_access_json(400, false, 'role must be viewer or external_investigator');
        }

        $expiresInHours = isset($payload['expires_in_hours']) ? (int)$payload['expires_in_hours'] : 72;
        if ($expiresInHours <= 0) $expiresInHours = 72;
        if ($expiresInHours > 24 * 30) $expiresInHours = 24 * 30;
        $expiresAt = gmdate('c', time() + ($expiresInHours * 3600));
        $token = bin2hex(random_bytes(32));

        sqlserver_execute(
            'INSERT INTO dbo.guest_access (ticket_id, token, role, expires_at, created_by, created_at)
             VALUES (@ticket_id, @token, @role, @expires_at, @created_by, SYSUTCDATETIME())',
            [
                'ticket_id' => $ticketId,
                'token' => $token,
                'role' => $role,
                'expires_at' => $expiresAt,
                'created_by' => trim((string)($adminHandler['id'] ?? '')) ?: null,
            ]
        );

        $created = guest_access_load_record($token);
        $guestPath = '/guest/' . rawurlencode($token);
        guest_access_json(200, true, 'Guest access created', [
            'data' => [
                'guest_access' => $created,
                'guest_url_path' => $guestPath,
                'guest_url' => guest_access_build_public_url($guestPath),
            ],
        ]);
    }

    $token = guest_access_normalize_token($payload['token'] ?? $_GET['token'] ?? '');
    if ($token === '') guest_access_json(400, false, 'token is required');

    $guestRow = guest_access_load_record($token);
    if (!$guestRow) guest_access_json(404, false, 'Guest access not found');
    guest_access_assert_valid($guestRow);

    $ticketId = trim((string)($guestRow['ticket_id'] ?? ''));
    if ($ticketId === '') throw new Exception('Guest token has no ticket_id');

    $ticket = guest_access_fetch_ticket($ticketId);
    if (!$ticket) guest_access_json(404, false, 'Ticket not found');

    guest_access_json(200, true, 'Guest ticket loaded', [
        'data' => [
            'guest' => [
                'role' => $guestRow['role'] ?? 'viewer',
                'expires_at' => $guestRow['expires_at'] ?? null,
                'created_at' => $guestRow['created_at'] ?? null,
            ],
            'ticket' => guest_access_sanitize_ticket($ticket),
        ],
    ]);
} catch (Throwable $e) {
    $errorId = api_log_exception('guest-access.api', $e);
    guest_access_json(500, false, 'Internal server error', ['data' => ['error_id' => $errorId]]);
}
