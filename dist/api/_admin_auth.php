<?php
declare(strict_types=1);

require_once __DIR__ . '/_auth0.php';
require_once __DIR__ . '/_sqlserver.php';
require_once __DIR__ . '/_scopes.php';

function api_authz_env_required(string $key): string {
    $value = trim((string)(getenv($key) ?: ''));
    if ($value === '') {
        throw new Exception('Missing required environment variable: ' . $key);
    }
    return $value;
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

function api_authz_sql_handler_role_codes(string $handlerId): array {
    $rows = sqlserver_query(
        'SELECT DISTINCT r.code
         FROM dbo.handler_roles hr
         INNER JOIN dbo.roles r ON r.id = hr.role_id
         WHERE hr.handler_id = @handler_id
         ORDER BY r.code ASC',
        ['handler_id' => $handlerId]
    );

    $codes = [];
    foreach ($rows as $row) {
        $code = strtoupper(trim((string)($row['code'] ?? '')));
        if ($code !== '' && !in_array($code, $codes, true)) {
            $codes[] = $code;
        }
    }

    return $codes;
}

function api_authz_sql_handler_permissions(string $handlerId): array {
    $rows = sqlserver_query(
        'SELECT DISTINCT p.code
         FROM dbo.handler_roles hr
         INNER JOIN dbo.role_permissions rp ON rp.role_id = hr.role_id
         INNER JOIN dbo.permissions p ON p.id = rp.permission_id
         WHERE hr.handler_id = @handler_id
         ORDER BY p.code ASC',
        ['handler_id' => $handlerId]
    );

    $permissions = [];
    foreach ($rows as $row) {
        $code = trim((string)($row['code'] ?? ''));
        if ($code !== '') {
            $permissions[$code] = true;
        }
    }

    return $permissions;
}

function api_authz_sql_hydrate_handler(array $row): array {
    $handlerId = trim((string)($row['id'] ?? ''));
    if ($handlerId === '') {
        return api_authz_normalize_handler($row);
    }

    $normalized = api_authz_normalize_handler($row);
    $roleCodes = api_authz_sql_handler_role_codes($handlerId);
    $permissions = is_array($normalized['permissions'] ?? null) ? $normalized['permissions'] : [];

    foreach (api_authz_sql_handler_permissions($handlerId) as $code => $allowed) {
        if ($allowed) {
            $permissions[$code] = true;
        }
    }

    $existingRoles = is_array($normalized['roles'] ?? null) ? $normalized['roles'] : [];
    foreach ($roleCodes as $roleCode) {
        if (!in_array($roleCode, $existingRoles, true)) {
            $existingRoles[] = $roleCode;
        }
    }

    $normalized['roles'] = $existingRoles;
    $normalized['permissions'] = $permissions;

    return api_authz_normalize_handler($normalized);
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
        $rows = sqlserver_query(
            'SELECT TOP 1 id, name, email, user_id, active, roles, permissions
             FROM dbo.handlers
             WHERE user_id = @sub',
            ['sub' => $sub]
        );
        if (!empty($rows[0]) && is_array($rows[0])) {
            return api_authz_sql_hydrate_handler($rows[0]);
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
            return api_authz_sql_hydrate_handler($rows[0]);
        }
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

    $handler = api_authz_fetch_handler('', '', $claims);
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
        'base_url' => '',
        'service_key' => '',
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

    $handler = api_authz_fetch_handler('', '', $claims);
    if (!$handler || empty($handler['active'])) {
        $deny(403, 'Handler account not active or not found');
    }

    return [
        'claims' => $claims,
        'handler' => $handler,
        'base_url' => '',
        'service_key' => '',
    ];
}
