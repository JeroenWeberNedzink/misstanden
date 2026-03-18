<?php
declare(strict_types=1);
/**
 * settings.api.php
 * Read/write system settings through server-side service-role access.
 *
 * GET:
 * - /api/settings.api.php?category=workflow
 * - /api/settings.api.php?include_sensitive=1   (admin token required)
 *
 * POST JSON:
 * - { "action": "upsert", "item": { ... } }      (admin token required)
 * - { "action": "upsert_many", "items": [ ... ]} (admin token required)
 */

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_auth0.php';
require_once __DIR__ . '/_scopes.php';
require_once __DIR__ . '/_supabase.php';
require_once __DIR__ . '/_errors.php';
require_once __DIR__ . '/_security_headers.php';
require_once __DIR__ . '/_rate_limit.php';

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

const SETTINGS_SCOPES_READ = [
    'admin:settings:read',
    'admin:settings:write',
    'read:settings',
    'write:settings',
    'manage:settings',
    'admin:all',
    'admin',
];
const SETTINGS_SCOPES_WRITE = [
    'admin:settings:write',
    'write:settings',
    'manage:settings',
    'admin:all',
    'admin',
];

function settings_api_json(int $status, bool $success, string $message, $data = null): void {
    http_response_code($status);
    echo json_encode(
        ['success' => $success, 'message' => $message, 'data' => $data],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

function settings_is_list_array($value): bool {
    if (!is_array($value)) {
        return false;
    }
    if (function_exists('array_is_list')) {
        return array_is_list($value);
    }
    $i = 0;
    foreach (array_keys($value) as $key) {
        if ($key !== $i++) {
            return false;
        }
    }
    return true;
}

function settings_http_request(
    string $method,
    string $url,
    array $headers,
    $payload = null,
    int $timeout = 20
): array {
    $payloadJson = $payload !== null ? json_encode($payload, JSON_UNESCAPED_UNICODE) : null;

    if (function_exists('curl_init')) {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => $timeout,
        ]);
        if ($payloadJson !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $payloadJson);
        }

        $resp = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        if ($resp === false) {
            $err = curl_error($ch);
            curl_close($ch);
            throw new Exception('HTTP request failed: ' . $err);
        }
        curl_close($ch);
        return [$code, (string)$resp];
    }

    if (!filter_var((string)ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN)) {
        throw new Exception('HTTP client unavailable: enable curl or allow_url_fopen');
    }

    $opts = [
        'http' => [
            'method' => $method,
            'header' => implode("\r\n", $headers),
            'ignore_errors' => true,
            'timeout' => $timeout,
        ],
    ];
    if ($payloadJson !== null) {
        $opts['http']['content'] = $payloadJson;
    }

    $ctx = stream_context_create($opts);
    $resp = @file_get_contents($url, false, $ctx);

    $code = 0;
    if (isset($http_response_header) && is_array($http_response_header)) {
        foreach ($http_response_header as $h) {
            if (preg_match('#HTTP/\S+\s+(\d+)#', (string)$h, $m)) {
                $code = (int)$m[1];
                break;
            }
        }
    }

    if ($resp === false && $code === 0) {
        throw new Exception('HTTP request failed via file_get_contents');
    }

    return [$code, is_string($resp) ? $resp : ''];
}

function settings_supabase_request(
    string $method,
    string $url,
    string $apikey,
    $payload = null,
    bool $returnRepresentation = false
): array {
    $headers = [
        'apikey: ' . $apikey,
        'Authorization: Bearer ' . $apikey,
        'Content-Type: application/json',
    ];
    if ($returnRepresentation) {
        $headers[] = 'Prefer: resolution=merge-duplicates,return=representation';
    }

    [$code, $resp] = settings_http_request($method, $url, $headers, $payload, 20);
    $decoded = json_decode($resp, true);
    return [$code, $decoded, $resp];
}

function settings_get_first_row($decoded) {
    if (settings_is_list_array($decoded)) {
        return count($decoded) > 0 ? $decoded[0] : null;
    }
    return is_array($decoded) ? $decoded : null;
}

function settings_get_env_required(string $key): string {
    $value = getenv($key) ?: '';
    if ($value === '') {
        throw new Exception('Missing required environment variable: ' . $key);
    }
    return $value;
}

function settings_candidate_roots(): array {
    $roots = [];
    foreach ([__DIR__ . '/..', __DIR__ . '/../..'] as $candidate) {
        $resolved = realpath($candidate);
        if ($resolved === false || !is_dir($resolved)) {
            continue;
        }
        if (!in_array($resolved, $roots, true)) {
            $roots[] = $resolved;
        }
    }
    if (!$roots) {
        $roots[] = dirname(__DIR__);
    }
    return $roots;
}

