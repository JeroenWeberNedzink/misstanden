<?php
declare(strict_types=1);
/**
 * mail.api.php
 * - Accepts POST (JSON or form-data) + OPTIONS
 * - Sends email via SMTP (prod) OR writes to dev outbox (dev)
 * - Always returns JSON (even on fatal errors)
 */

$debugMode = (isset($_GET['debug']) && $_GET['debug'] === '1');

// ---------- Headers ----------

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// ---------- Always return JSON on fatal ----------
register_shutdown_function(function () use ($debugMode) {
    $err = error_get_last();
    if (!$err) return;

    $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR];
    if (!in_array($err['type'], $fatalTypes, true)) return;

    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Fatal error in mail.api.php',
        'error'   => $debugMode ? $err : null,
    ], JSON_UNESCAPED_UNICODE);
});
function loadEnvFile(string $file, bool $override = true): void {
  if (!is_file($file)) return;

  foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
    $line = trim($line);
    if ($line === '' || str_starts_with($line, '#')) continue;
    if (!str_contains($line, '=')) continue;

    [$key, $val] = explode('=', $line, 2);
    $key = trim($key);
    $val = trim($val);

    // strip optional quotes
    if ((str_starts_with($val, '"') && str_ends_with($val, '"')) || (str_starts_with($val, "'") && str_ends_with($val, "'"))) {
      $val = substr($val, 1, -1);
    }

    if ($override || getenv($key) === false) {
      putenv("$key=$val");
      $_ENV[$key] = $val;
    }
  }
}

loadEnvFile(__DIR__ . '/../../.env.local', true);
loadEnvFile(__DIR__ . '/../../.env', false); // optional: let .env.local win
error_log("MAIL_DEV_SINK getenv=" . var_export(getenv('MAIL_DEV_SINK'), true));
error_log("MAIL_DEV_SINK _ENV=" . var_export($_ENV['MAIL_DEV_SINK'] ?? null, true));
// ---------- Preflight ----------
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'OK'], JSON_UNESCAPED_UNICODE);
    exit;
}

// ---------- Error reporting ----------
ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/../../php-errors.log');

if ($debugMode) {
    ini_set('display_errors', '1');
    ini_set('display_startup_errors', '1');
    error_reporting(E_ALL);
} else {
    ini_set('display_errors', '0');
    error_reporting(0);
}

