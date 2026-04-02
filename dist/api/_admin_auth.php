<?php
declare(strict_types=1);

require_once __DIR__ . '/_auth0.php';
require_once __DIR__ . '/_supabase.php';
require_once __DIR__ . '/_sqlserver.php';
require_once __DIR__ . '/_scopes.php';

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
    $curlOptions = [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 20,
    ];
    auth0_apply_ssl_options($curlOptions, $url);
    curl_setopt_array($ch, $curlOptions);

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

function api_authz_normalize_handler(array $row): array {
    $rolesRaw = $row['roles'] ?? [];
    if (is_string($rolesRaw)) {
        $decodedRoles = json_decode($rolesRaw, true);
        $rolesRaw = is_array($decodedRoles) ? $decodedRoles : [$rolesRaw];
    }
    if (!is_array($rolesRaw)) {
        $rolesRaw = [];
    }
    $row['roles'] = array_values(array_filter($rolesRaw, static fn($value) => trim((string)$value) !== ''));

    $permissionsRaw = $row['permissions'] ?? [];
    if (is_string($permissionsRaw)) {
        $decodedPermissions = json_decode($permissionsRaw, true);
        $permissionsRaw = is_array($decodedPermissions) ? $decodedPermissions : [];
    }
    if (!is_array($permissionsRaw)) {
        $permissionsRaw = [];
    }

    // Guard against malformed payloads where a JSON string was spread into char-index keys.
    $cleanPermissions = [];
    foreach ($permissionsRaw as $key => $value) {
        $normalizedKey = trim((string)$key);
        if ($normalizedKey === '' || ctype_digit($normalizedKey)) {
            continue;
        }
        $cleanPermissions[$normalizedKey] = $value;
    }
    $row['permissions'] = $cleanPermissions;

    return $row;
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

    if (sqlserver_is_configured()) {
        if ($sub !== '') {
            $rows = sqlserver_query(
                'SELECT TOP 1 id, name, email, user_id, active, roles, permissions
                 FROM dbo.handlers
                 WHERE user_id = @sub',
                ['sub' => $sub]
            );
            if (!empty($rows[0]) && is_array($rows[0])) {
                return api_authz_normalize_handler($rows[0]);
            }
        }

        if ($email !== '') {
            $rows = sqlserver_query(
                'SELECT TOP 1 id, name, email, user_id, active, roles, permissions
                 FROM dbo.handlers
                 WHERE LOWER(email) = LOWER(@email)',
                ['email' => $email]
            );
            if (!empty($rows[0]) && is_array($rows[0])) {
                return api_authz_normalize_handler($rows[0]);
            }
        }

        return null;
    }

    if ($sub !== '') {
        $urlBySub = $baseUrl
            . '/rest/v1/handlers?select=id,name,email,user_id,active,roles,permissions'
            . '&user_id=eq.' . rawurlencode($sub)
            . '&limit=1';
        [$code, $decoded, $raw] = api_authz_supabase_request('GET', $urlBySub, $serviceKey);
        if ($code >= 200 && $code < 300) {
            $row = api_authz_first_row($decoded);
            if (is_array($row)) {
                return api_authz_normalize_handler($row);
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
            return is_array($row) ? api_authz_normalize_handler($row) : null;
        }
        $msg = is_array($decoded) ? json_encode($decoded, JSON_UNESCAPED_UNICODE) : (string)$raw;
        throw new Exception('Failed to load handler profile by email: ' . $msg);
    }

    return null;
}

function api_authz_require_admin(callable $deny, array $requiredScopes = []): array {
    $token = auth0_get_bearer_token();
    if ($token === '') {
        $deny(401, 'Authorization token required');
    }

    $auth0Domain = api_authz_env_required('VITE_AUTH0_DOMAIN');
    $auth0Audience = auth0_expected_api_audience();
    $auth0ClientId = api_authz_env_required('VITE_AUTH0_CLIENT_ID');
    $claims = auth0_verify_access_token($token, $auth0Domain, $auth0Audience, $auth0ClientId);

    $baseUrl = sqlserver_is_configured() ? '' : rtrim(api_authz_env_required('VITE_SUPABASE_URL'), '/');
    $serviceKey = sqlserver_is_configured() ? '' : supabase_get_service_role_key();

    $handler = api_authz_fetch_handler($baseUrl, $serviceKey, $claims);
    if (!$handler || empty($handler['active'])) {
        $deny(403, 'Handler account not active or not found');
    }
    if (!api_authz_is_admin($handler)) {
        $deny(403, 'Admin permissions required');
    }
    require_scopes($claims, $requiredScopes, $deny);

    return [
        'claims' => $claims,
        'handler' => $handler,
        'base_url' => $baseUrl,
        'service_key' => $serviceKey,
    ];
}

function api_authz_require_active_handler(callable $deny): array {
    $token = auth0_get_bearer_token();
    if ($token === '') {
        $deny(401, 'Authorization token required');
    }

    $auth0Domain = api_authz_env_required('VITE_AUTH0_DOMAIN');
    $auth0Audience = auth0_expected_api_audience();
    $auth0ClientId = api_authz_env_required('VITE_AUTH0_CLIENT_ID');
    $claims = auth0_verify_access_token($token, $auth0Domain, $auth0Audience, $auth0ClientId);

    $baseUrl = sqlserver_is_configured() ? '' : rtrim(api_authz_env_required('VITE_SUPABASE_URL'), '/');
    $serviceKey = sqlserver_is_configured() ? '' : supabase_get_service_role_key();

    $handler = api_authz_fetch_handler($baseUrl, $serviceKey, $claims);
    if (!$handler || empty($handler['active'])) {
        $deny(403, 'Handler account not active or not found');
    }

    return [
        'claims' => $claims,
        'handler' => $handler,
        'base_url' => $baseUrl,
        'service_key' => $serviceKey,
    ];
}
