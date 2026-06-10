<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_auth0.php';
require_once __DIR__ . '/_errors.php';
require_once __DIR__ . '/_rate_limit.php';
require_once __DIR__ . '/_security_headers.php';

api_apply_security_headers([
    'allow_methods' => 'POST, OPTIONS',
    'allow_headers' => 'Content-Type, Authorization',
]);
api_apply_no_store_headers();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'OK'], JSON_UNESCAPED_UNICODE);
    exit;
}

ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/../../php-errors.log');
ini_set('display_errors', '0');
error_reporting(E_ALL);

function ev_json(int $status, bool $success, string $message, $data = null): void {
    http_response_code($status);
    echo json_encode(
        ['success' => $success, 'message' => $message, 'data' => $data],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

function ev_deny(int $status, string $message): void {
    ev_json($status, false, $message);
}

function ev_env_required(string $key): string {
    $value = trim((string)(getenv($key) ?: ''));
    if ($value === '') {
        throw new Exception('Missing required environment variable: ' . $key);
    }
    return $value;
}

function ev_auth0_domain(): string {
    $domain = trim((string)(
        getenv('AUTH0_DOMAIN')
        ?: getenv('VITE_AUTH0_DOMAIN')
        ?: ''
    ));
    if ($domain === '') {
        throw new Exception('Missing required environment variable: AUTH0_DOMAIN');
    }
    return $domain;
}

function ev_auth0_client_id(): string {
    $clientId = trim((string)(
        getenv('VITE_AUTH0_CLIENT_ID')
        ?: getenv('AUTH0_CLIENT_ID')
        ?: ''
    ));
    if ($clientId === '') {
        throw new Exception('Missing required environment variable: VITE_AUTH0_CLIENT_ID');
    }
    return $clientId;
}

function ev_auth0_request(string $method, string $url, string $token = '', ?array $payload = null): array {
    $headers = ['Content-Type: application/json'];
    if ($token !== '') {
        $headers[] = 'Authorization: Bearer ' . $token;
    }

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 20,
    ]);

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

function ev_mgmt_token_cache_file(string $domain): string {
    $dir = __DIR__ . '/../../run/cache';
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    $safeDomain = preg_replace('/[^a-z0-9_.-]/i', '_', $domain);
    return $dir . '/auth0-mgmt-token-' . $safeDomain . '.json';
}

function ev_mgmt_token_cached(string $domain): ?string {
    $file = ev_mgmt_token_cache_file($domain);
    if (!is_file($file)) return null;
    $raw = @file_get_contents($file);
    if (!is_string($raw) || trim($raw) === '') return null;
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) return null;

    $token = trim((string)($decoded['access_token'] ?? ''));
    $expiresAt = (int)($decoded['expires_at'] ?? 0);
    if ($token === '' || $expiresAt <= 0) return null;

    // Require at least 2 minutes remaining before reusing.
    if ($expiresAt <= (time() + 120)) {
        return null;
    }
    return $token;
}

function ev_mgmt_token_cache_write(string $domain, string $token, int $expiresIn): void {
    if ($token === '' || $expiresIn <= 0) return;
    $payload = [
        'access_token' => $token,
        'expires_at' => time() + $expiresIn,
    ];
    $file = ev_mgmt_token_cache_file($domain);
    @file_put_contents($file, json_encode($payload, JSON_UNESCAPED_UNICODE));
}

function ev_auth0_error($decoded, string $raw): string {
    if (is_array($decoded)) {
        $parts = [];
        foreach (['error', 'error_description', 'message'] as $key) {
            $value = trim((string)($decoded[$key] ?? ''));
            if ($value !== '') $parts[] = $value;
        }
        if (!empty($parts)) {
            return implode(' ', array_unique($parts));
        }
    }
    return trim($raw) !== '' ? trim($raw) : 'Unknown Auth0 error';
}

