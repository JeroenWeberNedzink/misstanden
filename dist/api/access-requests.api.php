<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_auth0.php';
require_once __DIR__ . '/_admin_auth.php';
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

const ACCESS_REQUESTS_SCOPES_ADMIN_READ = [
    'admin:users:read',
    'admin:users:write',
    'read:users',
    'write:users',
    'manage:users',
    'admin:all',
    'admin',
];

const ACCESS_REQUESTS_SCOPES_ADMIN_WRITE = [
    'admin:users:write',
    'write:users',
    'manage:users',
    'admin:all',
    'admin',
];

function ar_json(int $status, bool $success, string $message, array $data = []): void {
    http_response_code($status);
    echo json_encode(array_merge([
        'success' => $success,
        'message' => $message,
    ], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function ar_env_required(string $key): string {
    $value = trim((string)(getenv($key) ?: ''));
    if ($value === '') {
        throw new Exception('Missing required environment variable: ' . $key);
    }
    return $value;
}

function ar_normalize_email(?string $email): string {
    return strtolower(trim((string)$email));
}

function ar_uuid(string $value): bool {
    return preg_match(
        '/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i',
        trim($value)
    ) === 1;
}

function ar_uuid_list($raw): array {
    if (!is_array($raw)) {
        return [];
    }
    $out = [];
    foreach ($raw as $candidate) {
        $value = trim((string)$candidate);
        if ($value === '' || !ar_uuid($value)) {
            continue;
        }
        $out[] = $value;
    }
    return array_values(array_unique($out));
}

function ar_role_list($raw): array {
    $items = [];
    if (is_array($raw)) {
        $items = $raw;
    } elseif (is_string($raw)) {
        $trimmed = trim($raw);
        if ($trimmed !== '') {
            $decoded = json_decode($trimmed, true);
            if (is_array($decoded)) {
                $items = $decoded;
            } else {
                $items = preg_split('/[\s,]+/', $trimmed) ?: [];
            }
        }
    }

    $roles = [];
    foreach ($items as $item) {
        $value = strtoupper(trim((string)$item));
        if ($value === '') {
            continue;
        }
        if (!preg_match('/^[A-Z0-9_:-]+$/', $value)) {
            continue;
        }
        $roles[] = $value;
    }

    $roles = array_values(array_unique($roles));
    if (!$roles) {
        $roles = ['HANDLER'];
    }
    if (!in_array('HANDLER', $roles, true)) {
        array_unshift($roles, 'HANDLER');
    }

    return array_values(array_unique($roles));
}

function ar_supabase_request(
    string $method,
    string $url,
    string $apikey,
    $payload = null,
    bool $returnRepresentation = false
): array {
    $headers = [
        'apikey: ' . $apikey,
        'Authorization: Bearer ' . $apikey,
        'Content-Type: application/json',
    ];
    if ($returnRepresentation) {
        $headers[] = 'Prefer: return=representation';
    }

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 30,
    ]);

    if ($payload !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_UNICODE));
    }

    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($resp === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new Exception('Supabase request failed: ' . $err);
    }
    curl_close($ch);

    $decoded = json_decode($resp, true);
    return [$code, $decoded, $resp];
}

function ar_assert_success(int $code, $decoded, string $raw, string $context): void {
    if ($code >= 200 && $code < 300) {
        return;
    }
    $msg = is_array($decoded) ? json_encode($decoded, JSON_UNESCAPED_UNICODE) : $raw;
    throw new Exception($context . ' failed: ' . $msg);
}

function ar_rows($decoded): array {
    if (is_array($decoded) && array_is_list($decoded)) {
        return $decoded;
    }
    if (is_array($decoded)) {
        return [$decoded];
    }
    return [];
}

function ar_row($decoded): ?array {
    $rows = ar_rows($decoded);
    $row = $rows[0] ?? null;
    return is_array($row) ? $row : null;
}

function ar_auth_claims(): array {
    $token = auth0_get_bearer_token();
    if ($token === '') {
        ar_json(401, false, 'Authorization token required');
    }

    $auth0Domain = ar_env_required('VITE_AUTH0_DOMAIN');
    $auth0Audience = auth0_expected_api_audience();
    $auth0ClientId = ar_env_required('VITE_AUTH0_CLIENT_ID');
    $claims = auth0_verify_access_token($token, $auth0Domain, $auth0Audience, $auth0ClientId);

    $sub = trim((string)($claims['sub'] ?? ''));
    if ($sub === '') {
        ar_json(403, false, 'Invalid authenticated subject');
    }

    return $claims;
}

