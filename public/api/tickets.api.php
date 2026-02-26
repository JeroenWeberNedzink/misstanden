<?php
declare(strict_types=1);
/**
 * tickets.api.php
 * Supported actions (POST JSON):
 * - create  : create new ticket
 * - access  : reporter ticket lookup by ticket_input + access_code
 * - message : reporter posts message by ticket_input + access_code
 */

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_auth0.php';
require_once __DIR__ . '/_admin_auth.php';
require_once __DIR__ . '/_supabase.php';
require_once __DIR__ . '/_errors.php';
require_once __DIR__ . '/_security_headers.php';

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

const ATTACHMENT_SIGNED_URL_TTL_SECONDS = 120;

function api_json(int $status, bool $success, string $message, $data = null): void {
    http_response_code($status);
    echo json_encode(
        ['success' => $success, 'message' => $message, 'data' => $data],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

function api_strlen(string $value): int {
    if (function_exists('mb_strlen')) {
        return (int)mb_strlen($value, 'UTF-8');
    }
    return (int)strlen($value);
}

function api_substr(string $value, int $start, ?int $length = null): string {
    if (function_exists('mb_substr')) {
        return $length === null
            ? (string)mb_substr($value, $start, null, 'UTF-8')
            : (string)mb_substr($value, $start, $length, 'UTF-8');
    }
    return $length === null
        ? (string)substr($value, $start)
        : (string)substr($value, $start, $length);
}

function ticket_client_ip(): string {
    $candidates = [
        $_SERVER['HTTP_CF_CONNECTING_IP'] ?? null,
        $_SERVER['HTTP_X_FORWARDED_FOR'] ?? null,
        $_SERVER['REMOTE_ADDR'] ?? null,
    ];
    foreach ($candidates as $raw) {
        $value = trim((string)$raw);
        if ($value === '') {
            continue;
        }
        if (str_contains($value, ',')) {
            $parts = explode(',', $value);
            $value = trim((string)($parts[0] ?? ''));
        }
        if (filter_var($value, FILTER_VALIDATE_IP)) {
            return $value;
        }
    }
    return 'unknown';
}

function ticket_hash_scope_part(string $value): string {
    $salt = trim((string)(getenv('RATE_LIMIT_SALT') ?: ''));
    return hash('sha256', $salt . '|' . $value);
}

function ticket_client_fingerprint(): string {
    $ip = ticket_client_ip();
    $userAgent = strtolower(trim((string)($_SERVER['HTTP_USER_AGENT'] ?? '')));
    $userAgent = $userAgent !== '' ? substr($userAgent, 0, 160) : 'unknown';
    return ticket_hash_scope_part('client:' . $ip . '|ua:' . $userAgent);
}

function ticket_rate_limit_file(string $scope): string {
    $dir = __DIR__ . '/../../run/rate-limits';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir . '/' . hash('sha256', $scope) . '.json';
}

function ticket_rate_limit_state(string $scope): array {
    $file = ticket_rate_limit_file($scope);
    $fp = @fopen($file, 'c+');
    if (!$fp) {
        return ['fp' => null, 'state' => ['window_start' => time(), 'count' => 0, 'blocked_until' => 0]];
    }
    if (!@flock($fp, LOCK_EX)) {
        fclose($fp);
        return ['fp' => null, 'state' => ['window_start' => time(), 'count' => 0, 'blocked_until' => 0]];
    }
    $raw = stream_get_contents($fp);
    $decoded = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
    $state = is_array($decoded) ? $decoded : [];
    return ['fp' => $fp, 'state' => [
        'window_start' => (int)($state['window_start'] ?? time()),
        'count' => (int)($state['count'] ?? 0),
        'blocked_until' => (int)($state['blocked_until'] ?? 0),
    ]];
}

function ticket_rate_limit_commit($fp, array $state): void {
    if (!$fp) {
        return;
    }
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($state, JSON_UNESCAPED_UNICODE));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
}

function ticket_rate_limit_allow(string $scope, int $maxAttempts, int $windowSeconds): array {
    $now = time();
    $ctx = ticket_rate_limit_state($scope);
    $fp = $ctx['fp'];
    $state = $ctx['state'];

    if ($state['blocked_until'] > $now) {
        ticket_rate_limit_commit($fp, $state);
        return ['allowed' => false, 'retry_after' => max(1, $state['blocked_until'] - $now)];
    }

    if (($now - $state['window_start']) >= $windowSeconds) {
        $state['window_start'] = $now;
        $state['count'] = 0;
        $state['blocked_until'] = 0;
    }

    $state['count']++;
    if ($state['count'] > $maxAttempts) {
        $state['blocked_until'] = $now + $windowSeconds;
        ticket_rate_limit_commit($fp, $state);
        return ['allowed' => false, 'retry_after' => $windowSeconds];
    }

    ticket_rate_limit_commit($fp, $state);
    return ['allowed' => true, 'retry_after' => 0];
}

function ticket_rate_limit_reset(string $scope): void {
    $file = ticket_rate_limit_file($scope);
    if (is_file($file)) {
        @unlink($file);
    }
}

function ticket_limit_scope_suffix(string $ticketInput): string {
    $meta = normalize_ticket_input($ticketInput);
    if (!empty($meta['ok'])) {
        return (string)$meta['value'];
    }
    $raw = strtoupper(trim((string)$ticketInput));
    return $raw !== '' ? $raw : 'unknown';
}

function ticket_enforce_request_rate_limit(string $action, string $ticketInput): void {
    $clientKey = ticket_client_fingerprint();
    $ticketRaw = ticket_limit_scope_suffix($ticketInput);
    $ticketKey = ticket_hash_scope_part('ticket:' . $ticketRaw);

    $windowSeconds = 300;
    $clientMaxAttempts = 180;
    $ticketMaxAttempts = 25;
    if ($action === 'create') {
        $clientMaxAttempts = 60;
        $ticketMaxAttempts = 40;
    } elseif ($action === 'access') {
        $clientMaxAttempts = 240;
        $ticketMaxAttempts = 40;
    } elseif ($action === 'attachment') {
        $clientMaxAttempts = 120;
        $ticketMaxAttempts = 20;
    }

    $clientScope = 'tickets:' . $action . ':client:' . $clientKey;
    $ticketScope = 'tickets:' . $action . ':ticket:' . $ticketKey;

    $clientCheck = ticket_rate_limit_allow($clientScope, $clientMaxAttempts, $windowSeconds);
    if (!$clientCheck['allowed']) {
        api_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $clientCheck['retry_after']]);
    }

    $ticketCheck = ticket_rate_limit_allow($ticketScope, $ticketMaxAttempts, $windowSeconds);
    if (!$ticketCheck['allowed']) {
        api_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $ticketCheck['retry_after']]);
    }
}

