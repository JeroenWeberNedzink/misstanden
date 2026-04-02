<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_admin_auth.php';
require_once __DIR__ . '/_supabase.php';
require_once __DIR__ . '/_errors.php';
require_once __DIR__ . '/_security_headers.php';
require_once __DIR__ . '/_rate_limit.php';

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
    if ($expected === '') return false;
    $provided = sla_escalation_header_value('X-SLA-ESCALATION-KEY');
    if ($provided === '') {
        $provided = sla_escalation_header_value('X-SLA-CRON-KEY');
    }
    if ($provided === '') return false;
    return hash_equals($expected, $provided);
}

function sla_escalation_supabase_request(string $method, string $url, string $serviceKey, $payload = null, bool $returnRepresentation = false): array {
    $headers = [
        'apikey: ' . $serviceKey,
        'Authorization: Bearer ' . $serviceKey,
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

    return [$code, json_decode($resp, true), $resp];
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
    if ($explicit !== '') return $explicit;
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = trim((string)($_SERVER['HTTP_HOST'] ?? ''));
    if ($host === '') return 'http://127.0.0.1:8081/api/mail.api.php';
    return $scheme . '://' . $host . '/api/mail.api.php';
}

function sla_escalation_send_mail(array $to, string $subject, string $html, string $text): bool {
    if (count($to) === 0) return false;
    $url = sla_escalation_mail_api_url();

    $payload = [
        'to' => implode(';', $to),
        'subject' => $subject,
        'html' => $html,
        'text' => $text,
    ];

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
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
    if ($value === 'low') return 'medium';
    if ($value === 'medium') return 'high';
    if ($value === 'high') return 'critical';
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
    if ($hours <= 0) $hours = 24;
    if ($hours > 24 * 30) $hours = 24 * 30;
    return $hours;
}

try {
    load_runtime_env(__DIR__);

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        sla_escalation_json(405, false, 'Method not allowed');
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

    $supabaseUrl = rtrim((string)(getenv('VITE_SUPABASE_URL') ?: ''), '/');
    $serviceKey = supabase_get_service_role_key();
    if ($supabaseUrl === '') {
        throw new Exception('Missing Supabase URL configuration');
    }

    $raw = file_get_contents('php://input');
    $payload = json_decode($raw ?? '', true);
    if (!is_array($payload)) $payload = [];

    $lookbackDays = isset($payload['lookback_days']) && is_numeric($payload['lookback_days'])
        ? (int)$payload['lookback_days']
        : 90;
    if ($lookbackDays <= 0) $lookbackDays = 90;
    if ($lookbackDays > 365) $lookbackDays = 365;
    $lookbackIso = gmdate('c', time() - ($lookbackDays * 86400));

    [$statusCode, $statusesDecoded, $statusesRaw] = sla_escalation_supabase_request(
        'GET',
        $supabaseUrl . '/rest/v1/workflow_statuses?select=code,is_terminal',
        $serviceKey
    );
    if ($statusCode < 200 || $statusCode >= 300) {
        $msg = is_array($statusesDecoded) ? json_encode($statusesDecoded, JSON_UNESCAPED_UNICODE) : (string)$statusesRaw;
        throw new Exception('Failed to load workflow statuses: ' . $msg);
    }
    $terminalCodes = [];
    foreach (($statusesDecoded ?? []) as $row) {
        if (!empty($row['is_terminal'])) {
            $terminalCodes[strtolower(trim((string)($row['code'] ?? '')))] = true;
        }
    }

    [$ticketCode, $ticketsDecoded, $ticketsRaw] = sla_escalation_supabase_request(
        'GET',
        $supabaseUrl . '/rest/v1/tickets?select=id,ticket_number,submitted_at,status_code,severity_code,metadata,last_update_at'
        . '&submitted_at=gte.' . rawurlencode($lookbackIso)
        . '&order=submitted_at.asc',
        $serviceKey
    );
    if ($ticketCode < 200 || $ticketCode >= 300) {
        $msg = is_array($ticketsDecoded) ? json_encode($ticketsDecoded, JSON_UNESCAPED_UNICODE) : (string)$ticketsRaw;
        throw new Exception('Failed to load tickets: ' . $msg);
    }
    $tickets = is_array($ticketsDecoded) ? $ticketsDecoded : [];
    $openTickets = [];
    foreach ($tickets as $ticket) {
        $status = strtolower(trim((string)($ticket['status_code'] ?? '')));
        if (isset($terminalCodes[$status])) continue;
        $ticketId = trim((string)($ticket['id'] ?? ''));
        if ($ticketId === '') continue;
        $openTickets[] = $ticket;
    }

    $ticketIds = array_values(array_unique(array_map(static fn($t) => (string)$t['id'], $openTickets)));
    if (count($ticketIds) === 0) {
        sla_escalation_json(200, true, 'No open tickets to evaluate', [
            'evaluated' => 0,
            'escalated' => 0,
            'updated_priority' => 0,
            'emails_sent' => 0,
            'auth_mode' => $authMode,
        ]);
    }

    $firstHandlerMessageByTicket = [];
    $chunks = array_chunk($ticketIds, 40);
    foreach ($chunks as $chunk) {
        $inValues = implode(',', array_map(static fn($id) => '"' . str_replace('"', '', (string)$id) . '"', $chunk));
        [$msgCode, $msgDecoded, $msgRaw] = sla_escalation_supabase_request(
            'GET',
            $supabaseUrl . '/rest/v1/messages?select=ticket_id,created_at,sender,is_internal'
            . '&sender=eq.handler'
            . '&is_internal=eq.false'
            . '&ticket_id=in.(' . rawurlencode($inValues) . ')'
            . '&order=created_at.asc',
            $serviceKey
        );
        if ($msgCode < 200 || $msgCode >= 300) {
            $msg = is_array($msgDecoded) ? json_encode($msgDecoded, JSON_UNESCAPED_UNICODE) : (string)$msgRaw;
            throw new Exception('Failed to load handler messages: ' . $msg);
        }
        foreach (($msgDecoded ?? []) as $row) {
            $ticketId = trim((string)($row['ticket_id'] ?? ''));
            $createdAt = trim((string)($row['created_at'] ?? ''));
            if ($ticketId === '' || $createdAt === '') continue;
            if (!isset($firstHandlerMessageByTicket[$ticketId])) {
                $firstHandlerMessageByTicket[$ticketId] = $createdAt;
            }
        }
    }

    $existingEscalations = [];
    foreach ($chunks as $chunk) {
        $inValues = implode(',', array_map(static fn($id) => '"' . str_replace('"', '', (string)$id) . '"', $chunk));
        [$escCode, $escDecoded, $escRaw] = sla_escalation_supabase_request(
            'GET',
            $supabaseUrl . '/rest/v1/sla_escalations?select=ticket_id,reason'
            . '&reason=eq.' . rawurlencode(SLA_ESCALATION_REASON_FIRST_RESPONSE)
            . '&ticket_id=in.(' . rawurlencode($inValues) . ')',
            $serviceKey
        );
        if ($escCode < 200 || $escCode >= 300) {
            $msg = is_array($escDecoded) ? json_encode($escDecoded, JSON_UNESCAPED_UNICODE) : (string)$escRaw;
            throw new Exception('Failed to load existing escalations: ' . $msg);
        }
        foreach (($escDecoded ?? []) as $row) {
            $ticketId = trim((string)($row['ticket_id'] ?? ''));
            if ($ticketId !== '') $existingEscalations[$ticketId] = true;
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
        if ($ticketId === '' || $submittedAt === '') continue;

        $submittedTs = strtotime($submittedAt);
        if ($submittedTs === false) continue;

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

        [$insCode, $insDecoded, $insRaw] = sla_escalation_supabase_request(
            'POST',
            $supabaseUrl . '/rest/v1/sla_escalations',
            $serviceKey,
            [
                'ticket_id' => $ticketId,
                'escalated_at' => gmdate('c'),
                'reason' => SLA_ESCALATION_REASON_FIRST_RESPONSE,
            ],
            true
        );
        if ($insCode < 200 || $insCode >= 300) {
            $msgText = is_array($insDecoded) ? json_encode($insDecoded, JSON_UNESCAPED_UNICODE) : (string)$insRaw;
            if (!str_contains(strtolower($msgText), 'duplicate')) {
                error_log('[sla-escalation.api] Failed to insert escalation: ' . api_redact_sensitive($msgText));
            }
        } else {
            $escalated++;
            $existingEscalations[$ticketId] = true;
        }

        $currentSeverity = trim((string)($ticket['severity_code'] ?? ''));
        $nextSeverity = sla_escalation_priority_bump($currentSeverity);
        if (strtolower($nextSeverity) !== strtolower($currentSeverity)) {
            [$upCode] = sla_escalation_supabase_request(
                'PATCH',
                $supabaseUrl . '/rest/v1/tickets?id=eq.' . rawurlencode($ticketId),
                $serviceKey,
                [
                    'severity_code' => $nextSeverity,
                    'last_update_at' => gmdate('c'),
                ],
                false
            );
            if ($upCode >= 200 && $upCode < 300) {
                $updatedPriority++;
            }
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
