<?php
declare(strict_types=1);

function apply_env_aliases(): void {
    $aliases = [
        'VITE_AUTH0_DOMAIN' => 'AUTH0_DOMAIN',
        'VITE_AUTH0_CLIENT_ID' => 'AUTH0_CLIENT_ID',
        'VITE_AUTH0_AUDIENCE' => 'AUTH0_AUDIENCE',
    ];

    foreach ($aliases as $target => $source) {
        $targetVal = trim((string)(getenv($target) ?: ''));
        if ($targetVal !== '') {
            continue;
        }
        $sourceVal = trim((string)(getenv($source) ?: ''));
        if ($sourceVal === '') {
            continue;
        }
        putenv($target . '=' . $sourceVal);
        $_ENV[$target] = $sourceVal;
    }
}

function load_env_file(string $file, bool $override = true): void {
    if (is_file($file)) {
        foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            // Strip UTF-8 BOM if present (common on Windows-edited .env files).
            $line = preg_replace('/^\xEF\xBB\xBF/', '', (string)$line);
            $line = trim((string)$line);
            if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
            [$key, $val] = explode('=', $line, 2);
            $key = trim((string)$key);
            $key = ltrim($key, "\xEF\xBB\xBF");
            $val = trim($val);
            if ($key === '') continue;
            if ((str_starts_with($val, '"') && str_ends_with($val, '"')) || (str_starts_with($val, "'") && str_ends_with($val, "'"))) {
                $val = substr($val, 1, -1);
            }
            if ($override || getenv($key) === false) {
                putenv("$key=$val");
                $_ENV[$key] = $val;
            }
        }
    }

    apply_env_aliases();
}

function runtime_env_candidate_roots(?string $anchorDir = null): array {
    $anchor = $anchorDir ?: __DIR__;
    $roots = [];

    foreach ([$anchor . '/..', $anchor . '/../..'] as $candidate) {
        $resolved = realpath($candidate);
        if ($resolved === false || !is_dir($resolved)) {
            continue;
        }
        if (!in_array($resolved, $roots, true)) {
            $roots[] = $resolved;
        }
    }

    if (!$roots) {
        $roots[] = dirname($anchor);
    }

    return $roots;
}

function load_runtime_env(?string $anchorDir = null): void {
    foreach (array_reverse(runtime_env_candidate_roots($anchorDir)) as $root) {
        load_env_file($root . '/.env', false);
        load_env_file($root . '/.env.local', true);
    }
}

function get_email_crypto_key(): string {
    $candidates = [];

    $envPath = trim((string)(getenv('EMAIL_ENC_KEY_PATH') ?: ''));
    if ($envPath !== '') {
        $candidates[] = $envPath;
    }

    foreach ([
        __DIR__ . '/../private/keys/email_enc.key',
        __DIR__ . '/../../private/keys/email_enc.key',
    ] as $candidate) {
        $candidates[] = $candidate;
    }

    foreach (runtime_env_candidate_roots(__DIR__) as $root) {
        $candidates[] = $root . '/private/keys/email_enc.key';
    }

    $path = '';
    foreach ($candidates as $candidate) {
        $resolved = realpath($candidate);
        $checkPath = $resolved !== false ? $resolved : $candidate;
        if (is_file($checkPath)) {
            $path = $checkPath;
            break;
        }
    }

    if ($path === '') {
        throw new Exception('Email encryption key file not found');
    }
    $key = trim((string)file_get_contents($path));
    if ($key === '') throw new Exception('Email encryption key is empty');
    $raw = base64_decode($key, true);
    if ($raw === false || strlen($raw) !== 32) {
        throw new Exception('Email encryption key must be base64-encoded 32 bytes');
    }
    return $raw;
}

function encrypt_email(string $plaintext, string $rawKey): string {
    $iv = random_bytes(12); // GCM standard
    $tag = '';
    $cipher = openssl_encrypt($plaintext, 'aes-256-gcm', $rawKey, OPENSSL_RAW_DATA, $iv, $tag);
    if ($cipher === false) {
        throw new Exception('Failed to encrypt email');
    }
    return 'gcm:' . base64_encode($iv) . ':' . base64_encode($tag) . ':' . base64_encode($cipher);
}

function decrypt_email(string $payload, string $rawKey): string {
    $parts = explode(':', $payload);
    if (count($parts) !== 4 || $parts[0] !== 'gcm') {
        throw new Exception('Invalid encrypted email format');
    }
    [$_, $ivB64, $tagB64, $cipherB64] = $parts;
    $iv = base64_decode($ivB64, true);
    $tag = base64_decode($tagB64, true);
    $cipher = base64_decode($cipherB64, true);
    if ($iv === false || $tag === false || $cipher === false) {
        throw new Exception('Invalid encrypted email payload');
    }
    $plain = openssl_decrypt($cipher, 'aes-256-gcm', $rawKey, OPENSSL_RAW_DATA, $iv, $tag);
    if ($plain === false) {
        throw new Exception('Failed to decrypt email');
    }
    return $plain;
}

function hash_email(string $email): string {
    $norm = strtolower(trim($email));
    return hash('sha256', $norm);
}