function settings_load_runtime_env(): void {
    // Load broader root first, nearest root last.
    foreach (array_reverse(settings_candidate_roots()) as $root) {
        load_env_file($root . '/.env', false);
        load_env_file($root . '/.env.local', true);
    }
}

function settings_get_supabase_url(): string {
    return rtrim(settings_get_env_required('VITE_SUPABASE_URL'), '/');
}

function settings_get_supabase_service_key(): string {
    return supabase_get_service_role_key();
}

function settings_is_local_dev(): bool {
    $host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    if (str_contains($host, 'localhost') || str_contains($host, '127.0.0.1')) {
        return true;
    }
    $appEnv = strtolower((string)(getenv('APP_ENV') ?: getenv('NODE_ENV') ?: ''));
    return in_array($appEnv, ['local', 'dev', 'development'], true);
}

function settings_is_admin_profile(array $handler): bool {
    $rolesRaw = $handler['roles'] ?? [];
    if (is_string($rolesRaw)) {
        $decoded = json_decode($rolesRaw, true);
        $rolesRaw = is_array($decoded) ? $decoded : [$rolesRaw];
    }
    if (!is_array($rolesRaw)) {
        $rolesRaw = [];
    }
    $roles = array_map(
        static fn($r) => strtoupper(trim((string)$r)),
        array_filter($rolesRaw, static fn($r) => $r !== null && $r !== '')
    );

    if (in_array('ADMIN', $roles, true) || in_array('SUPER_ADMIN', $roles, true)) {
        return true;
    }

    $permissionsRaw = $handler['permissions'] ?? [];
    if (is_string($permissionsRaw)) {
        $decoded = json_decode($permissionsRaw, true);
        $permissionsRaw = is_array($decoded) ? $decoded : [];
    }
    $permissions = is_array($permissionsRaw) ? $permissionsRaw : [];

    return !empty($permissions['admin'])
        || !empty($permissions['manage_users'])
        || !empty($permissions['manage_workflows'])
        || !empty($permissions['manage_settings']);
}

function settings_env_list(string $key): array {
    $raw = (string)(getenv($key) ?: '');
    if ($raw === '') {
        return [];
    }
    return array_values(array_filter(array_map(
        static fn($item) => trim((string)$item),
        explode(',', $raw)
    ), static fn($item) => $item !== ''));
}

function settings_is_super_admin_profile(array $handler, array $claims = []): bool {
    $rolesRaw = $handler['roles'] ?? [];
    if (is_string($rolesRaw)) {
        $decoded = json_decode($rolesRaw, true);
        $rolesRaw = is_array($decoded) ? $decoded : [$rolesRaw];
    }
    if (!is_array($rolesRaw)) {
        $rolesRaw = [];
    }
    $roles = array_map(
        static fn($r) => strtoupper(trim((string)$r)),
        array_filter($rolesRaw, static fn($r) => $r !== null && $r !== '')
    );
    if (in_array('SUPER_ADMIN', $roles, true)) {
        return true;
    }

    $allowedEmails = array_map('strtolower', settings_env_list('VITE_SUPER_ADMIN_EMAILS'));
    $allowedSubs = settings_env_list('VITE_SUPER_ADMIN_SUBS');

    $candidateEmails = array_values(array_filter([
        strtolower(trim((string)($handler['email'] ?? ''))),
        strtolower(trim((string)($claims['email'] ?? ''))),
    ], static fn($value) => $value !== ''));
    foreach ($candidateEmails as $candidateEmail) {
        if (in_array($candidateEmail, $allowedEmails, true)) {
            return true;
        }
    }

    $candidateSubs = array_values(array_filter([
        trim((string)($handler['user_id'] ?? '')),
        trim((string)($claims['sub'] ?? '')),
    ], static fn($value) => $value !== ''));
    foreach ($candidateSubs as $candidateSub) {
        if (in_array($candidateSub, $allowedSubs, true)) {
            return true;
        }
    }

    return false;
}