function ar_require_admin_context(array $scopes = []): array {
    return api_authz_require_admin(static function (int $status, string $message): void {
        ar_json($status, false, $message);
    }, $scopes);
}

function ar_request_select_fields(): string {
    return rawurlencode('id,user_id,email,name,picture,status,request_message,review_notes,created_handler_id,reviewed_by,reviewed_at,created_at,updated_at,metadata');
}

function ar_load_latest_request_for_identity(string $baseUrl, string $serviceKey, string $sub, string $email): ?array {
    $select = ar_request_select_fields();

    [$codeBySub, $decodedBySub, $rawBySub] = ar_supabase_request(
        'GET',
        $baseUrl . '/rest/v1/access_requests?select=' . $select
        . '&user_id=eq.' . rawurlencode($sub)
        . '&order=created_at.desc&limit=1',
        $serviceKey
    );
    ar_assert_success($codeBySub, $decodedBySub, $rawBySub, 'Load access request by user_id');
    $row = ar_row($decodedBySub);
    if ($row) {
        return $row;
    }

    if ($email === '') {
        return null;
    }

    [$codeByEmail, $decodedByEmail, $rawByEmail] = ar_supabase_request(
        'GET',
        $baseUrl . '/rest/v1/access_requests?select=' . $select
        . '&email=ilike.' . rawurlencode($email)
        . '&order=created_at.desc&limit=1',
        $serviceKey
    );
    ar_assert_success($codeByEmail, $decodedByEmail, $rawByEmail, 'Load access request by email');
    return ar_row($decodedByEmail);
}

function ar_load_pending_request_for_identity(string $baseUrl, string $serviceKey, string $sub, string $email): ?array {
    $select = ar_request_select_fields();

    [$codeBySub, $decodedBySub, $rawBySub] = ar_supabase_request(
        'GET',
        $baseUrl . '/rest/v1/access_requests?select=' . $select
        . '&status=eq.pending'
        . '&user_id=eq.' . rawurlencode($sub)
        . '&order=created_at.desc&limit=1',
        $serviceKey
    );
    ar_assert_success($codeBySub, $decodedBySub, $rawBySub, 'Load pending request by user_id');
    $row = ar_row($decodedBySub);
    if ($row) {
        return $row;
    }

    if ($email === '') {
        return null;
    }

    [$codeByEmail, $decodedByEmail, $rawByEmail] = ar_supabase_request(
        'GET',
        $baseUrl . '/rest/v1/access_requests?select=' . $select
        . '&status=eq.pending'
        . '&email=ilike.' . rawurlencode($email)
        . '&order=created_at.desc&limit=1',
        $serviceKey
    );
    ar_assert_success($codeByEmail, $decodedByEmail, $rawByEmail, 'Load pending request by email');
    return ar_row($decodedByEmail);
}

function ar_load_request_by_id(string $baseUrl, string $serviceKey, string $requestId, bool $pendingOnly = false): ?array {
    $select = ar_request_select_fields();
    $url = $baseUrl . '/rest/v1/access_requests?select=' . $select
        . '&id=eq.' . rawurlencode($requestId)
        . '&limit=1';
    if ($pendingOnly) {
        $url .= '&status=eq.pending';
    }

    [$code, $decoded, $raw] = ar_supabase_request('GET', $url, $serviceKey);
    ar_assert_success($code, $decoded, $raw, 'Load request by id');
    return ar_row($decoded);
}

function ar_default_handler_name(array $request): string {
    $name = trim((string)($request['name'] ?? ''));
    if ($name !== '') {
        return $name;
    }
    $email = trim((string)($request['email'] ?? ''));
    if ($email !== '' && str_contains($email, '@')) {
        $left = explode('@', $email)[0] ?? '';
        $left = trim(str_replace(['.', '_', '-'], ' ', $left));
        if ($left !== '') {
            return ucwords($left);
        }
    }
    return 'Nieuwe gebruiker';
}

