<?php
declare(strict_types=1);

function api_error_id(): string {
    return bin2hex(random_bytes(8));
}

function api_redact_sensitive(string $message): string {
    $out = $message;
    $out = preg_replace('/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i', '[redacted-email]', $out ?? '');
    $out = preg_replace('/\b\d{6}\b/', '[redacted-code]', $out ?? '');
    $out = preg_replace('/Bearer\s+[A-Za-z0-9\-._~+\/]+=*/i', 'Bearer [redacted-token]', $out ?? '');
    return (string)$out;
}

function api_log_exception(string $context, Throwable $e, array $meta = []): string {
    $errorId = api_error_id();
    $safeMeta = [];
    foreach ($meta as $k => $v) {
        if ($v === null) {
            continue;
        }
        $safeMeta[] = $k . '=' . api_redact_sensitive((string)$v);
    }
    $metaLine = $safeMeta ? ' ' . implode(' ', $safeMeta) : '';
    error_log(sprintf(
        '[%s][%s] %s%s',
        $context,
        $errorId,
        api_redact_sensitive($e->getMessage()),
        $metaLine
    ));
    return $errorId;
}
