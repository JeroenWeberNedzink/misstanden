<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_ticket_crypto.php';
require_once __DIR__ . '/_auth0.php';
require_once __DIR__ . '/_admin_auth.php';
require_once __DIR__ . '/_errors.php';
require_once __DIR__ . '/_security_headers.php';
require_once __DIR__ . '/_sqlserver.php';
require_once __DIR__ . '/_attachment_security.php';
require_once __DIR__ . '/_portal_tokens.php';

api_apply_security_headers([
    'allow_methods' => 'POST, OPTIONS',
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

const HANDLER_REPLY_DELAY_MIN_SECONDS = 120;
const HANDLER_REPLY_DELAY_MAX_SECONDS = 600;
const REPORTER_REPLY_TOKEN_BYTES = 32;

function api_json(int $status, bool $success, string $message, $data = null): void {
    http_response_code($status);
    echo json_encode(['success' => $success, 'message' => $message, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

function ticket_strlen(string $value): int { return function_exists('mb_strlen') ? (int)mb_strlen($value, 'UTF-8') : (int)strlen($value); }
function ticket_substr(string $value, int $start, ?int $length = null): string { return function_exists('mb_substr') ? ($length === null ? (string)mb_substr($value, $start, null, 'UTF-8') : (string)mb_substr($value, $start, $length, 'UTF-8')) : ($length === null ? (string)substr($value, $start) : (string)substr($value, $start, $length)); }
function ticket_is_uuid(string $value): bool { return preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $value) === 1; }
function ticket_valid_email(string $email): bool { return filter_var(trim($email), FILTER_VALIDATE_EMAIL) !== false; }

function ticket_parse_json($value, $fallback = []) {
    if (is_array($value)) return $value;
    if (!is_string($value) || trim($value) === '') return $fallback;
    $decoded = json_decode($value, true);
    return json_last_error() === JSON_ERROR_NONE ? $decoded : $fallback;
}

function normalize_access_code($raw): string {
    $digits = preg_replace('/\D+/', '', (string)$raw);
    if ($digits === null || $digits === '') return '';
    $digits = str_pad(substr($digits, -6), 6, '0', STR_PAD_LEFT);
    return preg_match('/^\d{6}$/', $digits) ? $digits : '';
}

function normalize_ticket_input($raw): array {
    $value = strtoupper(trim((string)$raw));
    if ($value === '') return ['ok' => false, 'is_uuid' => false, 'value' => ''];
    if (preg_match('/^[0-9A-F]{8}-[0-9A-F]{4}-[1-5][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i', $value) === 1) {
        return ['ok' => true, 'is_uuid' => true, 'value' => strtolower($value)];
    }
    if (preg_match('/^[A-Z0-9-]{3,32}$/', $value) !== 1) return ['ok' => false, 'is_uuid' => false, 'value' => ''];
    return ['ok' => true, 'is_uuid' => false, 'value' => $value];
}

function ticket_client_ip(): string {
    foreach ([$_SERVER['HTTP_CF_CONNECTING_IP'] ?? null, $_SERVER['HTTP_X_FORWARDED_FOR'] ?? null, $_SERVER['REMOTE_ADDR'] ?? null] as $raw) {
        $value = trim((string)$raw);
        if ($value === '') continue;
        if (str_contains($value, ',')) $value = trim((string)(explode(',', $value)[0] ?? ''));
        if (filter_var($value, FILTER_VALIDATE_IP)) return $value;
    }
    return 'unknown';
}

function ticket_hash_scope_part(string $value): string { return hash('sha256', trim((string)(getenv('RATE_LIMIT_SALT') ?: '')) . '|' . $value); }
function ticket_client_fingerprint(): string {
    $ua = strtolower(trim((string)($_SERVER['HTTP_USER_AGENT'] ?? ''))); $ua = $ua !== '' ? substr($ua, 0, 160) : 'unknown';
    return ticket_hash_scope_part('client:' . ticket_client_ip() . '|ua:' . $ua);
}
function ticket_rate_limit_file(string $scope): string { $dir = __DIR__ . '/../../run/rate-limits'; if (!is_dir($dir)) @mkdir($dir, 0755, true); return $dir . '/' . hash('sha256', $scope) . '.json'; }
function ticket_rate_limit_state(string $scope): array {
    $file = ticket_rate_limit_file($scope); $fp = @fopen($file, 'c+');
    if (!$fp) return ['fp' => null, 'state' => ['window_start' => time(), 'count' => 0, 'blocked_until' => 0]];
    if (!@flock($fp, LOCK_EX)) { fclose($fp); return ['fp' => null, 'state' => ['window_start' => time(), 'count' => 0, 'blocked_until' => 0]]; }
    $decoded = ($raw = stream_get_contents($fp)) !== '' ? json_decode($raw, true) : null; $state = is_array($decoded) ? $decoded : [];
    return ['fp' => $fp, 'state' => ['window_start' => (int)($state['window_start'] ?? time()), 'count' => (int)($state['count'] ?? 0), 'blocked_until' => (int)($state['blocked_until'] ?? 0)]];
}
function ticket_rate_limit_commit($fp, array $state): void { if (!$fp) return; ftruncate($fp, 0); rewind($fp); fwrite($fp, json_encode($state, JSON_UNESCAPED_UNICODE)); fflush($fp); flock($fp, LOCK_UN); fclose($fp); }
function ticket_rate_limit_allow(string $scope, int $maxAttempts, int $windowSeconds): array {
    $now = time(); $ctx = ticket_rate_limit_state($scope); $fp = $ctx['fp']; $state = $ctx['state'];
    if ($state['blocked_until'] > $now) { ticket_rate_limit_commit($fp, $state); return ['allowed' => false, 'retry_after' => max(1, $state['blocked_until'] - $now)]; }
    if (($now - $state['window_start']) >= $windowSeconds) $state = ['window_start' => $now, 'count' => 0, 'blocked_until' => 0];
    $state['count']++;
    if ($state['count'] > $maxAttempts) { $state['blocked_until'] = $now + $windowSeconds; ticket_rate_limit_commit($fp, $state); return ['allowed' => false, 'retry_after' => $windowSeconds]; }
    ticket_rate_limit_commit($fp, $state); return ['allowed' => true, 'retry_after' => 0];
}
function ticket_rate_limit_reset(string $scope): void { $file = ticket_rate_limit_file($scope); if (is_file($file)) @unlink($file); }
function ticket_limit_scope_suffix(string $ticketInput): string { $meta = normalize_ticket_input($ticketInput); return !empty($meta['ok']) ? (string)$meta['value'] : (strtoupper(trim((string)$ticketInput)) ?: 'unknown'); }
function ticket_enforce_request_rate_limit(string $action, string $ticketInput): void {
    $windowSeconds = 300; $clientMax = 180; $ticketMax = 25;
    if ($action === 'create') { $clientMax = 60; $ticketMax = 40; } elseif ($action === 'access') { $clientMax = 240; $ticketMax = 40; } elseif ($action === 'attachment') { $clientMax = 120; $ticketMax = 20; }
    foreach ([
        ['scope' => 'tickets:' . $action . ':client:' . ticket_client_fingerprint(), 'max' => $clientMax],
        ['scope' => 'tickets:' . $action . ':ticket:' . ticket_hash_scope_part('ticket:' . ticket_limit_scope_suffix($ticketInput)), 'max' => $ticketMax],
    ] as $item) {
        $result = ticket_rate_limit_allow($item['scope'], $item['max'], $windowSeconds);
        if (!$result['allowed']) api_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $result['retry_after']]);
    }
}
function ticket_enforce_handler_mutation_rate_limit(string $action, array $handler, ?string $ticketId = null): void {
    $actorRaw = trim((string)($handler['id'] ?? '')) ?: (strtolower(trim((string)($handler['email'] ?? ''))) ?: 'unknown');
    foreach ([
        ['scope' => 'tickets:admin_mutation:' . $action . ':actor:' . ticket_hash_scope_part('handler:' . $actorRaw), 'max' => 180],
        ['scope' => 'tickets:admin_mutation:' . $action . ':client:' . ticket_client_fingerprint(), 'max' => 500],
    ] as $item) {
        $result = ticket_rate_limit_allow($item['scope'], $item['max'], 300);
        if (!$result['allowed']) api_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $result['retry_after']]);
    }
    if ($ticketId) {
        $scope = 'tickets:admin_mutation:' . $action . ':actor_ticket:' . ticket_hash_scope_part('handler:' . $actorRaw) . ':' . ticket_hash_scope_part('ticket:' . $ticketId);
        $result = ticket_rate_limit_allow($scope, 80, 300);
        if (!$result['allowed']) api_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $result['retry_after']]);
    }
}
function ticket_register_failed_auth_attempt(string $ticketInput): void {
    $scope = 'tickets:auth_fail:' . ticket_client_fingerprint() . ':' . ticket_hash_scope_part('ticket:' . ticket_limit_scope_suffix($ticketInput));
    $result = ticket_rate_limit_allow($scope, 6, 900);
    if (!$result['allowed']) api_json(429, false, 'Too many failed attempts. Try again later.', ['retry_after' => $result['retry_after']]);
}
function ticket_reset_failed_auth_attempts(string $ticketInput): void { ticket_rate_limit_reset('tickets:auth_fail:' . ticket_client_fingerprint() . ':' . ticket_hash_scope_part('ticket:' . ticket_limit_scope_suffix($ticketInput))); }

function ticket_setting_unwrap_value($raw) { return is_array($raw) && array_key_exists('value', $raw) ? $raw['value'] : $raw; }
function ticket_system_settings_cache_file(): string {
    $dir = sqlserver_project_root() . DIRECTORY_SEPARATOR . 'run' . DIRECTORY_SEPARATOR . 'cache';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    return $dir . DIRECTORY_SEPARATOR . 'ticket-system-settings.json';
}
function ticket_invalidate_system_settings_cache(): void {
    $file = ticket_system_settings_cache_file();
    if (is_file($file)) @unlink($file);
}
function ticket_load_system_settings(): array {
    static $cache = null; if (is_array($cache)) return $cache;
    $cacheTtl = max(5, (int)(getenv('TICKET_SETTINGS_CACHE_TTL_SECONDS') ?: 60));
    $cacheFile = ticket_system_settings_cache_file();
    if (is_file($cacheFile) && (time() - (int)@filemtime($cacheFile)) <= $cacheTtl) {
        $raw = @file_get_contents($cacheFile);
        $decoded = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
        if (is_array($decoded)) {
            $cache = $decoded;
            return $cache;
        }
    }

    $cache = [];
    foreach (sqlserver_query('SELECT setting_key, setting_value FROM dbo.system_settings ORDER BY setting_key ASC') as $row) {
        $key = trim((string)($row['setting_key'] ?? '')); if ($key === '') continue;
        $cache[$key] = ticket_setting_unwrap_value(ticket_parse_json($row['setting_value'] ?? null, $row['setting_value'] ?? null));
    }
    @file_put_contents($cacheFile, json_encode($cache, JSON_UNESCAPED_UNICODE), LOCK_EX);
    return $cache;
}
function ticket_setting_value(array $settings, array $aliases, $default = null) { foreach ($aliases as $key) if (array_key_exists($key, $settings)) return $settings[$key]; return $default; }
function ticket_setting_bool(array $settings, array $aliases, bool $default = false): bool { $raw = ticket_setting_value($settings, $aliases, $default); if (is_bool($raw)) return $raw; $v = strtolower(trim((string)$raw)); if (in_array($v, ['true','1','yes','ja','on'], true)) return true; if (in_array($v, ['false','0','no','nee','off'], true)) return false; return $default; }
function ticket_setting_int(array $settings, array $aliases, int $default = 0): int { $raw = ticket_setting_value($settings, $aliases, $default); return is_numeric($raw) ? (int)$raw : $default; }
function ticket_setting_string(array $settings, array $aliases, string $default = ''): string { $raw = trim((string)ticket_setting_value($settings, $aliases, $default)); return $raw !== '' ? $raw : $default; }
function ticket_normalize_workflow_scope(string $workflowType): string { $value = preg_replace('/[^a-z0-9_]+/', '_', strtolower(trim($workflowType))) ?? ''; return trim($value, '_'); }
function ticket_workflow_scoped_setting_key(string $workflowType, string $workflowSettingKey): ?string { $scope = ticket_normalize_workflow_scope($workflowType); if ($scope === '' || !str_starts_with($workflowSettingKey, 'workflow.')) return null; $suffix = substr($workflowSettingKey, 9); return $suffix ? ('workflow.' . $scope . '.' . $suffix) : null; }
function ticket_setting_bool_for_workflow(array $settings, string $workflowType, array $aliases, bool $default = false): bool { $keys = []; foreach ($aliases as $alias) { $scoped = ticket_workflow_scoped_setting_key($workflowType, trim((string)$alias)); if ($scoped !== null) $keys[] = $scoped; $keys[] = $alias; } return ticket_setting_bool($settings, $keys, $default); }
function ticket_action_logging_enabled(array $settings): bool { return ticket_setting_bool($settings, ['compliance.audit_log_enabled', 'audit.enable_logging'], true); }

function ticket_runtime_schema_marker_file(): string {
    $dir = __DIR__ . '/../../run/cache';
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    return $dir . '/tickets-runtime-schema-v5.ok';
}

