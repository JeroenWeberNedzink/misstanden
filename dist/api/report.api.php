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

function report_safe($value): string {
    return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
}

function report_parse_json($value, $fallback = []) {
    if (is_array($value)) {
        return $value;
    }
    if (!is_string($value) || trim($value) === '') {
        return $fallback;
    }
    $decoded = json_decode($value, true);
    return json_last_error() === JSON_ERROR_NONE ? $decoded : $fallback;
}

function report_format_dt($value): string {
    $raw = trim((string)$value);
    if ($raw === '') {
        return '-';
    }
    $ts = strtotime($raw);
    if ($ts === false) {
        return $raw;
    }
    return gmdate('Y-m-d H:i:s', $ts) . ' UTC';
}

function report_vendor_autoload_path(): ?string {
    $candidates = [
        __DIR__ . '/../vendor/autoload.php',
        __DIR__ . '/../../vendor/autoload.php',
    ];

    foreach ($candidates as $candidate) {
        if (is_file($candidate)) {
            return $candidate;
        }
    }

    return null;
}

function report_build_timeline(array $ticket): array {
    $timeline = [[
        'type' => 'ticket_created',
        'at' => (string)($ticket['submitted_at'] ?? ''),
        'title' => 'Ticket created',
        'description' => 'Initial report was submitted',
    ]];

    foreach (($ticket['messages'] ?? []) as $message) {
        if (!is_array($message)) {
            continue;
        }
        $timeline[] = [
            'type' => 'message',
            'at' => (string)($message['created_at'] ?? ''),
            'title' => 'Message (' . report_safe((string)($message['sender'] ?? 'unknown')) . ')',
            'description' => (string)($message['body'] ?? ''),
        ];
    }

    foreach (($ticket['ticket_comments'] ?? []) as $comment) {
        if (!is_array($comment)) {
            continue;
        }
        $timeline[] = [
            'type' => 'note',
            'at' => (string)($comment['created_at'] ?? ''),
            'title' => 'Investigation note',
            'description' => (string)($comment['comment'] ?? ''),
        ];
    }

    foreach (($ticket['ticket_actions'] ?? []) as $action) {
        if (!is_array($action)) {
            continue;
        }
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
    foreach ($handlers as $item) {
        $handler = is_array($item['handler'] ?? null) ? $item['handler'] : [];
        $handlerRows .= '<tr>'
            . '<td>' . report_safe($handler['name'] ?? '-') . '</td>'
            . '<td>' . report_safe($handler['email'] ?? '-') . '</td>'
            . '<td>' . report_safe($item['role'] ?? '-') . '</td>'
            . '<td>' . report_format_dt($item['assigned_at'] ?? $item['created_at'] ?? null) . '</td>'
            . '</tr>';
    }
    if ($handlerRows === '') {
        $handlerRows = '<tr><td colspan="4">No handlers assigned</td></tr>';
    }

    $attachmentRows = '';
    foreach ($attachments as $attachment) {
        if (!is_array($attachment)) {
            continue;
        }
        $attachmentRows .= '<tr>'
            . '<td>' . report_safe($attachment['file_name'] ?? '-') . '</td>'
            . '<td>' . report_safe($attachment['mime_type'] ?? '-') . '</td>'
            . '<td>' . report_safe((string)($attachment['size_bytes'] ?? '-')) . '</td>'
            . '<td>' . report_format_dt($attachment['created_at'] ?? null) . '</td>'
            . '</tr>';
    }
    if ($attachmentRows === '') {
        $attachmentRows = '<tr><td colspan="4">No attachments</td></tr>';
    }

    $notesRows = '';
    foreach ($notes as $note) {
        if (!is_array($note)) {
            continue;
        }
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
    load_runtime_env(__DIR__);
    api_apply_no_store_headers();

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        report_json(405, false, 'Method not allowed');
    }
    if (!sqlserver_is_configured()) {
        throw new Exception('SQL Server is not configured');
    }

    api_authz_require_admin(static function (int $status, string $message): void {
        report_json($status, false, $message);
    });

    $raw = file_get_contents('php://input');
    $payload = json_decode($raw ?? '', true);
    if (!is_array($payload)) {
        $payload = [];
    }

    $ticketId = trim((string)($payload['ticket_id'] ?? ''));
    if ($ticketId === '') {
        report_json(400, false, 'ticket_id is required');
    }

    $ticketRows = sqlserver_query(
        'SELECT TOP 1
            id,
            ticket_number,
            workflow_type,
            status_code,
            current_stage,
            severity_code,
            description,
            description_encrypted,
            location,
            location_encrypted,
            submitted_at,
            last_update_at,
            metadata
         FROM dbo.tickets
         WHERE id = @ticket_id',
        ['ticket_id' => $ticketId]
    );
    $ticket = $ticketRows[0] ?? null;
    if (!$ticket) {
        report_json(404, false, 'Ticket not found');
    }

    $ticket = ticket_crypto_decrypt_ticket_row($ticket, true);
    $ticket['metadata'] = report_parse_json($ticket['metadata'] ?? null, []);
    $ticket['attachments'] = sqlserver_query(
        'SELECT * FROM dbo.attachments WHERE ticket_id = @ticket_id ORDER BY created_at ASC',
        ['ticket_id' => $ticketId]
    );
    $ticket['messages'] = array_map('ticket_crypto_decrypt_message_row', sqlserver_query(
        'SELECT * FROM dbo.messages WHERE ticket_id = @ticket_id ORDER BY created_at ASC',
        ['ticket_id' => $ticketId]
    ));
    $ticket['ticket_comments'] = array_map('ticket_crypto_decrypt_comment_row', sqlserver_query(
        'SELECT * FROM dbo.ticket_comments WHERE ticket_id = @ticket_id ORDER BY created_at ASC',
        ['ticket_id' => $ticketId]
    ));
    $ticket['ticket_actions'] = array_map('ticket_crypto_decrypt_action_row', sqlserver_query(
        'SELECT * FROM dbo.ticket_actions WHERE ticket_id = @ticket_id ORDER BY created_at ASC',
        ['ticket_id' => $ticketId]
    ));

    $handlerRows = sqlserver_query(
        'SELECT
            th.id,
            th.ticket_id,
            th.handler_id,
            th.role,
            th.assigned_at,
            th.created_at,
            h.id AS handler_ref_id,
            h.name AS handler_name,
            h.email AS handler_email,
            h.roles AS handler_roles,
            h.active AS handler_active
         FROM dbo.ticket_handlers th
         LEFT JOIN dbo.handlers h ON h.id = th.handler_id
         WHERE th.ticket_id = @ticket_id
         ORDER BY th.assigned_at ASC, th.created_at ASC',
        ['ticket_id' => $ticketId]
    );

    $ticket['ticket_handlers'] = array_map(static function (array $row): array {
        return [
            'id' => $row['id'] ?? null,
            'ticket_id' => $row['ticket_id'] ?? null,
            'handler_id' => $row['handler_id'] ?? null,
            'role' => $row['role'] ?? null,
            'assigned_at' => $row['assigned_at'] ?? null,
            'created_at' => $row['created_at'] ?? null,
            'handler' => [
                'id' => $row['handler_ref_id'] ?? null,
                'name' => $row['handler_name'] ?? null,
                'email' => $row['handler_email'] ?? null,
                'roles' => report_parse_json($row['handler_roles'] ?? null, []),
                'active' => isset($row['handler_active']) ? (bool)$row['handler_active'] : null,
            ],
        ];
    }, $handlerRows);

    $html = report_render_html($ticket);

    $ticketNumber = preg_replace('/[^A-Za-z0-9._-]/', '_', (string)($ticket['ticket_number'] ?? $ticketId));
    if ($ticketNumber === '' || $ticketNumber === null) {
        $ticketNumber = $ticketId;
    }

    $autoloadPath = report_vendor_autoload_path();
    if ($autoloadPath !== null) {
        require_once $autoloadPath;
    }

    if (!class_exists('Dompdf\\Dompdf')) {
        $filename = 'investigation-report-' . $ticketNumber . '.html';
        header('Content-Type: text/html; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        echo $html;
        exit;
    }

    $dompdf = new Dompdf\Dompdf([
        'isRemoteEnabled' => false,
        'isHtml5ParserEnabled' => true,
    ]);
    $dompdf->loadHtml($html, 'UTF-8');
    $dompdf->setPaper('A4', 'portrait');
    $dompdf->render();

    $filename = 'investigation-report-' . $ticketNumber . '.pdf';

    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    echo $dompdf->output();
    exit;
} catch (Throwable $e) {
    $errorId = api_log_exception('report.api', $e);
    report_json(500, false, 'Internal server error', ['error_id' => $errorId]);
}
