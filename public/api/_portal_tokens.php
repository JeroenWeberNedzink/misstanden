<?php
declare(strict_types=1);

function portal_token_hash_key(): string {
    $key = (string)(getenv('PORTAL_TOKEN_HASH_KEY') ?: '');
    if (strlen($key) < 32) throw new RuntimeException('PORTAL_TOKEN_HASH_KEY must be configured with at least 32 characters');
    return $key;
}

function portal_token_hash(string $purpose, string $rawToken): string {
    return hash_hmac('sha256', trim($purpose) . '|' . trim($rawToken), portal_token_hash_key());
}
