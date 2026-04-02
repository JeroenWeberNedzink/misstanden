<?php
declare(strict_types=1);
/**
 * security-self-test.api.php
 * Admin-only diagnostics endpoint for deployment-time security checks.
 */

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_admin_auth.php';
require_once __DIR__ . '/_auth0.php';
require_once __DIR__ . '/_supabase.php';
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

const SECURITY_SELF_TEST_SCOPES_READ = [
    'admin:security:read',
    'read:security',
    'manage:security',
    'admin:all',
    'admin',
];

function security_self_test_json(int $status, bool $success, string $message, array $data = []): void {
    http_response_code($status);
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function security_env_present(string $key): bool {
    return trim((string)(getenv($key) ?: '')) !== '';
}

function security_any_env_present(array $keys): bool {
    foreach ($keys as $key) {
        if (security_env_present((string)$key)) {
            return true;
        }
    }
    return false;
}

function security_signed_url_ttl_seconds(): int {
    $candidates = [
        getenv('ATTACHMENT_SIGNED_URL_TTL') ?: '',
        getenv('SIGNED_URL_TTL') ?: '',
    ];
    foreach ($candidates as $raw) {
        if (is_numeric($raw)) {
            $ttl = (int)$raw;
            if ($ttl > 0) {
                return $ttl;
            }
        }
    }

    // Current API default in tickets attachment signing helper.
    return 120;
}

function security_rate_limit_storage_writable(): bool {
    $dir = __DIR__ . '/../../run/rate-limits';
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
        return false;
    }
    return is_writable($dir);
}

try {
    load_runtime_env(__DIR__);

    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        security_self_test_json(405, false, 'Method not allowed');
    }

    $adminCtx = api_authz_require_admin(static function (int $status, string $message): void {
        security_self_test_json($status, false, $message);
    }, SECURITY_SELF_TEST_SCOPES_READ);

    $audienceConfigured = true;
    try {
        auth0_expected_api_audience();
    } catch (Throwable $e) {
        $audienceConfigured = false;
    }

    $serviceRoleConfigured = true;
    try {
        supabase_get_service_role_key();
    } catch (Throwable $e) {
        $serviceRoleConfigured = false;
    }

    $emailKeyReadable = true;
    try {
        get_email_crypto_key();
    } catch (Throwable $e) {
        $emailKeyReadable = false;
    }

    $signedUrlTtl = security_signed_url_ttl_seconds();
    $checks = [
        'auth0_domain_configured' => security_env_present('VITE_AUTH0_DOMAIN'),
        'auth0_client_id_configured' => security_env_present('VITE_AUTH0_CLIENT_ID'),
        'auth0_audience_configured' => $audienceConfigured,
        'jwt_verify_function_available' => function_exists('auth0_verify_access_token'),
        'supabase_url_configured' => security_env_present('VITE_SUPABASE_URL'),
        'supabase_service_key_env_present' => security_any_env_present(['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY']),
        'supabase_service_role_key_valid' => $serviceRoleConfigured,
        'email_crypto_key_configured' => security_env_present('EMAIL_ENC_KEY_PATH') || is_file(__DIR__ . '/../../private/keys/email_enc.key'),
        'email_crypto_key_readable' => $emailKeyReadable,
        'rate_limit_storage_writable' => security_rate_limit_storage_writable(),
        'sla_cron_key_configured' => security_env_present('SLA_BACKFILL_CRON_KEY'),
        'signed_url_ttl_within_threshold' => $signedUrlTtl <= 120,
    ];

    $allPassed = true;
    foreach ($checks as $ok) {
        if ($ok !== true) {
            $allPassed = false;
            break;
        }
    }

    security_self_test_json(200, true, 'Security self-test completed', [
        'checked_at' => gmdate('c'),
        'all_passed' => $allPassed,
        'checks' => $checks,
        'config' => [
            'signed_url_ttl_seconds' => $signedUrlTtl,
            'csp_production_mode' => api_is_production_env(),
        ],
        'actor' => [
            'handler_id' => (string)($adminCtx['handler']['id'] ?? ''),
            'is_admin' => true,
        ],
    ]);
} catch (Throwable $e) {
    $errorId = api_log_exception('security-self-test.api', $e);
    security_self_test_json(500, false, 'Internal server error', ['error_id' => $errorId]);
}
