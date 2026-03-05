<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_auth0.php';
require_once __DIR__ . '/_scopes.php';
require_once __DIR__ . '/_supabase.php';
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
    return rtrim(wf_env('VITE_SUPABASE_URL'), '/');
}

function wf_key(): string {
    return supabase_get_service_role_key();
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
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 25,
    ]);
    if ($payload !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_UNICODE));
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($resp === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new Exception('Supabase request failed: ' . $err);
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
    $priority = ['SUPER_ADMIN', 'ADMIN', 'HANDLER', 'USER'];
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

function wf_require_admin(string $baseUrl, string $serviceKey, array $requiredScopes = []): array {
    $token = auth0_get_bearer_token();
    if ($token === '') wf_json(401, false, 'Authorization token required');
    $auth0Domain = wf_env('VITE_AUTH0_DOMAIN');
    $auth0Audience = auth0_expected_api_audience();

    $claims = auth0_verify_access_token(
        $token,
        $auth0Domain,
        $auth0Audience,
        wf_env('VITE_AUTH0_CLIENT_ID')
    );
    $sub = trim((string)($claims['sub'] ?? ''));
    $email = trim((string)($claims['email'] ?? ''));

    $handler = null;
    if ($sub !== '') {
        [$c1, $d1, $r1] = wf_req('GET', $baseUrl . '/rest/v1/handlers?select=id,name,email,user_id,active,roles,permissions&user_id=eq.' . rawurlencode($sub) . '&limit=1', $serviceKey);
        $arr = wf_or_fail('Load handler by sub', $c1, $d1, $r1);
        $handler = wf_row($arr);
    }
    if (!$handler && $email !== '') {
        [$c2, $d2, $r2] = wf_req('GET', $baseUrl . '/rest/v1/handlers?select=id,name,email,user_id,active,roles,permissions&email=ilike.' . rawurlencode($email) . '&limit=1', $serviceKey);
        $arr = wf_or_fail('Load handler by email', $c2, $d2, $r2);
        $handler = wf_row($arr);
    }
    if (!$handler || empty($handler['active'])) wf_json(403, false, 'Handler account not active or not found');
    if (!wf_is_admin($handler)) wf_json(403, false, 'Admin permissions required');
    require_scopes($claims, $requiredScopes, static function (int $status, string $message): void {
        wf_json($status, false, $message);
    });
    return $handler;
}

function wf_status_list(string $baseUrl, string $serviceKey, string $workflowId): array {
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

try {
    load_env_file(__DIR__ . '/../../.env.local', true);
    load_env_file(__DIR__ . '/../../.env', false);

    $baseUrl = wf_url();
    $serviceKey = wf_key();
    $requiredScopes = $_SERVER['REQUEST_METHOD'] === 'GET' ? WORKFLOWS_SCOPES_READ : WORKFLOWS_SCOPES_WRITE;
    $adminHandler = wf_require_admin($baseUrl, $serviceKey, $requiredScopes);
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
            $select = rawurlencode('*,workflow_statuses:workflow_statuses(count),tickets:tickets(count),handler_workflows:handler_workflows(count)');
            [$code, $decoded, $raw] = wf_req('GET', $baseUrl . '/rest/v1/workflows?select=' . $select . '&order=display_order.asc', $serviceKey);
            wf_json(200, true, 'Workflows loaded', ['rows' => wf_or_fail('List workflows', $code, $decoded, $raw)]);
        }
        if ($action === 'active_handlers') {
            [$code, $decoded, $raw] = wf_req('GET', $baseUrl . '/rest/v1/handlers?select=id,name,email,roles,active&active=eq.true&order=name.asc', $serviceKey);
            $rows = wf_or_fail('List handlers', $code, $decoded, $raw);
            wf_json(200, true, 'Handlers loaded', ['rows' => wf_normalize_handler_rows($rows)]);
        }
        if ($action === 'all_handlers') {
            $includeInactive = wf_query_bool('include_inactive', false);
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
        if ($action === 'handler_workflow_ids') {
            $handlerId = trim((string)($_GET['handler_id'] ?? ''));
            if (!wf_uuid($handlerId)) throw new Exception('handler_id must be UUID');
            [$code, $decoded, $raw] = wf_req('GET', $baseUrl . '/rest/v1/handler_workflows?select=workflow_id&handler_id=eq.' . rawurlencode($handlerId), $serviceKey);
            $rows = wf_or_fail('Load handler workflows', $code, $decoded, $raw);
            $workflowIds = array_values(array_filter(array_map(static fn($r) => trim((string)($r['workflow_id'] ?? '')), $rows), static fn($x) => wf_uuid($x)));
            wf_json(200, true, 'Handler workflows loaded', ['handler_id' => $handlerId, 'workflow_ids' => $workflowIds]);
        }
        if ($action === 'permissions_list') {
            [$code, $decoded, $raw] = wf_req('GET', $baseUrl . '/rest/v1/permissions?select=*&order=category.asc,name.asc', $serviceKey);
            $rows = wf_or_fail('List permissions', $code, $decoded, $raw);
            wf_json(200, true, 'Permissions loaded', ['rows' => $rows]);
        }
        if ($action === 'roles_list') {
            [$code, $decoded, $raw] = wf_req('GET', $baseUrl . '/rest/v1/roles?select=*&order=name.asc', $serviceKey);
            $rows = wf_or_fail('List roles', $code, $decoded, $raw);
            wf_json(200, true, 'Roles loaded', ['rows' => $rows]);
        }
        if ($action === 'role_with_permissions') {
            $roleId = trim((string)($_GET['role_id'] ?? ''));
            if ($roleId === '') throw new Exception('role_id is required');
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
        wf_json(400, false, 'Unsupported action');
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') wf_json(405, false, 'Method not allowed');
    $body = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($body)) throw new Exception('Invalid JSON payload');
    $action = strtolower(trim((string)($body['action'] ?? '')));

    if ($action === 'create_workflow') {
        $p = (array)($body['payload'] ?? []);
        $name = trim((string)($p['name'] ?? ''));
        $code = trim((string)($p['code'] ?? ''));
        if ($name === '' || $code === '' || preg_match('/^[a-z0-9_]+$/', $code) !== 1) throw new Exception('Invalid workflow name/code');
        $payload = [
            'name' => $name,
            'code' => $code,
            'description' => $p['description'] ?? null,
            'icon_name' => $p['icon_name'] ?? ($p['iconName'] ?? null),
            'color_scheme' => $p['color_scheme'] ?? ($p['colorScheme'] ?? null),
            'display_order' => (int)($p['display_order'] ?? ($p['displayOrder'] ?? 0)),
            'active' => array_key_exists('active', $p) ? (bool)$p['active'] : true,
        ];
        [$codeHttp, $decoded, $raw] = wf_req('POST', $baseUrl . '/rest/v1/workflows', $serviceKey, $payload, true);
        wf_json(200, true, 'Workflow created', ['row' => wf_row(wf_or_fail('Create workflow', $codeHttp, $decoded, $raw))]);
    }

    if ($action === 'update_workflow') {
        $id = trim((string)($body['id'] ?? ''));
        $patch = (array)($body['patch'] ?? []);
        if (!wf_uuid($id) || !$patch) throw new Exception('Invalid workflow update payload');
        [$codeHttp, $decoded, $raw] = wf_req('PATCH', $baseUrl . '/rest/v1/workflows?id=eq.' . rawurlencode($id), $serviceKey, $patch, true);
        wf_json(200, true, 'Workflow updated', ['row' => wf_row(wf_or_fail('Update workflow', $codeHttp, $decoded, $raw))]);
    }

    if ($action === 'toggle_workflow_status') {
        $id = trim((string)($body['id'] ?? ''));
        if (!wf_uuid($id)) throw new Exception('id must be UUID');
        [$codeHttp, $decoded, $raw] = wf_req('PATCH', $baseUrl . '/rest/v1/workflows?id=eq.' . rawurlencode($id), $serviceKey, ['active' => !empty($body['active'])], true);
        wf_json(200, true, 'Workflow toggled', ['row' => wf_row(wf_or_fail('Toggle workflow', $codeHttp, $decoded, $raw))]);
    }

    if ($action === 'duplicate_workflow') {
        $id = trim((string)($body['id'] ?? ''));
        if (!wf_uuid($id)) throw new Exception('id must be UUID');
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
        [$wCode, $wDecoded, $wRaw] = wf_req('GET', $baseUrl . '/rest/v1/workflows?select=id&id=eq.' . rawurlencode($workflowId) . '&limit=1', $serviceKey);
        if (!wf_row(wf_or_fail('Validate workflow', $wCode, $wDecoded, $wRaw))) throw new Exception('workflow_id not found');
        [$hCode, $hDecoded, $hRaw] = wf_req('GET', $baseUrl . '/rest/v1/handlers?select=id&id=eq.' . rawurlencode($handlerId) . '&limit=1', $serviceKey);
        if (!wf_row(wf_or_fail('Validate handler', $hCode, $hDecoded, $hRaw))) throw new Exception('handler_id not found');
        [$codeHttp, $decoded, $raw] = wf_req('POST', $baseUrl . '/rest/v1/handler_workflows', $serviceKey, ['workflow_id' => $workflowId, 'handler_id' => $handlerId], true);
        if ($codeHttp >= 200 && $codeHttp < 300) wf_json(200, true, 'Routing rule added', ['row' => wf_row($decoded)]);
        if ($codeHttp === 409) {
            [$gCode, $gDecoded, $gRaw] = wf_req('GET', $baseUrl . '/rest/v1/handler_workflows?select=*&workflow_id=eq.' . rawurlencode($workflowId) . '&handler_id=eq.' . rawurlencode($handlerId) . '&limit=1', $serviceKey);
            wf_json(200, true, 'Routing rule already existed', ['row' => wf_row(wf_or_fail('Fetch existing routing rule', $gCode, $gDecoded, $gRaw))]);
        }
        wf_or_fail('Add routing rule', $codeHttp, $decoded, $raw);
    }

    if ($action === 'remove_routing_rule') {
        $ruleId = trim((string)($body['rule_id'] ?? ''));
        if (!wf_uuid($ruleId)) throw new Exception('rule_id must be UUID');
        wf_or_fail('Remove routing rule', ...wf_req('DELETE', $baseUrl . '/rest/v1/handler_workflows?id=eq.' . rawurlencode($ruleId), $serviceKey));
        wf_json(200, true, 'Routing rule removed', ['deleted' => true]);
    }

    if ($action === 'set_handler_workflows') {
        $handlerId = trim((string)($body['handler_id'] ?? ''));
        if (!wf_uuid($handlerId)) throw new Exception('handler_id must be UUID');
        [$hCode, $hDecoded, $hRaw] = wf_req('GET', $baseUrl . '/rest/v1/handlers?select=id&id=eq.' . rawurlencode($handlerId) . '&limit=1', $serviceKey);
        if (!wf_row(wf_or_fail('Validate handler', $hCode, $hDecoded, $hRaw))) throw new Exception('handler_id not found');

        $nextIds = wf_clean_uuid_array($body['workflow_ids'] ?? []);
        if ($nextIds) {
            $inValues = '(' . implode(',', array_map(static fn($x) => '"' . $x . '"', $nextIds)) . ')';
            [$wCode, $wDecoded, $wRaw] = wf_req('GET', $baseUrl . '/rest/v1/workflows?select=id&id=in.' . rawurlencode($inValues), $serviceKey);
            $validRows = wf_or_fail('Validate workflow_ids', $wCode, $wDecoded, $wRaw);
            $validIds = array_values(array_filter(array_map(static fn($r) => trim((string)($r['id'] ?? '')), $validRows), static fn($x) => wf_uuid($x)));
            sort($validIds);
            $expected = $nextIds;
            sort($expected);
            if ($validIds !== $expected) throw new Exception('One or more workflow_ids are invalid');
        }

        [$curCode, $curDecoded, $curRaw] = wf_req('GET', $baseUrl . '/rest/v1/handler_workflows?select=id,workflow_id&handler_id=eq.' . rawurlencode($handlerId), $serviceKey);
        $currentRows = wf_or_fail('Load existing handler workflows', $curCode, $curDecoded, $curRaw);

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
            $inValues = '(' . implode(',', array_map(static fn($x) => '"' . $x . '"', $toDeleteIds)) . ')';
            wf_or_fail('Delete handler workflow links', ...wf_req('DELETE', $baseUrl . '/rest/v1/handler_workflows?id=in.' . rawurlencode($inValues), $serviceKey));
        }
        if ($toInsert) {
            wf_or_fail('Insert handler workflow links', ...wf_req('POST', $baseUrl . '/rest/v1/handler_workflows', $serviceKey, $toInsert, true));
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
        wf_or_fail('Clear handler workflows', ...wf_req('DELETE', $baseUrl . '/rest/v1/handler_workflows?handler_id=eq.' . rawurlencode($handlerId), $serviceKey));
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
        wf_or_fail('Delete location', ...wf_req('DELETE', $baseUrl . '/rest/v1/locations?id=eq.' . rawurlencode($id), $serviceKey));
        wf_json(200, true, 'Location deleted', ['deleted' => true]);
    }

    if ($action === 'location_toggle_active') {
        $id = trim((string)($body['id'] ?? ''));
        if (!wf_uuid($id)) throw new Exception('id must be UUID');

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
        [$codeHttp, $decoded, $raw] = wf_req('POST', $baseUrl . '/rest/v1/permissions', $serviceKey, $payload, true);
        wf_json(200, true, 'Permission created', ['row' => wf_row(wf_or_fail('Create permission', $codeHttp, $decoded, $raw))]);
    }

    if ($action === 'permission_update') {
        $id = trim((string)($body['id'] ?? ''));
        $patchRaw = is_array($body['patch'] ?? null) ? $body['patch'] : [];
        if ($id === '' || !$patchRaw) throw new Exception('Invalid permission update payload');

        $allowed = ['code', 'name', 'description', 'category', 'is_system'];
        $payload = [];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $patchRaw)) $payload[$field] = $patchRaw[$field];
        }
        if (!$payload) throw new Exception('No valid fields to update');

        [$codeHttp, $decoded, $raw] = wf_req('PATCH', $baseUrl . '/rest/v1/permissions?id=eq.' . rawurlencode($id), $serviceKey, $payload, true);
        wf_json(200, true, 'Permission updated', ['row' => wf_row(wf_or_fail('Update permission', $codeHttp, $decoded, $raw))]);
    }

    if ($action === 'permission_delete') {
        $id = trim((string)($body['id'] ?? ''));
        if ($id === '') throw new Exception('id is required');
        wf_or_fail('Delete permission', ...wf_req('DELETE', $baseUrl . '/rest/v1/permissions?id=eq.' . rawurlencode($id) . '&is_system=eq.false', $serviceKey));
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
        [$codeHttp, $decoded, $raw] = wf_req('POST', $baseUrl . '/rest/v1/roles', $serviceKey, $payload, true);
        wf_json(200, true, 'Role created', ['row' => wf_row(wf_or_fail('Create role', $codeHttp, $decoded, $raw))]);
    }

    if ($action === 'role_update') {
        $id = trim((string)($body['id'] ?? ''));
        $patchRaw = is_array($body['patch'] ?? null) ? $body['patch'] : [];
        if ($id === '' || !$patchRaw) throw new Exception('Invalid role update payload');

        $allowed = ['code', 'name', 'description', 'is_system', 'is_default'];
        $payload = [];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $patchRaw)) $payload[$field] = $patchRaw[$field];
        }
        if (!$payload) throw new Exception('No valid fields to update');

        [$codeHttp, $decoded, $raw] = wf_req('PATCH', $baseUrl . '/rest/v1/roles?id=eq.' . rawurlencode($id), $serviceKey, $payload, true);
        wf_json(200, true, 'Role updated', ['row' => wf_row(wf_or_fail('Update role', $codeHttp, $decoded, $raw))]);
    }

    if ($action === 'role_delete') {
        $id = trim((string)($body['id'] ?? ''));
        if ($id === '') throw new Exception('id is required');
        wf_or_fail('Delete role', ...wf_req('DELETE', $baseUrl . '/rest/v1/roles?id=eq.' . rawurlencode($id) . '&is_system=eq.false', $serviceKey));
        wf_json(200, true, 'Role deleted', ['deleted' => true]);
    }

    if ($action === 'role_set_permissions') {
        $roleId = trim((string)($body['role_id'] ?? ''));
        if ($roleId === '') throw new Exception('role_id is required');
        $permissionIds = wf_clean_id_array($body['permission_ids'] ?? []);

        wf_or_fail('Clear role permissions', ...wf_req('DELETE', $baseUrl . '/rest/v1/role_permissions?role_id=eq.' . rawurlencode($roleId), $serviceKey));

        if (count($permissionIds) > 0) {
            $rows = array_map(static fn($permissionId) => [
                'role_id' => $roleId,
                'permission_id' => $permissionId,
            ], $permissionIds);
            wf_or_fail('Insert role permissions', ...wf_req('POST', $baseUrl . '/rest/v1/role_permissions', $serviceKey, $rows, true));
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

        foreach ($payload['next_codes'] as $nc) {
            [$chkCode, $chkDecoded, $chkRaw] = wf_req('GET', $baseUrl . '/rest/v1/workflow_statuses?select=id&workflow_id=eq.' . rawurlencode($workflowId) . '&code=eq.' . rawurlencode($nc) . '&limit=1', $serviceKey);
            $checkRows = wf_or_fail('Validate next_codes', $chkCode, $chkDecoded, $chkRaw);
            if (!$checkRows) throw new Exception('Invalid next_codes: "' . $nc . '" does not exist in workflow');
        }

        [$codeHttp, $decoded, $raw] = wf_req('POST', $baseUrl . '/rest/v1/workflow_statuses', $serviceKey, $payload, true);
        wf_json(200, true, 'Status created', ['row' => wf_row(wf_or_fail('Create status', $codeHttp, $decoded, $raw))]);
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
        if (array_key_exists('next_codes', $payload)) {
            $payload['next_codes'] = array_values(array_filter(array_map(static fn($x) => trim((string)$x), is_array($payload['next_codes']) ? $payload['next_codes'] : []), static fn($x) => $x !== ''));
            [$sCode, $sDecoded, $sRaw] = wf_req('GET', $baseUrl . '/rest/v1/workflow_statuses?select=workflow_id&id=eq.' . rawurlencode($statusId) . '&limit=1', $serviceKey);
            $statusRow = wf_row(wf_or_fail('Load status for next_codes validation', $sCode, $sDecoded, $sRaw));
            if (!$statusRow || !wf_uuid((string)($statusRow['workflow_id'] ?? ''))) throw new Exception('Status not found');
            $workflowId = (string)$statusRow['workflow_id'];
            foreach ($payload['next_codes'] as $nc) {
                [$chkCode, $chkDecoded, $chkRaw] = wf_req('GET', $baseUrl . '/rest/v1/workflow_statuses?select=id&workflow_id=eq.' . rawurlencode($workflowId) . '&code=eq.' . rawurlencode($nc) . '&limit=1', $serviceKey);
                $checkRows = wf_or_fail('Validate next_codes', $chkCode, $chkDecoded, $chkRaw);
                if (!$checkRows) throw new Exception('Invalid next_codes: "' . $nc . '" does not exist in workflow');
            }
        }

        [$codeHttp, $decoded, $raw] = wf_req('PATCH', $baseUrl . '/rest/v1/workflow_statuses?id=eq.' . rawurlencode($statusId), $serviceKey, $payload, true);
        wf_json(200, true, 'Status updated', ['row' => wf_row(wf_or_fail('Update status', $codeHttp, $decoded, $raw))]);
    }

    if ($action === 'delete_status') {
        $statusId = trim((string)($body['status_id'] ?? ''));
        if (!wf_uuid($statusId)) throw new Exception('status_id must be UUID');
        [$codeHttp, $decoded, $raw] = wf_req('DELETE', $baseUrl . '/rest/v1/workflow_statuses?id=eq.' . rawurlencode($statusId), $serviceKey, null, true);
        wf_json(200, true, 'Status deleted', ['row' => wf_row(wf_or_fail('Delete status', $codeHttp, $decoded, $raw)), 'deleted' => true]);
    }

    if ($action === 'reorder_statuses') {
        $workflowId = trim((string)($body['workflow_id'] ?? ''));
        $items = is_array($body['items'] ?? null) ? $body['items'] : [];
        if (!wf_uuid($workflowId)) throw new Exception('workflow_id must be UUID');

        foreach ($items as $it) {
            $sid = trim((string)($it['id'] ?? ''));
            if (!wf_uuid($sid)) continue;
            $sortOrder = (int)($it['sort_order'] ?? 0);
            wf_or_fail('Reorder status', ...wf_req('PATCH', $baseUrl . '/rest/v1/workflow_statuses?id=eq.' . rawurlencode($sid) . '&workflow_id=eq.' . rawurlencode($workflowId), $serviceKey, ['sort_order' => $sortOrder], true));
        }
        wf_json(200, true, 'Statuses reordered', wf_status_list($baseUrl, $serviceKey, $workflowId));
    }

    if ($action === 'save_statuses') {
        $workflowId = trim((string)($body['workflow_id'] ?? ''));
        if (!wf_uuid($workflowId)) throw new Exception('workflow_id must be UUID');
        $statuses = is_array($body['statuses'] ?? null) ? $body['statuses'] : [];
        $deleteIds = is_array($body['delete_ids'] ?? null) ? $body['delete_ids'] : [];
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

        [$eCode, $eDecoded, $eRaw] = wf_req('GET', $baseUrl . '/rest/v1/workflow_statuses?select=id,code&workflow_id=eq.' . rawurlencode($workflowId), $serviceKey);
        $existing = wf_or_fail('Load existing statuses', $eCode, $eDecoded, $eRaw);
        $existingByCode = [];
        foreach ($existing as $r) $existingByCode[strtolower((string)($r['code'] ?? ''))] = (string)($r['id'] ?? '');

        $upsert = [];
        foreach ($rows as $r) {
            $rid = $r['id'] !== '' ? $r['id'] : ($existingByCode[strtolower($r['code'])] ?? wf_uuid4());
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
                'next_codes' => [],
                'expected_duration_days' => $r['expected_duration_days'],
                'contact_person_name' => $r['contact_person_name'],
                'contact_person_email' => $r['contact_person_email'],
                'contact_person_phone' => $r['contact_person_phone'],
                'contact_notes' => $r['contact_notes'],
            ];
        }
        $del = array_values(array_filter(array_map(static fn($x) => trim((string)$x), $deleteIds), static fn($x) => wf_uuid($x)));
        if ($del) {
            $inValues = '(' . implode(',', array_map(static fn($x) => '"' . $x . '"', $del)) . ')';
            wf_or_fail('Delete workflow statuses', ...wf_req('DELETE', $baseUrl . '/rest/v1/workflow_statuses?id=in.' . rawurlencode($inValues), $serviceKey));
        }
        if ($upsert) wf_or_fail('Upsert workflow statuses', ...wf_req('POST', $baseUrl . '/rest/v1/workflow_statuses?on_conflict=workflow_id,code', $serviceKey, $upsert, true));
        foreach ($rows as $r) {
            wf_or_fail('Update next_codes', ...wf_req('PATCH', $baseUrl . '/rest/v1/workflow_statuses?workflow_id=eq.' . rawurlencode($workflowId) . '&code=eq.' . rawurlencode($r['code']), $serviceKey, ['next_codes' => array_values($r['next_codes'])]));
        }
        wf_json(200, true, 'Statuses saved', wf_status_list($baseUrl, $serviceKey, $workflowId));
    }

    wf_json(400, false, 'Unsupported action');
} catch (Throwable $e) {
    $errorId = api_log_exception('workflows.api', $e);
    wf_json(500, false, 'Internal server error', ['error_id' => $errorId]);
}
