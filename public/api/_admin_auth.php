<?php
declare(strict_types=1);

require_once __DIR__ . '/_auth0.php';
require_once __DIR__ . '/_supabase.php';

function api_authz_env_required(string $key): string {
    $value = trim((string)(getenv($key) ?: ''));
    if ($value === '') {
        throw new Exception('Missing required environment variable: ' . $key);
    }
    return $value;
}

function api_authz_supabase_request(string $method, string $url, string $serviceKey): array {
    $headers = [
        'apikey: ' . $serviceKey,
        'Authorization: Bearer ' . $serviceKey,
        'Content-Type: application/json',
    ];

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 20,
    ]);

    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($resp === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new Exception('Supabase request failed: ' . $err);
    }
    curl_close($ch);

    return [$code, json_decode($resp, true), $resp];
}

function api_authz_first_row($decoded): ?array {
    if (is_array($decoded) && array_is_list($decoded)) {
        return count($decoded) > 0 && is_array($decoded[0]) ? $decoded[0] : null;
    }
    return is_array($decoded) ? $decoded : null;
}

function api_authz_is_admin(array $handler): bool {
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
        || !empty($permissions['manage_settings'])
        || !empty($permissions['manage_translations']);
}

function api_authz_fetch_handler(string $baseUrl, string $serviceKey, array $claims): ?array {
    $sub = trim((string)($claims['sub'] ?? ''));
    $email = trim((string)($claims['email'] ?? ''));

    if ($sub !== '') {
        $urlBySub = $baseUrl
            . '/rest/v1/handlers?select=id,name,email,user_id,active,roles,permissions'
            . '&user_id=eq.' . rawurlencode($sub)
            . '&limit=1';
        [$code, $decoded, $raw] = api_authz_supabase_request('GET', $urlBySub, $serviceKey);
        if ($code >= 200 && $code < 300) {
            $row = api_authz_first_row($decoded);
            if (is_array($row)) {
                return $row;
            }
        } else {
            $msg = is_array($decoded) ? json_encode($decoded, JSON_UNESCAPED_UNICODE) : (string)$raw;
            throw new Exception('Failed to load handler profile by sub: ' . $msg);
        }
    }

    if ($email !== '') {
        $urlByEmail = $baseUrl
            . '/rest/v1/handlers?select=id,name,email,user_id,active,roles,permissions'
            . '&email=ilike.' . rawurlencode($email)
            . '&limit=1';
        [$code, $decoded, $raw] = api_authz_supabase_request('GET', $urlByEmail, $serviceKey);
        if ($code >= 200 && $code < 300) {
            $row = api_authz_first_row($decoded);
            return is_array($row) ? $row : null;
        }
        $msg = is_array($decoded) ? json_encode($decoded, JSON_UNESCAPED_UNICODE) : (string)$raw;
        throw new Exception('Failed to load handler profile by email: ' . $msg);
    }

    return null;
}

function api_authz_require_admin(callable $deny): array {
    $token = auth0_get_bearer_token();
    if ($token === '') {
        $deny(401, 'Authorization token required');
    }

    $auth0Domain = api_authz_env_required('VITE_AUTH0_DOMAIN');
    $auth0Audience = auth0_expected_api_audience($auth0Domain);
    $auth0ClientId = api_authz_env_required('VITE_AUTH0_CLIENT_ID');
    $claims = auth0_verify_access_token($token, $auth0Domain, $auth0Audience, $auth0ClientId);

    $baseUrl = rtrim(api_authz_env_required('VITE_SUPABASE_URL'), '/');
    $serviceKey = supabase_get_service_role_key();

    $handler = api_authz_fetch_handler($baseUrl, $serviceKey, $claims);
    if (!$handler || empty($handler['active'])) {
        $deny(403, 'Handler account not active or not found');
    }
    if (!api_authz_is_admin($handler)) {
        $deny(403, 'Admin permissions required');
    }

    return [
        'claims' => $claims,
        'handler' => $handler,
        'base_url' => $baseUrl,
        'service_key' => $serviceKey,
    ];
}
