<?php
/**
 * SLA Monitor Service
 * Continuously monitors tickets for SLA violations and sends email notifications
 *
 * Checks every 5 minutes:
 * 1) Tickets approaching SLA deadline (80% threshold) -> warning email
 * 2) Tickets that breached SLA deadline -> breach email
 */

set_time_limit(0);
ini_set('max_execution_time', '0');

// -------------------------------
// Load environment variables
// -------------------------------
// Load environment variables (merge): .env first, then .env.local overrides
$envFiles = [
    __DIR__ . '/../../.env',
    __DIR__ . '/../../.env.local',
];

$envLoaded = false;

foreach ($envFiles as $envFile) {
    if (!file_exists($envFile)) continue;

    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) continue;
        if (!str_contains($line, '=')) continue;

        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);

        // remove surrounding quotes if present
        if ((str_starts_with($value, '"') && str_ends_with($value, '"')) ||
            (str_starts_with($value, "'") && str_ends_with($value, "'"))) {
            $value = substr($value, 1, -1);
        }

        putenv("$key=$value");
        $_ENV[$key] = $value;
    }

    error_log("[SLA Monitor] Loaded environment from: $envFile");
}

if (!$envLoaded) {
    error_log("[SLA Monitor] No .env or .env.local file found!");
}

// -------------------------------
// Supabase config
// -------------------------------
$supabaseUrl = getenv('VITE_SUPABASE_URL') ?: ($_ENV['VITE_SUPABASE_URL'] ?? null);
$supabaseKey = getenv('VITE_SUPABASE_ANON_KEY') ?: ($_ENV['VITE_SUPABASE_ANON_KEY'] ?? null);

error_log('[SLA Monitor] Checking Supabase credentials...');
error_log('[SLA Monitor] URL: ' . ($supabaseUrl ? 'Found' : 'Missing'));
error_log('[SLA Monitor] Key: ' . ($supabaseKey ? 'Found (length: ' . strlen($supabaseKey) . ')' : 'Missing'));

if (!$supabaseUrl || !$supabaseKey) {
    error_log('[SLA Monitor] Missing Supabase credentials');
    error_log('[SLA Monitor] Available env vars: ' . implode(', ', array_keys($_ENV)));
    exit(1);
}

// -------------------------------
// Configuration
// -------------------------------
const CHECK_INTERVAL_SECONDS = 300;      // 5 minutes
const SLA_WARNING_THRESHOLD  = 0.8;      // 80%
const LOG_FILE               = __DIR__ . '/../../sla-monitor.log';

// Your tickets table uses submitted_at (NOT created_at)
const TICKET_CREATED_FIELD   = 'submitted_at';

// Mail API URL (configurable)
$mailApiUrl = getenv('MAIL_API_URL') ?: ($_ENV['MAIL_API_URL'] ?? 'http://127.0.0.1:8081/api/mail.api.php');

// -------------------------------
// Helpers
// -------------------------------
function logMessage(string $message, string $level = 'INFO'): void {
    $timestamp = date('Y-m-d H:i:s');
    $logLine = "[{$timestamp}] [{$level}] {$message}\n";
    file_put_contents(LOG_FILE, $logLine, FILE_APPEND);
    echo $logLine;
}

function supabaseRequest(string $endpoint, string $method = 'GET', $data = null) {
    global $supabaseUrl, $supabaseKey;

    $url = rtrim($supabaseUrl, '/') . '/rest/v1/' . ltrim($endpoint, '/');

    $headers = [
        'apikey: ' . $supabaseKey,
        'Authorization: Bearer ' . $supabaseKey,
        'Content-Type: application/json',
        'Prefer: return=representation',
    ];

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT        => 12,
    ]);

    if ($data !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    }

    $response = curl_exec($ch);
    $curlErr  = curl_error($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($curlErr) {
        logMessage("Supabase cURL error: {$curlErr} (endpoint: {$endpoint})", 'ERROR');
        return false;
    }

    if ($httpCode >= 400) {
        logMessage("Supabase API error: HTTP {$httpCode} - {$response}", 'ERROR');
        return false;
    }

    $decoded = json_decode($response, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        logMessage("Supabase JSON decode error: " . json_last_error_msg(), 'ERROR');
        return false;
    }

    return $decoded;
}

function safeTs(?string $iso): ?int {
    if (!$iso) return null;
    $t = strtotime($iso);
    return $t ?: null;
}

