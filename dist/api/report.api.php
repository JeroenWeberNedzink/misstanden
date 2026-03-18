<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_admin_auth.php';
require_once __DIR__ . '/_supabase.php';
require_once __DIR__ . '/_errors.php';
require_once __DIR__ . '/_security_headers.php';

api_apply_security_headers([
    'allow_methods' => 'POST, OPTIONS',
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

function report_json(int $status, bool $success, string $message, array $data = []): void {
    http_response_code($status);
    echo json_encode(array_merge([
        'success' => $success,
        'message' => $message,
    ], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function report_supabase_request(string $method, string $url, string $serviceKey): array {
    $headers = [
        'apikey: ' . $serviceKey,
        'Authorization: Bearer ' . $serviceKey,
        'Content-Type: application/json',
    ];

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 30,
    ]);

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

function report_first_row($decoded): ?array {
    if (is_array($decoded) && array_is_list($decoded)) {
        return count($decoded) > 0 && is_array($decoded[0]) ? $decoded[0] : null;
    }
    return is_array($decoded) ? $decoded : null;
}

function report_safe($value): string {
    return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
}

function report_format_dt($value): string {
    $raw = trim((string)$value);
    if ($raw === '') return '-';
    $ts = strtotime($raw);
    if ($ts === false) return $raw;
    return gmdate('Y-m-d H:i:s', $ts) . ' UTC';
}

function report_build_timeline(array $ticket): array {
    $timeline = [];

    $timeline[] = [
        'type' => 'ticket_created',
        'at' => (string)($ticket['submitted_at'] ?? ''),
        'title' => 'Ticket created',
        'description' => 'Initial report was submitted',
    ];

    foreach (($ticket['messages'] ?? []) as $msg) {
        if (!is_array($msg)) continue;
        $timeline[] = [
            'type' => 'message',
            'at' => (string)($msg['created_at'] ?? ''),
            'title' => 'Message (' . report_safe((string)($msg['sender'] ?? 'unknown')) . ')',
            'description' => (string)($msg['body'] ?? ''),
        ];
    }

    foreach (($ticket['ticket_comments'] ?? []) as $note) {
        if (!is_array($note)) continue;
        $timeline[] = [
            'type' => 'note',
            'at' => (string)($note['created_at'] ?? ''),
            'title' => 'Investigation note',
            'description' => (string)($note['comment'] ?? ''),
        ];
    }

    foreach (($ticket['ticket_actions'] ?? []) as $action) {
        if (!is_array($action)) continue;
        $timeline[] = [
            'type' => 'action',
            'at' => (string)($action['created_at'] ?? ''),
            'title' => (string)($action['action'] ?? 'Action'),
            'description' => (string)($action['description'] ?? ''),
        ];
    }

    usort($timeline, static function ($a, $b) {
        $ta = strtotime((string)($a['at'] ?? '')) ?: 0;
        $tb = strtotime((string)($b['at'] ?? '')) ?: 0;
        return $ta <=> $tb;
    });

    return $timeline;
}

function report_render_html(array $ticket): string {
    $ticketNumber = report_safe($ticket['ticket_number'] ?? $ticket['id'] ?? 'unknown');
    $handlers = is_array($ticket['ticket_handlers'] ?? null) ? $ticket['ticket_handlers'] : [];
    $attachments = is_array($ticket['attachments'] ?? null) ? $ticket['attachments'] : [];
    $notes = is_array($ticket['ticket_comments'] ?? null) ? $ticket['ticket_comments'] : [];
    $timeline = report_build_timeline($ticket);

    $handlerRows = '';
    foreach ($handlers as $h) {
        $handler = is_array($h['handlers'] ?? null) ? $h['handlers'] : [];
        $handlerRows .= '<tr>'
            . '<td>' . report_safe($handler['name'] ?? '-') . '</td>'
            . '<td>' . report_safe($handler['email'] ?? '-') . '</td>'
            . '<td>' . report_safe($h['role'] ?? '-') . '</td>'
            . '<td>' . report_format_dt($h['assigned_at'] ?? $h['created_at'] ?? null) . '</td>'
            . '</tr>';
    }
    if ($handlerRows === '') {
        $handlerRows = '<tr><td colspan="4">No handlers assigned</td></tr>';
    }

    $attachmentRows = '';
    foreach ($attachments as $att) {
        if (!is_array($att)) continue;
        $attachmentRows .= '<tr>'
            . '<td>' . report_safe($att['file_name'] ?? '-') . '</td>'
            . '<td>' . report_safe($att['mime_type'] ?? '-') . '</td>'
            . '<td>' . report_safe((string)($att['size_bytes'] ?? '-')) . '</td>'
            . '<td>' . report_format_dt($att['created_at'] ?? null) . '</td>'
            . '</tr>';
    }
    if ($attachmentRows === '') {
        $attachmentRows = '<tr><td colspan="4">No attachments</td></tr>';
    }

    $notesRows = '';
    foreach ($notes as $note) {
        if (!is_array($note)) continue;
        $notesRows .= '<tr>'
            . '<td>' . report_format_dt($note['created_at'] ?? null) . '</td>'
            . '<td>' . report_safe($note['author_name'] ?? '-') . '</td>'
            . '<td>' . report_safe($note['comment'] ?? '') . '</td>'
            . '</tr>';
    }
    if ($notesRows === '') {
        $notesRows = '<tr><td colspan="3">No investigation notes</td></tr>';
    }

    $timelineRows = '';
    foreach ($timeline as $event) {
        $timelineRows .= '<tr>'
            . '<td>' . report_format_dt($event['at'] ?? null) . '</td>'
            . '<td>' . report_safe($event['title'] ?? '-') . '</td>'
            . '<td>' . report_safe($event['description'] ?? '') . '</td>'
            . '</tr>';
    }
    if ($timelineRows === '') {
        $timelineRows = '<tr><td colspan="3">No timeline entries</td></tr>';
    }

    return '<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: DejaVu Sans, Arial, sans-serif; font-size: 12px; color: #1f2937; }
    h1 { font-size: 20px; margin: 0 0 10px; }
    h2 { font-size: 14px; margin: 16px 0 8px; padding-top: 6px; border-top: 1px solid #e5e7eb; }
    .meta { margin-bottom: 12px; }
    .meta div { margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #d1d5db; padding: 6px; vertical-align: top; }
    th { background: #f3f4f6; text-align: left; }
    .muted { color: #6b7280; }
  </style>
</head>
<body>
  <h1>Investigation Report - ' . $ticketNumber . '</h1>
  <div class="meta">
    <div><strong>Generated:</strong> ' . report_format_dt(gmdate('c')) . '</div>
    <div><strong>Status:</strong> ' . report_safe($ticket['status_code'] ?? '-') . '</div>
    <div><strong>Workflow:</strong> ' . report_safe($ticket['workflow_type'] ?? '-') . '</div>
    <div><strong>Priority:</strong> ' . report_safe($ticket['severity_code'] ?? '-') . '</div>
    <div><strong>Submitted:</strong> ' . report_format_dt($ticket['submitted_at'] ?? null) . '</div>
    <div><strong>Last update:</strong> ' . report_format_dt($ticket['last_update_at'] ?? null) . '</div>
    <div><strong>Location:</strong> ' . report_safe($ticket['location'] ?? '-') . '</div>
  </div>

  <h2>Case Description</h2>
  <div>' . nl2br(report_safe($ticket['description'] ?? '-')) . '</div>

  <h2>Assigned Handlers</h2>
  <table>
    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Assigned at</th></tr></thead>
    <tbody>' . $handlerRows . '</tbody>
  </table>

  <h2>Timeline</h2>
  <table>
    <thead><tr><th>Timestamp</th><th>Event</th><th>Description</th></tr></thead>
    <tbody>' . $timelineRows . '</tbody>
  </table>

  <h2>Messages</h2>
  <div class="muted">Included in timeline. Internal visibility flags are preserved in source data.</div>

  <h2>Attachments</h2>
  <table>
    <thead><tr><th>File name</th><th>MIME</th><th>Size (bytes)</th><th>Uploaded</th></tr></thead>
    <tbody>' . $attachmentRows . '</tbody>
  </table>

  <h2>Resolution Notes</h2>
  <table>
    <thead><tr><th>Timestamp</th><th>Author</th><th>Note</th></tr></thead>
    <tbody>' . $notesRows . '</tbody>
  </table>
</body>
</html>';
}

try {
    load_env_file(__DIR__ . '/../../.env.local', true);
    load_env_file(__DIR__ . '/../../.env', false);

    api_apply_no_store_headers();

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        report_json(405, false, 'Method not allowed');
    }

    $ctx = api_authz_require_admin(static function (int $status, string $message): void {
        report_json($status, false, $message);
    });

    $baseUrl = rtrim((string)$ctx['base_url'], '/');
    $serviceKey = (string)$ctx['service_key'];

    $raw = file_get_contents('php://input');
    $payload = json_decode($raw ?? '', true);
    if (!is_array($payload)) $payload = [];

    $ticketId = trim((string)($payload['ticket_id'] ?? ''));
    if ($ticketId === '') {
        report_json(400, false, 'ticket_id is required');
    }

    $select = 'id,ticket_number,workflow_type,status_code,current_stage,severity_code,description,location,submitted_at,last_update_at,attachments(*),messages(*),ticket_comments(*),ticket_actions(*),ticket_handlers(id,ticket_id,handler_id,role,assigned_at,created_at,handlers:handler_id(id,name,email,roles,active))';
    $url = $baseUrl
        . '/rest/v1/tickets?select=' . rawurlencode($select)
        . '&id=eq.' . rawurlencode($ticketId)
        . '&limit=1';

    [$code, $decoded, $rawResp] = report_supabase_request('GET', $url, $serviceKey);
    if ($code < 200 || $code >= 300) {
        $msg = is_array($decoded) ? json_encode($decoded, JSON_UNESCAPED_UNICODE) : (string)$rawResp;
        throw new Exception('Failed to load ticket for report: ' . $msg);
    }

    $ticket = report_first_row($decoded);
    if (!$ticket) {
        report_json(404, false, 'Ticket not found');
    }

    $autoloadPath = __DIR__ . '/../../vendor/autoload.php';
    if (!is_file($autoloadPath)) {
        report_json(500, false, 'PDF generator not installed (dompdf missing). Run composer install.');
    }
    require_once $autoloadPath;
    if (!class_exists('Dompdf\\Dompdf')) {
        report_json(500, false, 'PDF generator not available (dompdf class missing).');
    }

    $html = report_render_html($ticket);

    $dompdf = new Dompdf\Dompdf([
        'isRemoteEnabled' => false,
        'isHtml5ParserEnabled' => true,
    ]);
    $dompdf->loadHtml($html, 'UTF-8');
    $dompdf->setPaper('A4', 'portrait');
    $dompdf->render();

    $ticketNumber = preg_replace('/[^A-Za-z0-9._-]/', '_', (string)($ticket['ticket_number'] ?? $ticketId));
    if ($ticketNumber === '' || $ticketNumber === null) {
        $ticketNumber = $ticketId;
    }
    $filename = 'investigation-report-' . $ticketNumber . '.pdf';

    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    echo $dompdf->output();
    exit;
} catch (Throwable $e) {
    $errorId = api_log_exception('report.api', $e);
    report_json(500, false, 'Internal server error', ['error_id' => $errorId]);
}
