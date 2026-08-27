<?php
declare(strict_types=1);

require_once __DIR__ . '/_sqlserver.php';

const ATTACHMENT_SECURITY_DOWNLOAD_SCOPES = ['handler', 'reporter', 'reply', 'guest'];
const ATTACHMENT_SECURITY_PUBLIC_SCOPES = ['reporter', 'reply', 'guest'];

function attachment_security_uuid(string $value): bool {
    return preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', trim($value)) === 1;
}

function attachment_security_b64url_encode(string $value): string {
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function attachment_security_b64url_decode(string $value): ?string {
    if ($value === '' || preg_match('/^[A-Za-z0-9_-]+$/', $value) !== 1) return null;
    $padding = strlen($value) % 4;
    if ($padding !== 0) $value .= str_repeat('=', 4 - $padding);
    $decoded = base64_decode(strtr($value, '-_', '+/'), true);
    return $decoded === false ? null : $decoded;
}

function attachment_security_root_key(): string {
    $key = (string)(getenv('ATTACHMENT_TOKEN_KEY') ?: '');
    if (strlen($key) < 32) throw new RuntimeException('ATTACHMENT_TOKEN_KEY must be configured with at least 32 characters');
    return $key;
}

function attachment_security_key(): string {
    return hash_hmac('sha256', 'nz-misstanden:attachment-token:encryption:v1', attachment_security_root_key(), true);
}

function attachment_security_signing_key(): string {
    return hash_hmac('sha256', 'nz-misstanden:attachment-token:signature:v1', attachment_security_root_key(), true);
}

/** Opaque encrypted token with an explicit HMAC signature. */
function attachment_security_seal(array $payload): string {
    $payload['v'] = 1;
    $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (!is_string($json)) throw new Exception('Unable to encode attachment authorization');
    $iv = random_bytes(12);
    $tag = '';
    $cipher = openssl_encrypt($json, 'aes-256-gcm', attachment_security_key(), OPENSSL_RAW_DATA, $iv, $tag, 'attachment-token-v1');
    if ($cipher === false || strlen($tag) !== 16) throw new Exception('Unable to protect attachment authorization');
    $body = attachment_security_b64url_encode($iv . $tag . $cipher);
    $message = 'v1.' . $body;
    $signature = hash_hmac('sha256', $message, attachment_security_signing_key(), true);
    return $message . '.' . attachment_security_b64url_encode($signature);
}

function attachment_security_open(string $token): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3 || $parts[0] !== 'v1') return null;
    $providedSignature = attachment_security_b64url_decode($parts[2]);
    if ($providedSignature === null || strlen($providedSignature) !== 32) return null;
    $message = $parts[0] . '.' . $parts[1];
    $expectedSignature = hash_hmac('sha256', $message, attachment_security_signing_key(), true);
    if (!hash_equals($expectedSignature, $providedSignature)) return null;
    $raw = attachment_security_b64url_decode($parts[1]);
    if ($raw === null || strlen($raw) < 29) return null;
    $iv = substr($raw, 0, 12);
    $tag = substr($raw, 12, 16);
    $cipher = substr($raw, 28);
    $json = openssl_decrypt($cipher, 'aes-256-gcm', attachment_security_key(), OPENSSL_RAW_DATA, $iv, $tag, 'attachment-token-v1');
    if ($json === false) return null;
    $payload = json_decode($json, true);
    if (!is_array($payload) || (int)($payload['v'] ?? 0) !== 1) return null;
    return $payload;
}

function attachment_security_ttl(): int {
    return min(900, max(60, (int)(getenv('ATTACHMENT_SIGNED_URL_TTL') ?: getenv('SIGNED_URL_TTL') ?: 600)));
}

function attachment_security_download_url(array $attachment, string $scope): ?string {
    $attachmentId = trim((string)($attachment['id'] ?? ''));
    $ticketId = trim((string)($attachment['ticket_id'] ?? ''));
    if (!attachment_security_uuid($attachmentId) || !attachment_security_uuid($ticketId)) return null;
    if (!in_array($scope, ATTACHMENT_SECURITY_DOWNLOAD_SCOPES, true)) return null;
    if (in_array($scope, ATTACHMENT_SECURITY_PUBLIC_SCOPES, true)
        && (!empty($attachment['is_internal']) || !empty($attachment['note_id']))) return null;
    $token = attachment_security_seal([
        'k' => 'download',
        'a' => strtolower($attachmentId),
        't' => strtolower($ticketId),
        's' => $scope,
        'e' => time() + attachment_security_ttl(),
    ]);
    return '/api/files.api.php?action=download&token=' . rawurlencode($token);
}

function attachment_security_validate_download(string $token): ?array {
    $payload = attachment_security_open(trim($token));
    if (!$payload || ($payload['k'] ?? '') !== 'download') return null;
    if ((int)($payload['e'] ?? 0) < time()) return null;
    $attachmentId = trim((string)($payload['a'] ?? ''));
    $ticketId = trim((string)($payload['t'] ?? ''));
    $scope = trim((string)($payload['s'] ?? ''));
    if (!attachment_security_uuid($attachmentId) || !attachment_security_uuid($ticketId)
        || !in_array($scope, ATTACHMENT_SECURITY_DOWNLOAD_SCOPES, true)) return null;
    $rows = sqlserver_query(
        'SELECT TOP 1 id, ticket_id, file_name, file_url, mime_type, size_bytes, is_internal, note_id, created_at FROM dbo.attachments WHERE id = @id AND ticket_id = @ticket_id',
        ['id' => $attachmentId, 'ticket_id' => $ticketId]
    );
    $attachment = $rows[0] ?? null;
    if (!is_array($attachment)) return null;
    if (in_array($scope, ATTACHMENT_SECURITY_PUBLIC_SCOPES, true)
        && (!empty($attachment['is_internal']) || !empty($attachment['note_id']))) return null;
    $attachment['_access_scope'] = $scope;
    return $attachment;
}

