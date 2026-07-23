<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_auth0.php';
require_once __DIR__ . '/_admin_auth.php';
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

const ACCESS_REQUESTS_SCOPES_ADMIN_READ = ['admin:users:read', 'admin:users:write', 'read:users', 'write:users', 'manage:users', 'admin:all', 'admin'];
const ACCESS_REQUESTS_SCOPES_ADMIN_WRITE = ['admin:users:write', 'write:users', 'manage:users', 'admin:all', 'admin'];

function ar_json(int $status, bool $success, string $message, array $data = []): void {
    http_response_code($status);
    echo json_encode(array_merge(['success' => $success, 'message' => $message], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function ar_env_optional(string $key, string $default = ''): string { $value = trim((string)(getenv($key) ?: '')); return $value !== '' ? $value : $default; }
function ar_escape_html(string $value): string { return htmlspecialchars($value, ENT_QUOTES, 'UTF-8'); }
function ar_valid_email(string $email): bool { return filter_var(trim($email), FILTER_VALIDATE_EMAIL) !== false; }
function ar_normalize_email(?string $email): string { return strtolower(trim((string)$email)); }
function ar_uuid(string $value): bool { return preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', trim($value)) === 1; }

function ar_uuid4(): string {
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function ar_uuid_list($raw): array {
    $out = [];
    foreach (is_array($raw) ? $raw : [] as $value) {
        $value = trim((string)$value);
        if ($value !== '' && ar_uuid($value) && !in_array($value, $out, true)) $out[] = $value;
    }
    return $out;
}

function ar_role_list($raw): array {
    $items = is_array($raw) ? $raw : (is_string($raw) ? preg_split('/[\s,]+/', trim($raw)) ?: [] : []);
    $roles = [];
    foreach ($items as $item) {
        $value = strtoupper(trim((string)$item));
        if ($value !== '' && preg_match('/^[A-Z0-9_:-]+$/', $value) === 1 && !in_array($value, $roles, true)) $roles[] = $value;
    }
    return $roles ?: ['HANDLER'];
}

function ar_parse_email_list(string $raw): array {
    $out = [];
    foreach (explode(';', str_replace([',', "\n", "\r", "\t"], ';', $raw)) as $item) {
        $email = ar_normalize_email($item);
        if ($email !== '' && ar_valid_email($email) && !in_array($email, $out, true)) $out[] = $email;
    }
    return $out;
}

function ar_decode_json($value, $fallback) {
    if (is_array($value)) return $value;
    if (!is_string($value) || trim($value) === '') return $fallback;
    $decoded = json_decode($value, true);
    return json_last_error() === JSON_ERROR_NONE ? $decoded : $fallback;
}

function ar_sql_normalize_row(array $row): array {
    if (array_key_exists('metadata', $row)) $row['metadata'] = ar_decode_json($row['metadata'], []);
    return $row;
}

function ar_server_base_url(): string {
    $configured = ar_env_optional('PORTAL_BASE_URL', '');
    if ($configured !== '') return rtrim($configured, '/');
    $host = trim((string)($_SERVER['HTTP_HOST'] ?? ''));
    if ($host === '') return '';
    $hostname = strtolower((string)(parse_url('http://' . $host, PHP_URL_HOST) ?: ''));
    if (in_array($hostname, ['localhost', '127.0.0.1', '::1'], true)) return '';
    $isHttps = ((!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') || (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443) || strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https');
    return ($isHttps ? 'https' : 'http') . '://' . $host;
}

function ar_mail_api_url(): string {
    $configured = ar_env_optional('MAIL_API_INTERNAL_URL', '');
    if ($configured !== '') return $configured;
    $base = ar_server_base_url();
    return $base !== '' ? ($base . '/api/mail.api.php') : '';
}

function ar_mail_api_candidate_urls(): array {
    $candidates = [];

    foreach ([ar_env_optional('MAIL_API_INTERNAL_URL', ''), ar_env_optional('PHP_MAIL_API_URL', '')] as $explicit) {
        $url = trim($explicit);
        if ($url !== '' && !in_array($url, $candidates, true)) {
            $candidates[] = $url;
        }
    }

    $base = ar_server_base_url();
    if ($base !== '') {
        $publicUrl = $base . '/api/mail.api.php';
        if (!in_array($publicUrl, $candidates, true)) {
            $candidates[] = $publicUrl;
        }
    }

    $serverPort = (int)($_SERVER['SERVER_PORT'] ?? 0);
    $localPort = ($serverPort > 0 && !in_array($serverPort, [80, 443], true)) ? (':' . $serverPort) : '';
    foreach (['http://127.0.0.1', 'http://localhost'] as $host) {
        $localUrl = $host . $localPort . '/api/mail.api.php';
        if (!in_array($localUrl, $candidates, true)) {
            $candidates[] = $localUrl;
        }
    }

    if (!$candidates) {
        $candidates[] = 'http://127.0.0.1:8081/api/mail.api.php';
    }

    return $candidates;
}

function ar_send_mail(array $to, string $subject, string $html, string $text = '', array $bcc = []): array {
    $to = array_values(array_filter(array_unique(array_map('ar_normalize_email', $to)), 'ar_valid_email'));
    $bcc = array_values(array_filter(array_unique(array_map('ar_normalize_email', $bcc)), 'ar_valid_email'));
    if (!$to) return ['success' => false, 'message' => 'No valid recipient email'];
    $payload = ['to' => $to, 'bcc' => $bcc, 'subject' => trim($subject), 'html' => $html, 'text' => $text !== '' ? $text : strip_tags(str_replace(['<br>', '<br/>', '<br />'], "\n", $html))];
    $errors = [];

    foreach (ar_mail_api_candidate_urls() as $url) {
        $ch = curl_init();
        $curlOptions = [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
            CURLOPT_TIMEOUT => 20,
        ];
        if (function_exists('auth0_apply_ssl_options')) {
            auth0_apply_ssl_options($curlOptions, $url);
        }
        curl_setopt_array($ch, $curlOptions);

        $resp = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = trim((string)curl_error($ch));
        curl_close($ch);

        if ($resp !== false) {
            $decoded = json_decode($resp, true);
            if ($code >= 200 && $code < 300 && is_array($decoded) && !empty($decoded['success'])) {
                return ['success' => true];
            }
            $errors[] = $url . ' -> ' . (is_array($decoded) ? (string)($decoded['message'] ?? 'mail.api error') : ('HTTP ' . $code));
            continue;
        }

        $errors[] = $url . ' -> ' . ($err !== '' ? $err : 'unknown curl error');
    }

    return ['success' => false, 'message' => 'mail.api call failed: ' . implode(' | ', $errors)];
}

function ar_auth_claims(): array {
    $token = auth0_get_bearer_token();
    if ($token === '') ar_json(401, false, 'Authorization token required');
    $claims = auth0_verify_access_token($token, trim((string)(getenv('VITE_AUTH0_DOMAIN') ?: '')), auth0_expected_api_audience(), trim((string)(getenv('VITE_AUTH0_CLIENT_ID') ?: '')));
    if (trim((string)($claims['sub'] ?? '')) === '') ar_json(403, false, 'Invalid authenticated subject');
    return function_exists('api_authz_enrich_identity_claims') ? api_authz_enrich_identity_claims($claims, $token) : $claims;
}

function ar_require_admin_context(array $scopes = []): array {
    return api_authz_require_admin(static function (int $status, string $message): void { ar_json($status, false, $message); }, $scopes);
}

function ar_request_for_identity(string $sub, string $email, ?string $status = null): ?array {
    $row = null;
    if ($sub !== '') {
        $params = ['user_id' => $sub];
        $sql = 'SELECT TOP 1 * FROM dbo.access_requests WHERE user_id = @user_id';
        if ($status !== null) { $sql .= ' AND status = @status'; $params['status'] = $status; }
        $sql .= ' ORDER BY created_at DESC';
        $rows = sqlserver_query($sql, $params);
        $row = $rows[0] ?? null;
    }
    if (!$row && $email !== '') {
        $params = ['email' => $email];
        $sql = 'SELECT TOP 1 * FROM dbo.access_requests WHERE LOWER(email) = LOWER(@email)';
        if ($status !== null) { $sql .= ' AND status = @status'; $params['status'] = $status; }
        $sql .= ' ORDER BY created_at DESC';
        $rows = sqlserver_query($sql, $params);
        $row = $rows[0] ?? null;
    }
    return is_array($row) ? ar_sql_normalize_row($row) : null;
}

function ar_load_request_by_id(string $requestId, bool $pendingOnly = false): ?array {
    $params = ['id' => $requestId];
    $sql = 'SELECT TOP 1 * FROM dbo.access_requests WHERE id = @id';
    if ($pendingOnly) { $sql .= ' AND status = @status'; $params['status'] = 'pending'; }
    $rows = sqlserver_query($sql, $params);
    return !empty($rows[0]) && is_array($rows[0]) ? ar_sql_normalize_row($rows[0]) : null;
}

function ar_default_handler_name(array $request): string {
    $name = trim((string)($request['name'] ?? ''));
    if ($name !== '') return $name;
    $email = trim((string)($request['email'] ?? ''));
    if ($email !== '' && str_contains($email, '@')) {
        $left = trim(str_replace(['.', '_', '-'], ' ', (explode('@', $email)[0] ?? '')));
        if ($left !== '') return ucwords($left);
    }
    return 'Nieuwe gebruiker';
}

function ar_find_handler_for_request(array $request): ?array {
    $sub = trim((string)($request['user_id'] ?? ''));
    $email = ar_normalize_email((string)($request['email'] ?? ''));
    if ($sub !== '') {
        $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.handlers WHERE user_id = @user_id', ['user_id' => $sub]);
        if (!empty($rows[0]) && is_array($rows[0])) return $rows[0];
    }
    if ($email === '') return null;
    $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.handlers WHERE LOWER(email) = LOWER(@email)', ['email' => $email]);
    return !empty($rows[0]) && is_array($rows[0]) ? $rows[0] : null;
}

function ar_update_handler(string $handlerId, array $patch): array {
    $allowed = ['name', 'email', 'user_id', 'picture', 'active', 'roles', 'permissions'];
    $sets = []; $params = ['id' => $handlerId];
    foreach ($allowed as $field) {
        if (!array_key_exists($field, $patch)) continue;
        $sets[] = $field . ' = @' . $field;
        $params[$field] = in_array($field, ['roles', 'permissions'], true) ? json_encode($patch[$field] ?? [], JSON_UNESCAPED_UNICODE) : $patch[$field];
    }
    if (!$sets) throw new Exception('Update handler failed: no valid fields provided');
    $sets[] = 'updated_at = SYSUTCDATETIME()';
    sqlserver_execute('UPDATE dbo.handlers SET ' . implode(', ', $sets) . ' WHERE id = @id', $params);
    $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.handlers WHERE id = @id', ['id' => $handlerId]);
    $row = $rows[0] ?? null;
    if (!$row) throw new Exception('Update handler failed: no row returned');
    return $row;
}

function ar_create_handler(array $payload): array {
    $id = ar_uuid4();
    sqlserver_execute(
        'INSERT INTO dbo.handlers (id, name, email, user_id, picture, active, roles, permissions, created_at, updated_at)
         VALUES (@id, @name, @email, @user_id, @picture, @active, @roles, @permissions, SYSUTCDATETIME(), SYSUTCDATETIME())',
        [
            'id' => $id,
            'name' => $payload['name'] ?? null,
            'email' => $payload['email'] ?? null,
            'user_id' => $payload['user_id'] ?? null,
            'picture' => $payload['picture'] ?? null,
            'active' => !empty($payload['active']),
            'roles' => json_encode($payload['roles'] ?? ['HANDLER'], JSON_UNESCAPED_UNICODE),
            'permissions' => json_encode($payload['permissions'] ?? new stdClass(), JSON_UNESCAPED_UNICODE),
        ]
    );
    $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.handlers WHERE id = @id', ['id' => $id]);
    $row = $rows[0] ?? null;
    if (!$row) throw new Exception('Create handler failed: no row returned');
    return $row;
}

function ar_sync_handler_roles(string $handlerId, array $roleCodes, array &$warnings): void {
    $codes = ar_role_list($roleCodes);
    sqlserver_execute('DELETE FROM dbo.handler_roles WHERE handler_id = @handler_id', ['handler_id' => $handlerId]);
    if (!$codes) return;
    $params = []; $placeholders = [];
    foreach ($codes as $index => $code) {
        $key = 'code_' . $index; $params[$key] = $code; $placeholders[] = '@' . $key;
    }
    $roleRows = sqlserver_query('SELECT id, code FROM dbo.roles WHERE code IN (' . implode(', ', $placeholders) . ')', $params);
    $existingCodes = [];
    foreach ($roleRows as $roleRow) {
        $roleId = trim((string)($roleRow['id'] ?? '')); $roleCode = strtoupper(trim((string)($roleRow['code'] ?? '')));
        if ($roleId === '' || $roleCode === '') continue;
        $existingCodes[] = $roleCode;
        sqlserver_execute('INSERT INTO dbo.handler_roles (handler_id, role_id, created_at) VALUES (@handler_id, @role_id, SYSUTCDATETIME())', ['handler_id' => $handlerId, 'role_id' => $roleId]);
    }
    $missing = array_values(array_diff($codes, $existingCodes));
    if ($missing) $warnings[] = 'Deze rollen bestaan nog niet in SQL Server en zijn overgeslagen: ' . implode(', ', $missing);
}

function ar_sync_handler_workflows(string $handlerId, ?array $workflowIds, array &$warnings): void {
    if ($workflowIds === null) return;
    $workflowIds = ar_uuid_list($workflowIds);
    sqlserver_execute('DELETE FROM dbo.handler_workflows WHERE handler_id = @handler_id', ['handler_id' => $handlerId]);
    if (!$workflowIds) return;
    $params = []; $placeholders = [];
    foreach ($workflowIds as $index => $workflowId) {
        $key = 'workflow_' . $index; $params[$key] = $workflowId; $placeholders[] = '@' . $key;
    }
    $workflowRows = sqlserver_query('SELECT id FROM dbo.workflows WHERE id IN (' . implode(', ', $placeholders) . ')', $params);
    $existingIds = array_values(array_filter(array_map(static fn($row) => trim((string)($row['id'] ?? '')), $workflowRows)));
    foreach ($existingIds as $workflowId) {
        sqlserver_execute('INSERT INTO dbo.handler_workflows (handler_id, workflow_id, created_at) VALUES (@handler_id, @workflow_id, SYSUTCDATETIME())', ['handler_id' => $handlerId, 'workflow_id' => $workflowId]);
    }
    if (array_diff($workflowIds, $existingIds)) $warnings[] = 'Deze workflows bestaan niet meer in SQL Server en zijn overgeslagen.';
}

function ar_notify_admins_about_new_request(array $requestRow): array {
    $recipients = ar_parse_email_list(ar_env_optional('ACCESS_REQUEST_ADMIN_EMAILS', ''));
    $rows = sqlserver_query('SELECT id, name, email, active, roles, permissions FROM dbo.handlers WHERE active = @active ORDER BY name ASC', ['active' => true]);
    foreach ($rows as $row) {
        if (!is_array($row) || !api_authz_is_admin($row)) continue;
        $email = ar_normalize_email((string)($row['email'] ?? ''));
        if ($email !== '' && ar_valid_email($email) && !in_array($email, $recipients, true)) $recipients[] = $email;
    }
    if (!$recipients) return ['success' => false, 'message' => 'No admin email recipients configured'];
    $portalBase = ar_server_base_url(); $adminUrl = $portalBase !== '' ? ($portalBase . '/settings?mode=admin') : '';
    $name = trim((string)($requestRow['name'] ?? '')) ?: 'Onbekend';
    $email = trim((string)($requestRow['email'] ?? '')) ?: '-';
    $userId = trim((string)($requestRow['user_id'] ?? '')) ?: '-';
    $requestedAt = trim((string)($requestRow['created_at'] ?? '')) ?: (new DateTimeImmutable('now'))->format(DateTime::ATOM);
    $message = trim((string)($requestRow['request_message'] ?? ''));
    $html = '<h2>Nieuwe toegangsaanvraag</h2><p>Er is een nieuwe aanvraag voor portal-toegang ingediend.</p><ul><li><strong>Naam:</strong> ' . ar_escape_html($name) . '</li><li><strong>E-mail:</strong> ' . ar_escape_html($email) . '</li><li><strong>User ID:</strong> <code>' . ar_escape_html($userId) . '</code></li><li><strong>Aangevraagd op:</strong> ' . ar_escape_html($requestedAt) . '</li></ul>';
    if ($message !== '') $html .= '<p><strong>Toelichting van gebruiker:</strong></p><blockquote style="border-left:3px solid #d1d5db;padding-left:10px;margin:0;">' . nl2br(ar_escape_html($message)) . '</blockquote>';
    if ($adminUrl !== '') $html .= '<p><a href="' . ar_escape_html($adminUrl) . '">Open beheercentrum om aanvraag te beoordelen</a></p>';
    return ar_send_mail([array_shift($recipients)], 'Nieuwe toegangsaanvraag - Misstanden Portal', $html, '', $recipients);
}

function ar_notify_requester_decision(array $requestRow, string $decision): array {
    $email = ar_normalize_email((string)($requestRow['email'] ?? ''));
    if ($email === '' || !ar_valid_email($email)) return ['success' => false, 'message' => 'Requester email not available'];
    $name = trim((string)($requestRow['name'] ?? '')) ?: 'gebruiker';
    $reviewNotes = trim((string)($requestRow['review_notes'] ?? ''));
    $portalBase = ar_server_base_url(); $loginUrl = $portalBase !== '' ? ($portalBase . '/handler-dashboard') : '';
    if ($decision === 'approved') {
        $html = '<h2>Toegang goedgekeurd</h2><p>Beste ' . ar_escape_html($name) . ',</p><p>Uw aanvraag voor toegang tot Misstanden Portal is goedgekeurd.</p><p>U kunt nu inloggen met uw bestaande OAuth-account.</p>';
        if ($reviewNotes !== '') $html .= '<p><strong>Opmerking beheerder:</strong><br>' . nl2br(ar_escape_html($reviewNotes)) . '</p>';
        if ($loginUrl !== '') $html .= '<p><a href="' . ar_escape_html($loginUrl) . '">Open Misstanden Portal</a></p>';
        return ar_send_mail([$email], 'Uw toegangsaanvraag is goedgekeurd', $html);
    }
    $html = '<h2>Toegang afgewezen</h2><p>Beste ' . ar_escape_html($name) . ',</p><p>Uw aanvraag voor toegang tot Misstanden Portal is afgewezen.</p><p>Neem contact op met uw systeembeheerder voor meer informatie.</p>';
    if ($reviewNotes !== '') $html .= '<p><strong>Opmerking beheerder:</strong><br>' . nl2br(ar_escape_html($reviewNotes)) . '</p>';
    return ar_send_mail([$email], 'Uw toegangsaanvraag is afgewezen', $html);
}

function ar_approve_request(array $requestRow, array $roles, ?array $workflowIds, string $reviewNotes, string $reviewedBy): array {
    $requestMetadata = is_array($requestRow['metadata'] ?? null) ? $requestRow['metadata'] : [];
    $requestSource = strtolower(trim((string)($requestMetadata['source'] ?? '')));
    $rawRequestUserId = trim((string)($requestRow['user_id'] ?? ''));
    $requestUserId = ($requestSource === 'admin_grant' && str_starts_with($rawRequestUserId, 'admin-grant:')) ? '' : $rawRequestUserId;
    $warnings = []; $handler = ar_find_handler_for_request($requestRow);
    if ($handler) {
        $finalRoles = $roles ?: ar_role_list($handler['roles'] ?? []);
        $patch = ['active' => true, 'roles' => $finalRoles];
        if (trim((string)($handler['user_id'] ?? '')) === '' && $requestUserId !== '') $patch['user_id'] = $requestUserId;
        if (ar_normalize_email((string)($handler['email'] ?? '')) === '' && ar_normalize_email((string)($requestRow['email'] ?? '')) !== '') $patch['email'] = ar_normalize_email((string)$requestRow['email']);
        if (trim((string)($handler['name'] ?? '')) === '') $patch['name'] = ar_default_handler_name($requestRow);
        if (trim((string)($handler['picture'] ?? '')) === '' && trim((string)($requestRow['picture'] ?? '')) !== '') $patch['picture'] = trim((string)$requestRow['picture']);
        $handler = ar_update_handler((string)$handler['id'], $patch);
    } else {
        $handler = ar_create_handler(['name' => ar_default_handler_name($requestRow), 'email' => ar_normalize_email((string)($requestRow['email'] ?? '')) ?: null, 'user_id' => $requestUserId !== '' ? $requestUserId : null, 'picture' => trim((string)($requestRow['picture'] ?? '')) ?: null, 'active' => true, 'roles' => $roles ?: ['HANDLER'], 'permissions' => new stdClass()]);
    }
    $handlerId = trim((string)($handler['id'] ?? ''));
    if ($handlerId === '' || !ar_uuid($handlerId)) throw new Exception('Approved handler missing valid id');
    ar_sync_handler_roles($handlerId, ar_role_list($handler['roles'] ?? $roles), $warnings);
    ar_sync_handler_workflows($handlerId, $workflowIds, $warnings);
    sqlserver_execute(
        'UPDATE dbo.access_requests SET status = @status, review_notes = @review_notes, reviewed_at = @reviewed_at, reviewed_by = @reviewed_by, created_handler_id = @created_handler_id, updated_at = SYSUTCDATETIME() WHERE id = @id',
        ['status' => 'approved', 'review_notes' => $reviewNotes !== '' ? $reviewNotes : null, 'reviewed_at' => (new DateTimeImmutable('now'))->format(DateTime::ATOM), 'reviewed_by' => ar_uuid($reviewedBy) ? $reviewedBy : null, 'created_handler_id' => $handlerId, 'id' => (string)$requestRow['id']]
    );
    $updatedRequest = ar_load_request_by_id((string)$requestRow['id'], false);
    if (!$updatedRequest) throw new Exception('Approve access request failed: no updated request returned');
    return ['request' => $updatedRequest, 'handler' => $handler, 'warnings' => $warnings];
}

function ar_reject_request(array $requestRow, string $reviewNotes, string $reviewedBy): array {
    sqlserver_execute(
        'UPDATE dbo.access_requests SET status = @status, review_notes = @review_notes, reviewed_at = @reviewed_at, reviewed_by = @reviewed_by, updated_at = SYSUTCDATETIME() WHERE id = @id',
        ['status' => 'rejected', 'review_notes' => $reviewNotes !== '' ? $reviewNotes : null, 'reviewed_at' => (new DateTimeImmutable('now'))->format(DateTime::ATOM), 'reviewed_by' => ar_uuid($reviewedBy) ? $reviewedBy : null, 'id' => (string)$requestRow['id']]
    );
    $row = ar_load_request_by_id((string)$requestRow['id'], false);
    if (!$row) throw new Exception('Reject access request failed: no updated request returned');
    return $row;
}

function ar_create_admin_grant_request(string $email, string $name, string $userId, string $picture, string $reviewNotes, string $reviewedBy, array $roles): array {
    $requestId = ar_uuid4();
    $syntheticUserId = $userId !== '' ? $userId : ('admin-grant:' . $email);
    sqlserver_execute(
        'INSERT INTO dbo.access_requests (id, user_id, email, name, picture, status, request_message, metadata, created_at, updated_at)
         VALUES (@id, @user_id, @email, @name, @picture, @status, @request_message, @metadata, SYSUTCDATETIME(), SYSUTCDATETIME())',
        [
            'id' => $requestId,
            'user_id' => $syntheticUserId,
            'email' => $email !== '' ? $email : null,
            'name' => $name !== '' ? $name : null,
            'picture' => $picture !== '' ? $picture : null,
            'status' => 'pending',
            'request_message' => null,
            'metadata' => json_encode([
                'source' => 'admin_grant',
                'review_notes' => $reviewNotes,
                'reviewed_by' => ar_uuid($reviewedBy) ? $reviewedBy : null,
                'granted_roles' => array_values(ar_role_list($roles)),
            ], JSON_UNESCAPED_UNICODE),
        ]
    );
    $row = ar_load_request_by_id($requestId, false);
    if (!$row) throw new Exception('Create admin grant request failed: no row returned');
    return $row;
}

try {
    load_runtime_env(__DIR__);
    if (!sqlserver_is_configured()) throw new Exception('SQL Server is not configured');

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        api_apply_no_store_headers();
        $action = trim((string)($_GET['action'] ?? 'my'));

        if ($action === 'my') {
            $claims = ar_auth_claims();
            $sub = trim((string)($claims['sub'] ?? ''));
            $email = ar_normalize_email((string)($claims['email'] ?? ''));
            ar_json(200, true, 'Access request status loaded', ['row' => ar_request_for_identity($sub, $email, null)]);
        }

        if ($action === 'list') {
            ar_require_admin_context(ACCESS_REQUESTS_SCOPES_ADMIN_READ);
            $status = strtolower(trim((string)($_GET['status'] ?? 'pending')));
            if (!in_array($status, ['pending', 'approved', 'rejected', 'cancelled', 'all'], true)) ar_json(400, false, 'Invalid status filter');
            $limit = isset($_GET['limit']) && is_numeric($_GET['limit']) ? max(1, min(500, (int)$_GET['limit'])) : 100;
            $params = ['limit' => $limit];
            $sql = 'SELECT TOP (@limit) * FROM dbo.access_requests';
            if ($status !== 'all') { $sql .= ' WHERE status = @status'; $params['status'] = $status; }
            $sql .= ' ORDER BY created_at DESC';
            $rows = array_map('ar_sql_normalize_row', sqlserver_query($sql, $params));
            $countRows = sqlserver_query('SELECT status, COUNT(*) AS total FROM dbo.access_requests GROUP BY status');
            $counts = ['pending' => 0, 'approved' => 0, 'rejected' => 0, 'cancelled' => 0];
            foreach ($countRows as $countRow) {
                $key = strtolower(trim((string)($countRow['status'] ?? '')));
                if (array_key_exists($key, $counts)) $counts[$key] = (int)($countRow['total'] ?? 0);
            }
            ar_json(200, true, 'Access requests loaded', ['rows' => $rows, 'count' => count($rows), 'counts' => $counts]);
        }

        ar_json(400, false, 'Unsupported action');
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') ar_json(405, false, 'Method not allowed');

    $body = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($body)) $body = [];
    $action = strtolower(trim((string)($body['action'] ?? '')));

    if ($action === 'request_access') {
        $claims = ar_auth_claims();
        $sub = trim((string)($claims['sub'] ?? ''));
        $email = ar_normalize_email((string)($claims['email'] ?? ''));
        $name = trim((string)($claims['name'] ?? ''));
        $picture = trim((string)($claims['picture'] ?? ''));
        $message = trim((string)($body['request_message'] ?? $body['message'] ?? ''));
        if (function_exists('mb_strlen') && mb_strlen($message, 'UTF-8') > 1000) $message = (string)mb_substr($message, 0, 1000, 'UTF-8');
        elseif (strlen($message) > 1000) $message = substr($message, 0, 1000);

        $actorKey = api_rate_limit_hash('access_request_actor:' . $sub);
        $clientKey = api_rate_limit_client_fingerprint();
        api_rate_limit_enforce('access-requests:create:actor:' . $actorKey, 8, 3600, static function (int $retryAfter): void { ar_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $retryAfter]); });
        api_rate_limit_enforce('access-requests:create:client:' . $clientKey, 30, 3600, static function (int $retryAfter): void { ar_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $retryAfter]); });

        $pending = ar_request_for_identity($sub, $email, 'pending');
        if ($pending) ar_json(200, true, 'Access request already pending', ['row' => $pending, 'pending_exists' => true]);

        $requestId = ar_uuid4();
        sqlserver_execute(
            'INSERT INTO dbo.access_requests (id, user_id, email, name, picture, status, request_message, metadata, created_at, updated_at)
             VALUES (@id, @user_id, @email, @name, @picture, @status, @request_message, @metadata, SYSUTCDATETIME(), SYSUTCDATETIME())',
            ['id' => $requestId, 'user_id' => $sub, 'email' => $email !== '' ? $email : null, 'name' => $name !== '' ? $name : null, 'picture' => $picture !== '' ? $picture : null, 'status' => 'pending', 'request_message' => $message !== '' ? $message : null, 'metadata' => json_encode(['source' => 'no_access_page'], JSON_UNESCAPED_UNICODE)]
        );
        $created = ar_load_request_by_id($requestId, false);
        if (!$created) throw new Exception('Create access request failed: no row returned');
        $warnings = [];
        try {
            $mailResult = ar_notify_admins_about_new_request($created);
            if (empty($mailResult['success'])) $warnings[] = 'Aanvraag opgeslagen, maar admin e-mailmelding is niet verstuurd: ' . (string)($mailResult['message'] ?? 'unknown');
        } catch (Throwable $mailErr) {
            $warnings[] = 'Aanvraag opgeslagen, maar admin e-mailmelding is mislukt.';
        }
        ar_json(200, true, 'Access request submitted', ['row' => $created, 'pending_exists' => false, 'warnings' => $warnings]);
    }

    if ($action === 'approve' || $action === 'reject') {
        $ctx = ar_require_admin_context(ACCESS_REQUESTS_SCOPES_ADMIN_WRITE);
        $handlerId = trim((string)($ctx['handler']['id'] ?? ''));
        $claimSub = trim((string)($ctx['claims']['sub'] ?? ''));
        $actorRaw = $handlerId !== '' ? $handlerId : ($claimSub !== '' ? $claimSub : 'unknown');
        $actorKey = api_rate_limit_hash('access_request_admin_actor:' . $actorRaw);
        $clientKey = api_rate_limit_client_fingerprint();
        api_rate_limit_enforce('access-requests:admin:actor:' . $actorKey, 120, 3600, static function (int $retryAfter): void { ar_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $retryAfter]); });
        api_rate_limit_enforce('access-requests:admin:client:' . $clientKey, 300, 3600, static function (int $retryAfter): void { ar_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $retryAfter]); });

        $requestId = trim((string)($body['request_id'] ?? ''));
        if (!ar_uuid($requestId)) ar_json(400, false, 'request_id must be a UUID');
        $pendingRow = ar_load_request_by_id($requestId, true);
        if (!$pendingRow) {
            $existingRow = ar_load_request_by_id($requestId, false);
            if ($existingRow) ar_json(409, false, 'Request is already processed', ['row' => $existingRow]);
            ar_json(404, false, 'Request not found');
        }
        $reviewNotes = trim((string)($body['review_notes'] ?? $body['note'] ?? ''));

        if ($action === 'reject') {
            $updated = ar_reject_request($pendingRow, $reviewNotes, $handlerId);
            $warnings = [];
            try {
                $mailResult = ar_notify_requester_decision($updated, 'rejected');
                if (empty($mailResult['success'])) $warnings[] = 'Aanvraag afgewezen, maar e-mail aan gebruiker is niet verstuurd: ' . (string)($mailResult['message'] ?? 'unknown');
            } catch (Throwable $mailErr) {
                $warnings[] = 'Aanvraag afgewezen, maar e-mail aan gebruiker is mislukt.';
            }
            ar_json(200, true, 'Access request rejected', ['request' => $updated, 'warnings' => $warnings]);
        }

        $result = ar_approve_request($pendingRow, ar_role_list($body['roles'] ?? ['HANDLER']), array_key_exists('workflow_ids', $body) ? ar_uuid_list($body['workflow_ids']) : null, $reviewNotes, $handlerId);
        try {
            $mailResult = ar_notify_requester_decision($result['request'] ?? $pendingRow, 'approved');
            if (empty($mailResult['success'])) $result['warnings'][] = 'Aanvraag goedgekeurd, maar e-mail aan gebruiker is niet verstuurd: ' . (string)($mailResult['message'] ?? 'unknown');
        } catch (Throwable $mailErr) {
            $result['warnings'][] = 'Aanvraag goedgekeurd, maar e-mail aan gebruiker is mislukt.';
        }
        ar_json(200, true, 'Access request approved', $result);
    }

    if ($action === 'grant_access') {
        $ctx = ar_require_admin_context(ACCESS_REQUESTS_SCOPES_ADMIN_WRITE);
        $handlerId = trim((string)($ctx['handler']['id'] ?? ''));
        $claimSub = trim((string)($ctx['claims']['sub'] ?? ''));
        $actorRaw = $handlerId !== '' ? $handlerId : ($claimSub !== '' ? $claimSub : 'unknown');
        $actorKey = api_rate_limit_hash('access_request_admin_actor:' . $actorRaw);
        $clientKey = api_rate_limit_client_fingerprint();
        api_rate_limit_enforce('access-requests:admin:actor:' . $actorKey, 120, 3600, static function (int $retryAfter): void { ar_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $retryAfter]); });
        api_rate_limit_enforce('access-requests:admin:client:' . $clientKey, 300, 3600, static function (int $retryAfter): void { ar_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $retryAfter]); });

        $email = ar_normalize_email((string)($body['email'] ?? ''));
        if ($email === '' || !ar_valid_email($email)) ar_json(400, false, 'A valid email address is required');

        $name = trim((string)($body['name'] ?? ''));
        $userId = trim((string)($body['user_id'] ?? ''));
        $picture = trim((string)($body['picture'] ?? ''));
        $reviewNotes = trim((string)($body['review_notes'] ?? $body['note'] ?? ''));
        $roles = ar_role_list($body['roles'] ?? ['HANDLER']);
        $workflowIds = array_key_exists('workflow_ids', $body) ? ar_uuid_list($body['workflow_ids']) : null;

        if ($userId === '' && function_exists('api_authz_fetch_auth0_user_by_email')) {
            $auth0User = api_authz_fetch_auth0_user_by_email($email);
            if (is_array($auth0User) && !empty($auth0User['user_id'])) {
                $userId = trim((string)$auth0User['user_id']);
                if ($name === '') $name = trim((string)($auth0User['name'] ?? ''));
                if ($picture === '') $picture = trim((string)($auth0User['picture'] ?? ''));
            }
        }

        $pendingRow = ar_request_for_identity($userId, $email, 'pending');
        $createdRequest = false;
        if (!$pendingRow) {
            $pendingRow = ar_create_admin_grant_request($email, $name, $userId, $picture, $reviewNotes, $handlerId, $roles);
            $createdRequest = true;
        }

        $result = ar_approve_request($pendingRow, $roles, $workflowIds, $reviewNotes, $handlerId);
        try {
            $mailResult = ar_notify_requester_decision($result['request'] ?? $pendingRow, 'approved');
            if (empty($mailResult['success'])) $result['warnings'][] = 'Toegang verleend, maar e-mail aan gebruiker is niet verstuurd: ' . (string)($mailResult['message'] ?? 'unknown');
        } catch (Throwable $mailErr) {
            $result['warnings'][] = 'Toegang verleend, maar e-mail aan gebruiker is mislukt.';
        }

        ar_json(200, true, 'Access granted', array_merge($result, ['created_request' => $createdRequest]));
    }

    ar_json(400, false, 'Unsupported action');
} catch (Throwable $e) {
    $errorId = api_log_exception('access-requests.api', $e);
    ar_json(500, false, 'Internal server error', ['error_id' => $errorId]);
}
