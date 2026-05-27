<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_auth0.php';
require_once __DIR__ . '/_admin_auth.php';
require_once __DIR__ . '/_scopes.php';
require_once __DIR__ . '/_sqlserver.php';
require_once __DIR__ . '/_errors.php';
require_once __DIR__ . '/_security_headers.php';
require_once __DIR__ . '/_rate_limit.php';

api_apply_security_headers([
    'allow_methods' => 'GET, POST, OPTIONS',
    'allow_headers' => 'Content-Type, Authorization',
]);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'OK'], JSON_UNESCAPED_UNICODE);
    exit;
}

ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/../../php-errors.log');
ini_set('display_errors', '0');
error_reporting(E_ALL);

const WORKFLOWS_SCOPES_READ = [
    'admin:workflows:read',
    'admin:workflows:write',
    'read:workflows',
    'write:workflows',
    'manage:workflows',
    'admin:all',
    'admin',
];
const WORKFLOWS_SCOPES_WRITE = [
    'admin:workflows:write',
    'write:workflows',
    'manage:workflows',
    'admin:all',
    'admin',
];

function wf_performance_marker_file(): string {
    $dir = __DIR__ . '/../../run/cache';
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    return $dir . '/workflows-performance-indexes-v1.ok';
}

function wf_try_ensure_performance_indexes(): void {
    $marker = wf_performance_marker_file();
    if (is_file($marker) && ((time() - (int)@filemtime($marker)) < 86400)) return;

    try {
        sqlserver_execute(
            "IF OBJECT_ID(N'dbo.handler_workflows', N'U') IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_handler_workflows_workflow_id' AND object_id = OBJECT_ID(N'dbo.handler_workflows'))
             BEGIN
                 CREATE INDEX IX_handler_workflows_workflow_id ON dbo.handler_workflows(workflow_id, handler_id);
             END;

             IF OBJECT_ID(N'dbo.tickets', N'U') IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_tickets_workflow_type' AND object_id = OBJECT_ID(N'dbo.tickets'))
             BEGIN
                 CREATE INDEX IX_tickets_workflow_type ON dbo.tickets(workflow_type);
             END;

             IF OBJECT_ID(N'dbo.workflow_statuses', N'U') IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_workflow_statuses_workflow_sort' AND object_id = OBJECT_ID(N'dbo.workflow_statuses'))
             BEGIN
                 CREATE INDEX IX_workflow_statuses_workflow_sort ON dbo.workflow_statuses(workflow_id, sort_order);
             END;"
        );
        @file_put_contents($marker, (string)time());
    } catch (Throwable $e) {
        error_log('workflows performance index check skipped: ' . $e->getMessage());
    }
}

