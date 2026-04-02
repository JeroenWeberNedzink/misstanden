<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_supabase.php';
require_once __DIR__ . '/_errors.php';
require_once __DIR__ . '/_security_headers.php';

api_apply_security_headers([
    'allow_methods' => 'GET, POST, OPTIONS',
    'allow_headers' => 'Content-Type, Authorization',
]);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'OK'], JSON_UNESCAPED_UNICODE);
    exit;
}

ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/../../php-errors.log');
ini_set('display_errors', '0');
error_reporting(E_ALL);

const REPORTER_REPLY_SIGNED_URL_TTL_SECONDS = 180;

function reporter_reply_json(int $status, bool $success, string $message, array $data = []): void {
    http_response_code($status);
    echo json_encode(array_merge([
        'success' => $success,
        'message' => $message,
    ], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function reporter_reply_supabase_request(string $method, string $url, string $serviceKey, $payload = null, bool $returnRepresentation = false): array {
    $headers = [
        'apikey: ' . $serviceKey,
        'Authorization: Bearer ' . $serviceKey,
        'Content-Type: application/json',
    ];
    if ($returnRepresentation) {
        $headers[] = 'Prefer: return=representation';
    }

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 20,
    ]);
    if ($payload !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_UNICODE));
    }

    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($resp === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new Exception('Supabase request failed: ' . $err);
    }
    curl_close($ch);

    return [$code, json_decode($resp, true), $resp];
}

function reporter_reply_get_first_row($decoded): ?array {
    if (is_array($decoded) && array_is_list($decoded)) {
        return count($decoded) > 0 && is_array($decoded[0]) ? $decoded[0] : null;
    }
    return is_array($decoded) ? $decoded : null;
}

function reporter_reply_require_env(string $key): string {
    $value = trim((string)(getenv($key) ?: ''));
    if ($value === '') {
        throw new Exception('Missing required environment variable: ' . $key);
    }
    return $value;
}

function reporter_reply_is_absolute_url(string $value): bool {
    return preg_match('#^https?://#i', $value) === 1;
}

function reporter_reply_attachment_extract_path(string $raw, string $bucket = 'attachments'): ?string {
    $value = trim($raw);
    if ($value === '' || $value === '#') return null;

    if (!reporter_reply_is_absolute_url($value)) {
        $path = ltrim($value, '/');
        if (str_starts_with($path, $bucket . '/')) {
            $path = substr($path, strlen($bucket) + 1);
        }
        return $path !== '' ? $path : null;
    }

    $parsedPath = parse_url($value, PHP_URL_PATH);
    if (!is_string($parsedPath) || $parsedPath === '') return null;

    $needle = '/storage/v1/object/public/' . $bucket . '/';
    $pos = strpos($parsedPath, $needle);
    if ($pos === false) return null;

    $path = substr($parsedPath, $pos + strlen($needle));
    return $path !== '' ? $path : null;
}

function reporter_reply_attachment_signed_url(string $baseUrl, string $serviceKey, string $path, string $bucket = 'attachments', int $expiresIn = REPORTER_REPLY_SIGNED_URL_TTL_SECONDS): ?string {
    $cleanPath = ltrim($path, '/');
    if ($cleanPath === '') return null;

    $url = rtrim($baseUrl, '/') . '/storage/v1/object/sign/' . rawurlencode($bucket) . '/' . str_replace('%2F', '/', rawurlencode($cleanPath));
    [$code, $decoded] = reporter_reply_supabase_request('POST', $url, $serviceKey, ['expiresIn' => $expiresIn], false);
    if ($code < 200 || $code >= 300 || !is_array($decoded)) {
        return null;
    }

    $signed = trim((string)($decoded['signedURL'] ?? $decoded['signedUrl'] ?? ''));
    if ($signed === '') return null;
    if (reporter_reply_is_absolute_url($signed)) return $signed;

    $base = rtrim($baseUrl, '/');
    if (str_starts_with($signed, '/')) {
        return $base . '/storage/v1' . $signed;
    }
    return $base . '/storage/v1/' . ltrim($signed, '/');
}

function reporter_reply_normalize_token($raw): string {
    $token = trim((string)$raw);
    if ($token === '') return '';
    if (preg_match('/^[a-f0-9]{40,256}$/i', $token) === 1) {
        return strtolower($token);
    }
    if (preg_match('/^[A-Za-z0-9\-_]{24,256}$/', $token) === 1) {
        return $token;
    }
    return '';
}

function reporter_reply_load_token_record(string $baseUrl, string $serviceKey, string $token): ?array {
    $url = $baseUrl
        . '/rest/v1/ticket_reply_tokens?select=id,ticket_id,token,expires_at,created_at'
        . '&token=eq.' . rawurlencode($token)
        . '&order=created_at.desc&limit=1';
    [$code, $decoded, $raw] = reporter_reply_supabase_request('GET', $url, $serviceKey);
    if ($code < 200 || $code >= 300) {
        $msg = is_array($decoded) ? json_encode($decoded, JSON_UNESCAPED_UNICODE) : (string)$raw;
        throw new Exception('Failed to load reply token: ' . $msg);
    }
    return reporter_reply_get_first_row($decoded);
}

