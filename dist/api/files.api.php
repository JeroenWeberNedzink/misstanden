<?php
declare(strict_types=1);

require_once __DIR__ . '/_errors.php';
require_once __DIR__ . '/_security_headers.php';

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

function files_json(int $status, bool $success, string $message, array $data = []): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge([
        'success' => $success,
        'message' => $message,
    ], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function files_storage_root(): string {
    $path = realpath(__DIR__ . '/../../private/uploads');
    if ($path === false) {
        $path = __DIR__ . '/../../private/uploads';
    }
    if (!is_dir($path) && !@mkdir($path, 0755, true) && !is_dir($path)) {
        throw new Exception('Unable to create upload directory');
    }
    return $path;
}

function files_safe_segment(string $value, string $fallback = 'file'): string {
    $clean = preg_replace('/[^A-Za-z0-9._-]+/', '_', trim($value)) ?? '';
    $clean = trim($clean, '._-');
    return $clean !== '' ? $clean : $fallback;
}

function files_safe_relative_path(string $value): string {
    $value = str_replace('\\', '/', trim($value));
    $parts = array_values(array_filter(explode('/', $value), static function ($part): bool {
        return $part !== '' && $part !== '.' && $part !== '..';
    }));
    return implode('/', array_map(static fn($part) => files_safe_segment($part, 'file'), $parts));
}

function files_download_url(string $relativePath): string {
    return '/api/files.api.php?action=download&path=' . rawurlencode($relativePath);
}

try {
    $action = strtolower(trim((string)($_GET['action'] ?? $_POST['action'] ?? 'upload')));

    if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'download') {
        $relativePath = files_safe_relative_path((string)($_GET['path'] ?? ''));
        if ($relativePath === '') {
            files_json(400, false, 'path is required');
        }

        $fullPath = files_storage_root() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
        if (!is_file($fullPath)) {
            files_json(404, false, 'File not found');
        }

        $mimeType = mime_content_type($fullPath) ?: 'application/octet-stream';
        $fileName = basename($fullPath);
        header('Content-Type: ' . $mimeType);
        header('Content-Length: ' . (string)filesize($fullPath));
        header('Content-Disposition: inline; filename="' . rawurlencode($fileName) . '"');
        readfile($fullPath);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'delete') {
        $raw = file_get_contents('php://input');
        $payload = json_decode($raw ?: '', true);
        $relativePath = files_safe_relative_path((string)($payload['path'] ?? ''));
        if ($relativePath === '') {
            files_json(400, false, 'path is required');
        }

        $fullPath = files_storage_root() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
        if (is_file($fullPath)) {
            @unlink($fullPath);
        }

        files_json(200, true, 'File deleted', ['data' => ['path' => $relativePath]]);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        files_json(405, false, 'Method not allowed');
    }

    $file = $_FILES['file'] ?? null;
    if (!is_array($file) || (int)($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        files_json(400, false, 'file upload is required');
    }

    $folder = files_safe_relative_path((string)($_POST['folder'] ?? 'attachments'));
    $safeName = files_safe_segment((string)($file['name'] ?? 'file'));
    $uniquePrefix = bin2hex(random_bytes(8));
    $relativePath = trim($folder . '/' . $uniquePrefix . '_' . $safeName, '/');
    $targetPath = files_storage_root() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
    $targetDir = dirname($targetPath);
    if (!is_dir($targetDir) && !@mkdir($targetDir, 0755, true) && !is_dir($targetDir)) {
        throw new Exception('Unable to create upload subdirectory');
    }

    if (!move_uploaded_file((string)$file['tmp_name'], $targetPath)) {
        throw new Exception('Failed to move uploaded file');
    }

    files_json(200, true, 'File uploaded', ['data' => [
        'path' => $relativePath,
        'url' => files_download_url($relativePath),
        'file_name' => $file['name'] ?? basename($targetPath),
        'mime_type' => $file['type'] ?? (mime_content_type($targetPath) ?: 'application/octet-stream'),
        'size_bytes' => (int)($file['size'] ?? filesize($targetPath)),
    ]]);
} catch (Throwable $e) {
    $errorId = api_log_exception('files.api', $e);
    files_json(500, false, 'Internal server error', ['data' => ['error_id' => $errorId]]);
}
