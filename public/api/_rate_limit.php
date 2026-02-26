<?php
declare(strict_types=1);

function api_rate_limit_client_ip(): string {
    $candidates = [
        $_SERVER['HTTP_CF_CONNECTING_IP'] ?? null,
        $_SERVER['HTTP_X_FORWARDED_FOR'] ?? null,
        $_SERVER['REMOTE_ADDR'] ?? null,
    ];

    foreach ($candidates as $raw) {
        $value = trim((string)$raw);
        if ($value === '') {
            continue;
        }
        if (str_contains($value, ',')) {
            $parts = explode(',', $value);
            $value = trim((string)($parts[0] ?? ''));
        }
        if (filter_var($value, FILTER_VALIDATE_IP)) {
            return $value;
        }
    }
    return 'unknown';
}

function api_rate_limit_hash(string $value): string {
    $salt = trim((string)(getenv('RATE_LIMIT_SALT') ?: ''));
    return hash('sha256', $salt . '|' . $value);
}

function api_rate_limit_client_fingerprint(): string {
    $ip = api_rate_limit_client_ip();
    $userAgent = strtolower(trim((string)($_SERVER['HTTP_USER_AGENT'] ?? '')));
    $userAgent = $userAgent !== '' ? substr($userAgent, 0, 160) : 'unknown';
    return api_rate_limit_hash('client:' . $ip . '|ua:' . $userAgent);
}

function api_rate_limit_file(string $scope): string {
    $dir = __DIR__ . '/../../run/rate-limits';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir . '/' . hash('sha256', $scope) . '.json';
}

function api_rate_limit_state(string $scope): array {
    $file = api_rate_limit_file($scope);
    $fp = @fopen($file, 'c+');
    if (!$fp) {
        return ['fp' => null, 'state' => ['window_start' => time(), 'count' => 0, 'blocked_until' => 0]];
    }
    if (!@flock($fp, LOCK_EX)) {
        fclose($fp);
        return ['fp' => null, 'state' => ['window_start' => time(), 'count' => 0, 'blocked_until' => 0]];
    }
    $raw = stream_get_contents($fp);
    $decoded = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
    $state = is_array($decoded) ? $decoded : [];

    return ['fp' => $fp, 'state' => [
        'window_start' => (int)($state['window_start'] ?? time()),
        'count' => (int)($state['count'] ?? 0),
        'blocked_until' => (int)($state['blocked_until'] ?? 0),
    ]];
}

function api_rate_limit_commit($fp, array $state): void {
    if (!$fp) {
        return;
    }
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($state, JSON_UNESCAPED_UNICODE));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
}

function api_rate_limit_allow(string $scope, int $maxAttempts, int $windowSeconds): array {
    $now = time();
    $ctx = api_rate_limit_state($scope);
    $fp = $ctx['fp'];
    $state = $ctx['state'];

    if ($state['blocked_until'] > $now) {
        api_rate_limit_commit($fp, $state);
        return ['allowed' => false, 'retry_after' => max(1, $state['blocked_until'] - $now)];
    }

    if (($now - $state['window_start']) >= $windowSeconds) {
        $state['window_start'] = $now;
        $state['count'] = 0;
        $state['blocked_until'] = 0;
    }

    $state['count']++;
    if ($state['count'] > $maxAttempts) {
        $state['blocked_until'] = $now + $windowSeconds;
        api_rate_limit_commit($fp, $state);
        return ['allowed' => false, 'retry_after' => $windowSeconds];
    }

    api_rate_limit_commit($fp, $state);
    return ['allowed' => true, 'retry_after' => 0];
}

function api_rate_limit_enforce(string $scope, int $maxAttempts, int $windowSeconds, callable $deny): void {
    $result = api_rate_limit_allow($scope, $maxAttempts, $windowSeconds);
    if (!empty($result['allowed'])) {
        return;
    }
    $deny((int)($result['retry_after'] ?? 60));
}