function reporter_reply_assert_token_valid(array $tokenRow): void {
    $expiresAt = trim((string)($tokenRow['expires_at'] ?? ''));
    if ($expiresAt === '') return;
    $expiresTs = strtotime($expiresAt);
    if ($expiresTs !== false && $expiresTs < time()) {
        reporter_reply_json(410, false, 'Reply token has expired');
    }
}

function reporter_reply_sanitize_ticket(array $ticket, string $baseUrl, string $serviceKey): array {
    unset($ticket['access_code'], $ticket['reporter_email'], $ticket['reporter_email_encrypted'], $ticket['reporter_email_hash']);

    $attachments = is_array($ticket['attachments'] ?? null) ? $ticket['attachments'] : [];
    $ticket['attachments'] = array_values(array_filter($attachments, static function ($att) {
        if (!is_array($att)) return false;
        $isInternal = !empty($att['is_internal']) || !empty($att['isInternal']);
        $hasNote = !empty($att['note_id']) || !empty($att['noteId']);
        return !$isInternal && !$hasNote;
    }));
    $ticket['attachments'] = array_values(array_map(static function ($att) use ($baseUrl, $serviceKey) {
        if (!is_array($att)) return null;
        $rawUrl = (string)($att['file_url'] ?? '');
        $storagePath = reporter_reply_attachment_extract_path($rawUrl, 'attachments');
        $signedUrl = $storagePath ? reporter_reply_attachment_signed_url($baseUrl, $serviceKey, $storagePath, 'attachments') : null;
        $downloadUrl = $signedUrl ?: (reporter_reply_is_absolute_url($rawUrl) ? $rawUrl : null);
        return [
            'id' => $att['id'] ?? null,
            'ticket_id' => $att['ticket_id'] ?? null,
            'file_name' => $att['file_name'] ?? null,
            'mime_type' => $att['mime_type'] ?? null,
            'size_bytes' => $att['size_bytes'] ?? null,
            'created_at' => $att['created_at'] ?? null,
            'file_url' => $downloadUrl,
        ];
    }, $ticket['attachments']));
    $ticket['attachments'] = array_values(array_filter($ticket['attachments'], static fn($att) => is_array($att)));

    $messages = is_array($ticket['messages'] ?? null) ? $ticket['messages'] : [];
    $nowTs = time();
    $ticket['messages'] = array_values(array_filter($messages, static function ($msg) use ($nowTs) {
        if (!is_array($msg)) return false;
        if (!empty($msg['is_internal']) || !empty($msg['isInternal'])) return false;
        $visibleAtRaw = trim((string)($msg['visible_at'] ?? $msg['visibleAt'] ?? ''));
        if ($visibleAtRaw === '') return true;
        $visibleAtTs = strtotime($visibleAtRaw);
        if ($visibleAtTs === false) return true;
        return $visibleAtTs <= $nowTs;
    }));
    usort($ticket['messages'], static function ($a, $b) {
        $ta = strtotime((string)($a['created_at'] ?? '')) ?: 0;
        $tb = strtotime((string)($b['created_at'] ?? '')) ?: 0;
        return $ta <=> $tb;
    });

    return $ticket;
}

function reporter_reply_fetch_ticket(string $baseUrl, string $serviceKey, string $ticketId): ?array {
    $select = 'id,ticket_number,status_code,current_stage,workflow_type,description,location,submitted_at,last_update_at,attachments(*),messages(*)';
    $url = $baseUrl
        . '/rest/v1/tickets?select=' . rawurlencode($select)
        . '&id=eq.' . rawurlencode($ticketId)
        . '&limit=1';
    [$code, $decoded, $raw] = reporter_reply_supabase_request('GET', $url, $serviceKey);
    if ($code < 200 || $code >= 300) {
        $msg = is_array($decoded) ? json_encode($decoded, JSON_UNESCAPED_UNICODE) : (string)$raw;
        throw new Exception('Failed to load ticket thread: ' . $msg);
    }
    $row = reporter_reply_get_first_row($decoded);
    return $row ? reporter_reply_sanitize_ticket($row, $baseUrl, $serviceKey) : null;
}

function reporter_reply_insert_message(string $baseUrl, string $serviceKey, string $ticketId, string $body): array {
    [$code, $decoded, $raw] = reporter_reply_supabase_request(
        'POST',
        $baseUrl . '/rest/v1/messages',
        $serviceKey,
        [
            'ticket_id' => $ticketId,
            'sender' => 'reporter',
            'body' => $body,
            'is_internal' => false,
            'visible_at' => gmdate('c'),
        ],
        true
    );
    if ($code < 200 || $code >= 300) {
        $msg = is_array($decoded) ? json_encode($decoded, JSON_UNESCAPED_UNICODE) : (string)$raw;
        throw new Exception('Failed to insert reporter message: ' . $msg);
    }

    reporter_reply_supabase_request(
        'PATCH',
        $baseUrl . '/rest/v1/tickets?id=eq.' . rawurlencode($ticketId),
        $serviceKey,
        ['last_update_at' => gmdate('c')],
        false
    );

    return reporter_reply_get_first_row($decoded) ?? [];
}

