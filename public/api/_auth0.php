<?php
declare(strict_types=1);

function auth0_base64url_decode(string $input): string {
    $remainder = strlen($input) % 4;
    if ($remainder) {
        $input .= str_repeat('=', 4 - $remainder);
    }
    $decoded = base64_decode(strtr($input, '-_', '+/'), true);
    if ($decoded === false) {
        throw new Exception('Invalid base64url input');
    }
    return $decoded;
}

function auth0_asn1_length(int $length): string {
    if ($length <= 0x7F) {
        return chr($length);
    }
    $temp = ltrim(pack('N', $length), "\x00");
    return chr(0x80 | strlen($temp)) . $temp;
}

function auth0_asn1_integer(string $value): string {
    if (ord($value[0]) > 0x7f) {
        $value = "\x00" . $value;
    }
    return "\x02" . auth0_asn1_length(strlen($value)) . $value;
}

function auth0_asn1_sequence(string $value): string {
    return "\x30" . auth0_asn1_length(strlen($value)) . $value;
}

function auth0_jwk_to_pem(array $jwk): string {
    if (empty($jwk['n']) || empty($jwk['e'])) {
        throw new Exception('JWK missing n/e');
    }

    $modulus = auth0_base64url_decode((string)$jwk['n']);
    $exponent = auth0_base64url_decode((string)$jwk['e']);

    $rsaPublicKey = auth0_asn1_sequence(
        auth0_asn1_integer($modulus) .
        auth0_asn1_integer($exponent)
    );

    $algo = hex2bin('300d06092a864886f70d0101010500'); // rsaEncryption OID
    $bitString = "\x03" . auth0_asn1_length(strlen("\x00" . $rsaPublicKey)) . "\x00" . $rsaPublicKey;
    $subjectPublicKeyInfo = auth0_asn1_sequence($algo . $bitString);

    $pem = "-----BEGIN PUBLIC KEY-----\n";
    $pem .= chunk_split(base64_encode($subjectPublicKeyInfo), 64, "\n");
    $pem .= "-----END PUBLIC KEY-----\n";
    return $pem;
}

function auth0_cache_dir(): string {
    $dir = __DIR__ . '/../../run/cache';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir;
}

function auth0_jwks_cache_file(string $domain): string {
    return auth0_cache_dir() . '/auth0-jwks-' . hash('sha256', strtolower(trim($domain))) . '.json';
}

function auth0_read_cached_jwks(string $domain, int $ttlSeconds): ?array {
    $file = auth0_jwks_cache_file($domain);
    if (!is_file($file)) {
        return null;
    }

    $raw = @file_get_contents($file);
    if (!is_string($raw) || $raw === '') {
        return null;
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded) || !is_array($decoded['keys'] ?? null)) {
        return null;
    }

    $fetchedAt = (int)($decoded['fetched_at'] ?? 0);
    if ($fetchedAt > 0 && (time() - $fetchedAt) <= $ttlSeconds) {
        return $decoded['keys'];
    }

    return null;
}

function auth0_write_cached_jwks(string $domain, array $keys): void {
    $file = auth0_jwks_cache_file($domain);
    $payload = json_encode([
        'fetched_at' => time(),
        'keys' => array_values($keys),
    ], JSON_UNESCAPED_UNICODE);
    if ($payload === false) {
        return;
    }
    @file_put_contents($file, $payload, LOCK_EX);
}

function auth0_read_stale_jwks(string $domain): ?array {
    $file = auth0_jwks_cache_file($domain);
    if (!is_file($file)) {
        return null;
    }
    $raw = @file_get_contents($file);
    if (!is_string($raw) || $raw === '') {
        return null;
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded) || !is_array($decoded['keys'] ?? null)) {
        return null;
    }
    return $decoded['keys'];
}

function auth0_candidate_roots(): array {
    $roots = [];
    foreach ([__DIR__ . '/..', __DIR__ . '/../..'] as $candidate) {
        $resolved = realpath($candidate);
        if ($resolved === false || !is_dir($resolved)) {
            continue;
        }
        if (!in_array($resolved, $roots, true)) {
            $roots[] = $resolved;
        }
    }
    if (!$roots) {
        $roots[] = dirname(__DIR__);
    }
    return $roots;
}

