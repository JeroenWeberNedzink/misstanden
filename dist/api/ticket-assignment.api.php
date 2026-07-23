<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_ticket_crypto.php';
require_once __DIR__ . '/_admin_auth.php';
require_once __DIR__ . '/_errors.php';
require_once __DIR__ . '/_security_headers.php';
require_once __DIR__ . '/_sqlserver.php';

api_apply_security_headers([
    'allow_methods' => 'POST, OPTIONS',
    'allow_headers' => 'Content-Type, Authorization',
]);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'OK'], JSON_UNESCAPED_UNICODE);
    exit;
}

function ticket_assignment_json(int $status, bool $success, string $message, array $data = []): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge([
        'success' => $success,
        'message' => $message,
    ], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function ticket_assignment_uuid_list(array $values): array {
    $out = [];
    foreach ($values as $value) {
        $id = trim((string)$value);
        if ($id === '' || !preg_match('/^[0-9a-f-]{36}$/i', $id)) continue;
        if (!in_array($id, $out, true)) $out[] = $id;
    }
    return $out;
}

function ticket_assignment_role(string $value, string $fallback = 'secondary'): string {
    $role = strtolower(trim($value));
    return in_array($role, ['primary', 'secondary', 'legal', 'observer'], true) ? $role : $fallback;
}

function ticket_assignment_parse_json($value, $fallback = []) {
    if (is_array($value)) return $value;
    if (!is_string($value) || trim($value) === '') return $fallback;
    $decoded = json_decode($value, true);
    return json_last_error() === JSON_ERROR_NONE ? $decoded : $fallback;
}

function ticket_assignment_handler(array $row, string $prefix = 'handler_'): ?array {
    $id = trim((string)($row[$prefix . 'id'] ?? ''));
    if ($id === '') return null;

    return [
        'id' => $id,
        'name' => $row[$prefix . 'name'] ?? null,
        'email' => $row[$prefix . 'email'] ?? null,
        'roles' => ticket_assignment_parse_json($row[$prefix . 'roles'] ?? null, []),
        'active' => isset($row[$prefix . 'active']) ? (bool)$row[$prefix . 'active'] : null,
    ];
}

function ticket_assignment_ticket(array $row): array {
    $ticket = ticket_crypto_decrypt_ticket_row($row, true);
    $ticket['metadata'] = ticket_assignment_parse_json($row['metadata'] ?? null, []);
    $ticket['email_notify'] = isset($row['email_notify']) ? (bool)$row['email_notify'] : false;
    $ticket['status_email_notify'] = isset($row['status_email_notify']) ? (bool)$row['status_email_notify'] : true;
    $ticket['is_anonymous'] = isset($row['is_anonymous']) ? (bool)$row['is_anonymous'] : false;
    $ticket['handlers'] = ticket_assignment_handler($row);
    unset(
        $ticket['handler_name'],
        $ticket['handler_email'],
        $ticket['handler_roles'],
        $ticket['handler_active']
    );
    return $ticket;
}

function ticket_assignment_ticket_handlers_from_rows(array $rows): array {
    return array_values(array_map(static function (array $row): array {
        return [
            'id' => $row['id'] ?? null,
            'ticket_id' => $row['ticket_id'] ?? null,
            'handler_id' => $row['handler_id'] ?? null,
            'role' => $row['role'] ?? null,
            'assigned_at' => $row['assigned_at'] ?? null,
            'created_at' => $row['created_at'] ?? null,
            'handler' => [
                'id' => $row['handler_id_ref'] ?? null,
                'name' => $row['handler_name'] ?? null,
                'email' => $row['handler_email'] ?? null,
                'roles' => ticket_assignment_parse_json($row['handler_roles'] ?? null, []),
                'active' => isset($row['handler_active']) ? (bool)$row['handler_active'] : null,
            ],
        ];
    }, $rows));
}

function ticket_assignment_decode_id_list($raw): array {
    $decoded = ticket_assignment_parse_json($raw, []);
    if (!is_array($decoded)) {
        return [];
    }

    $out = [];
    foreach ($decoded as $item) {
        $id = trim((string)(is_array($item) ? ($item['id'] ?? '') : $item));
        if ($id === '' || !preg_match('/^[0-9a-f-]{36}$/i', $id)) {
            continue;
        }
        if (!in_array($id, $out, true)) {
            $out[] = $id;
        }
    }

    return $out;
}

function ticket_assignment_strlen(string $value): int {
    return function_exists('mb_strlen') ? (int)mb_strlen($value, 'UTF-8') : (int)strlen($value);
}

function ticket_assignment_substr(string $value, int $start, ?int $length = null): string {
    if (function_exists('mb_substr')) {
        return $length === null
            ? (string)mb_substr($value, $start, null, 'UTF-8')
            : (string)mb_substr($value, $start, $length, 'UTF-8');
    }
    return $length === null ? (string)substr($value, $start) : (string)substr($value, $start, $length);
}

function ticket_assignment_valid_email(string $email): bool {
    return filter_var(trim($email), FILTER_VALIDATE_EMAIL) !== false;
}

function ticket_assignment_normalize_email(?string $email): string {
    return strtolower(trim((string)$email));
}

function ticket_assignment_escape_html($value): string {
    return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
}

function ticket_assignment_nl2br($value): string {
    return nl2br(ticket_assignment_escape_html((string)$value), false);
}

function ticket_assignment_env_optional(string $key, string $default = ''): string {
    $value = trim((string)(getenv($key) ?: ''));
    return $value !== '' ? $value : $default;
}

function ticket_assignment_parse_bool_env(string $value): bool {
    return in_array(strtolower(trim($value)), ['1', 'true', 'yes', 'on'], true);
}

function ticket_assignment_setting_unwrap_value($raw) {
    return is_array($raw) && array_key_exists('value', $raw) ? $raw['value'] : $raw;
}

function ticket_assignment_system_settings_cache_file(): string {
    $dir = sqlserver_project_root() . DIRECTORY_SEPARATOR . 'run' . DIRECTORY_SEPARATOR . 'cache';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    return $dir . DIRECTORY_SEPARATOR . 'ticket-system-settings.json';
}

function ticket_assignment_load_system_settings(): array {
    static $cache = null;
    if (is_array($cache)) return $cache;

    $cacheTtl = max(5, (int)(getenv('TICKET_SETTINGS_CACHE_TTL_SECONDS') ?: 60));
    $cacheFile = ticket_assignment_system_settings_cache_file();
    if (is_file($cacheFile) && (time() - (int)@filemtime($cacheFile)) <= $cacheTtl) {
        $raw = @file_get_contents($cacheFile);
        $decoded = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
        if (is_array($decoded)) {
            $cache = $decoded;
            return $cache;
        }
    }

    $cache = [];
    foreach (sqlserver_query('SELECT setting_key, setting_value FROM dbo.system_settings ORDER BY setting_key ASC') as $row) {
        $key = trim((string)($row['setting_key'] ?? ''));
        if ($key === '') continue;
        $cache[$key] = ticket_assignment_setting_unwrap_value(ticket_assignment_parse_json($row['setting_value'] ?? null, $row['setting_value'] ?? null));
    }
    @file_put_contents($cacheFile, json_encode($cache, JSON_UNESCAPED_UNICODE), LOCK_EX);
    return $cache;
}

function ticket_assignment_setting_value(array $settings, array $aliases, $default = null) {
    foreach ($aliases as $key) {
        if (array_key_exists($key, $settings)) return $settings[$key];
    }
    return $default;
}

function ticket_assignment_setting_bool(array $settings, array $aliases, bool $default = false): bool {
    $raw = ticket_assignment_setting_value($settings, $aliases, $default);
    if (is_bool($raw)) return $raw;
    $value = strtolower(trim((string)$raw));
    if (in_array($value, ['true', '1', 'yes', 'ja', 'on'], true)) return true;
    if (in_array($value, ['false', '0', 'no', 'nee', 'off'], true)) return false;
    return $default;
}

function ticket_assignment_normalize_workflow_scope(string $workflowType): string {
    $value = preg_replace('/[^a-z0-9_]+/', '_', strtolower(trim($workflowType))) ?? '';
    return trim($value, '_');
}

function ticket_assignment_workflow_scoped_setting_key(string $workflowType, string $workflowSettingKey): ?string {
    $scope = ticket_assignment_normalize_workflow_scope($workflowType);
    if ($scope === '' || !str_starts_with($workflowSettingKey, 'workflow.')) return null;
    $suffix = substr($workflowSettingKey, 9);
    return $suffix ? ('workflow.' . $scope . '.' . $suffix) : null;
}

function ticket_assignment_setting_bool_for_workflow(array $settings, string $workflowType, array $aliases, bool $default = false): bool {
    $keys = [];
    foreach ($aliases as $alias) {
        $scoped = ticket_assignment_workflow_scoped_setting_key($workflowType, trim((string)$alias));
        if ($scoped !== null) $keys[] = $scoped;
        $keys[] = $alias;
    }
    return ticket_assignment_setting_bool($settings, $keys, $default);
}

function ticket_assignment_server_base_url(): string {
    $configured = ticket_assignment_env_optional('PORTAL_BASE_URL', '');
    if ($configured !== '') return rtrim($configured, '/');
    $host = trim((string)($_SERVER['HTTP_HOST'] ?? ''));
    if ($host === '') return '';
    $hostname = strtolower((string)(parse_url('http://' . $host, PHP_URL_HOST) ?: ''));
    if (in_array($hostname, ['localhost', '127.0.0.1', '::1'], true)) return '';
    $isHttps =
        (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off')
        || (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443)
        || strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
    return ($isHttps ? 'https' : 'http') . '://' . $host;
}

function ticket_assignment_mail_api_candidate_urls(): array {
    $candidates = [];
    foreach ([ticket_assignment_env_optional('MAIL_API_INTERNAL_URL', ''), ticket_assignment_env_optional('PHP_MAIL_API_URL', '')] as $explicit) {
        if ($explicit !== '' && !in_array($explicit, $candidates, true)) {
            $candidates[] = $explicit;
        }
    }
    $base = ticket_assignment_server_base_url();
    if ($base !== '') {
        $candidates[] = $base . '/api/mail.api.php';
    }
    $serverPort = (int)($_SERVER['SERVER_PORT'] ?? 0);
    $localPort = ($serverPort > 0 && !in_array($serverPort, [80, 443], true)) ? (':' . $serverPort) : '';
    foreach (['http://127.0.0.1', 'http://localhost'] as $host) {
        $url = $host . $localPort . '/api/mail.api.php';
        if (!in_array($url, $candidates, true)) {
            $candidates[] = $url;
        }
    }
    return $candidates ?: ['http://127.0.0.1:8081/api/mail.api.php'];
}

function ticket_assignment_mail_outbox_write(array $to, string $subject, string $html, string $text = '', array $bcc = []): array {
    $outbox = ticket_assignment_env_optional('MAIL_OUTBOX_DIR', __DIR__ . '/outbox');
    if (!is_dir($outbox) && !@mkdir($outbox, 0755, true) && !is_dir($outbox)) {
        return ['success' => false, 'message' => 'Unable to create mail outbox'];
    }
    $id = date('Ymd_His') . '_' . bin2hex(random_bytes(4));
    $file = rtrim($outbox, '/\\') . DIRECTORY_SEPARATOR . "mail_{$id}.json";
    $payload = [
        'id' => $id,
        'ts' => date('c'),
        'from' => ticket_assignment_env_optional('MAIL_DEFAULT_FROM', 'noreply@nedzink.nl'),
        'to' => $to,
        'cc' => [],
        'bcc' => $bcc,
        'subject' => $subject,
        'html' => $html,
        'text' => $text !== '' ? $text : strip_tags(str_replace(['<br>', '<br/>', '<br />'], "\n", $html)),
        'note' => 'DEV SINK enabled: email not sent via SMTP',
    ];
    @file_put_contents($file, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    return ['success' => true, 'outbox_file' => $file];
}

function ticket_assignment_is_local_mail_api_self_call(string $url): bool {
    if (PHP_SAPI !== 'cli-server') return false;
    $parts = parse_url($url);
    if (!is_array($parts)) return false;
    $host = strtolower(trim((string)($parts['host'] ?? '')));
    if (!in_array($host, ['127.0.0.1', 'localhost', '::1'], true)) return false;
    $port = (int)($parts['port'] ?? 0);
    $serverPort = (int)($_SERVER['SERVER_PORT'] ?? 0);
    return $port > 0 && $serverPort > 0 && $port === $serverPort;
}

function ticket_assignment_send_mail(array $to, string $subject, string $html, string $text = '', array $bcc = []): array {
    $to = array_values(array_filter(array_unique(array_map('ticket_assignment_normalize_email', $to)), 'ticket_assignment_valid_email'));
    $bcc = array_values(array_filter(array_unique(array_map('ticket_assignment_normalize_email', $bcc)), 'ticket_assignment_valid_email'));
    if (!$to) return ['success' => false, 'message' => 'No valid recipient email'];

    if (ticket_assignment_parse_bool_env(ticket_assignment_env_optional('MAIL_DEV_SINK', 'false'))) {
        return ticket_assignment_mail_outbox_write($to, $subject, $html, $text, $bcc);
    }

    if (!function_exists('curl_init')) {
        return ['success' => false, 'message' => 'cURL is not available for mail API call'];
    }

    $payload = [
        'to' => $to,
        'bcc' => $bcc,
        'subject' => trim($subject),
        'html' => $html,
        'text' => $text !== '' ? $text : strip_tags(str_replace(['<br>', '<br/>', '<br />'], "\n", $html)),
    ];
    $errors = [];

    foreach (ticket_assignment_mail_api_candidate_urls() as $url) {
        $isLocalSelfCall = ticket_assignment_is_local_mail_api_self_call($url);
        $ch = curl_init();
        $options = [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
            CURLOPT_TIMEOUT => $isLocalSelfCall ? 1 : 12,
        ];
        if ($isLocalSelfCall) {
            $options[CURLOPT_TIMEOUT_MS] = 250;
            $options[CURLOPT_CONNECTTIMEOUT_MS] = 250;
        }
        if (function_exists('auth0_apply_ssl_options')) {
            auth0_apply_ssl_options($options, $url);
        }
        curl_setopt_array($ch, $options);
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
        if ($isLocalSelfCall && stripos($err, 'timed out') !== false) {
            return ['success' => true, 'queued' => true, 'message' => 'Mail API queued on local PHP server'];
        }
        $errors[] = $url . ' -> ' . ($err !== '' ? $err : 'unknown curl error');
    }

    return ['success' => false, 'message' => 'mail.api call failed: ' . implode(' | ', $errors)];
}

function ticket_assignment_severity_label(string $severityCode): string {
    $map = ['critical' => 'Kritiek', 'high' => 'Hoog', 'medium' => 'Gemiddeld', 'low' => 'Laag'];
    return $map[strtolower(trim($severityCode))] ?? ucfirst($severityCode);
}

function ticket_assignment_severity_level(string $severityCode): int {
    $map = ['critical' => 4, 'high' => 3, 'medium' => 2, 'low' => 1];
    return $map[strtolower(trim($severityCode))] ?? 2;
}

function ticket_assignment_email_event_enabled_for_handlers(string $eventCode): bool {
    try {
        $rows = sqlserver_query(
            'SELECT TOP 1
                ISNULL(eas.is_enabled, et.enabled_by_default) AS is_enabled,
                ISNULL(eas.send_to_handlers, 1) AS send_to_handlers
             FROM dbo.email_event_types et
             LEFT JOIN dbo.email_admin_settings eas ON eas.event_type_code = et.code
             WHERE et.code = @code',
            ['code' => $eventCode]
        );
        if (!$rows) return true;
        $row = $rows[0];
        return !empty($row['is_enabled']) && !empty($row['send_to_handlers']);
    } catch (Throwable $e) {
        api_log_exception('ticket-assignment.api.email_event_enabled', $e, ['event' => $eventCode]);
        return true;
    }
}

function ticket_assignment_quiet_hours_active(?string $start, ?string $end): bool {
    $start = trim((string)$start);
    $end = trim((string)$end);
    if ($start === '' || $end === '') return false;
    if (!preg_match('/^\d{1,2}:\d{2}$/', $start) || !preg_match('/^\d{1,2}:\d{2}$/', $end)) return false;
    [$sh, $sm] = array_map('intval', explode(':', $start));
    [$eh, $em] = array_map('intval', explode(':', $end));
    $now = (int)date('G') * 60 + (int)date('i');
    $startMinutes = $sh * 60 + $sm;
    $endMinutes = $eh * 60 + $em;
    if ($startMinutes > $endMinutes) {
        return $now >= $startMinutes || $now <= $endMinutes;
    }
    return $now >= $startMinutes && $now <= $endMinutes;
}

function ticket_assignment_notification_log(?string $handlerId, string $status, string $event, string $message = '', array $metadata = []): void {
    try {
        sqlserver_execute(
            'INSERT INTO dbo.notification_logs (user_id, channel, status, event, error_message, metadata, created_at)
             VALUES (@user_id, @channel, @status, @event, @error_message, @metadata, SYSUTCDATETIME())',
            [
                'user_id' => $handlerId,
                'channel' => 'email',
                'status' => $status,
                'event' => $event,
                'error_message' => $message !== '' ? ticket_assignment_substr($message, 0, 1000) : null,
                'metadata' => $metadata ? json_encode($metadata, JSON_UNESCAPED_UNICODE) : null,
            ]
        );
    } catch (Throwable $e) {
        api_log_exception('ticket-assignment.api.notification_log', $e, ['event' => $event]);
    }
}

function ticket_assignment_handlers_for_ids(array $handlerIds, string $eventCode): array {
    $handlerIds = ticket_assignment_uuid_list($handlerIds);
    if (!$handlerIds) return [];

    $params = ['event_code' => $eventCode, 'active' => true];
    $placeholders = [];
    foreach ($handlerIds as $index => $handlerId) {
        $key = 'handler_id_' . $index;
        $placeholders[] = '@' . $key;
        $params[$key] = $handlerId;
    }

    return sqlserver_query(
        'SELECT
            h.id,
            h.name,
            h.email,
            COALESCE(hep.is_enabled, et.enabled_by_default, 1) AS event_enabled,
            COALESCE(hns.email_enabled, 1) AS email_enabled,
            hns.min_severity_immediate,
            hns.quiet_hours_start,
            hns.quiet_hours_end,
            COALESCE(hns.weekend_notifications, 0) AS weekend_notifications
         FROM dbo.handlers h
         LEFT JOIN dbo.email_event_types et ON et.code = @event_code
         LEFT JOIN dbo.handler_email_preferences hep ON hep.handler_id = h.id AND hep.event_type_code = @event_code
         LEFT JOIN dbo.handler_notification_settings hns ON hns.handler_id = h.id
         WHERE h.active = @active
           AND h.id IN (' . implode(', ', $placeholders) . ')
         ORDER BY h.name ASC',
        $params
    );
}

function ticket_assignment_should_notify_handler(array $handler, string $severityCode): bool {
    if (!ticket_assignment_valid_email((string)($handler['email'] ?? ''))) return false;
    if (empty($handler['event_enabled'])) return false;
    if (isset($handler['email_enabled']) && empty($handler['email_enabled'])) return false;
    if ((int)date('N') >= 6 && empty($handler['weekend_notifications'])) return false;
    if (ticket_assignment_quiet_hours_active($handler['quiet_hours_start'] ?? null, $handler['quiet_hours_end'] ?? null) && strtolower($severityCode) !== 'critical') return false;
    $threshold = trim((string)($handler['min_severity_immediate'] ?? ''));
    if ($threshold !== '' && ticket_assignment_severity_level($severityCode) < ticket_assignment_severity_level($threshold)) return false;
    return true;
}

function ticket_assignment_handler_email_html(array $ticket, array $handler): string {
    $metadata = is_array($ticket['metadata'] ?? null) ? $ticket['metadata'] : [];
    $ticketNumber = trim((string)($ticket['ticket_number'] ?? ''));
    $statusLabel = trim((string)($metadata['status_label'] ?? $ticket['status_code'] ?? $ticket['current_stage'] ?? '-'));
    $severityCode = strtolower(trim((string)($ticket['severity_code'] ?? 'medium'))) ?: 'medium';
    $submittedAt = trim((string)($ticket['submitted_at'] ?? $ticket['created_at'] ?? ''));
    $portalBase = ticket_assignment_server_base_url();
    $dashboardUrl = $portalBase !== '' ? $portalBase . '/handler-dashboard' : '';
    $reporterName = trim((string)($ticket['reporter_name'] ?? '')) ?: 'Anoniem';
    $reporterEmail = trim((string)($ticket['reporter_email'] ?? '')) ?: 'Niet opgegeven';
    $reporterPhone = trim((string)($ticket['reporter_phone'] ?? '')) ?: 'Niet opgegeven';

    $html = '<h2>Nieuwe melding toegewezen</h2>'
        . '<p>Hallo ' . ticket_assignment_escape_html($handler['name'] ?? 'collega') . ',</p>'
        . '<p>Er is een melding aan jou toegewezen. Hieronder staat de kerninformatie.</p>'
        . '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:12px 0;">'
        . '<h3 style="margin:0 0 8px 0;">Meldingsoverzicht</h3>'
        . '<table role="presentation" style="width:100%;border-collapse:collapse;">'
        . '<tr><td style="padding:5px 0;color:#64748b;width:150px;">Ticketnummer</td><td>' . ticket_assignment_escape_html($ticketNumber ?: '-') . '</td></tr>'
        . '<tr><td style="padding:5px 0;color:#64748b;">Huidige status</td><td>' . ticket_assignment_escape_html($statusLabel ?: '-') . '</td></tr>'
        . '<tr><td style="padding:5px 0;color:#64748b;">Ernst</td><td>' . ticket_assignment_escape_html(ticket_assignment_severity_label($severityCode)) . '</td></tr>'
        . '<tr><td style="padding:5px 0;color:#64748b;">Workflow</td><td>' . ticket_assignment_escape_html($ticket['workflow_type'] ?? '-') . '</td></tr>'
        . '<tr><td style="padding:5px 0;color:#64748b;">Locatie</td><td>' . ticket_assignment_escape_html($ticket['location'] ?? 'Niet opgegeven') . '</td></tr>'
        . '<tr><td style="padding:5px 0;color:#64748b;">Ingediend op</td><td>' . ticket_assignment_escape_html($submittedAt ?: '-') . '</td></tr>'
        . '</table>'
        . '<h3 style="margin:14px 0 8px 0;">Omschrijving</h3>'
        . '<div>' . ticket_assignment_nl2br($ticket['description'] ?? '-') . '</div>'
        . '</div>'
        . '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:12px 0;">'
        . '<h3 style="margin:0 0 8px 0;">Melder (indien bekend)</h3>'
        . '<table role="presentation" style="width:100%;border-collapse:collapse;">'
        . '<tr><td style="padding:5px 0;color:#64748b;width:150px;">Naam</td><td>' . ticket_assignment_escape_html($reporterName) . '</td></tr>'
        . '<tr><td style="padding:5px 0;color:#64748b;">E-mail</td><td>' . ticket_assignment_escape_html($reporterEmail) . '</td></tr>'
        . '<tr><td style="padding:5px 0;color:#64748b;">Telefoon</td><td>' . ticket_assignment_escape_html($reporterPhone) . '</td></tr>'
        . '</table>'
        . '</div>';
    if ($dashboardUrl !== '') {
        $html .= '<p><a href="' . ticket_assignment_escape_html($dashboardUrl) . '">Open het handler-dashboard</a></p>';
    }
    $html .= '<p style="font-size:12px;color:#64748b;">Log in op het portaal om deze melding op te pakken.</p>';
    return $html;
}

function ticket_assignment_notify_added_handlers(array $ticket, array $addedHandlerIds): array {
    $eventCode = 'HANDLER_ASSIGNED';
    $addedHandlerIds = ticket_assignment_uuid_list($addedHandlerIds);
    $ticketNumber = trim((string)($ticket['ticket_number'] ?? ''));
    $workflowType = trim((string)($ticket['workflow_type'] ?? ''));
    $severityCode = strtolower(trim((string)($ticket['severity_code'] ?? 'medium'))) ?: 'medium';

    if (!$addedHandlerIds) {
        return ['success' => true, 'skipped' => true, 'reason' => 'No newly added handlers', 'sent' => 0, 'skipped_count' => 0, 'errors' => []];
    }
    $settings = ticket_assignment_load_system_settings();
    if (!ticket_assignment_setting_bool_for_workflow($settings, $workflowType, ['workflow.notify_on_assignment'], true)) {
        return ['success' => true, 'skipped' => true, 'reason' => 'Workflow assignment notifications disabled', 'sent' => 0, 'skipped_count' => count($addedHandlerIds), 'errors' => []];
    }
    if (!ticket_assignment_email_event_enabled_for_handlers($eventCode)) {
        return ['success' => true, 'skipped' => true, 'reason' => 'Handler assignment email disabled', 'sent' => 0, 'skipped_count' => count($addedHandlerIds), 'errors' => []];
    }

    $handlers = ticket_assignment_handlers_for_ids($addedHandlerIds, $eventCode);
    $sent = 0;
    $skipped = 0;
    $errors = [];

    foreach ($handlers as $handler) {
        $handlerId = trim((string)($handler['id'] ?? ''));
        if (!ticket_assignment_should_notify_handler($handler, $severityCode)) {
            $skipped++;
            ticket_assignment_notification_log($handlerId !== '' ? $handlerId : null, 'skipped', $eventCode, 'Handler preference or notification window skipped email', ['ticket_number' => $ticketNumber]);
            continue;
        }

        $subject = 'Nieuwe melding toegewezen: ' . ($ticketNumber !== '' ? $ticketNumber : 'Onbekend');
        $html = ticket_assignment_handler_email_html($ticket, $handler);
        $result = ticket_assignment_send_mail([(string)$handler['email']], $subject, $html);
        if (!empty($result['success'])) {
            $sent++;
            ticket_assignment_notification_log($handlerId !== '' ? $handlerId : null, 'sent', $eventCode, '', ['ticket_number' => $ticketNumber]);
        } else {
            $message = (string)($result['message'] ?? 'Failed to send handler assignment email');
            $errors[] = $message;
            ticket_assignment_notification_log($handlerId !== '' ? $handlerId : null, 'failed', $eventCode, $message, ['ticket_number' => $ticketNumber]);
        }
    }

    $missing = array_diff($addedHandlerIds, array_values(array_filter(array_map(static fn($handler) => trim((string)($handler['id'] ?? '')), $handlers))));
    foreach ($missing as $handlerId) {
        $skipped++;
        ticket_assignment_notification_log($handlerId, 'skipped', $eventCode, 'Assigned handler not found or inactive', ['ticket_number' => $ticketNumber]);
    }

    return [
        'success' => empty($errors),
        'event' => $eventCode,
        'total_candidates' => count($addedHandlerIds),
        'sent' => $sent,
        'skipped_count' => $skipped,
        'errors' => $errors,
    ];
}

try {
    load_runtime_env(__DIR__);
    api_apply_no_store_headers();

    if (!sqlserver_is_configured()) {
        throw new Exception('SQL Server is not configured');
    }

    api_authz_require_active_handler(static function (int $status, string $message): void {
        ticket_assignment_json($status, false, $message);
    });

    $raw = file_get_contents('php://input');
    $payload = json_decode($raw ?: '', true);
    if (!is_array($payload)) $payload = [];

    $ticketId = trim((string)($payload['ticket_id'] ?? ''));
    if ($ticketId === '' || !preg_match('/^[0-9a-f-]{36}$/i', $ticketId)) {
        ticket_assignment_json(400, false, 'ticket_id is required');
    }

    $handlerIds = ticket_assignment_uuid_list(is_array($payload['handler_ids'] ?? null) ? $payload['handler_ids'] : []);
    $rolesByHandlerId = is_array($payload['roles_by_handler_id'] ?? null) ? $payload['roles_by_handler_id'] : [];

    $desiredAssignments = [];
    foreach ($handlerIds as $index => $handlerId) {
        $desiredAssignments[] = [
            'sort_order' => $index + 1,
            'handler_id' => $handlerId,
            'role' => ticket_assignment_role(
                (string)($rolesByHandlerId[$handlerId] ?? ($index === 0 ? 'primary' : 'secondary')),
                $index === 0 ? 'primary' : 'secondary'
            ),
        ];
    }

    $summarySql = <<<'SQL'
DECLARE @DesiredInput TABLE (
    sort_order INT NULL,
    handler_id UNIQUEIDENTIFIER NULL,
    role NVARCHAR(20) NULL
);

INSERT INTO @DesiredInput (sort_order, handler_id, role)
SELECT
    sort_order,
    handler_id,
    LOWER(LTRIM(RTRIM(COALESCE(role, N''))))
FROM OPENJSON(@desired_assignments_json)
WITH (
    sort_order INT '$.sort_order',
    handler_id UNIQUEIDENTIFIER '$.handler_id',
    role NVARCHAR(20) '$.role'
);

DECLARE @Desired TABLE (
    row_num INT NOT NULL,
    handler_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    role NVARCHAR(20) NOT NULL
);

INSERT INTO @Desired (row_num, handler_id, role)
SELECT
    ROW_NUMBER() OVER (ORDER BY MIN(COALESCE(sort_order, 2147483647)) ASC, handler_id ASC) AS row_num,
    handler_id,
    CASE
        WHEN MAX(CASE WHEN role = N'primary' THEN 1 ELSE 0 END) = 1 THEN N'primary'
        WHEN MAX(CASE WHEN role = N'legal' THEN 1 ELSE 0 END) = 1 THEN N'legal'
        WHEN MAX(CASE WHEN role = N'observer' THEN 1 ELSE 0 END) = 1 THEN N'observer'
        ELSE N'secondary'
    END AS role
FROM @DesiredInput
WHERE handler_id IS NOT NULL
GROUP BY handler_id;

IF EXISTS (SELECT 1 FROM @Desired) AND NOT EXISTS (SELECT 1 FROM @Desired WHERE role = N'primary')
BEGIN
    UPDATE @Desired
    SET role = N'primary'
    WHERE row_num = (SELECT MIN(row_num) FROM @Desired);
END;

;WITH ranked_primary AS (
    SELECT
        handler_id,
        role,
        ROW_NUMBER() OVER (ORDER BY CASE WHEN role = N'primary' THEN 0 ELSE 1 END, row_num ASC, handler_id ASC) AS primary_rank
    FROM @Desired
)
UPDATE d
SET role = CASE
    WHEN rp.role = N'primary' AND rp.primary_rank = 1 THEN N'primary'
    WHEN rp.role = N'primary' AND rp.primary_rank > 1 THEN N'secondary'
    ELSE rp.role
END
FROM @Desired d
INNER JOIN ranked_primary rp ON rp.handler_id = d.handler_id;

DECLARE @Previous TABLE (
    handler_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    role NVARCHAR(20) NULL
);

INSERT INTO @Previous (handler_id, role)
SELECT handler_id, role
FROM dbo.ticket_handlers
WHERE ticket_id = @ticket_id;

DELETE th
FROM dbo.ticket_handlers th
LEFT JOIN @Desired d ON d.handler_id = th.handler_id
WHERE th.ticket_id = @ticket_id
  AND d.handler_id IS NULL;

UPDATE th
SET
    role = d.role,
    assigned_at = ISNULL(th.assigned_at, SYSUTCDATETIME())
FROM dbo.ticket_handlers th
INNER JOIN @Desired d ON d.handler_id = th.handler_id
WHERE th.ticket_id = @ticket_id
  AND (ISNULL(th.role, N'') <> d.role OR th.assigned_at IS NULL);

INSERT INTO dbo.ticket_handlers (ticket_id, handler_id, role, assigned_at, created_at)
SELECT
    @ticket_id,
    d.handler_id,
    d.role,
    SYSUTCDATETIME(),
    SYSUTCDATETIME()
FROM @Desired d
LEFT JOIN dbo.ticket_handlers th
    ON th.ticket_id = @ticket_id
   AND th.handler_id = d.handler_id
WHERE th.handler_id IS NULL;

DECLARE @PrimaryHandlerId UNIQUEIDENTIFIER = (
    SELECT TOP 1 handler_id
    FROM @Desired
    WHERE role = N'primary'
    ORDER BY row_num ASC, handler_id ASC
);

IF @PrimaryHandlerId IS NULL
BEGIN
    SELECT TOP 1 @PrimaryHandlerId = handler_id
    FROM @Desired
    ORDER BY row_num ASC, handler_id ASC;
END;

UPDATE dbo.tickets
SET
    handler_id = @PrimaryHandlerId,
    last_update_at = SYSUTCDATETIME(),
    updated_at = SYSUTCDATETIME()
WHERE id = @ticket_id;

SELECT
    @PrimaryHandlerId AS primary_handler_id,
    COALESCE((
        SELECT handler_id AS id
        FROM @Previous
        ORDER BY handler_id
        FOR JSON PATH
    ), '[]') AS previous_ids_json,
    COALESCE((
        SELECT p.handler_id AS id
        FROM @Previous p
        WHERE NOT EXISTS (
            SELECT 1
            FROM @Desired d
            WHERE d.handler_id = p.handler_id
        )
        ORDER BY p.handler_id
        FOR JSON PATH
    ), '[]') AS removed_ids_json,
    COALESCE((
        SELECT d.handler_id AS id
        FROM @Desired d
        WHERE NOT EXISTS (
            SELECT 1
            FROM @Previous p
            WHERE p.handler_id = d.handler_id
        )
        ORDER BY d.row_num ASC, d.handler_id ASC
        FOR JSON PATH
    ), '[]') AS added_ids_json;
SQL;

    $results = sqlserver_run_commands([
        sqlserver_command(
            'query',
            $summarySql,
            [
                'ticket_id' => $ticketId,
                'desired_assignments_json' => json_encode($desiredAssignments, JSON_UNESCAPED_UNICODE),
            ]
        ),
        sqlserver_command(
            'query',
            'SELECT TOP 1
                t.*,
                h.id AS handler_id,
                h.name AS handler_name,
                h.email AS handler_email,
                h.roles AS handler_roles,
                h.active AS handler_active
             FROM dbo.tickets t
             LEFT JOIN dbo.handlers h ON h.id = t.handler_id
             WHERE t.id = @ticket_id',
            ['ticket_id' => $ticketId]
        ),
        sqlserver_command(
            'query',
            'SELECT
                th.*,
                h.id AS handler_id_ref,
                h.name AS handler_name,
                h.email AS handler_email,
                h.roles AS handler_roles,
                h.active AS handler_active
             FROM dbo.ticket_handlers th
             LEFT JOIN dbo.handlers h ON h.id = th.handler_id
             WHERE th.ticket_id = @ticket_id
             ORDER BY th.assigned_at ASC, th.created_at ASC',
            ['ticket_id' => $ticketId]
        ),
    ], true);

    $summary = sqlserver_result_rows($results, 0)[0] ?? [];
    $ticketRow = sqlserver_result_rows($results, 1)[0] ?? null;
    $ticket = is_array($ticketRow) ? ticket_assignment_ticket($ticketRow) : null;
    if (is_array($ticket)) {
        $ticket['ticket_handlers'] = ticket_assignment_ticket_handlers_from_rows(sqlserver_result_rows($results, 2));
    }

    $addedIds = ticket_assignment_decode_id_list($summary['added_ids_json'] ?? null);
    $removedIds = ticket_assignment_decode_id_list($summary['removed_ids_json'] ?? null);
    $previousIds = ticket_assignment_decode_id_list($summary['previous_ids_json'] ?? null);
    $notificationResult = is_array($ticket) ? ticket_assignment_notify_added_handlers($ticket, $addedIds) : ['success' => false, 'skipped' => true, 'reason' => 'Ticket not loaded'];

    ticket_assignment_json(200, true, 'Ticket handlers synchronized', ['data' => [
        'available' => true,
        'restricted' => false,
        'added_ids' => $addedIds,
        'removed_ids' => $removedIds,
        'previous_ids' => $previousIds,
        'next_ids' => $handlerIds,
        'assignment_notifications' => $notificationResult,
        'ticket' => $ticket,
    ]]);
} catch (Throwable $e) {
    $errorId = api_log_exception('ticket-assignment.api', $e);
    ticket_assignment_json(500, false, 'Internal server error', ['data' => ['error_id' => $errorId]]);
}
