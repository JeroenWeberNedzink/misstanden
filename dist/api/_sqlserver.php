<?php
declare(strict_types=1);

function sqlserver_env_value(string $key, ?string $fallback = null): string {
    $value = trim((string)(getenv($key) ?: ''));
    if ($value !== '') {
        return $value;
    }
    return $fallback ?? '';
}

function sqlserver_bool_env(string $key, bool $default = false): bool {
    $value = strtolower(sqlserver_env_value($key));
    if ($value === '') {
        return $default;
    }
    return in_array($value, ['1', 'true', 'yes', 'on'], true);
}

function sqlserver_int_env(string $key, int $default = 0): int {
    $value = sqlserver_env_value($key);
    if ($value === '' || !is_numeric($value)) {
        return $default;
    }
    return (int)$value;
}

function sqlserver_is_configured(): bool {
    return sqlserver_env_value('SQLSERVER_HOST') !== ''
        && sqlserver_env_value('SQLSERVER_DATABASE') !== ''
        && sqlserver_env_value('SQLSERVER_USERNAME') !== ''
        && sqlserver_env_value('SQLSERVER_PASSWORD') !== '';
}

function sqlserver_config(): array {
    if (!sqlserver_is_configured()) {
        throw new Exception('SQL Server environment is not configured');
    }

    return [
        'host' => sqlserver_env_value('SQLSERVER_HOST'),
        'port' => sqlserver_int_env('SQLSERVER_PORT', 1433),
        'database' => sqlserver_env_value('SQLSERVER_DATABASE'),
        'username' => sqlserver_env_value('SQLSERVER_USERNAME'),
        'password' => sqlserver_env_value('SQLSERVER_PASSWORD'),
        'encrypt' => sqlserver_bool_env('SQLSERVER_ENCRYPT', true),
        'trustServerCertificate' => sqlserver_bool_env('SQLSERVER_TRUST_SERVER_CERTIFICATE', true),
        'loginTimeout' => sqlserver_int_env('SQLSERVER_LOGIN_TIMEOUT', 5),
        'commandTimeout' => sqlserver_int_env('SQLSERVER_COMMAND_TIMEOUT', 30),
    ];
}

function sqlserver_project_root(): string {
    $candidates = [
        dirname(__DIR__),
        dirname(__DIR__, 2),
    ];

    foreach ($candidates as $candidate) {
        $resolved = realpath($candidate);
        $path = ($resolved !== false && is_dir($resolved)) ? $resolved : $candidate;
        if (
            is_file($path . DIRECTORY_SEPARATOR . '.env')
            || is_dir($path . DIRECTORY_SEPARATOR . 'private')
            || is_dir($path . DIRECTORY_SEPARATOR . 'run')
        ) {
            return $path;
        }
    }

    $fallback = dirname(__DIR__, 2);
    $resolvedFallback = realpath($fallback);
    return ($resolvedFallback !== false && is_dir($resolvedFallback)) ? $resolvedFallback : $fallback;
}

function sqlserver_bridge_script_path(): string {
    $path = sqlserver_project_root() . DIRECTORY_SEPARATOR . 'private' . DIRECTORY_SEPARATOR . 'sqlserver-bridge.ps1';
    $resolved = realpath($path);
    return $resolved !== false ? $resolved : $path;
}

function sqlserver_temp_dir(): string {
    $dir = realpath(sqlserver_project_root() . DIRECTORY_SEPARATOR . 'run' . DIRECTORY_SEPARATOR . 'sqlserver');
    if ($dir === false) {
        $dir = sqlserver_project_root() . DIRECTORY_SEPARATOR . 'run' . DIRECTORY_SEPARATOR . 'sqlserver';
    }
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        throw new Exception('Unable to create SQL Server temp directory');
    }
    return $dir;
}