function ar_find_handler_for_request(string $baseUrl, string $serviceKey, array $request): ?array {
    $sub = trim((string)($request['user_id'] ?? ''));
    $email = ar_normalize_email((string)($request['email'] ?? ''));
    $select = rawurlencode('id,name,email,user_id,active,roles,picture,permissions');

    if ($sub !== '') {
        [$codeSub, $decodedSub, $rawSub] = ar_supabase_request(
            'GET',
            $baseUrl . '/rest/v1/handlers?select=' . $select
            . '&user_id=eq.' . rawurlencode($sub)
            . '&limit=1',
            $serviceKey
        );
        ar_assert_success($codeSub, $decodedSub, $rawSub, 'Load handler by user_id');
        $row = ar_row($decodedSub);
        if ($row) {
            return $row;
        }
    }

    if ($email === '') {
        return null;
    }

    [$codeEmail, $decodedEmail, $rawEmail] = ar_supabase_request(
        'GET',
        $baseUrl . '/rest/v1/handlers?select=' . $select
        . '&email=ilike.' . rawurlencode($email)
        . '&limit=1',
        $serviceKey
    );
    ar_assert_success($codeEmail, $decodedEmail, $rawEmail, 'Load handler by email');
    return ar_row($decodedEmail);
}

function ar_update_handler(string $baseUrl, string $serviceKey, string $handlerId, array $patch): array {
    [$code, $decoded, $raw] = ar_supabase_request(
        'PATCH',
        $baseUrl . '/rest/v1/handlers?id=eq.' . rawurlencode($handlerId) . '&select=*',
        $serviceKey,
        $patch,
        true
    );
    ar_assert_success($code, $decoded, $raw, 'Update handler');
    $row = ar_row($decoded);
    if (!$row) {
        throw new Exception('Update handler failed: no row returned');
    }
    return $row;
}

function ar_create_handler(string $baseUrl, string $serviceKey, array $payload): array {
    [$code, $decoded, $raw] = ar_supabase_request(
        'POST',
        $baseUrl . '/rest/v1/handlers?select=*',
        $serviceKey,
        $payload,
        true
    );
    ar_assert_success($code, $decoded, $raw, 'Create handler');
    $row = ar_row($decoded);
    if (!$row) {
        throw new Exception('Create handler failed: no row returned');
    }
    return $row;
}

function ar_sync_handler_roles(string $baseUrl, string $serviceKey, string $handlerId, array $roles, array &$warnings): void {
    if (!$roles) {
        return;
    }

    try {
        $inValues = '(' . implode(',', array_map(static fn($role) => rawurlencode((string)$role), $roles)) . ')';
        [$codeRoles, $decodedRoles, $rawRoles] = ar_supabase_request(
            'GET',
            $baseUrl . '/rest/v1/roles?select=id,code&code=in.' . $inValues,
            $serviceKey
        );
        ar_assert_success($codeRoles, $decodedRoles, $rawRoles, 'Load role ids');

        $roleRows = ar_rows($decodedRoles);
        $roleIds = [];
        foreach ($roleRows as $roleRow) {
            $id = trim((string)($roleRow['id'] ?? ''));
            if ($id !== '' && ar_uuid($id)) {
                $roleIds[] = $id;
            }
        }

        [$codeDelete, $decodedDelete, $rawDelete] = ar_supabase_request(
            'DELETE',
            $baseUrl . '/rest/v1/handler_roles?handler_id=eq.' . rawurlencode($handlerId),
            $serviceKey
        );
        ar_assert_success($codeDelete, $decodedDelete, $rawDelete, 'Clear handler role links');

        if ($roleIds) {
            $rowsToInsert = [];
            foreach ($roleIds as $roleId) {
                $rowsToInsert[] = [
                    'handler_id' => $handlerId,
                    'role_id' => $roleId,
                ];
            }
            [$codeInsert, $decodedInsert, $rawInsert] = ar_supabase_request(
                'POST',
                $baseUrl . '/rest/v1/handler_roles',
                $serviceKey,
                $rowsToInsert
            );
            ar_assert_success($codeInsert, $decodedInsert, $rawInsert, 'Insert handler role links');
        }
    } catch (Throwable $e) {
        $warnings[] = 'RBAC role-koppeling kon niet volledig worden gesynchroniseerd.';
    }
}

