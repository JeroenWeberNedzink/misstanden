<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_errors.php';
require_once __DIR__ . '/_security_headers.php';
require_once __DIR__ . '/_sqlserver.php';
require_once __DIR__ . '/_auth0.php';
require_once __DIR__ . '/_admin_auth.php';
require_once __DIR__ . '/_attachment_security.php';
require_once __DIR__ . '/_portal_tokens.php';

api_apply_security_headers(['allow_methods' => 'GET, POST, OPTIONS', 'allow_headers' => 'Content-Type, Authorization']);
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'OK'], JSON_UNESCAPED_UNICODE);
    exit;
}

ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/../../php-errors.log');
ini_set('display_errors', '0');
error_reporting(E_ALL);

function files_json(int $status, bool $success, string $message, array $data = []): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge(['success' => $success, 'message' => $message], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function files_require_handler(): array {
    $ctx = api_authz_require_active_handler(static function (int $status, string $message): void { files_json($status, false, $message); });
    return (array)($ctx['handler'] ?? []);
}

function files_require_handler_ticket(array $handler, string $ticketId): void {
    if (!attachment_security_uuid($ticketId)) files_json(400, false, 'ticket_id must be a valid UUID');
    if (!attachment_security_handler_can_access_ticket($handler, $ticketId)) files_json(403, false, 'Attachment access denied');
}

function files_normalize_access_code($value): string {
    $digits = preg_replace('/\D+/', '', (string)$value) ?? '';
    return preg_match('/^\d{6}$/', $digits) === 1 ? $digits : '';
}

function files_authorize_upload(): array {
    if (auth0_get_bearer_token() !== '') {
        $ticketId = strtolower(trim((string)($_POST['ticket_id'] ?? '')));
        $handler = files_require_handler();
        files_require_handler_ticket($handler, $ticketId);
        return ['ticket_id' => $ticketId, 'scope' => 'handler'];
    }

    $mode = strtolower(trim((string)($_POST['access_mode'] ?? 'reporter')));
    if ($mode === 'reporter') {
        $ticketId = strtolower(trim((string)($_POST['ticket_id'] ?? '')));
        $ticketInput = strtoupper(trim((string)($_POST['ticket_input'] ?? '')));
        $accessCode = files_normalize_access_code($_POST['access_code'] ?? '');
        if (!attachment_security_uuid($ticketId) || $ticketInput === '' || $accessCode === '') files_json(401, false, 'Valid reporter access is required');
        $rows = sqlserver_query(
            'SELECT TOP 1 id FROM dbo.tickets WHERE id = @ticket_id AND (UPPER(ticket_number) = @ticket_input OR CONVERT(NVARCHAR(36), id) = LOWER(@ticket_input)) AND ((access_code_hash IS NOT NULL AND access_code_hash = @access_code_hash) OR access_code = @access_code)',
            ['ticket_id' => $ticketId, 'ticket_input' => $ticketInput, 'access_code_hash' => portal_token_hash('ticket-access-code', $accessCode), 'access_code' => $accessCode]
        );
        if (!$rows) files_json(401, false, 'Valid reporter access is required');
        return ['ticket_id' => $ticketId, 'scope' => 'reporter'];
    }

    if ($mode === 'reply') {
        $token = trim((string)($_POST['reply_token'] ?? ''));
        $rows = $token === '' ? [] : sqlserver_query(
            'SELECT TOP 1 ticket_id FROM dbo.ticket_reply_tokens WHERE expires_at > SYSUTCDATETIME() AND ((token_hash IS NOT NULL AND token_hash = @token_hash) OR token = @token) ORDER BY created_at DESC',
            ['token_hash' => portal_token_hash('ticket-reply-token', $token), 'token' => $token]
        );
        $ticketId = strtolower(trim((string)($rows[0]['ticket_id'] ?? '')));
        if (!attachment_security_uuid($ticketId)) files_json(401, false, 'Valid reply access is required');
        return ['ticket_id' => $ticketId, 'scope' => 'reply'];
    }

    if ($mode === 'guest') {
        $token = trim((string)($_POST['guest_token'] ?? ''));
        $rows = $token === '' ? [] : sqlserver_query(
            "SELECT TOP 1 ticket_id FROM dbo.guest_access WHERE token = @token AND role = N'external_investigator' AND expires_at > SYSUTCDATETIME()",
            ['token' => $token]
        );
        $ticketId = strtolower(trim((string)($rows[0]['ticket_id'] ?? '')));
        if (!attachment_security_uuid($ticketId)) files_json(401, false, 'Valid guest investigator access is required');
        return ['ticket_id' => $ticketId, 'scope' => 'guest'];
    }
    files_json(401, false, 'Valid attachment access is required');
}

function files_settings(): array {
    $rows = sqlserver_query("SELECT setting_key, setting_value FROM dbo.system_settings WHERE setting_key IN (N'portal.enable_attachments', N'portal.max_attachment_size_mb', N'portal.allowed_file_types')");
    $out = [];
    foreach ($rows as $row) {
        $value = $row['setting_value'] ?? null;
        $decoded = is_string($value) ? json_decode($value, true) : null;
        $out[(string)$row['setting_key']] = is_array($decoded) && array_key_exists('value', $decoded) ? $decoded['value'] : ($decoded ?? $value);
    }
    return $out;
}

function files_upload_policy(): array {
    $settings = files_settings();
    $enabled = !array_key_exists('portal.enable_attachments', $settings) || filter_var($settings['portal.enable_attachments'], FILTER_VALIDATE_BOOL);
    $maxMb = min(250, max(1, (int)($settings['portal.max_attachment_size_mb'] ?? 10)));
    $rawAllowed = $settings['portal.allowed_file_types'] ?? ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];
    $allowed = [];
    foreach (is_array($rawAllowed) ? $rawAllowed : explode(',', (string)$rawAllowed) as $extension) {
        $extension = strtolower(ltrim(trim((string)$extension), '.'));
        if ($extension !== '') $allowed[] = $extension;
    }
    $dangerous = ['php','php3','php4','php5','php7','php8','phtml','pht','phar','cgi','pl','py','rb','asp','aspx','ashx','config','htaccess','exe','dll','com','bat','cmd','ps1','vbs','js','jse','wsf','wsh','msi','scr','svg','html','htm'];
    return ['enabled' => $enabled, 'max_bytes' => $maxMb * 1024 * 1024, 'allowed' => array_values(array_diff(array_unique($allowed), $dangerous)), 'dangerous' => $dangerous];
}

