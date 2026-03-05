<?php
declare(strict_types=1);

// PHP 7 compatibility for shared string helpers used across API files.
if (!function_exists('str_contains')) {
    function str_contains(string $haystack, string $needle): bool {
        if ($needle === '') {
            return true;
        }
        return strpos($haystack, $needle) !== false;
    }
}

if (!function_exists('str_starts_with')) {
    function str_starts_with(string $haystack, string $needle): bool {
        if ($needle === '') {
            return true;
        }
        return substr($haystack, 0, strlen($needle)) === $needle;
    }
}

if (!function_exists('str_ends_with')) {
    function str_ends_with(string $haystack, string $needle): bool {
        if ($needle === '') {
            return true;
        }
        $len = strlen($needle);
        if ($len > strlen($haystack)) {
            return false;
        }
        return substr($haystack, -$len) === $needle;
    }
}

if (!function_exists('array_is_list')) {
    function array_is_list(array $array): bool {
        $i = 0;
        foreach (array_keys($array) as $key) {
            if ($key !== $i++) {
                return false;
            }
        }
        return true;
    }
}

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