function settings_fetch_handler_profile(string $baseUrl, string $serviceKey, array $claims): ?array {
    $sub = trim((string)($claims['sub'] ?? ''));
    $email = trim((string)($claims['email'] ?? ''));

    if ($sub !== '') {
        $urlBySub = $baseUrl
            . '/rest/v1/handlers?select=id,name,email,user_id,active,roles,permissions'
            . '&user_id=eq.' . rawurlencode($sub)
            . '&limit=1';
        [$codeSub, $decSub, $rawSub] = settings_supabase_request('GET', $urlBySub, $serviceKey);
        if ($codeSub >= 200 && $codeSub < 300) {
            $row = settings_get_first_row($decSub);
            if (is_array($row)) return $row;
        } else {
            $msg = is_array($decSub) ? json_encode($decSub, JSON_UNESCAPED_UNICODE) : (string)$rawSub;
            throw new Exception('Failed to load handler profile by sub: ' . $msg);
        }
    }

    if ($email !== '') {
        $urlByEmail = $baseUrl
            . '/rest/v1/handlers?select=id,name,email,user_id,active,roles,permissions'
            . '&email=ilike.' . rawurlencode($email)
            . '&limit=1';
        [$codeEmail, $decEmail, $rawEmail] = settings_supabase_request('GET', $urlByEmail, $serviceKey);
        if ($codeEmail >= 200 && $codeEmail < 300) {
            $row = settings_get_first_row($decEmail);
            if (is_array($row)) return $row;
            return null;
        }
        $msg = is_array($decEmail) ? json_encode($decEmail, JSON_UNESCAPED_UNICODE) : (string)$rawEmail;
        throw new Exception('Failed to load handler profile by email: ' . $msg);
    }

    return null;
}

function settings_require_admin_context(array $requiredScopes = []): array {
    $token = auth0_get_bearer_token();
    if ($token === '') {
        settings_api_json(401, false, 'Authorization token required');
    }

    $auth0Domain = settings_get_env_required('VITE_AUTH0_DOMAIN');
    $auth0Audience = auth0_expected_api_audience();
    $auth0ClientId = settings_get_env_required('VITE_AUTH0_CLIENT_ID');
    $claims = auth0_verify_access_token($token, $auth0Domain, $auth0Audience, $auth0ClientId);

    $baseUrl = settings_get_supabase_url();
    $serviceKey = settings_get_supabase_service_key();
    $handler = settings_fetch_handler_profile($baseUrl, $serviceKey, $claims);
    if (!$handler || empty($handler['active'])) {
        settings_api_json(403, false, 'Handler account not active or not found');
    }
    if (!settings_is_admin_profile($handler)) {
        settings_api_json(403, false, 'Admin permissions required');
    }
    require_scopes($claims, $requiredScopes, static function (int $status, string $message): void {
        settings_api_json($status, false, $message);
    });

    return ['claims' => $claims, 'handler' => $handler];
}

function settings_handle_get(): void {
    api_apply_no_store_headers();
    $baseUrl = settings_get_supabase_url();
    try {
        $serviceKey = settings_get_supabase_service_key();
    } catch (Throwable $e) {
        if (settings_is_local_dev()) {
            settings_api_json(200, true, 'Settings loaded (local dev fallback: missing service key)', [
                'rows' => [],
                'is_admin' => false,
                'warning' => $e->getMessage(),
            ]);
        }
        throw $e;
    }
    $category = trim((string)($_GET['category'] ?? ''));
    $includeSensitive = in_array(
        strtolower((string)($_GET['include_sensitive'] ?? '')),
        ['1', 'true', 'yes', 'on'],
        true
    );
    $requireSuperAdmin = in_array(
        strtolower((string)($_GET['require_super_admin'] ?? '')),
        ['1', 'true', 'yes', 'on'],
        true
    );

    $adminContext = null;
    if ($includeSensitive || $requireSuperAdmin) {
        $adminContext = settings_require_admin_context(SETTINGS_SCOPES_READ);
        if ($requireSuperAdmin && !settings_is_super_admin_profile($adminContext['handler'], $adminContext['claims'])) {
            settings_api_json(403, false, 'Super admin permissions required');
        }
    }

    $select = rawurlencode('id,setting_key,setting_value,category,description,is_sensitive,updated_by,updated_at');
    $url = $baseUrl
        . '/rest/v1/system_settings?select=' . $select
        . '&order=category.asc,setting_key.asc';

    if ($category !== '') {
        $url .= '&category=eq.' . rawurlencode($category);
    }

    if (!$adminContext) {
        $url .= '&is_sensitive=eq.false';
    }

    [$code, $decoded, $raw] = settings_supabase_request('GET', $url, $serviceKey);
    if ($code < 200 || $code >= 300) {
        $msg = is_array($decoded) ? json_encode($decoded, JSON_UNESCAPED_UNICODE) : (string)$raw;
        throw new Exception('Failed to load settings: ' . $msg);
    }

    settings_api_json(200, true, 'Settings loaded', [
        'rows' => is_array($decoded) ? $decoded : [],
        'is_admin' => (bool)$adminContext,
        'is_super_admin' => $adminContext
            ? settings_is_super_admin_profile($adminContext['handler'], $adminContext['claims'])
            : false,
    ]);
}

