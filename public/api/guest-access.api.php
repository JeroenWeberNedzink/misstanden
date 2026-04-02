<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_admin_auth.php';
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

const GUEST_ACCESS_SIGNED_URL_TTL_SECONDS = 300;

function guest_access_json(int $status, bool $success, string $message, array $data = []): void {
    http_response_code($status);
    echo json_encode(array_merge([
        'success' => $success,
        'message' => $message,
    ], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function guest_access_supabase_request(string $method, string $url, string $serviceKey, $payload = null, bool $returnRepresentation = false): array {
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

function guest_access_first_row($decoded): ?array {
    if (is_array($decoded) && array_is_list($decoded)) {
        return count($decoded) > 0 && is_array($decoded[0]) ? $decoded[0] : null;
    }
    return is_array($decoded) ? $decoded : null;
}

function guest_access_require_env(string $key): string {
    $value = trim((string)(getenv($key) ?: ''));
    if ($value === '') {
        throw new Exception('Missing required environment variable: ' . $key);
    }
    return $value;
}

function guest_access_normalize_token($raw): string {
    $token = trim((string)$raw);
    if ($token === '') return '';
    if (preg_match('/^[a-f0-9]{40,256}$/i', $token) === 1) return strtolower($token);
    if (preg_match('/^[A-Za-z0-9\-_]{24,256}$/', $token) === 1) return $token;
    return '';
}

function guest_access_is_absolute_url(string $value): bool {
    return preg_match('#^https?://#i', $value) === 1;
}

function guest_access_extract_storage_path(string $raw, string $bucket = 'attachments'): ?string {
    $value = trim($raw);
    if ($value === '' || $value === '#') return null;
    if (!guest_access_is_absolute_url($value)) {
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

function guest_access_signed_url(string $baseUrl, string $serviceKey, string $path, string $bucket = 'attachments', int $expiresIn = GUEST_ACCESS_SIGNED_URL_TTL_SECONDS): ?string {
    $cleanPath = ltrim($path, '/');
    if ($cleanPath === '') return null;
    $url = rtrim($baseUrl, '/') . '/storage/v1/object/sign/' . rawurlencode($bucket) . '/' . str_replace('%2F', '/', rawurlencode($cleanPath));
    [$code, $decoded] = guest_access_supabase_request('POST', $url, $serviceKey, ['expiresIn' => $expiresIn], false);
    if ($code < 200 || $code >= 300 || !is_array($decoded)) return null;
    $signed = trim((string)($decoded['signedURL'] ?? $decoded['signedUrl'] ?? ''));
    if ($signed === '') return null;
    if (guest_access_is_absolute_url($signed)) return $signed;
    $base = rtrim($baseUrl, '/');
    if (str_starts_with($signed, '/')) return $base . '/storage/v1' . $signed;
    return $base . '/storage/v1/' . ltrim($signed, '/');
}

function guest_access_load_record(string $baseUrl, string $serviceKey, string $token): ?array {
    $url = $baseUrl
        . '/rest/v1/guest_access?select=id,ticket_id,token,role,expires_at,created_at'
        . '&token=eq.' . rawurlencode($token)
        . '&order=created_at.desc&limit=1';
    [$code, $decoded, $raw] = guest_access_supabase_request('GET', $url, $serviceKey);
    if ($code < 200 || $code >= 300) {
        $msg = is_array($decoded) ? json_encode($decoded, JSON_UNESCAPED_UNICODE) : (string)$raw;
        throw new Exception('Failed to load guest access token: ' . $msg);
    }
    return guest_access_first_row($decoded);
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

function guest_access_fetch_ticket(string $baseUrl, string $serviceKey, string $ticketId): ?array {
    $select = 'id,ticket_number,workflow_type,status_code,current_stage,severity_code,description,location,submitted_at,last_update_at,attachments(*),messages(*)';
    $url = $baseUrl
        . '/rest/v1/tickets?select=' . rawurlencode($select)
        . '&id=eq.' . rawurlencode($ticketId)
        . '&limit=1';
    [$code, $decoded, $raw] = guest_access_supabase_request('GET', $url, $serviceKey);
    if ($code < 200 || $code >= 300) {
        $msg = is_array($decoded) ? json_encode($decoded, JSON_UNESCAPED_UNICODE) : (string)$raw;
        throw new Exception('Failed to load guest ticket: ' . $msg);
    }
    return guest_access_first_row($decoded);
}

function guest_access_sanitize_ticket(array $ticket, string $baseUrl, string $serviceKey): array {
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
        $storagePath = guest_access_extract_storage_path($rawUrl, 'attachments');
        $signedUrl = $storagePath ? guest_access_signed_url($baseUrl, $serviceKey, $storagePath) : null;
        return [
            'id' => $att['id'] ?? null,
            'file_name' => $att['file_name'] ?? null,
            'mime_type' => $att['mime_type'] ?? null,
            'size_bytes' => $att['size_bytes'] ?? null,
            'created_at' => $att['created_at'] ?? null,
            'file_url' => $signedUrl ?: (guest_access_is_absolute_url($rawUrl) ? $rawUrl : null),
        ];
    }, $ticket['attachments']));
    $ticket['attachments'] = array_values(array_filter($ticket['attachments'], static fn($att) => is_array($att)));

    $messages = is_array($ticket['messages'] ?? null) ? $ticket['messages'] : [];
    $ticket['messages'] = array_values(array_filter($messages, static fn($msg) => is_array($msg) && empty($msg['is_internal']) && empty($msg['isInternal'])));
    $ticket['messages'] = array_values(array_map(static function ($msg) {
        if (!is_array($msg)) return null;
        return [
            'id' => $msg['id'] ?? null,
            'sender' => $msg['sender'] ?? null,
            'body' => $msg['body'] ?? null,
            'created_at' => $msg['created_at'] ?? null,
            'read_at' => $msg['read_at'] ?? null,
        ];
    }, $ticket['messages']));
    $ticket['messages'] = array_values(array_filter($ticket['messages'], static fn($msg) => is_array($msg)));
    usort($ticket['messages'], static function ($a, $b) {
        $ta = strtotime((string)($a['created_at'] ?? '')) ?: 0;
        $tb = strtotime((string)($b['created_at'] ?? '')) ?: 0;
        return $ta <=> $tb;
    });

    // Guest links must never expose internal notes.
    $ticket['ticket_comments'] = [];
    unset($ticket['ticket_actions'], $ticket['handlers'], $ticket['ticket_handlers']);

    return $ticket;
}

function guest_access_build_public_url(string $path): string {
    $base = trim((string)(getenv('PORTAL_BASE_URL') ?: ''));
    if ($base !== '') {
        return rtrim($base, '/') . $path;
    }
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = trim((string)($_SERVER['HTTP_HOST'] ?? ''));
    if ($host === '') return $path;
    return $scheme . '://' . $host . $path;
}

try {
    load_runtime_env(__DIR__);

    api_apply_no_store_headers();

    $baseUrl = rtrim(guest_access_require_env('VITE_SUPABASE_URL'), '/');
    $serviceKey = supabase_get_service_role_key();

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
        if ($ticketId === '') {
            guest_access_json(400, false, 'ticket_id is required');
        }
        $role = strtolower(trim((string)($payload['role'] ?? 'viewer')));
        if (!in_array($role, ['viewer', 'external_investigator'], true)) {
            guest_access_json(400, false, 'role must be viewer or external_investigator');
        }

        $expiresInHours = isset($payload['expires_in_hours']) ? (int)$payload['expires_in_hours'] : 72;
        if ($expiresInHours <= 0) $expiresInHours = 72;
        if ($expiresInHours > 24 * 30) $expiresInHours = 24 * 30;
        $expiresAt = gmdate('c', time() + ($expiresInHours * 3600));

        $token = bin2hex(random_bytes(32));
        [$code, $decoded, $rawInsert] = guest_access_supabase_request(
            'POST',
            $baseUrl . '/rest/v1/guest_access',
            $serviceKey,
            [
                'ticket_id' => $ticketId,
                'token' => $token,
                'role' => $role,
                'expires_at' => $expiresAt,
                'created_by' => trim((string)($adminHandler['id'] ?? '')) ?: null,
            ],
            true
        );
        if ($code < 200 || $code >= 300) {
            $msg = is_array($decoded) ? json_encode($decoded, JSON_UNESCAPED_UNICODE) : (string)$rawInsert;
            throw new Exception('Failed to create guest access: ' . $msg);
        }

        $guestPath = '/guest/' . rawurlencode($token);
        guest_access_json(200, true, 'Guest access created', [
            'data' => [
                'guest_access' => guest_access_first_row($decoded),
                'guest_url_path' => $guestPath,
                'guest_url' => guest_access_build_public_url($guestPath),
            ],
        ]);
    }

    $token = guest_access_normalize_token($payload['token'] ?? $_GET['token'] ?? '');
    if ($token === '') {
        guest_access_json(400, false, 'token is required');
    }

    $guestRow = guest_access_load_record($baseUrl, $serviceKey, $token);
    if (!$guestRow) {
        guest_access_json(404, false, 'Guest access not found');
    }
    guest_access_assert_valid($guestRow);

    $ticketId = trim((string)($guestRow['ticket_id'] ?? ''));
    if ($ticketId === '') {
        throw new Exception('Guest token has no ticket_id');
    }
    $ticket = guest_access_fetch_ticket($baseUrl, $serviceKey, $ticketId);
    if (!$ticket) {
        guest_access_json(404, false, 'Ticket not found');
    }

    guest_access_json(200, true, 'Guest ticket loaded', [
        'data' => [
            'guest' => [
                'role' => $guestRow['role'] ?? 'viewer',
                'expires_at' => $guestRow['expires_at'] ?? null,
                'created_at' => $guestRow['created_at'] ?? null,
            ],
            'ticket' => guest_access_sanitize_ticket($ticket, $baseUrl, $serviceKey),
        ],
    ]);
} catch (Throwable $e) {
    $errorId = api_log_exception('guest-access.api', $e);
    guest_access_json(500, false, 'Internal server error', ['data' => ['error_id' => $errorId]]);
}
