<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';

const TICKET_ENCRYPTED_PLACEHOLDER = '[encrypted]';

function ticket_crypto_text_or_null($value, bool $trimEmpty = true): ?string {
    if ($value === null) {
        return null;
    }

    $text = (string)$value;
    return $trimEmpty && trim($text) === '' ? null : $text;
}

function ticket_crypto_encrypt_nullable($value, ?string $rawKey = null, bool $trimEmpty = true): ?string {
    $text = ticket_crypto_text_or_null($value, $trimEmpty);
    if ($text === null) {
        return null;
    }

    return encrypt_sensitive_value($text, $rawKey ?? get_email_crypto_key());
}

function ticket_crypto_decrypt_nullable($encrypted, $fallback = null, ?string $rawKey = null) {
    $plain = maybe_decrypt_sensitive_value($encrypted, $fallback, $rawKey);
    if ($plain === TICKET_ENCRYPTED_PLACEHOLDER) {
        return null;
    }
    return $plain;
}

function ticket_crypto_decrypt_field(array $row, string $plainField, string $encryptedField, bool $stripCiphertext = true): array {
    $fallback = array_key_exists($plainField, $row) ? $row[$plainField] : null;
    $row[$plainField] = ticket_crypto_decrypt_nullable($row[$encryptedField] ?? null, $fallback);
    if ($stripCiphertext) {
        unset($row[$encryptedField]);
    }
    return $row;
}

function ticket_crypto_decrypt_ticket_row(array $row, bool $keepEmailCiphertext = true): array {
    foreach ([
        'description' => 'description_encrypted',
        'location' => 'location_encrypted',
        'reporter_name' => 'reporter_name_encrypted',
        'reporter_phone' => 'reporter_phone_encrypted',
    ] as $plainField => $encryptedField) {
        $row = ticket_crypto_decrypt_field($row, $plainField, $encryptedField);
    }

    if (!empty($row['is_anonymous'])) {
        $row['reporter_name'] = null;
        $row['reporter_phone'] = null;
        $row['reporter_email'] = null;
        if (!$keepEmailCiphertext) {
            unset($row['reporter_email_encrypted']);
        }
    } else {
        $row = ticket_crypto_decrypt_field($row, 'reporter_email', 'reporter_email_encrypted', !$keepEmailCiphertext);
    }
    return $row;
}

function ticket_crypto_decrypt_message_row(array $row): array {
    return ticket_crypto_decrypt_field($row, 'body', 'body_encrypted');
}

function ticket_crypto_decrypt_comment_row(array $row): array {
    return ticket_crypto_decrypt_field($row, 'comment', 'comment_encrypted');
}

function ticket_crypto_decrypt_action_row(array $row): array {
    return ticket_crypto_decrypt_field($row, 'description', 'description_encrypted');
}
