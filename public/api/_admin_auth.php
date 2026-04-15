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

function api_authz_auth0_request(string $method, string $url, string $token = '', ?array $payload = null): array {
    $headers = ['Content-Type: application/json'];
    if ($token !== '') {
        $headers[] = 'Authorization: Bearer ' . $token;
    }

    $ch = curl_init();
    $curlOptions = [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 20,
    ];
    if (function_exists('auth0_apply_ssl_options')) {
        auth0_apply_ssl_options($curlOptions, $url);
    }
    curl_setopt_array($ch, $curlOptions);

    if ($payload !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_UNICODE));
    }

    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($resp === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new Exception('Auth0 request failed: ' . $err);
    }
    curl_close($ch);

    $decoded = json_decode($resp, true);
    return [$code, is_array($decoded) ? $decoded : null, $resp];
}

function api_authz_auth0_error($decoded, string $raw): string {
    if (is_array($decoded)) {
        $parts = [];
        foreach (['error', 'error_description', 'message'] as $key) {
            $value = trim((string)($decoded[$key] ?? ''));
            if ($value !== '') {
                $parts[] = $value;
            }
        }
        if ($parts) {
            return implode(' ', array_unique($parts));
        }
    }
    return trim($raw) !== '' ? trim($raw) : 'Unknown Auth0 error';
}

function api_authz_mgmt_token_cache_file(string $domain): string {
    $dir = __DIR__ . '/../../run/cache';
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    $safeDomain = preg_replace('/[^a-z0-9_.-]/i', '_', $domain);
    return $dir . '/auth0-mgmt-token-' . $safeDomain . '.json';
}

function api_authz_mgmt_token_cached(string $domain): ?string {
    $file = api_authz_mgmt_token_cache_file($domain);
    if (!is_file($file)) {
        return null;
    }
    $raw = @file_get_contents($file);
    if (!is_string($raw) || trim($raw) === '') {
        return null;
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return null;
    }

    $token = trim((string)($decoded['access_token'] ?? ''));
    $expiresAt = (int)($decoded['expires_at'] ?? 0);
    if ($token === '' || $expiresAt <= (time() + 120)) {
        return null;
    }
    return $token;
}

function api_authz_mgmt_token_cache_write(string $domain, string $token, int $expiresIn): void {
    if ($token === '' || $expiresIn <= 0) {
        return;
    }
    @file_put_contents(api_authz_mgmt_token_cache_file($domain), json_encode([
        'access_token' => $token,
        'expires_at' => time() + $expiresIn,
    ], JSON_UNESCAPED_UNICODE));
}

function api_authz_management_token(string $domain): string {
    $cached = api_authz_mgmt_token_cached($domain);
    if ($cached !== null) {
        return $cached;
    }

    $staticToken = trim((string)(getenv('AUTH0_MGMT_API_TOKEN') ?: ''));
    if ($staticToken !== '') {
        return $staticToken;
    }

    $clientId = trim((string)(getenv('AUTH0_MGMT_CLIENT_ID') ?: getenv('AUTH0_CLIENT_ID') ?: ''));
    $clientSecret = trim((string)(getenv('AUTH0_MGMT_CLIENT_SECRET') ?: getenv('AUTH0_CLIENT_SECRET') ?: ''));
    $audience = trim((string)(getenv('AUTH0_MGMT_AUDIENCE') ?: ('https://' . $domain . '/api/v2/')));
    if ($clientId === '' || $clientSecret === '') {
        throw new Exception('Auth0 management API credentials are not configured');
    }

    [$code, $decoded, $raw] = api_authz_auth0_request('POST', 'https://' . $domain . '/oauth/token', '', [
        'grant_type' => 'client_credentials',
        'client_id' => $clientId,
        'client_secret' => $clientSecret,
        'audience' => $audience,
    ]);
    if ($code < 200 || $code >= 300 || !is_array($decoded)) {
        throw new Exception('Failed to obtain Auth0 management token: ' . api_authz_auth0_error($decoded, $raw));
    }

    $token = trim((string)($decoded['access_token'] ?? ''));
    if ($token === '') {
        throw new Exception('Auth0 management token response missing access_token');
    }
    api_authz_mgmt_token_cache_write($domain, $token, (int)($decoded['expires_in'] ?? 0));
    return $token;
}