function ticket_ensure_runtime_schema(): void {
    static $done = false;
    if ($done) return;
    $marker = ticket_runtime_schema_marker_file();
    if (is_file($marker) && ((time() - (int)@filemtime($marker)) < 21600)) {
        $done = true;
        return;
    }

    sqlserver_execute(
        "IF COL_LENGTH(N'dbo.tickets', N'description_encrypted') IS NULL
         BEGIN
             ALTER TABLE dbo.tickets ADD description_encrypted NVARCHAR(MAX) NULL;
         END;

         IF COL_LENGTH(N'dbo.tickets', N'location_encrypted') IS NULL
         BEGIN
             ALTER TABLE dbo.tickets ADD location_encrypted NVARCHAR(MAX) NULL;
         END;

         IF COL_LENGTH(N'dbo.tickets', N'reporter_name_encrypted') IS NULL
         BEGIN
             ALTER TABLE dbo.tickets ADD reporter_name_encrypted NVARCHAR(MAX) NULL;
         END;

         IF COL_LENGTH(N'dbo.tickets', N'reporter_phone_encrypted') IS NULL
         BEGIN
             ALTER TABLE dbo.tickets ADD reporter_phone_encrypted NVARCHAR(MAX) NULL;
         END;

         IF COL_LENGTH(N'dbo.tickets', N'access_code_hash') IS NULL
         BEGIN
             ALTER TABLE dbo.tickets ADD access_code_hash NVARCHAR(64) NULL;
         END;

         IF COL_LENGTH(N'dbo.ticket_reply_tokens', N'token_hash') IS NULL
         BEGIN
             ALTER TABLE dbo.ticket_reply_tokens ADD token_hash NVARCHAR(64) NULL;
         END;

         IF OBJECT_ID(N'dbo.ticket_handlers', N'U') IS NULL
         BEGIN
             CREATE TABLE dbo.ticket_handlers (
                 id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ticket_handlers PRIMARY KEY DEFAULT NEWID(),
                 ticket_id UNIQUEIDENTIFIER NOT NULL,
                 handler_id UNIQUEIDENTIFIER NOT NULL,
                 role NVARCHAR(50) NOT NULL CONSTRAINT DF_ticket_handlers_role DEFAULT N'primary',
                 assigned_at DATETIME2(3) NULL,
                 created_at DATETIME2(3) NOT NULL CONSTRAINT DF_ticket_handlers_created_at DEFAULT SYSUTCDATETIME()
             );
         END;

         IF COL_LENGTH(N'dbo.ticket_handlers', N'role') IS NULL
         BEGIN
             ALTER TABLE dbo.ticket_handlers ADD role NVARCHAR(50) NOT NULL CONSTRAINT DF_ticket_handlers_role DEFAULT N'primary' WITH VALUES;
         END;

         IF COL_LENGTH(N'dbo.ticket_handlers', N'assigned_at') IS NULL
         BEGIN
             ALTER TABLE dbo.ticket_handlers ADD assigned_at DATETIME2(3) NULL;
         END;

         IF COL_LENGTH(N'dbo.ticket_handlers', N'created_at') IS NULL
         BEGIN
             ALTER TABLE dbo.ticket_handlers ADD created_at DATETIME2(3) NOT NULL CONSTRAINT DF_ticket_handlers_created_at DEFAULT SYSUTCDATETIME() WITH VALUES;
         END;

         IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ticket_handlers_role' AND object_id = OBJECT_ID(N'dbo.ticket_handlers'))
         BEGIN
             CREATE INDEX IX_ticket_handlers_role ON dbo.ticket_handlers(role);
         END;

         IF OBJECT_ID(N'dbo.ticket_comments', N'U') IS NULL
         BEGIN
             CREATE TABLE dbo.ticket_comments (
                 id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ticket_comments PRIMARY KEY DEFAULT NEWID(),
                 ticket_id UNIQUEIDENTIFIER NOT NULL,
                 comment NVARCHAR(MAX) NOT NULL,
                 comment_encrypted NVARCHAR(MAX) NULL,
                 author_name NVARCHAR(255) NULL,
                 created_at DATETIME2(3) NOT NULL CONSTRAINT DF_ticket_comments_created_at DEFAULT SYSUTCDATETIME(),
                 updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_ticket_comments_updated_at DEFAULT SYSUTCDATETIME()
             );
         END;

         IF COL_LENGTH(N'dbo.ticket_comments', N'comment') IS NULL
         BEGIN
             ALTER TABLE dbo.ticket_comments ADD comment NVARCHAR(MAX) NOT NULL CONSTRAINT DF_ticket_comments_comment DEFAULT N'' WITH VALUES;
         END;

         IF COL_LENGTH(N'dbo.ticket_comments', N'comment_encrypted') IS NULL
         BEGIN
             ALTER TABLE dbo.ticket_comments ADD comment_encrypted NVARCHAR(MAX) NULL;
         END;

         IF COL_LENGTH(N'dbo.ticket_comments', N'author_name') IS NULL
         BEGIN
             ALTER TABLE dbo.ticket_comments ADD author_name NVARCHAR(255) NULL;
         END;

         IF COL_LENGTH(N'dbo.ticket_comments', N'created_at') IS NULL
         BEGIN
             ALTER TABLE dbo.ticket_comments ADD created_at DATETIME2(3) NOT NULL CONSTRAINT DF_ticket_comments_created_at DEFAULT SYSUTCDATETIME() WITH VALUES;
         END;

         IF COL_LENGTH(N'dbo.ticket_comments', N'updated_at') IS NULL
         BEGIN
             ALTER TABLE dbo.ticket_comments ADD updated_at DATETIME2(3) NOT NULL CONSTRAINT DF_ticket_comments_updated_at DEFAULT SYSUTCDATETIME() WITH VALUES;
         END;

         IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ticket_comments_ticket_created_at' AND object_id = OBJECT_ID(N'dbo.ticket_comments'))
         BEGIN
             CREATE INDEX IX_ticket_comments_ticket_created_at ON dbo.ticket_comments(ticket_id, created_at DESC);
         END;

         IF OBJECT_ID(N'dbo.messages', N'U') IS NULL
         BEGIN
             CREATE TABLE dbo.messages (
                 id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_messages PRIMARY KEY DEFAULT NEWID(),
                 ticket_id UNIQUEIDENTIFIER NOT NULL,
                 sender NVARCHAR(50) NOT NULL,
                 body NVARCHAR(MAX) NOT NULL,
                 body_encrypted NVARCHAR(MAX) NULL,
                 is_internal BIT NOT NULL CONSTRAINT DF_messages_is_internal DEFAULT (0),
                 visible_at DATETIME2(3) NOT NULL CONSTRAINT DF_messages_visible_at DEFAULT SYSUTCDATETIME(),
                 created_at DATETIME2(3) NOT NULL CONSTRAINT DF_messages_created_at DEFAULT SYSUTCDATETIME(),
                 read_at DATETIME2(3) NULL,
                 handler_id UNIQUEIDENTIFIER NULL,
                 handler_name NVARCHAR(255) NULL
             );
         END;

         IF COL_LENGTH(N'dbo.messages', N'body_encrypted') IS NULL
         BEGIN
             ALTER TABLE dbo.messages ADD body_encrypted NVARCHAR(MAX) NULL;
         END;

         IF COL_LENGTH(N'dbo.messages', N'visible_at') IS NULL
         BEGIN
             ALTER TABLE dbo.messages ADD visible_at DATETIME2(3) NOT NULL CONSTRAINT DF_messages_visible_at DEFAULT SYSUTCDATETIME() WITH VALUES;
         END;

         IF COL_LENGTH(N'dbo.messages', N'read_at') IS NULL
         BEGIN
             ALTER TABLE dbo.messages ADD read_at DATETIME2(3) NULL;
         END;

         IF COL_LENGTH(N'dbo.messages', N'handler_id') IS NULL
         BEGIN
             ALTER TABLE dbo.messages ADD handler_id UNIQUEIDENTIFIER NULL;
         END;

         IF COL_LENGTH(N'dbo.messages', N'handler_name') IS NULL
         BEGIN
             ALTER TABLE dbo.messages ADD handler_name NVARCHAR(255) NULL;
         END;

         IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_messages_ticket_visible_at' AND object_id = OBJECT_ID(N'dbo.messages'))
         BEGIN
             CREATE INDEX IX_messages_ticket_visible_at ON dbo.messages(ticket_id, visible_at);
         END;

         IF OBJECT_ID(N'dbo.ticket_actions', N'U') IS NULL
         BEGIN
             CREATE TABLE dbo.ticket_actions (
                 id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_ticket_actions PRIMARY KEY DEFAULT NEWID(),
                 ticket_id UNIQUEIDENTIFIER NOT NULL,
                 action_type NVARCHAR(100) NOT NULL,
                 action NVARCHAR(255) NOT NULL,
                 description NVARCHAR(MAX) NULL,
                 description_encrypted NVARCHAR(MAX) NULL,
                 handler_id UNIQUEIDENTIFIER NULL,
                 handler_name NVARCHAR(255) NULL,
                 handler_email NVARCHAR(255) NULL,
                 performed_by NVARCHAR(255) NULL,
                 created_at DATETIME2(3) NOT NULL CONSTRAINT DF_ticket_actions_created_at DEFAULT SYSUTCDATETIME()
             );
         END;

         IF COL_LENGTH(N'dbo.ticket_actions', N'description_encrypted') IS NULL
         BEGIN
             ALTER TABLE dbo.ticket_actions ADD description_encrypted NVARCHAR(MAX) NULL;
         END;

         IF COL_LENGTH(N'dbo.ticket_actions', N'handler_id') IS NULL
         BEGIN
             ALTER TABLE dbo.ticket_actions ADD handler_id UNIQUEIDENTIFIER NULL;
         END;

         IF COL_LENGTH(N'dbo.ticket_actions', N'handler_name') IS NULL
         BEGIN
             ALTER TABLE dbo.ticket_actions ADD handler_name NVARCHAR(255) NULL;
         END;

         IF COL_LENGTH(N'dbo.ticket_actions', N'handler_email') IS NULL
         BEGIN
             ALTER TABLE dbo.ticket_actions ADD handler_email NVARCHAR(255) NULL;
         END;

         IF COL_LENGTH(N'dbo.ticket_actions', N'performed_by') IS NULL
         BEGIN
             ALTER TABLE dbo.ticket_actions ADD performed_by NVARCHAR(255) NULL;
         END;

         IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ticket_actions_ticket_created_at' AND object_id = OBJECT_ID(N'dbo.ticket_actions'))
         BEGIN
             CREATE INDEX IX_ticket_actions_ticket_created_at ON dbo.ticket_actions(ticket_id, created_at DESC);
         END;"
    );

    @file_put_contents($marker, (string)time());
    $done = true;
}

function ticket_attachment_extension(string $fileName): string { $parts = explode('.', strtolower(trim($fileName))); return count($parts) < 2 ? '' : trim((string)end($parts)); }
function ticket_attachment_policy(array $settings): array {
    $maxMb = min(max(ticket_setting_int($settings, ['portal.max_attachment_size_mb'], 10), 1), 250);
    $allowed = ticket_setting_value($settings, ['portal.allowed_file_types'], ['pdf','jpg','jpeg','png','doc','docx']);
    $types = [];
    foreach (is_array($allowed) ? $allowed : explode(',', (string)$allowed) as $entry) { $ext = ltrim(strtolower(trim((string)$entry)), '.'); if ($ext !== '' && !in_array($ext, $types, true)) $types[] = $ext; }
    return ['enabled' => ticket_setting_bool($settings, ['portal.enable_attachments'], true), 'max_mb' => $maxMb, 'max_bytes' => $maxMb * 1024 * 1024, 'allowed_extensions' => $types ?: ['pdf','jpg','jpeg','png','doc','docx']];
}
function ticket_validate_attachment_policy(array $settings, string $fileName, ?int $sizeBytes): void {
    $policy = ticket_attachment_policy($settings);
    if (!$policy['enabled']) api_json(403, false, 'Attachments are currently disabled by system policy');
    if (($ext = ticket_attachment_extension($fileName)) === '' || !in_array($ext, $policy['allowed_extensions'], true)) api_json(400, false, 'Attachment file type is not allowed', ['allowed_file_types' => $policy['allowed_extensions']]);
    if ($sizeBytes !== null && ($sizeBytes < 0 || $sizeBytes > (int)$policy['max_bytes'])) api_json(400, false, 'Attachment file is too large', ['max_attachment_size_mb' => (int)$policy['max_mb']]);
}

function ticket_normalize_severity(string $value, string $fallback = 'low'): string { $value = strtolower(trim($value)); return in_array($value, ['low','medium','high','critical'], true) ? $value : $fallback; }
function ticket_sanitize_prefix(string $value, string $fallback = 'NZ'): string { $upper = preg_replace('/-+/', '-', preg_replace('/[^A-Z0-9-]+/', '', strtoupper(trim($value))) ?? '') ?? ''; $upper = trim($upper, '-'); return $upper !== '' ? $upper : $fallback; }
function ticket_uuid4(): string { $bytes = random_bytes(16); $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40); $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80); return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4)); }
function ticket_generate_ticket_number(string $prefix): string { return $prefix . '-' . gmdate('Y') . '-' . random_int(100000, 999999); }
function ticket_generate_access_code(): string { return str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT); }
function ticket_generate_secure_token(int $bytes = REPORTER_REPLY_TOKEN_BYTES): string { return bin2hex(random_bytes($bytes)); }
function ticket_sql_utc_datetime(?int $timestamp = null): string { return gmdate('Y-m-d H:i:s', $timestamp ?? time()); }
function ticket_sql_datetime_param($value): ?string {
    if ($value === null || trim((string)$value) === '') return null;
    $timestamp = is_numeric($value) ? (int)$value : strtotime((string)$value);
    return $timestamp === false ? null : ticket_sql_utc_datetime($timestamp);
}
function ticket_reply_token_expiry_timestamp(): int { $days = max(1, (int)(getenv('REPORTER_REPLY_TOKEN_TTL_DAYS') ?: 365)); return time() + ($days * 86400); }
function ticket_reply_token_expiry_iso(): string { return gmdate('Y-m-d\TH:i:s\Z', ticket_reply_token_expiry_timestamp()); }
function ticket_reply_token_expiry_sql(): string { return ticket_sql_utc_datetime(ticket_reply_token_expiry_timestamp()); }
function ticket_handler_message_visible_at(bool $isInternal, string $sender): string { return ticket_sql_utc_datetime(($isInternal || $sender !== 'handler') ? time() : time() + random_int(HANDLER_REPLY_DELAY_MIN_SECONDS, HANDLER_REPLY_DELAY_MAX_SECONDS)); }

