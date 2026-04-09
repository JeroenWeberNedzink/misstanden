<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_admin_auth.php';
require_once __DIR__ . '/_sqlserver.php';
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

function email_settings_json(int $status, bool $success, string $message, $data = null): void {
    http_response_code($status);
    echo json_encode(['success' => $success, 'message' => $message, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

function email_settings_deny(int $status, string $message): void {
    email_settings_json($status, false, $message);
}

function email_settings_uuid(string $value): bool {
    return preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $value) === 1;
}

function email_settings_require_same_handler_or_admin(array $ctx, string $handlerId): void {
    $actor = is_array($ctx['handler'] ?? null) ? $ctx['handler'] : [];
    if (api_authz_is_admin($actor)) {
        return;
    }
    if (trim((string)($actor['id'] ?? '')) !== $handlerId) {
        email_settings_json(403, false, 'Forbidden');
    }
}

try {
    load_runtime_env(__DIR__);

    if (!sqlserver_is_configured()) {
        throw new Exception('SQL Server is not configured');
    }

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $action = strtolower(trim((string)($_GET['action'] ?? 'event_types')));

        if ($action === 'event_types') {
            api_authz_require_active_handler('email_settings_deny');
            $rows = sqlserver_query('SELECT * FROM dbo.email_event_types ORDER BY category ASC, code ASC');
            email_settings_json(200, true, 'Email event types loaded', ['rows' => $rows]);
        }

        if ($action === 'admin_overview') {
            api_authz_require_admin('email_settings_deny');
            $rows = sqlserver_query('SELECT * FROM dbo.email_settings_overview ORDER BY category ASC, code ASC');
            email_settings_json(200, true, 'Admin email settings loaded', ['rows' => $rows]);
        }

        if ($action === 'handler_preferences') {
            $ctx = api_authz_require_active_handler('email_settings_deny');
            $handlerId = trim((string)($_GET['handler_id'] ?? ''));
            if (!email_settings_uuid($handlerId)) {
                throw new Exception('handler_id must be a valid UUID');
            }
            email_settings_require_same_handler_or_admin($ctx, $handlerId);
            $rows = sqlserver_query(
                'SELECT * FROM dbo.handler_email_preferences WHERE handler_id = @handler_id ORDER BY created_at ASC',
                ['handler_id' => $handlerId]
            );
            email_settings_json(200, true, 'Handler email preferences loaded', ['rows' => $rows]);
        }

        email_settings_json(400, false, 'Unsupported action');
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        email_settings_json(405, false, 'Method not allowed');
    }

    $body = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($body)) {
        throw new Exception('Invalid JSON payload');
    }

    $action = strtolower(trim((string)($body['action'] ?? '')));

    if ($action === 'update_admin_setting') {
        $ctx = api_authz_require_admin('email_settings_deny');
        $eventTypeCode = trim((string)($body['event_type_code'] ?? ''));
        if ($eventTypeCode === '') {
            throw new Exception('event_type_code is required');
        }
        $settings = is_array($body['settings'] ?? null) ? $body['settings'] : [];
        $updatedBy = trim((string)(($ctx['handler'] ?? [])['id'] ?? ''));

        sqlserver_execute(
            'MERGE dbo.email_admin_settings AS target
             USING (SELECT @event_type_code AS event_type_code) AS source
             ON target.event_type_code = source.event_type_code
             WHEN MATCHED THEN
                UPDATE SET
                    is_enabled = COALESCE(@is_enabled, target.is_enabled),
                    send_to_reporters = COALESCE(@send_to_reporters, target.send_to_reporters),
                    send_to_handlers = COALESCE(@send_to_handlers, target.send_to_handlers),
                    updated_by = @updated_by,
                    updated_at = SYSUTCDATETIME()
             WHEN NOT MATCHED THEN
                INSERT (event_type_code, is_enabled, send_to_reporters, send_to_handlers, updated_by, updated_at)
                VALUES (
                    @event_type_code,
                    COALESCE(@is_enabled, 1),
                    COALESCE(@send_to_reporters, 1),
                    COALESCE(@send_to_handlers, 1),
                    @updated_by,
                    SYSUTCDATETIME()
                );',
            [
                'event_type_code' => $eventTypeCode,
                'is_enabled' => array_key_exists('is_enabled', $settings) ? (bool)$settings['is_enabled'] : null,
                'send_to_reporters' => array_key_exists('send_to_reporters', $settings) ? (bool)$settings['send_to_reporters'] : null,
                'send_to_handlers' => array_key_exists('send_to_handlers', $settings) ? (bool)$settings['send_to_handlers'] : null,
                'updated_by' => $updatedBy !== '' ? $updatedBy : null,
            ]
        );

        $rows = sqlserver_query(
            'SELECT TOP 1 * FROM dbo.email_settings_overview WHERE code = @code',
            ['code' => $eventTypeCode]
        );
        email_settings_json(200, true, 'Admin email setting updated', ['row' => $rows[0] ?? null]);
    }

    if ($action === 'update_handler_preferences') {
        $ctx = api_authz_require_active_handler('email_settings_deny');
        $handlerId = trim((string)($body['handler_id'] ?? ''));
        if (!email_settings_uuid($handlerId)) {
            throw new Exception('handler_id must be a valid UUID');
        }
        email_settings_require_same_handler_or_admin($ctx, $handlerId);

        $preferences = is_array($body['preferences'] ?? null) ? $body['preferences'] : [];
        foreach ($preferences as $eventTypeCode => $isEnabled) {
            $code = trim((string)$eventTypeCode);
            if ($code === '') {
                continue;
            }
            sqlserver_execute(
                'MERGE dbo.handler_email_preferences AS target
                 USING (SELECT @handler_id AS handler_id, @event_type_code AS event_type_code) AS source
                 ON target.handler_id = source.handler_id AND target.event_type_code = source.event_type_code
                 WHEN MATCHED THEN
                    UPDATE SET is_enabled = @is_enabled, updated_at = SYSUTCDATETIME()
                 WHEN NOT MATCHED THEN
                    INSERT (handler_id, event_type_code, is_enabled, created_at, updated_at)
                    VALUES (@handler_id, @event_type_code, @is_enabled, SYSUTCDATETIME(), SYSUTCDATETIME());',
                [
                    'handler_id' => $handlerId,
                    'event_type_code' => $code,
                    'is_enabled' => (bool)$isEnabled,
                ]
            );
        }

        $rows = sqlserver_query(
            'SELECT * FROM dbo.handler_email_preferences WHERE handler_id = @handler_id ORDER BY created_at ASC',
            ['handler_id' => $handlerId]
        );
        email_settings_json(200, true, 'Handler email preferences updated', ['rows' => $rows]);
    }

    if ($action === 'reset_handler_preferences') {
        $ctx = api_authz_require_active_handler('email_settings_deny');
        $handlerId = trim((string)($body['handler_id'] ?? ''));
        if (!email_settings_uuid($handlerId)) {
            throw new Exception('handler_id must be a valid UUID');
        }
        email_settings_require_same_handler_or_admin($ctx, $handlerId);
        sqlserver_execute('DELETE FROM dbo.handler_email_preferences WHERE handler_id = @handler_id', ['handler_id' => $handlerId]);
        email_settings_json(200, true, 'Handler email preferences reset', ['deleted' => true]);
    }

    email_settings_json(400, false, 'Unsupported action');
} catch (Throwable $e) {
    $errorId = api_log_exception('email-settings.api', $e);
    email_settings_json(500, false, 'Internal server error', ['error_id' => $errorId]);
}