function settings_is_valid_uuid(string $value): bool {
    return preg_match(
        '/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i',
        $value
    ) === 1;
}

function settings_normalize_item(array $item, string $updatedBy): array {
    $settingKey = trim((string)($item['setting_key'] ?? ''));
    $category = trim((string)($item['category'] ?? ''));
    if ($settingKey === '' || $category === '') {
        throw new Exception('Each setting requires setting_key and category');
    }

    return [
        'id' => $settingKey,
        'setting_key' => $settingKey,
        'setting_value' => $item['setting_value'] ?? [],
        'category' => $category,
        'description' => array_key_exists('description', $item) ? $item['description'] : null,
        'is_sensitive' => !empty($item['is_sensitive']),
        'updated_by' => settings_is_valid_uuid($updatedBy) ? $updatedBy : null,
    ];
}

function settings_handle_post(): void {
    $ctx = settings_require_admin_context(SETTINGS_SCOPES_WRITE);
    $handlerId = trim((string)($ctx['handler']['id'] ?? ''));
    $claimSub = trim((string)($ctx['claims']['sub'] ?? ''));
    $actorRaw = $handlerId !== '' ? $handlerId : ($claimSub !== '' ? $claimSub : 'unknown');
    $actorKey = api_rate_limit_hash('settings_actor:' . $actorRaw);
    $clientKey = api_rate_limit_client_fingerprint();
    api_rate_limit_enforce(
        'settings:write:actor:' . $actorKey,
        120,
        300,
        static function (int $retryAfter): void {
            settings_api_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $retryAfter]);
        }
    );
    api_rate_limit_enforce(
        'settings:write:client:' . $clientKey,
        300,
        300,
        static function (int $retryAfter): void {
            settings_api_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $retryAfter]);
        }
    );

    $handlerId = (string)($ctx['handler']['id'] ?? '');

    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?? '', true);
    if (!is_array($data)) {
        throw new Exception('Invalid JSON payload');
    }

    $action = strtolower(trim((string)($data['action'] ?? '')));
    $requireSuperAdmin = !empty($data['require_super_admin']);
    if ($requireSuperAdmin && !settings_is_super_admin_profile($ctx['handler'], $ctx['claims'])) {
        settings_api_json(403, false, 'Super admin permissions required');
    }
    $baseUrl = settings_get_supabase_url();
    $serviceKey = settings_get_supabase_service_key();

    if ($action === 'upsert') {
        $item = $data['item'] ?? null;
        if (!is_array($item)) {
            throw new Exception('item object is required for upsert');
        }
        $payload = settings_normalize_item($item, $handlerId);

        [$code, $decoded, $rawResp] = settings_supabase_request(
            'POST',
            $baseUrl . '/rest/v1/system_settings?on_conflict=setting_key',
            $serviceKey,
            $payload,
            true
        );
        if ($code < 200 || $code >= 300) {
            $msg = is_array($decoded) ? json_encode($decoded, JSON_UNESCAPED_UNICODE) : (string)$rawResp;
            throw new Exception('Failed to upsert setting: ' . $msg);
        }

        settings_api_json(200, true, 'Setting saved', [
            'row' => settings_get_first_row($decoded),
        ]);
    }

    if ($action === 'upsert_many') {
        $items = $data['items'] ?? null;
        if (!is_array($items) || count($items) === 0) {
            throw new Exception('items array is required for upsert_many');
        }

        $payload = array_map(
            static fn($item) => settings_normalize_item((array)$item, $handlerId),
            $items
        );

        [$code, $decoded, $rawResp] = settings_supabase_request(
            'POST',
            $baseUrl . '/rest/v1/system_settings?on_conflict=setting_key',
            $serviceKey,
            $payload,
            true
        );
        if ($code < 200 || $code >= 300) {
            $msg = is_array($decoded) ? json_encode($decoded, JSON_UNESCAPED_UNICODE) : (string)$rawResp;
            throw new Exception('Failed to upsert settings: ' . $msg);
        }

        settings_api_json(200, true, 'Settings saved', [
            'rows' => is_array($decoded) ? $decoded : [],
        ]);
    }

    settings_api_json(400, false, 'Unsupported action');
}

try {
    settings_load_runtime_env();

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        settings_handle_get();
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        settings_handle_post();
    }

    settings_api_json(405, false, 'Method not allowed');
} catch (Throwable $e) {
    $errorId = api_log_exception('settings.api', $e);
    $data = ['error_id' => $errorId];
    if (isset($_GET['debug']) && (string)$_GET['debug'] === '1') {
        $data['error'] = api_redact_sensitive($e->getMessage());
    }
    settings_api_json(500, false, 'Internal server error', $data);
}
