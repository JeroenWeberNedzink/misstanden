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
    load_runtime_env(__DIR__);

    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        me_json(405, false, 'Method not allowed');
    }

    $ctx = api_authz_require_active_handler(static function (int $status, string $message): void {
        me_json($status, false, $message);
    });
    $claims = (array)($ctx['claims'] ?? []);
    $handler = (array)($ctx['handler'] ?? []);

    me_json(200, true, 'Handler context loaded', [
        'handler' => $handler,
        'is_admin' => api_authz_is_admin($handler),
        'claims_sub' => (string)($claims['sub'] ?? ''),
    ]);
} catch (Throwable $e) {
    $errorId = api_log_exception('me.api', $e);
    $data = ['error_id' => $errorId];
    if (isset($_GET['debug']) && (string)$_GET['debug'] === '1') {
        $data['error'] = api_redact_sensitive($e->getMessage());
        $data['diagnostics'] = array_merge(
            auth0_ssl_diagnostics(),
            [
                'env_present' => [
                    'VITE_AUTH0_DOMAIN' => trim((string)(getenv('VITE_AUTH0_DOMAIN') ?: '')) !== '',
                    'VITE_AUTH0_CLIENT_ID' => trim((string)(getenv('VITE_AUTH0_CLIENT_ID') ?: '')) !== '',
                    'VITE_AUTH0_AUDIENCE' => trim((string)(getenv('VITE_AUTH0_AUDIENCE') ?: '')) !== '',
                    'SQLSERVER_HOST' => trim((string)(getenv('SQLSERVER_HOST') ?: '')) !== '',
                    'SQLSERVER_DATABASE' => trim((string)(getenv('SQLSERVER_DATABASE') ?: '')) !== '',
                    'SQLSERVER_USERNAME' => trim((string)(getenv('SQLSERVER_USERNAME') ?: '')) !== '',
                    'SQLSERVER_PASSWORD' => trim((string)(getenv('SQLSERVER_PASSWORD') ?: '')) !== '',
                ],
            ]
        );
    }
    me_json(500, false, 'Internal server error', $data);
}