function sqlserver_normalize_parameter(string $name, $value): array {
    $normalizedName = ltrim(trim($name), '@');
    if ($normalizedName === '') {
        throw new Exception('SQL parameter name is required');
    }

    $parameter = [
        'name' => '@' . $normalizedName,
        'value' => $value,
        'dbType' => 'NVarChar',
    ];

    if ($value === null) {
        return $parameter;
    }

    if (is_bool($value)) {
        $parameter['dbType'] = 'Bit';
        return $parameter;
    }

    if (is_int($value)) {
        $parameter['dbType'] = 'Int';
        return $parameter;
    }

    if (is_float($value)) {
        $parameter['dbType'] = 'Float';
        return $parameter;
    }

    if (is_array($value)) {
        $parameter['value'] = json_encode($value, JSON_UNESCAPED_UNICODE);
        return $parameter;
    }

    $stringValue = (string)$value;
    if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $stringValue) === 1) {
        $parameter['dbType'] = 'UniqueIdentifier';
        $parameter['value'] = $stringValue;
        return $parameter;
    }

    if (preg_match('/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+\-]\d{2}:\d{2})?)?$/', $stringValue) === 1) {
        $parameter['dbType'] = 'DateTime2';
    }

    $parameter['value'] = $stringValue;
    return $parameter;
}

function sqlserver_run(array $commands, bool $transaction = true): array {
    $request = [
        'connection' => sqlserver_config(),
        'transaction' => $transaction,
        'commands' => array_values($commands),
    ];

    $requestPath = tempnam(sqlserver_temp_dir(), 'sqlsrv_req_');
    $responsePath = tempnam(sqlserver_temp_dir(), 'sqlsrv_res_');
    if ($requestPath === false || $responsePath === false) {
        throw new Exception('Unable to create SQL Server bridge temp files');
    }

    $payload = json_encode($request, JSON_UNESCAPED_UNICODE);
    if ($payload === false) {
        throw new Exception('Unable to encode SQL Server bridge payload');
    }
    file_put_contents($requestPath, $payload);

    $script = sqlserver_bridge_script_path();
    $cmd = 'powershell -NoProfile -ExecutionPolicy Bypass -File '
        . escapeshellarg($script)
        . ' -RequestPath ' . escapeshellarg($requestPath)
        . ' -ResponsePath ' . escapeshellarg($responsePath);

    exec($cmd, $output, $exitCode);

    $responseRaw = is_file($responsePath) ? (string)file_get_contents($responsePath) : '';
    @unlink($requestPath);
    @unlink($responsePath);

    if ($exitCode !== 0) {
        $message = trim($responseRaw) !== '' ? trim($responseRaw) : implode("\n", $output);
        throw new Exception('SQL Server bridge failed: ' . $message);
    }

    $responseRaw = preg_replace('/^\xEF\xBB\xBF/', '', $responseRaw) ?? $responseRaw;
    $decoded = json_decode($responseRaw, true);
    if (!is_array($decoded)) {
        throw new Exception('SQL Server bridge returned invalid JSON');
    }
    if (empty($decoded['success'])) {
        throw new Exception('SQL Server bridge error: ' . (string)($decoded['error'] ?? 'Unknown error'));
    }

    return $decoded['results'] ?? [];
}

function sqlserver_query(string $sql, array $params = [], int $timeout = 30): array {
    $normalizedParams = [];
    foreach ($params as $key => $value) {
        $normalizedParams[] = sqlserver_normalize_parameter((string)$key, $value);
    }

    $results = sqlserver_run([[
        'type' => 'query',
        'sql' => $sql,
        'params' => $normalizedParams,
        'timeout' => $timeout,
    ]]);

    return is_array($results[0]['rows'] ?? null) ? $results[0]['rows'] : [];
}

function sqlserver_scalar(string $sql, array $params = [], int $timeout = 30) {
    $normalizedParams = [];
    foreach ($params as $key => $value) {
        $normalizedParams[] = sqlserver_normalize_parameter((string)$key, $value);
    }

    $results = sqlserver_run([[
        'type' => 'scalar',
        'sql' => $sql,
        'params' => $normalizedParams,
        'timeout' => $timeout,
    ]]);

    return $results[0]['value'] ?? null;
}

function sqlserver_execute(string $sql, array $params = [], int $timeout = 30): int {
    $normalizedParams = [];
    foreach ($params as $key => $value) {
        $normalizedParams[] = sqlserver_normalize_parameter((string)$key, $value);
    }

    $results = sqlserver_run([[
        'type' => 'nonquery',
        'sql' => $sql,
        'params' => $normalizedParams,
        'timeout' => $timeout,
    ]]);

    return (int)($results[0]['affected'] ?? 0);
}
