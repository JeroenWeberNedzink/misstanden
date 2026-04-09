<?php
declare(strict_types=1);
/**
 * Backfill next_step_due based on workflow_statuses.expected_duration_days.
 */

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_admin_auth.php';
require_once __DIR__ . '/_scopes.php';
require_once __DIR__ . '/_errors.php';
require_once __DIR__ . '/_security_headers.php';
require_once __DIR__ . '/_rate_limit.php';
require_once __DIR__ . '/_sqlserver.php';

api_apply_security_headers([
    'allow_methods' => 'POST, OPTIONS',
    'allow_headers' => 'Content-Type, Authorization, X-SLA-CRON-KEY',
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

const SLA_BACKFILL_SCOPES_WRITE = [
    'admin:sla:write',
    'run:sla_backfill',
    'write:sla',
    'manage:sla',
    'admin:all',
    'admin',
];

function sla_json(int $status, bool $success, string $message, array $data = []): void {
    http_response_code($status);
    echo json_encode(array_merge([
        'success' => $success,
        'message' => $message,
    ], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function sla_header_value(string $name): string {
    $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    return trim((string)($_SERVER[$serverKey] ?? ''));
}

function sla_scheduler_authorized(): bool {
    $expected = trim((string)(getenv('SLA_BACKFILL_CRON_KEY') ?: ''));
    if ($expected === '') {
        return false;
    }
    $provided = sla_header_value('X-SLA-CRON-KEY');
    return $provided !== '' && hash_equals($expected, $provided);
}

function add_days_iso(?string $dateLike, $days): ?string {
    if (!$dateLike || !is_numeric($days)) {
        return null;
    }
    $dt = new DateTime($dateLike);
    $dt->modify('+' . (int)$days . ' day');
    return $dt->format(DateTime::ATOM);
}

try {
    load_runtime_env(__DIR__);

    if (!sqlserver_is_configured()) {
        throw new Exception('SQL Server is not configured');
    }

    $authMode = 'scheduler';
    if (!sla_scheduler_authorized()) {
        $adminCtx = api_authz_require_admin(static function (int $status, string $message): void {
            sla_json($status, false, $message);
        }, SLA_BACKFILL_SCOPES_WRITE);
        $authMode = 'admin';

        $handlerId = trim((string)($adminCtx['handler']['id'] ?? ''));
        $claimSub = trim((string)($adminCtx['claims']['sub'] ?? ''));
        $actorRaw = $handlerId !== '' ? $handlerId : ($claimSub !== '' ? $claimSub : 'unknown');
        $actorKey = api_rate_limit_hash('sla_backfill_actor:' . $actorRaw);
        $clientKey = api_rate_limit_client_fingerprint();
        api_rate_limit_enforce(
            'sla-backfill:admin:actor:' . $actorKey,
            20,
            3600,
            static function (int $retryAfter): void {
                sla_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $retryAfter]);
            }
        );
        api_rate_limit_enforce(
            'sla-backfill:admin:client:' . $clientKey,
            120,
            3600,
            static function (int $retryAfter): void {
                sla_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $retryAfter]);
            }
        );
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        sla_json(405, false, 'Method not allowed');
    }

    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?? '', true);
    if (!is_array($data)) {
        $data = [];
    }

    $force = !empty($data['force']);
    $limit = isset($data['limit']) && is_numeric($data['limit']) ? (int)$data['limit'] : null;

    $workflowRows = sqlserver_query('SELECT id, code FROM dbo.workflows');
    $workflowMap = [];
    foreach ($workflowRows as $workflowRow) {
        $workflowMap[(string)($workflowRow['code'] ?? '')] = $workflowRow['id'] ?? null;
    }

    $statusRows = sqlserver_query(
        'SELECT workflow_id, code, expected_duration_days FROM dbo.workflow_statuses'
    );
    $statusMap = [];
    foreach ($statusRows as $statusRow) {
        $workflowId = (string)($statusRow['workflow_id'] ?? '');
        $code = (string)($statusRow['code'] ?? '');
        $days = $statusRow['expected_duration_days'] ?? null;
        $statusMap[$workflowId . ':' . $code] = is_numeric($days) ? (int)$days : null;
    }

    $sql = 'SELECT id, workflow_type, status_code, submitted_at, last_update_at, next_step_due
            FROM dbo.tickets';
    $params = [];
    if (!$force) {
        $sql .= ' WHERE next_step_due IS NULL';
    }
    $sql .= ' ORDER BY submitted_at ASC';
    if ($limit) {
        $sql .= ' OFFSET 0 ROWS FETCH NEXT @limit ROWS ONLY';
        $params['limit'] = $limit;
    }

    $tickets = sqlserver_query($sql, $params);

    $updated = 0;
    $skipped = 0;
    foreach ($tickets as $ticket) {
        $workflowType = (string)($ticket['workflow_type'] ?? '');
        $statusCode = (string)($ticket['status_code'] ?? '');
        $workflowId = $workflowMap[$workflowType] ?? null;
        if (!$workflowId) {
            $skipped++;
            continue;
        }

        $days = $statusMap[$workflowId . ':' . $statusCode] ?? null;
        if (!is_numeric($days)) {
            $skipped++;
            continue;
        }

        $baseDate = $ticket['last_update_at'] ?? $ticket['submitted_at'] ?? null;
        $nextStepDue = add_days_iso(is_string($baseDate) ? $baseDate : null, $days);
        if (!$nextStepDue) {
            $skipped++;
            continue;
        }

        sqlserver_execute(
            'UPDATE dbo.tickets
             SET next_step_due = @next_step_due, updated_at = SYSUTCDATETIME()
             WHERE id = @id',
            [
                'next_step_due' => $nextStepDue,
                'id' => $ticket['id'] ?? null,
            ]
        );
        $updated++;
    }

    sla_json(200, true, 'Backfill completed', [
        'updated' => $updated,
        'skipped' => $skipped,
        'limit' => $limit,
        'force' => $force,
        'auth_mode' => $authMode,
    ]);
} catch (Throwable $e) {
    $errorId = api_log_exception('sla-backfill.api', $e);
    sla_json(500, false, 'Internal server error', ['error_id' => $errorId]);
}