function wf_json(int $status, bool $success, string $message, $data = null): void {
    http_response_code($status);
    echo json_encode(['success' => $success, 'message' => $message, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

function wf_env(string $key): string {
    $value = getenv($key) ?: '';
    if ($value === '') throw new Exception('Missing env: ' . $key);
    return $value;
}

function wf_url(): string {
    throw new Exception('Legacy workflow REST path is disabled');
}

function wf_key(): string {
    throw new Exception('Legacy workflow REST path is disabled');
}

function wf_uuid(string $v): bool {
    return preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $v) === 1;
}

function wf_uuid4(): string {
    $d = random_bytes(16);
    $d[6] = chr((ord($d[6]) & 0x0f) | 0x40);
    $d[8] = chr((ord($d[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($d), 4));
}

function wf_req(string $method, string $url, string $key, $payload = null, bool $repr = false): array {
    $headers = ['apikey: ' . $key, 'Authorization: Bearer ' . $key, 'Content-Type: application/json'];
    if ($repr) $headers[] = 'Prefer: resolution=merge-duplicates,return=representation';

    $ch = curl_init();
    $curlOptions = [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 25,
    ];
    auth0_apply_ssl_options($curlOptions, $url);
    curl_setopt_array($ch, $curlOptions);
    if ($payload !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_UNICODE));
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($resp === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new Exception('Legacy REST request failed: ' . $err);
    }
    curl_close($ch);
    return [$code, json_decode($resp, true), $resp];
}

function wf_row($decoded) {
    if (is_array($decoded) && array_is_list($decoded)) return count($decoded) ? $decoded[0] : null;
    return is_array($decoded) ? $decoded : null;
}

function wf_or_fail(string $ctx, int $code, $decoded, string $raw): array {
    if ($code < 200 || $code >= 300) {
        $msg = is_array($decoded) ? json_encode($decoded, JSON_UNESCAPED_UNICODE) : $raw;
        throw new Exception($ctx . ': ' . $msg);
    }
    return is_array($decoded) ? $decoded : [];
}

function wf_is_admin(array $handler): bool {
    $roles = $handler['roles'] ?? [];
    if (is_string($roles)) {
        $tmp = json_decode($roles, true);
        $roles = is_array($tmp) ? $tmp : [$roles];
    }
    $roles = array_map(static fn($r) => strtoupper(trim((string)$r)), is_array($roles) ? $roles : []);
    if (in_array('ADMIN', $roles, true) || in_array('SUPER_ADMIN', $roles, true)) return true;

    $p = $handler['permissions'] ?? [];
    if (is_string($p)) {
        $tmp = json_decode($p, true);
        $p = is_array($tmp) ? $tmp : [];
    }
    return !empty($p['admin']) || !empty($p['manage_workflows']) || !empty($p['manage_users']) || !empty($p['manage_settings']);
}

function wf_roles_array($raw): array {
    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) $raw = $decoded;
        else $raw = [$raw];
    }
    if (!is_array($raw)) return [];

    $roles = [];
    foreach ($raw as $r) {
        $role = strtoupper(trim((string)$r));
        if ($role === '') continue;
        if (!in_array($role, $roles, true)) $roles[] = $role;
    }
    return $roles;
}

function wf_primary_role(array $roles): ?string {
    $priority = ['SUPER_ADMIN', 'ADMIN', 'PORTAL_ADMIN', 'HANDLER', 'USER'];
    foreach ($priority as $candidate) {
        if (in_array($candidate, $roles, true)) return $candidate;
    }
    return $roles[0] ?? null;
}

function wf_normalize_handler_row(array $handler): array {
    $roles = wf_roles_array($handler['roles'] ?? ($handler['role'] ?? []));
    $handler['roles'] = $roles;

    $role = trim((string)($handler['role'] ?? ''));
    $handler['role'] = $role !== '' ? strtoupper($role) : wf_primary_role($roles);
    return $handler;
}

function wf_normalize_handler_rows(array $rows): array {
    $out = [];
    foreach ($rows as $row) {
        $out[] = is_array($row) ? wf_normalize_handler_row($row) : $row;
    }
    return $out;
}

function wf_normalize_routing_rows(array $rows): array {
    $out = [];
    foreach ($rows as $row) {
        if (!is_array($row)) {
            $out[] = $row;
            continue;
        }
        if (isset($row['handlers']) && is_array($row['handlers'])) {
            $row['handlers'] = wf_normalize_handler_row($row['handlers']);
        }
        $out[] = $row;
    }
    return $out;
}

function wf_decode_json($value, $fallback) {
    if (is_array($value)) {
        return $value;
    }
    if (!is_string($value)) {
        return $fallback;
    }
    $trimmed = trim($value);
    if ($trimmed === '') {
        return $fallback;
    }
    $decoded = json_decode($trimmed, true);
    return json_last_error() === JSON_ERROR_NONE ? $decoded : $fallback;
}

function wf_sql_normalize_handler_row(array $row): array {
    $row['roles'] = wf_decode_json($row['roles'] ?? null, $row['roles'] ?? []);
    $row['permissions'] = wf_decode_json($row['permissions'] ?? null, $row['permissions'] ?? []);
    return wf_normalize_handler_row($row);
}

function wf_sql_normalize_handler_rows(array $rows): array {
    $out = [];
    foreach ($rows as $row) {
        $out[] = is_array($row) ? wf_sql_normalize_handler_row($row) : $row;
    }
    return $out;
}

function wf_sql_normalize_status_row(array $row): array {
    $row['next_codes'] = wf_decode_json($row['next_codes'] ?? null, []);
    return $row;
}

function wf_json_encode_value($value, $fallbackJson = '[]'): string {
    if (is_string($value)) {
        $trimmed = trim($value);
        if ($trimmed !== '') {
            return $trimmed;
        }
    }
    if (is_array($value)) {
        return (string)(json_encode($value, JSON_UNESCAPED_UNICODE) ?: $fallbackJson);
    }
    return $fallbackJson;
}

function wf_clean_role_codes($raw): array {
    $values = is_array($raw) ? $raw : [];
    $seen = [];
    $out = [];
    foreach ($values as $value) {
        $code = strtoupper(trim((string)$value));
        if ($code === '' || isset($seen[$code])) {
            continue;
        }
        $seen[$code] = true;
        $out[] = $code;
    }
    return $out ?: ['HANDLER'];
}

function wf_sql_sync_handler_roles(string $handlerId, array $roleCodes): void {
    $codes = wf_clean_role_codes($roleCodes);
    sqlserver_execute('DELETE FROM dbo.handler_roles WHERE handler_id = @handler_id', ['handler_id' => $handlerId]);

    if (!$codes) {
        return;
    }

    $params = ['handler_id' => $handlerId];
    $placeholders = [];
    foreach ($codes as $index => $code) {
        $key = 'code_' . $index;
        $params[$key] = $code;
        $placeholders[] = '@' . $key;
    }

    $roleRows = sqlserver_query(
        'SELECT id FROM dbo.roles WHERE code IN (' . implode(', ', $placeholders) . ')',
        $params
    );

    foreach ($roleRows as $row) {
        $roleId = trim((string)($row['id'] ?? ''));
        if ($roleId === '') {
            continue;
        }
        sqlserver_execute(
            'INSERT INTO dbo.handler_roles (handler_id, role_id, created_at) VALUES (@handler_id, @role_id, SYSUTCDATETIME())',
            ['handler_id' => $handlerId, 'role_id' => $roleId]
        );
    }
}

function wf_require_admin(string $baseUrl, string $serviceKey, array $requiredScopes = []): array {
    unset($baseUrl, $serviceKey);
    $ctx = api_authz_require_admin(static function (int $status, string $message): void {
        wf_json($status, false, $message);
    }, $requiredScopes);
    return is_array($ctx['handler'] ?? null) ? $ctx['handler'] : [];
}

function wf_status_list(string $baseUrl, string $serviceKey, string $workflowId): array {
    if (sqlserver_is_configured()) {
        $rows = sqlserver_query(
            'SELECT * FROM dbo.workflow_statuses WHERE workflow_id = @workflow_id ORDER BY sort_order ASC, label ASC',
            ['workflow_id' => $workflowId]
        );
        return ['rows' => array_map('wf_sql_normalize_status_row', $rows)];
    }
    [$code, $decoded, $raw] = wf_req('GET', $baseUrl . '/rest/v1/workflow_statuses?select=*&workflow_id=eq.' . rawurlencode($workflowId) . '&order=sort_order.asc', $serviceKey);
    return ['rows' => wf_or_fail('Load workflow statuses', $code, $decoded, $raw)];
}

function wf_clean_uuid_array($raw): array {
    if (!is_array($raw)) return [];
    $seen = [];
    $out = [];
    foreach ($raw as $item) {
        $id = trim((string)$item);
        if (!wf_uuid($id)) continue;
        if (isset($seen[$id])) continue;
        $seen[$id] = true;
        $out[] = $id;
    }
    return $out;
}

function wf_query_bool(string $key, bool $default = false): bool {
    if (!array_key_exists($key, $_GET)) return $default;
    $raw = strtolower(trim((string)($_GET[$key] ?? '')));
    if ($raw === '') return $default;
    return in_array($raw, ['1', 'true', 'yes', 'on'], true);
}

function wf_query_int(string $key, int $default = 0): int {
    if (!array_key_exists($key, $_GET)) return $default;
    return (int)($_GET[$key] ?? $default);
}

function wf_clean_id_array($raw): array {
    if (!is_array($raw)) return [];
    $seen = [];
    $out = [];
    foreach ($raw as $item) {
        $id = trim((string)$item);
        if ($id === '') continue;
        if (isset($seen[$id])) continue;
        $seen[$id] = true;
        $out[] = $id;
    }
    return $out;
}

function wf_debug_diagnostics(): array {
    return array_merge(
        auth0_ssl_diagnostics(),
        [
            'env_present' => [
                'VITE_AUTH0_DOMAIN' => trim((string)(getenv('VITE_AUTH0_DOMAIN') ?: '')) !== '',
                'VITE_AUTH0_CLIENT_ID' => trim((string)(getenv('VITE_AUTH0_CLIENT_ID') ?: '')) !== '',
                'VITE_AUTH0_AUDIENCE' => trim((string)(getenv('VITE_AUTH0_AUDIENCE') ?: '')) !== '',
                'SQLSERVER_HOST' => trim((string)(getenv('SQLSERVER_HOST') ?: '')) !== '',
                'SQLSERVER_DATABASE' => trim((string)(getenv('SQLSERVER_DATABASE') ?: '')) !== '',
                'SQLSERVER_USERNAME' => trim((string)(getenv('SQLSERVER_USERNAME') ?: '')) !== '',
                'SQLSERVER_PASSWORD' => trim((string)(getenv('SQLSERVER_PASSWORD') ?: '')) !== '',
            ],
        ]
    );
}

try {
    load_runtime_env(__DIR__);

    if (!sqlserver_is_configured()) {
        throw new Exception('SQL Server is not configured');
    }
    $baseUrl = '';
    $serviceKey = '';
    $requiredScopes = $_SERVER['REQUEST_METHOD'] === 'GET' ? WORKFLOWS_SCOPES_READ : WORKFLOWS_SCOPES_WRITE;
    $adminHandler = wf_require_admin($baseUrl, $serviceKey, $requiredScopes);
    wf_try_ensure_performance_indexes();
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        $handlerId = trim((string)($adminHandler['id'] ?? ''));
        $actorKey = api_rate_limit_hash('workflows_actor:' . ($handlerId !== '' ? $handlerId : 'unknown'));
        $clientKey = api_rate_limit_client_fingerprint();
        api_rate_limit_enforce(
            'workflows:write:actor:' . $actorKey,
            160,
            300,
            static function (int $retryAfter): void {
                wf_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $retryAfter]);
            }
        );
        api_rate_limit_enforce(
            'workflows:write:client:' . $clientKey,
            400,
            300,
            static function (int $retryAfter): void {
                wf_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $retryAfter]);
            }
        );
    }

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $action = strtolower(trim((string)($_GET['action'] ?? 'list_with_stats')));
        if ($action === 'list_with_stats') {
            if (sqlserver_is_configured()) {
                $rows = sqlserver_query(
                    'SELECT
                        w.*,
                        COALESCE(ws.status_count, 0) AS status_count,
                        COALESCE(t.ticket_count, 0) AS ticket_count,
                        COALESCE(hw.handler_count, 0) AS handler_count
                    FROM dbo.workflows w
                    LEFT JOIN (
                        SELECT workflow_id, COUNT(*) AS status_count
                        FROM dbo.workflow_statuses
                        GROUP BY workflow_id
                    ) ws ON ws.workflow_id = w.id
                    LEFT JOIN (
                        SELECT workflow_type, COUNT(*) AS ticket_count
                        FROM dbo.tickets
                        GROUP BY workflow_type
                    ) t ON t.workflow_type = w.code
                    LEFT JOIN (
                        SELECT workflow_id, COUNT(*) AS handler_count
                        FROM dbo.handler_workflows
                        GROUP BY workflow_id
                    ) hw ON hw.workflow_id = w.id
                    ORDER BY w.display_order ASC, w.name ASC'
                );
                $rows = array_map(static function (array $row): array {
                    $statusCount = (int)($row['status_count'] ?? 0);
                    $ticketCount = (int)($row['ticket_count'] ?? 0);
                    $handlerCount = (int)($row['handler_count'] ?? 0);
                    unset($row['status_count'], $row['ticket_count'], $row['handler_count']);
                    $row['workflow_statuses'] = [['count' => $statusCount]];
                    $row['tickets'] = [['count' => $ticketCount]];
                    $row['handler_workflows'] = [['count' => $handlerCount]];
                    return $row;
                }, $rows);
                wf_json(200, true, 'Workflows loaded', ['rows' => $rows]);
            }
            $select = rawurlencode('*,workflow_statuses:workflow_statuses(count),tickets:tickets(count),handler_workflows:handler_workflows(count)');
            [$code, $decoded, $raw] = wf_req('GET', $baseUrl . '/rest/v1/workflows?select=' . $select . '&order=display_order.asc', $serviceKey);
            wf_json(200, true, 'Workflows loaded', ['rows' => wf_or_fail('List workflows', $code, $decoded, $raw)]);
        }
        if ($action === 'active_handlers') {
            if (sqlserver_is_configured()) {
                $rows = sqlserver_query(
                    'SELECT id, name, email, roles, active FROM dbo.handlers WHERE active = @active ORDER BY name ASC',
                    ['active' => true]
                );
                wf_json(200, true, 'Handlers loaded', ['rows' => wf_sql_normalize_handler_rows($rows)]);
            }
            [$code, $decoded, $raw] = wf_req('GET', $baseUrl . '/rest/v1/handlers?select=id,name,email,roles,active&active=eq.true&order=name.asc', $serviceKey);
            $rows = wf_or_fail('List handlers', $code, $decoded, $raw);
            wf_json(200, true, 'Handlers loaded', ['rows' => wf_normalize_handler_rows($rows)]);
        }
        if ($action === 'all_handlers') {
            $includeInactive = wf_query_bool('include_inactive', false);
            if (sqlserver_is_configured()) {
                $sql = 'SELECT id, name, email, phone, active, roles, permissions, user_id, picture, created_at, updated_at, last_login FROM dbo.handlers';
                if (!$includeInactive) {
                    $sql .= ' WHERE active = @active';
                }
                $sql .= ' ORDER BY name ASC';
                $rows = sqlserver_query($sql, $includeInactive ? [] : ['active' => true]);
                wf_json(200, true, 'All handlers loaded', ['rows' => wf_sql_normalize_handler_rows($rows)]);
            }
            $select = 'id,name,email,phone,active,roles,permissions,user_id,picture,created_at,updated_at,last_login';
            $url = $baseUrl . '/rest/v1/handlers?select=' . rawurlencode($select) . '&order=name.asc';
            if (!$includeInactive) {
                $url .= '&active=eq.true';
            }
            [$code, $decoded, $raw] = wf_req('GET', $url, $serviceKey);
            $rows = wf_or_fail('List all handlers', $code, $decoded, $raw);
            wf_json(200, true, 'All handlers loaded', ['rows' => wf_normalize_handler_rows($rows)]);
        }
        if ($action === 'locations_list') {
            $includeInactive = wf_query_bool('include_inactive', false);
            if (sqlserver_is_configured()) {
                $sql = 'SELECT id, country_code, country_name, display_order, active, created_at, updated_at, created_by, updated_by FROM dbo.locations';
                if (!$includeInactive) {
                    $sql .= ' WHERE active = @active';
                }
                $sql .= ' ORDER BY display_order ASC, country_name ASC';
                $rows = sqlserver_query($sql, $includeInactive ? [] : ['active' => true]);
                wf_json(200, true, 'Locations loaded', ['rows' => $rows]);
            }
            $select = 'id,country_code,country_name,display_order,active,created_at,updated_at,created_by,updated_by';
            $url = $baseUrl . '/rest/v1/locations?select=' . rawurlencode($select) . '&order=display_order.asc&order=country_name.asc';
            if (!$includeInactive) {
                $url .= '&active=eq.true';
            }
            [$code, $decoded, $raw] = wf_req('GET', $url, $serviceKey);
            $rows = wf_or_fail('List locations', $code, $decoded, $raw);
            wf_json(200, true, 'Locations loaded', ['rows' => $rows]);
        }
        if ($action === 'location_by_id') {
            $id = trim((string)($_GET['id'] ?? ''));
            if (!wf_uuid($id)) throw new Exception('id must be UUID');
            if (sqlserver_is_configured()) {
                $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.locations WHERE id = @id', ['id' => $id]);
                $row = $rows[0] ?? null;
                if (!$row) wf_json(404, false, 'Location not found');
                wf_json(200, true, 'Location loaded', ['row' => $row]);
            }
            [$code, $decoded, $raw] = wf_req(
                'GET',
                $baseUrl . '/rest/v1/locations?select=*&id=eq.' . rawurlencode($id) . '&limit=1',
                $serviceKey
            );
            $row = wf_row(wf_or_fail('Load location by id', $code, $decoded, $raw));
            if (!$row) wf_json(404, false, 'Location not found');
            wf_json(200, true, 'Location loaded', ['row' => $row]);
        }
        if ($action === 'location_by_code') {
            $countryCode = strtoupper(trim((string)($_GET['country_code'] ?? '')));
            if ($countryCode === '' || preg_match('/^[A-Z]{2}$/', $countryCode) !== 1) {
                throw new Exception('country_code must be 2 letters');
            }
            if (sqlserver_is_configured()) {
                $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.locations WHERE country_code = @country_code', ['country_code' => $countryCode]);
                $row = $rows[0] ?? null;
                if (!$row) wf_json(404, false, 'Location not found');
                wf_json(200, true, 'Location loaded', ['row' => $row]);
            }
            [$code, $decoded, $raw] = wf_req(
                'GET',
                $baseUrl . '/rest/v1/locations?select=*&country_code=eq.' . rawurlencode($countryCode) . '&limit=1',
                $serviceKey
            );
            $row = wf_row(wf_or_fail('Load location by code', $code, $decoded, $raw));
            if (!$row) wf_json(404, false, 'Location not found');
            wf_json(200, true, 'Location loaded', ['row' => $row]);
        }
        if ($action === 'handlers_by_ids') {
            $includeInactive = wf_query_bool('include_inactive', true);
            $rawIds = trim((string)($_GET['ids'] ?? ''));
            $ids = wf_clean_uuid_array(array_filter(array_map('trim', explode(',', $rawIds)), static fn($x) => $x !== ''));
            if (!$ids) {
                wf_json(200, true, 'Handlers loaded', ['rows' => []]);
            }

            $ids = array_slice($ids, 0, 100);
            if (sqlserver_is_configured()) {
                $params = [];
                $placeholders = [];
                foreach ($ids as $index => $value) {
                    $key = 'id_' . $index;
                    $params[$key] = $value;
                    $placeholders[] = '@' . $key;
                }
                $sql = 'SELECT id, name, email, phone, active, roles, permissions, user_id, picture, created_at, updated_at, last_login FROM dbo.handlers WHERE id IN (' . implode(', ', $placeholders) . ')';
                if (!$includeInactive) {
                    $sql .= ' AND active = @active';
                    $params['active'] = true;
                }
                $sql .= ' ORDER BY name ASC';
                $rows = sqlserver_query($sql, $params);
                wf_json(200, true, 'Handlers loaded', ['rows' => wf_sql_normalize_handler_rows($rows)]);
            }
            $inValues = '(' . implode(',', array_map(static fn($x) => '"' . $x . '"', $ids)) . ')';
            $select = 'id,name,email,phone,active,roles,permissions,user_id,picture,created_at,updated_at,last_login';
            $url = $baseUrl . '/rest/v1/handlers?select=' . rawurlencode($select) . '&id=in.' . rawurlencode($inValues) . '&order=name.asc';
            if (!$includeInactive) {
                $url .= '&active=eq.true';
            }
            [$code, $decoded, $raw] = wf_req('GET', $url, $serviceKey);
            $rows = wf_or_fail('List handlers by ids', $code, $decoded, $raw);
            wf_json(200, true, 'Handlers loaded', ['rows' => wf_normalize_handler_rows($rows)]);
        }
        if ($action === 'routing_rules') {
            $workflowId = trim((string)($_GET['workflow_id'] ?? ''));
            if (!wf_uuid($workflowId)) throw new Exception('workflow_id must be UUID');
            if (sqlserver_is_configured()) {
                $rows = sqlserver_query(
                    'SELECT
                        hw.id,
                        hw.handler_id,
                        hw.workflow_id,
                        h.id AS handler_ref_id,
                        h.name AS handler_name,
                        h.email AS handler_email,
                        h.roles AS handler_roles,
                        h.active AS handler_active
                    FROM dbo.handler_workflows hw
                    LEFT JOIN dbo.handlers h ON h.id = hw.handler_id
                    WHERE hw.workflow_id = @workflow_id
                    ORDER BY h.name ASC',
                    ['workflow_id' => $workflowId]
                );
                $normalized = array_map(static function (array $row): array {
                    $handler = null;
                    if (!empty($row['handler_ref_id'])) {
                        $handler = wf_sql_normalize_handler_row([
                            'id' => $row['handler_ref_id'],
                            'name' => $row['handler_name'] ?? null,
                            'email' => $row['handler_email'] ?? null,
                            'roles' => $row['handler_roles'] ?? [],
                            'active' => $row['handler_active'] ?? false,
                        ]);
                    }
                    return [
                        'id' => $row['id'] ?? null,
                        'handler_id' => $row['handler_id'] ?? null,
                        'workflow_id' => $row['workflow_id'] ?? null,
                        'handlers' => $handler,
                    ];
                }, $rows);
                wf_json(200, true, 'Routing rules loaded', ['rows' => $normalized]);
            }
            $select = rawurlencode('id,handler_id,workflow_id,handlers:handler_id(id,name,email,roles,active)');
            [$code, $decoded, $raw] = wf_req('GET', $baseUrl . '/rest/v1/handler_workflows?select=' . $select . '&workflow_id=eq.' . rawurlencode($workflowId), $serviceKey);
            $rows = wf_or_fail('List routing rules', $code, $decoded, $raw);
            wf_json(200, true, 'Routing rules loaded', ['rows' => wf_normalize_routing_rows($rows)]);
        }
        if ($action === 'status_list') {
            $workflowId = trim((string)($_GET['workflow_id'] ?? ''));
            if (!wf_uuid($workflowId)) throw new Exception('workflow_id must be UUID');
            wf_json(200, true, 'Workflow statuses loaded', wf_status_list($baseUrl, $serviceKey, $workflowId));
        }
        if ($action === 'workflow_phases') {
            $workflowId = trim((string)($_GET['workflow_id'] ?? ''));
            if (!wf_uuid($workflowId)) throw new Exception('workflow_id must be UUID');
            if (sqlserver_is_configured()) {
                $rows = sqlserver_query(
                    'SELECT * FROM dbo.workflow_phases WHERE workflow_id = @workflow_id AND active = @active ORDER BY sort_order ASC, phase_name ASC',
                    ['workflow_id' => $workflowId, 'active' => true]
                );
                wf_json(200, true, 'Workflow phases loaded', ['rows' => $rows]);
            }
        }
        if ($action === 'workflow_phases_by_code') {
            $workflowCode = trim((string)($_GET['workflow_code'] ?? ''));
            if ($workflowCode === '') throw new Exception('workflow_code is required');
            if (sqlserver_is_configured()) {
                $rows = sqlserver_query(
                    'SELECT wp.*
                     FROM dbo.workflow_phases wp
                     INNER JOIN dbo.workflows w ON w.id = wp.workflow_id
                     WHERE w.code = @workflow_code AND wp.active = @active
                     ORDER BY wp.sort_order ASC, wp.phase_name ASC',
                    ['workflow_code' => $workflowCode, 'active' => true]
                );
                wf_json(200, true, 'Workflow phases loaded', ['rows' => $rows]);
            }
        }
        if ($action === 'workflow_phase_steps') {
            $phaseId = trim((string)($_GET['phase_id'] ?? ''));
            if (!wf_uuid($phaseId)) throw new Exception('phase_id must be UUID');
            if (sqlserver_is_configured()) {
                $rows = sqlserver_query(
                    'SELECT * FROM dbo.workflow_phase_steps WHERE phase_id = @phase_id ORDER BY sort_order ASC, step_name ASC',
                    ['phase_id' => $phaseId]
                );
                wf_json(200, true, 'Workflow phase steps loaded', ['rows' => $rows]);
            }
        }
        if ($action === 'workflow_contacts') {
            $workflowId = trim((string)($_GET['workflow_id'] ?? ''));
            $countryCode = strtoupper(trim((string)($_GET['country_code'] ?? '')));
            $phaseId = trim((string)($_GET['phase_id'] ?? ''));
            if (!wf_uuid($workflowId)) throw new Exception('workflow_id must be UUID');
            if ($phaseId !== '' && !wf_uuid($phaseId)) throw new Exception('phase_id must be UUID');
            if (sqlserver_is_configured()) {
                $params = ['workflow_id' => $workflowId, 'active' => true];
                $sql = 'SELECT * FROM dbo.workflow_contacts WHERE workflow_id = @workflow_id AND active = @active';
                if ($countryCode !== '') {
                    $sql .= ' AND (country_code = @country_code OR country_code IS NULL)';
                    $params['country_code'] = $countryCode;
                }
                if ($phaseId !== '') {
                    $sql .= ' AND phase_id = @phase_id';
                    $params['phase_id'] = $phaseId;
                }
                $sql .= ' ORDER BY sort_order ASC, contact_name ASC';
                $rows = sqlserver_query($sql, $params);
                wf_json(200, true, 'Workflow contacts loaded', ['rows' => $rows]);
            }
        }
        if ($action === 'workflow_contacts_by_country') {
            $countryCode = strtoupper(trim((string)($_GET['country_code'] ?? '')));
            if ($countryCode === '') throw new Exception('country_code is required');
            if (sqlserver_is_configured()) {
                $rows = sqlserver_query(
                    'SELECT wc.*, w.code AS workflow_code, w.name AS workflow_name
                     FROM dbo.workflow_contacts wc
                     INNER JOIN dbo.workflows w ON w.id = wc.workflow_id
                     WHERE wc.active = @active AND (wc.country_code = @country_code OR wc.country_code IS NULL)
                     ORDER BY wc.sort_order ASC, wc.contact_name ASC',
                    ['active' => true, 'country_code' => $countryCode]
                );
                wf_json(200, true, 'Workflow contacts loaded', ['rows' => $rows]);
            }
        }
        if ($action === 'workflow_advice_contacts') {
            $countryCode = strtoupper(trim((string)($_GET['country_code'] ?? 'NL')));
            if (sqlserver_is_configured()) {
                $rows = sqlserver_query(
                    'SELECT wc.*, wp.phase_code
                     FROM dbo.workflow_contacts wc
                     INNER JOIN dbo.workflow_phases wp ON wp.id = wc.phase_id
                     WHERE wc.active = @active
                       AND wp.phase_code = @phase_code
                       AND (wc.country_code = @country_code OR wc.country_code IS NULL)
                     ORDER BY wc.sort_order ASC, wc.contact_name ASC',
                    ['active' => true, 'phase_code' => 'advice', 'country_code' => $countryCode]
                );
                wf_json(200, true, 'Advice contacts loaded', ['rows' => $rows]);
            }
        }
        if ($action === 'workflow_external_authorities') {
            $countryCode = strtoupper(trim((string)($_GET['country_code'] ?? '')));
            if ($countryCode === '') throw new Exception('country_code is required');
            if (sqlserver_is_configured()) {
                $rows = sqlserver_query(
                    'SELECT * FROM dbo.workflow_contacts
                     WHERE active = @active AND contact_type = @contact_type AND country_code = @country_code
                     ORDER BY sort_order ASC, contact_name ASC',
                    ['active' => true, 'contact_type' => 'authority', 'country_code' => $countryCode]
                );
                wf_json(200, true, 'External authorities loaded', ['rows' => $rows]);
            }
        }
        if ($action === 'handler_workflow_ids') {
            $handlerId = trim((string)($_GET['handler_id'] ?? ''));
            if (!wf_uuid($handlerId)) throw new Exception('handler_id must be UUID');
            if (sqlserver_is_configured()) {
                $rows = sqlserver_query(
                    'SELECT workflow_id FROM dbo.handler_workflows WHERE handler_id = @handler_id',
                    ['handler_id' => $handlerId]
                );
                $workflowIds = array_values(array_filter(array_map(static fn($r) => trim((string)($r['workflow_id'] ?? '')), $rows), static fn($x) => wf_uuid($x)));
                wf_json(200, true, 'Handler workflows loaded', ['handler_id' => $handlerId, 'workflow_ids' => $workflowIds]);
            }
            [$code, $decoded, $raw] = wf_req('GET', $baseUrl . '/rest/v1/handler_workflows?select=workflow_id&handler_id=eq.' . rawurlencode($handlerId), $serviceKey);
            $rows = wf_or_fail('Load handler workflows', $code, $decoded, $raw);
            $workflowIds = array_values(array_filter(array_map(static fn($r) => trim((string)($r['workflow_id'] ?? '')), $rows), static fn($x) => wf_uuid($x)));
            wf_json(200, true, 'Handler workflows loaded', ['handler_id' => $handlerId, 'workflow_ids' => $workflowIds]);
        }
        if ($action === 'handler_stats') {
            $rawIds = trim((string)($_GET['ids'] ?? ''));
            $ids = wf_clean_uuid_array(array_filter(array_map('trim', explode(',', $rawIds)), static fn($x) => $x !== ''));
            if (!$ids) {
                wf_json(200, true, 'Handler stats loaded', ['rows' => []]);
            }
            if (sqlserver_is_configured()) {
                $params = [];
                $placeholders = [];
                foreach ($ids as $index => $id) {
                    $key = 'id_' . $index;
                    $params[$key] = $id;
                    $placeholders[] = '@' . $key;
                }
                $rows = sqlserver_query(
                    'SELECT
                        h.id AS handler_id,
                        (
                            SELECT COUNT(*)
                            FROM dbo.tickets t
                            WHERE t.handler_id = h.id
                               OR EXISTS (
                                    SELECT 1
                                    FROM dbo.handler_workflows hw
                                    INNER JOIN dbo.workflows w ON w.id = hw.workflow_id
                                    WHERE hw.handler_id = h.id
                                      AND w.code = t.workflow_type
                               )
                        ) AS ticket_count,
                        (
                            SELECT COUNT(*)
                            FROM dbo.handler_workflows hw
                            WHERE hw.handler_id = h.id
                        ) AS workflow_count
                     FROM dbo.handlers h
                     WHERE h.id IN (' . implode(', ', $placeholders) . ')',
                    $params
                );
                wf_json(200, true, 'Handler stats loaded', ['rows' => $rows]);
            }
        }
        if ($action === 'handler_roles') {
            $handlerId = trim((string)($_GET['handler_id'] ?? ''));
            if (!wf_uuid($handlerId)) throw new Exception('handler_id must be UUID');
            if (sqlserver_is_configured()) {
                $rows = sqlserver_query(
                    'SELECT r.id, r.code, r.name, r.description, r.is_system, r.is_default
                     FROM dbo.handler_roles hr
                     INNER JOIN dbo.roles r ON r.id = hr.role_id
                     WHERE hr.handler_id = @handler_id
                     ORDER BY r.name ASC',
                    ['handler_id' => $handlerId]
                );
                wf_json(200, true, 'Handler roles loaded', ['rows' => $rows]);
            }
        }
        if ($action === 'handler_permissions') {
            $handlerId = trim((string)($_GET['handler_id'] ?? ''));
            if (!wf_uuid($handlerId)) throw new Exception('handler_id must be UUID');
            if (sqlserver_is_configured()) {
                $rows = sqlserver_query(
                    'SELECT DISTINCT p.id, p.code, p.name, p.description, p.category, p.is_system
                     FROM dbo.handler_roles hr
                     INNER JOIN dbo.role_permissions rp ON rp.role_id = hr.role_id
                     INNER JOIN dbo.permissions p ON p.id = rp.permission_id
                     WHERE hr.handler_id = @handler_id
                     ORDER BY p.category ASC, p.name ASC',
                    ['handler_id' => $handlerId]
                );
                wf_json(200, true, 'Handler permissions loaded', ['rows' => $rows]);
            }
        }
        if ($action === 'handler_has_permission') {
            $handlerId = trim((string)($_GET['handler_id'] ?? ''));
            $permissionCode = trim((string)($_GET['permission_code'] ?? ''));
            if (!wf_uuid($handlerId)) throw new Exception('handler_id must be UUID');
            if ($permissionCode === '') throw new Exception('permission_code is required');
            if (sqlserver_is_configured()) {
                $value = sqlserver_scalar(
                    'SELECT TOP 1 1
                     FROM dbo.handler_roles hr
                     INNER JOIN dbo.role_permissions rp ON rp.role_id = hr.role_id
                     INNER JOIN dbo.permissions p ON p.id = rp.permission_id
                     WHERE hr.handler_id = @handler_id AND p.code = @permission_code',
                    ['handler_id' => $handlerId, 'permission_code' => $permissionCode]
                );
                wf_json(200, true, 'Handler permission checked', ['allowed' => !empty($value)]);
            }
        }
        if ($action === 'permissions_list') {
            if (sqlserver_is_configured()) {
                $rows = sqlserver_query('SELECT * FROM dbo.permissions ORDER BY category ASC, name ASC');
                wf_json(200, true, 'Permissions loaded', ['rows' => $rows]);
            }
            [$code, $decoded, $raw] = wf_req('GET', $baseUrl . '/rest/v1/permissions?select=*&order=category.asc,name.asc', $serviceKey);
            $rows = wf_or_fail('List permissions', $code, $decoded, $raw);
            wf_json(200, true, 'Permissions loaded', ['rows' => $rows]);
        }
        if ($action === 'roles_list') {
            if (sqlserver_is_configured()) {
                $rows = sqlserver_query('SELECT * FROM dbo.roles ORDER BY name ASC');
                wf_json(200, true, 'Roles loaded', ['rows' => $rows]);
            }
            [$code, $decoded, $raw] = wf_req('GET', $baseUrl . '/rest/v1/roles?select=*&order=name.asc', $serviceKey);
            $rows = wf_or_fail('List roles', $code, $decoded, $raw);
            wf_json(200, true, 'Roles loaded', ['rows' => $rows]);
        }
        if ($action === 'role_with_permissions') {
            $roleId = trim((string)($_GET['role_id'] ?? ''));
            if ($roleId === '') throw new Exception('role_id is required');
            if (sqlserver_is_configured()) {
                $roleRows = sqlserver_query('SELECT TOP 1 * FROM dbo.roles WHERE id = @id', ['id' => $roleId]);
                $row = $roleRows[0] ?? null;
                if (!$row) {
                    throw new Exception('Role not found');
                }
                $permissionRows = sqlserver_query(
                    'SELECT
                        rp.permission_id,
                        p.id,
                        p.code,
                        p.name,
                        p.description,
                        p.category,
                        p.is_system
                    FROM dbo.role_permissions rp
                    INNER JOIN dbo.permissions p ON p.id = rp.permission_id
                    WHERE rp.role_id = @role_id
                    ORDER BY p.category ASC, p.name ASC',
                    ['role_id' => $roleId]
                );
                $row['role_permissions'] = array_map(static function (array $permissionRow): array {
                    return [
                        'permission_id' => $permissionRow['permission_id'] ?? null,
                        'permissions' => [[
                            'id' => $permissionRow['id'] ?? null,
                            'code' => $permissionRow['code'] ?? null,
                            'name' => $permissionRow['name'] ?? null,
                            'description' => $permissionRow['description'] ?? null,
                            'category' => $permissionRow['category'] ?? null,
                            'is_system' => $permissionRow['is_system'] ?? null,
                        ]],
                    ];
                }, $permissionRows);
                wf_json(200, true, 'Role loaded', ['row' => $row]);
            }
            $select = rawurlencode('*,role_permissions(permission_id,permissions(id,code,name,description,category,is_system))');
            [$code, $decoded, $raw] = wf_req('GET', $baseUrl . '/rest/v1/roles?select=' . $select . '&id=eq.' . rawurlencode($roleId) . '&limit=1', $serviceKey);
            $rows = wf_or_fail('Load role with permissions', $code, $decoded, $raw);
            $row = wf_row($rows);
            if (!$row) throw new Exception('Role not found');
            wf_json(200, true, 'Role loaded', ['row' => $row]);
        }
        if ($action === 'audit_logs') {
            $dateFrom = trim((string)($_GET['date_from'] ?? ''));
            $dateTo = trim((string)($_GET['date_to'] ?? ''));
            $schemaName = trim((string)($_GET['schema_name'] ?? 'all'));
            $tableName = trim((string)($_GET['table_name'] ?? 'all'));
            $operation = strtoupper(trim((string)($_GET['operation'] ?? 'all')));
            $search = trim((string)($_GET['search'] ?? ''));
            $limit = max(1, min(2000, wf_query_int('limit', 500)));
            $offset = max(0, wf_query_int('offset', 0));

            if (sqlserver_is_configured()) {
                $params = ['limit' => $limit, 'offset' => $offset];
                $clauses = [];
                if ($dateFrom !== '') {
                    $clauses[] = 'occurred_at >= @date_from';
                    $params['date_from'] = $dateFrom;
                }
                if ($dateTo !== '') {
                    $clauses[] = 'occurred_at <= @date_to';
                    $params['date_to'] = $dateTo;
                }
                if ($schemaName !== '' && strtolower($schemaName) !== 'all') {
                    $clauses[] = 'schema_name = @schema_name';
                    $params['schema_name'] = $schemaName;
                }
                if ($tableName !== '' && strtolower($tableName) !== 'all') {
                    $clauses[] = 'table_name = @table_name';
                    $params['table_name'] = $tableName;
                }
                if ($operation !== '' && strtolower($operation) !== 'all') {
                    $clauses[] = 'operation = @operation';
                    $params['operation'] = $operation;
                }
                if ($search !== '') {
                    $clauses[] = '(row_id LIKE @search OR changed_by LIKE @search)';
                    $params['search'] = '%' . str_replace('*', '', $search) . '%';
                }

                $sql = 'SELECT * FROM dbo.audit_logs';
                if ($clauses) {
                    $sql .= ' WHERE ' . implode(' AND ', $clauses);
                }
                $sql .= ' ORDER BY occurred_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';
                $rows = sqlserver_query($sql, $params);
                wf_json(200, true, 'Audit logs loaded', ['rows' => $rows]);
            }

            $url = $baseUrl . '/rest/v1/audit_logs?select=*&order=occurred_at.desc';
            if ($dateFrom !== '') $url .= '&occurred_at=gte.' . rawurlencode($dateFrom);
            if ($dateTo !== '') $url .= '&occurred_at=lte.' . rawurlencode($dateTo);
            if ($schemaName !== '' && strtolower($schemaName) !== 'all') {
                $url .= '&schema_name=eq.' . rawurlencode($schemaName);
            }
            if ($tableName !== '' && strtolower($tableName) !== 'all') {
                $url .= '&table_name=eq.' . rawurlencode($tableName);
            }
            if ($operation !== '' && strtolower($operation) !== 'all') {
                $url .= '&operation=eq.' . rawurlencode($operation);
            }
            if ($search !== '') {
                $needle = str_replace('*', '', $search);
                $url .= '&row_id=ilike.' . rawurlencode('*' . $needle . '*');
            }
            $url .= '&limit=' . $limit . '&offset=' . $offset;

            [$code, $decoded, $raw] = wf_req('GET', $url, $serviceKey);
            $rows = wf_or_fail('List audit logs', $code, $decoded, $raw);
            wf_json(200, true, 'Audit logs loaded', ['rows' => $rows]);
        }
        if ($action === 'notification_logs') {
            $dateFrom = trim((string)($_GET['date_from'] ?? ''));
            $dateTo = trim((string)($_GET['date_to'] ?? ''));
            $channel = trim((string)($_GET['channel'] ?? 'all'));
            $status = trim((string)($_GET['status'] ?? 'all'));
            if (sqlserver_is_configured()) {
                $params = [];
                $clauses = [];
                if ($dateFrom !== '') {
                    $clauses[] = 'created_at >= @date_from';
                    $params['date_from'] = $dateFrom;
                }
                if ($dateTo !== '') {
                    $clauses[] = 'created_at <= @date_to';
                    $params['date_to'] = $dateTo;
                }
                if ($channel !== '' && strtolower($channel) !== 'all') {
                    $clauses[] = 'channel = @channel';
                    $params['channel'] = $channel;
                }
                if ($status !== '' && strtolower($status) !== 'all') {
                    $clauses[] = 'status = @status';
                    $params['status'] = $status;
                }
                $sql = 'SELECT * FROM dbo.notification_logs';
                if ($clauses) {
                    $sql .= ' WHERE ' . implode(' AND ', $clauses);
                }
                $sql .= ' ORDER BY created_at DESC';
                $rows = sqlserver_query($sql, $params);
                wf_json(200, true, 'Notification logs loaded', ['rows' => $rows]);
            }
        }
        wf_json(400, false, 'Unsupported action');
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') wf_json(405, false, 'Method not allowed');
    $body = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($body)) throw new Exception('Invalid JSON payload');
    $action = strtolower(trim((string)($body['action'] ?? '')));

    if ($action === 'create_handler') {
        $payloadRaw = is_array($body['payload'] ?? null) ? $body['payload'] : [];
        $name = trim((string)($payloadRaw['name'] ?? ''));
        $email = strtolower(trim((string)($payloadRaw['email'] ?? '')));
        if ($name === '' || $email === '') throw new Exception('Handler name and email are required');

        if (sqlserver_is_configured()) {
            $existing = sqlserver_scalar(
                'SELECT TOP 1 id FROM dbo.handlers WHERE LOWER(email) = LOWER(@email)',
                ['email' => $email]
            );
            if ($existing) {
                throw new Exception('Er bestaat al een gebruiker met dit e-mailadres.');
            }

            $roles = wf_clean_role_codes($payloadRaw['roles'] ?? []);
            $permissions = is_array($payloadRaw['permissions'] ?? null) ? $payloadRaw['permissions'] : [];
            sqlserver_execute(
                "INSERT INTO dbo.handlers (name, email, phone, active, roles, permissions, created_at, updated_at)
                 VALUES (@name, @email, NULLIF(@phone, N''), @active, @roles, @permissions, SYSUTCDATETIME(), SYSUTCDATETIME())",
                [
                    'name' => $name,
                    'email' => $email,
                    'phone' => trim((string)($payloadRaw['phone'] ?? '')),
                    'active' => array_key_exists('active', $payloadRaw) ? (bool)$payloadRaw['active'] : true,
                    'roles' => wf_json_encode_value($roles, '["HANDLER"]'),
                    'permissions' => wf_json_encode_value($permissions, '{}'),
                ]
            );
            $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.handlers WHERE LOWER(email) = LOWER(@email)', ['email' => $email]);
            $row = $rows[0] ?? null;
            if (!$row) throw new Exception('Failed to create handler');
            wf_sql_sync_handler_roles((string)$row['id'], $roles);
            $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.handlers WHERE id = @id', ['id' => $row['id']]);
            wf_json(200, true, 'Handler created', ['row' => wf_sql_normalize_handler_row($rows[0] ?? $row)]);
        }
    }

    if ($action === 'update_handler') {
        $id = trim((string)($body['id'] ?? ''));
        $patchRaw = is_array($body['patch'] ?? null) ? $body['patch'] : [];
        if (!wf_uuid($id) || !$patchRaw) throw new Exception('Invalid handler update payload');

        if (sqlserver_is_configured()) {
            if (array_key_exists('email', $patchRaw)) {
                $email = strtolower(trim((string)$patchRaw['email']));
                if ($email !== '') {
                    $existing = sqlserver_scalar(
                        'SELECT TOP 1 id FROM dbo.handlers WHERE LOWER(email) = LOWER(@email) AND id <> @id',
                        ['email' => $email, 'id' => $id]
                    );
                    if ($existing) {
                        throw new Exception('Er bestaat al een gebruiker met dit e-mailadres.');
                    }
                }
            }

            $params = ['id' => $id];
            $sets = ['updated_at = SYSUTCDATETIME()'];
            if (array_key_exists('name', $patchRaw)) {
                $params['name'] = trim((string)$patchRaw['name']);
                $sets[] = 'name = @name';
            }
            if (array_key_exists('email', $patchRaw)) {
                $params['email'] = strtolower(trim((string)$patchRaw['email']));
                $sets[] = "email = NULLIF(@email, N'')";
            }
            if (array_key_exists('phone', $patchRaw)) {
                $params['phone'] = trim((string)$patchRaw['phone']);
                $sets[] = "phone = NULLIF(@phone, N'')";
            }
            if (array_key_exists('active', $patchRaw)) {
                $params['active'] = (bool)$patchRaw['active'];
                $sets[] = 'active = @active';
            }
            if (array_key_exists('permissions', $patchRaw)) {
                $params['permissions'] = wf_json_encode_value(
                    is_array($patchRaw['permissions']) ? $patchRaw['permissions'] : [],
                    '{}'
                );
                $sets[] = 'permissions = @permissions';
            }
            if (array_key_exists('roles', $patchRaw)) {
                $roleCodes = wf_clean_role_codes($patchRaw['roles']);
                $params['roles'] = wf_json_encode_value($roleCodes, '["HANDLER"]');
                $sets[] = 'roles = @roles';
            }

            sqlserver_execute('UPDATE dbo.handlers SET ' . implode(', ', $sets) . ' WHERE id = @id', $params);

            if (array_key_exists('roles', $patchRaw)) {
                wf_sql_sync_handler_roles($id, $roleCodes);
            }

            $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.handlers WHERE id = @id', ['id' => $id]);
            $row = $rows[0] ?? null;
            if (!$row) throw new Exception('Handler not found');
            wf_json(200, true, 'Handler updated', ['row' => wf_sql_normalize_handler_row($row)]);
        }
    }

    if ($action === 'delete_handler') {
        $id = trim((string)($body['id'] ?? ''));
        if (!wf_uuid($id)) throw new Exception('id must be UUID');
        $hard = !empty($body['hard']);

        if (sqlserver_is_configured()) {
            if ($hard) {
                sqlserver_execute('DELETE FROM dbo.handlers WHERE id = @id', ['id' => $id]);
                wf_json(200, true, 'Handler deleted', ['deleted' => true, 'mode' => 'hard']);
            }

            sqlserver_execute(
                'UPDATE dbo.handlers SET active = @active, updated_at = SYSUTCDATETIME() WHERE id = @id',
                ['id' => $id, 'active' => false]
            );
            $rows = sqlserver_query('SELECT TOP 1 id, active FROM dbo.handlers WHERE id = @id', ['id' => $id]);
            wf_json(200, true, 'Handler deactivated', ['row' => $rows[0] ?? null, 'mode' => 'soft']);
        }
    }

    if ($action === 'set_handler_roles') {
        $handlerId = trim((string)($body['handler_id'] ?? ''));
        $roleIds = wf_clean_id_array($body['role_ids'] ?? []);
        if (!wf_uuid($handlerId)) throw new Exception('handler_id must be UUID');

        if (sqlserver_is_configured()) {
            $roleCodes = [];
            if ($roleIds) {
                $params = [];
                $placeholders = [];
                foreach ($roleIds as $index => $roleId) {
                    $key = 'id_' . $index;
                    $params[$key] = $roleId;
                    $placeholders[] = '@' . $key;
                }
                $roleRows = sqlserver_query(
                    'SELECT code FROM dbo.roles WHERE id IN (' . implode(', ', $placeholders) . ')',
                    $params
                );
                $roleCodes = array_values(array_filter(array_map(static fn($row) => strtoupper(trim((string)($row['code'] ?? ''))), $roleRows)));
            }
            wf_sql_sync_handler_roles($handlerId, $roleCodes);
            sqlserver_execute(
                'UPDATE dbo.handlers SET roles = @roles, updated_at = SYSUTCDATETIME() WHERE id = @id',
                ['id' => $handlerId, 'roles' => wf_json_encode_value($roleCodes, '["HANDLER"]')]
            );
            wf_json(200, true, 'Handler roles updated', ['handler_id' => $handlerId, 'role_ids' => $roleIds]);
        }
    }

    if ($action === 'create_workflow') {
        $p = (array)($body['payload'] ?? []);
        $name = trim((string)($p['name'] ?? ''));
        $code = trim((string)($p['code'] ?? ''));
        if ($name === '' || $code === '' || preg_match('/^[a-z0-9_]+$/', $code) !== 1) throw new Exception('Invalid workflow name/code');
        $payload = [
            'name' => $name,
            'code' => $code,
            'description' => $p['description'] ?? null,
            'created_by' => $p['created_by'] ?? ($p['createdBy'] ?? null),
            'updated_by' => $p['updated_by'] ?? ($p['updatedBy'] ?? null),
            'file_path' => $p['file_path'] ?? ($p['filePath'] ?? null),
            'content' => $p['content'] ?? null,
            'icon_name' => $p['icon_name'] ?? ($p['iconName'] ?? null),
            'color_scheme' => $p['color_scheme'] ?? ($p['colorScheme'] ?? null),
            'display_order' => (int)($p['display_order'] ?? ($p['displayOrder'] ?? 0)),
            'active' => array_key_exists('active', $p) ? (bool)$p['active'] : true,
        ];
        if (sqlserver_is_configured()) {
            $id = wf_uuid4();
            sqlserver_execute(
                'INSERT INTO dbo.workflows (
                    id, code, name, description, created_by, updated_by, file_path, content, icon_name, color_scheme,
                    active, display_order, created_at, updated_at
                )
                VALUES (
                    @id, @code, @name, @description, @created_by, @updated_by, @file_path, @content, @icon_name, @color_scheme,
                    @active, @display_order, SYSUTCDATETIME(), SYSUTCDATETIME()
                )',
                [
                    'id' => $id,
                    'code' => $payload['code'],
                    'name' => $payload['name'],
                    'description' => $payload['description'],
                    'created_by' => $payload['created_by'],
                    'updated_by' => $payload['updated_by'],
                    'file_path' => $payload['file_path'],
                    'content' => $payload['content'],
                    'icon_name' => $payload['icon_name'],
                    'color_scheme' => $payload['color_scheme'],
                    'active' => $payload['active'],
                    'display_order' => $payload['display_order'],
                ]
            );
            $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.workflows WHERE id = @id', ['id' => $id]);
            wf_json(200, true, 'Workflow created', ['row' => $rows[0] ?? null]);
        }
        [$codeHttp, $decoded, $raw] = wf_req('POST', $baseUrl . '/rest/v1/workflows', $serviceKey, $payload, true);
        wf_json(200, true, 'Workflow created', ['row' => wf_row(wf_or_fail('Create workflow', $codeHttp, $decoded, $raw))]);
    }

    if ($action === 'update_workflow') {
        $id = trim((string)($body['id'] ?? ''));
        $patch = (array)($body['patch'] ?? []);
        if (!wf_uuid($id) || !$patch) throw new Exception('Invalid workflow update payload');
        if (sqlserver_is_configured()) {
            $allowed = [
                'name',
                'code',
                'description',
                'created_by',
                'updated_by',
                'file_path',
                'content',
                'icon_name',
                'color_scheme',
                'display_order',
                'active',
                'statutory_deadline_days',
            ];
            $sets = [];
            $params = ['id' => $id];
            foreach ($allowed as $field) {
                if (!array_key_exists($field, $patch)) {
                    continue;
                }
                $sets[] = $field . ' = @' . $field;
                $params[$field] = $patch[$field];
            }
            if (!$sets) {
                throw new Exception('No valid workflow fields to update');
            }
            $sets[] = 'updated_at = SYSUTCDATETIME()';
            sqlserver_execute(
                'UPDATE dbo.workflows SET ' . implode(', ', $sets) . ' WHERE id = @id',
                $params
            );
            $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.workflows WHERE id = @id', ['id' => $id]);
            wf_json(200, true, 'Workflow updated', ['row' => $rows[0] ?? null]);
        }
        [$codeHttp, $decoded, $raw] = wf_req('PATCH', $baseUrl . '/rest/v1/workflows?id=eq.' . rawurlencode($id), $serviceKey, $patch, true);
        wf_json(200, true, 'Workflow updated', ['row' => wf_row(wf_or_fail('Update workflow', $codeHttp, $decoded, $raw))]);
    }

    if ($action === 'toggle_workflow_status') {
        $id = trim((string)($body['id'] ?? ''));
        if (!wf_uuid($id)) throw new Exception('id must be UUID');
        if (sqlserver_is_configured()) {
            sqlserver_execute(
                'UPDATE dbo.workflows SET active = @active, updated_at = SYSUTCDATETIME() WHERE id = @id',
                ['id' => $id, 'active' => !empty($body['active'])]
            );
            $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.workflows WHERE id = @id', ['id' => $id]);
            wf_json(200, true, 'Workflow toggled', ['row' => $rows[0] ?? null]);
        }
        [$codeHttp, $decoded, $raw] = wf_req('PATCH', $baseUrl . '/rest/v1/workflows?id=eq.' . rawurlencode($id), $serviceKey, ['active' => !empty($body['active'])], true);
        wf_json(200, true, 'Workflow toggled', ['row' => wf_row(wf_or_fail('Toggle workflow', $codeHttp, $decoded, $raw))]);
    }

    if ($action === 'duplicate_workflow') {
        $id = trim((string)($body['id'] ?? ''));
        if (!wf_uuid($id)) throw new Exception('id must be UUID');
        if (sqlserver_is_configured()) {
            $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.workflows WHERE id = @id', ['id' => $id]);
            $original = $rows[0] ?? null;
            if (!$original) throw new Exception('Workflow not found');

            $newId = wf_uuid4();
            $newCode = ((string)($original['code'] ?? 'workflow')) . '_copy_' . time();
            sqlserver_execute(
                'INSERT INTO dbo.workflows (
                    id, code, name, description, created_by, updated_by, file_path, content, icon_name, color_scheme,
                    active, display_order, statutory_deadline_days, created_at, updated_at
                )
                VALUES (
                    @id, @code, @name, @description, @created_by, @updated_by, @file_path, @content, @icon_name, @color_scheme,
                    @active, @display_order, @statutory_deadline_days, SYSUTCDATETIME(), SYSUTCDATETIME()
                )',
                [
                    'id' => $newId,
                    'code' => $newCode,
                    'name' => ((string)($original['name'] ?? 'Workflow')) . ' (kopie)',
                    'description' => $original['description'] ?? null,
                    'created_by' => $original['created_by'] ?? null,
                    'updated_by' => $original['updated_by'] ?? null,
                    'file_path' => $original['file_path'] ?? null,
                    'content' => $original['content'] ?? null,
                    'icon_name' => $original['icon_name'] ?? null,
                    'color_scheme' => $original['color_scheme'] ?? null,
                    'active' => false,
                    'display_order' => (int)($original['display_order'] ?? 0) + 1,
                    'statutory_deadline_days' => $original['statutory_deadline_days'] ?? null,
                ]
            );

            $statusRows = sqlserver_query(
                'SELECT * FROM dbo.workflow_statuses WHERE workflow_id = @workflow_id ORDER BY sort_order ASC',
                ['workflow_id' => $id]
            );
            foreach ($statusRows as $statusRow) {
                sqlserver_execute(
                    'INSERT INTO dbo.workflow_statuses (
                        id, workflow_id, code, label, description, color, sort_order, is_terminal, is_first_response,
                        next_codes, expected_duration_days, contact_person_name, contact_person_email, contact_person_phone,
                        contact_notes, created_at, updated_at
                    )
                    VALUES (
                        @id, @workflow_id, @code, @label, @description, @color, @sort_order, @is_terminal, @is_first_response,
                        @next_codes, @expected_duration_days, @contact_person_name, @contact_person_email, @contact_person_phone,
                        @contact_notes, SYSUTCDATETIME(), SYSUTCDATETIME()
                    )',
                    [
                        'id' => wf_uuid4(),
                        'workflow_id' => $newId,
                        'code' => $statusRow['code'] ?? null,
                        'label' => $statusRow['label'] ?? null,
                        'description' => $statusRow['description'] ?? null,
                        'color' => $statusRow['color'] ?? null,
                        'sort_order' => $statusRow['sort_order'] ?? 0,
                        'is_terminal' => $statusRow['is_terminal'] ?? false,
                        'is_first_response' => $statusRow['is_first_response'] ?? false,
                        'next_codes' => $statusRow['next_codes'] ?? null,
                        'expected_duration_days' => $statusRow['expected_duration_days'] ?? null,
                        'contact_person_name' => $statusRow['contact_person_name'] ?? null,
                        'contact_person_email' => $statusRow['contact_person_email'] ?? null,
                        'contact_person_phone' => $statusRow['contact_person_phone'] ?? null,
                        'contact_notes' => $statusRow['contact_notes'] ?? null,
                    ]
                );
            }

            $newRows = sqlserver_query('SELECT TOP 1 * FROM dbo.workflows WHERE id = @id', ['id' => $newId]);
            wf_json(200, true, 'Workflow duplicated', ['row' => $newRows[0] ?? null]);
        }
        [$oCode, $oDecoded, $oRaw] = wf_req('GET', $baseUrl . '/rest/v1/workflows?select=*&id=eq.' . rawurlencode($id) . '&limit=1', $serviceKey);
        $original = wf_row(wf_or_fail('Load original workflow', $oCode, $oDecoded, $oRaw));
        if (!$original) throw new Exception('Workflow not found');
        $newPayload = [
            'name' => ((string)($original['name'] ?? 'Workflow')) . ' (kopie)',
            'code' => ((string)($original['code'] ?? 'workflow')) . '_copy_' . time(),
            'description' => $original['description'] ?? null,
            'icon_name' => $original['icon_name'] ?? null,
            'color_scheme' => $original['color_scheme'] ?? null,
            'display_order' => (int)($original['display_order'] ?? 0) + 1,
            'active' => false,
        ];
        [$nCode, $nDecoded, $nRaw] = wf_req('POST', $baseUrl . '/rest/v1/workflows', $serviceKey, $newPayload, true);
        $newWf = wf_row(wf_or_fail('Create duplicate workflow', $nCode, $nDecoded, $nRaw));
        wf_json(200, true, 'Workflow duplicated', ['row' => $newWf]);
    }

    if ($action === 'delete_workflow_force') {
        $id = trim((string)($body['id'] ?? ''));
        if (!wf_uuid($id)) throw new Exception('id must be UUID');
        if (sqlserver_is_configured()) {
            $rows = sqlserver_query('SELECT TOP 1 id, code FROM dbo.workflows WHERE id = @id', ['id' => $id]);
            $wf = $rows[0] ?? null;
            if (!$wf) throw new Exception('Workflow not found');

            $candidates = array_values(array_filter([(string)($wf['code'] ?? ''), $id], static fn($x) => $x !== ''));
            foreach ($candidates as $candidate) {
                sqlserver_execute(
                    'UPDATE dbo.tickets SET workflow_type = NULL, updated_at = SYSUTCDATETIME() WHERE workflow_type = @workflow_type',
                    ['workflow_type' => $candidate]
                );
            }
            sqlserver_execute('DELETE FROM dbo.handler_workflows WHERE workflow_id = @workflow_id', ['workflow_id' => $id]);
            sqlserver_execute('DELETE FROM dbo.workflow_statuses WHERE workflow_id = @workflow_id', ['workflow_id' => $id]);
            sqlserver_execute('DELETE FROM dbo.workflows WHERE id = @id', ['id' => $id]);
            wf_json(200, true, 'Workflow deleted', ['deleted' => true]);
        }
        [$wCode, $wDecoded, $wRaw] = wf_req('GET', $baseUrl . '/rest/v1/workflows?select=id,code&id=eq.' . rawurlencode($id) . '&limit=1', $serviceKey);
        $wf = wf_row(wf_or_fail('Load workflow', $wCode, $wDecoded, $wRaw));
        if (!$wf) throw new Exception('Workflow not found');
        wf_or_fail('Delete handler_workflows', ...wf_req('DELETE', $baseUrl . '/rest/v1/handler_workflows?workflow_id=eq.' . rawurlencode($id), $serviceKey));
        wf_or_fail('Delete workflow_statuses', ...wf_req('DELETE', $baseUrl . '/rest/v1/workflow_statuses?workflow_id=eq.' . rawurlencode($id), $serviceKey));
        $candidates = array_values(array_filter([(string)($wf['code'] ?? ''), $id], static fn($x) => $x !== ''));
        if ($candidates) {
            $inValues = '(' . implode(',', array_map(static fn($x) => '"' . str_replace('"', '\\"', $x) . '"', $candidates)) . ')';
            wf_or_fail('Clear ticket workflow_type', ...wf_req('PATCH', $baseUrl . '/rest/v1/tickets?workflow_type=in.' . rawurlencode($inValues), $serviceKey, ['workflow_type' => null]));
        }
        wf_or_fail('Delete workflow', ...wf_req('DELETE', $baseUrl . '/rest/v1/workflows?id=eq.' . rawurlencode($id), $serviceKey));
        wf_json(200, true, 'Workflow deleted', ['deleted' => true]);
    }

    if ($action === 'add_routing_rule') {
        $workflowId = trim((string)($body['workflow_id'] ?? ''));
        $handlerId = trim((string)($body['handler_id'] ?? ''));
        if (!wf_uuid($workflowId) || !wf_uuid($handlerId)) throw new Exception('workflow_id and handler_id must be UUID');
        $workflowExists = sqlserver_scalar('SELECT TOP 1 id FROM dbo.workflows WHERE id = @id', ['id' => $workflowId]);
        if (!$workflowExists) throw new Exception('workflow_id not found');
        $handlerExists = sqlserver_scalar('SELECT TOP 1 id FROM dbo.handlers WHERE id = @id', ['id' => $handlerId]);
        if (!$handlerExists) throw new Exception('handler_id not found');

        $existingRows = sqlserver_query(
            'SELECT TOP 1
                hw.id,
                hw.handler_id,
                hw.workflow_id,
                h.id AS handler_ref_id,
                h.name AS handler_name,
                h.email AS handler_email,
                h.roles AS handler_roles,
                h.active AS handler_active
             FROM dbo.handler_workflows hw
             LEFT JOIN dbo.handlers h ON h.id = hw.handler_id
             WHERE hw.workflow_id = @workflow_id AND hw.handler_id = @handler_id',
            ['workflow_id' => $workflowId, 'handler_id' => $handlerId]
        );
        if ($existingRows) {
            $existing = $existingRows[0];
            $handler = null;
            if (!empty($existing['handler_ref_id'])) {
                $handler = wf_sql_normalize_handler_row([
                    'id' => $existing['handler_ref_id'],
                    'name' => $existing['handler_name'] ?? null,
                    'email' => $existing['handler_email'] ?? null,
                    'roles' => $existing['handler_roles'] ?? [],
                    'active' => $existing['handler_active'] ?? false,
                ]);
            }
            wf_json(200, true, 'Routing rule already existed', ['row' => [
                'id' => $existing['id'] ?? null,
                'handler_id' => $existing['handler_id'] ?? null,
                'workflow_id' => $existing['workflow_id'] ?? null,
                'handlers' => $handler,
            ]]);
        }

        $ruleId = wf_uuid4();
        sqlserver_execute(
            'INSERT INTO dbo.handler_workflows (id, workflow_id, handler_id, created_at)
             VALUES (@id, @workflow_id, @handler_id, SYSUTCDATETIME())',
            ['id' => $ruleId, 'workflow_id' => $workflowId, 'handler_id' => $handlerId]
        );
        $rows = sqlserver_query(
            'SELECT TOP 1
                hw.id,
                hw.handler_id,
                hw.workflow_id,
                h.id AS handler_ref_id,
                h.name AS handler_name,
                h.email AS handler_email,
                h.roles AS handler_roles,
                h.active AS handler_active
             FROM dbo.handler_workflows hw
             LEFT JOIN dbo.handlers h ON h.id = hw.handler_id
             WHERE hw.id = @id',
            ['id' => $ruleId]
        );
        $row = $rows[0] ?? null;
        $handler = null;
        if (is_array($row) && !empty($row['handler_ref_id'])) {
            $handler = wf_sql_normalize_handler_row([
                'id' => $row['handler_ref_id'],
                'name' => $row['handler_name'] ?? null,
                'email' => $row['handler_email'] ?? null,
                'roles' => $row['handler_roles'] ?? [],
                'active' => $row['handler_active'] ?? false,
            ]);
        }
        wf_json(200, true, 'Routing rule added', ['row' => [
            'id' => $row['id'] ?? $ruleId,
            'handler_id' => $row['handler_id'] ?? $handlerId,
            'workflow_id' => $row['workflow_id'] ?? $workflowId,
            'handlers' => $handler,
        ]]);
    }

    if ($action === 'remove_routing_rule') {
        $ruleId = trim((string)($body['rule_id'] ?? ''));
        if (!wf_uuid($ruleId)) throw new Exception('rule_id must be UUID');
        sqlserver_execute('DELETE FROM dbo.handler_workflows WHERE id = @id', ['id' => $ruleId]);
        wf_json(200, true, 'Routing rule removed', ['deleted' => true]);
    }

    if ($action === 'set_handler_workflows') {
        $handlerId = trim((string)($body['handler_id'] ?? ''));
        if (!wf_uuid($handlerId)) throw new Exception('handler_id must be UUID');
        $handlerExists = sqlserver_scalar('SELECT TOP 1 id FROM dbo.handlers WHERE id = @id', ['id' => $handlerId]);
        if (!$handlerExists) throw new Exception('handler_id not found');

        $nextIds = wf_clean_uuid_array($body['workflow_ids'] ?? []);
        if ($nextIds) {
            $params = [];
            $placeholders = [];
            foreach ($nextIds as $index => $nextId) {
                $key = 'workflow_' . $index;
                $params[$key] = $nextId;
                $placeholders[] = '@' . $key;
            }
            $validRows = sqlserver_query(
                'SELECT id FROM dbo.workflows WHERE id IN (' . implode(', ', $placeholders) . ')',
                $params
            );
            $validIds = array_values(array_filter(array_map(static fn($r) => trim((string)($r['id'] ?? '')), $validRows), static fn($x) => wf_uuid($x)));
            sort($validIds);
            $expected = $nextIds;
            sort($expected);
            if ($validIds !== $expected) throw new Exception('One or more workflow_ids are invalid');
        }

        $currentRows = sqlserver_query(
            'SELECT id, workflow_id FROM dbo.handler_workflows WHERE handler_id = @handler_id',
            ['handler_id' => $handlerId]
        );

        $currentByWorkflow = [];
        foreach ($currentRows as $r) {
            $wid = trim((string)($r['workflow_id'] ?? ''));
            $rid = trim((string)($r['id'] ?? ''));
            if (!wf_uuid($wid) || !wf_uuid($rid)) continue;
            $currentByWorkflow[$wid] = $rid;
        }

        $toDeleteIds = [];
        foreach ($currentByWorkflow as $wid => $rid) {
            if (!in_array($wid, $nextIds, true)) $toDeleteIds[] = $rid;
        }
        $toInsert = [];
        foreach ($nextIds as $wid) {
            if (!isset($currentByWorkflow[$wid])) $toInsert[] = ['handler_id' => $handlerId, 'workflow_id' => $wid];
        }

        if ($toDeleteIds) {
            $params = [];
            $placeholders = [];
            foreach ($toDeleteIds as $index => $deleteId) {
                $key = 'delete_' . $index;
                $params[$key] = $deleteId;
                $placeholders[] = '@' . $key;
            }
            sqlserver_execute(
                'DELETE FROM dbo.handler_workflows WHERE id IN (' . implode(', ', $placeholders) . ')',
                $params
            );
        }
        if ($toInsert) {
            foreach ($toInsert as $item) {
                sqlserver_execute(
                    'INSERT INTO dbo.handler_workflows (id, handler_id, workflow_id, created_at)
                     VALUES (@id, @handler_id, @workflow_id, SYSUTCDATETIME())',
                    ['id' => wf_uuid4(), 'handler_id' => $item['handler_id'], 'workflow_id' => $item['workflow_id']]
                );
            }
        }

        wf_json(200, true, 'Handler workflows updated', [
            'handler_id' => $handlerId,
            'workflow_ids' => $nextIds,
            'deleted' => count($toDeleteIds),
            'inserted' => count($toInsert),
        ]);
    }

    if ($action === 'clear_handler_workflows') {
        $handlerId = trim((string)($body['handler_id'] ?? ''));
        if (!wf_uuid($handlerId)) throw new Exception('handler_id must be UUID');
        sqlserver_execute('DELETE FROM dbo.handler_workflows WHERE handler_id = @handler_id', ['handler_id' => $handlerId]);
        wf_json(200, true, 'Handler workflows cleared', ['handler_id' => $handlerId, 'deleted' => true]);
    }

    if ($action === 'location_create') {
        $payloadRaw = is_array($body['payload'] ?? null) ? $body['payload'] : [];
        $countryCode = strtoupper(trim((string)($payloadRaw['country_code'] ?? ($payloadRaw['countryCode'] ?? ''))));
        $countryName = trim((string)($payloadRaw['country_name'] ?? ($payloadRaw['countryName'] ?? '')));
        if ($countryCode === '' || preg_match('/^[A-Z]{2}$/', $countryCode) !== 1) {
            throw new Exception('Country code must be exactly 2 letters');
        }
        if ($countryName === '') throw new Exception('Country name is required');

        if (sqlserver_is_configured()) {
            $existing = sqlserver_scalar(
                'SELECT TOP 1 id FROM dbo.locations WHERE country_code = @country_code',
                ['country_code' => $countryCode]
            );
            if ($existing) {
                throw new Exception('A location with this country code already exists');
            }

            $createdByRaw = trim((string)($payloadRaw['created_by'] ?? ($payloadRaw['createdBy'] ?? '')));
            if ($createdByRaw !== '' && !wf_uuid($createdByRaw)) {
                throw new Exception('created_by must be UUID');
            }

            $newId = wf_uuid4();
            sqlserver_execute(
                'INSERT INTO dbo.locations (
                    id, country_code, country_name, display_order, active, created_by, updated_at, created_at
                )
                VALUES (
                    @id, @country_code, @country_name, @display_order, @active, @created_by, SYSUTCDATETIME(), SYSUTCDATETIME()
                )',
                [
                    'id' => $newId,
                    'country_code' => $countryCode,
                    'country_name' => $countryName,
                    'display_order' => (int)($payloadRaw['display_order'] ?? ($payloadRaw['displayOrder'] ?? 0)),
                    'active' => array_key_exists('active', $payloadRaw) ? (bool)$payloadRaw['active'] : true,
                    'created_by' => $createdByRaw !== '' ? $createdByRaw : null,
                ]
            );
            $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.locations WHERE id = @id', ['id' => $newId]);
            wf_json(200, true, 'Location created', ['row' => $rows[0] ?? null]);
        }

        [$existsCode, $existsDecoded, $existsRaw] = wf_req(
            'GET',
            $baseUrl . '/rest/v1/locations?select=id&country_code=eq.' . rawurlencode($countryCode) . '&limit=1',
            $serviceKey
        );
        if (wf_row(wf_or_fail('Validate location country code uniqueness', $existsCode, $existsDecoded, $existsRaw))) {
            throw new Exception('A location with this country code already exists');
        }

        $createdByRaw = trim((string)($payloadRaw['created_by'] ?? ($payloadRaw['createdBy'] ?? '')));
        if ($createdByRaw !== '' && !wf_uuid($createdByRaw)) {
            throw new Exception('created_by must be UUID');
        }

        $payload = [
            'country_code' => $countryCode,
            'country_name' => $countryName,
            'display_order' => (int)($payloadRaw['display_order'] ?? ($payloadRaw['displayOrder'] ?? 0)),
            'active' => array_key_exists('active', $payloadRaw) ? (bool)$payloadRaw['active'] : true,
            'created_by' => $createdByRaw !== '' ? $createdByRaw : null,
        ];

        [$codeHttp, $decoded, $raw] = wf_req('POST', $baseUrl . '/rest/v1/locations', $serviceKey, $payload, true);
        wf_json(200, true, 'Location created', ['row' => wf_row(wf_or_fail('Create location', $codeHttp, $decoded, $raw))]);
    }

    if ($action === 'location_update') {
        $id = trim((string)($body['id'] ?? ''));
        $patchRaw = is_array($body['patch'] ?? null) ? $body['patch'] : [];
        if (!wf_uuid($id) || !$patchRaw) throw new Exception('Invalid location update payload');

        if (sqlserver_is_configured()) {
            $payload = [];
            if (array_key_exists('country_code', $patchRaw) || array_key_exists('countryCode', $patchRaw)) {
                $countryCode = strtoupper(trim((string)($patchRaw['country_code'] ?? ($patchRaw['countryCode'] ?? ''))));
                if ($countryCode === '' || preg_match('/^[A-Z]{2}$/', $countryCode) !== 1) {
                    throw new Exception('Country code must be exactly 2 letters');
                }
                $existing = sqlserver_scalar(
                    'SELECT TOP 1 id FROM dbo.locations WHERE country_code = @country_code AND id <> @id',
                    ['country_code' => $countryCode, 'id' => $id]
                );
                if ($existing) {
                    throw new Exception('A location with this country code already exists');
                }
                $payload['country_code'] = $countryCode;
            }
            if (array_key_exists('country_name', $patchRaw) || array_key_exists('countryName', $patchRaw)) {
                $countryName = trim((string)($patchRaw['country_name'] ?? ($patchRaw['countryName'] ?? '')));
                if ($countryName === '') throw new Exception('Country name is required');
                $payload['country_name'] = $countryName;
            }
            if (array_key_exists('display_order', $patchRaw) || array_key_exists('displayOrder', $patchRaw)) {
                $payload['display_order'] = (int)($patchRaw['display_order'] ?? ($patchRaw['displayOrder'] ?? 0));
            }
            if (array_key_exists('active', $patchRaw)) {
                $payload['active'] = (bool)$patchRaw['active'];
            }
            if (array_key_exists('updated_by', $patchRaw) || array_key_exists('updatedBy', $patchRaw)) {
                $updatedByRaw = trim((string)($patchRaw['updated_by'] ?? ($patchRaw['updatedBy'] ?? '')));
                if ($updatedByRaw !== '' && !wf_uuid($updatedByRaw)) {
                    throw new Exception('updated_by must be UUID');
                }
                $payload['updated_by'] = $updatedByRaw !== '' ? $updatedByRaw : null;
            }
            if (!$payload) throw new Exception('No valid fields to update');

            $sets = ['updated_at = SYSUTCDATETIME()'];
            $params = ['id' => $id];
            foreach ($payload as $field => $value) {
                $sets[] = $field . ' = @' . $field;
                $params[$field] = $value;
            }
            sqlserver_execute('UPDATE dbo.locations SET ' . implode(', ', $sets) . ' WHERE id = @id', $params);
            $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.locations WHERE id = @id', ['id' => $id]);
            $row = $rows[0] ?? null;
            if (!$row) throw new Exception('Location not found');
            wf_json(200, true, 'Location updated', ['row' => $row]);
        }

        $payload = [];
        if (array_key_exists('country_code', $patchRaw) || array_key_exists('countryCode', $patchRaw)) {
            $countryCode = strtoupper(trim((string)($patchRaw['country_code'] ?? ($patchRaw['countryCode'] ?? ''))));
            if ($countryCode === '' || preg_match('/^[A-Z]{2}$/', $countryCode) !== 1) {
                throw new Exception('Country code must be exactly 2 letters');
            }
            [$existsCode, $existsDecoded, $existsRaw] = wf_req(
                'GET',
                $baseUrl . '/rest/v1/locations?select=id&country_code=eq.' . rawurlencode($countryCode) . '&id=neq.' . rawurlencode($id) . '&limit=1',
                $serviceKey
            );
            if (wf_row(wf_or_fail('Validate location country code uniqueness', $existsCode, $existsDecoded, $existsRaw))) {
                throw new Exception('A location with this country code already exists');
            }
            $payload['country_code'] = $countryCode;
        }
        if (array_key_exists('country_name', $patchRaw) || array_key_exists('countryName', $patchRaw)) {
            $countryName = trim((string)($patchRaw['country_name'] ?? ($patchRaw['countryName'] ?? '')));
            if ($countryName === '') throw new Exception('Country name is required');
            $payload['country_name'] = $countryName;
        }
        if (array_key_exists('display_order', $patchRaw) || array_key_exists('displayOrder', $patchRaw)) {
            $payload['display_order'] = (int)($patchRaw['display_order'] ?? ($patchRaw['displayOrder'] ?? 0));
        }
        if (array_key_exists('active', $patchRaw)) {
            $payload['active'] = (bool)$patchRaw['active'];
        }
        if (array_key_exists('updated_by', $patchRaw) || array_key_exists('updatedBy', $patchRaw)) {
            $updatedByRaw = trim((string)($patchRaw['updated_by'] ?? ($patchRaw['updatedBy'] ?? '')));
            if ($updatedByRaw !== '' && !wf_uuid($updatedByRaw)) {
                throw new Exception('updated_by must be UUID');
            }
            $payload['updated_by'] = $updatedByRaw !== '' ? $updatedByRaw : null;
        }
        if (!$payload) throw new Exception('No valid fields to update');

        [$codeHttp, $decoded, $raw] = wf_req(
            'PATCH',
            $baseUrl . '/rest/v1/locations?id=eq.' . rawurlencode($id),
            $serviceKey,
            $payload,
            true
        );
        $row = wf_row(wf_or_fail('Update location', $codeHttp, $decoded, $raw));
        if (!$row) throw new Exception('Location not found');
        wf_json(200, true, 'Location updated', ['row' => $row]);
    }

    if ($action === 'location_delete') {
        $id = trim((string)($body['id'] ?? ''));
        if (!wf_uuid($id)) throw new Exception('id must be UUID');
        if (sqlserver_is_configured()) {
            sqlserver_execute('DELETE FROM dbo.locations WHERE id = @id', ['id' => $id]);
            wf_json(200, true, 'Location deleted', ['deleted' => true]);
        }
        wf_or_fail('Delete location', ...wf_req('DELETE', $baseUrl . '/rest/v1/locations?id=eq.' . rawurlencode($id), $serviceKey));
        wf_json(200, true, 'Location deleted', ['deleted' => true]);
    }

    if ($action === 'location_toggle_active') {
        $id = trim((string)($body['id'] ?? ''));
        if (!wf_uuid($id)) throw new Exception('id must be UUID');

        if (sqlserver_is_configured()) {
            $nextActive = null;
            if (array_key_exists('active', $body)) {
                $nextActive = (bool)$body['active'];
            } else {
                $rows = sqlserver_query('SELECT TOP 1 id, active FROM dbo.locations WHERE id = @id', ['id' => $id]);
                $current = $rows[0] ?? null;
                if (!$current) throw new Exception('Location not found');
                $nextActive = empty($current['active']);
            }
            sqlserver_execute(
                'UPDATE dbo.locations SET active = @active, updated_at = SYSUTCDATETIME() WHERE id = @id',
                ['id' => $id, 'active' => $nextActive]
            );
            $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.locations WHERE id = @id', ['id' => $id]);
            $row = $rows[0] ?? null;
            if (!$row) throw new Exception('Location not found');
            wf_json(200, true, 'Location status updated', ['row' => $row]);
        }

        $nextActive = null;
        if (array_key_exists('active', $body)) {
            $nextActive = (bool)$body['active'];
        } else {
            [$getCode, $getDecoded, $getRaw] = wf_req(
                'GET',
                $baseUrl . '/rest/v1/locations?select=id,active&id=eq.' . rawurlencode($id) . '&limit=1',
                $serviceKey
            );
            $current = wf_row(wf_or_fail('Load location for toggle', $getCode, $getDecoded, $getRaw));
            if (!$current) throw new Exception('Location not found');
            $nextActive = empty($current['active']);
        }

        [$codeHttp, $decoded, $raw] = wf_req(
            'PATCH',
            $baseUrl . '/rest/v1/locations?id=eq.' . rawurlencode($id),
            $serviceKey,
            ['active' => $nextActive],
            true
        );
        $row = wf_row(wf_or_fail('Toggle location active', $codeHttp, $decoded, $raw));
        if (!$row) throw new Exception('Location not found');
        wf_json(200, true, 'Location status updated', ['row' => $row]);
    }

    if ($action === 'locations_reorder') {
        $items = is_array($body['items'] ?? null) ? $body['items'] : [];
        $normalized = [];
        $seen = [];
        foreach ($items as $item) {
            $id = trim((string)($item['id'] ?? ''));
            if (!wf_uuid($id) || isset($seen[$id])) continue;
            $seen[$id] = true;
            $normalized[] = [
                'id' => $id,
                'display_order' => (int)($item['display_order'] ?? 0),
            ];
        }

        if (sqlserver_is_configured()) {
            foreach ($normalized as $item) {
                sqlserver_execute(
                    'UPDATE dbo.locations SET display_order = @display_order, updated_at = SYSUTCDATETIME() WHERE id = @id',
                    ['id' => $item['id'], 'display_order' => $item['display_order']]
                );
            }
            wf_json(200, true, 'Locations reordered', ['updated' => count($normalized)]);
        }

        foreach ($normalized as $item) {
            wf_or_fail(
                'Reorder location',
                ...wf_req(
                    'PATCH',
                    $baseUrl . '/rest/v1/locations?id=eq.' . rawurlencode($item['id']),
                    $serviceKey,
                    ['display_order' => $item['display_order']],
                    true
                )
            );
        }

        wf_json(200, true, 'Locations reordered', ['updated' => count($normalized)]);
    }

    if ($action === 'permission_create') {
        $payloadRaw = is_array($body['payload'] ?? null) ? $body['payload'] : [];
        $payload = [
            'code' => trim((string)($payloadRaw['code'] ?? '')),
            'name' => trim((string)($payloadRaw['name'] ?? '')),
            'description' => isset($payloadRaw['description']) ? (string)$payloadRaw['description'] : null,
            'category' => trim((string)($payloadRaw['category'] ?? 'general')),
            'is_system' => !empty($payloadRaw['is_system']),
        ];
        if ($payload['code'] === '' || $payload['name'] === '') {
            throw new Exception('Permission code and name are required');
        }
        $existing = sqlserver_scalar('SELECT TOP 1 id FROM dbo.permissions WHERE code = @code', ['code' => $payload['code']]);
        if ($existing) throw new Exception('Permission code already exists');
        $id = wf_uuid4();
        sqlserver_execute(
            'INSERT INTO dbo.permissions (id, code, name, description, category, is_system, created_at, updated_at)
             VALUES (@id, @code, @name, @description, @category, @is_system, SYSUTCDATETIME(), SYSUTCDATETIME())',
            [
                'id' => $id,
                'code' => $payload['code'],
                'name' => $payload['name'],
                'description' => $payload['description'],
                'category' => $payload['category'],
                'is_system' => $payload['is_system'],
            ]
        );
        $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.permissions WHERE id = @id', ['id' => $id]);
        wf_json(200, true, 'Permission created', ['row' => $rows[0] ?? null]);
    }

    if ($action === 'permission_update') {
        $id = trim((string)($body['id'] ?? ''));
        $patchRaw = is_array($body['patch'] ?? null) ? $body['patch'] : [];
        if (!wf_uuid($id) || !$patchRaw) throw new Exception('Invalid permission update payload');

        $allowed = ['code', 'name', 'description', 'category', 'is_system'];
        $payload = [];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $patchRaw)) $payload[$field] = $patchRaw[$field];
        }
        if (!$payload) throw new Exception('No valid fields to update');
        if (array_key_exists('code', $payload)) {
            $payload['code'] = trim((string)$payload['code']);
            if ($payload['code'] === '') throw new Exception('Permission code is required');
            $existing = sqlserver_scalar(
                'SELECT TOP 1 id FROM dbo.permissions WHERE code = @code AND id <> @id',
                ['code' => $payload['code'], 'id' => $id]
            );
            if ($existing) throw new Exception('Permission code already exists');
        }
        if (array_key_exists('name', $payload)) {
            $payload['name'] = trim((string)$payload['name']);
            if ($payload['name'] === '') throw new Exception('Permission name is required');
        }
        if (array_key_exists('category', $payload)) {
            $payload['category'] = trim((string)$payload['category']);
            if ($payload['category'] === '') $payload['category'] = 'general';
        }
        $params = ['id' => $id];
        $sets = ['updated_at = SYSUTCDATETIME()'];
        foreach ($payload as $field => $value) {
            $sets[] = $field . ' = @' . $field;
            $params[$field] = $value;
        }
        sqlserver_execute('UPDATE dbo.permissions SET ' . implode(', ', $sets) . ' WHERE id = @id', $params);
        $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.permissions WHERE id = @id', ['id' => $id]);
        $row = $rows[0] ?? null;
        if (!$row) throw new Exception('Permission not found');
        wf_json(200, true, 'Permission updated', ['row' => $row]);
    }

    if ($action === 'permission_delete') {
        $id = trim((string)($body['id'] ?? ''));
        if (!wf_uuid($id)) throw new Exception('id must be UUID');
        $rows = sqlserver_query('SELECT TOP 1 id, is_system FROM dbo.permissions WHERE id = @id', ['id' => $id]);
        $row = $rows[0] ?? null;
        if (!$row) throw new Exception('Permission not found');
        if (!empty($row['is_system'])) throw new Exception('System permissions cannot be deleted');
        sqlserver_execute('DELETE FROM dbo.permissions WHERE id = @id', ['id' => $id]);
        wf_json(200, true, 'Permission deleted', ['deleted' => true]);
    }

    if ($action === 'role_create') {
        $payloadRaw = is_array($body['payload'] ?? null) ? $body['payload'] : [];
        $payload = [
            'code' => trim((string)($payloadRaw['code'] ?? '')),
            'name' => trim((string)($payloadRaw['name'] ?? '')),
            'description' => isset($payloadRaw['description']) ? (string)$payloadRaw['description'] : null,
            'is_system' => !empty($payloadRaw['is_system']),
            'is_default' => !empty($payloadRaw['is_default']),
        ];
        if ($payload['code'] === '' || $payload['name'] === '') {
            throw new Exception('Role code and name are required');
        }
        $existing = sqlserver_scalar('SELECT TOP 1 id FROM dbo.roles WHERE code = @code', ['code' => $payload['code']]);
        if ($existing) throw new Exception('Role code already exists');
        $id = wf_uuid4();
        sqlserver_execute(
            'INSERT INTO dbo.roles (id, code, name, description, is_system, is_default, created_at, updated_at)
             VALUES (@id, @code, @name, @description, @is_system, @is_default, SYSUTCDATETIME(), SYSUTCDATETIME())',
            [
                'id' => $id,
                'code' => $payload['code'],
                'name' => $payload['name'],
                'description' => $payload['description'],
                'is_system' => $payload['is_system'],
                'is_default' => $payload['is_default'],
            ]
        );
        $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.roles WHERE id = @id', ['id' => $id]);
        wf_json(200, true, 'Role created', ['row' => $rows[0] ?? null]);
    }

    if ($action === 'role_update') {
        $id = trim((string)($body['id'] ?? ''));
        $patchRaw = is_array($body['patch'] ?? null) ? $body['patch'] : [];
        if (!wf_uuid($id) || !$patchRaw) throw new Exception('Invalid role update payload');

        $allowed = ['code', 'name', 'description', 'is_system', 'is_default'];
        $payload = [];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $patchRaw)) $payload[$field] = $patchRaw[$field];
        }
        if (!$payload) throw new Exception('No valid fields to update');
        if (array_key_exists('code', $payload)) {
            $payload['code'] = strtoupper(trim((string)$payload['code']));
            if ($payload['code'] === '') throw new Exception('Role code is required');
            $existing = sqlserver_scalar(
                'SELECT TOP 1 id FROM dbo.roles WHERE code = @code AND id <> @id',
                ['code' => $payload['code'], 'id' => $id]
            );
            if ($existing) throw new Exception('Role code already exists');
        }
        if (array_key_exists('name', $payload)) {
            $payload['name'] = trim((string)$payload['name']);
            if ($payload['name'] === '') throw new Exception('Role name is required');
        }
        $params = ['id' => $id];
        $sets = ['updated_at = SYSUTCDATETIME()'];
        foreach ($payload as $field => $value) {
            $sets[] = $field . ' = @' . $field;
            $params[$field] = $value;
        }
        sqlserver_execute('UPDATE dbo.roles SET ' . implode(', ', $sets) . ' WHERE id = @id', $params);
        $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.roles WHERE id = @id', ['id' => $id]);
        $row = $rows[0] ?? null;
        if (!$row) throw new Exception('Role not found');
        wf_json(200, true, 'Role updated', ['row' => $row]);
    }

    if ($action === 'role_delete') {
        $id = trim((string)($body['id'] ?? ''));
        if (!wf_uuid($id)) throw new Exception('id must be UUID');
        $rows = sqlserver_query('SELECT TOP 1 id, is_system FROM dbo.roles WHERE id = @id', ['id' => $id]);
        $row = $rows[0] ?? null;
        if (!$row) throw new Exception('Role not found');
        if (!empty($row['is_system'])) throw new Exception('System roles cannot be deleted');
        sqlserver_execute('DELETE FROM dbo.roles WHERE id = @id', ['id' => $id]);
        wf_json(200, true, 'Role deleted', ['deleted' => true]);
    }

    if ($action === 'role_set_permissions') {
        $roleId = trim((string)($body['role_id'] ?? ''));
        if (!wf_uuid($roleId)) throw new Exception('role_id must be UUID');
        $permissionIds = wf_clean_uuid_array($body['permission_ids'] ?? []);
        $roleExists = sqlserver_scalar('SELECT TOP 1 id FROM dbo.roles WHERE id = @id', ['id' => $roleId]);
        if (!$roleExists) throw new Exception('Role not found');
        if ($permissionIds) {
            $params = [];
            $placeholders = [];
            foreach ($permissionIds as $index => $permissionId) {
                $key = 'permission_' . $index;
                $params[$key] = $permissionId;
                $placeholders[] = '@' . $key;
            }
            $validRows = sqlserver_query(
                'SELECT id FROM dbo.permissions WHERE id IN (' . implode(', ', $placeholders) . ')',
                $params
            );
            $validIds = array_values(array_filter(array_map(static fn($row) => trim((string)($row['id'] ?? '')), $validRows), static fn($x) => wf_uuid($x)));
            sort($validIds);
            $expected = $permissionIds;
            sort($expected);
            if ($validIds !== $expected) throw new Exception('One or more permission_ids are invalid');
        }

        sqlserver_execute('DELETE FROM dbo.role_permissions WHERE role_id = @role_id', ['role_id' => $roleId]);
        foreach ($permissionIds as $permissionId) {
            sqlserver_execute(
                'INSERT INTO dbo.role_permissions (id, role_id, permission_id, created_at)
                 VALUES (@id, @role_id, @permission_id, SYSUTCDATETIME())',
                ['id' => wf_uuid4(), 'role_id' => $roleId, 'permission_id' => $permissionId]
            );
        }

        wf_json(200, true, 'Role permissions updated', [
            'role_id' => $roleId,
            'permission_ids' => $permissionIds,
        ]);
    }

    if ($action === 'create_status') {
        $workflowId = trim((string)($body['workflow_id'] ?? ''));
        $status = is_array($body['status'] ?? null) ? $body['status'] : [];
        if (!wf_uuid($workflowId)) throw new Exception('workflow_id must be UUID');

        $code = trim((string)($status['code'] ?? ''));
        $label = trim((string)($status['label'] ?? ''));
        if ($code === '' || $label === '' || preg_match('/^[a-z0-9_]+$/', $code) !== 1) throw new Exception('Invalid status row');

        $payload = [
            'id' => wf_uuid4(),
            'workflow_id' => $workflowId,
            'code' => $code,
            'label' => $label,
            'description' => $status['description'] ?? null,
            'color' => $status['color'] ?? null,
            'sort_order' => (int)($status['sort_order'] ?? 0),
            'is_terminal' => !empty($status['is_terminal']),
            'is_first_response' => !empty($status['is_first_response']),
            'next_codes' => array_values(array_filter(array_map(static fn($x) => trim((string)$x), is_array($status['next_codes'] ?? null) ? $status['next_codes'] : []), static fn($x) => $x !== '')),
            'expected_duration_days' => $status['expected_duration_days'] ?? null,
            'contact_person_name' => $status['contact_person_name'] ?? null,
            'contact_person_email' => $status['contact_person_email'] ?? null,
            'contact_person_phone' => $status['contact_person_phone'] ?? null,
            'contact_notes' => $status['contact_notes'] ?? null,
        ];

        $workflowExists = sqlserver_scalar('SELECT TOP 1 id FROM dbo.workflows WHERE id = @id', ['id' => $workflowId]);
        if (!$workflowExists) throw new Exception('Workflow not found');
        $existingCode = sqlserver_scalar(
            'SELECT TOP 1 id FROM dbo.workflow_statuses WHERE workflow_id = @workflow_id AND code = @code',
            ['workflow_id' => $workflowId, 'code' => $code]
        );
        if ($existingCode) throw new Exception('Status code already exists in workflow');
        foreach ($payload['next_codes'] as $nc) {
            $exists = sqlserver_scalar(
                'SELECT TOP 1 id FROM dbo.workflow_statuses WHERE workflow_id = @workflow_id AND code = @code',
                ['workflow_id' => $workflowId, 'code' => $nc]
            );
            if (!$exists) throw new Exception('Invalid next_codes: "' . $nc . '" does not exist in workflow');
        }

        sqlserver_execute(
            'INSERT INTO dbo.workflow_statuses (
                id, workflow_id, code, label, description, color, sort_order, is_terminal, is_first_response,
                next_codes, expected_duration_days, contact_person_name, contact_person_email, contact_person_phone,
                contact_notes, created_at, updated_at
            )
            VALUES (
                @id, @workflow_id, @code, @label, @description, @color, @sort_order, @is_terminal, @is_first_response,
                @next_codes, @expected_duration_days, @contact_person_name, @contact_person_email, @contact_person_phone,
                @contact_notes, SYSUTCDATETIME(), SYSUTCDATETIME()
            )',
            [
                'id' => $payload['id'],
                'workflow_id' => $payload['workflow_id'],
                'code' => $payload['code'],
                'label' => $payload['label'],
                'description' => $payload['description'],
                'color' => $payload['color'],
                'sort_order' => $payload['sort_order'],
                'is_terminal' => $payload['is_terminal'],
                'is_first_response' => $payload['is_first_response'],
                'next_codes' => wf_json_encode_value($payload['next_codes'], '[]'),
                'expected_duration_days' => $payload['expected_duration_days'],
                'contact_person_name' => $payload['contact_person_name'],
                'contact_person_email' => $payload['contact_person_email'],
                'contact_person_phone' => $payload['contact_person_phone'],
                'contact_notes' => $payload['contact_notes'],
            ]
        );
        $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.workflow_statuses WHERE id = @id', ['id' => $payload['id']]);
        $row = $rows[0] ?? null;
        wf_json(200, true, 'Status created', ['row' => $row ? wf_sql_normalize_status_row($row) : null]);
    }

    if ($action === 'update_status') {
        $statusId = trim((string)($body['status_id'] ?? ''));
        $patch = is_array($body['patch'] ?? null) ? $body['patch'] : [];
        if (!wf_uuid($statusId) || !$patch) throw new Exception('Invalid status update payload');

        $allowed = [
            'code', 'label', 'description', 'color', 'sort_order', 'is_terminal', 'is_first_response', 'next_codes',
            'expected_duration_days', 'contact_person_name', 'contact_person_email', 'contact_person_phone', 'contact_notes'
        ];
        $payload = [];
        foreach ($allowed as $k) {
            if (!array_key_exists($k, $patch)) continue;
            $payload[$k] = $patch[$k];
        }
        if (!$payload) throw new Exception('No valid fields to update');

        if (array_key_exists('code', $payload)) {
            $payload['code'] = trim((string)$payload['code']);
            if ($payload['code'] === '' || preg_match('/^[a-z0-9_]+$/', $payload['code']) !== 1) throw new Exception('Invalid status code');
        }
        if (array_key_exists('label', $payload)) {
            $payload['label'] = trim((string)$payload['label']);
            if ($payload['label'] === '') throw new Exception('Status label is required');
        }
        $statusRows = sqlserver_query('SELECT TOP 1 * FROM dbo.workflow_statuses WHERE id = @id', ['id' => $statusId]);
        $statusRow = $statusRows[0] ?? null;
        if (!$statusRow || !wf_uuid((string)($statusRow['workflow_id'] ?? ''))) throw new Exception('Status not found');
        $workflowId = (string)$statusRow['workflow_id'];
        if (array_key_exists('code', $payload)) {
            $existing = sqlserver_scalar(
                'SELECT TOP 1 id FROM dbo.workflow_statuses WHERE workflow_id = @workflow_id AND code = @code AND id <> @id',
                ['workflow_id' => $workflowId, 'code' => $payload['code'], 'id' => $statusId]
            );
            if ($existing) throw new Exception('Status code already exists in workflow');
        }
        if (array_key_exists('next_codes', $payload)) {
            $payload['next_codes'] = array_values(array_filter(array_map(static fn($x) => trim((string)$x), is_array($payload['next_codes']) ? $payload['next_codes'] : []), static fn($x) => $x !== ''));
            foreach ($payload['next_codes'] as $nc) {
                $exists = sqlserver_scalar(
                    'SELECT TOP 1 id FROM dbo.workflow_statuses WHERE workflow_id = @workflow_id AND code = @code',
                    ['workflow_id' => $workflowId, 'code' => $nc]
                );
                if (!$exists) throw new Exception('Invalid next_codes: "' . $nc . '" does not exist in workflow');
            }
        }

        $params = ['id' => $statusId];
        $sets = ['updated_at = SYSUTCDATETIME()'];
        foreach ($payload as $field => $value) {
            $sets[] = $field . ' = @' . $field;
            $params[$field] = $field === 'next_codes' ? wf_json_encode_value($value, '[]') : $value;
        }
        sqlserver_execute('UPDATE dbo.workflow_statuses SET ' . implode(', ', $sets) . ' WHERE id = @id', $params);
        $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.workflow_statuses WHERE id = @id', ['id' => $statusId]);
        $row = $rows[0] ?? null;
        wf_json(200, true, 'Status updated', ['row' => $row ? wf_sql_normalize_status_row($row) : null]);
    }

    if ($action === 'delete_status') {
        $statusId = trim((string)($body['status_id'] ?? ''));
        if (!wf_uuid($statusId)) throw new Exception('status_id must be UUID');
        $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.workflow_statuses WHERE id = @id', ['id' => $statusId]);
        $row = $rows[0] ?? null;
        if (!$row) throw new Exception('Status not found');
        sqlserver_execute('DELETE FROM dbo.workflow_statuses WHERE id = @id', ['id' => $statusId]);
        wf_json(200, true, 'Status deleted', ['row' => wf_sql_normalize_status_row($row), 'deleted' => true]);
    }

    if ($action === 'reorder_statuses') {
        $workflowId = trim((string)($body['workflow_id'] ?? ''));
        $items = is_array($body['items'] ?? null) ? $body['items'] : [];
        if (!wf_uuid($workflowId)) throw new Exception('workflow_id must be UUID');

        foreach ($items as $it) {
            $sid = trim((string)($it['id'] ?? ''));
            if (!wf_uuid($sid)) continue;
            $sortOrder = (int)($it['sort_order'] ?? 0);
            sqlserver_execute(
                'UPDATE dbo.workflow_statuses SET sort_order = @sort_order, updated_at = SYSUTCDATETIME() WHERE id = @id AND workflow_id = @workflow_id',
                ['sort_order' => $sortOrder, 'id' => $sid, 'workflow_id' => $workflowId]
            );
        }
        wf_json(200, true, 'Statuses reordered', wf_status_list($baseUrl, $serviceKey, $workflowId));
    }

    if ($action === 'save_statuses') {
        $workflowId = trim((string)($body['workflow_id'] ?? ''));
        if (!wf_uuid($workflowId)) throw new Exception('workflow_id must be UUID');
        $statuses = is_array($body['statuses'] ?? null) ? $body['statuses'] : [];
        $deleteIds = is_array($body['delete_ids'] ?? null) ? $body['delete_ids'] : [];
        if (count($statuses) === 0) {
            throw new Exception('A workflow must keep at least one status');
        }
        $codeSet = [];
        $rows = [];
        foreach ($statuses as $i => $s) {
            $code = trim((string)($s['code'] ?? ''));
            $label = trim((string)($s['label'] ?? ''));
            if ($code === '' || $label === '' || preg_match('/^[a-z0-9_]+$/', $code) !== 1) throw new Exception('Invalid status row');
            if (isset($codeSet[strtolower($code)])) throw new Exception('Duplicate status code: ' . $code);
            $codeSet[strtolower($code)] = true;
            $rows[] = [
                'id' => trim((string)($s['id'] ?? '')),
                'workflow_id' => $workflowId,
                'code' => $code,
                'label' => $label,
                'description' => $s['description'] ?? null,
                'color' => $s['color'] ?? null,
                'sort_order' => (int)($s['sort_order'] ?? $i),
                'is_terminal' => !empty($s['is_terminal']),
                'is_first_response' => !empty($s['is_first_response']),
                'next_codes' => array_values(array_filter(array_map(static fn($x) => trim((string)$x), is_array($s['next_codes'] ?? null) ? $s['next_codes'] : []), static fn($x) => $x !== '')),
                'expected_duration_days' => $s['expected_duration_days'] ?? null,
                'contact_person_name' => $s['contact_person_name'] ?? null,
                'contact_person_email' => $s['contact_person_email'] ?? null,
                'contact_person_phone' => $s['contact_person_phone'] ?? null,
                'contact_notes' => $s['contact_notes'] ?? null,
            ];
        }
        foreach ($rows as $r) foreach ($r['next_codes'] as $nc) if (!isset($codeSet[strtolower($nc)])) throw new Exception('Invalid next_codes: "' . $nc . '" does not exist in workflow');

        $upsert = [];
        foreach ($rows as $r) {
            $rid = $r['id'] !== '' ? $r['id'] : wf_uuid4();
            if (!wf_uuid($rid)) $rid = wf_uuid4();
            $upsert[] = [
                'id' => $rid,
                'workflow_id' => $workflowId,
                'code' => $r['code'],
                'label' => $r['label'],
                'description' => $r['description'],
                'color' => $r['color'],
                'sort_order' => $r['sort_order'],
                'is_terminal' => $r['is_terminal'],
                'is_first_response' => $r['is_first_response'],
                'next_codes' => array_values($r['next_codes']),
                'expected_duration_days' => $r['expected_duration_days'],
                'contact_person_name' => $r['contact_person_name'],
                'contact_person_email' => $r['contact_person_email'],
                'contact_person_phone' => $r['contact_person_phone'],
                'contact_notes' => $r['contact_notes'],
            ];
        }
        $workflowExists = sqlserver_scalar('SELECT TOP 1 id FROM dbo.workflows WHERE id = @id', ['id' => $workflowId]);
        if (!$workflowExists) throw new Exception('Workflow not found');

        $commands = [];
        $del = array_values(array_filter(array_map(static fn($x) => trim((string)$x), $deleteIds), static fn($x) => wf_uuid($x)));
        if ($del) {
            $params = ['workflow_id' => $workflowId];
            $placeholders = [];
            foreach ($del as $index => $deleteId) {
                $key = 'delete_' . $index;
                $params[$key] = $deleteId;
                $placeholders[] = '@' . $key;
            }
            $commands[] = sqlserver_command(
                'nonquery',
                'DELETE FROM dbo.workflow_statuses WHERE workflow_id = @workflow_id AND id IN (' . implode(', ', $placeholders) . ')',
                $params
            );
        }
        foreach ($upsert as $row) {
            $params = [
                'id' => $row['id'],
                'workflow_id' => $row['workflow_id'],
                'code' => $row['code'],
                'label' => $row['label'],
                'description' => $row['description'],
                'color' => $row['color'],
                'sort_order' => $row['sort_order'],
                'is_terminal' => $row['is_terminal'],
                'is_first_response' => $row['is_first_response'],
                'next_codes' => wf_json_encode_value($row['next_codes'], '[]'),
                'expected_duration_days' => $row['expected_duration_days'],
                'contact_person_name' => $row['contact_person_name'],
                'contact_person_email' => $row['contact_person_email'],
                'contact_person_phone' => $row['contact_person_phone'],
                'contact_notes' => $row['contact_notes'],
            ];
            $commands[] = sqlserver_command(
                'nonquery',
                'MERGE dbo.workflow_statuses AS target
                 USING (
                     SELECT
                         @id AS id,
                         @workflow_id AS workflow_id,
                         @code AS code,
                         @label AS label,
                         @description AS description,
                         @color AS color,
                         @sort_order AS sort_order,
                         @is_terminal AS is_terminal,
                         @is_first_response AS is_first_response,
                         @next_codes AS next_codes,
                         @expected_duration_days AS expected_duration_days,
                         @contact_person_name AS contact_person_name,
                         @contact_person_email AS contact_person_email,
                         @contact_person_phone AS contact_person_phone,
                         @contact_notes AS contact_notes
                 ) AS source
                 ON target.workflow_id = source.workflow_id
                    AND (target.id = source.id OR target.code = source.code)
                 WHEN MATCHED THEN
                     UPDATE SET
                         code = source.code,
                         label = source.label,
                         description = source.description,
                         color = source.color,
                         sort_order = source.sort_order,
                         is_terminal = source.is_terminal,
                         is_first_response = source.is_first_response,
                         next_codes = source.next_codes,
                         expected_duration_days = source.expected_duration_days,
                         contact_person_name = source.contact_person_name,
                         contact_person_email = source.contact_person_email,
                         contact_person_phone = source.contact_person_phone,
                         contact_notes = source.contact_notes,
                         updated_at = SYSUTCDATETIME()
                 WHEN NOT MATCHED THEN
                     INSERT (
                         id, workflow_id, code, label, description, color, sort_order, is_terminal, is_first_response,
                         next_codes, expected_duration_days, contact_person_name, contact_person_email, contact_person_phone,
                         contact_notes, created_at, updated_at
                     )
                     VALUES (
                         source.id, source.workflow_id, source.code, source.label, source.description, source.color,
                         source.sort_order, source.is_terminal, source.is_first_response, source.next_codes,
                         source.expected_duration_days, source.contact_person_name, source.contact_person_email,
                         source.contact_person_phone, source.contact_notes, SYSUTCDATETIME(), SYSUTCDATETIME()
                     );',
                $params
            );
        }
        $commands[] = sqlserver_command(
            'query',
            'SELECT * FROM dbo.workflow_statuses WHERE workflow_id = @workflow_id ORDER BY sort_order ASC, label ASC',
            ['workflow_id' => $workflowId]
        );

        $results = sqlserver_run_commands($commands, true);
        $finalRows = sqlserver_result_rows($results, count($commands) - 1);
        wf_json(200, true, 'Statuses saved', ['rows' => array_map('wf_sql_normalize_status_row', $finalRows)]);
    }

    wf_json(400, false, 'Unsupported action');
} catch (Throwable $e) {
    $errorId = api_log_exception('workflows.api', $e);
    $data = ['error_id' => $errorId];
    if (isset($_GET['debug']) && (string)$_GET['debug'] === '1') {
        $data['error'] = api_redact_sensitive($e->getMessage());
        $data['diagnostics'] = wf_debug_diagnostics();
    }
    wf_json(500, false, 'Internal server error', $data);
}