function ev_auth0_management_token(string $domain): string {
    $cached = ev_mgmt_token_cached($domain);
    if ($cached !== null) {
        return $cached;
    }

    $staticToken = trim((string)(getenv('AUTH0_MGMT_API_TOKEN') ?: ''));
    if ($staticToken !== '') {
        return $staticToken;
    }

    $clientId = trim((string)(
        getenv('AUTH0_MGMT_CLIENT_ID')
        ?: getenv('AUTH0_CLIENT_ID')
        ?: ''
    ));
    $clientSecret = trim((string)(
        getenv('AUTH0_MGMT_CLIENT_SECRET')
        ?: getenv('AUTH0_CLIENT_SECRET')
        ?: ''
    ));
    $audience = trim((string)(getenv('AUTH0_MGMT_AUDIENCE') ?: ('https://' . $domain . '/api/v2/')));

    if ($clientId === '' || $clientSecret === '') {
        throw new Exception('Auth0 management API credentials are not configured');
    }

    [$code, $decoded, $raw] = ev_auth0_request('POST', 'https://' . $domain . '/oauth/token', '', [
        'grant_type' => 'client_credentials',
        'client_id' => $clientId,
        'client_secret' => $clientSecret,
        'audience' => $audience,
    ]);

    if ($code < 200 || $code >= 300 || !is_array($decoded)) {
        $msg = ev_auth0_error($decoded, $raw);
        if (stripos($msg, 'unauthorized_client') !== false || stripos($msg, 'client_credentials') !== false) {
            throw new Exception('Auth0 management client is invalid for client_credentials');
        }
        throw new Exception('Failed to obtain Auth0 management token: ' . $msg);
    }

    $token = trim((string)($decoded['access_token'] ?? ''));
    if ($token === '') {
        throw new Exception('Auth0 management token response missing access_token');
    }

    $expiresIn = (int)($decoded['expires_in'] ?? 0);
    if ($expiresIn > 0) {
        ev_mgmt_token_cache_write($domain, $token, $expiresIn);
    }

    return $token;
}

function ev_safe_client_message(Throwable $e): string {
    $msg = strtolower($e->getMessage());

    if (str_contains($msg, 'auth0 management api credentials are not configured')) {
        return 'Email verificatie is nog niet geconfigureerd op de server.';
    }
    if (str_contains($msg, 'auth0 management client is invalid for client_credentials')) {
        return 'Email verificatie vereist een Auth0 M2M-app met Management API toegang.';
    }
    if (str_contains($msg, 'insufficient_scope') || str_contains($msg, 'access_denied')) {
        return 'Email verificatie mist de juiste Auth0 Management API rechten.';
    }
    if (str_contains($msg, 'operation_not_supported') || str_contains($msg, 'does not support this operation')) {
        return 'Voor dit type account kan Auth0 geen verificatie-email versturen.';
    }

    return 'Email verification request failed';
}

function ev_claim_email(array $claims): string {
    return trim((string)($claims['email'] ?? ''));
}

function ev_claim_email_verified(array $claims): bool {
    return !empty($claims['email_verified']);
}

function ev_external_identity_message(string $provider = ''): string {
    $label = ev_identity_provider_label($provider);
    $suffix = $label !== '' ? ' (' . $label . ')' : ' (SSO/Entra)';
    return 'Verificatie wordt beheerd door uw organisatie' . $suffix . '. Er is geen actie nodig in dit portaal.';
}

function ev_identity_provider_label(string $provider): string {
    $provider = strtolower(trim($provider));
    if ($provider === '') return '';

    $labels = [
        'waad' => 'Entra ID',
        'azuread' => 'Entra ID',
        'adfs' => 'ADFS',
        'samlp' => 'SAML SSO',
        'google-oauth2' => 'Google OAuth',
        'windowslive' => 'Microsoft',
    ];

    return $labels[$provider] ?? $provider;
}

function ev_identity_provider_from_subject(string $sub): string {
    $sub = trim($sub);
    if ($sub === '' || !str_contains($sub, '|')) {
        return '';
    }

    return strtolower(trim(explode('|', $sub, 2)[0]));
}

function ev_identity_provider_from_claims(array $claims): string {
    return ev_identity_provider_from_subject((string)($claims['sub'] ?? ''));
}

function ev_identity_provider_from_auth0_user(array $auth0User): string {
    $identities = $auth0User['identities'] ?? null;
    if (is_array($identities)) {
        foreach ($identities as $identity) {
            if (!is_array($identity)) continue;
            $provider = strtolower(trim((string)($identity['provider'] ?? '')));
            if ($provider !== '') {
                return $provider;
            }
        }
    }

    return ev_identity_provider_from_subject((string)($auth0User['user_id'] ?? ''));
}

function ev_is_externally_managed_provider(string $provider): bool {
    $provider = strtolower(trim($provider));
    return $provider !== '' && $provider !== 'auth0' && $provider !== 'email';
}

