<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_auth0.php';
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
function ticket_load_system_settings(): array {
    static $cache = null; if (is_array($cache)) return $cache; $cache = [];
    foreach (sqlserver_query('SELECT setting_key, setting_value FROM dbo.system_settings ORDER BY setting_key ASC') as $row) {
        $key = trim((string)($row['setting_key'] ?? '')); if ($key === '') continue;
        $cache[$key] = ticket_setting_unwrap_value(ticket_parse_json($row['setting_value'] ?? null, $row['setting_value'] ?? null));
    }
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
function ticket_reply_token_expiry_iso(): string { $days = max(1, (int)(getenv('REPORTER_REPLY_TOKEN_TTL_DAYS') ?: 365)); return gmdate('c', time() + ($days * 86400)); }
function ticket_handler_message_visible_at(bool $isInternal, string $sender): string { return ($isInternal || $sender !== 'handler') ? gmdate('c') : gmdate('c', time() + random_int(HANDLER_REPLY_DELAY_MIN_SECONDS, HANDLER_REPLY_DELAY_MAX_SECONDS)); }

function ticket_download_url(?string $raw): ?string {
    $value = trim((string)$raw);
    if ($value === '' || preg_match('#^https?://#i', $value) === 1) return $value !== '' ? $value : null;
    return '/api/files.api.php?action=download&path=' . rawurlencode(ltrim($value, '/'));
}

function ticket_load_workflow_status_rows(string $workflowType): array {
    if (trim($workflowType) === '') return [];
    $rows = sqlserver_query(
        'SELECT ws.* FROM dbo.workflow_statuses ws INNER JOIN dbo.workflows w ON w.id = ws.workflow_id WHERE w.code = @code ORDER BY ws.sort_order ASC, ws.label ASC',
        ['code' => $workflowType]
    );
    return array_map(static function (array $row): array { $row['next_codes'] = ticket_parse_json($row['next_codes'] ?? null, []); return $row; }, $rows);
}

function ticket_load_ticket_row_by_id(string $ticketId): ?array {
    $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.tickets WHERE id = @id', ['id' => $ticketId]);
    $row = $rows[0] ?? null; if (!$row) return null; $row['metadata'] = ticket_parse_json($row['metadata'] ?? null, []); return $row;
}

function ticket_load_relations(string $ticketId): array {
    return [
        'attachments' => sqlserver_query('SELECT * FROM dbo.attachments WHERE ticket_id = @ticket_id ORDER BY created_at ASC', ['ticket_id' => $ticketId]),
        'messages' => sqlserver_query('SELECT * FROM dbo.messages WHERE ticket_id = @ticket_id ORDER BY created_at ASC', ['ticket_id' => $ticketId]),
        'ticket_actions' => sqlserver_query('SELECT * FROM dbo.ticket_actions WHERE ticket_id = @ticket_id ORDER BY created_at DESC', ['ticket_id' => $ticketId]),
        'ticket_comments' => sqlserver_query('SELECT * FROM dbo.ticket_comments WHERE ticket_id = @ticket_id ORDER BY created_at ASC', ['ticket_id' => $ticketId]),
    ];
}

function ticket_load_ticket_by_credentials(string $ticketInput, string $accessCode): ?array {
    $meta = normalize_ticket_input($ticketInput);
    if (!$meta['ok'] || $accessCode === '') return null;
    $sql = $meta['is_uuid']
        ? 'SELECT TOP 1 * FROM dbo.tickets WHERE id = @ticket_value AND access_code = @access_code'
        : 'SELECT TOP 1 * FROM dbo.tickets WHERE ticket_number = @ticket_value AND access_code = @access_code';
    $rows = sqlserver_query($sql, ['ticket_value' => $meta['value'], 'access_code' => $accessCode]);
    $ticket = $rows[0] ?? null;
    if (!$ticket) return null;
    $ticket['metadata'] = ticket_parse_json($ticket['metadata'] ?? null, []);
    $ticket = array_merge($ticket, ticket_load_relations((string)$ticket['id']));
    return $ticket;
}

function ticket_sanitize_reporter_ticket(array $ticket, array $settings): array {
    unset($ticket['access_code'], $ticket['reporter_email'], $ticket['reporter_email_encrypted'], $ticket['reporter_email_hash']);
    $statusCode = strtolower(trim((string)($ticket['status_code'] ?? '')));
    if (ticket_setting_bool($settings, ['compliance.anonymize_closed_tickets'], false) && in_array($statusCode, ['closed', 'gesloten', 'resolved', 'opgelost'], true)) {
        $ticket['reporter_name'] = null; $ticket['reporter_phone'] = null;
        if (is_array($ticket['metadata'] ?? null)) unset($ticket['metadata']['reporter_meta_client']);
    }
    $nowTs = time();
    $ticket['attachments'] = array_values(array_filter(array_map(static function ($att) {
        if (!is_array($att) || !empty($att['is_internal']) || !empty($att['note_id'])) return null;
        $att['file_url'] = ticket_download_url($att['file_url'] ?? null);
        return $att;
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

function ticket_insert_action(array $payload, array $settings): void {
    if (!ticket_action_logging_enabled($settings)) return;
    sqlserver_execute(
        'INSERT INTO dbo.ticket_actions (ticket_id, action_type, action, description, handler_id, handler_name, handler_email, performed_by, created_at)
         VALUES (@ticket_id, @action_type, @action, @description, @handler_id, @handler_name, @handler_email, @performed_by, COALESCE(@created_at, SYSUTCDATETIME()))',
        [
            'ticket_id' => $payload['ticket_id'] ?? null,
            'action_type' => $payload['action_type'] ?? null,
            'action' => $payload['action'] ?? null,
            'description' => $payload['description'] ?? null,
            'handler_id' => $payload['handler_id'] ?? null,
            'handler_name' => $payload['handler_name'] ?? null,
            'handler_email' => $payload['handler_email'] ?? null,
            'performed_by' => $payload['performed_by'] ?? null,
            'created_at' => $payload['created_at'] ?? null,
        ]
    );
}

function ticket_try_auto_assign_handler(string $ticketId, string $workflowType): ?array {
    $rows = sqlserver_query(
        'SELECT TOP 1 h.* FROM dbo.handler_workflows hw INNER JOIN dbo.workflows w ON w.id = hw.workflow_id INNER JOIN dbo.handlers h ON h.id = hw.handler_id WHERE w.code = @code AND h.active = @active ORDER BY h.name ASC',
        ['code' => $workflowType, 'active' => true]
    );
    $handler = $rows[0] ?? null;
    if (!$handler) return null;
    $handlerId = trim((string)($handler['id'] ?? ''));
    if (!ticket_is_uuid($handlerId)) return null;
    sqlserver_execute('UPDATE dbo.tickets SET handler_id = @handler_id, last_update_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @id', ['handler_id' => $handlerId, 'id' => $ticketId]);
    sqlserver_execute('DELETE FROM dbo.ticket_handlers WHERE ticket_id = @ticket_id AND role = @role AND handler_id <> @handler_id', ['ticket_id' => $ticketId, 'role' => 'primary', 'handler_id' => $handlerId]);
    $existing = sqlserver_scalar('SELECT TOP 1 id FROM dbo.ticket_handlers WHERE ticket_id = @ticket_id AND handler_id = @handler_id', ['ticket_id' => $ticketId, 'handler_id' => $handlerId]);
    if ($existing) sqlserver_execute('UPDATE dbo.ticket_handlers SET role = @role, assigned_at = COALESCE(assigned_at, SYSUTCDATETIME()) WHERE id = @id', ['role' => 'primary', 'id' => $existing]);
    else sqlserver_execute('INSERT INTO dbo.ticket_handlers (ticket_id, handler_id, role, assigned_at, created_at) VALUES (@ticket_id, @handler_id, @role, SYSUTCDATETIME(), SYSUTCDATETIME())', ['ticket_id' => $ticketId, 'handler_id' => $handlerId, 'role' => 'primary']);
    return $handler;
}

function ticket_create_reply_token(string $ticketId): ?string {
    $token = ticket_generate_secure_token(); $expiresAt = ticket_reply_token_expiry_iso();
    sqlserver_execute('INSERT INTO dbo.ticket_reply_tokens (ticket_id, token, expires_at, created_at) VALUES (@ticket_id, @token, @expires_at, SYSUTCDATETIME())', ['ticket_id' => $ticketId, 'token' => $token, 'expires_at' => $expiresAt]);
    return $token;
}

function handle_create(array $data): void {
    ticket_enforce_request_rate_limit('create', (string)($data['workflow_type'] ?? 'new'));
    $settings = ticket_load_system_settings();
    if (!ticket_setting_bool($settings, ['tickets.allow_public_submission', 'portal.enable_public_submissions'], true)) api_json(403, false, 'Public submissions are disabled by system policy');
    $email = trim((string)($data['reporter_email'] ?? '')); $isAnonymous = !empty($data['is_anonymous']);
    if (ticket_setting_bool($settings, ['tickets.require_email_verification'], true) && $email === '') throw new Exception('reporter_email is required by system policy');
    $severityCode = ticket_normalize_severity((string)($data['severity_code'] ?? ''), ticket_normalize_severity(ticket_setting_string($settings, ['tickets.default_priority', 'workflow.default_priority', 'portal.default_priority'], 'low'), 'low'));
    $workflowType = trim((string)($data['workflow_type'] ?? ''));
    $payload = [
        'id' => ticket_uuid4(),
        'ticket_number' => trim((string)($data['ticket_number'] ?? '')) ?: ticket_generate_ticket_number(ticket_sanitize_prefix(ticket_setting_string($settings, ['tickets.ticket_number_prefix'], 'NZ'), 'NZ')),
        'access_code' => normalize_access_code($data['access_code'] ?? '') ?: ticket_generate_access_code(),
        'description' => $data['description'] ?? null,
        'location' => $data['location'] ?? null,
        'workflow_type' => $workflowType,
        'severity_code' => $severityCode,
        'reporter_name' => $data['reporter_name'] ?? null,
        'reporter_phone' => $data['reporter_phone'] ?? null,
        'email_notify' => $email !== '' ? !empty($data['email_notify']) : false,
        'status_email_notify' => array_key_exists('status_email_notify', $data) ? ($email !== '' ? !empty($data['status_email_notify']) : false) : ($email !== ''),
        'status_code' => $data['status_code'] ?? null,
        'current_stage' => $data['current_stage'] ?? null,
        'metadata' => json_encode(is_array($data['metadata'] ?? null) ? $data['metadata'] : [], JSON_UNESCAPED_UNICODE),
        'reporter_email' => ($isAnonymous || $email === '') ? null : $email,
        'reporter_email_encrypted' => $email ? encrypt_email($email, get_email_crypto_key()) : null,
        'reporter_email_hash' => $email ? hash_email($email) : null,
        'next_step_due' => $data['next_step_due'] ?? null,
        'is_anonymous' => $isAnonymous,
    ];
    sqlserver_execute(
        'INSERT INTO dbo.tickets (id, ticket_number, access_code, description, location, workflow_type, severity_code, reporter_name, reporter_phone, email_notify, status_email_notify, status_code, current_stage, metadata, reporter_email, reporter_email_encrypted, reporter_email_hash, next_step_due, is_anonymous, submitted_at, created_at, updated_at)
         VALUES (@id, @ticket_number, @access_code, @description, @location, @workflow_type, @severity_code, @reporter_name, @reporter_phone, @email_notify, @status_email_notify, @status_code, @current_stage, @metadata, @reporter_email, @reporter_email_encrypted, @reporter_email_hash, @next_step_due, @is_anonymous, SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME())',
        $payload
    );
    $row = ticket_load_ticket_row_by_id((string)$payload['id']); if (!$row) throw new Exception('Ticket create failed');
    if (ticket_setting_bool_for_workflow($settings, $workflowType, ['tickets.auto_assign_enabled', 'workflow.auto_assign'], true)) {
        $assigned = ticket_try_auto_assign_handler((string)$payload['id'], $workflowType); if ($assigned) $row['handler_id'] = $assigned['id'] ?? null;
    }
    try { $replyToken = ticket_create_reply_token((string)$payload['id']); $row['reply_token'] = $replyToken; $row['reply_url_path'] = '/reply/' . rawurlencode($replyToken); $row['reply_expires_at'] = ticket_reply_token_expiry_iso(); } catch (Throwable $e) {}
    api_json(200, true, 'Ticket created', $row);
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
    $ticket = ticket_load_ticket_by_credentials($ticketInput, $accessCode);
    if (!$ticket) { ticket_register_failed_auth_attempt($ticketInput); usleep(random_int(150000, 350000)); api_json(401, false, 'Invalid ticket ID or access code'); }
    ticket_reset_failed_auth_attempts($ticketInput);
    $ticketId = (string)($ticket['id'] ?? ''); if (!ticket_is_uuid($ticketId)) throw new Exception('Ticket lookup returned invalid data');
    sqlserver_execute('INSERT INTO dbo.messages (ticket_id, sender, body, is_internal, visible_at, created_at) VALUES (@ticket_id, @sender, @body, @is_internal, SYSUTCDATETIME(), SYSUTCDATETIME())', ['ticket_id' => $ticketId, 'sender' => 'reporter', 'body' => $body, 'is_internal' => false]);
    sqlserver_execute('UPDATE dbo.tickets SET last_update_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @id', ['id' => $ticketId]);
    $messageRows = sqlserver_query('SELECT TOP 1 * FROM dbo.messages WHERE ticket_id = @ticket_id ORDER BY created_at DESC', ['ticket_id' => $ticketId]);
    try { ticket_insert_action(['ticket_id' => $ticketId, 'action_type' => 'message_sent', 'action' => 'Message Sent', 'description' => 'Reporter sent a message', 'performed_by' => trim((string)($ticket['reporter_name'] ?? '')) ?: 'Reporter'], ticket_load_system_settings()); } catch (Throwable $e) {}
    api_json(200, true, 'Message sent', ['message' => $messageRows[0] ?? null, 'ticket' => ticket_sanitize_reporter_ticket(ticket_load_ticket_by_credentials($ticketInput, $accessCode) ?: $ticket, ticket_load_system_settings())]);
}

function handle_handler_update_ticket(array $data): void {
    $ctx = ticket_require_active_handler_context(); $handler = $ctx['handler'];
    $ticketId = trim((string)($data['ticket_id'] ?? '')); if (!ticket_is_uuid($ticketId)) api_json(400, false, 'ticket_id must be a valid UUID');
    ticket_enforce_handler_mutation_rate_limit('update_ticket', $handler, $ticketId);
    $updates = is_array($data['updates'] ?? null) ? $data['updates'] : [];
    $allowed = ['description','location','workflow_type','severity_code','reporter_name','reporter_phone','email_notify','status_email_notify','status_code','current_stage','metadata','handler_id','next_step_due','last_update_at','location_id'];
    $sets = ['updated_at = SYSUTCDATETIME()']; $params = ['id' => $ticketId];
    foreach ($allowed as $field) {
        if (!array_key_exists($field, $updates)) continue;
        $sets[] = $field . ' = @' . $field;
        $params[$field] = $field === 'metadata' ? json_encode(is_array($updates[$field]) ? $updates[$field] : [], JSON_UNESCAPED_UNICODE) : $updates[$field];
    }
    if (count($sets) === 1) api_json(400, false, 'No valid ticket fields to update');
    sqlserver_execute('UPDATE dbo.tickets SET ' . implode(', ', $sets) . ' WHERE id = @id', $params);
    api_json(200, true, 'Ticket updated', ['ticket' => ticket_load_ticket_row_by_id($ticketId)]);
}

function handle_handler_add_comment(array $data): void {
    $ctx = ticket_require_active_handler_context(); $handler = $ctx['handler']; $settings = ticket_load_system_settings();
    $ticketId = trim((string)($data['ticket_id'] ?? '')); $comment = trim((string)($data['comment'] ?? ''));
    if (!ticket_is_uuid($ticketId)) api_json(400, false, 'ticket_id must be a valid UUID');
    if ($comment === '') api_json(400, false, 'comment is required');
    if (ticket_strlen($comment) > 4000) api_json(400, false, 'comment exceeds 4000 characters');
    ticket_enforce_handler_mutation_rate_limit('add_comment', $handler, $ticketId);
    $performedBy = trim((string)($data['author_name'] ?? $handler['name'] ?? '')) ?: 'System';
    sqlserver_execute('INSERT INTO dbo.ticket_comments (ticket_id, comment, author_name, created_at, updated_at) VALUES (@ticket_id, @comment, @author_name, SYSUTCDATETIME(), SYSUTCDATETIME())', ['ticket_id' => $ticketId, 'comment' => $comment, 'author_name' => $performedBy]);
    $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.ticket_comments WHERE ticket_id = @ticket_id ORDER BY created_at DESC', ['ticket_id' => $ticketId]);
    sqlserver_execute('UPDATE dbo.tickets SET last_update_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @id', ['id' => $ticketId]);
    try { ticket_insert_action(['ticket_id' => $ticketId, 'action_type' => 'note_added', 'action' => 'Note Added', 'description' => 'Added investigation note: ' . ticket_substr($comment, 0, 100) . '...', 'handler_id' => trim((string)($handler['id'] ?? '')) ?: null, 'handler_name' => $performedBy, 'handler_email' => trim((string)($handler['email'] ?? '')) ?: null, 'performed_by' => $performedBy], $settings); } catch (Throwable $e) {}
    api_json(200, true, 'Comment added', ['comment' => $rows[0] ?? null, 'performed_by' => $performedBy]);
}

function handle_handler_add_message(array $data): void {
    $ctx = ticket_require_active_handler_context(); $handler = $ctx['handler']; $settings = ticket_load_system_settings();
    $ticketId = trim((string)($data['ticket_id'] ?? '')); if (!ticket_is_uuid($ticketId)) api_json(400, false, 'ticket_id must be a valid UUID');
    ticket_enforce_handler_mutation_rate_limit('add_message', $handler, $ticketId);
    $sender = strtolower(trim((string)($data['sender'] ?? 'handler'))); $body = trim((string)($data['body'] ?? ''));
    if ($sender === '') api_json(400, false, 'sender is required'); if ($body === '') api_json(400, false, 'body is required'); if (ticket_strlen($body) > 4000) api_json(400, false, 'body exceeds 4000 characters');
    $isInternal = !empty($data['is_internal']); $publicName = ($sender === 'handler' && !empty($data['disclose_handler_identity'])) ? (trim((string)($handler['name'] ?? '')) ?: 'System') : null;
    $performedBy = trim((string)($handler['name'] ?? '')) ?: 'System';
    sqlserver_execute(
        'INSERT INTO dbo.messages (ticket_id, sender, body, is_internal, visible_at, created_at, handler_id, handler_name)
         VALUES (@ticket_id, @sender, @body, @is_internal, @visible_at, SYSUTCDATETIME(), @handler_id, @handler_name)',
        ['ticket_id' => $ticketId, 'sender' => $sender, 'body' => $body, 'is_internal' => $isInternal, 'visible_at' => ticket_handler_message_visible_at($isInternal, $sender), 'handler_id' => trim((string)($handler['id'] ?? '')) ?: null, 'handler_name' => $publicName]
    );
    sqlserver_execute('UPDATE dbo.tickets SET last_update_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @id', ['id' => $ticketId]);
    $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.messages WHERE ticket_id = @ticket_id ORDER BY created_at DESC', ['ticket_id' => $ticketId]);
    try { ticket_insert_action(['ticket_id' => $ticketId, 'action_type' => 'message_sent', 'action' => 'Message Sent', 'description' => 'Sent message: ' . ticket_substr($body, 0, 100) . '...', 'handler_id' => trim((string)($handler['id'] ?? '')) ?: null, 'handler_name' => $performedBy, 'handler_email' => trim((string)($handler['email'] ?? '')) ?: null, 'performed_by' => $performedBy], $settings); } catch (Throwable $e) {}
    api_json(200, true, 'Message added', ['message' => $rows[0] ?? null, 'performed_by' => $performedBy, 'public_handler_name' => $publicName]);
}

function handle_reporter_add_attachment(array $data): void {
    api_apply_no_store_headers(); $settings = ticket_load_system_settings();
    $ticketInput = (string)($data['ticket_input'] ?? $data['ticket_number'] ?? $data['ticket_id'] ?? ''); $accessCode = normalize_access_code($data['access_code'] ?? '');
    $fileName = trim((string)($data['file_name'] ?? '')); $fileUrl = trim((string)($data['file_url'] ?? '')); $mimeType = trim((string)($data['mime_type'] ?? 'application/octet-stream')); $sizeBytes = isset($data['size_bytes']) ? (int)$data['size_bytes'] : null;
    if ($ticketInput === '' || $accessCode === '') api_json(400, false, 'ticket_input and a valid 6-digit access_code are required');
    if ($fileName === '' || ticket_strlen($fileName) > 255) api_json(400, false, 'file_name is required and must be <= 255 chars');
    if ($fileUrl === '') api_json(400, false, 'file_url is required');
    ticket_validate_attachment_policy($settings, $fileName, $sizeBytes); ticket_enforce_request_rate_limit('attachment', $ticketInput);
    $ticket = ticket_load_ticket_by_credentials($ticketInput, $accessCode);
    if (!$ticket) { ticket_register_failed_auth_attempt($ticketInput); usleep(random_int(150000, 350000)); api_json(401, false, 'Invalid ticket ID or access code'); }
    ticket_reset_failed_auth_attempts($ticketInput);
    $ticketId = trim((string)($ticket['id'] ?? '')); if (!ticket_is_uuid($ticketId)) throw new Exception('Ticket lookup returned invalid data');
    sqlserver_execute('INSERT INTO dbo.attachments (ticket_id, file_name, file_url, mime_type, size_bytes, is_internal, note_id, created_at) VALUES (@ticket_id, @file_name, @file_url, @mime_type, @size_bytes, @is_internal, @note_id, SYSUTCDATETIME())', ['ticket_id' => $ticketId, 'file_name' => $fileName, 'file_url' => $fileUrl, 'mime_type' => $mimeType !== '' ? $mimeType : 'application/octet-stream', 'size_bytes' => $sizeBytes, 'is_internal' => false, 'note_id' => null]);
    sqlserver_execute('UPDATE dbo.tickets SET last_update_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @id', ['id' => $ticketId]);
    $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.attachments WHERE ticket_id = @ticket_id ORDER BY created_at DESC', ['ticket_id' => $ticketId]);
    try { ticket_insert_action(['ticket_id' => $ticketId, 'action_type' => 'attachment_added', 'action' => 'Attachment Added', 'description' => 'Reporter uploaded file: ' . ticket_substr($fileName, 0, 200), 'performed_by' => trim((string)($ticket['reporter_name'] ?? '')) ?: 'Reporter'], $settings); } catch (Throwable $e) {}
    api_json(200, true, 'Attachment added', ['attachment' => $rows[0] ?? null]);
}

function handle_handler_add_attachment(array $data): void {
    $ctx = ticket_require_active_handler_context(); $handler = $ctx['handler']; $settings = ticket_load_system_settings();
    $ticketId = trim((string)($data['ticket_id'] ?? '')); if (!ticket_is_uuid($ticketId)) api_json(400, false, 'ticket_id must be a valid UUID');
    ticket_enforce_handler_mutation_rate_limit('add_attachment', $handler, $ticketId);
    $fileName = trim((string)($data['file_name'] ?? '')); $fileUrl = trim((string)($data['file_url'] ?? '')); $mimeType = trim((string)($data['mime_type'] ?? 'application/octet-stream')); $sizeBytes = isset($data['size_bytes']) ? (int)$data['size_bytes'] : null; $isInternal = !empty($data['is_internal']); $noteId = trim((string)($data['note_id'] ?? ''));
    if ($fileName === '' || ticket_strlen($fileName) > 255) api_json(400, false, 'file_name is required and must be <= 255 chars'); if ($fileUrl === '') api_json(400, false, 'file_url is required');
    ticket_validate_attachment_policy($settings, $fileName, $sizeBytes);
    sqlserver_execute('INSERT INTO dbo.attachments (ticket_id, file_name, file_url, mime_type, size_bytes, is_internal, note_id, created_at) VALUES (@ticket_id, @file_name, @file_url, @mime_type, @size_bytes, @is_internal, @note_id, SYSUTCDATETIME())', ['ticket_id' => $ticketId, 'file_name' => $fileName, 'file_url' => $fileUrl, 'mime_type' => $mimeType !== '' ? $mimeType : 'application/octet-stream', 'size_bytes' => $sizeBytes, 'is_internal' => $isInternal, 'note_id' => ticket_is_uuid($noteId) ? $noteId : null]);
    sqlserver_execute('UPDATE dbo.tickets SET last_update_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @id', ['id' => $ticketId]);
    $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.attachments WHERE ticket_id = @ticket_id ORDER BY created_at DESC', ['ticket_id' => $ticketId]);
    try { ticket_insert_action(['ticket_id' => $ticketId, 'action_type' => 'attachment_added', 'action' => 'Attachment Added', 'description' => 'Uploaded file: ' . ticket_substr($fileName, 0, 200), 'handler_id' => trim((string)($handler['id'] ?? '')) ?: null, 'handler_name' => trim((string)($handler['name'] ?? '')) ?: 'System', 'handler_email' => trim((string)($handler['email'] ?? '')) ?: null, 'performed_by' => trim((string)($handler['name'] ?? '')) ?: 'System'], $settings); } catch (Throwable $e) {}
    api_json(200, true, 'Attachment added', ['attachment' => $rows[0] ?? null, 'performed_by' => trim((string)($handler['name'] ?? '')) ?: 'System']);
}

function handle_handler_log_action(array $data): void {
    $ctx = ticket_require_active_handler_context(); $handler = $ctx['handler']; $settings = ticket_load_system_settings();
    $ticketId = trim((string)($data['ticket_id'] ?? '')); if (!ticket_is_uuid($ticketId)) api_json(400, false, 'ticket_id must be a valid UUID');
    ticket_enforce_handler_mutation_rate_limit('log_action', $handler, $ticketId);
    $actionType = trim((string)($data['action_type'] ?? '')); $action = trim((string)($data['action_label'] ?? $data['log_action'] ?? $data['action_text'] ?? $data['action'] ?? '')); $description = trim((string)($data['description'] ?? ''));
    if ($actionType === '' || ticket_strlen($actionType) > 80) api_json(400, false, 'action_type is required and must be <= 80 chars');
    if ($action === '' || ticket_strlen($action) > 255) api_json(400, false, 'action is required and must be <= 255 chars');
    if ($description !== '' && ticket_strlen($description) > 4000) api_json(400, false, 'description must be <= 4000 chars');
    ticket_insert_action(['ticket_id' => $ticketId, 'action_type' => $actionType, 'action' => $action, 'description' => $description !== '' ? $description : null, 'handler_id' => trim((string)($handler['id'] ?? '')) ?: null, 'handler_name' => trim((string)($data['handler_name'] ?? $handler['name'] ?? 'System')) ?: 'System', 'handler_email' => trim((string)($handler['email'] ?? '')) ?: null, 'performed_by' => trim((string)($handler['name'] ?? '')) ?: 'System', 'created_at' => gmdate('c')], $settings);
    $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.ticket_actions WHERE ticket_id = @ticket_id ORDER BY created_at DESC', ['ticket_id' => $ticketId]);
    api_json(200, true, 'Action logged', ['ticket_action' => $rows[0] ?? null]);
}

function handle_handler_set_ticket_handler_role(array $data): void {
    $ctx = ticket_require_active_handler_context(); $handler = $ctx['handler']; $settings = ticket_load_system_settings();
    $ticketId = trim((string)($data['ticket_id'] ?? '')); $handlerId = trim((string)($data['handler_id'] ?? '')); $role = strtolower(trim((string)($data['role'] ?? '')));
    if (!ticket_is_uuid($ticketId)) api_json(400, false, 'ticket_id must be a valid UUID'); if (!ticket_is_uuid($handlerId)) api_json(400, false, 'handler_id must be a valid UUID'); if (!in_array($role, ['primary','secondary','legal','observer'], true)) api_json(400, false, 'role must be one of: primary, secondary, legal, observer');
    ticket_enforce_handler_mutation_rate_limit('set_handler_role', $handler, $ticketId);
    if ($role === 'primary') sqlserver_execute('UPDATE dbo.ticket_handlers SET role = @next_role WHERE ticket_id = @ticket_id AND handler_id <> @handler_id AND role = @current_role', ['next_role' => 'secondary', 'ticket_id' => $ticketId, 'handler_id' => $handlerId, 'current_role' => 'primary']);
    $existing = sqlserver_scalar('SELECT TOP 1 id FROM dbo.ticket_handlers WHERE ticket_id = @ticket_id AND handler_id = @handler_id', ['ticket_id' => $ticketId, 'handler_id' => $handlerId]);
    if ($existing) sqlserver_execute('UPDATE dbo.ticket_handlers SET role = @role, assigned_at = COALESCE(assigned_at, SYSUTCDATETIME()) WHERE id = @id', ['role' => $role, 'id' => $existing]);
    else sqlserver_execute('INSERT INTO dbo.ticket_handlers (ticket_id, handler_id, role, assigned_at, created_at) VALUES (@ticket_id, @handler_id, @role, SYSUTCDATETIME(), SYSUTCDATETIME())', ['ticket_id' => $ticketId, 'handler_id' => $handlerId, 'role' => $role]);
    if ($role === 'primary') sqlserver_execute('UPDATE dbo.tickets SET handler_id = @handler_id, last_update_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @id', ['handler_id' => $handlerId, 'id' => $ticketId]);
    try { ticket_insert_action(['ticket_id' => $ticketId, 'action_type' => 'assignment_role_updated', 'action' => 'Assignment Role Updated', 'description' => sprintf('Updated assignment role for handler %s to %s', $handlerId, $role), 'handler_id' => trim((string)($handler['id'] ?? '')) ?: null, 'handler_name' => trim((string)($handler['name'] ?? '')) ?: 'System', 'handler_email' => trim((string)($handler['email'] ?? '')) ?: null, 'performed_by' => trim((string)($handler['name'] ?? '')) ?: 'System'], $settings); } catch (Throwable $e) {}
    $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.ticket_handlers WHERE ticket_id = @ticket_id AND handler_id = @handler_id', ['ticket_id' => $ticketId, 'handler_id' => $handlerId]);
    api_json(200, true, 'Ticket handler role updated', ['ticket_handler' => $rows[0] ?? null]);
}

try {
    load_runtime_env(__DIR__);
    if (!sqlserver_is_configured()) throw new Exception('SQL Server is not configured');
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') api_json(405, false, 'Method not allowed');
    $data = json_decode(file_get_contents('php://input') ?: '', true); if (!is_array($data)) $data = [];
    $action = strtolower(trim((string)($data['action'] ?? 'create')));
    switch ($action) {
        case 'create': handle_create($data); break;
        case 'access': handle_access($data); break;
        case 'message': handle_reporter_message($data); break;
        case 'handler_update_ticket': handle_handler_update_ticket($data); break;
        case 'handler_add_comment': handle_handler_add_comment($data); break;
        case 'handler_add_message': handle_handler_add_message($data); break;
        case 'reporter_add_attachment': handle_reporter_add_attachment($data); break;
        case 'handler_add_attachment': handle_handler_add_attachment($data); break;
        case 'handler_log_action': handle_handler_log_action($data); break;
        case 'handler_set_ticket_handler_role': handle_handler_set_ticket_handler_role($data); break;
        default: api_json(400, false, 'Unsupported action');
    }
} catch (Throwable $e) {
    $errorId = api_log_exception('tickets.api', $e);
    api_json(500, false, 'Internal server error', ['error_id' => $errorId]);
}