function ar_sync_handler_workflows(
    string $baseUrl,
    string $serviceKey,
    string $handlerId,
    ?array $workflowIds,
    array &$warnings
): void {
    if ($workflowIds === null) {
        return;
    }

    try {
        [$codeDelete, $decodedDelete, $rawDelete] = ar_supabase_request(
            'DELETE',
            $baseUrl . '/rest/v1/handler_workflows?handler_id=eq.' . rawurlencode($handlerId),
            $serviceKey
        );
        ar_assert_success($codeDelete, $decodedDelete, $rawDelete, 'Clear handler workflows');

        if ($workflowIds) {
            $rowsToInsert = [];
            foreach ($workflowIds as $workflowId) {
                $rowsToInsert[] = [
                    'handler_id' => $handlerId,
                    'workflow_id' => $workflowId,
                ];
            }
            [$codeInsert, $decodedInsert, $rawInsert] = ar_supabase_request(
                'POST',
                $baseUrl . '/rest/v1/handler_workflows',
                $serviceKey,
                $rowsToInsert
            );
            ar_assert_success($codeInsert, $decodedInsert, $rawInsert, 'Insert handler workflows');
        }
    } catch (Throwable $e) {
        $warnings[] = 'Workflow-toewijzing kon niet automatisch worden toegepast.';
    }
}

function ar_approve_request(
    string $baseUrl,
    string $serviceKey,
    array $requestRow,
    array $roles,
    ?array $workflowIds,
    string $reviewNotes,
    string $reviewedBy
): array {
    $warnings = [];
    $handler = ar_find_handler_for_request($baseUrl, $serviceKey, $requestRow);

    if ($handler) {
        $existingRoles = ar_role_list($handler['roles'] ?? []);
        $finalRoles = array_values(array_unique(array_merge($existingRoles, $roles)));
        $patch = [
            'active' => true,
            'roles' => $finalRoles,
        ];

        if (trim((string)($handler['user_id'] ?? '')) === '' && trim((string)($requestRow['user_id'] ?? '')) !== '') {
            $patch['user_id'] = trim((string)$requestRow['user_id']);
        }
        if (ar_normalize_email((string)($handler['email'] ?? '')) === '' && ar_normalize_email((string)($requestRow['email'] ?? '')) !== '') {
            $patch['email'] = ar_normalize_email((string)$requestRow['email']);
        }
        if (trim((string)($handler['name'] ?? '')) === '') {
            $patch['name'] = ar_default_handler_name($requestRow);
        }
        if (trim((string)($handler['picture'] ?? '')) === '' && trim((string)($requestRow['picture'] ?? '')) !== '') {
            $patch['picture'] = trim((string)$requestRow['picture']);
        }

        $handler = ar_update_handler($baseUrl, $serviceKey, (string)$handler['id'], $patch);
    } else {
        $finalRoles = $roles ?: ['HANDLER'];
        $createPayload = [
            'name' => ar_default_handler_name($requestRow),
            'email' => ar_normalize_email((string)($requestRow['email'] ?? '')) ?: null,
            'user_id' => trim((string)($requestRow['user_id'] ?? '')) ?: null,
            'picture' => trim((string)($requestRow['picture'] ?? '')) ?: null,
            'active' => true,
            'roles' => $finalRoles,
            'permissions' => new stdClass(),
        ];
        $handler = ar_create_handler($baseUrl, $serviceKey, $createPayload);
    }

    $handlerId = trim((string)($handler['id'] ?? ''));
    if ($handlerId === '' || !ar_uuid($handlerId)) {
        throw new Exception('Approved handler missing valid id');
    }

    ar_sync_handler_roles($baseUrl, $serviceKey, $handlerId, ar_role_list($handler['roles'] ?? $roles), $warnings);
    ar_sync_handler_workflows($baseUrl, $serviceKey, $handlerId, $workflowIds, $warnings);

    $requestPatch = [
        'status' => 'approved',
        'review_notes' => $reviewNotes !== '' ? $reviewNotes : null,
        'reviewed_at' => (new DateTimeImmutable('now'))->format(DateTime::ATOM),
        'reviewed_by' => ar_uuid($reviewedBy) ? $reviewedBy : null,
        'created_handler_id' => $handlerId,
    ];

    [$codeReqUpdate, $decodedReqUpdate, $rawReqUpdate] = ar_supabase_request(
        'PATCH',
        $baseUrl . '/rest/v1/access_requests?id=eq.' . rawurlencode((string)$requestRow['id']) . '&select=' . ar_request_select_fields(),
        $serviceKey,
        $requestPatch,
        true
    );
    ar_assert_success($codeReqUpdate, $decodedReqUpdate, $rawReqUpdate, 'Approve access request');

    $updatedRequest = ar_row($decodedReqUpdate);
    if (!$updatedRequest) {
        throw new Exception('Approve access request failed: no updated request returned');
    }

    return [
        'request' => $updatedRequest,
        'handler' => $handler,
        'warnings' => $warnings,
    ];
}