function ticket_normalize_handler_message_body(string $body): array {
    $prefix = 'NZRT1:';
    $trimmed = trim($body);
    if (strpos($trimmed, $prefix) !== 0) return ['body' => $trimmed, 'plain' => $trimmed];

    $blocks = json_decode(substr($trimmed, strlen($prefix)), true);
    if (!is_array($blocks) || !array_is_list($blocks) || count($blocks) > 100) api_json(400, false, 'Invalid rich-text message');

    $plainBlocks = [];
    foreach ($blocks as $block) {
        if (!is_array($block) || !array_is_list($block) || count($block) !== 2 || !isset($block[0]) || !is_string($block[0]) || !is_array($block[1])) {
            api_json(400, false, 'Invalid rich-text message');
        }
        $type = $block[0];
        if (!in_array($type, ['p', 'ul', 'ol'], true)) api_json(400, false, 'Invalid rich-text message');
        $items = $type === 'p' ? [$block[1]] : $block[1];
        if (!array_is_list($items) || count($items) > 100) api_json(400, false, 'Invalid rich-text message');

        $plainItems = [];
        foreach ($items as $runs) {
            if (!is_array($runs) || !array_is_list($runs) || count($runs) > 500) api_json(400, false, 'Invalid rich-text message');
            $plainItem = '';
            foreach ($runs as $run) {
                if (!is_array($run) || !array_is_list($run) || count($run) !== 2 || !array_key_exists(0, $run) || !is_string($run[0]) || !array_key_exists(1, $run) || !is_int($run[1]) || $run[1] < 0 || $run[1] > 7) {
                    api_json(400, false, 'Invalid rich-text message');
                }
                $plainItem .= $run[0];
            }
            $plainItems[] = $plainItem;
        }
        $plainBlocks[] = implode("\n", $plainItems);
    }

    $plain = trim(implode("\n", $plainBlocks));
    $canonical = $prefix . json_encode($blocks, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($plain === '') api_json(400, false, 'body is required');
    if (ticket_strlen($plain) > 4000) api_json(400, false, 'body exceeds 4000 characters');
    if (ticket_strlen($canonical) > 65536) api_json(400, false, 'Rich-text message is too complex');
    return ['body' => $canonical, 'plain' => $plain];
}

function ticket_download_url(?string $raw): ?string {
    $value = trim((string)$raw);
    if ($value === '' || preg_match('#^https?://#i', $value) === 1) return $value !== '' ? $value : null;
    return null;
}

function ticket_load_workflow_status_rows(string $workflowType): array {
    if (trim($workflowType) === '') return [];
    $rows = sqlserver_query(
        'SELECT ws.* FROM dbo.workflow_statuses ws INNER JOIN dbo.workflows w ON w.id = ws.workflow_id WHERE w.code = @code ORDER BY ws.sort_order ASC, ws.label ASC',
        ['code' => $workflowType]
    );
    return array_map(static function (array $row): array { $row['next_codes'] = ticket_parse_json($row['next_codes'] ?? null, []); return $row; }, $rows);
}

function ticket_normalize_ticket_row(array $row): array {
    $row = ticket_crypto_decrypt_ticket_row($row, true);
    $row['metadata'] = ticket_parse_json($row['metadata'] ?? null, []);
    return $row;
}

function ticket_handler_summary(array $row, string $prefix = 'handler_'): ?array {
    $id = trim((string)($row[$prefix . 'id'] ?? ''));
    if ($id === '') return null;

    return [
        'id' => $id,
        'name' => $row[$prefix . 'name'] ?? null,
        'email' => $row[$prefix . 'email'] ?? null,
        'roles' => ticket_parse_json($row[$prefix . 'roles'] ?? null, []),
        'active' => isset($row[$prefix . 'active']) ? (bool)$row[$prefix . 'active'] : null,
    ];
}

function ticket_normalize_ticket_with_handler_row(array $row): array {
    $ticket = ticket_normalize_ticket_row($row);
    $ticket['email_notify'] = isset($row['email_notify']) ? (bool)$row['email_notify'] : false;
    $ticket['status_email_notify'] = isset($row['status_email_notify']) ? (bool)$row['status_email_notify'] : true;
    $ticket['is_anonymous'] = isset($row['is_anonymous']) ? (bool)$row['is_anonymous'] : false;
    if ($ticket['is_anonymous']) {
        $ticket['reporter_name'] = null;
        $ticket['reporter_phone'] = null;
        $ticket['reporter_email'] = null;
        if (is_array($ticket['metadata'] ?? null)) unset($ticket['metadata']['reporter_meta_client']);
    }
    $ticket['handlers'] = ticket_handler_summary($row);
    unset(
        $ticket['access_code'],
        $ticket['handler_name'],
        $ticket['handler_email'],
        $ticket['handler_roles'],
        $ticket['handler_active']
    );
    return $ticket;
}

function ticket_ticket_handlers_from_rows(array $rows): array {
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
                'roles' => ticket_parse_json($row['handler_roles'] ?? null, []),
                'active' => isset($row['handler_active']) ? (bool)$row['handler_active'] : null,
            ],
        ];
    }, $rows));
}

function ticket_with_handlers_from_results(array $results, int $ticketIndex, int $ticketHandlersIndex): ?array {
    $ticketRow = sqlserver_result_rows($results, $ticketIndex)[0] ?? null;
    if (!is_array($ticketRow)) {
        return null;
    }

    $ticket = ticket_normalize_ticket_with_handler_row($ticketRow);
    $ticket['ticket_handlers'] = ticket_ticket_handlers_from_rows(sqlserver_result_rows($results, $ticketHandlersIndex));
    return $ticket;
}

function ticket_ticket_with_handler_command(string $ticketId, int $timeout = 30): array {
    return sqlserver_command(
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
        ['ticket_id' => $ticketId],
        $timeout
    );
}

function ticket_ticket_handlers_command(string $ticketId, int $timeout = 30): array {
    return sqlserver_command(
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
        ['ticket_id' => $ticketId],
        $timeout
    );
}

function ticket_load_ticket_row_by_id(string $ticketId): ?array {
    $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.tickets WHERE id = @id', ['id' => $ticketId]);
    $row = $rows[0] ?? null; if (!$row) return null; return ticket_normalize_ticket_row($row);
}

function ticket_load_relations(string $ticketId): array {
    $results = sqlserver_run_commands([
        sqlserver_command('query', 'SELECT * FROM dbo.attachments WHERE ticket_id = @ticket_id ORDER BY created_at ASC', ['ticket_id' => $ticketId]),
        sqlserver_command('query', 'SELECT * FROM dbo.messages WHERE ticket_id = @ticket_id ORDER BY created_at ASC', ['ticket_id' => $ticketId]),
        sqlserver_command('query', 'SELECT * FROM dbo.ticket_actions WHERE ticket_id = @ticket_id ORDER BY created_at DESC', ['ticket_id' => $ticketId]),
        sqlserver_command('query', 'SELECT * FROM dbo.ticket_comments WHERE ticket_id = @ticket_id ORDER BY created_at ASC', ['ticket_id' => $ticketId]),
    ], false);

    return [
        'attachments' => sqlserver_result_rows($results, 0),
        'messages' => array_map('ticket_crypto_decrypt_message_row', sqlserver_result_rows($results, 1)),
        'ticket_actions' => array_map('ticket_crypto_decrypt_action_row', sqlserver_result_rows($results, 2)),
        'ticket_comments' => array_map('ticket_crypto_decrypt_comment_row', sqlserver_result_rows($results, 3)),
    ];
}

function ticket_reporter_relations_from_results(array $results, int $startIndex = 0): array {
    return [
        'attachments' => sqlserver_result_rows($results, $startIndex),
        'messages' => array_map('ticket_crypto_decrypt_message_row', sqlserver_result_rows($results, $startIndex + 1)),
        'ticket_actions' => array_map('ticket_crypto_decrypt_action_row', sqlserver_result_rows($results, $startIndex + 2)),
        'ticket_comments' => array_map('ticket_crypto_decrypt_comment_row', sqlserver_result_rows($results, $startIndex + 3)),
    ];
}

function ticket_reporter_relation_commands(string $ticketId, int $timeout = 30): array {
    return [
        sqlserver_command('query', 'SELECT * FROM dbo.attachments WHERE ticket_id = @ticket_id ORDER BY created_at ASC', ['ticket_id' => $ticketId], $timeout),
        sqlserver_command('query', 'SELECT * FROM dbo.messages WHERE ticket_id = @ticket_id ORDER BY created_at ASC', ['ticket_id' => $ticketId], $timeout),
        sqlserver_command('query', 'SELECT * FROM dbo.ticket_actions WHERE ticket_id = @ticket_id ORDER BY created_at DESC', ['ticket_id' => $ticketId], $timeout),
        sqlserver_command('query', 'SELECT * FROM dbo.ticket_comments WHERE ticket_id = @ticket_id ORDER BY created_at ASC', ['ticket_id' => $ticketId], $timeout),
    ];
}

function ticket_reporter_ticket_by_id_from_results(array $results, int $ticketIndex, int $relationsStartIndex): ?array {
    $ticketRow = sqlserver_result_rows($results, $ticketIndex)[0] ?? null;
    if (!is_array($ticketRow)) {
        return null;
    }

    return array_merge(
        ticket_normalize_ticket_row($ticketRow),
        ticket_reporter_relations_from_results($results, $relationsStartIndex)
    );
}

function ticket_json_object($value): ?array {
    if (is_array($value)) {
        return $value;
    }
    if (!is_string($value) || trim($value) === '') {
        return null;
    }
    $decoded = json_decode($value, true);
    return is_array($decoded) ? $decoded : null;
}

function ticket_json_rows($value): array {
    if (is_array($value)) {
        return $value;
    }
    if (!is_string($value) || trim($value) === '') {
        return [];
    }
    $decoded = json_decode($value, true);
    return is_array($decoded) ? $decoded : [];
}

function ticket_reporter_ticket_from_json_bundle(array $row): ?array {
    $ticketRow = ticket_json_object($row['ticket_json'] ?? null);
    if (!$ticketRow) {
        return null;
    }

    return array_merge(
        ticket_normalize_ticket_row($ticketRow),
        [
            'attachments' => ticket_json_rows($row['attachments_json'] ?? null),
            'messages' => array_map('ticket_crypto_decrypt_message_row', ticket_json_rows($row['messages_json'] ?? null)),
            'ticket_actions' => array_map('ticket_crypto_decrypt_action_row', ticket_json_rows($row['ticket_actions_json'] ?? null)),
            'ticket_comments' => array_map('ticket_crypto_decrypt_comment_row', ticket_json_rows($row['ticket_comments_json'] ?? null)),
        ]
    );
}

function ticket_lookup_by_credentials(string $ticketInput, string $accessCode): ?array {
    $meta = normalize_ticket_input($ticketInput);
    if (!$meta['ok'] || $accessCode === '') return null;

    return [
        'where_sql' => ($meta['is_uuid'] ? 't.id = @ticket_value' : 't.ticket_number = @ticket_value') . ' AND ((t.access_code_hash IS NOT NULL AND t.access_code_hash = @access_code_hash) OR t.access_code = @access_code)',
        'params' => ['ticket_value' => $meta['value'], 'access_code_hash' => portal_token_hash('ticket-access-code', $accessCode), 'access_code' => $accessCode],
    ];
}

function ticket_command_by_credentials(array $lookup, int $timeout = 30): array {
    return sqlserver_command(
        'query',
        'SELECT TOP 1 * FROM dbo.tickets t WHERE ' . $lookup['where_sql'],
        $lookup['params'],
        $timeout
    );
}

function ticket_reporter_relation_commands_for_lookup(array $lookup, int $timeout = 30): array {
    $idSubquery = 'SELECT TOP 1 t.id FROM dbo.tickets t WHERE ' . $lookup['where_sql'];

    return [
        sqlserver_command('query', 'SELECT * FROM dbo.attachments WHERE ticket_id = (' . $idSubquery . ') ORDER BY created_at ASC', $lookup['params'], $timeout),
        sqlserver_command('query', 'SELECT * FROM dbo.messages WHERE ticket_id = (' . $idSubquery . ') ORDER BY created_at ASC', $lookup['params'], $timeout),
        sqlserver_command('query', 'SELECT * FROM dbo.ticket_actions WHERE ticket_id = (' . $idSubquery . ') ORDER BY created_at DESC', $lookup['params'], $timeout),
        sqlserver_command('query', 'SELECT * FROM dbo.ticket_comments WHERE ticket_id = (' . $idSubquery . ') ORDER BY created_at ASC', $lookup['params'], $timeout),
    ];
}

function ticket_load_ticket_by_credentials(string $ticketInput, string $accessCode): ?array {
    $lookup = ticket_lookup_by_credentials($ticketInput, $accessCode);
    if (!$lookup) return null;

    $idSubquery = 'SELECT TOP 1 t.id FROM dbo.tickets t WHERE ' . $lookup['where_sql'];
    $rows = sqlserver_query(
        "SELECT
            (SELECT TOP 1 t.* FROM dbo.tickets t WHERE " . $lookup['where_sql'] . " FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) AS ticket_json,
            COALESCE((SELECT * FROM dbo.attachments WHERE ticket_id = (" . $idSubquery . ") ORDER BY created_at ASC FOR JSON PATH, INCLUDE_NULL_VALUES), '[]') AS attachments_json,
            COALESCE((SELECT * FROM dbo.messages WHERE ticket_id = (" . $idSubquery . ") ORDER BY created_at ASC FOR JSON PATH, INCLUDE_NULL_VALUES), '[]') AS messages_json,
            COALESCE((SELECT * FROM dbo.ticket_actions WHERE ticket_id = (" . $idSubquery . ") ORDER BY created_at DESC FOR JSON PATH, INCLUDE_NULL_VALUES), '[]') AS ticket_actions_json,
            COALESCE((SELECT * FROM dbo.ticket_comments WHERE ticket_id = (" . $idSubquery . ") ORDER BY created_at ASC FOR JSON PATH, INCLUDE_NULL_VALUES), '[]') AS ticket_comments_json",
        $lookup['params']
    );

    return ticket_reporter_ticket_from_json_bundle($rows[0] ?? []);
}

function ticket_sanitize_reporter_ticket(array $ticket, array $settings): array {
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
    $statusCode = strtolower(trim((string)($ticket['status_code'] ?? '')));
    if (ticket_setting_bool($settings, ['compliance.anonymize_closed_tickets'], false) && in_array($statusCode, ['closed', 'gesloten', 'resolved', 'opgelost'], true)) {
        $ticket['reporter_name'] = null; $ticket['reporter_phone'] = null;
        if (is_array($ticket['metadata'] ?? null)) unset($ticket['metadata']['reporter_meta_client']);
    }
    $nowTs = time();
    $ticket['attachments'] = array_values(array_filter(array_map(static function ($att) {
        if (!is_array($att) || !empty($att['is_internal']) || !empty($att['note_id'])) return null;
        return attachment_security_public_row($att, 'reporter');
    }, is_array($ticket['attachments'] ?? null) ? $ticket['attachments'] : [])));
    $ticket['messages'] = array_values(array_filter(array_map(static function ($msg) use ($nowTs) {
        if (!is_array($msg) || !empty($msg['is_internal'])) return null;
        $visibleAtTs = ($raw = trim((string)($msg['visible_at'] ?? ''))) !== '' ? strtotime($raw) : false;
        return ($visibleAtTs !== false && $visibleAtTs > $nowTs) ? null : $msg;
    }, is_array($ticket['messages'] ?? null) ? $ticket['messages'] : [])));
    usort($ticket['messages'], static fn($a, $b) => (strtotime((string)($a['created_at'] ?? '')) ?: 0) <=> (strtotime((string)($b['created_at'] ?? '')) ?: 0));
    return $ticket;
}

