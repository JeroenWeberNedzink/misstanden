<?php
declare(strict_types=1);
/**
 * mfa.api.php
 * Proxy for Auth0 MFA endpoints (browser-safe)
 * Supported actions:
 * - check_status
 * - start_enrollment
 * - verify_enrollment
 * - delete_all
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

$debugMode = (isset($_GET['debug']) && $_GET['debug'] === '1');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'OK'], JSON_UNESCAPED_UNICODE);
    exit;
}

ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/../../php-errors.log');
ini_set('display_errors', '0');
error_reporting(E_ALL);

// Debug probe without auth token
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $debugMode) {
    $auth0Domain = getenv('VITE_AUTH0_DOMAIN') ?: 'nedzinkbv.eu.auth0.com';
    echo json_encode([
        'success' => true,
        'message' => 'Debug probe (no request made to Auth0)',
        'debug' => [
            'auth0_domain' => $auth0Domain,
            'base_url' => 'https://' . $auth0Domain . '/mfa',
            'curl_available' => function_exists('curl_init'),
            'allow_url_fopen' => (bool)ini_get('allow_url_fopen')
        ]
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function load_env_file(string $file, bool $override = true): void {
    if (!is_file($file)) return;
    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) continue;
        if (!str_contains($line, '=')) continue;
        [$key, $val] = explode('=', $line, 2);
        $key = trim($key);
        $val = trim($val);
        if ((str_starts_with($val, '"') && str_ends_with($val, '"')) || (str_starts_with($val, "'") && str_ends_with($val, "'"))) {
            $val = substr($val, 1, -1);
        }
        if ($override || getenv($key) === false) {
            putenv("$key=$val");
            $_ENV[$key] = $val;
        }
    }
}

function auth0_request(string $method, string $url, string $token, ?array $body = null): array {
    $headers = [
        'Authorization: Bearer ' . $token,
        'Content-Type: application/json'
    ];

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        }
        $response = curl_exec($ch);
        $err = curl_error($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return [$status, $response, $err];
    }

    if (!filter_var(ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN)) {
        return [0, null, 'allow_url_fopen is disabled and curl is not available'];
    }

    $context = [
        'http' => [
            'method' => $method,
            'header' => implode("\r\n", $headers),
            'ignore_errors' => true,
            'content' => $body !== null ? json_encode($body) : null,
            'timeout' => 10
        ]
    ];
    $ctx = stream_context_create($context);
    $response = @file_get_contents($url, false, $ctx);
    $status = 0;
    $err = '';
    if (isset($http_response_header) && is_array($http_response_header)) {
        foreach ($http_response_header as $h) {
            if (preg_match('#HTTP/\\S+\\s+(\\d+)#', $h, $m)) {
                $status = (int)$m[1];
                break;
            }
        }
    }
    if ($response === false) {
        $err = 'file_get_contents failed';
    }
    return [$status, $response, $err];
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    load_env_file(__DIR__ . '/../../.env.local', true);
    load_env_file(__DIR__ . '/../../.env', false);

    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?? '', true);
    if (!is_array($data)) {
        throw new Exception('Invalid JSON payload');
    }

    $action = (string)($data['action'] ?? '');
    $token = (string)($data['access_token'] ?? '');
    $otp = (string)($data['otp'] ?? '');

    if ($action === '' || $token === '') {
        throw new Exception('action and access_token are required');
    }

    $auth0Domain = getenv('VITE_AUTH0_DOMAIN') ?: 'nedzinkbv.eu.auth0.com';
    $baseUrl = 'https://' . $auth0Domain . '/mfa';

    if ($action === 'check_status') {
        [$status, $body, $err] = auth0_request('GET', $baseUrl . '/authenticators', $token);
        if ($status >= 200 && $status < 300) {
            $authenticators = json_decode($body ?? '[]', true);
            $hasActive = false;
            if (is_array($authenticators)) {
                foreach ($authenticators as $auth) {
                    if (!empty($auth['active'])) { $hasActive = true; break; }
                }
            }
            echo json_encode(['success' => true, 'data' => [
                'has_active' => $hasActive,
                'authenticators' => $authenticators
            ]], JSON_UNESCAPED_UNICODE);
            exit;
        }
        throw new Exception('Auth0 error: ' . $status . ' ' . ($err ?: $body));
    }

    if ($action === 'start_enrollment') {
        [$status, $body, $err] = auth0_request('POST', $baseUrl . '/associate', $token, [
            'authenticator_types' => ['otp']
        ]);
        if ($status >= 200 && $status < 300) {
            $payload = json_decode($body ?? '{}', true);
            echo json_encode(['success' => true, 'data' => $payload], JSON_UNESCAPED_UNICODE);
            exit;
        }
        throw new Exception('Auth0 error: ' . $status . ' ' . ($err ?: $body));
    }

    if ($action === 'verify_enrollment') {
        if ($otp === '') throw new Exception('otp is required');
        [$status, $body, $err] = auth0_request('PATCH', $baseUrl . '/associate', $token, [
            'otp' => $otp
        ]);
        if ($status >= 200 && $status < 300) {
            echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
            exit;
        }
        throw new Exception('Auth0 error: ' . $status . ' ' . ($err ?: $body));
    }

    if ($action === 'delete_all') {
        [$status, $body, $err] = auth0_request('GET', $baseUrl . '/authenticators', $token);
        if (!($status >= 200 && $status < 300)) {
            throw new Exception('Auth0 error: ' . $status . ' ' . ($err ?: $body));
        }
        $authenticators = json_decode($body ?? '[]', true);
        if (is_array($authenticators)) {
            foreach ($authenticators as $auth) {
                if (empty($auth['id'])) continue;
                auth0_request('DELETE', $baseUrl . '/authenticators/' . $auth['id'], $token);
            }
        }
        echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
        exit;
    }

    throw new Exception('Unknown action');
} catch (Throwable $e) {
    http_response_code(500);
    $payload = [
        'success' => false,
        'message' => $e->getMessage()
    ];
    if ($debugMode) {
        $payload['debug'] = [
            'action' => $action ?? null,
            'auth0_domain' => $auth0Domain ?? null,
            'base_url' => $baseUrl ?? null
        ];
    }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}
