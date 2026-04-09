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

function profile_json(int $status, bool $success, string $message, $data = null): void {
    http_response_code($status);
    echo json_encode(['success' => $success, 'message' => $message, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

function profile_deny(int $status, string $message): void {
    profile_json($status, false, $message);
}

function profile_uuid(string $value): bool {
    return preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $value) === 1;
}

function profile_decode_json($value, $fallback) {
    if (is_array($value)) {
        return $value;
    }
    if (!is_string($value)) {
        return $fallback;
    }
    $trimmed = trim($value);
    if ($trimmed === '') {
        return $fallback;
    }
    $decoded = json_decode($trimmed, true);
    return json_last_error() === JSON_ERROR_NONE ? $decoded : $fallback;
}

function profile_normalize_handler(array $row): array {
    return api_authz_normalize_handler($row);
}

function profile_normalize_notification_row(?array $row): ?array {
    if (!is_array($row)) {
        return null;
    }
    return $row;
}

function profile_require_owner_or_admin(array $ctx, ?string $handlerId = null, ?string $userId = null, ?string $email = null): void {
    $actor = is_array($ctx['handler'] ?? null) ? $ctx['handler'] : [];
    if (api_authz_is_admin($actor)) {
        return;
    }

    $actorHandlerId = trim((string)($actor['id'] ?? ''));
    $actorUserId = trim((string)($actor['user_id'] ?? ''));
    $actorEmail = strtolower(trim((string)($actor['email'] ?? '')));

    if ($handlerId !== null && $handlerId !== '' && $actorHandlerId === $handlerId) {
        return;
    }
    if ($userId !== null && $userId !== '' && $actorUserId === $userId) {
        return;
    }
    if ($email !== null && $email !== '' && $actorEmail === strtolower(trim($email))) {
        return;
    }

    profile_json(403, false, 'Forbidden');
}

function profile_load_handler_by_user_id(string $userId): ?array {
    $rows = sqlserver_query(
        'SELECT TOP 1 * FROM dbo.handlers WHERE user_id = @user_id',
        ['user_id' => $userId]
    );
    $row = $rows[0] ?? null;
    return is_array($row) ? profile_normalize_handler($row) : null;
}

function profile_load_handler_by_email(string $email): ?array {
    $rows = sqlserver_query(
        'SELECT TOP 1 * FROM dbo.handlers WHERE LOWER(email) = LOWER(@email)',
        ['email' => $email]
    );
    $row = $rows[0] ?? null;
    return is_array($row) ? profile_normalize_handler($row) : null;
}

try {
    load_runtime_env(__DIR__);

    if (!sqlserver_is_configured()) {
        throw new Exception('SQL Server is not configured');
    }

    $ctx = api_authz_require_active_handler('profile_deny');

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $action = strtolower(trim((string)($_GET['action'] ?? '')));

        if ($action === 'handler_by_user_id') {
            $userId = trim((string)($_GET['user_id'] ?? ''));
            if ($userId === '') {
                throw new Exception('user_id is required');
            }
            profile_require_owner_or_admin($ctx, null, $userId, null);
            $row = profile_load_handler_by_user_id($userId);
            profile_json(200, true, 'Handler loaded', ['row' => $row]);
        }

        if ($action === 'handler_by_email') {
            $email = trim((string)($_GET['email'] ?? ''));
            if ($email === '') {
                throw new Exception('email is required');
            }
            profile_require_owner_or_admin($ctx, null, null, $email);
            $row = profile_load_handler_by_email($email);
            profile_json(200, true, 'Handler loaded', ['row' => $row]);
        }

        if ($action === 'availability') {
            $userId = trim((string)($_GET['user_id'] ?? ''));
            if ($userId === '') {
                throw new Exception('user_id is required');
            }
            profile_require_owner_or_admin($ctx, null, $userId, null);
            $rows = sqlserver_query(
                'SELECT TOP 1 * FROM dbo.user_availability WHERE user_id = @user_id',
                ['user_id' => $userId]
            );
            profile_json(200, true, 'Availability loaded', ['row' => $rows[0] ?? null]);
        }

        if ($action === 'notification_settings') {
            $handlerId = trim((string)($_GET['handler_id'] ?? ''));
            if (!profile_uuid($handlerId)) {
                throw new Exception('handler_id must be a valid UUID');
            }
            profile_require_owner_or_admin($ctx, $handlerId, null, null);
            $rows = sqlserver_query(
                'SELECT TOP 1 * FROM dbo.handler_notification_settings WHERE handler_id = @handler_id',
                ['handler_id' => $handlerId]
            );
            profile_json(200, true, 'Notification settings loaded', ['row' => profile_normalize_notification_row($rows[0] ?? null)]);
        }

        profile_json(400, false, 'Unsupported action');
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        profile_json(405, false, 'Method not allowed');
    }

    $body = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($body)) {
        throw new Exception('Invalid JSON payload');
    }

    $action = strtolower(trim((string)($body['action'] ?? '')));

    if ($action === 'update_contact') {
        $handlerId = trim((string)($body['handler_id'] ?? ''));
        if (!profile_uuid($handlerId)) {
            throw new Exception('handler_id must be a valid UUID');
        }
        profile_require_owner_or_admin($ctx, $handlerId, null, null);

        $contact = is_array($body['contact'] ?? null) ? $body['contact'] : [];
        $name = array_key_exists('name', $contact) ? trim((string)$contact['name']) : null;
        $email = array_key_exists('email', $contact) ? trim((string)$contact['email']) : null;
        $phone = array_key_exists('phone', $contact) ? trim((string)$contact['phone']) : null;

        if ($email !== null && $email !== '') {
            $dupe = sqlserver_scalar(
                'SELECT TOP 1 id FROM dbo.handlers WHERE LOWER(email) = LOWER(@email) AND id <> @id',
                ['email' => $email, 'id' => $handlerId]
            );
            if ($dupe) {
                profile_json(409, false, 'Er bestaat al een gebruiker met dit e-mailadres.');
            }
        }

        sqlserver_execute(
            "UPDATE dbo.handlers
             SET
                name = COALESCE(@name, name),
                email = CASE WHEN @email_supplied = 1 THEN NULLIF(@email, N'') ELSE email END,
                phone = CASE WHEN @phone_supplied = 1 THEN NULLIF(@phone, N'') ELSE phone END,
                updated_at = SYSUTCDATETIME()
             WHERE id = @id",
            [
                'id' => $handlerId,
                'name' => $name,
                'email' => $email,
                'email_supplied' => array_key_exists('email', $contact),
                'phone' => $phone,
                'phone_supplied' => array_key_exists('phone', $contact),
            ]
        );

        $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.handlers WHERE id = @id', ['id' => $handlerId]);
        profile_json(200, true, 'Contact updated', ['row' => profile_normalize_handler($rows[0] ?? [])]);
    }

    if ($action === 'update_availability') {
        $userId = trim((string)($body['user_id'] ?? ''));
        if ($userId === '') {
            throw new Exception('user_id is required');
        }
        profile_require_owner_or_admin($ctx, null, $userId, null);

        $availability = is_array($body['availability'] ?? null) ? $body['availability'] : [];
        sqlserver_execute(
            'MERGE dbo.user_availability AS target
             USING (SELECT @user_id AS user_id) AS source
             ON target.user_id = source.user_id
             WHEN MATCHED THEN
                UPDATE SET
                    is_available = COALESCE(@is_available, target.is_available),
                    status = @status,
                    status_message = @status_message,
                    updated_at = SYSUTCDATETIME()
             WHEN NOT MATCHED THEN
                INSERT (user_id, is_available, status, status_message, created_at, updated_at)
                VALUES (@user_id, COALESCE(@is_available, 1), @status, @status_message, SYSUTCDATETIME(), SYSUTCDATETIME());',
            [
                'user_id' => $userId,
                'is_available' => array_key_exists('is_available', $availability) ? (bool)$availability['is_available'] : null,
                'status' => array_key_exists('status', $availability) ? trim((string)$availability['status']) : null,
                'status_message' => array_key_exists('status_message', $availability) ? trim((string)$availability['status_message']) : null,
            ]
        );

        $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.user_availability WHERE user_id = @user_id', ['user_id' => $userId]);
        profile_json(200, true, 'Availability updated', ['row' => $rows[0] ?? null]);
    }

    if ($action === 'update_notification_settings') {
        $handlerId = trim((string)($body['handler_id'] ?? ''));
        if (!profile_uuid($handlerId)) {
            throw new Exception('handler_id must be a valid UUID');
        }
        profile_require_owner_or_admin($ctx, $handlerId, null, null);

        $settings = is_array($body['settings'] ?? null) ? $body['settings'] : [];
        sqlserver_execute(
            'MERGE dbo.handler_notification_settings AS target
             USING (SELECT @handler_id AS handler_id) AS source
             ON target.handler_id = source.handler_id
             WHEN MATCHED THEN
                UPDATE SET
                    email_enabled = COALESCE(@email_enabled, target.email_enabled),
                    notify_new_assignments = COALESCE(@notify_new_assignments, target.notify_new_assignments),
                    notify_status_updates = COALESCE(@notify_status_updates, target.notify_status_updates),
                    notify_escalations = COALESCE(@notify_escalations, target.notify_escalations),
                    notify_deadline_reminders = COALESCE(@notify_deadline_reminders, target.notify_deadline_reminders),
                    notify_comments = COALESCE(@notify_comments, target.notify_comments),
                    min_severity_immediate = @min_severity_immediate,
                    daily_digest_enabled = COALESCE(@daily_digest_enabled, target.daily_digest_enabled),
                    quiet_hours_start = @quiet_hours_start,
                    quiet_hours_end = @quiet_hours_end,
                    weekend_notifications = COALESCE(@weekend_notifications, target.weekend_notifications),
                    emergency_contact_phone = @emergency_contact_phone,
                    updated_at = SYSUTCDATETIME()
             WHEN NOT MATCHED THEN
                INSERT (
                    handler_id, email_enabled, notify_new_assignments, notify_status_updates, notify_escalations,
                    notify_deadline_reminders, notify_comments, min_severity_immediate, daily_digest_enabled,
                    quiet_hours_start, quiet_hours_end, weekend_notifications, emergency_contact_phone, created_at, updated_at
                )
                VALUES (
                    @handler_id, COALESCE(@email_enabled, 1), COALESCE(@notify_new_assignments, 1),
                    COALESCE(@notify_status_updates, 1), COALESCE(@notify_escalations, 1),
                    COALESCE(@notify_deadline_reminders, 1), COALESCE(@notify_comments, 0),
                    @min_severity_immediate, COALESCE(@daily_digest_enabled, 0),
                    @quiet_hours_start, @quiet_hours_end, COALESCE(@weekend_notifications, 0),
                    @emergency_contact_phone, SYSUTCDATETIME(), SYSUTCDATETIME()
                );',
            [
                'handler_id' => $handlerId,
                'email_enabled' => array_key_exists('email_enabled', $settings) ? (bool)$settings['email_enabled'] : null,
                'notify_new_assignments' => array_key_exists('notify_new_assignments', $settings) ? (bool)$settings['notify_new_assignments'] : null,
                'notify_status_updates' => array_key_exists('notify_status_updates', $settings) ? (bool)$settings['notify_status_updates'] : null,
                'notify_escalations' => array_key_exists('notify_escalations', $settings) ? (bool)$settings['notify_escalations'] : null,
                'notify_deadline_reminders' => array_key_exists('notify_deadline_reminders', $settings) ? (bool)$settings['notify_deadline_reminders'] : null,
                'notify_comments' => array_key_exists('notify_comments', $settings) ? (bool)$settings['notify_comments'] : null,
                'min_severity_immediate' => array_key_exists('min_severity_immediate', $settings) ? trim((string)$settings['min_severity_immediate']) ?: null : null,
                'daily_digest_enabled' => array_key_exists('daily_digest_enabled', $settings) ? (bool)$settings['daily_digest_enabled'] : null,
                'quiet_hours_start' => array_key_exists('quiet_hours_start', $settings) ? trim((string)$settings['quiet_hours_start']) ?: null : null,
                'quiet_hours_end' => array_key_exists('quiet_hours_end', $settings) ? trim((string)$settings['quiet_hours_end']) ?: null : null,
                'weekend_notifications' => array_key_exists('weekend_notifications', $settings) ? (bool)$settings['weekend_notifications'] : null,
                'emergency_contact_phone' => array_key_exists('emergency_contact_phone', $settings) ? trim((string)$settings['emergency_contact_phone']) ?: null : null,
            ]
        );

        $rows = sqlserver_query(
            'SELECT TOP 1 * FROM dbo.handler_notification_settings WHERE handler_id = @handler_id',
            ['handler_id' => $handlerId]
        );
        profile_json(200, true, 'Notification settings updated', ['row' => profile_normalize_notification_row($rows[0] ?? null)]);
    }

    profile_json(400, false, 'Unsupported action');
} catch (Throwable $e) {
    $errorId = api_log_exception('profile.api', $e);
    profile_json(500, false, 'Internal server error', ['error_id' => $errorId]);
}