function ev_external_verification_payload(string $email, string $provider, ?string $updatedAt = null): array {
    return [
        'email' => $email,
        'email_verified' => true,
        'updated_at' => $updatedAt,
        'verification_available' => false,
        'send_available' => false,
        'verification_required' => false,
        'externally_verified' => true,
        'identity_provider' => strtolower(trim($provider)),
        'identity_provider_label' => ev_identity_provider_label($provider),
        'warning' => ev_external_identity_message($provider),
    ];
}

function ev_enforce_rate_limit(string $action, array $claims): void {
    $sub = trim((string)($claims['sub'] ?? 'unknown'));
    $actorKey = api_rate_limit_hash('email_verification_actor:' . $sub);
    $clientKey = api_rate_limit_client_fingerprint();

    if ($action === 'send') {
        api_rate_limit_enforce(
            'email_verification_send:actor:' . $actorKey,
            3,
            3600,
            'ev_deny'
        );
        api_rate_limit_enforce(
            'email_verification_send:client:' . $clientKey,
            18,
            3600,
            'ev_deny'
        );
        return;
    }

    api_rate_limit_enforce(
        'email_verification_status:actor:' . $actorKey,
        30,
        600,
        'ev_deny'
    );
    api_rate_limit_enforce(
        'email_verification_status:client:' . $clientKey,
        180,
        600,
        'ev_deny'
    );
}

function ev_is_send_supported(array $auth0User): bool {
    $identities = $auth0User['identities'] ?? null;
    if (!is_array($identities) || count($identities) === 0) {
        return true;
    }

    foreach ($identities as $identity) {
        $provider = strtolower(trim((string)($identity['provider'] ?? '')));
        // Auth0 verification-email jobs are supported for DB/passwordless-email identities.
        if ($provider !== '' && $provider !== 'auth0' && $provider !== 'email') {
            return false;
        }
    }

    return true;
}

function ev_user_from_management(string $domain, string $mgmtToken, string $sub): array {
    $userUrl = 'https://' . $domain . '/api/v2/users/' . rawurlencode($sub)
        . '?fields=user_id,email,email_verified,updated_at,identities&include_fields=true';
    [$statusCode, $statusDecoded, $statusRaw] = ev_auth0_request('GET', $userUrl, $mgmtToken);
    if ($statusCode < 200 || $statusCode >= 300 || !is_array($statusDecoded)) {
        throw new Exception('Failed to load user verification status: ' . ev_auth0_error($statusDecoded, $statusRaw));
    }
    return $statusDecoded;
}