function ticket_require_active_handler_context(): array {
    $ctx = api_authz_require_active_handler(static function (int $status, string $message): void { api_json($status, false, $message); });
    return ['claims' => (array)($ctx['claims'] ?? []), 'handler' => (array)($ctx['handler'] ?? [])];
}

function ticket_require_handler_ticket_access(array $handler, string $ticketId): array {
    $handlerId = trim((string)($handler['id'] ?? ''));
    if (!ticket_is_uuid($handlerId)) api_json(403, false, 'Handler account not active or not found');
    $rows = sqlserver_query(
        'SELECT TOP 1 t.id, t.ticket_number, t.workflow_type, t.status_code,
            CASE WHEN t.handler_id = @handler_id
                OR EXISTS (SELECT 1 FROM dbo.ticket_handlers th WHERE th.ticket_id = t.id AND th.handler_id = @handler_id)
                OR EXISTS (
                    SELECT 1 FROM dbo.workflows w
                    INNER JOIN dbo.handler_workflows hw ON hw.workflow_id = w.id
                    WHERE hw.handler_id = @handler_id AND w.code = t.workflow_type
                ) THEN 1 ELSE 0 END AS has_ticket_access
         FROM dbo.tickets t WHERE t.id = @ticket_id',
        ['ticket_id' => $ticketId, 'handler_id' => $handlerId]
    );
    $ticket = $rows[0] ?? null;
    if (!$ticket) api_json(404, false, 'Ticket not found');
    if (empty($ticket['has_ticket_access']) && !api_authz_is_admin($handler)) {
        api_json(403, false, 'You are not authorized to manage attachments for this ticket');
    }
    return $ticket;
}

function ticket_action_command(array $payload, array $settings): ?array {
    if (!ticket_action_logging_enabled($settings)) return null;
    $description = $payload['description'] ?? null;
    return sqlserver_command(
        'nonquery',
        'INSERT INTO dbo.ticket_actions (ticket_id, action_type, action, description, description_encrypted, handler_id, handler_name, handler_email, performed_by, created_at)
         VALUES (@ticket_id, @action_type, @action, @description, @description_encrypted, @handler_id, @handler_name, @handler_email, @performed_by, COALESCE(@created_at, SYSUTCDATETIME()))',
        [
            'ticket_id' => $payload['ticket_id'] ?? null,
            'action_type' => $payload['action_type'] ?? null,
            'action' => $payload['action'] ?? null,
            'description' => null,
            'description_encrypted' => ticket_crypto_encrypt_nullable($description),
            'handler_id' => $payload['handler_id'] ?? null,
            'handler_name' => $payload['handler_name'] ?? null,
            'handler_email' => $payload['handler_email'] ?? null,
            'performed_by' => $payload['performed_by'] ?? null,
            'created_at' => ticket_sql_datetime_param($payload['created_at'] ?? null),
        ]
    );
}

function ticket_insert_action(array $payload, array $settings): void {
    $command = ticket_action_command($payload, $settings);
    if (!$command) return;
    sqlserver_run_commands([$command], true);
}

function ticket_env_optional(string $key, string $default = ''): string {
    $value = trim((string)(getenv($key) ?: ''));
    return $value !== '' ? $value : $default;
}

function ticket_escape_html($value): string {
    return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
}

function ticket_normalize_email(?string $email): string {
    return strtolower(trim((string)$email));
}

function ticket_parse_bool_env(string $value): bool {
    $normalized = strtolower(trim($value));
    return in_array($normalized, ['1', 'true', 'yes', 'on'], true);
}

