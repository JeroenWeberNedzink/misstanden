<?php
declare(strict_types=1);
/**
 * sla-backfill.api.php
 * Backfill next_step_due based on workflow_statuses.expected_duration_days.
 */

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_admin_auth.php';
require_once __DIR__ . '/_scopes.php';
require_once __DIR__ . '/_supabase.php';
require_once __DIR__ . '/_errors.php';
require_once __DIR__ . '/_security_headers.php';
require_once __DIR__ . '/_rate_limit.php';

api_apply_security_headers([
    'allow_methods' => 'POST, OPTIONS',
    'allow_headers' => 'Content-Type, Authorization, X-SLA-CRON-KEY',
]);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'OK'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Error handling
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
    $value = $_SERVER[$serverKey] ?? '';
    return trim((string)$value);
}

function sla_scheduler_authorized(): bool {
    $expected = trim((string)(getenv('SLA_BACKFILL_CRON_KEY') ?: ''));
    if ($expected === '') {
        return false;
    }

    $provided = sla_header_value('X-SLA-CRON-KEY');
    if ($provided === '') {
        return false;
    }

    return hash_equals($expected, $provided);
}

function add_days_iso(?string $dateLike, $days): ?string {
    if (!$dateLike || !is_numeric($days)) return null;
    $dt = new DateTime($dateLike);
    $dt->modify('+' . (int)$days . ' day');
    return $dt->format(DateTime::ATOM);
}

function supabase_request(string $method, string $url, string $apikey, $payload = null): array {
    $ch = curl_init();
    $headers = [
        'apikey: ' . $apikey,
        'Authorization: Bearer ' . $apikey,
        'Content-Type: application/json',
    ];
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
    ]);
    if ($payload !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_UNICODE));
    }
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($resp === false) {
        throw new Exception('Supabase request failed: ' . curl_error($ch));
    }
    curl_close($ch);
    $decoded = json_decode($resp, true);
    return [$code, $decoded, $resp];
}

try {
    load_env_file(__DIR__ . '/../../.env.local', true);
    load_env_file(__DIR__ . '/../../.env', false);

    $authMode = 'scheduler';
    $adminCtx = null;
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

    $supabaseUrl = getenv('VITE_SUPABASE_URL');
    $supabaseKey = supabase_get_service_role_key();

    if (!$supabaseUrl || !$supabaseKey) {
        throw new Exception('Missing Supabase environment configuration');
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        sla_json(405, false, 'Method not allowed');
    }

    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?? '', true);
    if (!is_array($data)) $data = [];

    $force = !empty($data['force']);
    $limit = isset($data['limit']) && is_numeric($data['limit']) ? (int)$data['limit'] : null;

    $base = rtrim($supabaseUrl, '/');

    // Workflows
    [$codeW, $wfData, $wfRaw] = supabase_request(
        'GET',
        $base . '/rest/v1/workflows?select=id,code',
        $supabaseKey
    );
    if ($codeW < 200 || $codeW >= 300) throw new Exception('Fetch workflows failed: ' . (is_array($wfData) ? json_encode($wfData) : $wfRaw));

    $workflowMap = [];
    foreach (($wfData ?? []) as $w) {
        $workflowMap[(string)($w['code'] ?? '')] = $w['id'] ?? null;
    }

    // Statuses
    [$codeS, $stData, $stRaw] = supabase_request(
        'GET',
        $base . '/rest/v1/workflow_statuses?select=workflow_id,code,expected_duration_days',
        $supabaseKey
    );
    if ($codeS < 200 || $codeS >= 300) throw new Exception('Fetch workflow_statuses failed: ' . (is_array($stData) ? json_encode($stData) : $stRaw));

    $statusMap = [];
    foreach (($stData ?? []) as $s) {
        $wfId = (string)($s['workflow_id'] ?? '');
        $code = (string)($s['code'] ?? '');
        $days = $s['expected_duration_days'] ?? null;
        $statusMap[$wfId . ':' . $code] = is_numeric($days) ? (int)$days : null;
    }

    // Tickets
    $ticketUrl = $base . '/rest/v1/tickets?select=id,workflow_type,status_code,submitted_at,last_update_at,next_step_due&order=submitted_at.asc';
    if (!$force) $ticketUrl .= '&next_step_due=is.null';
    if ($limit) $ticketUrl .= '&limit=' . $limit;

    [$codeT, $tickets, $tRaw] = supabase_request('GET', $ticketUrl, $supabaseKey);
    if ($codeT < 200 || $codeT >= 300) throw new Exception('Fetch tickets failed: ' . (is_array($tickets) ? json_encode($tickets) : $tRaw));

    $updated = 0;
    $skipped = 0;
    foreach (($tickets ?? []) as $t) {
        $workflowType = (string)($t['workflow_type'] ?? '');
        $statusCode = (string)($t['status_code'] ?? '');
        $wfId = $workflowMap[$workflowType] ?? null;
        if (!$wfId) { $skipped++; continue; }

        $days = $statusMap[$wfId . ':' . $statusCode] ?? null;
        if (!is_numeric($days)) { $skipped++; continue; }

        $baseDate = $t['last_update_at'] ?? $t['submitted_at'] ?? null;
        $nextStepDue = add_days_iso($baseDate, $days);
        if (!$nextStepDue) { $skipped++; continue; }

        $updateUrl = $base . '/rest/v1/tickets?id=eq.' . $t['id'];
        [$codeU] = supabase_request('PATCH', $updateUrl, $supabaseKey, [
            'next_step_due' => $nextStepDue
        ]);
        if ($codeU < 200 || $codeU >= 300) {
            $skipped++;
            continue;
        }

        $updated++;
    }

    sla_json(200, true, 'Backfill completed', [
        'updated' => $updated,
        'skipped' => $skipped,
        'limit' => $limit,
        'force' => $force,
        'auth_mode' => $authMode,
    ]);
} catch (Exception $e) {
    $errorId = api_log_exception('sla-backfill.api', $e);
    sla_json(500, false, 'Internal server error', ['error_id' => $errorId]);
}
