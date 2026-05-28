<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_sqlserver.php';
require_once __DIR__ . '/_errors.php';
require_once __DIR__ . '/_security_headers.php';

api_apply_security_headers([
    'allow_methods' => 'GET, OPTIONS',
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

function catalog_json(int $status, bool $success, string $message, $data = null): void {
    http_response_code($status);
    echo json_encode(
        ['success' => $success, 'message' => $message, 'data' => $data],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

function catalog_bool_query(string $key, bool $default = false): bool {
    if (!array_key_exists($key, $_GET)) {
        return $default;
    }
    $raw = strtolower(trim((string)($_GET[$key] ?? '')));
    if ($raw === '') {
        return $default;
    }
    return in_array($raw, ['1', 'true', 'yes', 'on'], true);
}

function catalog_decode_json($value, $fallback) {
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

function catalog_normalize_status_row(array $row): array {
    $row['next_codes'] = catalog_decode_json($row['next_codes'] ?? null, []);
    return $row;
}

function catalog_cache_ttl_seconds(): int {
    if (isset($_GET['cache']) && trim((string)$_GET['cache']) === '0') {
        return 0;
    }
    return max(0, (int)(getenv('CATALOG_CACHE_TTL_SECONDS') ?: 60));
}

function catalog_cache_file(string $action, array $vary): string {
    $dir = sqlserver_project_root() . DIRECTORY_SEPARATOR . 'run' . DIRECTORY_SEPARATOR . 'cache';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    ksort($vary);
    $key = hash('sha256', $action . '|' . json_encode($vary, JSON_UNESCAPED_UNICODE));
    return $dir . DIRECTORY_SEPARATOR . 'catalog-' . $key . '.json';
}

function catalog_cache_get(string $action, array $vary) {
    $ttl = catalog_cache_ttl_seconds();
    if ($ttl <= 0) {
        return null;
    }

    $file = catalog_cache_file($action, $vary);
    if (!is_file($file) || (time() - (int)@filemtime($file)) > $ttl) {
        return null;
    }

    $raw = @file_get_contents($file);
    $decoded = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
    return is_array($decoded) ? $decoded : null;
}

function catalog_cache_set(string $action, array $vary, array $data): void {
    if (catalog_cache_ttl_seconds() <= 0) {
        return;
    }
    @file_put_contents(catalog_cache_file($action, $vary), json_encode($data, JSON_UNESCAPED_UNICODE), LOCK_EX);
}

function catalog_json_decode_array($raw): array {
    if (!is_string($raw) || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function catalog_normalize_workflow_tree(array $workflow): array {
    $statuses = is_array($workflow['statuses'] ?? null) ? $workflow['statuses'] : [];
    $workflow['statuses'] = array_map('catalog_normalize_status_row', $statuses);
    return $workflow;
}

try {
    load_runtime_env(__DIR__);

    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        catalog_json(405, false, 'Method not allowed');
    }
    if (!sqlserver_is_configured()) {
        throw new Exception('SQL Server is not configured');
    }

    $action = strtolower(trim((string)($_GET['action'] ?? 'workflows')));

    if ($action === 'workflows') {
        $includeInactive = catalog_bool_query('include_inactive', false);
        $cacheVary = ['include_inactive' => $includeInactive];
        $cached = catalog_cache_get($action, $cacheVary);
        if ($cached !== null) {
            catalog_json(200, true, 'Workflows loaded', $cached);
        }

        $sql = 'SELECT * FROM dbo.workflows';
        $params = [];
        if (!$includeInactive) {
            $sql .= ' WHERE active = @active';
            $params['active'] = true;
        }
        $sql .= ' ORDER BY display_order ASC, name ASC';
        $data = ['rows' => sqlserver_query($sql, $params)];
        catalog_cache_set($action, $cacheVary, $data);
        catalog_json(200, true, 'Workflows loaded', $data);
    }

    if ($action === 'handler_dashboard_catalog') {
        $includeInactive = catalog_bool_query('include_inactive', false);
        $cacheVary = ['include_inactive' => $includeInactive];
        $cached = catalog_cache_get($action, $cacheVary);
        if ($cached !== null) {
            catalog_json(200, true, 'Handler dashboard catalog loaded', $cached);
        }

        $rows = sqlserver_query(
            "SELECT
                COALESCE((
                    SELECT
                        w.id,
                        w.code,
                        w.name,
                        w.description,
                        w.icon_name,
                        w.color_scheme,
                        w.active,
                        w.display_order,
                        w.statutory_deadline_days,
                        JSON_QUERY(COALESCE((
                            SELECT
                                ws.id,
                                ws.workflow_id,
                                ws.code,
                                ws.label,
                                ws.color,
                                ws.sort_order,
                                ws.is_terminal,
                                ws.is_first_response,
                                JSON_QUERY(CASE WHEN ISJSON(ws.next_codes) = 1 THEN ws.next_codes ELSE '[]' END) AS next_codes,
                                ws.expected_duration_days
                            FROM dbo.workflow_statuses ws
                            WHERE ws.workflow_id = w.id
                            ORDER BY ws.sort_order ASC, ws.label ASC
                            FOR JSON PATH
                        ), '[]')) AS statuses
                    FROM dbo.workflows w
                    WHERE (@include_inactive = 1 OR w.active = @active)
                    ORDER BY w.display_order ASC, w.name ASC
                    FOR JSON PATH
                ), '[]') AS workflows_json,
                COALESCE((
                    SELECT id, code, label, color, sort_order, active
                    FROM dbo.incident_severities
                    WHERE active = @severity_active
                    ORDER BY sort_order ASC, label ASC
                    FOR JSON PATH
                ), '[]') AS severities_json",
            [
                'include_inactive' => $includeInactive,
                'active' => true,
                'severity_active' => true,
            ]
        );
        $row = $rows[0] ?? [];
        $data = [
            'workflows' => array_map('catalog_normalize_workflow_tree', catalog_json_decode_array($row['workflows_json'] ?? null)),
            'severities' => catalog_json_decode_array($row['severities_json'] ?? null),
        ];
        catalog_cache_set($action, $cacheVary, $data);
        catalog_json(200, true, 'Handler dashboard catalog loaded', $data);
    }

    if ($action === 'workflow_by_id') {
        $id = trim((string)($_GET['id'] ?? ''));
        if ($id === '') {
            throw new Exception('id is required');
        }
        $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.workflows WHERE id = @id', ['id' => $id]);
        $row = $rows[0] ?? null;
        if (!$row) {
            catalog_json(404, false, 'Workflow not found');
        }
        catalog_json(200, true, 'Workflow loaded', ['row' => $row]);
    }

    if ($action === 'workflow_by_code') {
        $code = trim((string)($_GET['code'] ?? ''));
        if ($code === '') {
            throw new Exception('code is required');
        }
        $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.workflows WHERE code = @code', ['code' => $code]);
        $row = $rows[0] ?? null;
        if (!$row) {
            catalog_json(404, false, 'Workflow not found');
        }
        catalog_json(200, true, 'Workflow loaded', ['row' => $row]);
    }

    if ($action === 'workflow_statuses') {
        $workflowId = trim((string)($_GET['workflow_id'] ?? ''));
        $workflowCode = trim((string)($_GET['workflow_code'] ?? ''));

        if ($workflowId === '' && $workflowCode === '') {
            throw new Exception('workflow_id or workflow_code is required');
        }

        if ($workflowId === '' && $workflowCode !== '') {
            $workflowRows = sqlserver_query(
                'SELECT TOP 1 id FROM dbo.workflows WHERE code = @code',
                ['code' => $workflowCode]
            );
            $workflowId = trim((string)($workflowRows[0]['id'] ?? ''));
        }

        if ($workflowId === '') {
            catalog_json(404, false, 'Workflow not found');
        }

        $rows = sqlserver_query(
            'SELECT * FROM dbo.workflow_statuses
             WHERE workflow_id = @workflow_id
             ORDER BY sort_order ASC, label ASC',
            ['workflow_id' => $workflowId]
        );
        catalog_json(200, true, 'Workflow statuses loaded', [
            'rows' => array_map('catalog_normalize_status_row', $rows),
        ]);
    }

    if ($action === 'workflow_statuses_bulk') {
        $rawIds = trim((string)($_GET['workflow_ids'] ?? ''));
        $workflowIds = array_values(array_unique(array_filter(array_map(
            static fn($id) => trim((string)$id),
            explode(',', $rawIds)
        ))));

        if (count($workflowIds) === 0) {
            throw new Exception('workflow_ids is required');
        }

        $params = [];
        $placeholders = [];
        foreach ($workflowIds as $index => $workflowId) {
            $key = 'workflow_id_' . $index;
            $params[$key] = $workflowId;
            $placeholders[] = '@' . $key;
        }

        $rows = sqlserver_query(
            'SELECT * FROM dbo.workflow_statuses
             WHERE workflow_id IN (' . implode(', ', $placeholders) . ')
             ORDER BY workflow_id ASC, sort_order ASC, label ASC',
            $params
        );
        catalog_json(200, true, 'Workflow statuses loaded', [
            'rows' => array_map('catalog_normalize_status_row', $rows),
        ]);
    }

    if ($action === 'locations') {
        $includeInactive = catalog_bool_query('include_inactive', false);
        $cacheVary = ['include_inactive' => $includeInactive];
        $cached = catalog_cache_get($action, $cacheVary);
        if ($cached !== null) {
            catalog_json(200, true, 'Locations loaded', $cached);
        }

        $sql = 'SELECT * FROM dbo.locations';
        $params = [];
        if (!$includeInactive) {
            $sql .= ' WHERE active = @active';
            $params['active'] = true;
        }
        $sql .= ' ORDER BY display_order ASC, country_name ASC';
        $data = ['rows' => sqlserver_query($sql, $params)];
        catalog_cache_set($action, $cacheVary, $data);
        catalog_json(200, true, 'Locations loaded', $data);
    }

    if ($action === 'location_by_id') {
        $id = trim((string)($_GET['id'] ?? ''));
        if ($id === '') {
            throw new Exception('id is required');
        }
        $rows = sqlserver_query('SELECT TOP 1 * FROM dbo.locations WHERE id = @id', ['id' => $id]);
        $row = $rows[0] ?? null;
        if (!$row) {
            catalog_json(404, false, 'Location not found');
        }
        catalog_json(200, true, 'Location loaded', ['row' => $row]);
    }

    if ($action === 'location_by_code') {
        $countryCode = strtoupper(trim((string)($_GET['country_code'] ?? '')));
        if ($countryCode === '') {
            throw new Exception('country_code is required');
        }
        $rows = sqlserver_query(
            'SELECT TOP 1 * FROM dbo.locations WHERE country_code = @country_code',
            ['country_code' => $countryCode]
        );
        $row = $rows[0] ?? null;
        if (!$row) {
            catalog_json(404, false, 'Location not found');
        }
        catalog_json(200, true, 'Location loaded', ['row' => $row]);
    }

    if ($action === 'severities') {
        $cached = catalog_cache_get($action, []);
        if ($cached !== null) {
            catalog_json(200, true, 'Severities loaded', $cached);
        }

        $rows = sqlserver_query(
            'SELECT * FROM dbo.incident_severities
             WHERE active = @active
             ORDER BY sort_order ASC, label ASC',
            ['active' => true]
        );
        $data = ['rows' => $rows];
        catalog_cache_set($action, [], $data);
        catalog_json(200, true, 'Severities loaded', $data);
    }

    catalog_json(400, false, 'Unsupported action');
} catch (Throwable $e) {
    $errorId = api_log_exception('catalog.api', $e);
    catalog_json(500, false, 'Internal server error', ['error_id' => $errorId]);
}