function api_authz_auth0_domain(): string {
    $domain = trim((string)(getenv('AUTH0_DOMAIN') ?: getenv('VITE_AUTH0_DOMAIN') ?: ''));
    if ($domain === '') {
        throw new Exception('Missing required environment variable: VITE_AUTH0_DOMAIN');
    }
    return $domain;
}

function api_authz_fetch_auth0_user_by_id(string $userId): ?array {
    $userId = trim($userId);
    if ($userId === '') {
        return null;
    }
    try {
        $domain = api_authz_auth0_domain();
        $token = api_authz_management_token($domain);
        [$code, $decoded] = api_authz_auth0_request('GET', 'https://' . $domain . '/api/v2/users/' . rawurlencode($userId), $token);
        return ($code >= 200 && $code < 300 && is_array($decoded)) ? $decoded : null;
    } catch (Throwable $e) {
        error_log('Auth0 user lookup by id failed: ' . $e->getMessage());
        return null;
    }
}

function api_authz_email_variants(string $email): array {
    $email = trim($email);
    if ($email === '' || !str_contains($email, '@')) {
        return [];
    }

    [$local, $domain] = explode('@', $email, 2);
    $variants = [$email, strtolower($email)];
    $titleLocal = preg_replace_callback(
        '/(^|[._-])([a-z])/',
        static fn($m) => $m[1] . strtoupper($m[2]),
        strtolower($local)
    );
    if (is_string($titleLocal) && $titleLocal !== '') {
        $variants[] = $titleLocal . '@' . strtolower($domain);
    }

    return array_values(array_unique(array_filter($variants, static fn($v) => trim((string)$v) !== '')));
}

function api_authz_fetch_auth0_user_by_email(string $email): ?array {
    $email = trim($email);
    if ($email === '') {
        return null;
    }
    try {
        $domain = api_authz_auth0_domain();
        $token = api_authz_management_token($domain);
        foreach (api_authz_email_variants($email) as $variant) {
            [$code, $decoded] = api_authz_auth0_request('GET', 'https://' . $domain . '/api/v2/users-by-email?email=' . rawurlencode($variant), $token);
            if ($code >= 200 && $code < 300 && is_array($decoded) && !empty($decoded[0]) && is_array($decoded[0])) {
                return $decoded[0];
            }
        }

        $escaped = addcslashes($email, '\\"');
        [$code, $decoded] = api_authz_auth0_request(
            'GET',
            'https://' . $domain . '/api/v2/users?q=' . rawurlencode('email:"' . $escaped . '"') . '&search_engine=v3&per_page=1',
            $token
        );
        return ($code >= 200 && $code < 300 && is_array($decoded) && !empty($decoded[0]) && is_array($decoded[0])) ? $decoded[0] : null;
    } catch (Throwable $e) {
        error_log('Auth0 user lookup by email failed: ' . $e->getMessage());
        return null;
    }
}

function api_authz_has_verified_email(array $auth0User): bool {
    $email = trim((string)($auth0User['email'] ?? ''));
    if ($email === '') {
        return false;
    }
    return !array_key_exists('email_verified', $auth0User) || !empty($auth0User['email_verified']);
}

function api_authz_enrich_identity_claims(array $claims): array {
    if (trim((string)($claims['email'] ?? '')) !== '') {
        return $claims;
    }

    $sub = trim((string)($claims['sub'] ?? ''));
    if ($sub === '') {
        return $claims;
    }

    $auth0User = api_authz_fetch_auth0_user_by_id($sub);
    if (!$auth0User || !api_authz_has_verified_email($auth0User)) {
        return $claims;
    }

    foreach (['email', 'name', 'picture', 'email_verified'] as $key) {
        if (array_key_exists($key, $auth0User)) {
            $claims[$key] = $auth0User[$key];
        }
    }
    return $claims;
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

function api_authz_parse_code_list($raw, bool $uppercase = false): array {
    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
        $raw = json_last_error() === JSON_ERROR_NONE ? $decoded : [];
    }
    if (!is_array($raw)) {
        return [];
    }

    $codes = [];
    foreach ($raw as $item) {
        $value = is_array($item) ? ($item['code'] ?? null) : $item;
        $code = trim((string)$value);
        if ($code === '') {
            continue;
        }
        if ($uppercase) {
            $code = strtoupper($code);
        }
        if (!in_array($code, $codes, true)) {
            $codes[] = $code;
        }
    }

    return $codes;
}

