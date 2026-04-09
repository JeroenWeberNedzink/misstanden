<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_admin_auth.php';
require_once __DIR__ . '/_errors.php';
require_once __DIR__ . '/_security_headers.php';
require_once __DIR__ . '/_rate_limit.php';
require_once __DIR__ . '/_sqlserver.php';

api_apply_security_headers([
    'allow_methods' => 'POST, OPTIONS',
    'allow_headers' => 'Content-Type, Authorization, X-SLA-ESCALATION-KEY, X-SLA-CRON-KEY',
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

const SLA_ESCALATION_REASON_FIRST_RESPONSE = 'first_response_sla_exceeded';
const SLA_ESCALATION_SCOPES_WRITE = [
    'admin:sla:write',
    'run:sla_backfill',
    'write:sla',
    'manage:sla',
    'admin:all',
    'admin',
];

function sla_escalation_json(int $status, bool $success, string $message, array $data = []): void {
    http_response_code($status);
    echo json_encode(array_merge([
        'success' => $success,
        'message' => $message,
    ], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function sla_escalation_header_value(string $name): string {
    $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    return trim((string)($_SERVER[$serverKey] ?? ''));
}

function sla_escalation_scheduler_authorized(): bool {
    $expected = trim((string)(getenv('SLA_ESCALATION_CRON_KEY') ?: getenv('SLA_BACKFILL_CRON_KEY') ?: ''));
    if ($expected === '') {
        return false;
    }
    $provided = sla_escalation_header_value('X-SLA-ESCALATION-KEY');
    if ($provided === '') {
        $provided = sla_escalation_header_value('X-SLA-CRON-KEY');
    }
    return $provided !== '' && hash_equals($expected, $provided);
}

function sla_escalation_parse_email_list(string $raw): array {
    $normalized = str_replace([',', "\n", "\r", "\t"], ';', $raw);
    $parts = array_filter(array_map('trim', explode(';', $normalized)));
    $out = [];
    foreach ($parts as $email) {
        if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $out[] = strtolower($email);
        }
    }
    return array_values(array_unique($out));
}

function sla_escalation_mail_api_url(): string {
    $explicit = trim((string)(getenv('MAIL_API_INTERNAL_URL') ?: getenv('PHP_MAIL_API_URL') ?: ''));
    if ($explicit !== '') {
        return $explicit;
    }
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = trim((string)($_SERVER['HTTP_HOST'] ?? ''));
    if ($host === '') {
        return 'http://127.0.0.1:8081/api/mail.api.php';
    }
    return $scheme . '://' . $host . '/api/mail.api.php';
}

function sla_escalation_send_mail(array $to, string $subject, string $html, string $text): bool {
    if (count($to) === 0) {
        return false;
    }

    $payload = [
        'to' => implode(';', $to),
        'subject' => $subject,
        'html' => $html,
        'text' => $text,
    ];

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => sla_escalation_mail_api_url(),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_TIMEOUT => 20,
    ]);

    $resp = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($resp === false) {
        error_log('[sla-escalation.api] Failed to call mail API: ' . api_redact_sensitive(curl_error($ch)));
        curl_close($ch);
        return false;
    }
    curl_close($ch);

    $decoded = json_decode($resp, true);
    return $status >= 200 && $status < 300 && is_array($decoded) && !empty($decoded['success']);
}

function sla_escalation_priority_bump(string $severity): string {
    $value = strtolower(trim($severity));
    if ($value === 'low') {
        return 'medium';
    }
    if ($value === 'medium') {
        return 'high';
    }
    if ($value === 'high') {
        return 'critical';
    }
    return 'critical';
}

function sla_escalation_hours_from_metadata($metadata): int {
    if (is_string($metadata)) {
        $decoded = json_decode($metadata, true);
        $metadata = is_array($decoded) ? $decoded : [];
    }
    if (!is_array($metadata)) {
        return 24;
    }
    $value = $metadata['sla_response_hours'] ?? $metadata['slaResponseHours'] ?? 24;
    $hours = is_numeric($value) ? (int)$value : 24;
    if ($hours <= 0) {
        $hours = 24;
    }
    if ($hours > 24 * 30) {
        $hours = 24 * 30;
    }
    return $hours;
}

try {
    load_runtime_env(__DIR__);

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        sla_escalation_json(405, false, 'Method not allowed');
    }
    if (!sqlserver_is_configured()) {
        throw new Exception('SQL Server is not configured');
    }

    $authMode = 'scheduler';
    if (!sla_escalation_scheduler_authorized()) {
        $ctx = api_authz_require_admin(static function (int $status, string $message): void {
            sla_escalation_json($status, false, $message);
        }, SLA_ESCALATION_SCOPES_WRITE);
        $authMode = 'admin';

        $handlerId = trim((string)($ctx['handler']['id'] ?? ''));
        $claimSub = trim((string)($ctx['claims']['sub'] ?? ''));
        $actorRaw = $handlerId !== '' ? $handlerId : ($claimSub !== '' ? $claimSub : 'unknown');
        $actorKey = api_rate_limit_hash('sla_escalation_actor:' . $actorRaw);
        $clientKey = api_rate_limit_client_fingerprint();
        api_rate_limit_enforce(
            'sla-escalation:admin:actor:' . $actorKey,
            20,
            3600,
            static function (int $retryAfter): void {
                sla_escalation_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $retryAfter]);
            }
        );
        api_rate_limit_enforce(
            'sla-escalation:admin:client:' . $clientKey,
            120,
            3600,
            static function (int $retryAfter): void {
                sla_escalation_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $retryAfter]);
            }
        );
    }

    $raw = file_get_contents('php://input');
    $payload = json_decode($raw ?? '', true);
    if (!is_array($payload)) {
        $payload = [];
    }

    $lookbackDays = isset($payload['lookback_days']) && is_numeric($payload['lookback_days'])
        ? (int)$payload['lookback_days']
        : 90;
    if ($lookbackDays <= 0) {
        $lookbackDays = 90;
    }
    if ($lookbackDays > 365) {
        $lookbackDays = 365;
    }
    $lookbackIso = gmdate('c', time() - ($lookbackDays * 86400));

    $statusRows = sqlserver_query('SELECT code, is_terminal FROM dbo.workflow_statuses');
    $terminalCodes = [];
    foreach ($statusRows as $statusRow) {
        if (!empty($statusRow['is_terminal'])) {
            $terminalCodes[strtolower(trim((string)($statusRow['code'] ?? '')))] = true;
        }
    }

    $ticketRows = sqlserver_query(
        'SELECT id, ticket_number, submitted_at, status_code, severity_code, metadata, last_update_at
         FROM dbo.tickets
         WHERE submitted_at >= @submitted_at
         ORDER BY submitted_at ASC',
        ['submitted_at' => $lookbackIso]
    );

    $openTickets = [];
    foreach ($ticketRows as $ticketRow) {
        $status = strtolower(trim((string)($ticketRow['status_code'] ?? '')));
        if (isset($terminalCodes[$status])) {
            continue;
        }
        $ticketRow['metadata'] = is_array($ticketRow['metadata'] ?? null)
            ? $ticketRow['metadata']
            : (json_decode((string)($ticketRow['metadata'] ?? ''), true) ?: []);
        $ticketId = trim((string)($ticketRow['id'] ?? ''));
        if ($ticketId === '') {
            continue;
        }
        $openTickets[] = $ticketRow;
    }

    $ticketIds = array_values(array_unique(array_map(static fn($ticket) => (string)$ticket['id'], $openTickets)));
    if (count($ticketIds) === 0) {
        sla_escalation_json(200, true, 'No open tickets to evaluate', [
            'evaluated' => 0,
            'escalated' => 0,
            'updated_priority' => 0,
            'emails_sent' => 0,
            'auth_mode' => $authMode,
        ]);
    }

    $params = [];
    $placeholders = [];
    foreach ($ticketIds as $index => $ticketId) {
        $key = 'ticket_' . $index;
        $params[$key] = $ticketId;
        $placeholders[] = '@' . $key;
    }

    $messageRows = sqlserver_query(
        'SELECT ticket_id, created_at, sender, is_internal
         FROM dbo.messages
         WHERE sender = @sender
           AND is_internal = @is_internal
           AND ticket_id IN (' . implode(', ', $placeholders) . ')
         ORDER BY created_at ASC',
        array_merge($params, ['sender' => 'handler', 'is_internal' => false])
    );

    $firstHandlerMessageByTicket = [];
    foreach ($messageRows as $messageRow) {
        $ticketId = trim((string)($messageRow['ticket_id'] ?? ''));
        $createdAt = trim((string)($messageRow['created_at'] ?? ''));
        if ($ticketId === '' || $createdAt === '') {
            continue;
        }
        if (!isset($firstHandlerMessageByTicket[$ticketId])) {
            $firstHandlerMessageByTicket[$ticketId] = $createdAt;
        }
    }

    $escalationRows = sqlserver_query(
        'SELECT ticket_id, reason
         FROM dbo.sla_escalations
         WHERE reason = @reason
           AND ticket_id IN (' . implode(', ', $placeholders) . ')',
        array_merge($params, ['reason' => SLA_ESCALATION_REASON_FIRST_RESPONSE])
    );
    $existingEscalations = [];
    foreach ($escalationRows as $escalationRow) {
        $ticketId = trim((string)($escalationRow['ticket_id'] ?? ''));
        if ($ticketId !== '') {
            $existingEscalations[$ticketId] = true;
        }
    }

    $recipientEnv = trim((string)(getenv('SLA_ESCALATION_EMAILS') ?: getenv('ACCESS_REQUEST_ADMIN_EMAILS') ?: ''));
    $mailRecipients = sla_escalation_parse_email_list($recipientEnv);

    $escalated = 0;
    $updatedPriority = 0;
    $emailsSent = 0;
    $nowTs = time();

    foreach ($openTickets as $ticket) {
        $ticketId = trim((string)($ticket['id'] ?? ''));
        $submittedAt = trim((string)($ticket['submitted_at'] ?? ''));
        if ($ticketId === '' || $submittedAt === '') {
            continue;
        }

        $submittedTs = strtotime($submittedAt);
        if ($submittedTs === false) {
            continue;
        }

        $slaHours = sla_escalation_hours_from_metadata($ticket['metadata'] ?? null);
        $dueTs = $submittedTs + ($slaHours * 3600);
        $firstHandlerAt = $firstHandlerMessageByTicket[$ticketId] ?? null;
        $firstHandlerTs = $firstHandlerAt ? strtotime($firstHandlerAt) : false;

        $breached = false;
        if ($firstHandlerTs === false) {
            $breached = $nowTs > $dueTs;
        } else {
            $breached = $firstHandlerTs > $dueTs;
        }

        if (!$breached || isset($existingEscalations[$ticketId])) {
            continue;
        }

        sqlserver_execute(
            'INSERT INTO dbo.sla_escalations (ticket_id, escalated_at, reason, created_at)
             VALUES (@ticket_id, SYSUTCDATETIME(), @reason, SYSUTCDATETIME())',
            ['ticket_id' => $ticketId, 'reason' => SLA_ESCALATION_REASON_FIRST_RESPONSE]
        );
        $existingEscalations[$ticketId] = true;
        $escalated++;

        $currentSeverity = trim((string)($ticket['severity_code'] ?? ''));
        $nextSeverity = sla_escalation_priority_bump($currentSeverity);
        if (strtolower($nextSeverity) !== strtolower($currentSeverity)) {
            sqlserver_execute(
                'UPDATE dbo.tickets
                 SET severity_code = @severity_code,
                     last_update_at = SYSUTCDATETIME(),
                     updated_at = SYSUTCDATETIME()
                 WHERE id = @ticket_id',
                ['severity_code' => $nextSeverity, 'ticket_id' => $ticketId]
            );
            $updatedPriority++;
        }

        if (count($mailRecipients) > 0) {
            $ticketNumber = trim((string)($ticket['ticket_number'] ?? $ticketId));
            $subject = 'SLA Escalation: First Response Breach for ' . $ticketNumber;
            $html = sprintf(
                '<h2>SLA escalation triggered</h2><p>Ticket <strong>%s</strong> exceeded first-response SLA.</p><p>Due at: %s UTC</p><p>Status: %s</p>',
                htmlspecialchars($ticketNumber, ENT_QUOTES, 'UTF-8'),
                gmdate('Y-m-d H:i:s', $dueTs),
                htmlspecialchars((string)($ticket['status_code'] ?? 'unknown'), ENT_QUOTES, 'UTF-8')
            );
            $text = 'SLA escalation triggered for ticket ' . $ticketNumber
                . '. Due at ' . gmdate('Y-m-d H:i:s', $dueTs) . ' UTC.'
                . ' Current status: ' . (string)($ticket['status_code'] ?? 'unknown');
            if (sla_escalation_send_mail($mailRecipients, $subject, $html, $text)) {
                $emailsSent++;
            }
        }
    }

    sla_escalation_json(200, true, 'SLA escalation run completed', [
        'evaluated' => count($openTickets),
        'escalated' => $escalated,
        'updated_priority' => $updatedPriority,
        'emails_sent' => $emailsSent,
        'auth_mode' => $authMode,
        'lookback_days' => $lookbackDays,
    ]);
} catch (Throwable $e) {
    $errorId = api_log_exception('sla-escalation.api', $e);
    sla_escalation_json(500, false, 'Internal server error', ['error_id' => $errorId]);
}