function ticket_server_base_url(): string {
    $configured = ticket_env_optional('PORTAL_BASE_URL', '');
    if ($configured !== '') return rtrim($configured, '/');
    $host = trim((string)($_SERVER['HTTP_HOST'] ?? ''));
    if ($host === '') return '';
    $hostname = strtolower((string)(parse_url('http://' . $host, PHP_URL_HOST) ?: ''));
    if (in_array($hostname, ['localhost', '127.0.0.1', '::1'], true)) return '';
    $isHttps =
        (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off')
        || (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443)
        || strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
    return ($isHttps ? 'https' : 'http') . '://' . $host;
}

function ticket_mail_api_candidate_urls(): array {
    $candidates = [];
    foreach ([ticket_env_optional('MAIL_API_INTERNAL_URL', ''), ticket_env_optional('PHP_MAIL_API_URL', '')] as $explicit) {
        if ($explicit !== '' && !in_array($explicit, $candidates, true)) {
            $candidates[] = $explicit;
        }
    }
    $base = ticket_server_base_url();
    if ($base !== '') {
        $candidates[] = $base . '/api/mail.api.php';
    }
    $serverPort = (int)($_SERVER['SERVER_PORT'] ?? 0);
    $localPort = ($serverPort > 0 && !in_array($serverPort, [80, 443], true)) ? (':' . $serverPort) : '';
    foreach (['http://127.0.0.1', 'http://localhost'] as $host) {
        $url = $host . $localPort . '/api/mail.api.php';
        if (!in_array($url, $candidates, true)) {
            $candidates[] = $url;
        }
    }
    return $candidates ?: ['http://127.0.0.1:8081/api/mail.api.php'];
}

function ticket_mail_outbox_write(array $to, string $subject, string $html, string $text = '', array $bcc = []): array {
    $outbox = ticket_env_optional('MAIL_OUTBOX_DIR', __DIR__ . '/outbox');
    if (!is_dir($outbox) && !@mkdir($outbox, 0755, true) && !is_dir($outbox)) {
        return ['success' => false, 'message' => 'Unable to create mail outbox'];
    }
    $id = date('Ymd_His') . '_' . bin2hex(random_bytes(4));
    $file = rtrim($outbox, '/\\') . DIRECTORY_SEPARATOR . "mail_{$id}.json";
    $payload = [
        'id' => $id,
        'ts' => date('c'),
        'from' => ticket_env_optional('MAIL_DEFAULT_FROM', 'noreply@nedzink.nl'),
        'to' => $to,
        'cc' => [],
        'bcc' => $bcc,
        'subject' => $subject,
        'html' => $html,
        'text' => $text !== '' ? $text : strip_tags(str_replace(['<br>', '<br/>', '<br />'], "\n", $html)),
        'note' => 'DEV SINK enabled: email not sent via SMTP',
    ];
    @file_put_contents($file, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    return ['success' => true, 'outbox_file' => $file];
}

function ticket_is_local_mail_api_self_call(string $url): bool {
    if (PHP_SAPI !== 'cli-server') return false;

    $parts = parse_url($url);
    if (!is_array($parts)) return false;

    $host = strtolower(trim((string)($parts['host'] ?? '')));
    if (!in_array($host, ['127.0.0.1', 'localhost', '::1'], true)) return false;

    $port = (int)($parts['port'] ?? 0);
    $serverPort = (int)($_SERVER['SERVER_PORT'] ?? 0);
    return $port > 0 && $serverPort > 0 && $port === $serverPort;
}

function ticket_send_mail(array $to, string $subject, string $html, string $text = '', array $bcc = []): array {
    $to = array_values(array_filter(array_unique(array_map('ticket_normalize_email', $to)), 'ticket_valid_email'));
    $bcc = array_values(array_filter(array_unique(array_map('ticket_normalize_email', $bcc)), 'ticket_valid_email'));
    if (!$to) return ['success' => false, 'message' => 'No valid recipient email'];

    if (ticket_parse_bool_env(ticket_env_optional('MAIL_DEV_SINK', 'false'))) {
        return ticket_mail_outbox_write($to, $subject, $html, $text, $bcc);
    }

    if (!function_exists('curl_init')) {
        return ['success' => false, 'message' => 'cURL is not available for mail API call'];
    }

    $payload = [
        'to' => $to,
        'bcc' => $bcc,
        'subject' => trim($subject),
        'html' => $html,
        'text' => $text !== '' ? $text : strip_tags(str_replace(['<br>', '<br/>', '<br />'], "\n", $html)),
    ];
    $errors = [];
    foreach (ticket_mail_api_candidate_urls() as $url) {
        $isLocalSelfCall = ticket_is_local_mail_api_self_call($url);
        $ch = curl_init();
        $options = [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
            CURLOPT_TIMEOUT => $isLocalSelfCall ? 1 : 12,
        ];
        if ($isLocalSelfCall) {
            $options[CURLOPT_TIMEOUT_MS] = 250;
            $options[CURLOPT_CONNECTTIMEOUT_MS] = 250;
        }
        if (function_exists('auth0_apply_ssl_options')) {
            auth0_apply_ssl_options($options, $url);
        }
        curl_setopt_array($ch, $options);
        $resp = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = trim((string)curl_error($ch));
        curl_close($ch);

        if ($resp !== false) {
            $decoded = json_decode($resp, true);
            if ($code >= 200 && $code < 300 && is_array($decoded) && !empty($decoded['success'])) {
                return ['success' => true];
            }
            $errors[] = $url . ' -> ' . (is_array($decoded) ? (string)($decoded['message'] ?? 'mail.api error') : ('HTTP ' . $code));
            continue;
        }
        if ($isLocalSelfCall && stripos($err, 'timed out') !== false) {
            return ['success' => true, 'queued' => true, 'message' => 'Mail API queued on local PHP server'];
        }
        $errors[] = $url . ' -> ' . ($err !== '' ? $err : 'unknown curl error');
    }
    return ['success' => false, 'message' => 'mail.api call failed: ' . implode(' | ', $errors)];
}

function ticket_severity_label(string $severityCode): string {
    $map = ['critical' => 'Kritiek', 'high' => 'Hoog', 'medium' => 'Gemiddeld', 'low' => 'Laag'];
    return $map[strtolower(trim($severityCode))] ?? ucfirst($severityCode);
}

function ticket_severity_level(string $severityCode): int {
    $map = ['critical' => 4, 'high' => 3, 'medium' => 2, 'low' => 1];
    return $map[strtolower(trim($severityCode))] ?? 2;
}

function ticket_email_event_enabled_for_handlers(string $eventCode): bool {
    try {
        $rows = sqlserver_query(
            'SELECT TOP 1
                ISNULL(eas.is_enabled, et.enabled_by_default) AS is_enabled,
                ISNULL(eas.send_to_handlers, 1) AS send_to_handlers
             FROM dbo.email_event_types et
             LEFT JOIN dbo.email_admin_settings eas ON eas.event_type_code = et.code
             WHERE et.code = @code',
            ['code' => $eventCode]
        );
        if (!$rows) return true;
        $row = $rows[0];
        return !empty($row['is_enabled']) && !empty($row['send_to_handlers']);
    } catch (Throwable $e) {
        api_log_exception('tickets.api.email_event_enabled', $e, ['event' => $eventCode]);
        return true;
    }
}

function ticket_quiet_hours_active(?string $start, ?string $end): bool {
    $start = trim((string)$start);
    $end = trim((string)$end);
    if ($start === '' || $end === '') return false;
    if (!preg_match('/^\d{1,2}:\d{2}$/', $start) || !preg_match('/^\d{1,2}:\d{2}$/', $end)) return false;
    [$sh, $sm] = array_map('intval', explode(':', $start));
    [$eh, $em] = array_map('intval', explode(':', $end));
    $now = (int)date('G') * 60 + (int)date('i');
    $startMinutes = $sh * 60 + $sm;
    $endMinutes = $eh * 60 + $em;
    if ($startMinutes > $endMinutes) {
        return $now >= $startMinutes || $now <= $endMinutes;
    }
    return $now >= $startMinutes && $now <= $endMinutes;
}

function ticket_should_notify_created_handler(array $handler, string $severityCode): bool {
    if (!ticket_valid_email((string)($handler['email'] ?? ''))) return false;
    if (empty($handler['event_enabled'])) return false;
    if (isset($handler['email_enabled']) && empty($handler['email_enabled'])) return false;
    if ((int)date('N') >= 6 && empty($handler['weekend_notifications'])) return false;
    if (ticket_quiet_hours_active($handler['quiet_hours_start'] ?? null, $handler['quiet_hours_end'] ?? null) && strtolower($severityCode) !== 'critical') return false;
    $threshold = trim((string)($handler['min_severity_immediate'] ?? ''));
    if ($threshold !== '' && ticket_severity_level($severityCode) < ticket_severity_level($threshold)) return false;
    return true;
}

function ticket_created_handler_recipients(string $workflowType): array {
    return sqlserver_query(
        'SELECT
            h.id,
            h.name,
            h.email,
            COALESCE(hep.is_enabled, et.enabled_by_default, 1) AS event_enabled,
            COALESCE(hns.email_enabled, 1) AS email_enabled,
            hns.min_severity_immediate,
            hns.quiet_hours_start,
            hns.quiet_hours_end,
            COALESCE(hns.weekend_notifications, 0) AS weekend_notifications
         FROM dbo.handlers h
         LEFT JOIN dbo.email_event_types et ON et.code = @event_code
         LEFT JOIN dbo.handler_email_preferences hep ON hep.handler_id = h.id AND hep.event_type_code = @event_code
         LEFT JOIN dbo.handler_notification_settings hns ON hns.handler_id = h.id
         WHERE h.active = @active
           AND h.email IS NOT NULL
           AND LTRIM(RTRIM(h.email)) <> @empty
           AND (
                EXISTS (
                    SELECT 1
                    FROM dbo.handler_workflows hw
                    INNER JOIN dbo.workflows w ON w.id = hw.workflow_id
                    WHERE hw.handler_id = h.id AND w.code = @workflow_type
                )
                OR EXISTS (
                    SELECT 1
                    FROM dbo.handler_roles hr
                    INNER JOIN dbo.roles r ON r.id = hr.role_id
                    WHERE hr.handler_id = h.id AND UPPER(r.code) IN (@role_admin, @role_super_admin)
                )
                OR h.roles LIKE @admin_role_json
                OR h.roles LIKE @super_admin_role_json
                OR h.permissions LIKE @admin_permission_json
           )
         ORDER BY h.name ASC',
        [
            'workflow_type' => $workflowType,
            'event_code' => 'TICKET_CREATED',
            'active' => true,
            'empty' => '',
            'role_admin' => 'ADMIN',
            'role_super_admin' => 'SUPER_ADMIN',
            'admin_role_json' => '%"ADMIN"%',
            'super_admin_role_json' => '%"SUPER_ADMIN"%',
            'admin_permission_json' => '%"admin"%',
        ]
    );
}

function ticket_notification_log(?string $handlerId, string $status, string $event, string $message = '', array $metadata = []): void {
    try {
        sqlserver_execute(
            'INSERT INTO dbo.notification_logs (user_id, channel, status, event, error_message, metadata, created_at)
             VALUES (@user_id, @channel, @status, @event, @error_message, @metadata, SYSUTCDATETIME())',
            [
                'user_id' => $handlerId,
                'channel' => 'email',
                'status' => $status,
                'event' => $event,
                'error_message' => $message !== '' ? ticket_substr($message, 0, 1000) : null,
                'metadata' => $metadata ? json_encode($metadata, JSON_UNESCAPED_UNICODE) : null,
            ]
        );
    } catch (Throwable $e) {
        api_log_exception('tickets.api.notification_log', $e, ['event' => $event]);
    }
}

function ticket_created_handler_email_html(array $ticket, array $handler): string {
    $metadata = is_array($ticket['metadata'] ?? null) ? $ticket['metadata'] : [];
    $ticketNumber = trim((string)($ticket['ticket_number'] ?? ''));
    $statusLabel = trim((string)($metadata['status_label'] ?? $ticket['status_code'] ?? $ticket['current_stage'] ?? '-'));
    $severityCode = strtolower(trim((string)($ticket['severity_code'] ?? 'medium')));
    $portalBase = ticket_server_base_url();
    $dashboardUrl = $portalBase !== '' ? $portalBase . '/handler-dashboard' : '';
    $isAnonymous = !empty($ticket['is_anonymous']);
    $reporterName = $isAnonymous ? 'Anoniem' : (trim((string)($ticket['reporter_name'] ?? '')) ?: 'Niet opgegeven');
    $reporterEmail = $isAnonymous ? 'Verborgen bij anonieme melding' : (trim((string)($ticket['reporter_email'] ?? '')) ?: 'Niet opgegeven');
    $submittedAt = trim((string)($ticket['submitted_at'] ?? $ticket['created_at'] ?? ''));

    $html = '<h2>Nieuwe melding beschikbaar</h2>'
        . '<p>Hallo ' . ticket_escape_html($handler['name'] ?? 'collega') . ',</p>'
        . '<p>Er is een nieuwe melding ingediend in een workflow die u kunt behandelen.</p>'
        . '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:12px 0;">'
        . '<h3 style="margin:0 0 8px 0;">Meldingsoverzicht</h3>'
        . '<table role="presentation" style="width:100%;border-collapse:collapse;">'
        . '<tr><td style="padding:5px 0;color:#64748b;width:150px;">Ticketnummer</td><td>' . ticket_escape_html($ticketNumber ?: '-') . '</td></tr>'
        . '<tr><td style="padding:5px 0;color:#64748b;">Huidige status</td><td>' . ticket_escape_html($statusLabel ?: '-') . '</td></tr>'
        . '<tr><td style="padding:5px 0;color:#64748b;">Ernst</td><td>' . ticket_escape_html(ticket_severity_label($severityCode)) . '</td></tr>'
        . '<tr><td style="padding:5px 0;color:#64748b;">Workflow</td><td>' . ticket_escape_html($ticket['workflow_type'] ?? '-') . '</td></tr>'
        . '<tr><td style="padding:5px 0;color:#64748b;">Locatie</td><td>' . ticket_escape_html($ticket['location'] ?? 'Niet opgegeven') . '</td></tr>'
        . '<tr><td style="padding:5px 0;color:#64748b;">Ingediend op</td><td>' . ticket_escape_html($submittedAt ?: '-') . '</td></tr>'
        . '</table>'
        . '<h3 style="margin:14px 0 8px 0;">Omschrijving</h3>'
        . '<div>' . nl2br(ticket_escape_html($ticket['description'] ?? '-')) . '</div>'
        . '</div>'
        . '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:12px 0;">'
        . '<h3 style="margin:0 0 8px 0;">Melder (indien bekend)</h3>'
        . '<table role="presentation" style="width:100%;border-collapse:collapse;">'
        . '<tr><td style="padding:5px 0;color:#64748b;width:150px;">Naam</td><td>' . ticket_escape_html($reporterName) . '</td></tr>'
        . '<tr><td style="padding:5px 0;color:#64748b;">E-mail</td><td>' . ticket_escape_html($reporterEmail) . '</td></tr>'
        . '</table>'
        . '</div>';
    if ($dashboardUrl !== '') {
        $html .= '<p><a href="' . ticket_escape_html($dashboardUrl) . '">Open het handler-dashboard</a></p>';
    }
    $html .= '<p style="font-size:12px;color:#64748b;">Log in op het portaal om deze melding te bekijken en op te pakken.</p>';
    return $html;
}

function ticket_notify_handlers_new_report(array $ticket): array {
    $eventCode = 'TICKET_CREATED';
    $workflowType = trim((string)($ticket['workflow_type'] ?? ''));
    $severityCode = strtolower(trim((string)($ticket['severity_code'] ?? 'medium'))) ?: 'medium';
    $ticketNumber = trim((string)($ticket['ticket_number'] ?? ''));

    if ($workflowType === '') {
        return ['success' => false, 'skipped' => true, 'reason' => 'Missing workflow type'];
    }
    if (!ticket_email_event_enabled_for_handlers($eventCode)) {
        return ['success' => true, 'skipped' => true, 'reason' => 'Ticket created handler email disabled'];
    }

    $handlers = ticket_created_handler_recipients($workflowType);
    $sent = 0;
    $skipped = 0;
    $errors = [];

    foreach ($handlers as $handler) {
        $handlerId = trim((string)($handler['id'] ?? ''));
        if (!ticket_should_notify_created_handler($handler, $severityCode)) {
            $skipped++;
            ticket_notification_log($handlerId !== '' ? $handlerId : null, 'skipped', $eventCode, 'Handler preference or notification window skipped email', ['ticket_number' => $ticketNumber, 'workflow_type' => $workflowType]);
            continue;
        }

        $subject = 'Nieuwe melding beschikbaar: ' . ($ticketNumber !== '' ? $ticketNumber : 'Onbekend');
        $html = ticket_created_handler_email_html($ticket, $handler);
        $result = ticket_send_mail([(string)$handler['email']], $subject, $html);
        if (!empty($result['success'])) {
            $sent++;
            ticket_notification_log($handlerId !== '' ? $handlerId : null, 'sent', $eventCode, '', ['ticket_number' => $ticketNumber, 'workflow_type' => $workflowType]);
        } else {
            $message = (string)($result['message'] ?? 'Failed to send handler ticket-created email');
            $errors[] = $message;
            ticket_notification_log($handlerId !== '' ? $handlerId : null, 'failed', $eventCode, $message, ['ticket_number' => $ticketNumber, 'workflow_type' => $workflowType]);
        }
    }

    return [
        'success' => empty($errors),
        'workflow_type' => $workflowType,
        'total_candidates' => count($handlers),
        'sent' => $sent,
        'skipped' => $skipped,
        'errors' => $errors,
    ];
}

function ticket_notify_handlers_new_report_safe(array $ticket): array {
    try {
        return ticket_notify_handlers_new_report($ticket);
    } catch (Throwable $e) {
        $errorId = api_log_exception('tickets.api.notify_handlers_new_report', $e, ['ticket_id' => $ticket['id'] ?? null, 'ticket_number' => $ticket['ticket_number'] ?? null]);
        return ['success' => false, 'error_id' => $errorId, 'error' => $e->getMessage()];
    }
}

function ticket_is_local_api_smoke_test(array $data): bool {
    $remoteAddress = strtolower(trim((string)($_SERVER['REMOTE_ADDR'] ?? '')));
    if (!in_array($remoteAddress, ['127.0.0.1', '::1'], true)) return false;

    $metadata = is_array($data['metadata'] ?? null) ? $data['metadata'] : [];
    return ($metadata['source'] ?? null) === 'api-backend-test'
        && ($metadata['disposable'] ?? null) === true
        && strtolower(trim((string)($data['location'] ?? ''))) === 'api smoke test'
        && str_ends_with(strtolower(trim((string)($data['reporter_email'] ?? ''))), '@example.test');
}

function ticket_try_auto_assign_handler(string $ticketId, string $workflowType): ?array {
    $rows = sqlserver_query(
        "DECLARE @handler_id UNIQUEIDENTIFIER;
         SELECT TOP 1 @handler_id = h.id
         FROM dbo.handler_workflows hw
         INNER JOIN dbo.workflows w ON w.id = hw.workflow_id
         INNER JOIN dbo.handlers h ON h.id = hw.handler_id
         WHERE w.code = @code AND h.active = @active
         ORDER BY h.name ASC;

         IF @handler_id IS NOT NULL
         BEGIN
             UPDATE dbo.tickets
             SET handler_id = @handler_id, last_update_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME()
             WHERE id = @ticket_id;

             DELETE FROM dbo.ticket_handlers
             WHERE ticket_id = @ticket_id AND role = @role AND handler_id <> @handler_id;

             MERGE dbo.ticket_handlers AS target
             USING (SELECT @ticket_id AS ticket_id, @handler_id AS handler_id, @role AS role) AS source
             ON target.ticket_id = source.ticket_id AND target.handler_id = source.handler_id
             WHEN MATCHED THEN
                 UPDATE SET role = source.role, assigned_at = COALESCE(target.assigned_at, SYSUTCDATETIME())
             WHEN NOT MATCHED THEN
                 INSERT (ticket_id, handler_id, role, assigned_at, created_at)
                 VALUES (source.ticket_id, source.handler_id, source.role, SYSUTCDATETIME(), SYSUTCDATETIME());
         END;

         SELECT TOP 1 h.*
         FROM dbo.handlers h
         WHERE h.id = @handler_id",
        ['code' => $workflowType, 'active' => true, 'ticket_id' => $ticketId, 'role' => 'primary']
    );
    $handler = $rows[0] ?? null;
    if (!$handler) return null;
    $handlerId = trim((string)($handler['id'] ?? ''));
    if (!ticket_is_uuid($handlerId)) return null;
    return $handler;
}

function ticket_create_reply_token(string $ticketId): ?string {
    $token = ticket_generate_secure_token(); $expiresAt = ticket_reply_token_expiry_sql();
    sqlserver_execute('INSERT INTO dbo.ticket_reply_tokens (ticket_id, token, token_hash, expires_at, created_at) VALUES (@ticket_id, NULL, @token_hash, @expires_at, SYSUTCDATETIME())', ['ticket_id' => $ticketId, 'token_hash' => portal_token_hash('ticket-reply-token', $token), 'expires_at' => $expiresAt]);
    return $token;
}

function handle_create(array $data): void {
    $stage = 'rate_limit';
    $workflowType = trim((string)($data['workflow_type'] ?? ''));
    try {
        ticket_enforce_request_rate_limit('create', (string)($data['workflow_type'] ?? 'new'));
        $stage = 'load_settings';
        $settings = ticket_load_system_settings();
        if (!ticket_setting_bool($settings, ['tickets.allow_public_submission', 'portal.enable_public_submissions'], true)) api_json(403, false, 'Public submissions are disabled by system policy');
        $stage = 'validate_payload';
        $email = trim((string)($data['reporter_email'] ?? '')); $isAnonymous = !empty($data['is_anonymous']);
        if (ticket_setting_bool($settings, ['tickets.require_email_verification'], true) && $email === '') throw new Exception('reporter_email is required by system policy');
        if ($email !== '' && !ticket_valid_email($email)) api_json(400, false, 'reporter_email must be a valid email address');
        $severityCode = ticket_normalize_severity((string)($data['severity_code'] ?? ''), ticket_normalize_severity(ticket_setting_string($settings, ['tickets.default_priority', 'workflow.default_priority', 'portal.default_priority'], 'low'), 'low'));
        $stage = 'encrypt_payload';
        $cryptoKey = get_email_crypto_key();
        $metadata = is_array($data['metadata'] ?? null) ? $data['metadata'] : [];
        if ($isAnonymous) unset($metadata['reporter_meta_client'], $metadata['reporterMetaClient']);
        $payload = [
            'id' => ticket_uuid4(),
            'ticket_number' => trim((string)($data['ticket_number'] ?? '')) ?: ticket_generate_ticket_number(ticket_sanitize_prefix(ticket_setting_string($settings, ['tickets.ticket_number_prefix'], 'NZ'), 'NZ')),
            'access_code_raw' => normalize_access_code($data['access_code'] ?? '') ?: ticket_generate_access_code(),
            'description' => null,
            'description_encrypted' => ticket_crypto_encrypt_nullable($data['description'] ?? null, $cryptoKey, false),
            'location' => null,
            'location_encrypted' => ticket_crypto_encrypt_nullable($data['location'] ?? null, $cryptoKey),
            'workflow_type' => $workflowType,
            'severity_code' => $severityCode,
            'reporter_name' => null,
            'reporter_name_encrypted' => ticket_crypto_encrypt_nullable($isAnonymous ? null : ($data['reporter_name'] ?? null), $cryptoKey),
            'reporter_phone' => null,
            'reporter_phone_encrypted' => ticket_crypto_encrypt_nullable($isAnonymous ? null : ($data['reporter_phone'] ?? null), $cryptoKey),
            'email_notify' => $email !== '' ? !empty($data['email_notify']) : false,
            'status_email_notify' => array_key_exists('status_email_notify', $data) ? ($email !== '' ? !empty($data['status_email_notify']) : false) : ($email !== ''),
            'status_code' => $data['status_code'] ?? null,
            'current_stage' => $data['current_stage'] ?? null,
            'metadata' => json_encode($metadata, JSON_UNESCAPED_UNICODE),
            'reporter_email' => null,
            'reporter_email_encrypted' => $email ? encrypt_email($email, $cryptoKey) : null,
            'reporter_email_hash' => $email ? hash_email($email) : null,
            'next_step_due' => ticket_sql_datetime_param($data['next_step_due'] ?? null),
            'is_anonymous' => $isAnonymous,
        ];
        $payload['access_code'] = null;
        $payload['access_code_hash'] = portal_token_hash('ticket-access-code', (string)$payload['access_code_raw']);
        $stage = 'insert_ticket';
        $replyToken = ticket_generate_secure_token();
        $replyExpiresAtTs = ticket_reply_token_expiry_timestamp();
        $replyExpiresAtSql = ticket_sql_utc_datetime($replyExpiresAtTs);
        $createdRows = sqlserver_query(
            'SET NOCOUNT ON;

             INSERT INTO dbo.tickets (
                id, ticket_number, access_code, access_code_hash, description, description_encrypted, location, location_encrypted,
                workflow_type, severity_code, reporter_name, reporter_name_encrypted, reporter_phone, reporter_phone_encrypted,
                email_notify, status_email_notify, status_code, current_stage, metadata, reporter_email, reporter_email_encrypted,
                reporter_email_hash, next_step_due, is_anonymous, submitted_at, created_at, updated_at
            )
             VALUES (
                @id, @ticket_number, @access_code, @access_code_hash, @description, @description_encrypted, @location, @location_encrypted,
                @workflow_type, @severity_code, @reporter_name, @reporter_name_encrypted, @reporter_phone, @reporter_phone_encrypted,
                @email_notify, @status_email_notify, @status_code, @current_stage, @metadata, @reporter_email, @reporter_email_encrypted,
                @reporter_email_hash, @next_step_due, @is_anonymous, SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME()
            );

             INSERT INTO dbo.ticket_reply_tokens (ticket_id, token, token_hash, expires_at, created_at)
             VALUES (@id, NULL, @reply_token_hash, @reply_expires_at, SYSUTCDATETIME());

             SELECT TOP 1 * FROM dbo.tickets WHERE id = @id;',
            array_merge($payload, [
                'reply_token' => $replyToken,
                'reply_token_hash' => portal_token_hash('ticket-reply-token', $replyToken),
                'reply_expires_at' => $replyExpiresAtSql,
            ])
        );
        $stage = 'load_ticket';
        $createdRow = $createdRows[0] ?? null;
        $row = is_array($createdRow) ? ticket_normalize_ticket_row($createdRow) : null; if (!$row) throw new Exception('Ticket create failed');
        $stage = 'auto_assign';
        if (ticket_setting_bool_for_workflow($settings, $workflowType, ['tickets.auto_assign_enabled', 'workflow.auto_assign'], true)) {
            $assigned = ticket_try_auto_assign_handler((string)$payload['id'], $workflowType); if ($assigned) $row['handler_id'] = $assigned['id'] ?? null;
        }
        if (!ticket_is_local_api_smoke_test($data)) {
            ticket_notify_handlers_new_report_safe($row);
        }
        $row['access_code'] = $payload['access_code_raw']; $row['reply_token'] = $replyToken; $row['reply_url_path'] = '/reply/' . rawurlencode($replyToken); $row['reply_expires_at'] = gmdate('Y-m-d\TH:i:s\Z', $replyExpiresAtTs);
        api_json(200, true, 'Ticket created', $row);
    } catch (Throwable $e) {
        $errorId = api_log_exception('tickets.api.create', $e, ['action' => 'create', 'stage' => $stage, 'workflow_type' => $workflowType]);
        api_json(500, false, 'Internal server error', ['error_id' => $errorId, 'action' => 'create', 'stage' => $stage]);
    }
}

function handle_access(array $data): void {
    api_apply_no_store_headers();
    $ticketInput = (string)($data['ticket_input'] ?? $data['ticket_number'] ?? $data['ticket_id'] ?? ''); $accessCode = normalize_access_code($data['access_code'] ?? '');
    if ($ticketInput === '' || $accessCode === '') api_json(400, false, 'ticket_input and a valid 6-digit access_code are required');
    ticket_enforce_request_rate_limit('access', $ticketInput);
    $ticket = ticket_load_ticket_by_credentials($ticketInput, $accessCode);
    if (!$ticket) { ticket_register_failed_auth_attempt($ticketInput); usleep(random_int(150000, 350000)); api_json(401, false, 'Invalid ticket ID or access code'); }
    ticket_reset_failed_auth_attempts($ticketInput); api_json(200, true, 'Ticket loaded', ticket_sanitize_reporter_ticket($ticket, ticket_load_system_settings()));
}

function handle_reporter_message(array $data): void {
    api_apply_no_store_headers();
    $ticketInput = (string)($data['ticket_input'] ?? $data['ticket_number'] ?? $data['ticket_id'] ?? ''); $accessCode = normalize_access_code($data['access_code'] ?? ''); $body = trim((string)($data['body'] ?? ''));
    if ($ticketInput === '' || $accessCode === '') api_json(400, false, 'ticket_input and a valid 6-digit access_code are required');
    if ($body === '') api_json(400, false, 'Message body is required');
    if (ticket_strlen($body) > 1000) api_json(400, false, 'Message body exceeds 1000 characters');
    ticket_enforce_request_rate_limit('message', $ticketInput);
    $lookup = ticket_lookup_by_credentials($ticketInput, $accessCode);
    if (!$lookup) {
        ticket_register_failed_auth_attempt($ticketInput); usleep(random_int(150000, 350000)); api_json(401, false, 'Invalid ticket ID or access code');
    }
    $settings = ticket_load_system_settings();
    $messageId = ticket_uuid4();
    $params = array_merge($lookup['params'], [
        'message_id' => $messageId,
        'sender' => 'reporter',
        'body' => TICKET_ENCRYPTED_PLACEHOLDER,
        'body_encrypted' => ticket_crypto_encrypt_nullable($body, null, false),
        'is_internal' => false,
    ]);
    $actionSql = '';
    if (ticket_action_logging_enabled($settings)) {
        $actionSql = "
            INSERT INTO dbo.ticket_actions (
                ticket_id, action_type, action, description, description_encrypted,
                handler_id, handler_name, handler_email, performed_by, created_at
            )
            VALUES (
                @ticket_id, @action_type, @action, @action_description, @action_description_encrypted,
                NULL, NULL, NULL, @performed_by, SYSUTCDATETIME()
            );";
        $params['action_type'] = 'message_sent';
        $params['action'] = 'Message Sent';
        $params['action_description'] = null;
        $params['action_description_encrypted'] = ticket_crypto_encrypt_nullable('Reporter sent a message');
        $params['performed_by'] = 'Reporter';
    }

    $rows = sqlserver_query(
        "DECLARE @ticket_id UNIQUEIDENTIFIER;
         SELECT TOP 1 @ticket_id = t.id FROM dbo.tickets t WHERE " . $lookup['where_sql'] . ";

         IF @ticket_id IS NOT NULL
         BEGIN
             INSERT INTO dbo.messages (id, ticket_id, sender, body, body_encrypted, is_internal, visible_at, created_at)
             VALUES (@message_id, @ticket_id, @sender, @body, @body_encrypted, @is_internal, SYSUTCDATETIME(), SYSUTCDATETIME());

             UPDATE dbo.tickets
             SET last_update_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME()
             WHERE id = @ticket_id;
             " . $actionSql . "
         END;

         SELECT
            (SELECT TOP 1 * FROM dbo.messages WHERE id = @message_id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) AS message_json,
            (SELECT TOP 1 t.* FROM dbo.tickets t WHERE t.id = @ticket_id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) AS ticket_json,
            COALESCE((SELECT * FROM dbo.attachments WHERE ticket_id = @ticket_id ORDER BY created_at ASC FOR JSON PATH, INCLUDE_NULL_VALUES), '[]') AS attachments_json,
            COALESCE((SELECT * FROM dbo.messages WHERE ticket_id = @ticket_id ORDER BY created_at ASC FOR JSON PATH, INCLUDE_NULL_VALUES), '[]') AS messages_json,
            COALESCE((SELECT * FROM dbo.ticket_actions WHERE ticket_id = @ticket_id ORDER BY created_at DESC FOR JSON PATH, INCLUDE_NULL_VALUES), '[]') AS ticket_actions_json,
            COALESCE((SELECT * FROM dbo.ticket_comments WHERE ticket_id = @ticket_id ORDER BY created_at ASC FOR JSON PATH, INCLUDE_NULL_VALUES), '[]') AS ticket_comments_json",
        $params
    );
    $bundleRow = $rows[0] ?? [];
    $ticket = is_array($bundleRow) ? ticket_reporter_ticket_from_json_bundle($bundleRow) : null;
    if (!$ticket) { ticket_register_failed_auth_attempt($ticketInput); usleep(random_int(150000, 350000)); api_json(401, false, 'Invalid ticket ID or access code'); }
    ticket_reset_failed_auth_attempts($ticketInput);
    $messageRow = ticket_json_object($bundleRow['message_json'] ?? null);
    if (is_array($messageRow)) $messageRow = ticket_crypto_decrypt_message_row($messageRow);
    $updatedTicket = $ticket;

    api_json(200, true, 'Message sent', ['message' => $messageRow, 'ticket' => ticket_sanitize_reporter_ticket($updatedTicket, $settings)]);
}

function handle_handler_update_ticket(array $data): void {
    $ctx = ticket_require_active_handler_context(); $handler = $ctx['handler'];
    $ticketId = trim((string)($data['ticket_id'] ?? '')); if (!ticket_is_uuid($ticketId)) api_json(400, false, 'ticket_id must be a valid UUID');
    ticket_enforce_handler_mutation_rate_limit('update_ticket', $handler, $ticketId);
    $updates = is_array($data['updates'] ?? null) ? $data['updates'] : [];
    $currentTicketRows = sqlserver_query(
        'SELECT TOP 1 workflow_type, status_code FROM dbo.tickets WHERE id = @id',
        ['id' => $ticketId]
    );
    $currentTicket = $currentTicketRows[0] ?? null;
    if (!$currentTicket) api_json(404, false, 'Ticket not found');

    $automaticReply = '';
    $requestedStatusCode = trim((string)($updates['status_code'] ?? ''));
    $currentStatusCode = trim((string)($currentTicket['status_code'] ?? ''));
    if ($requestedStatusCode !== '' && $requestedStatusCode !== $currentStatusCode) {
        $targetWorkflowType = trim((string)($updates['workflow_type'] ?? $currentTicket['workflow_type'] ?? ''));
        $replyRows = sqlserver_query(
            'SELECT TOP 1 ws.automatic_reply
             FROM dbo.workflow_statuses ws
             INNER JOIN dbo.workflows w ON w.id = ws.workflow_id
             WHERE w.code = @workflow_code AND ws.code = @status_code',
            ['workflow_code' => $targetWorkflowType, 'status_code' => $requestedStatusCode]
        );
        $automaticReply = trim((string)($replyRows[0]['automatic_reply'] ?? ''));
    }
    $allowed = ['description','location','workflow_type','severity_code','reporter_name','reporter_email','reporter_phone','email_notify','status_email_notify','status_code','current_stage','metadata','handler_id','next_step_due','last_update_at','location_id'];
    $encryptedFieldByPlainField = [
        'description' => 'description_encrypted',
        'location' => 'location_encrypted',
        'reporter_name' => 'reporter_name_encrypted',
        'reporter_phone' => 'reporter_phone_encrypted',
    ];
    $sets = ['updated_at = SYSUTCDATETIME()']; $params = ['id' => $ticketId];
    $cryptoKey = null;
    foreach ($allowed as $field) {
        if (!array_key_exists($field, $updates)) continue;
        if (isset($encryptedFieldByPlainField[$field])) {
            $cryptoKey = $cryptoKey ?? get_email_crypto_key();
            $encryptedField = $encryptedFieldByPlainField[$field];
            $sets[] = $field . ' = @' . $field;
            $sets[] = $encryptedField . ' = @' . $encryptedField;
            $params[$field] = null;
            $params[$encryptedField] = ticket_crypto_encrypt_nullable($updates[$field], $cryptoKey, $field === 'description' ? false : true);
            continue;
        }
        if ($field === 'reporter_email') {
            $email = strtolower(trim((string)($updates[$field] ?? '')));
            if ($email !== '' && !ticket_valid_email($email)) api_json(400, false, 'reporter_email must be a valid email address');
            $cryptoKey = $cryptoKey ?? get_email_crypto_key();
            $sets[] = 'reporter_email = @reporter_email';
            $sets[] = 'reporter_email_encrypted = @reporter_email_encrypted';
            $sets[] = 'reporter_email_hash = @reporter_email_hash';
            $params['reporter_email'] = null;
            $params['reporter_email_encrypted'] = $email !== '' ? encrypt_email($email, $cryptoKey) : null;
            $params['reporter_email_hash'] = $email !== '' ? hash_email($email) : null;
            continue;
        }
        $sets[] = $field . ' = @' . $field;
        $params[$field] = $field === 'metadata' ? json_encode(is_array($updates[$field]) ? $updates[$field] : [], JSON_UNESCAPED_UNICODE) : $updates[$field];
    }
    if (count($sets) === 1) api_json(400, false, 'No valid ticket fields to update');
    $commands = [
        sqlserver_command(
            'nonquery',
            'UPDATE dbo.tickets SET ' . implode(', ', $sets) . ' WHERE id = @id',
            $params
        ),
    ];
    if ($automaticReply !== '') {
        $commands[] = sqlserver_command(
            'nonquery',
            'INSERT INTO dbo.messages (
                id, ticket_id, sender, body, body_encrypted, is_internal,
                visible_at, created_at, handler_id, handler_name
             )
             VALUES (
                @message_id, @ticket_id, @sender, @body, @body_encrypted, 0,
                SYSUTCDATETIME(), SYSUTCDATETIME(), NULL, NULL
             )',
            [
                'message_id' => ticket_uuid4(),
                'ticket_id' => $ticketId,
                'sender' => 'handler',
                'body' => TICKET_ENCRYPTED_PLACEHOLDER,
                'body_encrypted' => ticket_crypto_encrypt_nullable($automaticReply, null, false),
            ]
        );
    }
    sqlserver_run_commands($commands, true);
    api_json(200, true, 'Ticket updated', ['ticket' => ticket_load_ticket_row_by_id($ticketId)]);
}

function handle_handler_add_comment(array $data): void {
    $stage = 'start';
    $ctx = ticket_require_active_handler_context(); $handler = $ctx['handler']; $settings = ticket_load_system_settings();
    $ticketId = trim((string)($data['ticket_id'] ?? '')); $comment = trim((string)($data['comment'] ?? ''));
    if (!ticket_is_uuid($ticketId)) api_json(400, false, 'ticket_id must be a valid UUID');
    if ($comment === '') api_json(400, false, 'comment is required');
    if (ticket_strlen($comment) > 4000) api_json(400, false, 'comment exceeds 4000 characters');
    ticket_enforce_handler_mutation_rate_limit('add_comment', $handler, $ticketId);
    $performedBy = trim((string)($data['author_name'] ?? $handler['name'] ?? '')) ?: 'System';

    try {
        $stage = 'encrypt_comment';
        $encryptedComment = ticket_crypto_encrypt_nullable($comment, null, false);
        $commentId = ticket_uuid4();
        $stage = 'write_comment';
        $commands = [
            sqlserver_command(
                'nonquery',
                'INSERT INTO dbo.ticket_comments (id, ticket_id, [comment], comment_encrypted, author_name, created_at, updated_at) VALUES (@id, @ticket_id, @comment, @comment_encrypted, @author_name, SYSUTCDATETIME(), SYSUTCDATETIME())',
                [
                    'id' => $commentId,
                    'ticket_id' => $ticketId,
                    'comment' => TICKET_ENCRYPTED_PLACEHOLDER,
                    'comment_encrypted' => $encryptedComment,
                    'author_name' => $performedBy,
                ]
            ),
            sqlserver_command(
                'nonquery',
                'UPDATE dbo.tickets SET last_update_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @id',
                ['id' => $ticketId]
            ),
        ];
        $actionCommand = ticket_action_command([
            'ticket_id' => $ticketId,
            'action_type' => 'note_added',
            'action' => 'Note Added',
            'description' => 'Added investigation note: ' . ticket_substr($comment, 0, 100) . '...',
            'handler_id' => trim((string)($handler['id'] ?? '')) ?: null,
            'handler_name' => $performedBy,
            'handler_email' => trim((string)($handler['email'] ?? '')) ?: null,
            'performed_by' => $performedBy,
        ], $settings);
        if ($actionCommand) $commands[] = $actionCommand;
        $commentIndex = count($commands);
        $commands[] = sqlserver_command('query', 'SELECT TOP 1 * FROM dbo.ticket_comments WHERE id = @id', ['id' => $commentId]);
        $ticketIndex = count($commands);
        $commands[] = ticket_ticket_with_handler_command($ticketId);
        $ticketHandlersIndex = count($commands);
        $commands[] = ticket_ticket_handlers_command($ticketId);
        $results = sqlserver_run_commands($commands, true);
    } catch (Throwable $e) {
        $errorId = api_log_exception('tickets.api.add_comment', $e, ['action' => 'handler_add_comment', 'ticket_id' => $ticketId, 'stage' => $stage]);
        api_json(500, false, 'Internal server error', ['error_id' => $errorId, 'action' => 'handler_add_comment', 'stage' => $stage]);
    }

    $commentRow = sqlserver_result_rows($results, $commentIndex)[0] ?? null;
    if (is_array($commentRow)) $commentRow = ticket_crypto_decrypt_comment_row($commentRow);
    $ticket = ticket_with_handlers_from_results($results, $ticketIndex, $ticketHandlersIndex);
    api_json(200, true, 'Comment added', ['comment' => $commentRow, 'performed_by' => $performedBy, 'ticket' => $ticket]);
}

function handle_handler_update_comment(array $data): void {
    $stage = 'start';
    $ctx = ticket_require_active_handler_context(); $handler = $ctx['handler'];
    $ticketId = trim((string)($data['ticket_id'] ?? ''));
    $commentId = trim((string)($data['comment_id'] ?? ''));
    $comment = trim((string)($data['comment'] ?? ''));
    if (!ticket_is_uuid($ticketId)) api_json(400, false, 'ticket_id must be a valid UUID');
    if (!ticket_is_uuid($commentId)) api_json(400, false, 'comment_id must be a valid UUID');
    if ($comment === '') api_json(400, false, 'comment is required');
    if (ticket_strlen($comment) > 4000) api_json(400, false, 'comment exceeds 4000 characters');
    ticket_enforce_handler_mutation_rate_limit('update_comment', $handler, $ticketId);
    $performedBy = trim((string)($handler['name'] ?? '')) ?: 'System';

    try {
        $stage = 'find_comment';
        $existingRows = sqlserver_query(
            'SELECT TOP 1 id FROM dbo.ticket_comments WHERE id = @comment_id AND ticket_id = @ticket_id',
            ['comment_id' => $commentId, 'ticket_id' => $ticketId]
        );
        if (!$existingRows) api_json(404, false, 'Comment not found');

        $stage = 'encrypt_comment';
        $encryptedComment = ticket_crypto_encrypt_nullable($comment, null, false);
        $stage = 'write_comment';
        $results = sqlserver_run_commands([
            sqlserver_command(
                'nonquery',
                'UPDATE dbo.ticket_comments
                 SET [comment] = @comment, comment_encrypted = @comment_encrypted, updated_at = SYSUTCDATETIME()
                 WHERE id = @comment_id AND ticket_id = @ticket_id',
                [
                    'comment_id' => $commentId,
                    'ticket_id' => $ticketId,
                    'comment' => TICKET_ENCRYPTED_PLACEHOLDER,
                    'comment_encrypted' => $encryptedComment,
                ]
            ),
            sqlserver_command(
                'nonquery',
                'UPDATE dbo.tickets SET last_update_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @id',
                ['id' => $ticketId]
            ),
            sqlserver_command(
                'query',
                'SELECT TOP 1 * FROM dbo.ticket_comments WHERE id = @comment_id AND ticket_id = @ticket_id',
                ['comment_id' => $commentId, 'ticket_id' => $ticketId]
            ),
        ], true);
    } catch (Throwable $e) {
        $errorId = api_log_exception('tickets.api.update_comment', $e, ['action' => 'handler_update_comment', 'ticket_id' => $ticketId, 'comment_id' => $commentId, 'stage' => $stage]);
        api_json(500, false, 'Internal server error', ['error_id' => $errorId, 'action' => 'handler_update_comment', 'stage' => $stage]);
    }

    $commentRow = sqlserver_result_rows($results, 2)[0] ?? null;
    if (is_array($commentRow)) $commentRow = ticket_crypto_decrypt_comment_row($commentRow);

    $actionLogErrorId = null;
    try {
        $settings = ticket_load_system_settings();
        ticket_insert_action([
            'ticket_id' => $ticketId,
            'action_type' => 'note_edited',
            'action' => 'Note Edited',
            'description' => 'Edited investigation note: ' . ticket_substr($comment, 0, 100) . '...',
            'handler_id' => trim((string)($handler['id'] ?? '')) ?: null,
            'handler_name' => $performedBy,
            'handler_email' => trim((string)($handler['email'] ?? '')) ?: null,
            'performed_by' => $performedBy,
        ], $settings);
    } catch (Throwable $e) {
        $actionLogErrorId = api_log_exception('tickets.api.update_comment.action_log', $e, ['action' => 'handler_update_comment', 'ticket_id' => $ticketId, 'comment_id' => $commentId]);
    }

    api_json(200, true, 'Comment updated', ['comment' => $commentRow, 'performed_by' => $performedBy, 'action_log_error_id' => $actionLogErrorId]);
}

function handle_handler_add_message(array $data): void {
    $ctx = ticket_require_active_handler_context(); $handler = $ctx['handler']; $settings = ticket_load_system_settings();
    $ticketId = trim((string)($data['ticket_id'] ?? '')); if (!ticket_is_uuid($ticketId)) api_json(400, false, 'ticket_id must be a valid UUID');
    ticket_enforce_handler_mutation_rate_limit('add_message', $handler, $ticketId);
    $sender = strtolower(trim((string)($data['sender'] ?? 'handler'))); $body = trim((string)($data['body'] ?? ''));
    if ($sender === '') api_json(400, false, 'sender is required');
    $normalizedBody = ticket_normalize_handler_message_body($body); $body = $normalizedBody['body']; $plainBody = $normalizedBody['plain'];
    if ($body === '') api_json(400, false, 'body is required'); if (ticket_strlen($plainBody) > 4000) api_json(400, false, 'body exceeds 4000 characters');
    $isInternal = !empty($data['is_internal']); $publicName = ($sender === 'handler' && !empty($data['disclose_handler_identity'])) ? (trim((string)($handler['name'] ?? '')) ?: 'System') : null;
    $performedBy = trim((string)($handler['name'] ?? '')) ?: 'System';
    $messageId = ticket_uuid4();
    $commands = [
        sqlserver_command(
            'nonquery',
            'INSERT INTO dbo.messages (id, ticket_id, sender, body, body_encrypted, is_internal, visible_at, created_at, handler_id, handler_name)
             VALUES (@id, @ticket_id, @sender, @body, @body_encrypted, @is_internal, @visible_at, SYSUTCDATETIME(), @handler_id, @handler_name)',
            [
                'id' => $messageId,
                'ticket_id' => $ticketId,
                'sender' => $sender,
                'body' => TICKET_ENCRYPTED_PLACEHOLDER,
                'body_encrypted' => ticket_crypto_encrypt_nullable($body, null, false),
                'is_internal' => $isInternal,
                'visible_at' => ticket_handler_message_visible_at($isInternal, $sender),
                'handler_id' => trim((string)($handler['id'] ?? '')) ?: null,
                'handler_name' => $publicName,
            ]
        ),
        sqlserver_command(
            'nonquery',
            'UPDATE dbo.tickets SET last_update_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @id',
            ['id' => $ticketId]
        ),
    ];
    $actionCommand = ticket_action_command([
        'ticket_id' => $ticketId,
        'action_type' => 'message_sent',
        'action' => 'Message Sent',
        'description' => 'Sent message: ' . ticket_substr($plainBody, 0, 100) . '...',
        'handler_id' => trim((string)($handler['id'] ?? '')) ?: null,
        'handler_name' => $performedBy,
        'handler_email' => trim((string)($handler['email'] ?? '')) ?: null,
        'performed_by' => $performedBy,
    ], $settings);
    if ($actionCommand) $commands[] = $actionCommand;

    $messageIndex = count($commands);
    $commands[] = sqlserver_command('query', 'SELECT TOP 1 * FROM dbo.messages WHERE id = @id', ['id' => $messageId]);
    $ticketIndex = count($commands);
    $commands[] = ticket_ticket_with_handler_command($ticketId);
    $ticketHandlersIndex = count($commands);
    $commands[] = ticket_ticket_handlers_command($ticketId);

    $results = sqlserver_run_commands($commands, true);
    $messageRow = sqlserver_result_rows($results, $messageIndex)[0] ?? null;
    if (is_array($messageRow)) $messageRow = ticket_crypto_decrypt_message_row($messageRow);
    $ticket = ticket_with_handlers_from_results($results, $ticketIndex, $ticketHandlersIndex);
    api_json(200, true, 'Message added', ['message' => $messageRow, 'performed_by' => $performedBy, 'public_handler_name' => $publicName, 'ticket' => $ticket]);
}

function handle_handler_reset_access_code(array $data): void {
    api_apply_no_store_headers();
    $ctx = ticket_require_active_handler_context(); $handler = $ctx['handler'];
    $ticketId = trim((string)($data['ticket_id'] ?? ''));
    $reason = trim((string)($data['reason'] ?? ''));
    if (!ticket_is_uuid($ticketId)) api_json(400, false, 'ticket_id must be a valid UUID');
    if (ticket_strlen($reason) < 10 || ticket_strlen($reason) > 500) api_json(400, false, 'reason must be between 10 and 500 characters');
    ticket_enforce_handler_mutation_rate_limit('reset_access_code', $handler, $ticketId);
    $ticket = ticket_require_handler_ticket_access($handler, $ticketId);

    $currentRows = sqlserver_query('SELECT TOP 1 access_code, access_code_hash FROM dbo.tickets WHERE id = @ticket_id', ['ticket_id' => $ticketId]);
    $currentAccessCode = trim((string)($currentRows[0]['access_code'] ?? ''));
    $currentAccessCodeHash = trim((string)($currentRows[0]['access_code_hash'] ?? ''));
    do {
        $accessCode = ticket_generate_access_code();
        $accessCodeHash = portal_token_hash('ticket-access-code', $accessCode);
    } while ($accessCode === $currentAccessCode || ($currentAccessCodeHash !== '' && hash_equals($currentAccessCodeHash, $accessCodeHash)));
    $performedBy = trim((string)($handler['name'] ?? '')) ?: 'System';
    $settings = ticket_load_system_settings();
    $settings['compliance.audit_log_enabled'] = true;
    $actionCommand = ticket_action_command([
        'ticket_id' => $ticketId,
        'action_type' => 'access_code_reset',
        'action' => 'Reporter Access Code Reset',
        'description' => 'A replacement reporter access code was generated. Reason: ' . $reason,
        'handler_id' => trim((string)($handler['id'] ?? '')) ?: null,
        'handler_name' => $performedBy,
        'handler_email' => trim((string)($handler['email'] ?? '')) ?: null,
        'performed_by' => $performedBy,
    ], $settings);
    if (!$actionCommand) throw new RuntimeException('Mandatory access-code audit action could not be created');

    sqlserver_run_commands([
        sqlserver_command(
            'nonquery',
            'UPDATE dbo.tickets
             SET access_code = NULL, access_code_hash = @access_code_hash, updated_at = SYSUTCDATETIME(), last_update_at = SYSUTCDATETIME()
             WHERE id = @ticket_id',
            ['ticket_id' => $ticketId, 'access_code_hash' => $accessCodeHash]
        ),
        $actionCommand,
    ], true);

    api_json(200, true, 'Replacement access code generated', [
        'access_code' => $accessCode,
        'ticket_number' => $ticket['ticket_number'] ?? null,
        'old_code_invalidated' => true,
    ]);
}

function handle_reporter_add_attachment(array $data): void {
    api_apply_no_store_headers(); $settings = ticket_load_system_settings();
    $ticketInput = (string)($data['ticket_input'] ?? $data['ticket_number'] ?? $data['ticket_id'] ?? ''); $accessCode = normalize_access_code($data['access_code'] ?? '');
    $uploadToken = trim((string)($data['upload_token'] ?? ''));
    if ($ticketInput === '' || $accessCode === '') api_json(400, false, 'ticket_input and a valid 6-digit access_code are required');
    if ($uploadToken === '') api_json(400, false, 'upload_token is required');
    ticket_enforce_request_rate_limit('attachment', $ticketInput);
    $lookup = ticket_lookup_by_credentials($ticketInput, $accessCode);
    $lookupResults = $lookup ? sqlserver_run_commands([ticket_command_by_credentials($lookup)], false) : [];
    $ticketRow = sqlserver_result_rows($lookupResults, 0)[0] ?? null;
    $ticket = is_array($ticketRow) ? ticket_normalize_ticket_row($ticketRow) : null;
    if (!$ticket) { ticket_register_failed_auth_attempt($ticketInput); usleep(random_int(150000, 350000)); api_json(401, false, 'Invalid ticket ID or access code'); }
    ticket_reset_failed_auth_attempts($ticketInput);
    $ticketId = trim((string)($ticket['id'] ?? '')); if (!ticket_is_uuid($ticketId)) throw new Exception('Ticket lookup returned invalid data');
    $upload = attachment_security_validate_upload_token($uploadToken, $ticketId, ['reporter']);
    if (!$upload) api_json(401, false, 'Invalid or expired upload authorization');
    $fileName = trim((string)($upload['n'] ?? '')); $fileUrl = (string)$upload['p']; $mimeType = trim((string)($upload['m'] ?? 'application/octet-stream')); $sizeBytes = (int)($upload['z'] ?? 0);
    ticket_validate_attachment_policy($settings, $fileName, $sizeBytes);
    $attachmentId = ticket_uuid4();
    $commands = [
        sqlserver_command(
            'nonquery',
            'INSERT INTO dbo.attachments (id, ticket_id, file_name, file_url, mime_type, size_bytes, is_internal, note_id, created_at) VALUES (@id, @ticket_id, @file_name, @file_url, @mime_type, @size_bytes, @is_internal, @note_id, SYSUTCDATETIME())',
            ['id' => $attachmentId, 'ticket_id' => $ticketId, 'file_name' => $fileName, 'file_url' => $fileUrl, 'mime_type' => $mimeType !== '' ? $mimeType : 'application/octet-stream', 'size_bytes' => $sizeBytes, 'is_internal' => false, 'note_id' => null]
        ),
        sqlserver_command(
            'nonquery',
            'UPDATE dbo.tickets SET last_update_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @id',
            ['id' => $ticketId]
        ),
    ];
    $actionCommand = ticket_action_command([
        'ticket_id' => $ticketId,
        'action_type' => 'attachment_added',
        'action' => 'Attachment Added',
        'description' => 'Reporter uploaded file: ' . ticket_substr($fileName, 0, 200),
        'performed_by' => trim((string)($ticket['reporter_name'] ?? '')) ?: 'Reporter',
    ], $settings);
    if ($actionCommand) $commands[] = $actionCommand;

    $attachmentIndex = count($commands);
    $commands[] = sqlserver_command('query', 'SELECT TOP 1 * FROM dbo.attachments WHERE id = @id', ['id' => $attachmentId]);

    $results = sqlserver_run_commands($commands, true);
    $attachmentRow = sqlserver_result_rows($results, $attachmentIndex)[0] ?? null;
    if (is_array($attachmentRow)) $attachmentRow = attachment_security_public_row($attachmentRow, 'reporter');
    api_json(200, true, 'Attachment added', ['attachment' => $attachmentRow]);
}

function handle_handler_add_attachment(array $data): void {
    $ctx = ticket_require_active_handler_context(); $handler = $ctx['handler']; $settings = ticket_load_system_settings();
    $ticketId = trim((string)($data['ticket_id'] ?? '')); if (!ticket_is_uuid($ticketId)) api_json(400, false, 'ticket_id must be a valid UUID');
    ticket_enforce_handler_mutation_rate_limit('add_attachment', $handler, $ticketId);
    $ticketBeforeUpload = ticket_require_handler_ticket_access($handler, $ticketId);
    $uploadToken = trim((string)($data['upload_token'] ?? '')); $isInternal = !empty($data['is_internal']); $noteId = trim((string)($data['note_id'] ?? ''));
    $upload = attachment_security_validate_upload_token($uploadToken, $ticketId, ['handler']);
    if (!$upload) api_json(401, false, 'Invalid or expired upload authorization');
    $fileName = trim((string)($upload['n'] ?? '')); $fileUrl = (string)$upload['p']; $mimeType = trim((string)($upload['m'] ?? 'application/octet-stream')); $sizeBytes = (int)($upload['z'] ?? 0);
    if ($fileName === '' || ticket_strlen($fileName) > 255) api_json(400, false, 'Invalid uploaded file metadata');
    ticket_validate_attachment_policy($settings, $fileName, $sizeBytes);
    $normalizedFileUrl = $fileUrl;
    $performedBy = trim((string)($handler['name'] ?? '')) ?: 'System';
    $attachmentId = ticket_uuid4();
    $commands = [
        sqlserver_command(
            'nonquery',
            'INSERT INTO dbo.attachments (id, ticket_id, file_name, file_url, mime_type, size_bytes, is_internal, note_id, created_at) VALUES (@id, @ticket_id, @file_name, @file_url, @mime_type, @size_bytes, @is_internal, @note_id, SYSUTCDATETIME())',
            ['id' => $attachmentId, 'ticket_id' => $ticketId, 'file_name' => $fileName, 'file_url' => $normalizedFileUrl, 'mime_type' => $mimeType !== '' ? $mimeType : 'application/octet-stream', 'size_bytes' => $sizeBytes, 'is_internal' => $isInternal, 'note_id' => ticket_is_uuid($noteId) ? $noteId : null]
        ),
        sqlserver_command(
            'nonquery',
            'UPDATE dbo.tickets SET last_update_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @id',
            ['id' => $ticketId]
        ),
    ];
    $actionCommand = ticket_action_command([
        'ticket_id' => $ticketId,
        'action_type' => 'attachment_added',
        'action' => 'Attachment Added',
        'description' => 'Uploaded file: ' . ticket_substr($fileName, 0, 200),
        'handler_id' => trim((string)($handler['id'] ?? '')) ?: null,
        'handler_name' => $performedBy,
        'handler_email' => trim((string)($handler['email'] ?? '')) ?: null,
        'performed_by' => $performedBy,
    ], $settings);
    if ($actionCommand) $commands[] = $actionCommand;

    $attachmentIndex = count($commands);
    $commands[] = sqlserver_command('query', 'SELECT TOP 1 * FROM dbo.attachments WHERE id = @id', ['id' => $attachmentId]);
    $ticketIndex = count($commands);
    $commands[] = ticket_ticket_with_handler_command($ticketId);
    $ticketHandlersIndex = count($commands);
    $commands[] = ticket_ticket_handlers_command($ticketId);

    $results = sqlserver_run_commands($commands, true);
    $attachmentRow = sqlserver_result_rows($results, $attachmentIndex)[0] ?? null;
    if (is_array($attachmentRow)) $attachmentRow = attachment_security_public_row($attachmentRow, 'handler');
    $ticket = ticket_with_handlers_from_results($results, $ticketIndex, $ticketHandlersIndex);
    if ((string)($ticket['status_code'] ?? '') !== (string)($ticketBeforeUpload['status_code'] ?? '')) {
        throw new Exception('Attachment upload unexpectedly changed ticket status');
    }
    api_json(200, true, 'Attachment added', ['attachment' => $attachmentRow, 'performed_by' => $performedBy, 'ticket' => $ticket]);
}

function handle_handler_log_action(array $data): void {
    $ctx = ticket_require_active_handler_context(); $handler = $ctx['handler']; $settings = ticket_load_system_settings();
    $ticketId = trim((string)($data['ticket_id'] ?? '')); if (!ticket_is_uuid($ticketId)) api_json(400, false, 'ticket_id must be a valid UUID');
    ticket_enforce_handler_mutation_rate_limit('log_action', $handler, $ticketId);
    $actionType = trim((string)($data['action_type'] ?? '')); $action = trim((string)($data['action_label'] ?? $data['log_action'] ?? $data['action_text'] ?? $data['action'] ?? '')); $description = trim((string)($data['description'] ?? ''));
    if ($actionType === '' || ticket_strlen($actionType) > 80) api_json(400, false, 'action_type is required and must be <= 80 chars');
    if ($action === '' || ticket_strlen($action) > 255) api_json(400, false, 'action is required and must be <= 255 chars');
    if ($description !== '' && ticket_strlen($description) > 4000) api_json(400, false, 'description must be <= 4000 chars');
    try {
        ticket_insert_action(['ticket_id' => $ticketId, 'action_type' => $actionType, 'action' => $action, 'description' => $description !== '' ? $description : null, 'handler_id' => trim((string)($handler['id'] ?? '')) ?: null, 'handler_name' => trim((string)($data['handler_name'] ?? $handler['name'] ?? 'System')) ?: 'System', 'handler_email' => trim((string)($handler['email'] ?? '')) ?: null, 'performed_by' => trim((string)($handler['name'] ?? '')) ?: 'System'], $settings);
        $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.ticket_actions WHERE ticket_id = @ticket_id ORDER BY created_at DESC', ['ticket_id' => $ticketId]);
        $row = $rows[0] ?? null;
        if (is_array($row)) $row = ticket_crypto_decrypt_action_row($row);
        api_json(200, true, 'Action logged', ['ticket_action' => $row]);
    } catch (Throwable $e) {
        $errorId = api_log_exception('tickets.api.log_action', $e, ['action' => 'handler_log_action', 'ticket_id' => $ticketId, 'action_type' => $actionType]);
        api_json(200, true, 'Action log skipped', ['ticket_action' => null, 'skipped' => true, 'error_id' => $errorId]);
    }
}

function handle_handler_set_ticket_handler_role(array $data): void {
    $ctx = ticket_require_active_handler_context(); $handler = $ctx['handler']; $settings = ticket_load_system_settings();
    $ticketId = trim((string)($data['ticket_id'] ?? '')); $handlerId = trim((string)($data['handler_id'] ?? '')); $role = strtolower(trim((string)($data['role'] ?? '')));
    if (!ticket_is_uuid($ticketId)) api_json(400, false, 'ticket_id must be a valid UUID'); if (!ticket_is_uuid($handlerId)) api_json(400, false, 'handler_id must be a valid UUID'); if (!in_array($role, ['primary','secondary','legal','observer'], true)) api_json(400, false, 'role must be one of: primary, secondary, legal, observer');
    ticket_enforce_handler_mutation_rate_limit('set_handler_role', $handler, $ticketId);
    $commands = [
        sqlserver_command(
            'nonquery',
            'IF @role = @primary_role
             BEGIN
                 UPDATE dbo.ticket_handlers
                 SET role = @next_role
                 WHERE ticket_id = @ticket_id
                   AND handler_id <> @handler_id
                   AND role = @current_role;
             END;

             MERGE dbo.ticket_handlers AS target
             USING (SELECT @ticket_id AS ticket_id, @handler_id AS handler_id) AS source
             ON target.ticket_id = source.ticket_id AND target.handler_id = source.handler_id
             WHEN MATCHED THEN
                 UPDATE SET
                     role = @role,
                     assigned_at = ISNULL(target.assigned_at, SYSUTCDATETIME())
             WHEN NOT MATCHED THEN
                 INSERT (ticket_id, handler_id, role, assigned_at, created_at)
                 VALUES (@ticket_id, @handler_id, @role, SYSUTCDATETIME(), SYSUTCDATETIME());

             IF @role = @primary_role
             BEGIN
                 UPDATE dbo.tickets
                 SET handler_id = @handler_id, last_update_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME()
                 WHERE id = @ticket_id;
             END;',
            [
                'ticket_id' => $ticketId,
                'handler_id' => $handlerId,
                'role' => $role,
                'primary_role' => 'primary',
                'next_role' => 'secondary',
                'current_role' => 'primary',
            ]
        ),
    ];
    $actionCommand = ticket_action_command([
        'ticket_id' => $ticketId,
        'action_type' => 'assignment_role_updated',
        'action' => 'Assignment Role Updated',
        'description' => sprintf('Updated assignment role for handler %s to %s', $handlerId, $role),
        'handler_id' => trim((string)($handler['id'] ?? '')) ?: null,
        'handler_name' => trim((string)($handler['name'] ?? '')) ?: 'System',
        'handler_email' => trim((string)($handler['email'] ?? '')) ?: null,
        'performed_by' => trim((string)($handler['name'] ?? '')) ?: 'System',
    ], $settings);
    if ($actionCommand) $commands[] = $actionCommand;

    $ticketHandlerIndex = count($commands);
    $commands[] = sqlserver_command('query', 'SELECT TOP 1 * FROM dbo.ticket_handlers WHERE ticket_id = @ticket_id AND handler_id = @handler_id', ['ticket_id' => $ticketId, 'handler_id' => $handlerId]);
    $ticketIndex = count($commands);
    $commands[] = ticket_ticket_with_handler_command($ticketId);
    $ticketHandlersIndex = count($commands);
    $commands[] = ticket_ticket_handlers_command($ticketId);

    $results = sqlserver_run_commands($commands, true);
    $ticketHandlerRow = sqlserver_result_rows($results, $ticketHandlerIndex)[0] ?? null;
    $ticket = ticket_with_handlers_from_results($results, $ticketIndex, $ticketHandlersIndex);
    api_json(200, true, 'Ticket handler role updated', ['ticket_handler' => $ticketHandlerRow, 'ticket' => $ticket]);
}

$ticketApiAction = 'unknown';
$ticketApiStage = 'bootstrap';
$ticketApiData = [];

try {
    $ticketApiStage = 'load_env';
    load_runtime_env(__DIR__);
    $ticketApiStage = 'check_sql_config';
    if (!sqlserver_is_configured()) throw new Exception('SQL Server is not configured');
    $ticketApiStage = 'ensure_schema';
    ticket_ensure_runtime_schema();
    $ticketApiStage = 'check_method';
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') api_json(405, false, 'Method not allowed');
    $ticketApiStage = 'parse_body';
    $data = json_decode(file_get_contents('php://input') ?: '', true); if (!is_array($data)) $data = [];
    $action = strtolower(trim((string)($data['action'] ?? 'create')));
    $ticketApiData = $data;
    $ticketApiAction = $action !== '' ? $action : 'create';
    $ticketApiStage = 'dispatch_' . $ticketApiAction;
    switch ($action) {
        case 'create': handle_create($data); break;
        case 'access': handle_access($data); break;
        case 'message': handle_reporter_message($data); break;
        case 'handler_update_ticket': handle_handler_update_ticket($data); break;
        case 'handler_add_comment': handle_handler_add_comment($data); break;
        case 'handler_update_comment': handle_handler_update_comment($data); break;
        case 'handler_add_message': handle_handler_add_message($data); break;
        case 'handler_reset_access_code': handle_handler_reset_access_code($data); break;
        case 'reporter_add_attachment': handle_reporter_add_attachment($data); break;
        case 'handler_add_attachment': handle_handler_add_attachment($data); break;
        case 'handler_log_action': handle_handler_log_action($data); break;
        case 'handler_set_ticket_handler_role': handle_handler_set_ticket_handler_role($data); break;
        default: api_json(400, false, 'Unsupported action');
    }
} catch (Throwable $e) {
    $ticketId = is_array($ticketApiData) ? trim((string)($ticketApiData['ticket_id'] ?? $ticketApiData['ticketId'] ?? '')) : '';
    $errorId = api_log_exception('tickets.api', $e, [
        'action' => $ticketApiAction,
        'stage' => $ticketApiStage,
        'ticket_id' => ticket_is_uuid($ticketId) ? $ticketId : null,
    ]);
    api_json(500, false, 'Internal server error', ['error_id' => $errorId, 'action' => $ticketApiAction, 'stage' => $ticketApiStage]);
}