function ticket_enforce_handler_mutation_rate_limit(string $action, array $handler, ?string $ticketId = null): void {
    $handlerId = trim((string)($handler['id'] ?? ''));
    $handlerEmail = strtolower(trim((string)($handler['email'] ?? '')));
    $actorRaw = $handlerId !== '' ? $handlerId : ($handlerEmail !== '' ? $handlerEmail : 'unknown');
    $actorKey = ticket_hash_scope_part('handler:' . $actorRaw);
    $clientKey = ticket_client_fingerprint();

    $actorScope = 'tickets:admin_mutation:' . $action . ':actor:' . $actorKey;
    $actorCheck = ticket_rate_limit_allow($actorScope, 180, 300);
    if (!$actorCheck['allowed']) {
        api_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $actorCheck['retry_after']]);
    }

    $clientScope = 'tickets:admin_mutation:' . $action . ':client:' . $clientKey;
    $clientCheck = ticket_rate_limit_allow($clientScope, 500, 300);
    if (!$clientCheck['allowed']) {
        api_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $clientCheck['retry_after']]);
    }

    $ticketValue = trim((string)$ticketId);
    if ($ticketValue !== '') {
        $ticketKey = ticket_hash_scope_part('ticket:' . $ticketValue);
        $ticketScope = 'tickets:admin_mutation:' . $action . ':actor_ticket:' . $actorKey . ':' . $ticketKey;
        $ticketCheck = ticket_rate_limit_allow($ticketScope, 80, 300);
        if (!$ticketCheck['allowed']) {
            api_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $ticketCheck['retry_after']]);
        }
    }
}

function ticket_register_failed_auth_attempt(string $ticketInput): void {
    $clientKey = ticket_client_fingerprint();
    $ticketRaw = ticket_limit_scope_suffix($ticketInput);
    $ticketKey = ticket_hash_scope_part('ticket:' . $ticketRaw);
    $failScope = 'tickets:auth_fail:' . $clientKey . ':' . $ticketKey;
    $result = ticket_rate_limit_allow($failScope, 6, 900);
    if (!$result['allowed']) {
        api_json(429, false, 'Too many failed attempts. Try again later.', ['retry_after' => $result['retry_after']]);
    }
}

function ticket_reset_failed_auth_attempts(string $ticketInput): void {
    $clientKey = ticket_client_fingerprint();
    $ticketRaw = ticket_limit_scope_suffix($ticketInput);
    $ticketKey = ticket_hash_scope_part('ticket:' . $ticketRaw);
    $failScope = 'tickets:auth_fail:' . $clientKey . ':' . $ticketKey;
    ticket_rate_limit_reset($failScope);
}

