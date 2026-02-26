<?php
declare(strict_types=1);

function api_is_production_env(): bool {
    $appEnv = strtolower(trim((string)(getenv('APP_ENV') ?: getenv('NODE_ENV') ?: '')));
    if (in_array($appEnv, ['prod', 'production'], true)) {
        return true;
    }

    $host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    if ($host === '') {
        return false;
    }

    return !str_contains($host, 'localhost') && !str_contains($host, '127.0.0.1');
}

function api_apply_security_headers(array $options = []): void {
    $contentType = (string)($options['content_type'] ?? 'application/json; charset=utf-8');
    $allowOrigin = (string)($options['allow_origin'] ?? '*');
    $allowMethods = (string)($options['allow_methods'] ?? 'GET, POST, OPTIONS');
    $allowHeaders = (string)($options['allow_headers'] ?? 'Content-Type, Authorization');
    $enableCsp = array_key_exists('enable_csp', $options) ? (bool)$options['enable_csp'] : true;
    $cspValue = (string)($options['csp'] ?? "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");

    header('Content-Type: ' . $contentType);
    header('Access-Control-Allow-Origin: ' . $allowOrigin);
    header('Access-Control-Allow-Methods: ' . $allowMethods);
    header('Access-Control-Allow-Headers: ' . $allowHeaders);

    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: strict-origin');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');

    if ($enableCsp && api_is_production_env()) {
        header('Content-Security-Policy: ' . $cspValue);
    }
}

function api_apply_no_store_headers(): void {
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0, private');
    header('Pragma: no-cache');
    header('Expires: 0');
}
