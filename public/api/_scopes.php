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

    $granted = auth0_get_scopes_from_claims($claims);
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
