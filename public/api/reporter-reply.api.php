<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_ticket_crypto.php';
require_once __DIR__ . '/_errors.php';
require_once __DIR__ . '/_security_headers.php';
require_once __DIR__ . '/_sqlserver.php';
require_once __DIR__ . '/_attachment_security.php';
require_once __DIR__ . '/_portal_tokens.php';

api_apply_security_headers([
    'allow_methods' => 'GET, POST, OPTIONS',
    'allow_headers' => 'Content-Type, Authorization',
]);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'OK'], JSON_UNESCAPED_UNICODE);
    exit;
}

function reporter_reply_json(int $status, bool $success, string $message, array $data = []): void {
    http_response_code($status);
    echo json_encode(array_merge([
        'success' => $success,
        'message' => $message,
    ], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function reporter_reply_normalize_token($raw): string {
    $token = trim((string)$raw);
    if ($token === '') return '';
    if (preg_match('/^[a-f0-9]{40,256}$/i', $token) === 1) return strtolower($token);
    if (preg_match('/^[A-Za-z0-9\-_]{24,256}$/', $token) === 1) return $token;
    return '';
}

function reporter_reply_parse_json($value, $fallback = []) {
    if (is_array($value)) return $value;
    if (!is_string($value) || trim($value) === '') return $fallback;
    $decoded = json_decode($value, true);
    return json_last_error() === JSON_ERROR_NONE ? $decoded : $fallback;
}

function reporter_reply_load_token_record(string $token): ?array {
    $rows = sqlserver_query(
        'SELECT TOP 1 id, ticket_id, token, token_hash, expires_at, created_at
         FROM dbo.ticket_reply_tokens
         WHERE (token_hash IS NOT NULL AND token_hash = @token_hash) OR token = @token
         ORDER BY created_at DESC',
        ['token_hash' => portal_token_hash('ticket-reply-token', $token), 'token' => $token]
    );
    return $rows[0] ?? null;
}

function reporter_reply_assert_token_valid(array $tokenRow): void {
    $expiresAt = trim((string)($tokenRow['expires_at'] ?? ''));
    if ($expiresAt === '') return;
    $expiresTs = strtotime($expiresAt);
    if ($expiresTs !== false && $expiresTs < time()) {
        reporter_reply_json(410, false, 'Reply token has expired');
    }
}

function reporter_reply_fetch_ticket(string $ticketId): ?array {
    $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.tickets WHERE id = @ticket_id', ['ticket_id' => $ticketId]);
    if (!$rows) return null;
    $ticket = ticket_crypto_decrypt_ticket_row($rows[0], true);
    $ticket['metadata'] = reporter_reply_parse_json($ticket['metadata'] ?? null, []);
    $ticket['attachments'] = sqlserver_query('SELECT * FROM dbo.attachments WHERE ticket_id = @ticket_id ORDER BY created_at ASC', ['ticket_id' => $ticketId]);
    $ticket['messages'] = array_map('ticket_crypto_decrypt_message_row', sqlserver_query('SELECT * FROM dbo.messages WHERE ticket_id = @ticket_id ORDER BY created_at ASC', ['ticket_id' => $ticketId]));
    return $ticket;
}

function reporter_reply_sanitize_ticket(array $ticket): array {
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
            'ticket_id' => $att['ticket_id'] ?? null,
            'file_name' => $att['file_name'] ?? null,
            'mime_type' => $att['mime_type'] ?? null,
            'size_bytes' => $att['size_bytes'] ?? null,
            'created_at' => $att['created_at'] ?? null,
            'file_url' => attachment_security_download_url($att, 'reply'),
        ];
    }, $attachments)));

    $messages = is_array($ticket['messages'] ?? null) ? $ticket['messages'] : [];
    $nowTs = time();
    $ticket['messages'] = array_values(array_filter(array_map(static function ($msg) use ($nowTs) {
        if (!is_array($msg)) return null;
        if (!empty($msg['is_internal'])) return null;
        $visibleAtRaw = trim((string)($msg['visible_at'] ?? ''));
        $visibleAtTs = $visibleAtRaw !== '' ? strtotime($visibleAtRaw) : false;
        if ($visibleAtTs !== false && $visibleAtTs > $nowTs) return null;
        return $msg;
    }, $messages)));
    usort($ticket['messages'], static function ($a, $b) {
        $ta = strtotime((string)($a['created_at'] ?? '')) ?: 0;
        $tb = strtotime((string)($b['created_at'] ?? '')) ?: 0;
        return $ta <=> $tb;
    });

    return $ticket;
}

function reporter_reply_insert_message(string $ticketId, string $body): array {
    sqlserver_execute(
        'INSERT INTO dbo.messages (ticket_id, sender, body, body_encrypted, is_internal, visible_at, created_at)
         VALUES (@ticket_id, @sender, @body, @body_encrypted, @is_internal, SYSUTCDATETIME(), SYSUTCDATETIME())',
        [
            'ticket_id' => $ticketId,
            'sender' => 'reporter',
            'body' => TICKET_ENCRYPTED_PLACEHOLDER,
            'body_encrypted' => ticket_crypto_encrypt_nullable($body, null, false),
            'is_internal' => false,
        ]
    );
    sqlserver_execute(
        'UPDATE dbo.tickets SET last_update_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @ticket_id',
        ['ticket_id' => $ticketId]
    );
    $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.messages WHERE ticket_id = @ticket_id ORDER BY created_at DESC', ['ticket_id' => $ticketId]);
    $row = $rows[0] ?? [];
    return is_array($row) ? ticket_crypto_decrypt_message_row($row) : [];
}

