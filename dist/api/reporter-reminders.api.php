<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_admin_auth.php';
require_once __DIR__ . '/_errors.php';
require_once __DIR__ . '/_rate_limit.php';
require_once __DIR__ . '/_security_headers.php';
require_once __DIR__ . '/_sqlserver.php';
require_once __DIR__ . '/_portal_tokens.php';

api_apply_security_headers([
    'allow_methods' => 'POST, OPTIONS',
    'allow_headers' => 'Content-Type, Authorization, X-Reporter-Reminder-Key, X-SLA-Cron-Key',
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

const REPORTER_REMINDER_SCOPES_WRITE = [
    'admin:sla:write', 'run:sla_backfill', 'write:sla', 'manage:sla', 'admin:all', 'admin',
];

function rr_json(int $status, bool $success, string $message, array $data = []): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge(['success' => $success, 'message' => $message], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function rr_header(string $name): string {
    return trim((string)($_SERVER['HTTP_' . strtoupper(str_replace('-', '_', $name))] ?? ''));
}

function rr_scheduler_authorized(): bool {
    $expected = trim((string)(getenv('REPORTER_REMINDER_CRON_KEY') ?: getenv('SLA_ESCALATION_CRON_KEY') ?: ''));
    if ($expected === '') return false;
    $provided = rr_header('X-Reporter-Reminder-Key');
    if ($provided === '') $provided = rr_header('X-SLA-Cron-Key');
    return $provided !== '' && hash_equals($expected, $provided);
}

function rr_setting_value(array $rows, string $key, $fallback) {
    foreach ($rows as $row) {
        if (trim((string)($row['setting_key'] ?? '')) !== $key) continue;
        $raw = $row['setting_value'] ?? null;
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            if (json_last_error() === JSON_ERROR_NONE) $raw = $decoded;
        }
        return is_array($raw) && array_key_exists('value', $raw) ? $raw['value'] : $raw;
    }
    return $fallback;
}

function rr_positive_hours($value, int $fallback, int $maximum = 2160): int {
    $hours = is_numeric($value) ? (int)$value : $fallback;
    return max(1, min($maximum, $hours));
}

function rr_language($metadata): string {
    if (is_string($metadata)) $metadata = json_decode($metadata, true);
    $raw = is_array($metadata) ? ($metadata['reporter_language'] ?? $metadata['reporterLanguage'] ?? 'en') : 'en';
    $language = strtolower(substr(trim((string)$raw), 0, 2));
    return in_array($language, ['en', 'nl', 'fr', 'de', 'pt'], true) ? $language : 'en';
}

function rr_escape($value): string {
    return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
}

function rr_copy(string $language, string $type): array {
    $copy = [
        'en' => [
            'subject_follow_up' => 'Your report is still available: {{ticket}}',
            'subject_unassigned' => 'Your report is awaiting assignment: {{ticket}}',
            'title_follow_up' => 'Your report is still available',
            'title_unassigned' => 'Your report is awaiting assignment',
            'body_follow_up' => 'We are following up to confirm that your report remains safely available in the portal.',
            'body_unassigned' => 'We have received your report. It has not yet been assigned to a handler, but it remains active in the portal.',
            'button' => 'Open your secure report',
            'footer' => 'Keep this link private. It gives secure access to the reply page for your report.',
        ],
        'nl' => [
            'subject_follow_up' => 'Uw melding is nog beschikbaar: {{ticket}}',
            'subject_unassigned' => 'Uw melding wacht op toewijzing: {{ticket}}',
            'title_follow_up' => 'Uw melding is nog beschikbaar',
            'title_unassigned' => 'Uw melding wacht op toewijzing',
            'body_follow_up' => 'Met deze herinnering bevestigen wij dat uw melding veilig beschikbaar blijft in het portaal.',
            'body_unassigned' => 'Wij hebben uw melding ontvangen. Er is nog geen behandelaar toegewezen, maar de melding blijft actief in het portaal.',
            'button' => 'Open uw beveiligde melding',
            'footer' => 'Houd deze link privé. De link geeft beveiligde toegang tot de antwoordpagina van uw melding.',
        ],
        'fr' => [
            'subject_follow_up' => 'Votre signalement est toujours disponible : {{ticket}}',
            'subject_unassigned' => 'Votre signalement attend une attribution : {{ticket}}',
            'title_follow_up' => 'Votre signalement est toujours disponible',
            'title_unassigned' => 'Votre signalement attend une attribution',
            'body_follow_up' => 'Ce rappel confirme que votre signalement reste disponible en toute sécurité dans le portail.',
            'body_unassigned' => 'Nous avons reçu votre signalement. Il n’est pas encore attribué à un gestionnaire, mais il reste actif dans le portail.',
            'button' => 'Ouvrir votre signalement sécurisé',
            'footer' => 'Gardez ce lien privé. Il donne accès de manière sécurisée à la page de réponse de votre signalement.',
        ],
        'de' => [
            'subject_follow_up' => 'Ihre Meldung ist weiterhin verfügbar: {{ticket}}',
            'subject_unassigned' => 'Ihre Meldung wartet auf Zuweisung: {{ticket}}',
            'title_follow_up' => 'Ihre Meldung ist weiterhin verfügbar',
            'title_unassigned' => 'Ihre Meldung wartet auf Zuweisung',
            'body_follow_up' => 'Diese Erinnerung bestätigt, dass Ihre Meldung weiterhin sicher im Portal verfügbar ist.',
            'body_unassigned' => 'Wir haben Ihre Meldung erhalten. Sie wurde noch keinem Bearbeiter zugewiesen, bleibt aber im Portal aktiv.',
            'button' => 'Sichere Meldung öffnen',
            'footer' => 'Halten Sie diesen Link privat. Er ermöglicht den sicheren Zugriff auf die Antwortseite Ihrer Meldung.',
        ],
        'pt' => [
            'subject_follow_up' => 'A sua denúncia continua disponível: {{ticket}}',
            'subject_unassigned' => 'A sua denúncia aguarda atribuição: {{ticket}}',
            'title_follow_up' => 'A sua denúncia continua disponível',
            'title_unassigned' => 'A sua denúncia aguarda atribuição',
            'body_follow_up' => 'Este lembrete confirma que a sua denúncia continua disponível em segurança no portal.',
            'body_unassigned' => 'Recebemos a sua denúncia. Ainda não foi atribuída a um responsável, mas continua ativa no portal.',
            'button' => 'Abrir a denúncia segura',
            'footer' => 'Mantenha esta ligação privada. Ela dá acesso seguro à página de resposta da sua denúncia.',
        ],
    ];
    $local = $copy[$language] ?? $copy['en'];
    $suffix = $type === 'unassigned' ? 'unassigned' : 'follow_up';
    return [
        'subject' => $local['subject_' . $suffix],
        'title' => $local['title_' . $suffix],
        'body' => $local['body_' . $suffix],
        'button' => $local['button'],
        'footer' => $local['footer'],
    ];
}

function rr_base_url(): string {
    $configured = trim((string)(getenv('PORTAL_BASE_URL') ?: ''));
    if ($configured !== '') return rtrim($configured, '/');
    $host = trim((string)($_SERVER['HTTP_HOST'] ?? ''));
    if ($host === '') return '';
    $https = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off')
        || strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
    return ($https ? 'https' : 'http') . '://' . $host;
}

function rr_mail_url(): string {
    $configured = trim((string)(getenv('MAIL_API_INTERNAL_URL') ?: getenv('PHP_MAIL_API_URL') ?: ''));
    return $configured !== '' ? $configured : rr_base_url() . '/api/mail.api.php';
}

function rr_dev_sink(string $toEncrypted, string $subject, string $html, string $text): bool {
    try {
        $to = decrypt_email($toEncrypted, get_email_crypto_key());
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return false;
        $dir = trim((string)(getenv('MAIL_OUTBOX_DIR') ?: (__DIR__ . '/outbox')));
        if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) return false;
        $file = rtrim($dir, '/\\') . DIRECTORY_SEPARATOR . 'mail_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.json';
        return file_put_contents($file, json_encode([
            'ts' => date('c'), 'from' => getenv('MAIL_DEFAULT_FROM') ?: 'noreply@nedzink.nl',
            'to' => [$to], 'subject' => $subject, 'html' => $html, 'text' => $text,
            'note' => 'DEV SINK enabled: email not sent via SMTP',
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) !== false;
    } catch (Throwable $e) {
        api_log_exception('reporter-reminders.dev-sink', $e);
        return false;
    }
}

function rr_send_mail(string $toEncrypted, string $subject, string $html, string $text): bool {
    if (in_array(strtolower(trim((string)(getenv('MAIL_DEV_SINK') ?: 'false'))), ['1', 'true', 'yes', 'on'], true)) {
        return rr_dev_sink($toEncrypted, $subject, $html, $text);
    }
    $url = rr_mail_url();
    if ($url === '' || !function_exists('curl_init')) return false;
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode([
            'from' => getenv('MAIL_DEFAULT_FROM') ?: 'noreply@nedzink.nl',
            'to_encrypted' => $toEncrypted, 'subject' => $subject, 'html' => $html, 'text' => $text,
        ], JSON_UNESCAPED_UNICODE),
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 20,
    ]);
    $response = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = trim((string)curl_error($ch));
    curl_close($ch);
    if ($response === false) {
        error_log('[reporter-reminders.api] mail API failed: ' . api_redact_sensitive($error));
        return false;
    }
    $decoded = json_decode((string)$response, true);
    return $status >= 200 && $status < 300 && is_array($decoded) && !empty($decoded['success']);
}

function rr_claim(string $ticketId, string $type): bool {
    $rows = sqlserver_query(
        "MERGE dbo.reporter_reminder_deliveries WITH (HOLDLOCK) AS target
         USING (SELECT @ticket_id AS ticket_id, @reminder_type AS reminder_type) AS source
         ON target.ticket_id = source.ticket_id AND target.reminder_type = source.reminder_type
         WHEN MATCHED AND (
             (target.status = N'failed' AND (target.next_attempt_at IS NULL OR target.next_attempt_at <= SYSUTCDATETIME()))
             OR (target.status = N'processing' AND target.last_attempt_at < DATEADD(MINUTE, -30, SYSUTCDATETIME()))
         ) THEN UPDATE SET status = N'processing', attempt_count = target.attempt_count + 1,
             last_attempt_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME(), last_error = NULL
         WHEN NOT MATCHED THEN INSERT (ticket_id, reminder_type, status, attempt_count, last_attempt_at, created_at, updated_at)
             VALUES (source.ticket_id, source.reminder_type, N'processing', 1, SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME())
         OUTPUT inserted.id;",
        ['ticket_id' => $ticketId, 'reminder_type' => $type]
    );
    return !empty($rows);
}

try {
    load_runtime_env(__DIR__);
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') rr_json(405, false, 'Method not allowed');
    if (!sqlserver_is_configured()) throw new Exception('SQL Server is not configured');

    $authMode = 'scheduler';
    if (!rr_scheduler_authorized()) {
        $ctx = api_authz_require_admin(static function (int $status, string $message): void {
            rr_json($status, false, $message);
        }, REPORTER_REMINDER_SCOPES_WRITE);
        $authMode = 'admin';
        $actor = trim((string)($ctx['handler']['id'] ?? $ctx['claims']['sub'] ?? 'unknown'));
        api_rate_limit_enforce('reporter-reminders:admin:' . api_rate_limit_hash($actor), 20, 3600,
            static function (int $retry): void { rr_json(429, false, 'Too many requests', ['retry_after' => $retry]); });
    }

    $settingRows = sqlserver_query(
        'SELECT setting_key, setting_value FROM dbo.system_settings WHERE setting_key IN (@follow_up, @unassigned, @minimum_gap, @retry)',
        ['follow_up' => 'notifications.reporter_follow_up_delay_hours', 'unassigned' => 'notifications.unassigned_report_delay_hours',
            'minimum_gap' => 'notifications.reporter_reminder_min_gap_hours', 'retry' => 'notifications.reporter_reminder_retry_hours']
    );
    $followUpHours = rr_positive_hours(rr_setting_value($settingRows, 'notifications.reporter_follow_up_delay_hours', getenv('REPORTER_FOLLOW_UP_DELAY_HOURS') ?: 24), 24);
    $unassignedHours = rr_positive_hours(rr_setting_value($settingRows, 'notifications.unassigned_report_delay_hours', getenv('REPORTER_UNASSIGNED_DELAY_HOURS') ?: 72), 72);
    $minimumGapHours = rr_positive_hours(rr_setting_value($settingRows, 'notifications.reporter_reminder_min_gap_hours', getenv('REPORTER_REMINDER_MIN_GAP_HOURS') ?: 24), 24, 168);
    $retryHours = rr_positive_hours(rr_setting_value($settingRows, 'notifications.reporter_reminder_retry_hours', getenv('REPORTER_REMINDER_RETRY_HOURS') ?: 6), 6, 168);

    $candidates = sqlserver_query(
        "SELECT t.id, t.ticket_number, t.reporter_email_encrypted, t.metadata, reminder.reminder_type
         FROM dbo.tickets t
         CROSS APPLY (VALUES
             (N'follow_up', DATEADD(HOUR, @follow_up_hours, t.submitted_at)),
             (N'unassigned', DATEADD(HOUR, @unassigned_hours, t.submitted_at))
         ) reminder(reminder_type, due_at)
         LEFT JOIN dbo.workflows w ON w.code = t.workflow_type
         LEFT JOIN dbo.workflow_statuses ws ON ws.workflow_id = w.id AND ws.code = t.status_code
         LEFT JOIN dbo.reporter_reminder_deliveries delivery
             ON delivery.ticket_id = t.id AND delivery.reminder_type = reminder.reminder_type
         WHERE reminder.due_at <= SYSUTCDATETIME()
           AND t.email_notify = 1 AND t.status_email_notify = 1
           AND t.reporter_email_encrypted IS NOT NULL AND LTRIM(RTRIM(t.reporter_email_encrypted)) <> N''
           AND t.handler_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM dbo.ticket_handlers th WHERE th.ticket_id = t.id)
           AND COALESCE(ws.is_terminal, 0) = 0
           AND LOWER(COALESCE(t.status_code, N'')) NOT IN (N'closed', N'completed', N'complete', N'resolved', N'cancelled', N'canceled', N'gesloten', N'afgerond', N'opgelost')
           AND (reminder.reminder_type <> N'unassigned' OR EXISTS (
               SELECT 1 FROM dbo.reporter_reminder_deliveries follow_up_delivery
               WHERE follow_up_delivery.ticket_id = t.id AND follow_up_delivery.reminder_type = N'follow_up'
                 AND follow_up_delivery.status = N'sent'
                 AND follow_up_delivery.sent_at <= DATEADD(HOUR, -@minimum_gap_hours, SYSUTCDATETIME())
           ))
           AND (delivery.id IS NULL OR delivery.status = N'failed' AND (delivery.next_attempt_at IS NULL OR delivery.next_attempt_at <= SYSUTCDATETIME())
                OR delivery.status = N'processing' AND delivery.last_attempt_at < DATEADD(MINUTE, -30, SYSUTCDATETIME()))
         ORDER BY t.submitted_at ASC",
        ['follow_up_hours' => $followUpHours, 'unassigned_hours' => $unassignedHours, 'minimum_gap_hours' => $minimumGapHours]
    );

    $sent = 0; $failed = 0; $skipped = 0;
    foreach ($candidates as $candidate) {
        $ticketId = trim((string)($candidate['id'] ?? ''));
        $type = trim((string)($candidate['reminder_type'] ?? ''));
        if ($ticketId === '' || !in_array($type, ['follow_up', 'unassigned'], true) || !rr_claim($ticketId, $type)) {
            $skipped++; continue;
        }
        $language = rr_language($candidate['metadata'] ?? null);
        $copy = rr_copy($language, $type);
        $ticketNumber = trim((string)($candidate['ticket_number'] ?? ''));
        $replyToken = bin2hex(random_bytes(32));
        sqlserver_execute(
            'INSERT INTO dbo.ticket_reply_tokens (ticket_id, token, token_hash, expires_at, created_at) VALUES (@ticket_id, NULL, @token_hash, DATEADD(DAY, @ttl_days, SYSUTCDATETIME()), SYSUTCDATETIME())',
            ['ticket_id' => $ticketId, 'token_hash' => portal_token_hash('ticket-reply-token', $replyToken), 'ttl_days' => max(1, (int)(getenv('REPORTER_REPLY_TOKEN_TTL_DAYS') ?: 365))]
        );
        $url = rr_base_url() . '/reply/' . rawurlencode($replyToken);
        $subject = str_replace('{{ticket}}', $ticketNumber, $copy['subject']);
        $html = '<h2>' . rr_escape($copy['title']) . '</h2><p>' . rr_escape($copy['body']) . '</p>'
            . '<p><strong>' . rr_escape($ticketNumber) . '</strong></p><p><a href="' . rr_escape($url) . '">' . rr_escape($copy['button']) . '</a></p>'
            . '<p style="color:#64748b;font-size:12px">' . rr_escape($copy['footer']) . '</p>';
        $text = $copy['title'] . "\n\n" . $copy['body'] . "\n\n" . $ticketNumber . "\n" . $url . "\n\n" . $copy['footer'];
        if (rr_send_mail((string)$candidate['reporter_email_encrypted'], $subject, $html, $text)) {
            sqlserver_execute(
                "UPDATE dbo.reporter_reminder_deliveries SET status = N'sent', sent_at = SYSUTCDATETIME(), next_attempt_at = NULL,
                 last_error = NULL, updated_at = SYSUTCDATETIME() WHERE ticket_id = @ticket_id AND reminder_type = @reminder_type",
                ['ticket_id' => $ticketId, 'reminder_type' => $type]
            );
            $sent++;
        } else {
            sqlserver_execute(
                "UPDATE dbo.reporter_reminder_deliveries SET status = N'failed', next_attempt_at = DATEADD(HOUR, @retry_hours, SYSUTCDATETIME()),
                 last_error = N'Mail delivery failed', updated_at = SYSUTCDATETIME() WHERE ticket_id = @ticket_id AND reminder_type = @reminder_type",
                ['ticket_id' => $ticketId, 'reminder_type' => $type, 'retry_hours' => $retryHours]
            );
            $failed++;
        }
    }

    rr_json(200, true, 'Reporter reminder run completed', [
        'evaluated' => count($candidates), 'sent' => $sent, 'failed' => $failed, 'skipped' => $skipped,
        'auth_mode' => $authMode, 'follow_up_delay_hours' => $followUpHours, 'unassigned_delay_hours' => $unassignedHours,
    ]);
} catch (Throwable $e) {
    $errorId = api_log_exception('reporter-reminders.api', $e);
    rr_json(500, false, 'Internal server error', ['error_id' => $errorId]);
}
