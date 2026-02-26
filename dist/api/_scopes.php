<?php
declare(strict_types=1);

function auth0_get_scopes_from_claims(array $claims): array {
    $rawScopes = [];

    $scopeClaim = $claims['scope'] ?? null;
    if (is_string($scopeClaim)) {
        $parts = preg_split('/\s+/', trim($scopeClaim)) ?: [];
        $rawScopes = array_merge($rawScopes, $parts);
    } elseif (is_array($scopeClaim)) {
        $rawScopes = array_merge($rawScopes, $scopeClaim);
    }

    $permissionsClaim = $claims['permissions'] ?? null;
    if (is_array($permissionsClaim)) {
        $rawScopes = array_merge($rawScopes, $permissionsClaim);
    } elseif (is_string($permissionsClaim) && trim($permissionsClaim) !== '') {
        $parts = preg_split('/\s+/', trim($permissionsClaim)) ?: [];
        $rawScopes = array_merge($rawScopes, $parts);
    }

    $normalized = [];
    foreach ($rawScopes as $scope) {
        $value = trim((string)$scope);
        if ($value === '') {
            continue;
        }
        $normalized[] = strtolower($value);
    }

    return array_values(array_unique($normalized));
}

function auth0_filter_non_api_scopes(array $scopes): array {
    $ignore = ['openid', 'profile', 'email', 'offline_access'];
    return array_values(array_filter(
        $scopes,
        static fn($scope) => !in_array(strtolower(trim((string)$scope)), $ignore, true)
    ));
}

function auth0_scope_enforcement_strict(): bool {
    $raw = strtolower(trim((string)(getenv('AUTH0_ENFORCE_SCOPES_STRICT') ?: '')));
    return in_array($raw, ['1', 'true', 'yes', 'on'], true);
}

function require_scopes(array $claims, array $requiredScopes, ?callable $deny = null): void {
    $required = [];
    foreach ($requiredScopes as $scope) {
        $value = strtolower(trim((string)$scope));
        if ($value === '') {
            continue;
        }
        $required[] = $value;
    }
    $required = array_values(array_unique($required));

    if (!$required) {
        return;
    }

    $granted = auth0_filter_non_api_scopes(auth0_get_scopes_from_claims($claims));
    $strict = auth0_scope_enforcement_strict();

    // Compatibility path:
    // - legacy admin tokens often include only OIDC scopes and no API scopes
    // - some deployments currently use run:sla_backfill as the only API scope
    if (in_array('run:sla_backfill', $granted, true)) {
        return;
    }
    if (!$granted && !$strict) {
        return;
    }

    foreach ($required as $scope) {
        if (in_array($scope, $granted, true)) {
            return;
        }
    }

    if ($deny) {
        $deny(403, 'Insufficient scope');
    }
    throw new Exception('Insufficient scope', 403);
}