// -------------------------------
// SLA Query
// -------------------------------
function getTicketsNeedingSLANotification() {
    // We query submitted_at (NOT created_at)
    $select = implode(',', [
        'id',
        'ticket_number',
        'description',
        'location',
        'severity_code',
        'handler_id',
        'status_code',
        TICKET_CREATED_FIELD,
        'sla_deadline',
        'sla_warning_sent',
        'sla_breach_sent',
    ]);

    $query =
        "tickets?select={$select}"
        . "&status_code=not.in.(resolved,closed,rejected)"
        . "&sla_deadline=not.is.null"
        . "&order=sla_deadline.asc"
        . "&limit=200";

    return supabaseRequest($query);
}

function getHandler(string $handlerId): ?array {
    $query = "handlers?select=*&id=eq.{$handlerId}";
    $result = supabaseRequest($query);
    return (is_array($result) && count($result) > 0) ? $result[0] : null;
}

function getHandlerNotificationSettings(string $handlerId): ?array {
    $query = "handler_notification_settings?select=*&handler_id=eq.{$handlerId}";
    $result = supabaseRequest($query);
    return (is_array($result) && count($result) > 0) ? $result[0] : null;
}

function shouldNotifyHandler(?array $settings): bool {
    if (!$settings) return true;

    if (!($settings['email_enabled'] ?? true)) return false;
    if (!($settings['notify_deadline_reminders'] ?? true)) return false;

    // Weekend notifications
    if (!($settings['weekend_notifications'] ?? false)) {
        $dayOfWeek = (int)date('w'); // 0=Sun, 6=Sat
        if ($dayOfWeek === 0 || $dayOfWeek === 6) return false;
    }

    // Quiet hours
    $start = $settings['quiet_hours_start'] ?? null;
    $end   = $settings['quiet_hours_end'] ?? null;

    if ($start && $end) {
        $currentTime = (new DateTime())->format('H:i');

        if ($start < $end) {
            // normal window
            if ($currentTime >= $start && $currentTime <= $end) return false;
        } else {
            // wraps midnight
            if ($currentTime >= $start || $currentTime <= $end) return false;
        }
    }

    return true;
}

function postJson(string $url, array $payload): bool {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT        => 12,
    ]);

    $response = curl_exec($ch);
    $curlErr  = curl_error($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($curlErr) {
        logMessage("Mail API cURL error: {$curlErr}", 'ERROR');
        return false;
    }

    if ($httpCode !== 200) {
        logMessage("Mail API error: HTTP {$httpCode} - " . trim((string)$response), 'ERROR');
        return false;
    }

    // try decode for sanity (mail api should always return JSON)
    $decoded = json_decode((string)$response, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        logMessage("Mail API returned non-JSON success response (still HTTP 200). Raw: " . substr((string)$response, 0, 200), 'WARNING');
        return true; // accept if http 200, but warn
    }

    return (bool)($decoded['success'] ?? true);
}

function sendSLAWarningEmail(array $ticket, array $handler): bool {
    global $mailApiUrl;

    $deadlineTs = safeTs($ticket['sla_deadline'] ?? null);
    if (!$deadlineTs) return false;

    $hoursRemaining = max(0, ($deadlineTs - time()) / 3600);

    $payload = [
        'type'            => 'sla_warning',
        'to'              => $handler['email'] ?? '',
        'ticket'          => $ticket,
        'handler'         => $handler,
        'hours_remaining' => round($hoursRemaining, 1),
    ];

    return postJson($mailApiUrl, $payload);
}

function sendSLABreachEmail(array $ticket, array $handler): bool {
    global $mailApiUrl;

    $deadlineTs = safeTs($ticket['sla_deadline'] ?? null);
    if (!$deadlineTs) return false;

    $hoursOverdue = max(0, (time() - $deadlineTs) / 3600);

    $payload = [
        'type'          => 'sla_breach',
        'to'            => $handler['email'] ?? '',
        'ticket'        => $ticket,
        'handler'       => $handler,
        'hours_overdue' => round($hoursOverdue, 1),
    ];

    return postJson($mailApiUrl, $payload);
}

function updateTicketSLAFlags(string $ticketId, bool $warningFlag, bool $breachFlag) {
    $data = [
        'sla_warning_sent' => $warningFlag,
        'sla_breach_sent'  => $breachFlag,
    ];

    return supabaseRequest("tickets?id=eq.{$ticketId}", 'PATCH', $data);
}