// ---------- Helpers ----------
final class ApiResponse {
    public static function json(int $code, bool $success, string $message, array $data = [], array $debug = []): void {
        http_response_code($code);
        echo json_encode([
            'success' => $success,
            'message' => $message,
            'data'    => $data,
            'debug'   => $debug,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

final class Logger {
    private bool $enabled;
    private array $messages = [];

    public function __construct(bool $enabled) { $this->enabled = $enabled; }

    public function log(string $msg): void {
        if ($this->enabled) $this->messages[] = sprintf('[%s] %s', date('Y-m-d H:i:s'), $msg);
    }
    public function all(): array { return $this->messages; }
}

final class MailEnv {
    public static function get(string $key, ?string $default = null): ?string {
        $v = getenv($key);
        if ($v === false || $v === '') return $default;
        return $v;
    }

    public static function bool(string $key, bool $default = false): bool {
        $v = self::get($key, null);
        if ($v === null) return $default;
        return in_array(strtolower($v), ['1','true','yes','on'], true);
    }

    public static function int(string $key, int $default): int {
        $v = self::get($key, null);
        if ($v === null) return $default;
        return (int)$v;
    }
}

final class MailUtil {
    public static function validateEmail(string $email): bool {
        return filter_var(trim($email), FILTER_VALIDATE_EMAIL) !== false;
    }

    public static function sanitize(string $s): string {
        return htmlspecialchars(strip_tags(trim($s)), ENT_QUOTES, 'UTF-8');
    }

    public static function parseEmailList(string $emails): array {
        // allow ; , or whitespace as separators
        $emails = str_replace([',', "\n", "\r", "\t"], ';', $emails);
        $parts = array_filter(array_map('trim', explode(';', $emails)));
        $out = [];
        foreach ($parts as $e) {
            if (self::validateEmail($e)) $out[] = $e;
        }
        return array_values(array_unique($out));
    }

    public static function htmlToText(string $html): string {
        $text = preg_replace('/<\s*br\s*\/?>/i', "\n", $html);
        $text = strip_tags($text);
        return html_entity_decode($text ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }
}

// ---------- Config ----------
final class MailConfig {
    // Dev fallback: write emails to /public/api/outbox/*.json instead of SMTP
    public static function devSinkEnabled(): bool {
        return MailEnv::bool('MAIL_DEV_SINK', false);
    }

    public static function outboxDir(): string {
        return MailEnv::get('MAIL_OUTBOX_DIR', __DIR__ . '/outbox') ?? (__DIR__ . '/outbox');
    }

    // SMTP settings (prod or if you explicitly disable sink)
    public static function smtpHost(): string { return MailEnv::get('SMTP_HOST', 'nedzink-nl.mail.protection.outlook.com'); }
    public static function smtpPort(): int { return MailEnv::int('SMTP_PORT', 25); }
    public static function smtpSecure(): string { return MailEnv::get('SMTP_SECURE', '') ?? ''; } // '', 'tls', 'ssl'
    public static function smtpAuth(): bool { return MailEnv::bool('SMTP_AUTH', false); }
    public static function smtpUser(): string { return MailEnv::get('SMTP_USER', '') ?? ''; }
    public static function smtpPass(): string { return MailEnv::get('SMTP_PASS', '') ?? ''; }

    public static function defaultFrom(): string { return MailEnv::get('MAIL_DEFAULT_FROM', 'noreply@nedzink.nl') ?? 'noreply@nedzink.nl'; }
    public static function defaultFromName(): string { return MailEnv::get('MAIL_DEFAULT_FROM_NAME', 'Misstanden Portal') ?? 'Misstanden Portal'; }

    public static function maxFileSize(): int { return 10 * 1024 * 1024; }
    public static function tempDir(): string { return __DIR__ . '/temp'; }

    public static function allowedMimeTypes(): array {
        return [
            'application/pdf',
            'image/jpeg','image/jpg','image/png','image/gif',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain','text/csv'
        ];
    }
}

// ---------- PHPMailer ----------
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;
use PHPMailer\PHPMailer\SMTP;

require_once __DIR__ . '/src/PHPMailer/Exception.php';
require_once __DIR__ . '/src/PHPMailer/PHPMailer.php';
require_once __DIR__ . '/src/PHPMailer/SMTP.php';

// ---------- Main ----------
try {
    $logger = new Logger($debugMode);

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        ApiResponse::json(405, false, 'Only POST requests are allowed');
    }

    // Read JSON if present
    $raw = file_get_contents('php://input');
    $jsonInput = json_decode($raw ?? '', true);
    $isJson = is_array($jsonInput) && json_last_error() === JSON_ERROR_NONE;

    // Gather fields (JSON has priority if present)
    $mailfrom = $isJson ? ($jsonInput['from'] ?? MailConfig::defaultFrom()) : (($_POST['mailfrom'] ?? MailConfig::defaultFrom()));
    $mailto   = $isJson ? ($jsonInput['to']   ?? '') : (($_POST['mailto'] ?? ''));

    $mailcc   = $isJson ? ($jsonInput['cc']   ?? '') : (($_POST['mailcc'] ?? ''));
    $mailbcc  = $isJson ? ($jsonInput['bcc']  ?? '') : (($_POST['mailbcc'] ?? ''));

    $subject  = $isJson ? ($jsonInput['subject'] ?? '') : (($_POST['mailsubject'] ?? ''));
    $html     = $isJson ? ($jsonInput['html'] ?? '')    : (($_POST['mailhtml'] ?? ''));
    $text     = $isJson ? ($jsonInput['text'] ?? '')    : (($_POST['mailtext'] ?? ''));

    $mailfrom = trim((string)$mailfrom);
    $mailto   = is_array($mailto) ? implode(';', $mailto) : (string)$mailto;

    $subject  = MailUtil::sanitize((string)$subject);

    // SLA payload support (type)
    if ($isJson && isset($jsonInput['type'])) {
        $type = (string)$jsonInput['type'];
        $ticket  = $jsonInput['ticket'] ?? [];
        $handler = $jsonInput['handler'] ?? [];

        $ticketNumber = $ticket['ticket_number'] ?? 'Unknown';
        $severity     = strtoupper((string)($ticket['severity_code'] ?? 'medium'));
        $location     = (string)($ticket['location'] ?? 'Niet opgegeven');
        $description  = (string)($ticket['description'] ?? '');

        if ($type === 'sla_warning') {
            $hoursRemaining = (float)($jsonInput['hours_remaining'] ?? 0);
            $subject = "⚠️ SLA Waarschuwing: Ticket {$ticketNumber}";
            $html = "
              <h2>SLA Waarschuwing</h2>
              <p>Hallo " . htmlspecialchars((string)($handler['name'] ?? '')) . ",</p>
              <p>De SLA-deadline nadert. Nog <strong>{$hoursRemaining} uur</strong>.</p>
              <div style=\"background:#fef3c7;border-left:4px solid #f59e0b;padding:14px;border-radius:8px\">
                <p><strong>Ticket:</strong> {$ticketNumber}</p>
                <p><strong>Ernst:</strong> {$severity}</p>
                <p><strong>Locatie:</strong> " . htmlspecialchars($location) . "</p>
                <p><strong>Omschrijving:</strong><br/>" . nl2br(htmlspecialchars($description)) . "</p>
              </div>
              <p style=\"font-size:12px;color:#6b7280\">Log in op het portaal om actie te ondernemen.</p>
            ";
        } elseif ($type === 'sla_breach') {
            $hoursOverdue = (float)($jsonInput['hours_overdue'] ?? 0);
            $subject = "SLA OVERSCHREDEN: Ticket {$ticketNumber}";
            $html = "
              <h2>SLA Deadline Overschreden</h2>
              <p>Hallo " . htmlspecialchars((string)($handler['name'] ?? '')) . ",</p>
              <p><strong style=\"color:#dc2626\">De deadline is overschreden</strong> met {$hoursOverdue} uur.</p>
              <div style=\"background:#fee2e2;border-left:4px solid #dc2626;padding:14px;border-radius:8px\">
                <p><strong>Ticket:</strong> {$ticketNumber}</p>
                <p><strong>Ernst:</strong> {$severity}</p>
                <p><strong>Locatie:</strong> " . htmlspecialchars($location) . "</p>
                <p><strong>Omschrijving:</strong><br/>" . nl2br(htmlspecialchars($description)) . "</p>
              </div>
              <p style=\"font-size:12px;color:#6b7280\">Open het portaal om direct te escaleren.</p>
            ";
        }

        // In SLA payloads you already set "to"
        $mailto = (string)($jsonInput['to'] ?? $mailto);
    }

    // Validate from/to
    if (!MailUtil::validateEmail($mailfrom)) {
        ApiResponse::json(400, false, 'Valid sender email is required', [], $logger->all());
    }

    $to = MailUtil::parseEmailList($mailto);
    $cc = MailUtil::parseEmailList((string)$mailcc);
    $bcc = MailUtil::parseEmailList((string)$mailbcc);

    if (!$to) {
        ApiResponse::json(400, false, 'At least one valid recipient is required', [], $logger->all());
    }

    if ($html !== '' && $text === '') $text = MailUtil::htmlToText($html);
    if ($html === '' && $text !== '') $html = nl2br(htmlspecialchars($text, ENT_QUOTES, 'UTF-8'));

    // ---------- DEV SINK ----------
    // If MAIL_DEV_SINK=true (default), do not attempt SMTP (avoids port 25 timeout in dev).
    if (MailConfig::devSinkEnabled()) {
        $outbox = MailConfig::outboxDir();
        if (!is_dir($outbox)) mkdir($outbox, 0755, true);

        $id = date('Ymd_His') . '_' . bin2hex(random_bytes(4));
        $file = rtrim($outbox, '/') . "/mail_{$id}.json";

        $payload = [
            'id' => $id,
            'ts' => date('c'),
            'from' => $mailfrom,
            'to' => $to,
            'cc' => $cc,
            'bcc' => $bcc,
            'subject' => $subject,
            'html' => $html,
            'text' => $text,
            'note' => 'DEV SINK enabled: email not sent via SMTP',
        ];

        file_put_contents($file, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

        $logger->log("DEV SINK wrote: {$file}");

        ApiResponse::json(200, true, 'Email captured by DEV outbox (not sent)', [
            'outbox_file' => $file,
            'to' => $to,
            'subject' => $subject,
        ], $logger->all());
    }

    // ---------- SMTP SEND ----------
    $logger->log('Attempting SMTP send');
    $logger->log('SMTP host: ' . MailConfig::smtpHost() . ':' . MailConfig::smtpPort());

    // Attachments (optional)
    $tempFiles = [];
    if (!is_dir(MailConfig::tempDir())) mkdir(MailConfig::tempDir(), 0755, true);

    $mail = new PHPMailer(true);
    $mail->CharSet = 'UTF-8';
    $mail->Encoding = 'base64';

    if ($debugMode) {
        $mail->SMTPDebug = SMTP::DEBUG_SERVER;
        $mail->Debugoutput = function ($str, $level) use ($logger) {
            $logger->log("SMTP Debug [$level]: $str");
        };
    }

    $mail->isSMTP();
    $mail->Host = MailConfig::smtpHost();
    $mail->Port = MailConfig::smtpPort();

    // Read from environment variables
    $mail->SMTPAuth = MailConfig::smtpAuth();
    $mail->SMTPSecure = MailConfig::smtpSecure();
    $mail->SMTPAutoTLS = false;  // Disable automatic TLS for plain port 25 relay

    // Timeouts: avoid 60s hang
    $mail->Timeout = 10;
    $mail->SMTPKeepAlive = false;

    if ($mail->SMTPAuth) {
        $mail->Username = MailConfig::smtpUser();
        $mail->Password = MailConfig::smtpPass();
    }

    // (Optional) Relax SSL checks (useful for weird corp proxies)
    $mail->SMTPOptions = [
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false,
            'allow_self_signed' => true,
        ],
    ];

    $mail->setFrom($mailfrom, MailConfig::defaultFromName());

    foreach ($to as $addr) $mail->addAddress($addr);
    foreach ($cc as $addr) $mail->addCC($addr);
    foreach ($bcc as $addr) $mail->addBCC($addr);

    // Uploaded files
    foreach ($_FILES as $file) {
        if (!isset($file['tmp_name'], $file['name'], $file['size'], $file['error'])) continue;
        if ($file['error'] !== UPLOAD_ERR_OK) continue;
        if ($file['size'] > MailConfig::maxFileSize()) continue;

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $file['tmp_name']) ?: '';
        finfo_close($finfo);

        if (!in_array($mime, MailConfig::allowedMimeTypes(), true)) continue;

        $safeName = preg_replace('/[^a-zA-Z0-9._-]/', '_', (string)$file['name']);
        $dest = rtrim(MailConfig::tempDir(), '/') . '/' . uniqid('att_', true) . '_' . $safeName;
        if (move_uploaded_file($file['tmp_name'], $dest)) {
            $tempFiles[] = $dest;
            $mail->addAttachment($dest, $safeName);
        }
    }

    $mail->isHTML(true);
    $mail->Subject = $subject;
    $mail->Body = $html;
    $mail->AltBody = $text;

    $mail->send();

    // Cleanup
    foreach ($tempFiles as $f) @unlink($f);

    ApiResponse::json(200, true, 'Email sent successfully', [
        'to' => $to,
        'cc' => $cc,
        'bcc' => $bcc,
        'subject' => $subject
    ], $logger->all());

} catch (\Throwable $e) {
    ApiResponse::json(500, false, 'Failed to send email: ' . $e->getMessage(), [], $debugMode ? [
        'exception' => [
            'type' => get_class($e),
            'message' => $e->getMessage(),
            'file' => $e->getFile(),
            'line' => $e->getLine(),
        ],
        'smtp_log' => $logger->all(),
    ] : []);
}