function attachment_security_storage_root(): string {
    $configured = trim((string)(getenv('ATTACHMENT_STORAGE_ROOT') ?: ''));
    $path = $configured !== '' ? $configured : (__DIR__ . '/../../private/uploads');
    if (!is_dir($path) && !@mkdir($path, 0750, true) && !is_dir($path)) throw new Exception('Unable to initialize attachment storage');
    $resolved = realpath($path);
    if ($resolved === false) throw new Exception('Unable to resolve attachment storage');
    return rtrim($resolved, DIRECTORY_SEPARATOR);
}

function attachment_security_normalize_storage_key(string $value): ?string {
    $value = trim(rawurldecode($value));
    if ($value === '' || str_contains($value, "\0") || preg_match('/^[A-Za-z]:[\\\\\/]/', $value)
        || str_starts_with($value, '\\\\') || str_starts_with($value, '//') || str_starts_with($value, '/')) return null;
    $value = str_replace('\\', '/', $value);
    $parts = explode('/', $value);
    if (count($parts) < 3) return null;
    foreach ($parts as $part) {
        if ($part === '' || $part === '.' || $part === '..' || preg_match('/^[A-Za-z0-9._-]+$/', $part) !== 1) return null;
    }
    if ($parts[0] !== 'attachments' || !attachment_security_uuid($parts[1])) return null;
    $nameParts = array_map('strtolower', explode('.', (string)end($parts)));
    $dangerous = ['php','php3','php4','php5','php7','php8','phtml','pht','phar','cgi','pl','py','rb','asp','aspx','ashx','config','htaccess','exe','dll','com','bat','cmd','ps1','vbs','js','jse','wsf','wsh','msi','scr','svg','html','htm'];
    foreach (array_slice($nameParts, 1) as $extension) if (in_array($extension, $dangerous, true)) return null;
    return implode('/', $parts);
}

function attachment_security_storage_path(string $storageKey): ?string {
    $key = attachment_security_normalize_storage_key($storageKey);
    if ($key === null) return null;
    $root = attachment_security_storage_root();
    $parts = explode('/', $key);
    if (strtolower(basename($root)) === 'attachments') array_shift($parts);
    return $root . DIRECTORY_SEPARATOR . implode(DIRECTORY_SEPARATOR, $parts);
}

function attachment_security_existing_path(string $storageKey): ?string {
    $candidate = attachment_security_storage_path($storageKey);
    if ($candidate === null) return null;
    $root = attachment_security_storage_root();
    $resolved = realpath($candidate);
    if ($resolved === false || !is_file($resolved)) return null;
    $prefix = strtolower($root . DIRECTORY_SEPARATOR);
    if (!str_starts_with(strtolower($resolved), $prefix)) return null;
    return $resolved;
}

function attachment_security_handler_can_access_ticket(array $handler, string $ticketId): bool {
    $handlerId = trim((string)($handler['id'] ?? ''));
    if (!attachment_security_uuid($handlerId) || !attachment_security_uuid($ticketId)) return false;
    $rows = sqlserver_query(
        'SELECT TOP 1 CASE WHEN t.handler_id = @handler_id
            OR EXISTS (SELECT 1 FROM dbo.ticket_handlers th WHERE th.ticket_id = t.id AND th.handler_id = @handler_id)
            OR EXISTS (SELECT 1 FROM dbo.workflows w INNER JOIN dbo.handler_workflows hw ON hw.workflow_id = w.id WHERE hw.handler_id = @handler_id AND w.code = t.workflow_type)
            THEN 1 ELSE 0 END AS has_access
         FROM dbo.tickets t WHERE t.id = @ticket_id',
        ['handler_id' => $handlerId, 'ticket_id' => $ticketId]
    );
    if (!$rows) return false;
    return !empty($rows[0]['has_access']) || (function_exists('api_authz_is_admin') && api_authz_is_admin($handler));
}

function attachment_security_upload_token(array $upload): string {
    return attachment_security_seal(array_merge($upload, ['k' => 'upload', 'e' => time() + 900]));
}

function attachment_security_validate_upload_token(string $token, string $ticketId, array $allowedScopes): ?array {
    $payload = attachment_security_open(trim($token));
    if (!$payload || ($payload['k'] ?? '') !== 'upload' || (int)($payload['e'] ?? 0) < time()) return null;
    if (!hash_equals(strtolower($ticketId), strtolower(trim((string)($payload['t'] ?? ''))))) return null;
    if (!in_array((string)($payload['s'] ?? ''), $allowedScopes, true)) return null;
    $key = attachment_security_normalize_storage_key((string)($payload['p'] ?? ''));
    $parts = $key === null ? [] : explode('/', $key);
    if ($key === null || !isset($parts[1]) || !hash_equals(strtolower($ticketId), strtolower($parts[1]))
        || attachment_security_existing_path($key) === null) return null;
    $payload['p'] = $key;
    return $payload;
}

function attachment_security_public_row(array $attachment, string $scope): array {
    return [
        'id' => $attachment['id'] ?? null,
        'ticket_id' => $attachment['ticket_id'] ?? null,
        'file_name' => $attachment['file_name'] ?? null,
        'mime_type' => $attachment['mime_type'] ?? null,
        'size_bytes' => $attachment['size_bytes'] ?? null,
        'is_internal' => isset($attachment['is_internal']) ? (bool)$attachment['is_internal'] : false,
        'note_id' => $attachment['note_id'] ?? null,
        'created_at' => $attachment['created_at'] ?? null,
        'file_url' => attachment_security_download_url($attachment, $scope),
    ];
}