function processSLAMonitoring(): void {
    $tickets = getTicketsNeedingSLANotification();

    // False means request failed
    if ($tickets === false) {
        logMessage('SLA monitoring skipped: tickets query failed (see errors above)', 'ERROR');
        return;
    }

    // Empty array means simply no tickets
    if (is_array($tickets) && count($tickets) === 0) {
        logMessage('No tickets found for SLA monitoring (normal if none have SLA deadlines)');
        return;
    }

    if (!is_array($tickets)) {
        logMessage('Invalid tickets response type', 'WARNING');
        return;
    }

    $now = time();
    $warningCount = 0;
    $breachCount  = 0;

    foreach ($tickets as $ticket) {
        $ticketNumber = $ticket['ticket_number'] ?? 'Unknown';

        $deadlineTs = safeTs($ticket['sla_deadline'] ?? null);
        if (!$deadlineTs) {
            continue;
        }

        // created/submitted time: fallback to "now" if missing
        $createdIso = $ticket[TICKET_CREATED_FIELD] ?? null;
        $createdTs  = safeTs($createdIso) ?: $now;

        // total window is (deadline - created)
        $totalTime = $deadlineTs - $createdTs;
        if ($totalTime <= 0) {
            // If created is after deadline (bad data) just treat as immediate breach check
            $totalTime = 1;
        }

        $timeToDeadline = $deadlineTs - $now;

        $warningSent = (bool)($ticket['sla_warning_sent'] ?? false);
        $breachSent  = (bool)($ticket['sla_breach_sent'] ?? false);

        // progress: 0 at creation, 1 at deadline
        $progress = 1 - ($timeToDeadline / $totalTime);

        $handlerId = $ticket['handler_id'] ?? null;
        if (!$handlerId) {
            // No handler assigned yet, skip notifications
            continue;
        }

        // Breach
        if ($timeToDeadline <= 0 && !$breachSent) {
            $handler = getHandler($handlerId);
            if (!$handler || empty($handler['email'])) {
                logMessage("No handler/email found for breach ticket {$ticketNumber}", 'WARNING');
                continue;
            }

            $settings = getHandlerNotificationSettings($handler['id']);
            if (!shouldNotifyHandler($settings)) {
                logMessage("Handler notification skipped (prefs) for breach ticket {$ticketNumber}");
                continue;
            }

            if (sendSLABreachEmail($ticket, $handler)) {
                updateTicketSLAFlags($ticket['id'], true, true);
                $breachCount++;
                logMessage("SLA BREACH email sent for ticket {$ticketNumber} to {$handler['email']}");
            } else {
                logMessage("Failed to send SLA breach email for ticket {$ticketNumber}", 'ERROR');
            }

            continue;
        }

        // Warning (approaching)
        if ($progress >= SLA_WARNING_THRESHOLD && !$warningSent) {
            $handler = getHandler($handlerId);
            if (!$handler || empty($handler['email'])) {
                logMessage("No handler/email found for warning ticket {$ticketNumber}", 'WARNING');
                continue;
            }

            $settings = getHandlerNotificationSettings($handler['id']);
            if (!shouldNotifyHandler($settings)) {
                logMessage("Handler notification skipped (prefs) for warning ticket {$ticketNumber}");
                continue;
            }

            if (sendSLAWarningEmail($ticket, $handler)) {
                updateTicketSLAFlags($ticket['id'], true, false);
                $warningCount++;
                logMessage("SLA WARNING email sent for ticket {$ticketNumber} to {$handler['email']}");
            } else {
                logMessage("Failed to send SLA warning email for ticket {$ticketNumber}", 'ERROR');
            }
        }
    }

    logMessage("SLA monitoring cycle complete: {$warningCount} warnings, {$breachCount} breaches");
}

// -------------------------------
// Main loop
// -------------------------------
logMessage('=== SLA Monitor Service Started ===');
logMessage('Supabase: ' . substr((string)getenv('VITE_SUPABASE_URL'), 0, 40) . '...');
logMessage("Mail API: {$mailApiUrl}");
logMessage("Check interval: " . CHECK_INTERVAL_SECONDS . " seconds");
logMessage("Warning threshold: " . (SLA_WARNING_THRESHOLD * 100) . "%");
logMessage("Ticket created field: " . TICKET_CREATED_FIELD);

while (true) {
    try {
        processSLAMonitoring();
    } catch (Throwable $e) {
        logMessage("Error in SLA monitoring: " . $e->getMessage(), 'ERROR');
    }

    sleep(CHECK_INTERVAL_SECONDS);
}