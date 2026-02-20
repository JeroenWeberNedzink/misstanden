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

function auth0_fetch_jwks(string $domain): array {
    $url = 'https://' . $domain . '/.well-known/jwks.json';
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ]);
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($resp === false || $code < 200 || $code >= 300) {
        throw new Exception('Failed to fetch Auth0 JWKS: ' . ($err ?: 'HTTP ' . $code));
    }

    $decoded = json_decode($resp, true);
    if (!is_array($decoded) || !is_array($decoded['keys'] ?? null)) {
        throw new Exception('Invalid JWKS payload');
    }
    return $decoded['keys'];
}

function auth0_expected_api_audience(string $domain): string {
    $configured = trim((string)(getenv('VITE_AUTH0_AUDIENCE') ?: ''));
    if ($configured !== '') {
        return $configured;
    }
    $cleanDomain = trim($domain);
    if ($cleanDomain === '') {
        throw new Exception('Missing Auth0 domain configuration');
    }
    return 'https://' . $cleanDomain . '/mfa/';
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