function auth0_find_ca_bundle(): ?string {
    static $resolved = null;
    static $initialized = false;

    if ($initialized) {
        return $resolved;
    }
    $initialized = true;

    $candidates = [];
    foreach ([
        'APP_CA_BUNDLE',
        'PHP_CURL_CAINFO',
        'CURL_CA_BUNDLE',
        'SSL_CERT_FILE',
        'OPENSSL_CAFILE',
    ] as $envKey) {
        $value = trim((string)(getenv($envKey) ?: ''));
        if ($value !== '') {
            $candidates[] = $value;
        }
    }

    foreach (['curl.cainfo', 'openssl.cafile'] as $iniKey) {
        $value = trim((string)ini_get($iniKey));
        if ($value !== '') {
            $candidates[] = $value;
        }
    }

    foreach (auth0_candidate_roots() as $root) {
        $candidates[] = $root . DIRECTORY_SEPARATOR . 'cacert.pem';
        $candidates[] = $root . DIRECTORY_SEPARATOR . 'certs' . DIRECTORY_SEPARATOR . 'cacert.pem';
    }

    foreach ($candidates as $candidate) {
        $candidate = trim((string)$candidate);
        if ($candidate === '') {
            continue;
        }
        $real = realpath($candidate);
        $path = $real !== false ? $real : $candidate;
        if (is_file($path) && is_readable($path)) {
            $resolved = $path;
            return $resolved;
        }
    }

    $resolved = null;
    return null;
}

function auth0_apply_ssl_options(array &$curlOptions, string $url): void {
    if (stripos($url, 'https://') !== 0) {
        return;
    }
    $caBundle = auth0_find_ca_bundle();
    if ($caBundle !== null) {
        $curlOptions[CURLOPT_CAINFO] = $caBundle;
    }
}

function auth0_ssl_diagnostics(): array {
    return [
        'curl_available' => function_exists('curl_init'),
        'allow_url_fopen' => filter_var((string)ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN),
        'curl_cainfo' => trim((string)ini_get('curl.cainfo')) !== '',
        'openssl_cafile' => trim((string)ini_get('openssl.cafile')) !== '',
        'ca_bundle_found' => auth0_find_ca_bundle() !== null,
        'ca_bundle_path' => auth0_find_ca_bundle(),
    ];
}

function auth0_fetch_jwks(string $domain): array {
    $ttlSeconds = (int)(getenv('AUTH0_JWKS_CACHE_TTL_SECONDS') ?: 21600);
    if ($ttlSeconds <= 0) {
        $ttlSeconds = 21600;
    }

    $cached = auth0_read_cached_jwks($domain, $ttlSeconds);
    if (is_array($cached) && count($cached) > 0) {
        return $cached;
    }

    $url = 'https://' . $domain . '/.well-known/jwks.json';
    $ch = curl_init();
    $curlOptions = [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ];
    auth0_apply_ssl_options($curlOptions, $url);
    curl_setopt_array($ch, $curlOptions);
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($resp === false || $code < 200 || $code >= 300) {
        $stale = auth0_read_stale_jwks($domain);
        if (is_array($stale) && count($stale) > 0) {
            return $stale;
        }
        throw new Exception('Failed to fetch Auth0 JWKS: ' . ($err ?: 'HTTP ' . $code));
    }

    $decoded = json_decode($resp, true);
    if (!is_array($decoded) || !is_array($decoded['keys'] ?? null)) {
        throw new Exception('Invalid JWKS payload');
    }
    auth0_write_cached_jwks($domain, $decoded['keys']);
    return $decoded['keys'];
}

function auth0_expected_api_audience(): string {
    $configured = trim((string)(getenv('VITE_AUTH0_AUDIENCE') ?: ''));
    if ($configured !== '') {
        return $configured;
    }
    throw new Exception('missing VITE_AUTH0_AUDIENCE');
}