function files_zip_entry_names(string $path): ?array {
    $size = @filesize($path);
    if (!is_int($size) || $size < 22) return null;
    $handle = @fopen($path, 'rb');
    if ($handle === false) return null;
    try {
        $tailLength = min($size, 65557);
        if (fseek($handle, $size - $tailLength) !== 0) return null;
        $tail = fread($handle, $tailLength);
        if (!is_string($tail)) return null;
        $eocd = strrpos($tail, "PK\x05\x06");
        if ($eocd === false || strlen($tail) - $eocd < 22) return null;
        $header = substr($tail, $eocd, 22);
        $disk = unpack('vdisk/vdirectory_disk/ventries_disk/ventries/Vdirectory_size/Vdirectory_offset/vcomment_length', substr($header, 4));
        if (!is_array($disk) || $disk['disk'] !== 0 || $disk['directory_disk'] !== 0
            || $disk['entries'] !== $disk['entries_disk'] || $disk['entries'] > 4096
            || $disk['directory_offset'] + $disk['directory_size'] > $size) return null;
        if (fseek($handle, (int)$disk['directory_offset']) !== 0) return null;
        $names = [];
        for ($index = 0; $index < (int)$disk['entries']; $index++) {
            $entry = fread($handle, 46);
            if (!is_string($entry) || strlen($entry) !== 46 || substr($entry, 0, 4) !== "PK\x01\x02") return null;
            $fields = unpack('vflags', substr($entry, 8, 2)) + unpack('vname_length/vextra_length/vcomment_length', substr($entry, 28, 6));
            if (($fields['flags'] & 1) !== 0 || $fields['name_length'] < 1 || $fields['name_length'] > 1024) return null;
            $name = fread($handle, (int)$fields['name_length']);
            if (!is_string($name) || strlen($name) !== (int)$fields['name_length'] || str_contains($name, "\0")) return null;
            $normalized = str_replace('\\', '/', $name);
            if (str_starts_with($normalized, '/') || str_contains('/' . $normalized, '/../')) return null;
            $names[$normalized] = true;
            $skip = (int)$fields['extra_length'] + (int)$fields['comment_length'];
            if ($skip > 0 && fseek($handle, $skip, SEEK_CUR) !== 0) return null;
        }
        return $names;
    } finally {
        fclose($handle);
    }
}

