<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_auth0.php';
require_once __DIR__ . '/_supabase.php';
require_once __DIR__ . '/_errors.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'OK'], JSON_UNESCAPED_UNICODE);
    exit;
}

ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/../../php-errors.log');
ini_set('display_errors', '0');
error_reporting(E_ALL);

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

function wf_require_admin(string $baseUrl, string $serviceKey): array {
    $token = auth0_get_bearer_token();
    if ($token === '') wf_json(401, false, 'Authorization token required');

    $claims = auth0_verify_id_token($token, wf_env('VITE_AUTH0_DOMAIN'), wf_env('VITE_AUTH0_CLIENT_ID'));
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

try {
    load_env_file(__DIR__ . '/../../.env.local', true);
    load_env_file(__DIR__ . '/../../.env', false);

    $baseUrl = wf_url();
    $serviceKey = wf_key();
    wf_require_admin($baseUrl, $serviceKey);

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $action = strtolower(trim((string)($_GET['action'] ?? 'list_with_stats')));
        if ($action === 'list_with_stats') {
            $select = rawurlencode('*,workflow_statuses:workflow_statuses(count),tickets:tickets(count),handler_workflows:handler_workflows(count)');
            [$code, $decoded, $raw] = wf_req('GET', $baseUrl . '/rest/v1/workflows?select=' . $select . '&order=display_order.asc', $serviceKey);
            wf_json(200, true, 'Workflows loaded', ['rows' => wf_or_fail('List workflows', $code, $decoded, $raw)]);
        }
        if ($action === 'active_handlers') {
            [$code, $decoded, $raw] = wf_req('GET', $baseUrl . '/rest/v1/handlers?select=id,name,email,role,active&active=eq.true&order=name.asc', $serviceKey);
            wf_json(200, true, 'Handlers loaded', ['rows' => wf_or_fail('List handlers', $code, $decoded, $raw)]);
        }
        if ($action === 'routing_rules') {
            $workflowId = trim((string)($_GET['workflow_id'] ?? ''));
            if (!wf_uuid($workflowId)) throw new Exception('workflow_id must be UUID');
            $select = rawurlencode('id,handler_id,workflow_id,handlers:handler_id(id,name,email,role,active)');
            [$code, $decoded, $raw] = wf_req('GET', $baseUrl . '/rest/v1/handler_workflows?select=' . $select . '&workflow_id=eq.' . rawurlencode($workflowId), $serviceKey);
            wf_json(200, true, 'Routing rules loaded', ['rows' => wf_or_fail('List routing rules', $code, $decoded, $raw)]);
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
            'code', 'label', 'description', 'color', 'sort_order', 'is_terminal', 'next_codes',
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