function supabase_request(string $method, string $url, string $apikey, $payload = null, bool $returnRepresentation = false): array {
    $headers = [
        'apikey: ' . $apikey,
        'Authorization: Bearer ' . $apikey,
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
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($resp === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new Exception('Supabase request failed: ' . $err);
    }
    curl_close($ch);

    $decoded = json_decode($resp, true);
    return [$code, $decoded, $resp];
}

function get_first_row($decoded) {
    if (is_array($decoded) && array_is_list($decoded)) {
        return count($decoded) > 0 ? $decoded[0] : null;
    }
    return is_array($decoded) ? $decoded : null;
}

function ticket_setting_unwrap_value($raw) {
    if (is_array($raw) && array_key_exists('value', $raw)) {
        return $raw['value'];
    }
    return $raw;
}

function ticket_load_system_settings(string $baseUrl, string $serviceKey): array {
    static $cache = null;
    if (is_array($cache)) {
        return $cache;
    }

    $cache = [];
    try {
        [$code, $decoded, $raw] = supabase_request(
            'GET',
            $baseUrl . '/rest/v1/system_settings?select=setting_key,setting_value&limit=500',
            $serviceKey
        );
        if ($code < 200 || $code >= 300) {
            $msg = is_array($decoded) ? json_encode($decoded, JSON_UNESCAPED_UNICODE) : (string)$raw;
            error_log('[tickets.api] Could not load system_settings: ' . api_redact_sensitive($msg));
            return $cache;
        }
        foreach (($decoded ?? []) as $row) {
            $key = trim((string)($row['setting_key'] ?? ''));
            if ($key === '') continue;
            $cache[$key] = ticket_setting_unwrap_value($row['setting_value'] ?? null);
        }
    } catch (Throwable $e) {
        error_log('[tickets.api] Could not load system_settings: ' . api_redact_sensitive($e->getMessage()));
    }

    return $cache;
}

function ticket_setting_value(array $settings, array $aliases, $default = null) {
    foreach ($aliases as $key) {
        if (array_key_exists($key, $settings)) {
            return $settings[$key];
        }
    }
    return $default;
}

function ticket_setting_bool(array $settings, array $aliases, bool $default = false): bool {
    $raw = ticket_setting_value($settings, $aliases, $default);
    if (is_bool($raw)) return $raw;
    if ($raw === null) return $default;
    $normalized = strtolower(trim((string)$raw));
    if (in_array($normalized, ['true', '1', 'yes', 'ja', 'on'], true)) return true;
    if (in_array($normalized, ['false', '0', 'no', 'nee', 'off'], true)) return false;
    return $default;
}

function ticket_setting_int(array $settings, array $aliases, int $default = 0): int {
    $raw = ticket_setting_value($settings, $aliases, $default);
    if (is_numeric($raw)) return (int)$raw;
    return $default;
}

function ticket_setting_string(array $settings, array $aliases, string $default = ''): string {
    $raw = ticket_setting_value($settings, $aliases, $default);
    $str = trim((string)$raw);
    return $str !== '' ? $str : $default;
}

function ticket_normalize_severity(string $value, string $fallback = 'low'): string {
    $normalized = strtolower(trim($value));
    if (in_array($normalized, ['low', 'medium', 'high', 'critical'], true)) {
        return $normalized;
    }
    return $fallback;
}

function ticket_sanitize_prefix(string $value, string $fallback = 'NZ'): string {
    $upper = strtoupper(trim($value));
    $upper = preg_replace('/[^A-Z0-9-]+/', '', $upper) ?? '';
    $upper = preg_replace('/-+/', '-', $upper) ?? '';
    $upper = trim($upper, '-');
    return $upper !== '' ? $upper : $fallback;
}

function ticket_generate_ticket_number(string $prefix): string {
    $year = gmdate('Y');
    $randomNum = (string)random_int(100000, 999999);
    return $prefix . '-' . $year . '-' . $randomNum;
}

function ticket_generate_access_code(): string {
    return str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
}

function ticket_try_auto_assign_handler(string $baseUrl, string $serviceKey, string $ticketId, string $workflowType): ?array {
    if (!ticket_is_uuid($ticketId) || trim($workflowType) === '') {
        return null;
    }

    [$wfCode, $wfDecoded] = supabase_request(
        'GET',
        $baseUrl . '/rest/v1/workflows?select=id,code&code=eq.' . rawurlencode($workflowType) . '&limit=1',
        $serviceKey
    );
    if ($wfCode < 200 || $wfCode >= 300) {
        return null;
    }
    $workflow = get_first_row($wfDecoded);
    $workflowId = trim((string)($workflow['id'] ?? ''));
    if (!ticket_is_uuid($workflowId)) {
        return null;
    }

    [$hwCode, $hwDecoded] = supabase_request(
        'GET',
        $baseUrl . '/rest/v1/handler_workflows?select=handler_id&workflow_id=eq.' . rawurlencode($workflowId) . '&limit=100',
        $serviceKey
    );
    if ($hwCode < 200 || $hwCode >= 300) {
        return null;
    }

    foreach (($hwDecoded ?? []) as $link) {
        $handlerId = trim((string)($link['handler_id'] ?? ''));
        if (!ticket_is_uuid($handlerId)) {
            continue;
        }

        [$hCode, $hDecoded] = supabase_request(
            'GET',
            $baseUrl . '/rest/v1/handlers?select=id,name,email,active&id=eq.' . rawurlencode($handlerId) . '&active=eq.true&limit=1',
            $serviceKey
        );
        if ($hCode < 200 || $hCode >= 300) {
            continue;
        }
        $handler = get_first_row($hDecoded);
        if (!is_array($handler) || !ticket_is_uuid(trim((string)($handler['id'] ?? '')))) {
            continue;
        }

        [$uCode, $uDecoded] = supabase_request(
            'PATCH',
            $baseUrl . '/rest/v1/tickets?id=eq.' . rawurlencode($ticketId),
            $serviceKey,
            [
                'handler_id' => $handler['id'],
                'last_update_at' => gmdate('c'),
            ],
            true
        );
        if ($uCode < 200 || $uCode >= 300) {
            continue;
        }

        return $handler;
    }

    return null;
}

function ticket_action_logging_enabled(string $baseUrl, string $serviceKey): bool {
    $settings = ticket_load_system_settings($baseUrl, $serviceKey);
    return ticket_setting_bool($settings, ['compliance.audit_log_enabled', 'audit.enable_logging'], true);
}

function is_absolute_url(string $value): bool {
    return preg_match('#^https?://#i', $value) === 1;
}

function attachment_extract_storage_path(string $raw, string $bucket = 'attachments'): ?string {
    $value = trim($raw);
    if ($value === '' || $value === '#') {
        return null;
    }

    if (!is_absolute_url($value)) {
        $path = ltrim($value, '/');
        if (str_starts_with($path, $bucket . '/')) {
            $path = substr($path, strlen($bucket) + 1);
        }
        return $path !== '' ? $path : null;
    }

    $parsedPath = parse_url($value, PHP_URL_PATH);
    if (!is_string($parsedPath) || $parsedPath === '') {
        return null;
    }

    $needlePublic = '/storage/v1/object/public/' . $bucket . '/';
    $posPublic = strpos($parsedPath, $needlePublic);
    if ($posPublic !== false) {
        $path = substr($parsedPath, $posPublic + strlen($needlePublic));
        return $path !== '' ? $path : null;
    }

    $needleSigned = '/storage/v1/object/sign/' . $bucket . '/';
    $posSigned = strpos($parsedPath, $needleSigned);
    if ($posSigned !== false) {
        $path = substr($parsedPath, $posSigned + strlen($needleSigned));
        return $path !== '' ? $path : null;
    }

    return null;
}

function attachment_create_signed_url(string $baseUrl, string $serviceKey, string $path, string $bucket = 'attachments', int $expiresIn = ATTACHMENT_SIGNED_URL_TTL_SECONDS): ?string {
    $cleanPath = ltrim($path, '/');
    if ($cleanPath === '') {
        return null;
    }

    $url = rtrim($baseUrl, '/') . '/storage/v1/object/sign/' . rawurlencode($bucket) . '/' . str_replace('%2F', '/', rawurlencode($cleanPath));
    [$code, $decoded] = supabase_request('POST', $url, $serviceKey, ['expiresIn' => $expiresIn], false);
    if ($code < 200 || $code >= 300 || !is_array($decoded)) {
        return null;
    }

    $signed = trim((string)($decoded['signedURL'] ?? $decoded['signedUrl'] ?? ''));
    if ($signed === '') {
        return null;
    }

    if (is_absolute_url($signed)) {
        return $signed;
    }

    $base = rtrim($baseUrl, '/');
    if (str_starts_with($signed, '/')) {
        return $base . '/storage/v1' . $signed;
    }
    return $base . '/storage/v1/' . ltrim($signed, '/');
}

function normalize_access_code($raw): string {
    $digits = preg_replace('/\D+/', '', (string)$raw);
    if ($digits === null || $digits === '') return '';
    $digits = str_pad(substr($digits, -6), 6, '0', STR_PAD_LEFT);
    return preg_match('/^\d{6}$/', $digits) ? $digits : '';
}

function normalize_ticket_input($raw): array {
    $value = strtoupper(trim((string)$raw));
    if ($value === '') {
        return ['ok' => false, 'is_uuid' => false, 'value' => ''];
    }

    $isUuid = preg_match(
        '/^[0-9A-F]{8}-[0-9A-F]{4}-[1-5][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i',
        $value
    ) === 1;

    if ($isUuid) {
        return ['ok' => true, 'is_uuid' => true, 'value' => strtolower($value)];
    }

    if (preg_match('/^[A-Z0-9-]{3,32}$/', $value) !== 1) {
        return ['ok' => false, 'is_uuid' => false, 'value' => ''];
    }

    return ['ok' => true, 'is_uuid' => false, 'value' => $value];
}

function get_supabase_url(): string {
    $url = getenv('VITE_SUPABASE_URL') ?: '';
    if ($url === '') {
        throw new Exception('Missing Supabase URL configuration');
    }
    return rtrim($url, '/');
}

function get_supabase_service_key(): string {
    return supabase_get_service_role_key();
}

function ticket_is_uuid(string $value): bool {
    return preg_match(
        '/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i',
        $value
    ) === 1;
}

function ticket_require_active_handler_context(): array {
    $token = auth0_get_bearer_token();
    if ($token === '') {
        api_json(401, false, 'Authorization token required');
    }

    $auth0Domain = api_authz_env_required('VITE_AUTH0_DOMAIN');
    $auth0Audience = auth0_expected_api_audience();
    $auth0ClientId = api_authz_env_required('VITE_AUTH0_CLIENT_ID');
    $claims = auth0_verify_access_token($token, $auth0Domain, $auth0Audience, $auth0ClientId);

    $baseUrl = get_supabase_url();
    $serviceKey = get_supabase_service_key();
    $handler = api_authz_fetch_handler($baseUrl, $serviceKey, $claims);

    if (!$handler || empty($handler['active'])) {
        api_json(403, false, 'Handler account not active or not found');
    }

    return [
        'claims' => $claims,
        'handler' => $handler,
        'base_url' => $baseUrl,
        'service_key' => $serviceKey,
    ];
}

function sanitize_reporter_ticket(array $ticket, string $baseUrl, string $serviceKey): array {
    unset($ticket['access_code'], $ticket['reporter_email'], $ticket['reporter_email_encrypted'], $ticket['reporter_email_hash']);

    $settings = ticket_load_system_settings($baseUrl, $serviceKey);
    $maskClosed = ticket_setting_bool($settings, ['compliance.anonymize_closed_tickets'], false);
    $statusCode = strtolower(trim((string)($ticket['status_code'] ?? '')));
    if ($maskClosed && in_array($statusCode, ['closed', 'gesloten', 'resolved', 'opgelost'], true)) {
        $ticket['reporter_name'] = null;
        $ticket['reporter_phone'] = null;
        if (is_array($ticket['metadata'] ?? null)) {
            unset($ticket['metadata']['reporter_meta_client']);
        }
    }

    $attachments = is_array($ticket['attachments'] ?? null) ? $ticket['attachments'] : [];
    $ticket['attachments'] = array_values(array_filter($attachments, static function ($att) {
        if (!is_array($att)) return false;
        $isInternal = !empty($att['is_internal']) || !empty($att['isInternal']);
        $hasNote = !empty($att['note_id']) || !empty($att['noteId']);
        return !$isInternal && !$hasNote;
    }));
    $ticket['attachments'] = array_values(array_map(static function ($att) use ($baseUrl, $serviceKey) {
        if (!is_array($att)) {
            return null;
        }
        $rawUrl = (string)($att['file_url'] ?? '');
        $storagePath = attachment_extract_storage_path($rawUrl, 'attachments');
        $signedUrl = $storagePath ? attachment_create_signed_url($baseUrl, $serviceKey, $storagePath, 'attachments', ATTACHMENT_SIGNED_URL_TTL_SECONDS) : null;
        $downloadUrl = $signedUrl ?: (is_absolute_url($rawUrl) ? $rawUrl : null);

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
    $ticket['messages'] = array_values(array_filter($messages, static function ($msg) {
        if (!is_array($msg)) return false;
        return empty($msg['is_internal']) && empty($msg['isInternal']);
    }));
    usort($ticket['messages'], static function ($a, $b) {
        $ta = strtotime((string)($a['created_at'] ?? '')) ?: 0;
        $tb = strtotime((string)($b['created_at'] ?? '')) ?: 0;
        return $ta <=> $tb;
    });

    $actions = is_array($ticket['ticket_actions'] ?? null) ? $ticket['ticket_actions'] : [];
    $ticket['ticket_actions'] = array_values($actions);
    usort($ticket['ticket_actions'], static function ($a, $b) {
        $ta = strtotime((string)($a['created_at'] ?? '')) ?: 0;
        $tb = strtotime((string)($b['created_at'] ?? '')) ?: 0;
        return $tb <=> $ta;
    });

    return $ticket;
}

function fetch_ticket_by_credentials(string $baseUrl, string $key, string $ticketInput, string $accessCode): ?array {
    $ticketMeta = normalize_ticket_input($ticketInput);
    if (!$ticketMeta['ok']) return null;
    if ($accessCode === '') return null;

    $select = '*,handlers:handler_id(id,name,email,roles),attachments(*),messages(*),ticket_actions(*)';
    $ticketFilter = $ticketMeta['is_uuid']
        ? 'id=eq.' . rawurlencode($ticketMeta['value'])
        : 'ticket_number=eq.' . rawurlencode($ticketMeta['value']);

    $url = $baseUrl
        . '/rest/v1/tickets?select=' . rawurlencode($select)
        . '&access_code=eq.' . rawurlencode($accessCode)
        . '&' . $ticketFilter
        . '&limit=1';

    [$code, $decoded, $raw] = supabase_request('GET', $url, $key);
    if ($code < 200 || $code >= 300) {
        $msg = is_array($decoded) ? json_encode($decoded, JSON_UNESCAPED_UNICODE) : (string)$raw;
        throw new Exception('Supabase ticket lookup failed: ' . $msg);
    }

    return get_first_row($decoded);
}

function handle_create(array $data): void {
    ticket_enforce_request_rate_limit('create', (string)($data['workflow_type'] ?? 'new'));

    $baseUrl = get_supabase_url();
    $serviceKey = get_supabase_service_key();
    $settings = ticket_load_system_settings($baseUrl, $serviceKey);

    $allowPublicSubmission = ticket_setting_bool(
        $settings,
        ['tickets.allow_public_submission', 'portal.enable_public_submissions'],
        true
    );
    if (!$allowPublicSubmission) {
        api_json(403, false, 'Public submissions are disabled by system policy');
    }

    $email = trim((string)($data['reporter_email'] ?? ''));
    $isAnonymous = !empty($data['is_anonymous']);
    $requireEmailVerification = ticket_setting_bool($settings, ['tickets.require_email_verification'], true);

    if ($requireEmailVerification && $email === '') {
        throw new Exception('reporter_email is required by system policy');
    }

    $defaultPriority = ticket_normalize_severity(
        ticket_setting_string($settings, ['tickets.default_priority', 'workflow.default_priority', 'portal.default_priority'], 'low'),
        'low'
    );
    $severityCode = ticket_normalize_severity((string)($data['severity_code'] ?? ''), $defaultPriority);

    $ticketPrefix = ticket_sanitize_prefix(
        ticket_setting_string($settings, ['tickets.ticket_number_prefix'], 'NZ'),
        'NZ'
    );
    $ticketNumber = ticket_generate_ticket_number($ticketPrefix);
    $accessCode = normalize_access_code($data['access_code'] ?? '') ?: ticket_generate_access_code();

    $slaResponseHours = ticket_setting_int($settings, ['tickets.sla_response_time_hours', 'sla.default_response_hours'], 24);
    $slaResolutionHours = ticket_setting_int($settings, ['tickets.sla_resolution_time_hours', 'sla.default_resolution_hours'], 72);
    $gdprCompliant = ticket_setting_bool($settings, ['compliance.gdpr_compliant'], true);
    $anonymizeClosedTickets = ticket_setting_bool($settings, ['compliance.anonymize_closed_tickets'], false);
    $backupFrequency = ticket_setting_string($settings, ['compliance.backup_frequency'], 'weekly');
    $dataRetentionDays = ticket_setting_int($settings, ['compliance.data_retention_days', 'audit.retention_days'], 365);
    $autoAssignEnabled = ticket_setting_bool($settings, ['tickets.auto_assign_enabled', 'workflow.auto_assign'], true);

    $incomingMetadata = is_array($data['metadata'] ?? null) ? $data['metadata'] : [];
    $incomingCompliance = is_array($incomingMetadata['compliance'] ?? null) ? $incomingMetadata['compliance'] : [];
    $incomingMetadata['sla_response_hours'] = $slaResponseHours;
    $incomingMetadata['sla_resolution_hours'] = $slaResolutionHours;
    $incomingMetadata['compliance'] = array_merge($incomingCompliance, [
        'gdpr_compliant' => $gdprCompliant,
        'anonymize_closed_tickets' => $anonymizeClosedTickets,
        'backup_frequency' => $backupFrequency,
        'data_retention_days' => $dataRetentionDays,
    ]);
    if ($gdprCompliant) {
        unset($incomingMetadata['reporter_meta_client']);
    }

    $key = get_email_crypto_key();
    $encryptedEmail = $email ? encrypt_email($email, $key) : null;
    $emailHash = $email ? hash_email($email) : null;

    $payload = [
        'ticket_number' => $ticketNumber,
        'access_code' => $accessCode,
        'description' => $data['description'] ?? null,
        'location' => $data['location'] ?? null,
        'workflow_type' => $data['workflow_type'] ?? null,
        'severity_code' => $severityCode,
        'reporter_name' => $data['reporter_name'] ?? null,
        'reporter_phone' => $data['reporter_phone'] ?? null,
        'email_notify' => $email !== '' ? !empty($data['email_notify']) : false,
        'status_email_notify' => array_key_exists('status_email_notify', $data)
            ? ($email !== '' ? !empty($data['status_email_notify']) : false)
            : ($email !== ''),
        'status_code' => $data['status_code'] ?? null,
        'current_stage' => $data['current_stage'] ?? null,
        'metadata' => $incomingMetadata,
        'reporter_email' => ($isAnonymous || $email === '') ? null : $email,
        'reporter_email_encrypted' => $encryptedEmail,
        'reporter_email_hash' => $emailHash,
        'next_step_due' => $data['next_step_due'] ?? null,
    ];
    $payload = array_filter($payload, static fn($v) => $v !== null);

    [$code, $decoded, $raw] = supabase_request(
        'POST',
        $baseUrl . '/rest/v1/tickets',
        $serviceKey,
        $payload,
        true
    );

    if ($code < 200 || $code >= 300) {
        $msg = is_array($decoded) ? json_encode($decoded, JSON_UNESCAPED_UNICODE) : (string)$raw;
        throw new Exception('Supabase insert failed: ' . $msg);
    }

    $row = get_first_row($decoded);
    $ticketId = trim((string)($row['id'] ?? ''));
    $workflowType = trim((string)($row['workflow_type'] ?? $payload['workflow_type'] ?? ''));
    if ($autoAssignEnabled && ticket_is_uuid($ticketId) && $workflowType !== '') {
        try {
            $assignedHandler = ticket_try_auto_assign_handler($baseUrl, $serviceKey, $ticketId, $workflowType);
            if (is_array($assignedHandler) && ticket_is_uuid(trim((string)($assignedHandler['id'] ?? '')))) {
                $row['handler_id'] = $assignedHandler['id'];
                $row['handler_name'] = $assignedHandler['name'] ?? null;
            }
        } catch (Throwable $e) {
            error_log('[tickets.api] Auto-assign skipped: ' . api_redact_sensitive($e->getMessage()));
        }
    }

    api_json(200, true, 'Ticket created', $row);
}

function handle_access(array $data): void {
    api_apply_no_store_headers();
    $baseUrl = get_supabase_url();
    $serviceKey = get_supabase_service_key();

    $ticketInput = (string)($data['ticket_input'] ?? $data['ticket_number'] ?? $data['ticket_id'] ?? '');
    $accessCode = normalize_access_code($data['access_code'] ?? '');
    if ($ticketInput === '' || $accessCode === '') {
        api_json(400, false, 'ticket_input and a valid 6-digit access_code are required');
    }

    ticket_enforce_request_rate_limit('access', $ticketInput);

    $ticket = fetch_ticket_by_credentials($baseUrl, $serviceKey, $ticketInput, $accessCode);
    if (!$ticket) {
        ticket_register_failed_auth_attempt($ticketInput);
        usleep(random_int(150000, 350000));
        api_json(401, false, 'Invalid ticket ID or access code');
    }

    ticket_reset_failed_auth_attempts($ticketInput);
    api_json(200, true, 'Ticket loaded', sanitize_reporter_ticket($ticket, $baseUrl, $serviceKey));
}

function handle_reporter_message(array $data): void {
    api_apply_no_store_headers();
    $baseUrl = get_supabase_url();
    $serviceKey = get_supabase_service_key();

    $ticketInput = (string)($data['ticket_input'] ?? $data['ticket_number'] ?? $data['ticket_id'] ?? '');
    $accessCode = normalize_access_code($data['access_code'] ?? '');
    $body = trim((string)($data['body'] ?? ''));

    if ($ticketInput === '' || $accessCode === '') {
        api_json(400, false, 'ticket_input and a valid 6-digit access_code are required');
    }
    if ($body === '') {
        api_json(400, false, 'Message body is required');
    }
    if (api_strlen($body) > 1000) {
        api_json(400, false, 'Message body exceeds 1000 characters');
    }

    ticket_enforce_request_rate_limit('message', $ticketInput);

    $ticket = fetch_ticket_by_credentials($baseUrl, $serviceKey, $ticketInput, $accessCode);
    if (!$ticket) {
        ticket_register_failed_auth_attempt($ticketInput);
        usleep(random_int(150000, 350000));
        api_json(401, false, 'Invalid ticket ID or access code');
    }
    ticket_reset_failed_auth_attempts($ticketInput);

    $ticketId = (string)($ticket['id'] ?? '');
    if ($ticketId === '') {
        throw new Exception('Ticket lookup returned invalid data');
    }

    $messagePayload = [
        'ticket_id' => $ticketId,
        'sender' => 'reporter',
        'body' => $body,
        'is_internal' => false,
    ];

    [$msgCode, $msgDecoded, $msgRaw] = supabase_request(
        'POST',
        $baseUrl . '/rest/v1/messages',
        $serviceKey,
        $messagePayload,
        true
    );
    if ($msgCode < 200 || $msgCode >= 300) {
        $msg = is_array($msgDecoded) ? json_encode($msgDecoded, JSON_UNESCAPED_UNICODE) : (string)$msgRaw;
        throw new Exception('Failed to insert reporter message: ' . $msg);
    }

    $insertedMessage = get_first_row($msgDecoded) ?? [];

    $nowIso = gmdate('c');
    supabase_request(
        'PATCH',
        $baseUrl . '/rest/v1/tickets?id=eq.' . rawurlencode($ticketId),
        $serviceKey,
        ['last_update_at' => $nowIso]
    );

    $reporterName = trim((string)($ticket['reporter_name'] ?? ''));
    $performedBy = $reporterName !== '' ? $reporterName : 'Reporter';
    $actionPayload = [
        'ticket_id' => $ticketId,
        'action_type' => 'message_sent',
        'action' => 'Message Sent',
        'description' => 'Reporter sent a message',
        'performed_by' => $performedBy,
    ];
    if (ticket_action_logging_enabled($baseUrl, $serviceKey)) {
        try {
            supabase_request('POST', $baseUrl . '/rest/v1/ticket_actions', $serviceKey, $actionPayload, false);
        } catch (Throwable $e) {
            error_log('[tickets.api] Could not write ticket_actions for reporter message: ' . api_redact_sensitive($e->getMessage()));
        }
    }

    $ticketAfter = fetch_ticket_by_credentials($baseUrl, $serviceKey, $ticketInput, $accessCode);
    $safeTicket = $ticketAfter
        ? sanitize_reporter_ticket($ticketAfter, $baseUrl, $serviceKey)
        : sanitize_reporter_ticket($ticket, $baseUrl, $serviceKey);

    api_json(200, true, 'Message sent', [
        'message' => $insertedMessage,
        'ticket' => $safeTicket,
    ]);
}

function handle_handler_update_ticket(array $data): void {
    $ctx = ticket_require_active_handler_context();
    $baseUrl = (string)$ctx['base_url'];
    $serviceKey = (string)$ctx['service_key'];
    $handler = (array)$ctx['handler'];

    $ticketId = trim((string)($data['ticket_id'] ?? ''));
    if (!ticket_is_uuid($ticketId)) {
        api_json(400, false, 'ticket_id must be a valid UUID');
    }
    ticket_enforce_handler_mutation_rate_limit('update_ticket', $handler, $ticketId);

    $updatesRaw = $data['updates'] ?? [];
    if (!is_array($updatesRaw)) {
        api_json(400, false, 'updates must be an object');
    }

    $allowedKeys = [
        'severity_code',
        'status_code',
        'current_stage',
        'workflow_type',
        'handler_id',
        'next_step_due',
        'metadata',
        'description',
    ];

    $payload = [];
    foreach ($allowedKeys as $key) {
        if (array_key_exists($key, $updatesRaw)) {
            $payload[$key] = $updatesRaw[$key];
        }
    }

    if (array_key_exists('handler_id', $payload)) {
        $handlerId = $payload['handler_id'];
        if ($handlerId !== null && !ticket_is_uuid(trim((string)$handlerId))) {
            api_json(400, false, 'handler_id must be a UUID or null');
        }
    }

    if (count($payload) === 0) {
        api_json(400, false, 'No valid fields provided in updates');
    }

    $payload['last_update_at'] = gmdate('c');

    [$code, $decoded, $raw] = supabase_request(
        'PATCH',
        $baseUrl . '/rest/v1/tickets?id=eq.' . rawurlencode($ticketId),
        $serviceKey,
        $payload,
        true
    );

    if ($code < 200 || $code >= 300) {
        $msg = is_array($decoded) ? json_encode($decoded, JSON_UNESCAPED_UNICODE) : (string)$raw;
        throw new Exception('Failed to update ticket: ' . $msg);
    }

    api_json(200, true, 'Ticket updated', ['ticket' => get_first_row($decoded)]);
}

function handle_handler_add_comment(array $data): void {
    $ctx = ticket_require_active_handler_context();
    $baseUrl = (string)$ctx['base_url'];
    $serviceKey = (string)$ctx['service_key'];
    $handler = (array)$ctx['handler'];

    $ticketId = trim((string)($data['ticket_id'] ?? ''));
    if (!ticket_is_uuid($ticketId)) {
        api_json(400, false, 'ticket_id must be a valid UUID');
    }
    ticket_enforce_handler_mutation_rate_limit('add_comment', $handler, $ticketId);

    $comment = trim((string)($data['comment'] ?? ''));
    if ($comment === '') {
        api_json(400, false, 'comment is required');
    }
    if (api_strlen($comment) > 4000) {
        api_json(400, false, 'comment exceeds 4000 characters');
    }

    $performedBy = trim((string)($handler['name'] ?? '')) ?: 'System';
    $handlerId = trim((string)($handler['id'] ?? ''));
    $handlerEmail = trim((string)($handler['email'] ?? ''));

    [$commentCode, $commentDecoded, $commentRaw] = supabase_request(
        'POST',
        $baseUrl . '/rest/v1/ticket_comments',
        $serviceKey,
        [
            'ticket_id' => $ticketId,
            'comment' => $comment,
            'author_name' => $performedBy,
        ],
        true
    );
    if ($commentCode < 200 || $commentCode >= 300) {
        $msg = is_array($commentDecoded) ? json_encode($commentDecoded, JSON_UNESCAPED_UNICODE) : (string)$commentRaw;
        throw new Exception('Failed to add ticket comment: ' . $msg);
    }

    if (ticket_action_logging_enabled($baseUrl, $serviceKey)) {
        try {
            supabase_request(
                'POST',
                $baseUrl . '/rest/v1/ticket_actions',
                $serviceKey,
                [
                    'ticket_id' => $ticketId,
                    'action_type' => 'note_added',
                    'action' => 'Note Added',
                    'description' => 'Added investigation note: ' . api_substr($comment, 0, 100) . '...',
                    'handler_id' => $handlerId !== '' ? $handlerId : null,
                    'handler_name' => $performedBy,
                    'handler_email' => $handlerEmail !== '' ? $handlerEmail : null,
                    'performed_by' => $performedBy,
                ],
                false
            );
        } catch (Throwable $e) {
            error_log('[tickets.api] Could not write ticket_actions for handler comment: ' . api_redact_sensitive($e->getMessage()));
        }
    }

    api_json(200, true, 'Comment added', [
        'comment' => get_first_row($commentDecoded),
        'performed_by' => $performedBy,
    ]);
}

function handle_handler_add_message(array $data): void {
    api_apply_no_store_headers();
    $ctx = ticket_require_active_handler_context();
    $baseUrl = (string)$ctx['base_url'];
    $serviceKey = (string)$ctx['service_key'];
    $handler = (array)$ctx['handler'];

    $ticketId = trim((string)($data['ticket_id'] ?? ''));
    if (!ticket_is_uuid($ticketId)) {
        api_json(400, false, 'ticket_id must be a valid UUID');
    }
    ticket_enforce_handler_mutation_rate_limit('add_message', $handler, $ticketId);

    $sender = strtolower(trim((string)($data['sender'] ?? 'handler')));
    if ($sender === '') {
        api_json(400, false, 'sender is required');
    }

    $body = trim((string)($data['body'] ?? ''));
    if ($body === '') {
        api_json(400, false, 'body is required');
    }
    if (api_strlen($body) > 4000) {
        api_json(400, false, 'body exceeds 4000 characters');
    }

    $isInternal = !empty($data['is_internal']);
    $discloseHandlerIdentity = !empty($data['disclose_handler_identity']);

    $performedBy = trim((string)($handler['name'] ?? '')) ?: 'System';
    $handlerId = trim((string)($handler['id'] ?? ''));
    $handlerEmail = trim((string)($handler['email'] ?? ''));
    $publicHandlerName = ($sender === 'handler' && $discloseHandlerIdentity) ? $performedBy : null;

    [$msgCode, $msgDecoded, $msgRaw] = supabase_request(
        'POST',
        $baseUrl . '/rest/v1/messages',
        $serviceKey,
        [
            'ticket_id' => $ticketId,
            'sender' => $sender,
            'body' => $body,
            'is_internal' => $isInternal,
            'handler_id' => $handlerId !== '' ? $handlerId : null,
            'handler_name' => $publicHandlerName,
        ],
        true
    );
    if ($msgCode < 200 || $msgCode >= 300) {
        $msg = is_array($msgDecoded) ? json_encode($msgDecoded, JSON_UNESCAPED_UNICODE) : (string)$msgRaw;
        throw new Exception('Failed to add ticket message: ' . $msg);
    }

    supabase_request(
        'PATCH',
        $baseUrl . '/rest/v1/tickets?id=eq.' . rawurlencode($ticketId),
        $serviceKey,
        ['last_update_at' => gmdate('c')],
        false
    );

    if (ticket_action_logging_enabled($baseUrl, $serviceKey)) {
        try {
            supabase_request(
                'POST',
                $baseUrl . '/rest/v1/ticket_actions',
                $serviceKey,
                [
                    'ticket_id' => $ticketId,
                    'action_type' => 'message_sent',
                    'action' => 'Message Sent',
                    'description' => 'Sent message: ' . api_substr($body, 0, 100) . '...',
                    'handler_id' => $handlerId !== '' ? $handlerId : null,
                    'handler_name' => $performedBy,
                    'handler_email' => $handlerEmail !== '' ? $handlerEmail : null,
                    'performed_by' => $performedBy,
                ],
                false
            );
        } catch (Throwable $e) {
            error_log('[tickets.api] Could not write ticket_actions for handler message: ' . api_redact_sensitive($e->getMessage()));
        }
    }

    api_json(200, true, 'Message added', [
        'message' => get_first_row($msgDecoded),
        'performed_by' => $performedBy,
        'public_handler_name' => $publicHandlerName,
    ]);
}

function handle_reporter_add_attachment(array $data): void {
    api_apply_no_store_headers();
    $baseUrl = get_supabase_url();
    $serviceKey = get_supabase_service_key();

    $ticketInput = (string)($data['ticket_input'] ?? $data['ticket_number'] ?? $data['ticket_id'] ?? '');
    $accessCode = normalize_access_code($data['access_code'] ?? '');
    if ($ticketInput === '' || $accessCode === '') {
        api_json(400, false, 'ticket_input and a valid 6-digit access_code are required');
    }

    $fileName = trim((string)($data['file_name'] ?? ''));
    $fileUrl = trim((string)($data['file_url'] ?? ''));
    $mimeType = trim((string)($data['mime_type'] ?? 'application/octet-stream'));
    $sizeBytes = isset($data['size_bytes']) ? (int)$data['size_bytes'] : null;

    if ($fileName === '' || api_strlen($fileName) > 255) {
        api_json(400, false, 'file_name is required and must be <= 255 chars');
    }
    if ($fileUrl === '') {
        api_json(400, false, 'file_url is required');
    }

    ticket_enforce_request_rate_limit('attachment', $ticketInput);

    $ticket = fetch_ticket_by_credentials($baseUrl, $serviceKey, $ticketInput, $accessCode);
    if (!$ticket) {
        ticket_register_failed_auth_attempt($ticketInput);
        usleep(random_int(150000, 350000));
        api_json(401, false, 'Invalid ticket ID or access code');
    }
    ticket_reset_failed_auth_attempts($ticketInput);

    $ticketId = trim((string)($ticket['id'] ?? ''));
    if (!ticket_is_uuid($ticketId)) {
        throw new Exception('Ticket lookup returned invalid data');
    }

    [$attCode, $attDecoded, $attRaw] = supabase_request(
        'POST',
        $baseUrl . '/rest/v1/attachments',
        $serviceKey,
        [
            'ticket_id' => $ticketId,
            'file_name' => $fileName,
            'file_url' => $fileUrl,
            'mime_type' => $mimeType !== '' ? $mimeType : 'application/octet-stream',
            'size_bytes' => $sizeBytes,
            'is_internal' => false,
            'note_id' => null,
        ],
        true
    );
    if ($attCode < 200 || $attCode >= 300) {
        $msg = is_array($attDecoded) ? json_encode($attDecoded, JSON_UNESCAPED_UNICODE) : (string)$attRaw;
        throw new Exception('Failed to add attachment: ' . $msg);
    }

    try {
        supabase_request(
            'PATCH',
            $baseUrl . '/rest/v1/tickets?id=eq.' . rawurlencode($ticketId),
            $serviceKey,
            ['last_update_at' => gmdate('c')],
            false
        );
    } catch (Throwable $e) {
        error_log('[tickets.api] Could not update last_update_at after reporter attachment: ' . api_redact_sensitive($e->getMessage()));
    }

    if (ticket_action_logging_enabled($baseUrl, $serviceKey)) {
        try {
            $performedBy = trim((string)($ticket['reporter_name'] ?? '')) ?: 'Reporter';
            supabase_request(
                'POST',
                $baseUrl . '/rest/v1/ticket_actions',
                $serviceKey,
                [
                    'ticket_id' => $ticketId,
                    'action_type' => 'attachment_added',
                    'action' => 'Attachment Added',
                    'description' => 'Reporter uploaded file: ' . api_substr($fileName, 0, 200),
                    'performed_by' => $performedBy,
                ],
                false
            );
        } catch (Throwable $e) {
            error_log('[tickets.api] Could not write ticket_actions for reporter attachment: ' . api_redact_sensitive($e->getMessage()));
        }
    }

    api_json(200, true, 'Attachment added', [
        'attachment' => get_first_row($attDecoded),
    ]);
}

function handle_handler_add_attachment(array $data): void {
    api_apply_no_store_headers();
    $ctx = ticket_require_active_handler_context();
    $baseUrl = (string)$ctx['base_url'];
    $serviceKey = (string)$ctx['service_key'];
    $handler = (array)$ctx['handler'];

    $ticketId = trim((string)($data['ticket_id'] ?? ''));
    if (!ticket_is_uuid($ticketId)) {
        api_json(400, false, 'ticket_id must be a valid UUID');
    }
    ticket_enforce_handler_mutation_rate_limit('add_attachment', $handler, $ticketId);

    $fileName = trim((string)($data['file_name'] ?? ''));
    $fileUrl = trim((string)($data['file_url'] ?? ''));
    $mimeType = trim((string)($data['mime_type'] ?? 'application/octet-stream'));
    $sizeBytes = isset($data['size_bytes']) ? (int)$data['size_bytes'] : null;
    $isInternal = !empty($data['is_internal']);
    $noteIdRaw = trim((string)($data['note_id'] ?? ''));
    $noteId = ticket_is_uuid($noteIdRaw) ? $noteIdRaw : null;

    if ($fileName === '' || api_strlen($fileName) > 255) {
        api_json(400, false, 'file_name is required and must be <= 255 chars');
    }
    if ($fileUrl === '') {
        api_json(400, false, 'file_url is required');
    }

    $performedBy = trim((string)($handler['name'] ?? '')) ?: 'System';
    $handlerId = trim((string)($handler['id'] ?? ''));
    $handlerEmail = trim((string)($handler['email'] ?? ''));

    [$attCode, $attDecoded, $attRaw] = supabase_request(
        'POST',
        $baseUrl . '/rest/v1/attachments',
        $serviceKey,
        [
            'ticket_id' => $ticketId,
            'file_name' => $fileName,
            'file_url' => $fileUrl,
            'mime_type' => $mimeType !== '' ? $mimeType : 'application/octet-stream',
            'size_bytes' => $sizeBytes,
            'is_internal' => $isInternal,
            'note_id' => $noteId,
        ],
        true
    );
    if ($attCode < 200 || $attCode >= 300) {
        $msg = is_array($attDecoded) ? json_encode($attDecoded, JSON_UNESCAPED_UNICODE) : (string)$attRaw;
        throw new Exception('Failed to add attachment: ' . $msg);
    }

    try {
        supabase_request(
            'PATCH',
            $baseUrl . '/rest/v1/tickets?id=eq.' . rawurlencode($ticketId),
            $serviceKey,
            ['last_update_at' => gmdate('c')],
            false
        );
    } catch (Throwable $e) {
        error_log('[tickets.api] Could not update last_update_at after handler attachment: ' . api_redact_sensitive($e->getMessage()));
    }

    if (ticket_action_logging_enabled($baseUrl, $serviceKey)) {
        try {
            supabase_request(
                'POST',
                $baseUrl . '/rest/v1/ticket_actions',
                $serviceKey,
                [
                    'ticket_id' => $ticketId,
                    'action_type' => 'attachment_added',
                    'action' => 'Attachment Added',
                    'description' => 'Uploaded file: ' . api_substr($fileName, 0, 200),
                    'handler_id' => $handlerId !== '' ? $handlerId : null,
                    'handler_name' => $performedBy,
                    'handler_email' => $handlerEmail !== '' ? $handlerEmail : null,
                    'performed_by' => $performedBy,
                ],
                false
            );
        } catch (Throwable $e) {
            error_log('[tickets.api] Could not write ticket_actions for handler attachment: ' . api_redact_sensitive($e->getMessage()));
        }
    }

    api_json(200, true, 'Attachment added', [
        'attachment' => get_first_row($attDecoded),
        'performed_by' => $performedBy,
    ]);
}

function handle_handler_log_action(array $data): void {
    $ctx = ticket_require_active_handler_context();
    $baseUrl = (string)$ctx['base_url'];
    $serviceKey = (string)$ctx['service_key'];
    $handler = (array)$ctx['handler'];

    $ticketId = trim((string)($data['ticket_id'] ?? ''));
    if (!ticket_is_uuid($ticketId)) {
        api_json(400, false, 'ticket_id must be a valid UUID');
    }
    ticket_enforce_handler_mutation_rate_limit('log_action', $handler, $ticketId);

    $actionType = trim((string)($data['action_type'] ?? ''));
    $action = trim((string)($data['action'] ?? ''));
    $description = trim((string)($data['description'] ?? ''));

    if ($actionType === '' || api_strlen($actionType) > 80) {
        api_json(400, false, 'action_type is required and must be <= 80 chars');
    }
    if ($action === '' || api_strlen($action) > 255) {
        api_json(400, false, 'action is required and must be <= 255 chars');
    }
    if ($description !== '' && api_strlen($description) > 4000) {
        api_json(400, false, 'description must be <= 4000 chars');
    }

    $performedBy = trim((string)($handler['name'] ?? '')) ?: 'System';
    $handlerId = trim((string)($handler['id'] ?? ''));
    $handlerEmail = trim((string)($handler['email'] ?? ''));
    $handlerName = trim((string)($data['handler_name'] ?? $performedBy));

    [$code, $decoded, $raw] = supabase_request(
        'POST',
        $baseUrl . '/rest/v1/ticket_actions',
        $serviceKey,
        [
            'ticket_id' => $ticketId,
            'action_type' => $actionType,
            'action' => $action,
            'description' => $description !== '' ? $description : null,
            'handler_id' => $handlerId !== '' ? $handlerId : null,
            'handler_name' => $handlerName !== '' ? $handlerName : null,
            'handler_email' => $handlerEmail !== '' ? $handlerEmail : null,
            'performed_by' => $performedBy,
            'created_at' => gmdate('c'),
        ],
        true
    );
    if ($code < 200 || $code >= 300) {
        $msg = is_array($decoded) ? json_encode($decoded, JSON_UNESCAPED_UNICODE) : (string)$raw;
        throw new Exception('Failed to log ticket action: ' . $msg);
    }

    api_json(200, true, 'Action logged', [
        'ticket_action' => get_first_row($decoded),
    ]);
}

try {
    load_env_file(__DIR__ . '/../../.env.local', true);
    load_env_file(__DIR__ . '/../../.env', false);

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        api_json(405, false, 'Method not allowed');
    }

    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?? '', true);
    if (!is_array($data)) {
        throw new Exception('Invalid JSON payload');
    }

    $action = strtolower(trim((string)($data['action'] ?? 'create')));
    switch ($action) {
        case 'create':
            handle_create($data);
            break;
        case 'access':
            handle_access($data);
            break;
        case 'message':
            handle_reporter_message($data);
            break;
        case 'handler_update_ticket':
            handle_handler_update_ticket($data);
            break;
        case 'handler_add_comment':
            handle_handler_add_comment($data);
            break;
        case 'handler_add_message':
            handle_handler_add_message($data);
            break;
        case 'reporter_add_attachment':
            handle_reporter_add_attachment($data);
            break;
        case 'handler_add_attachment':
            handle_handler_add_attachment($data);
            break;
        case 'handler_log_action':
            handle_handler_log_action($data);
            break;
        default:
            api_json(400, false, 'Unsupported action');
    }
} catch (Throwable $e) {
    $errorId = api_log_exception('tickets.api', $e);
    api_json(500, false, 'Internal server error', ['error_id' => $errorId]);
}