function api_authz_sql_hydrate_handler(array $row): array {
    $handlerId = trim((string)($row['id'] ?? ''));
    if ($handlerId === '') {
        return api_authz_normalize_handler($row);
    }

    $normalized = api_authz_normalize_handler($row);
    $roleCodes = api_authz_parse_code_list($row['resolved_role_codes'] ?? null, true);
    $permissions = is_array($normalized['permissions'] ?? null) ? $normalized['permissions'] : [];

    foreach (api_authz_parse_code_list($row['resolved_permission_codes'] ?? null, false) as $code) {
        $permissions[$code] = true;
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

function api_authz_fetch_handler_row(string $whereSql, array $params, string $orderSql = 'h.id ASC'): ?array {
    $rows = sqlserver_query(
        'SELECT TOP 1
            h.id,
            h.name,
            h.email,
            h.user_id,
            h.active,
            h.roles,
            h.permissions,
            COALESCE((
                SELECT r.code AS code
                FROM dbo.handler_roles hr
                INNER JOIN dbo.roles r ON r.id = hr.role_id
                WHERE hr.handler_id = h.id
                GROUP BY r.code
                ORDER BY r.code ASC
                FOR JSON PATH
            ), \'[]\') AS resolved_role_codes,
            COALESCE((
                SELECT p.code AS code
                FROM dbo.handler_roles hr
                INNER JOIN dbo.role_permissions rp ON rp.role_id = hr.role_id
                INNER JOIN dbo.permissions p ON p.id = rp.permission_id
                WHERE hr.handler_id = h.id
                GROUP BY p.code
                ORDER BY p.code ASC
                FOR JSON PATH
            ), \'[]\') AS resolved_permission_codes
         FROM dbo.handlers h
         WHERE ' . $whereSql . '
         ORDER BY ' . $orderSql,
        $params
    );

    return !empty($rows[0]) && is_array($rows[0]) ? $rows[0] : null;
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

function api_authz_maybe_link_handler_identity(array $row, array $claims): array {
    $handlerId = trim((string)($row['id'] ?? ''));
    $currentUserId = trim((string)($row['user_id'] ?? ''));
    $matchedEmail = trim((string)($row['email'] ?? ''));
    $claimSub = trim((string)($claims['sub'] ?? ''));
    $claimEmail = trim((string)($claims['email'] ?? ''));
    $emailVerified = !array_key_exists('email_verified', $claims) || !empty($claims['email_verified']);

    if (
        $handlerId === ''
        || $claimSub === ''
        || $currentUserId !== ''
        || !$emailVerified
        || $claimEmail === ''
        || strcasecmp($matchedEmail, $claimEmail) !== 0
    ) {
        return $row;
    }

    sqlserver_execute(
        'UPDATE dbo.handlers
         SET user_id = @user_id, updated_at = SYSUTCDATETIME()
         WHERE id = @id AND (user_id IS NULL OR LTRIM(RTRIM(user_id)) = \'\')',
        ['id' => $handlerId, 'user_id' => $claimSub]
    );

    $row['user_id'] = $claimSub;
    return $row;
}

function api_authz_fetch_handler(string $baseUrl, string $serviceKey, array $claims): ?array {
    unset($baseUrl, $serviceKey);

    $sub = trim((string)($claims['sub'] ?? ''));
    $email = trim((string)($claims['email'] ?? ''));
    if ($sub === '' && $email === '') {
        return null;
    }

    if ($sub !== '') {
        $row = api_authz_fetch_handler_row('h.user_id = @sub', ['sub' => $sub]);
        if ($row) {
            return api_authz_sql_hydrate_handler($row);
        }
    }

    if ($email === '' && $sub !== '') {
        $claims = api_authz_enrich_identity_claims($claims);
        $email = trim((string)($claims['email'] ?? ''));
    }

    if ($email !== '') {
        $row = api_authz_fetch_handler_row('LOWER(h.email) = LOWER(@email)', ['email' => $email]);
        if ($row) {
            return api_authz_sql_hydrate_handler(api_authz_maybe_link_handler_identity($row, $claims));
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