function ar_reject_request(
    string $baseUrl,
    string $serviceKey,
    array $requestRow,
    string $reviewNotes,
    string $reviewedBy
): array {
    $patch = [
        'status' => 'rejected',
        'review_notes' => $reviewNotes !== '' ? $reviewNotes : null,
        'reviewed_at' => (new DateTimeImmutable('now'))->format(DateTime::ATOM),
        'reviewed_by' => ar_uuid($reviewedBy) ? $reviewedBy : null,
    ];

    [$code, $decoded, $raw] = ar_supabase_request(
        'PATCH',
        $baseUrl . '/rest/v1/access_requests?id=eq.' . rawurlencode((string)$requestRow['id']) . '&select=' . ar_request_select_fields(),
        $serviceKey,
        $patch,
        true
    );
    ar_assert_success($code, $decoded, $raw, 'Reject access request');
    $row = ar_row($decoded);
    if (!$row) {
        throw new Exception('Reject access request failed: no updated request returned');
    }
    return $row;
}

try {
    load_env_file(__DIR__ . '/../../.env.local', true);
    load_env_file(__DIR__ . '/../../.env', false);

    $baseUrl = rtrim(ar_env_required('VITE_SUPABASE_URL'), '/');
    $serviceKey = supabase_get_service_role_key();

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        api_apply_no_store_headers();
        $action = trim((string)($_GET['action'] ?? 'my'));

        if ($action === 'my') {
            $claims = ar_auth_claims();
            $sub = trim((string)($claims['sub'] ?? ''));
            $email = ar_normalize_email((string)($claims['email'] ?? ''));
            $row = ar_load_latest_request_for_identity($baseUrl, $serviceKey, $sub, $email);
            ar_json(200, true, 'Access request status loaded', ['row' => $row]);
        }

        if ($action === 'list') {
            ar_require_admin_context(ACCESS_REQUESTS_SCOPES_ADMIN_READ);
            $status = strtolower(trim((string)($_GET['status'] ?? 'pending')));
            $allowedStatuses = ['pending', 'approved', 'rejected', 'cancelled', 'all'];
            if (!in_array($status, $allowedStatuses, true)) {
                ar_json(400, false, 'Invalid status filter');
            }

            $limit = isset($_GET['limit']) && is_numeric($_GET['limit']) ? (int)$_GET['limit'] : 100;
            $limit = max(1, min(500, $limit));

            $url = $baseUrl . '/rest/v1/access_requests?select=' . ar_request_select_fields()
                . '&order=created_at.desc&limit=' . $limit;
            if ($status !== 'all') {
                $url .= '&status=eq.' . rawurlencode($status);
            }

            [$code, $decoded, $raw] = ar_supabase_request('GET', $url, $serviceKey);
            ar_assert_success($code, $decoded, $raw, 'List access requests');
            $rows = ar_rows($decoded);

            $counts = [
                'pending' => 0,
                'approved' => 0,
                'rejected' => 0,
                'cancelled' => 0,
            ];
            foreach ($rows as $row) {
                $key = strtolower(trim((string)($row['status'] ?? '')));
                if (array_key_exists($key, $counts)) {
                    $counts[$key]++;
                }
            }

            ar_json(200, true, 'Access requests loaded', [
                'rows' => $rows,
                'count' => count($rows),
                'counts' => $counts,
            ]);
        }

        ar_json(400, false, 'Unsupported action');
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        ar_json(405, false, 'Method not allowed');
    }

    $raw = file_get_contents('php://input');
    $body = json_decode($raw ?? '', true);
    if (!is_array($body)) {
        $body = [];
    }
    $action = strtolower(trim((string)($body['action'] ?? '')));

    if ($action === 'request_access') {
        $claims = ar_auth_claims();
        $sub = trim((string)($claims['sub'] ?? ''));
        $email = ar_normalize_email((string)($claims['email'] ?? ''));
        $name = trim((string)($claims['name'] ?? ''));
        $picture = trim((string)($claims['picture'] ?? ''));
        $message = trim((string)($body['request_message'] ?? $body['message'] ?? ''));
        if (mb_strlen($message) > 1000) {
            $message = mb_substr($message, 0, 1000);
        }

        $actorKey = api_rate_limit_hash('access_request_actor:' . $sub);
        $clientKey = api_rate_limit_client_fingerprint();
        api_rate_limit_enforce(
            'access-requests:create:actor:' . $actorKey,
            8,
            3600,
            static function (int $retryAfter): void {
                ar_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $retryAfter]);
            }
        );
        api_rate_limit_enforce(
            'access-requests:create:client:' . $clientKey,
            30,
            3600,
            static function (int $retryAfter): void {
                ar_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $retryAfter]);
            }
        );

        $pending = ar_load_pending_request_for_identity($baseUrl, $serviceKey, $sub, $email);
        if ($pending) {
            ar_json(200, true, 'Access request already pending', [
                'row' => $pending,
                'pending_exists' => true,
            ]);
        }

        $insertPayload = [
            'user_id' => $sub,
            'email' => $email !== '' ? $email : null,
            'name' => $name !== '' ? $name : null,
            'picture' => $picture !== '' ? $picture : null,
            'status' => 'pending',
            'request_message' => $message !== '' ? $message : null,
            'metadata' => [
                'source' => 'no_access_page',
            ],
        ];

        [$codeCreate, $decodedCreate, $rawCreate] = ar_supabase_request(
            'POST',
            $baseUrl . '/rest/v1/access_requests?select=' . ar_request_select_fields(),
            $serviceKey,
            $insertPayload,
            true
        );

        if ($codeCreate === 409) {
            $existing = ar_load_pending_request_for_identity($baseUrl, $serviceKey, $sub, $email);
            ar_json(200, true, 'Access request already pending', [
                'row' => $existing,
                'pending_exists' => true,
            ]);
        }

        ar_assert_success($codeCreate, $decodedCreate, $rawCreate, 'Create access request');
        $created = ar_row($decodedCreate);
        if (!$created) {
            throw new Exception('Create access request failed: no row returned');
        }

        ar_json(200, true, 'Access request submitted', [
            'row' => $created,
            'pending_exists' => false,
        ]);
    }

    if ($action === 'approve' || $action === 'reject') {
        $ctx = ar_require_admin_context(ACCESS_REQUESTS_SCOPES_ADMIN_WRITE);
        $handlerId = trim((string)($ctx['handler']['id'] ?? ''));
        $claimSub = trim((string)($ctx['claims']['sub'] ?? ''));
        $actorRaw = $handlerId !== '' ? $handlerId : ($claimSub !== '' ? $claimSub : 'unknown');
        $actorKey = api_rate_limit_hash('access_request_admin_actor:' . $actorRaw);
        $clientKey = api_rate_limit_client_fingerprint();
        api_rate_limit_enforce(
            'access-requests:admin:actor:' . $actorKey,
            120,
            3600,
            static function (int $retryAfter): void {
                ar_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $retryAfter]);
            }
        );
        api_rate_limit_enforce(
            'access-requests:admin:client:' . $clientKey,
            300,
            3600,
            static function (int $retryAfter): void {
                ar_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $retryAfter]);
            }
        );

        $requestId = trim((string)($body['request_id'] ?? ''));
        if (!ar_uuid($requestId)) {
            ar_json(400, false, 'request_id must be a UUID');
        }

        $pendingRow = ar_load_request_by_id($baseUrl, $serviceKey, $requestId, true);
        if (!$pendingRow) {
            $existingRow = ar_load_request_by_id($baseUrl, $serviceKey, $requestId, false);
            if ($existingRow) {
                ar_json(409, false, 'Request is already processed', ['row' => $existingRow]);
            }
            ar_json(404, false, 'Request not found');
        }

        $reviewNotes = trim((string)($body['review_notes'] ?? $body['note'] ?? ''));

        if ($action === 'reject') {
            $updated = ar_reject_request($baseUrl, $serviceKey, $pendingRow, $reviewNotes, $handlerId);
            ar_json(200, true, 'Access request rejected', ['request' => $updated]);
        }

        $roles = ar_role_list($body['roles'] ?? ['HANDLER']);
        $workflowIds = array_key_exists('workflow_ids', $body)
            ? ar_uuid_list($body['workflow_ids'])
            : null;

        $result = ar_approve_request(
            $baseUrl,
            $serviceKey,
            $pendingRow,
            $roles,
            $workflowIds,
            $reviewNotes,
            $handlerId
        );

        ar_json(200, true, 'Access request approved', $result);
    }

    ar_json(400, false, 'Unsupported action');
} catch (Throwable $e) {
    $errorId = api_log_exception('access-requests.api', $e);
    ar_json(500, false, 'Internal server error', ['error_id' => $errorId]);
}
