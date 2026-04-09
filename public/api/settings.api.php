<?php
declare(strict_types=1);
/**
 * settings.api.php
 * SQL Server backed system settings endpoint.
 */

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_admin_auth.php';
require_once __DIR__ . '/_errors.php';
require_once __DIR__ . '/_security_headers.php';
require_once __DIR__ . '/_rate_limit.php';
require_once __DIR__ . '/_scopes.php';
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

function settings_debug_diagnostics(): array {
    return [
        'env_present' => [
            'VITE_AUTH0_DOMAIN' => trim((string)(getenv('VITE_AUTH0_DOMAIN') ?: '')) !== '',
            'VITE_AUTH0_CLIENT_ID' => trim((string)(getenv('VITE_AUTH0_CLIENT_ID') ?: '')) !== '',
            'VITE_AUTH0_AUDIENCE' => trim((string)(getenv('VITE_AUTH0_AUDIENCE') ?: '')) !== '',
            'SQLSERVER_HOST' => trim((string)(getenv('SQLSERVER_HOST') ?: '')) !== '',
            'SQLSERVER_DATABASE' => trim((string)(getenv('SQLSERVER_DATABASE') ?: '')) !== '',
            'SQLSERVER_USERNAME' => trim((string)(getenv('SQLSERVER_USERNAME') ?: '')) !== '',
            'SQLSERVER_PASSWORD' => trim((string)(getenv('SQLSERVER_PASSWORD') ?: '')) !== '',
        ],
    ];
}

function settings_decode_json($value) {
    if (is_array($value)) {
        return $value;
    }
    if (!is_string($value)) {
        return $value;
    }
    $trimmed = trim($value);
    if ($trimmed === '') {
        return [];
    }
    $decoded = json_decode($trimmed, true);
    return json_last_error() === JSON_ERROR_NONE ? $decoded : $value;
}

function settings_normalize_row(array $row): array {
    if (array_key_exists('setting_value', $row)) {
        $row['setting_value'] = settings_decode_json($row['setting_value']);
    }
    return $row;
}

function settings_env_list(string $key): array {
    $raw = trim((string)(getenv($key) ?: ''));
    if ($raw === '') {
        return [];
    }
    return array_values(array_filter(array_map(
        static fn($item) => trim((string)$item),
        explode(',', $raw)
    ), static fn($item) => $item !== ''));
}