try {
    load_runtime_env(__DIR__);

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        ev_json(405, false, 'Method not allowed');
    }

    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '', true);
    if (!is_array($data)) {
        ev_json(400, false, 'Invalid JSON payload');
    }

    $action = strtolower(trim((string)($data['action'] ?? 'status')));
    if ($action !== 'status' && $action !== 'send') {
        ev_json(400, false, 'Invalid action');
    }

    $token = auth0_get_bearer_token();
    if ($token === '') {
        ev_json(401, false, 'Authorization token required');
    }

    $domain = ev_auth0_domain();
    $audience = auth0_expected_api_audience();
    $clientId = ev_auth0_client_id();
    try {
        $claims = auth0_verify_access_token($token, $domain, $audience, $clientId);
    } catch (Throwable $authError) {
        ev_json(401, false, 'Invalid or expired authorization token');
    }
    $sub = trim((string)($claims['sub'] ?? ''));
    if ($sub === '') {
        throw new Exception('Authenticated user is missing subject');
    }

    ev_enforce_rate_limit($action, $claims);

    if ($action === 'status') {
        $claimsProvider = ev_identity_provider_from_claims($claims);
        if (ev_is_externally_managed_provider($claimsProvider)) {
            ev_json(
                200,
                true,
                'Verification status loaded',
                ev_external_verification_payload(ev_claim_email($claims), $claimsProvider)
            );
        }

        try {
            $mgmtToken = ev_auth0_management_token($domain);
            $statusDecoded = ev_user_from_management($domain, $mgmtToken, $sub);
            $provider = ev_identity_provider_from_auth0_user($statusDecoded);
            if (ev_is_externally_managed_provider($provider)) {
                ev_json(
                    200,
                    true,
                    'Verification status loaded',
                    ev_external_verification_payload(
                        (string)($statusDecoded['email'] ?? ev_claim_email($claims)),
                        $provider,
                        isset($statusDecoded['updated_at']) ? (string)$statusDecoded['updated_at'] : null
                    )
                );
            }

            $sendSupported = ev_is_send_supported($statusDecoded);
            $emailVerified = !empty($statusDecoded['email_verified']);

            ev_json(200, true, 'Verification status loaded', [
                'email' => $statusDecoded['email'] ?? ev_claim_email($claims),
                'email_verified' => $emailVerified,
                'updated_at' => $statusDecoded['updated_at'] ?? null,
                'verification_available' => true,
                'send_available' => $sendSupported,
                'verification_required' => !$emailVerified,
                'externally_verified' => false,
                'identity_provider' => $provider,
                'identity_provider_label' => ev_identity_provider_label($provider),
                'warning' => $sendSupported ? '' : 'Voor dit type account ondersteunt Auth0 geen verificatie-email.',
            ]);
        } catch (Throwable $statusError) {
            api_log_exception('email-verification.api.status', $statusError, ['mode' => 'fallback']);
            $fallbackProvider = ev_identity_provider_from_claims($claims);
            if (ev_is_externally_managed_provider($fallbackProvider)) {
                ev_json(
                    200,
                    true,
                    'Verification status loaded (fallback)',
                    ev_external_verification_payload(ev_claim_email($claims), $fallbackProvider)
                );
            }

            $fallbackVerified = ev_claim_email_verified($claims);
            ev_json(200, true, 'Verification status loaded (fallback)', [
                'email' => ev_claim_email($claims),
                'email_verified' => $fallbackVerified,
                'updated_at' => null,
                'verification_available' => false,
                'send_available' => false,
                'verification_required' => !$fallbackVerified,
                'externally_verified' => false,
                'identity_provider' => $fallbackProvider,
                'identity_provider_label' => ev_identity_provider_label($fallbackProvider),
                'warning' => ev_safe_client_message($statusError),
            ]);
        }
    }

    if ($action === 'send') {
        $claimsProvider = ev_identity_provider_from_claims($claims);
        if (ev_is_externally_managed_provider($claimsProvider)) {
            ev_json(
                200,
                true,
                'E-mailverificatie wordt beheerd door uw organisatie',
                ev_external_verification_payload(ev_claim_email($claims), $claimsProvider)
            );
        }

        $mgmtToken = ev_auth0_management_token($domain);
        $statusDecoded = ev_user_from_management($domain, $mgmtToken, $sub);
        $provider = ev_identity_provider_from_auth0_user($statusDecoded);
        if (ev_is_externally_managed_provider($provider)) {
            ev_json(
                200,
                true,
                'E-mailverificatie wordt beheerd door uw organisatie',
                ev_external_verification_payload(
                    (string)($statusDecoded['email'] ?? ev_claim_email($claims)),
                    $provider,
                    isset($statusDecoded['updated_at']) ? (string)$statusDecoded['updated_at'] : null
                )
            );
        }

        if (!ev_is_send_supported($statusDecoded)) {
            ev_json(409, false, 'Voor dit type account kan Auth0 geen verificatie-email versturen.');
        }

        if (!empty($statusDecoded['email_verified'])) {
            ev_json(200, true, 'E-mailadres is al geverifieerd', [
                'email' => $statusDecoded['email'] ?? '',
                'email_verified' => true,
                'verification_required' => false,
                'externally_verified' => false,
                'identity_provider' => $provider,
                'identity_provider_label' => ev_identity_provider_label($provider),
            ]);
        }

        [$sendCode, $sendDecoded, $sendRaw] = ev_auth0_request(
            'POST',
            'https://' . $domain . '/api/v2/jobs/verification-email',
            $mgmtToken,
            ['user_id' => $sub]
        );

        if ($sendCode < 200 || $sendCode >= 300) {
            throw new Exception('Failed to send verification email: ' . ev_auth0_error($sendDecoded, $sendRaw));
        }

        ev_json(200, true, 'Verificatie e-mail verzonden', [
            'email' => $statusDecoded['email'] ?? '',
            'email_verified' => false,
            'requested_at' => gmdate('c'),
            'verification_required' => true,
            'externally_verified' => false,
            'identity_provider' => $provider,
            'identity_provider_label' => ev_identity_provider_label($provider),
        ]);
    }

    ev_json(400, false, 'Invalid action');
} catch (Throwable $e) {
    $errorId = api_log_exception('email-verification.api', $e);
    ev_json(500, false, ev_safe_client_message($e), ['error_id' => $errorId]);
}