function reporter_reply_insert_attachment(string $baseUrl, string $serviceKey, string $ticketId, array $data): array {
    $fileName = trim((string)($data['file_name'] ?? ''));
    $fileUrl = trim((string)($data['file_url'] ?? ''));
    $mimeType = trim((string)($data['mime_type'] ?? 'application/octet-stream'));
    $sizeBytes = isset($data['size_bytes']) ? (int)$data['size_bytes'] : null;

    if ($fileName === '' || strlen($fileName) > 255) {
        reporter_reply_json(400, false, 'file_name is required and must be <= 255 chars');
    }
    if ($fileUrl === '') {
        reporter_reply_json(400, false, 'file_url is required');
    }

    [$attCode, $attDecoded, $attRaw] = reporter_reply_supabase_request(
        'POST',
        $baseUrl . '/rest/v1/attachments',
        $serviceKey,
        [
            'ticket_id' => $ticketId,
            'file_name' => $fileName,
            'file_url' => $fileUrl,
            'mime_type' => $mimeType,
            'size_bytes' => $sizeBytes,
            'is_internal' => false,
            'note_id' => null,
        ],
        true
    );
    if ($attCode < 200 || $attCode >= 300) {
        $msg = is_array($attDecoded) ? json_encode($attDecoded, JSON_UNESCAPED_UNICODE) : (string)$attRaw;
        throw new Exception('Failed to insert reporter attachment: ' . $msg);
    }

    reporter_reply_supabase_request(
        'PATCH',
        $baseUrl . '/rest/v1/tickets?id=eq.' . rawurlencode($ticketId),
        $serviceKey,
        ['last_update_at' => gmdate('c')],
        false
    );

    return reporter_reply_get_first_row($attDecoded) ?? [];
}

try {
    load_runtime_env(__DIR__);

    api_apply_no_store_headers();

    $baseUrl = rtrim(reporter_reply_require_env('VITE_SUPABASE_URL'), '/');
    $serviceKey = supabase_get_service_role_key();

    $raw = file_get_contents('php://input');
    $payload = json_decode($raw ?? '', true);
    if (!is_array($payload)) {
        $payload = [];
    }

    $queryAction = strtolower(trim((string)($_GET['action'] ?? '')));
    $bodyAction = strtolower(trim((string)($payload['action'] ?? '')));
    $action = $bodyAction !== '' ? $bodyAction : ($queryAction !== '' ? $queryAction : 'fetch_messages');

    $tokenInput = $payload['token'] ?? $_GET['token'] ?? '';
    $token = reporter_reply_normalize_token($tokenInput);
    if ($token === '') {
        reporter_reply_json(400, false, 'token is required');
    }

    $tokenRow = reporter_reply_load_token_record($baseUrl, $serviceKey, $token);
    if (!$tokenRow) {
        reporter_reply_json(404, false, 'Reply token not found');
    }
    reporter_reply_assert_token_valid($tokenRow);

    $ticketId = trim((string)($tokenRow['ticket_id'] ?? ''));
    if ($ticketId === '') {
        throw new Exception('Reply token has no ticket_id');
    }

    if ($action === 'validate_token' || $action === 'validate') {
        $ticket = reporter_reply_fetch_ticket($baseUrl, $serviceKey, $ticketId);
        reporter_reply_json(200, true, 'Reply token valid', [
            'data' => [
                'ticket' => $ticket,
                'token' => [
                    'expires_at' => $tokenRow['expires_at'] ?? null,
                    'created_at' => $tokenRow['created_at'] ?? null,
                ],
            ],
        ]);
    }

    if ($action === 'send_message' || $action === 'send_reporter_message') {
        $body = trim((string)($payload['body'] ?? ''));
        if ($body === '') {
            reporter_reply_json(400, false, 'body is required');
        }
        if (strlen($body) > 1000) {
            reporter_reply_json(400, false, 'body exceeds 1000 characters');
        }

        $message = reporter_reply_insert_message($baseUrl, $serviceKey, $ticketId, $body);
        $ticket = reporter_reply_fetch_ticket($baseUrl, $serviceKey, $ticketId);
        reporter_reply_json(200, true, 'Message sent', ['data' => ['message' => $message, 'ticket' => $ticket]]);
    }

    if ($action === 'add_attachment') {
        $attachment = reporter_reply_insert_attachment($baseUrl, $serviceKey, $ticketId, $payload);
        $ticket = reporter_reply_fetch_ticket($baseUrl, $serviceKey, $ticketId);
        reporter_reply_json(200, true, 'Attachment added', ['data' => ['attachment' => $attachment, 'ticket' => $ticket]]);
    }

    $ticket = reporter_reply_fetch_ticket($baseUrl, $serviceKey, $ticketId);
    reporter_reply_json(200, true, 'Reply thread loaded', [
        'data' => [
            'ticket' => $ticket,
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
