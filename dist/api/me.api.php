<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_admin_auth.php';
require_once __DIR__ . '/_errors.php';
require_once __DIR__ . '/_security_headers.php';

api_apply_security_headers([
    'allow_methods' => 'GET, OPTIONS',
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

function me_json(int $status, bool $success, string $message, $data = null): void {
    http_response_code($status);
    echo json_encode(
        ['success' => $success, 'message' => $message, 'data' => $data],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

try {
    load_env_file(__DIR__ . '/../../.env.local', true);
    load_env_file(__DIR__ . '/../../.env', false);

    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        me_json(405, false, 'Method not allowed');
    }

    $token = auth0_get_bearer_token();
    if ($token === '') {
        me_json(401, false, 'Authorization token required');
    }

    $auth0Domain = api_authz_env_required('VITE_AUTH0_DOMAIN');
    $auth0Audience = auth0_expected_api_audience();
    $auth0ClientId = api_authz_env_required('VITE_AUTH0_CLIENT_ID');
    $claims = auth0_verify_access_token($token, $auth0Domain, $auth0Audience, $auth0ClientId);

    $baseUrl = rtrim(api_authz_env_required('VITE_SUPABASE_URL'), '/');
    $serviceKey = supabase_get_service_role_key();

    $handler = api_authz_fetch_handler($baseUrl, $serviceKey, $claims);
    if (!$handler || empty($handler['active'])) {
        me_json(403, false, 'Handler account not active or not found');
    }

    me_json(200, true, 'Handler context loaded', [
        'handler' => $handler,
        'is_admin' => api_authz_is_admin($handler),
        'claims_sub' => (string)($claims['sub'] ?? ''),
    ]);
} catch (Throwable $e) {
    $errorId = api_log_exception('me.api', $e);
    me_json(500, false, 'Internal server error', ['error_id' => $errorId]);
}