function auth0_normalize_aud_list($aud): array {
    if (is_string($aud) && trim($aud) !== '') {
        return [trim($aud)];
    }
    if (!is_array($aud)) {
        return [];
    }
    $list = [];
    foreach ($aud as $item) {
        $value = trim((string)$item);
        if ($value !== '') {
            $list[] = $value;
        }
    }
    return array_values(array_unique($list));
}

function auth0_verify_access_token(string $jwt, string $domain, string $expectedAudience, string $clientId = ''): array {
    $parts = explode('.', $jwt);
    if (count($parts) !== 3) {
        throw new Exception('Invalid JWT format');
    }

    [$headB64, $payloadB64, $sigB64] = $parts;
    $header = json_decode(auth0_base64url_decode($headB64), true);
    $payload = json_decode(auth0_base64url_decode($payloadB64), true);
    $signature = auth0_base64url_decode($sigB64);

    if (!is_array($header) || !is_array($payload)) {
        throw new Exception('Invalid JWT payload');
    }

    $alg = (string)($header['alg'] ?? '');
    $kid = (string)($header['kid'] ?? '');
    if ($alg !== 'RS256' || $kid === '') {
        throw new Exception('Unsupported token header');
    }

    $typ = strtolower(trim((string)($header['typ'] ?? '')));
    if ($typ !== '' && $typ !== 'jwt' && $typ !== 'at+jwt') {
        throw new Exception('Unsupported token type');
    }

    $jwks = auth0_fetch_jwks($domain);
    $jwk = null;
    foreach ($jwks as $key) {
        if (($key['kid'] ?? '') === $kid) {
            $jwk = $key;
            break;
        }
    }
    if (!$jwk) {
        throw new Exception('No matching JWKS key for token kid');
    }

    $pem = auth0_jwk_to_pem($jwk);
    $verified = openssl_verify($headB64 . '.' . $payloadB64, $signature, $pem, OPENSSL_ALGO_SHA256);
    if ($verified !== 1) {
        throw new Exception('Invalid token signature');
    }

    $now = time();
    $exp = (int)($payload['exp'] ?? 0);
    $nbf = (int)($payload['nbf'] ?? 0);
    $iat = (int)($payload['iat'] ?? 0);
    $iss = (string)($payload['iss'] ?? '');
    $aud = $payload['aud'] ?? null;
    $sub = trim((string)($payload['sub'] ?? ''));

    if ($exp <= ($now - 60)) {
        throw new Exception('Token expired');
    }
    if ($nbf > ($now + 60)) {
        throw new Exception('Token not active yet');
    }
    if ($iat > ($now + 60)) {
        throw new Exception('Invalid token issue time');
    }
    if ($sub === '') {
        throw new Exception('Invalid token subject');
    }

    $expectedIss = 'https://' . rtrim($domain, '/') . '/';
    if ($iss !== $expectedIss) {
        throw new Exception('Invalid token issuer');
    }

    if (array_key_exists('nonce', $payload) || array_key_exists('at_hash', $payload) || array_key_exists('c_hash', $payload)) {
        throw new Exception('ID tokens are not accepted by this API');
    }

    $audList = auth0_normalize_aud_list($aud);
    if (!$audList) {
        throw new Exception('Invalid token audience');
    }

    $audHasExpected = in_array($expectedAudience, $audList, true);
    if (!$audHasExpected) {
        $looksLikeIdToken = $clientId !== '' && in_array($clientId, $audList, true);
        if ($looksLikeIdToken) {
            throw new Exception('ID tokens are not accepted by this API');
        }
        throw new Exception('Invalid token audience');
    }

    return $payload;
}

function auth0_verify_id_token(string $jwt, string $domain, string $clientId): array {
    throw new Exception('ID tokens are not accepted by this API');
}

function auth0_get_bearer_token(): string {
    $header = '';
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        $header = (string)$_SERVER['HTTP_AUTHORIZATION'];
    } elseif (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $header = (string)$_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }

    if ($header === '' || stripos($header, 'Bearer ') !== 0) {
        return '';
    }

    return trim(substr($header, 7));
}