function reporter_reply_insert_attachment(string $ticketId, array $data): array {
    $upload = attachment_security_validate_upload_token(trim((string)($data['upload_token'] ?? '')), $ticketId, ['reply']);
    if (!$upload) reporter_reply_json(401, false, 'Invalid or expired upload authorization');
    $fileName = trim((string)($upload['n'] ?? ''));
    $fileUrl = (string)$upload['p'];
    $mimeType = trim((string)($upload['m'] ?? 'application/octet-stream'));
    $sizeBytes = (int)($upload['z'] ?? 0);

    if ($fileName === '' || strlen($fileName) > 255) {
        reporter_reply_json(400, false, 'file_name is required and must be <= 255 chars');
    }
    $attachmentId = bin2hex(random_bytes(16));
    $attachmentId = substr($attachmentId,0,8).'-'.substr($attachmentId,8,4).'-4'.substr($attachmentId,13,3).'-a'.substr($attachmentId,17,3).'-'.substr($attachmentId,20,12);

    sqlserver_execute(
        'INSERT INTO dbo.attachments (id, ticket_id, file_name, file_url, mime_type, size_bytes, is_internal, note_id, created_at)
         VALUES (@id, @ticket_id, @file_name, @file_url, @mime_type, @size_bytes, @is_internal, @note_id, SYSUTCDATETIME())',
        [
            'id' => $attachmentId, 'ticket_id' => $ticketId,
            'file_name' => $fileName,
            'file_url' => $fileUrl,
            'mime_type' => $mimeType,
            'size_bytes' => $sizeBytes,
            'is_internal' => false,
            'note_id' => null,
        ]
    );
    sqlserver_execute(
        'UPDATE dbo.tickets SET last_update_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @ticket_id',
        ['ticket_id' => $ticketId]
    );
    $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.attachments WHERE id = @id', ['id' => $attachmentId]);
    return isset($rows[0]) ? attachment_security_public_row($rows[0], 'reply') : [];
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
    $action = $bodyAction !== '' ? $bodyAction : ($queryAction !== '' ? $queryAction : 'fetch_messages');

    $token = reporter_reply_normalize_token($payload['token'] ?? $_GET['token'] ?? '');
    if ($token === '') reporter_reply_json(400, false, 'token is required');

    $tokenRow = reporter_reply_load_token_record($token);
    if (!$tokenRow) reporter_reply_json(404, false, 'Reply token not found');
    reporter_reply_assert_token_valid($tokenRow);

    $ticketId = trim((string)($tokenRow['ticket_id'] ?? ''));
    if ($ticketId === '') {
        throw new Exception('Reply token has no ticket_id');
    }

    if ($action === 'validate_token' || $action === 'validate') {
        $ticket = reporter_reply_fetch_ticket($ticketId);
        reporter_reply_json(200, true, 'Reply token valid', [
            'data' => [
                'ticket' => $ticket ? reporter_reply_sanitize_ticket($ticket) : null,
                'token' => [
                    'expires_at' => $tokenRow['expires_at'] ?? null,
                    'created_at' => $tokenRow['created_at'] ?? null,
                ],
            ],
        ]);
    }

    if ($action === 'send_message' || $action === 'send_reporter_message') {
        $body = trim((string)($payload['body'] ?? ''));
        if ($body === '') reporter_reply_json(400, false, 'body is required');
        if (strlen($body) > 1000) reporter_reply_json(400, false, 'body exceeds 1000 characters');

        $message = reporter_reply_insert_message($ticketId, $body);
        $ticket = reporter_reply_fetch_ticket($ticketId);
        reporter_reply_json(200, true, 'Message sent', ['data' => ['message' => $message, 'ticket' => reporter_reply_sanitize_ticket($ticket ?: [])]]);
    }

    if ($action === 'add_attachment') {
        $attachment = reporter_reply_insert_attachment($ticketId, $payload);
        $ticket = reporter_reply_fetch_ticket($ticketId);
        reporter_reply_json(200, true, 'Attachment added', ['data' => ['attachment' => $attachment, 'ticket' => reporter_reply_sanitize_ticket($ticket ?: [])]]);
    }

    $ticket = reporter_reply_fetch_ticket($ticketId);
    reporter_reply_json(200, true, 'Reply thread loaded', [
        'data' => [
            'ticket' => $ticket ? reporter_reply_sanitize_ticket($ticket) : null,
            'token' => [
                'expires_at' => $tokenRow['expires_at'] ?? null,
                'created_at' => $tokenRow['created_at'] ?? null,
            ],
        ],
    ]);
} catch (Throwable $e) {
    $errorId = api_log_exception('reporter-reply.api', $e);
    reporter_reply_json(500, false, 'Internal server error', ['data' => ['error_id' => $errorId]]);
}
