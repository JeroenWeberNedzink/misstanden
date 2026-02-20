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
require_once __DIR__ . '/_supabase.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'OK'], JSON_UNESCAPED_UNICODE);
    exit;
}

ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/../../php-errors.log');
ini_set('display_errors', '0');
error_reporting(E_ALL);

function settings_api_json(int $status, bool $success, string $message, $data = null): void {
    http_response_code($status);
    echo json_encode(
        ['success' => $success, 'message' => $message, 'data' => $data],
        JSON_UNESCAPED_UNICODE
    );
    exit;
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

    $decoded = json_decode($resp, true);
    return [$code, $decoded, $resp];
}

function settings_get_first_row($decoded) {
    if (is_array($decoded) && array_is_list($decoded)) {
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

function settings_require_admin_context(): array {
    $token = auth0_get_bearer_token();
    if ($token === '') {
        settings_api_json(401, false, 'Authorization token required');
    }

    $auth0Domain = settings_get_env_required('VITE_AUTH0_DOMAIN');
    $auth0ClientId = settings_get_env_required('VITE_AUTH0_CLIENT_ID');
    $claims = auth0_verify_id_token($token, $auth0Domain, $auth0ClientId);

    $baseUrl = settings_get_supabase_url();
    $serviceKey = settings_get_supabase_service_key();
    $handler = settings_fetch_handler_profile($baseUrl, $serviceKey, $claims);
    if (!$handler || empty($handler['active'])) {
        settings_api_json(403, false, 'Handler account not active or not found');
    }
    if (!settings_is_admin_profile($handler)) {
        settings_api_json(403, false, 'Admin permissions required');
    }

    return ['claims' => $claims, 'handler' => $handler];
}

function settings_handle_get(): void {
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

    $hasBearer = auth0_get_bearer_token() !== '';
    $adminContext = null;
    if ($includeSensitive || $hasBearer) {
        $adminContext = settings_require_admin_context();
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
    $ctx = settings_require_admin_context();
    $handlerId = (string)($ctx['handler']['id'] ?? '');

    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?? '', true);
    if (!is_array($data)) {
        throw new Exception('Invalid JSON payload');
    }

    $action = strtolower(trim((string)($data['action'] ?? '')));
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
    load_env_file(__DIR__ . '/../../.env.local', true);
    load_env_file(__DIR__ . '/../../.env', false);

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        settings_handle_get();
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        settings_handle_post();
    }

    settings_api_json(405, false, 'Method not allowed');
} catch (Throwable $e) {
    settings_api_json(500, false, $e->getMessage());
}
