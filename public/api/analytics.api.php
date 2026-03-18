<?php
declare(strict_types=1);

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_admin_auth.php';
require_once __DIR__ . '/_supabase.php';
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

function analytics_json(int $status, bool $success, string $message, array $data = []): void {
    http_response_code($status);
    echo json_encode(array_merge([
        'success' => $success,
        'message' => $message,
    ], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function analytics_supabase_request(string $method, string $url, string $serviceKey): array {
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

function analytics_parse_date(string $raw, ?DateTimeImmutable $fallback = null): ?DateTimeImmutable {
    $value = trim($raw);
    if ($value === '') return $fallback;
    $dt = DateTimeImmutable::createFromFormat('Y-m-d', $value, new DateTimeZone('UTC'));
    return $dt ?: $fallback;
}

function analytics_duration_hours(?string $from, ?string $to): ?float {
    if (!$from || !$to) return null;
    $a = strtotime($from);
    $b = strtotime($to);
    if ($a === false || $b === false || $b < $a) return null;
    return ($b - $a) / 3600;
}

function analytics_month_key(?string $dateLike): ?string {
    if (!$dateLike) return null;
    $ts = strtotime($dateLike);
    if ($ts === false) return null;
    return gmdate('Y-m', $ts);
}

function analytics_build_series(array $map): array {
    ksort($map);
    $out = [];
    foreach ($map as $key => $value) {
        $out[] = ['label' => $key, 'value' => (int)$value];
    }
    return $out;
}

function analytics_fetch_locations_catalog(string $baseUrl, string $serviceKey): array {
    [$code, $decoded, $raw] = analytics_supabase_request(
        'GET',
        $baseUrl . '/rest/v1/locations?select=id,country_code,country_name,display_order,active&order=display_order.asc&order=country_name.asc',
        $serviceKey
    );
    if ($code < 200 || $code >= 300) {
        $msg = is_array($decoded) ? json_encode($decoded, JSON_UNESCAPED_UNICODE) : (string)$raw;
        throw new Exception('Failed to load locations catalog: ' . $msg);
    }

    $rows = is_array($decoded) ? $decoded : [];
    $byId = [];
    $byCode = [];
    $byName = [];
    $order = [];

    foreach ($rows as $row) {
        $id = trim((string)($row['id'] ?? ''));
        $countryCode = strtoupper(trim((string)($row['country_code'] ?? '')));
        $countryName = trim((string)($row['country_name'] ?? ''));
        if ($countryCode === '' || $countryName === '') {
            continue;
        }

        $entry = [
            'id' => $id,
            'country_code' => $countryCode,
            'country_name' => $countryName,
            'display_order' => (int)($row['display_order'] ?? 0),
            'active' => !empty($row['active']),
        ];

        if ($id !== '') {
            $byId[$id] = $entry;
        }
        $byCode[$countryCode] = $entry;
        $byName[strtolower($countryName)] = $entry;
        $order[] = $countryCode;
    }

    return [
        'by_id' => $byId,
        'by_code' => $byCode,
        'by_name' => $byName,
        'order' => $order,
    ];
}

function analytics_resolve_country_code(array $ticket, array $catalog): ?string {
    $byId = $catalog['by_id'] ?? [];
    $byCode = $catalog['by_code'] ?? [];
    $byName = $catalog['by_name'] ?? [];

    $locationId = trim((string)($ticket['location_id'] ?? ''));
    if ($locationId !== '' && isset($byId[$locationId])) {
        return (string)$byId[$locationId]['country_code'];
    }

    $rawLocation = trim((string)($ticket['location'] ?? ''));
    if ($rawLocation === '') {
        return null;
    }

    // Direct match on configured country name.
    $nameKey = strtolower($rawLocation);
    if (isset($byName[$nameKey])) {
        return (string)$byName[$nameKey]['country_code'];
    }

    // Most reporter values are stored as "CC: free text".
    if (preg_match('/^\s*([A-Za-z]{2})\s*[:\-\/\s]/', $rawLocation, $m) === 1) {
        $countryCode = strtoupper((string)($m[1] ?? ''));
        if (isset($byCode[$countryCode])) {
            return $countryCode;
        }
    }

    // Exact 2-letter code.
    if (preg_match('/^\s*([A-Za-z]{2})\s*$/', $rawLocation, $m) === 1) {
        $countryCode = strtoupper((string)($m[1] ?? ''));
        if (isset($byCode[$countryCode])) {
            return $countryCode;
        }
    }

    return null;
}

function analytics_build_location_series(array $countsByCode, array $catalog, int $unmappedCount = 0): array {
    $byCode = $catalog['by_code'] ?? [];
    $order = $catalog['order'] ?? [];
    $seen = [];
    $out = [];

    foreach ($order as $countryCode) {
        $countryCode = strtoupper(trim((string)$countryCode));
        if ($countryCode === '' || isset($seen[$countryCode])) {
            continue;
        }
        $seen[$countryCode] = true;
        $entry = $byCode[$countryCode] ?? null;
        $countryName = trim((string)($entry['country_name'] ?? $countryCode));
        $out[] = [
            'label' => $countryName,
            'country_code' => $countryCode,
            'value' => (int)($countsByCode[$countryCode] ?? 0),
        ];
    }

    foreach ($countsByCode as $countryCode => $value) {
        $countryCode = strtoupper(trim((string)$countryCode));
        if ($countryCode === '' || isset($seen[$countryCode])) {
            continue;
        }
        $entry = $byCode[$countryCode] ?? null;
        $countryName = trim((string)($entry['country_name'] ?? $countryCode));
        $out[] = [
            'label' => $countryName,
            'country_code' => $countryCode,
            'value' => (int)$value,
        ];
        $seen[$countryCode] = true;
    }

    if ($unmappedCount > 0) {
        $out[] = [
            'label' => 'Unmapped',
            'country_code' => 'UNMAPPED',
            'value' => $unmappedCount,
        ];
    }

    return $out;
}

try {
    load_env_file(__DIR__ . '/../../.env.local', true);
    load_env_file(__DIR__ . '/../../.env', false);

    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        analytics_json(405, false, 'Method not allowed');
    }

    $ctx = api_authz_require_admin(static function (int $status, string $message): void {
        analytics_json($status, false, $message);
    });

    $baseUrl = rtrim((string)$ctx['base_url'], '/');
    $serviceKey = (string)$ctx['service_key'];

    $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $defaultFrom = $now->modify('-12 months')->setTime(0, 0, 0);
    $defaultTo = $now->setTime(23, 59, 59);

    $dateFrom = analytics_parse_date((string)($_GET['date_from'] ?? ''), $defaultFrom);
    $dateTo = analytics_parse_date((string)($_GET['date_to'] ?? ''), $defaultTo);
    if (!$dateFrom || !$dateTo || $dateTo < $dateFrom) {
        analytics_json(400, false, 'Invalid date range');
    }

    $ticketsSelectWithLocationId = 'id,submitted_at,last_update_at,status_code,workflow_type,location,location_id,severity_code,metadata';
    $ticketUrl = $baseUrl . '/rest/v1/tickets?select=' . rawurlencode($ticketsSelectWithLocationId)
        . '&submitted_at=gte.' . rawurlencode($dateFrom->format(DATE_ATOM))
        . '&submitted_at=lte.' . rawurlencode($dateTo->format(DATE_ATOM))
        . '&order=submitted_at.asc';

    [$ticketCode, $ticketsDecoded, $ticketsRaw] = analytics_supabase_request('GET', $ticketUrl, $serviceKey);
    if ($ticketCode < 200 || $ticketCode >= 300) {
        // Some environments still have textual location only. Retry without location_id.
        $ticketsSelectFallback = 'id,submitted_at,last_update_at,status_code,workflow_type,location,severity_code,metadata';
        $ticketUrlFallback = $baseUrl . '/rest/v1/tickets?select=' . rawurlencode($ticketsSelectFallback)
            . '&submitted_at=gte.' . rawurlencode($dateFrom->format(DATE_ATOM))
            . '&submitted_at=lte.' . rawurlencode($dateTo->format(DATE_ATOM))
            . '&order=submitted_at.asc';
        [$ticketCode, $ticketsDecoded, $ticketsRaw] = analytics_supabase_request('GET', $ticketUrlFallback, $serviceKey);
    }
    if ($ticketCode < 200 || $ticketCode >= 300) {
        $msg = is_array($ticketsDecoded) ? json_encode($ticketsDecoded, JSON_UNESCAPED_UNICODE) : (string)$ticketsRaw;
        throw new Exception('Failed to load tickets for analytics: ' . $msg);
    }
    $tickets = is_array($ticketsDecoded) ? $ticketsDecoded : [];
    $locationsCatalog = analytics_fetch_locations_catalog($baseUrl, $serviceKey);

    [$statusCode, $statusDecoded, $statusRaw] = analytics_supabase_request(
        'GET',
        $baseUrl . '/rest/v1/workflow_statuses?select=code,is_terminal',
        $serviceKey
    );
    if ($statusCode < 200 || $statusCode >= 300) {
        $msg = is_array($statusDecoded) ? json_encode($statusDecoded, JSON_UNESCAPED_UNICODE) : (string)$statusRaw;
        throw new Exception('Failed to load workflow statuses: ' . $msg);
    }
    $terminalStatuses = [];
    foreach (($statusDecoded ?? []) as $statusRow) {
        if (!empty($statusRow['is_terminal'])) {
            $terminalStatuses[strtolower(trim((string)($statusRow['code'] ?? '')))] = true;
        }
    }

    [$escalationCode, $escalationDecoded, $escalationRaw] = analytics_supabase_request(
        'GET',
        $baseUrl . '/rest/v1/sla_escalations?select=id,ticket_id,reason,escalated_at'
        . '&escalated_at=gte.' . rawurlencode($dateFrom->format(DATE_ATOM))
        . '&escalated_at=lte.' . rawurlencode($dateTo->format(DATE_ATOM)),
        $serviceKey
    );
    if ($escalationCode < 200 || $escalationCode >= 300) {
        $msg = is_array($escalationDecoded) ? json_encode($escalationDecoded, JSON_UNESCAPED_UNICODE) : (string)$escalationRaw;
        throw new Exception('Failed to load SLA escalations: ' . $msg);
    }
    $escalations = is_array($escalationDecoded) ? $escalationDecoded : [];

    $reportsPerMonth = [];
    $reportsPerCategory = [];
    $reportsPerLocation = [];
    $unmappedLocationCount = 0;
    $resolutionHours = [];

    foreach ($tickets as $ticket) {
        $monthKey = analytics_month_key((string)($ticket['submitted_at'] ?? ''));
        if ($monthKey !== null) {
            $reportsPerMonth[$monthKey] = ($reportsPerMonth[$monthKey] ?? 0) + 1;
        }

        $category = trim((string)($ticket['workflow_type'] ?? ''));
        if ($category === '') $category = 'unknown';
        $reportsPerCategory[$category] = ($reportsPerCategory[$category] ?? 0) + 1;

        $countryCode = analytics_resolve_country_code($ticket, $locationsCatalog);
        if ($countryCode !== null) {
            $reportsPerLocation[$countryCode] = ($reportsPerLocation[$countryCode] ?? 0) + 1;
        } else {
            $unmappedLocationCount++;
        }

        $statusCodeValue = strtolower(trim((string)($ticket['status_code'] ?? '')));
        if (!isset($terminalStatuses[$statusCodeValue])) {
            continue;
        }

        $duration = analytics_duration_hours(
            (string)($ticket['submitted_at'] ?? ''),
            (string)($ticket['last_update_at'] ?? '')
        );
        if ($duration !== null) {
            $resolutionHours[] = $duration;
        }
    }

    $avgResolutionHours = 0.0;
    if (count($resolutionHours) > 0) {
        $avgResolutionHours = array_sum($resolutionHours) / count($resolutionHours);
    }

    $slaBreachesByReason = [];
    foreach ($escalations as $row) {
        $reason = trim((string)($row['reason'] ?? 'unspecified'));
        if ($reason === '') $reason = 'unspecified';
        $slaBreachesByReason[$reason] = ($slaBreachesByReason[$reason] ?? 0) + 1;
    }

    arsort($reportsPerCategory);
    arsort($reportsPerLocation);
    arsort($slaBreachesByReason);

    $locationSeries = analytics_build_location_series($reportsPerLocation, $locationsCatalog, $unmappedLocationCount);

    analytics_json(200, true, 'Analytics loaded', [
        'data' => [
            'range' => [
                'date_from' => $dateFrom->format('Y-m-d'),
                'date_to' => $dateTo->format('Y-m-d'),
            ],
            'summary' => [
                'total_reports' => count($tickets),
                'average_resolution_hours' => round($avgResolutionHours, 2),
                'sla_breaches' => count($escalations),
            ],
            'reports_per_month' => analytics_build_series($reportsPerMonth),
            'reports_per_category' => analytics_build_series($reportsPerCategory),
            'reports_per_location' => $locationSeries,
            'location_heatmap' => $locationSeries,
            'sla_breaches_by_reason' => analytics_build_series($slaBreachesByReason),
        ],
    ]);
} catch (Throwable $e) {
    $errorId = api_log_exception('analytics.api', $e);
    analytics_json(500, false, 'Internal server error', ['data' => ['error_id' => $errorId]]);
}