function files_detect_content_type(string $path, string $extension): ?string {
    $prefix = (string)@file_get_contents($path, false, null, 0, 16);
    if ($extension === 'pdf' && str_starts_with($prefix, '%PDF-')) return 'application/pdf';
    if (in_array($extension, ['jpg', 'jpeg'], true) && str_starts_with($prefix, "\xFF\xD8\xFF")) return 'image/jpeg';
    if ($extension === 'png' && str_starts_with($prefix, "\x89PNG\x0D\x0A\x1A\x0A")) return 'image/png';
    if (in_array($extension, ['doc', 'xls'], true) && str_starts_with($prefix, "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1")) {
        return $extension === 'doc' ? 'application/msword' : 'application/vnd.ms-excel';
    }
    if (in_array($extension, ['docx', 'xlsx'], true) && (str_starts_with($prefix, "PK\x03\x04") || str_starts_with($prefix, "PK\x05\x06"))) {
        $required = $extension === 'docx' ? 'word/document.xml' : 'xl/workbook.xml';
        if (class_exists('ZipArchive')) {
            $zip = new ZipArchive();
            if ($zip->open($path) !== true || $zip->locateName('[Content_Types].xml') === false) {
                if ($zip->status === ZipArchive::ER_OK) $zip->close();
                return null;
            }
            $valid = $zip->locateName($required) !== false;
            $zip->close();
            if (!$valid) return null;
        } else {
            $entries = files_zip_entry_names($path);
            if ($entries === null || !isset($entries['[Content_Types].xml'], $entries[$required])) return null;
        }
        return $extension === 'docx'
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    if (in_array($extension, ['txt', 'csv'], true)) {
        $sample = (string)@file_get_contents($path, false, null, 0, 8192);
        if (!str_contains($sample, "\0")) return $extension === 'csv' ? 'text/csv' : 'text/plain';
    }
    return null;
}

function files_validate_upload(array $file): array {
    if ((int)($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) files_json(400, false, 'A valid file upload is required');
    $tmp = (string)($file['tmp_name'] ?? '');
    if ($tmp === '' || !is_uploaded_file($tmp)) files_json(400, false, 'A valid file upload is required');
    $size = (int)($file['size'] ?? 0);
    $name = trim((string)($file['name'] ?? ''));
    $policy = files_upload_policy();
    if (!$policy['enabled']) files_json(403, false, 'Attachments are disabled');
    if ($size <= 0) files_json(400, false, 'Empty files are not allowed');
    if ($size > $policy['max_bytes']) files_json(400, false, 'Attachment file is too large');
    if ($name === '' || strlen($name) > 255 || str_contains($name, "\0") || preg_match('/[\\\\\/]/', $name)) files_json(400, false, 'Invalid file name');
    $segments = array_map('strtolower', explode('.', $name));
    $extension = count($segments) > 1 ? (string)end($segments) : '';
    if ($extension === '' || !in_array($extension, $policy['allowed'], true)) files_json(400, false, 'Attachment file type is not allowed');
    foreach (array_slice($segments, 1) as $segment) if (in_array($segment, $policy['dangerous'], true)) files_json(400, false, 'Dangerous or double file extension is not allowed');
    $mime = files_detect_content_type($tmp, $extension);
    if ($mime === null) files_json(400, false, 'Attachment content does not match its file type');
    return ['name' => $name, 'extension' => $extension, 'mime' => $mime, 'size' => $size, 'tmp' => $tmp];
}

function files_safe_download_name(string $value): string {
    $name = preg_replace('/[\x00-\x1F\x7F"\\\\\/]+/', '_', trim($value)) ?? 'attachment';
    return $name !== '' ? substr($name, 0, 255) : 'attachment';
}

try {
    load_runtime_env(__DIR__);
    api_apply_no_store_headers();
    if (!sqlserver_is_configured()) throw new Exception('SQL Server is not configured');
    $action = strtolower(trim((string)($_GET['action'] ?? $_POST['action'] ?? 'upload')));

    if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'download') {
        $attachment = attachment_security_validate_download((string)($_GET['token'] ?? ''));
        if (!$attachment) files_json(401, false, 'Invalid or expired attachment link');
        $fullPath = attachment_security_existing_path((string)($attachment['file_url'] ?? ''));
        if ($fullPath === null) files_json(404, false, 'Attachment not found');
        $fileName = files_safe_download_name((string)($attachment['file_name'] ?? 'attachment'));
        header('Content-Type: ' . ((string)($attachment['mime_type'] ?? '') ?: 'application/octet-stream'));
        header('Content-Length: ' . (string)filesize($fullPath));
        header("Content-Disposition: attachment; filename*=UTF-8''" . rawurlencode($fileName));
        header('X-Content-Type-Options: nosniff');
        readfile($fullPath);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') files_json(405, false, 'Method not allowed');
    $jsonPayload = [];
    if (str_contains(strtolower((string)($_SERVER['CONTENT_TYPE'] ?? '')), 'application/json')) {
        $decoded = json_decode((string)file_get_contents('php://input'), true);
        if (is_array($decoded)) $jsonPayload = $decoded;
        $action = strtolower(trim((string)($jsonPayload['action'] ?? $action)));
    }

    if ($action === 'sign') {
        $handler = files_require_handler();
        $attachmentId = strtolower(trim((string)($jsonPayload['attachment_id'] ?? '')));
        if (!attachment_security_uuid($attachmentId)) files_json(400, false, 'attachment_id must be a valid UUID');
        $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.attachments WHERE id = @id', ['id' => $attachmentId]);
        $attachment = $rows[0] ?? null;
        if (!$attachment) files_json(404, false, 'Attachment not found');
        files_require_handler_ticket($handler, (string)$attachment['ticket_id']);
        files_json(200, true, 'Attachment link created', ['data' => ['url' => attachment_security_download_url($attachment, 'handler'), 'expires_in' => attachment_security_ttl()]]);
    }

    if ($action === 'delete') {
        $handler = files_require_handler();
        $attachmentId = strtolower(trim((string)($jsonPayload['attachment_id'] ?? '')));
        if (!attachment_security_uuid($attachmentId)) files_json(400, false, 'attachment_id must be a valid UUID');
        $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.attachments WHERE id = @id', ['id' => $attachmentId]);
        $attachment = $rows[0] ?? null;
        if (!$attachment) files_json(404, false, 'Attachment not found');
        $ticketId = (string)$attachment['ticket_id'];
        files_require_handler_ticket($handler, $ticketId);
        $fileName = substr((string)($attachment['file_name'] ?? 'attachment'), 0, 200);
        sqlserver_run_commands([
            sqlserver_command('nonquery', 'DELETE FROM dbo.attachments WHERE id = @id AND ticket_id = @ticket_id', ['id' => $attachmentId, 'ticket_id' => $ticketId]),
            sqlserver_command('nonquery', "INSERT INTO dbo.ticket_actions (ticket_id, action_type, action, description, handler_id, handler_name, handler_email, performed_by, created_at) VALUES (@ticket_id, N'attachment_deleted', N'Attachment Deleted', @description, @handler_id, @handler_name, @handler_email, @performed_by, SYSUTCDATETIME())", [
                'ticket_id' => $ticketId, 'description' => 'Deleted attachment: ' . $fileName, 'handler_id' => $handler['id'] ?? null,
                'handler_name' => $handler['name'] ?? null, 'handler_email' => $handler['email'] ?? null, 'performed_by' => $handler['name'] ?? 'Handler',
            ]),
        ], true);
        $path = attachment_security_existing_path((string)($attachment['file_url'] ?? ''));
        if ($path !== null) @unlink($path);
        files_json(200, true, 'Attachment deleted');
    }

    if ($action === 'cleanup') {
        $payload = attachment_security_open(trim((string)($jsonPayload['upload_token'] ?? '')));
        if (!$payload || ($payload['k'] ?? '') !== 'upload' || (int)($payload['e'] ?? 0) < time()) files_json(401, false, 'Invalid upload cleanup authorization');
        $key = attachment_security_normalize_storage_key((string)($payload['p'] ?? ''));
        if ($key === null || (int)sqlserver_scalar('SELECT COUNT(*) FROM dbo.attachments WHERE file_url = @file_url', ['file_url' => $key]) > 0) files_json(409, false, 'Upload cannot be cleaned up');
        $path = attachment_security_existing_path($key);
        if ($path !== null) @unlink($path);
        files_json(200, true, 'Pending upload removed');
    }

    if ($action !== 'upload') files_json(400, false, 'Unsupported action');
    $access = files_authorize_upload();
    $validated = files_validate_upload((array)($_FILES['file'] ?? []));
    $ticketId = (string)$access['ticket_id'];
    $storageKey = 'attachments/' . $ticketId . '/' . bin2hex(random_bytes(24)) . '.' . $validated['extension'];
    $target = attachment_security_storage_path($storageKey);
    if ($target === null) throw new Exception('Unable to create attachment storage path');
    $directory = dirname($target);
    if (!is_dir($directory) && !@mkdir($directory, 0750, true) && !is_dir($directory)) throw new Exception('Unable to create attachment directory');
    if (!move_uploaded_file($validated['tmp'], $target)) throw new Exception('Unable to store attachment');
    @chmod($target, 0640);
    $uploadToken = attachment_security_upload_token(['t' => $ticketId, 's' => $access['scope'], 'p' => $storageKey, 'n' => $validated['name'], 'm' => $validated['mime'], 'z' => $validated['size']]);
    files_json(200, true, 'File uploaded', ['data' => ['upload_token' => $uploadToken, 'file_name' => $validated['name'], 'mime_type' => $validated['mime'], 'size_bytes' => $validated['size']]]);
} catch (Throwable $e) {
    $errorId = api_log_exception('files.api', $e);
    files_json(500, false, 'Internal server error', ['data' => ['error_id' => $errorId]]);
}
