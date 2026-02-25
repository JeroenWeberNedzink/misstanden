<?php
declare(strict_types=1);

function supabase_base64url_decode(string $input): string {
    $remainder = strlen($input) % 4;
    if ($remainder) {
        $input .= str_repeat('=', 4 - $remainder);
    }
    $decoded = base64_decode(strtr($input, '-_', '+/'), true);
    if ($decoded === false) {
        throw new Exception('Invalid base64url payload');
    }
    return $decoded;
}

function supabase_decode_jwt_payload(string $jwt): array {
    $parts = explode('.', trim($jwt));
    if (count($parts) !== 3) {
        return [];
    }
    try {
        $payload = json_decode(supabase_base64url_decode($parts[1]), true);
    } catch (Throwable $e) {
        return [];
    }
    return is_array($payload) ? $payload : [];
}

function supabase_is_service_role_key(string $key): bool {
    $payload = supabase_decode_jwt_payload($key);
    return strtolower((string)($payload['role'] ?? '')) === 'service_role';
}

function supabase_get_service_role_key(array $envKeys = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY']): string {
    foreach ($envKeys as $envKey) {
        $candidate = trim((string)(getenv($envKey) ?: ''));
        if ($candidate === '') {
            continue;
        }
        if (!supabase_is_service_role_key($candidate)) {
            throw new Exception('Configured Supabase server key is not a service_role key (' . $envKey . ')');
        }
        return $candidate;
    }
    throw new Exception('Missing Supabase service role key configuration');
}