function settings_is_super_admin_profile(array $handler, array $claims = []): bool {
    $roles = $handler['roles'] ?? [];
    if (is_string($roles)) {
        $decoded = json_decode($roles, true);
        $roles = is_array($decoded) ? $decoded : [$roles];
    }
    $roles = array_map(static fn($role) => strtoupper(trim((string)$role)), is_array($roles) ? $roles : []);
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

function settings_require_admin_context(array $requiredScopes = []): array {
    return api_authz_require_admin(
        static function (int $status, string $message): void {
            settings_api_json($status, false, $message);
        },
        $requiredScopes
    );
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

function settings_upsert_one(array $payload): array {
    $encodedValue = json_encode($payload['setting_value'] ?? [], JSON_UNESCAPED_UNICODE);
    if ($encodedValue === false) {
        throw new Exception('Failed to encode setting_value as JSON');
    }

    sqlserver_execute(
        'UPDATE dbo.system_settings
         SET
            setting_value = @setting_value,
            category = @category,
            description = @description,
            is_sensitive = @is_sensitive,
            updated_by = @updated_by,
            updated_at = SYSUTCDATETIME()
         WHERE setting_key = @setting_key',
        [
            'setting_value' => $encodedValue,
            'category' => $payload['category'],
            'description' => $payload['description'],
            'is_sensitive' => (bool)$payload['is_sensitive'],
            'updated_by' => $payload['updated_by'],
            'setting_key' => $payload['setting_key'],
        ]
    );

    $exists = (int)sqlserver_scalar(
        'SELECT COUNT(*) FROM dbo.system_settings WHERE setting_key = @setting_key',
        ['setting_key' => $payload['setting_key']]
    );

    if ($exists === 0) {
        sqlserver_execute(
            'INSERT INTO dbo.system_settings
                (id, setting_key, setting_value, category, description, is_sensitive, updated_by, updated_at, created_at)
             VALUES
                (@id, @setting_key, @setting_value, @category, @description, @is_sensitive, @updated_by, SYSUTCDATETIME(), SYSUTCDATETIME())',
            [
                'id' => $payload['id'],
                'setting_key' => $payload['setting_key'],
                'setting_value' => $encodedValue,
                'category' => $payload['category'],
                'description' => $payload['description'],
                'is_sensitive' => (bool)$payload['is_sensitive'],
                'updated_by' => $payload['updated_by'],
            ]
        );
    }

    $rows = sqlserver_query(
        'SELECT TOP 1
            id,
            setting_key,
            setting_value,
            category,
            description,
            is_sensitive,
            updated_by,
            updated_at
         FROM dbo.system_settings
         WHERE setting_key = @setting_key',
        ['setting_key' => $payload['setting_key']]
    );
    return settings_normalize_row($rows[0] ?? []);
}

function settings_handle_get(): void {
    api_apply_no_store_headers();

    $category = trim((string)($_GET['category'] ?? ''));
    $includeSensitive = in_array(
        strtolower(trim((string)($_GET['include_sensitive'] ?? ''))),
        ['1', 'true', 'yes', 'on'],
        true
    );
    $requireSuperAdmin = in_array(
        strtolower(trim((string)($_GET['require_super_admin'] ?? ''))),
        ['1', 'true', 'yes', 'on'],
        true
    );

    $adminContext = null;
    if ($includeSensitive || $requireSuperAdmin) {
        $adminContext = settings_require_admin_context(SETTINGS_SCOPES_READ);
        if (
            $requireSuperAdmin
            && !settings_is_super_admin_profile((array)($adminContext['handler'] ?? []), (array)($adminContext['claims'] ?? []))
        ) {
            settings_api_json(403, false, 'Super admin permissions required');
        }
    }

    $sql = 'SELECT
                id,
                setting_key,
                setting_value,
                category,
                description,
                is_sensitive,
                updated_by,
                updated_at
            FROM dbo.system_settings';
    $params = [];
    $where = [];
    if ($category !== '') {
        $where[] = 'category = @category';
        $params['category'] = $category;
    }
    if (!$adminContext) {
        $where[] = 'is_sensitive = @is_sensitive';
        $params['is_sensitive'] = false;
    }
    if ($where) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }
    $sql .= ' ORDER BY category ASC, setting_key ASC';

    $rows = array_map('settings_normalize_row', sqlserver_query($sql, $params));
    settings_api_json(200, true, 'Settings loaded', [
        'rows' => $rows,
        'is_admin' => (bool)$adminContext,
        'is_super_admin' => $adminContext
            ? settings_is_super_admin_profile((array)$adminContext['handler'], (array)$adminContext['claims'])
            : false,
        'warning' => null,
    ]);
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

    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?? '', true);
    if (!is_array($data)) {
        throw new Exception('Invalid JSON payload');
    }

    $requireSuperAdmin = !empty($data['require_super_admin']);
    if (
        $requireSuperAdmin
        && !settings_is_super_admin_profile((array)$ctx['handler'], (array)$ctx['claims'])
    ) {
        settings_api_json(403, false, 'Super admin permissions required');
    }

    $action = strtolower(trim((string)($data['action'] ?? '')));
    if ($action === 'upsert') {
        $item = $data['item'] ?? null;
        if (!is_array($item)) {
            throw new Exception('item object is required for upsert');
        }
        settings_api_json(200, true, 'Setting saved', [
            'row' => settings_upsert_one(settings_normalize_item($item, $handlerId)),
        ]);
    }

    if ($action === 'upsert_many') {
        $items = $data['items'] ?? null;
        if (!is_array($items) || count($items) === 0) {
            throw new Exception('items array is required for upsert_many');
        }

        $rows = [];
        foreach ($items as $item) {
            $rows[] = settings_upsert_one(settings_normalize_item((array)$item, $handlerId));
        }

        settings_api_json(200, true, 'Settings saved', ['rows' => $rows]);
    }

    settings_api_json(400, false, 'Unsupported action');
}

try {
    load_runtime_env(__DIR__);

    if (!sqlserver_is_configured()) {
        throw new Exception('SQL Server is not configured');
    }

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
        $data['diagnostics'] = settings_debug_diagnostics();
    }
    settings_api_json(500, false, 'Internal server error', $data);
}
