<?php
declare(strict_types=1);
/**
 * tickets.api.php
 * Supported actions (POST JSON):
 * - create  : create new ticket
 * - access  : reporter ticket lookup by ticket_input + access_code
 * - message : reporter posts message by ticket_input + access_code
 */

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_supabase.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'OK'], JSON_UNESCAPED_UNICODE);
    exit;
}

ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/../../php-errors.log');
ini_set('display_errors', '0');
error_reporting(E_ALL);

function api_json(int $status, bool $success, string $message, $data = null): void {
    http_response_code($status);
    echo json_encode(
        ['success' => $success, 'message' => $message, 'data' => $data],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

function ticket_client_ip(): string {
    $candidates = [
        $_SERVER['HTTP_CF_CONNECTING_IP'] ?? null,
        $_SERVER['HTTP_X_FORWARDED_FOR'] ?? null,
        $_SERVER['REMOTE_ADDR'] ?? null,
    ];
    foreach ($candidates as $raw) {
        $value = trim((string)$raw);
        if ($value === '') {
            continue;
        }
        if (str_contains($value, ',')) {
            $parts = explode(',', $value);
            $value = trim((string)($parts[0] ?? ''));
        }
        if (filter_var($value, FILTER_VALIDATE_IP)) {
            return $value;
        }
    }
    return 'unknown';
}

function ticket_rate_limit_file(string $scope): string {
    $dir = __DIR__ . '/../../run/rate-limits';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir . '/' . hash('sha256', $scope) . '.json';
}

function ticket_rate_limit_state(string $scope): array {
    $file = ticket_rate_limit_file($scope);
    $fp = @fopen($file, 'c+');
    if (!$fp) {
        return ['fp' => null, 'state' => ['window_start' => time(), 'count' => 0, 'blocked_until' => 0]];
    }
    if (!@flock($fp, LOCK_EX)) {
        fclose($fp);
        return ['fp' => null, 'state' => ['window_start' => time(), 'count' => 0, 'blocked_until' => 0]];
    }
    $raw = stream_get_contents($fp);
    $decoded = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
    $state = is_array($decoded) ? $decoded : [];
    return ['fp' => $fp, 'state' => [
        'window_start' => (int)($state['window_start'] ?? time()),
        'count' => (int)($state['count'] ?? 0),
        'blocked_until' => (int)($state['blocked_until'] ?? 0),
    ]];
}

function ticket_rate_limit_commit($fp, array $state): void {
    if (!$fp) {
        return;
    }
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($state, JSON_UNESCAPED_UNICODE));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
}

function ticket_rate_limit_allow(string $scope, int $maxAttempts, int $windowSeconds): array {
    $now = time();
    $ctx = ticket_rate_limit_state($scope);
    $fp = $ctx['fp'];
    $state = $ctx['state'];

    if ($state['blocked_until'] > $now) {
        ticket_rate_limit_commit($fp, $state);
        return ['allowed' => false, 'retry_after' => max(1, $state['blocked_until'] - $now)];
    }

    if (($now - $state['window_start']) >= $windowSeconds) {
        $state['window_start'] = $now;
        $state['count'] = 0;
        $state['blocked_until'] = 0;
    }

    $state['count']++;
    if ($state['count'] > $maxAttempts) {
        $state['blocked_until'] = $now + $windowSeconds;
        ticket_rate_limit_commit($fp, $state);
        return ['allowed' => false, 'retry_after' => $windowSeconds];
    }

    ticket_rate_limit_commit($fp, $state);
    return ['allowed' => true, 'retry_after' => 0];
}

function ticket_rate_limit_reset(string $scope): void {
    $file = ticket_rate_limit_file($scope);
    if (is_file($file)) {
        @unlink($file);
    }
}

function ticket_limit_scope_suffix(string $ticketInput): string {
    $meta = normalize_ticket_input($ticketInput);
    if (!empty($meta['ok'])) {
        return (string)$meta['value'];
    }
    $raw = strtoupper(trim((string)$ticketInput));
    return $raw !== '' ? $raw : 'unknown';
}

function ticket_enforce_request_rate_limit(string $action, string $ticketInput): void {
    $ip = ticket_client_ip();
    $ticketKey = ticket_limit_scope_suffix($ticketInput);

    $ipScope = 'tickets:' . $action . ':ip:' . $ip;
    $ticketScope = 'tickets:' . $action . ':ip_ticket:' . $ip . ':' . $ticketKey;

    $ipCheck = ticket_rate_limit_allow($ipScope, 80, 300);
    if (!$ipCheck['allowed']) {
        api_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $ipCheck['retry_after']]);
    }

    $ticketCheck = ticket_rate_limit_allow($ticketScope, 15, 300);
    if (!$ticketCheck['allowed']) {
        api_json(429, false, 'Too many requests. Try again later.', ['retry_after' => $ticketCheck['retry_after']]);
    }
}

function ticket_register_failed_auth_attempt(string $ticketInput): void {
    $ip = ticket_client_ip();
    $ticketKey = ticket_limit_scope_suffix($ticketInput);
    $failScope = 'tickets:auth_fail:' . $ip . ':' . $ticketKey;
    $result = ticket_rate_limit_allow($failScope, 6, 900);
    if (!$result['allowed']) {
        api_json(429, false, 'Too many failed attempts. Try again later.', ['retry_after' => $result['retry_after']]);
    }
}

function ticket_reset_failed_auth_attempts(string $ticketInput): void {
    $ip = ticket_client_ip();
    $ticketKey = ticket_limit_scope_suffix($ticketInput);
    $failScope = 'tickets:auth_fail:' . $ip . ':' . $ticketKey;
    ticket_rate_limit_reset($failScope);
}

function supabase_request(string $method, string $url, string $apikey, $payload = null, bool $returnRepresentation = false): array {
    $headers = [
        'apikey: ' . $apikey,
        'Authorization: Bearer ' . $apikey,
        'Content-Type: application/json',
    ];
    if ($returnRepresentation) {
        $headers[] = 'Prefer: return=representation';
    }

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 20,
    ]);
    if ($payload !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_UNICODE));
    }

    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($resp === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new Exception('Supabase request failed: ' . $err);
    }
    curl_close($ch);

    $decoded = json_decode($resp, true);
    return [$code, $decoded, $resp];
}

function get_first_row($decoded) {
    if (is_array($decoded) && array_is_list($decoded)) {
        return count($decoded) > 0 ? $decoded[0] : null;
    }
    return is_array($decoded) ? $decoded : null;
}

function normalize_access_code($raw): string {
    $digits = preg_replace('/\D+/', '', (string)$raw);
    if ($digits === null || $digits === '') return '';
    $digits = str_pad(substr($digits, -6), 6, '0', STR_PAD_LEFT);
    return preg_match('/^\d{6}$/', $digits) ? $digits : '';
}

function normalize_ticket_input($raw): array {
    $value = strtoupper(trim((string)$raw));
    if ($value === '') {
        return ['ok' => false, 'is_uuid' => false, 'value' => ''];
    }

    $isUuid = preg_match(
        '/^[0-9A-F]{8}-[0-9A-F]{4}-[1-5][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i',
        $value
    ) === 1;

    if ($isUuid) {
        return ['ok' => true, 'is_uuid' => true, 'value' => strtolower($value)];
    }

    if (preg_match('/^[A-Z0-9-]{3,32}$/', $value) !== 1) {
        return ['ok' => false, 'is_uuid' => false, 'value' => ''];
    }

    return ['ok' => true, 'is_uuid' => false, 'value' => $value];
}

function get_supabase_url(): string {
    $url = getenv('VITE_SUPABASE_URL') ?: '';
    if ($url === '') {
        throw new Exception('Missing Supabase URL configuration');
    }
    return rtrim($url, '/');
}

function get_supabase_service_key(): string {
    return supabase_get_service_role_key();
}

function sanitize_reporter_ticket(array $ticket): array {
    unset($ticket['access_code'], $ticket['reporter_email'], $ticket['reporter_email_encrypted'], $ticket['reporter_email_hash']);

    $attachments = is_array($ticket['attachments'] ?? null) ? $ticket['attachments'] : [];
    $ticket['attachments'] = array_values(array_filter($attachments, static function ($att) {
        if (!is_array($att)) return false;
        $isInternal = !empty($att['is_internal']) || !empty($att['isInternal']);
        $hasNote = !empty($att['note_id']) || !empty($att['noteId']);
        return !$isInternal && !$hasNote;
    }));

    $messages = is_array($ticket['messages'] ?? null) ? $ticket['messages'] : [];
    $ticket['messages'] = array_values(array_filter($messages, static function ($msg) {
        if (!is_array($msg)) return false;
        return empty($msg['is_internal']) && empty($msg['isInternal']);
    }));
    usort($ticket['messages'], static function ($a, $b) {
        $ta = strtotime((string)($a['created_at'] ?? '')) ?: 0;
        $tb = strtotime((string)($b['created_at'] ?? '')) ?: 0;
        return $ta <=> $tb;
    });

    $actions = is_array($ticket['ticket_actions'] ?? null) ? $ticket['ticket_actions'] : [];
    $ticket['ticket_actions'] = array_values($actions);
    usort($ticket['ticket_actions'], static function ($a, $b) {
        $ta = strtotime((string)($a['created_at'] ?? '')) ?: 0;
        $tb = strtotime((string)($b['created_at'] ?? '')) ?: 0;
        return $tb <=> $ta;
    });

    return $ticket;
}

function fetch_ticket_by_credentials(string $baseUrl, string $key, string $ticketInput, string $accessCode): ?array {
    $ticketMeta = normalize_ticket_input($ticketInput);
    if (!$ticketMeta['ok']) return null;
    if ($accessCode === '') return null;

    $select = '*,handlers:handler_id(id,name,email,roles),attachments(*),messages(*),ticket_actions(*)';
    $ticketFilter = $ticketMeta['is_uuid']
        ? 'id=eq.' . rawurlencode($ticketMeta['value'])
        : 'ticket_number=eq.' . rawurlencode($ticketMeta['value']);

    $url = $baseUrl
        . '/rest/v1/tickets?select=' . rawurlencode($select)
        . '&access_code=eq.' . rawurlencode($accessCode)
        . '&' . $ticketFilter
        . '&limit=1';

    [$code, $decoded, $raw] = supabase_request('GET', $url, $key);
    if ($code < 200 || $code >= 300) {
        $msg = is_array($decoded) ? json_encode($decoded, JSON_UNESCAPED_UNICODE) : (string)$raw;
        throw new Exception('Supabase ticket lookup failed: ' . $msg);
    }

    return get_first_row($decoded);
}

function handle_create(array $data): void {
    $baseUrl = get_supabase_url();
    $serviceKey = get_supabase_service_key();

    $email = trim((string)($data['reporter_email'] ?? ''));
    $isAnonymous = !empty($data['is_anonymous']);

    if ($isAnonymous) {
        $email = null;
    } else {
        if ($email === '') {
            throw new Exception('reporter_email is required for non-anonymous reports');
        }
    }

    $key = get_email_crypto_key();
    $encryptedEmail = $email ? encrypt_email($email, $key) : null;
    $emailHash = $email ? hash_email($email) : null;

    $payload = [
        'ticket_number' => $data['ticket_number'] ?? null,
        'access_code' => $data['access_code'] ?? null,
        'description' => $data['description'] ?? null,
        'location' => $data['location'] ?? null,
        'workflow_type' => $data['workflow_type'] ?? null,
        'severity_code' => $data['severity_code'] ?? null,
        'reporter_name' => $data['reporter_name'] ?? null,
        'reporter_phone' => $data['reporter_phone'] ?? null,
        'email_notify' => !empty($data['email_notify']),
        'status_email_notify' => array_key_exists('status_email_notify', $data)
            ? !empty($data['status_email_notify'])
            : true,
        'status_code' => $data['status_code'] ?? null,
        'current_stage' => $data['current_stage'] ?? null,
        'metadata' => $data['metadata'] ?? null,
        'reporter_email' => $isAnonymous ? null : $email,
        'reporter_email_encrypted' => $encryptedEmail,
        'reporter_email_hash' => $emailHash,
        'next_step_due' => $data['next_step_due'] ?? null,
    ];
    $payload = array_filter($payload, static fn($v) => $v !== null);

    [$code, $decoded, $raw] = supabase_request(
        'POST',
        $baseUrl . '/rest/v1/tickets',
        $serviceKey,
        $payload,
        true
    );

    if ($code < 200 || $code >= 300) {
        $msg = is_array($decoded) ? json_encode($decoded, JSON_UNESCAPED_UNICODE) : (string)$raw;
        throw new Exception('Supabase insert failed: ' . $msg);
    }

    $row = get_first_row($decoded);
    api_json(200, true, 'Ticket created', $row);
}

function handle_access(array $data): void {
    $baseUrl = get_supabase_url();
    $serviceKey = get_supabase_service_key();

    $ticketInput = (string)($data['ticket_input'] ?? $data['ticket_number'] ?? $data['ticket_id'] ?? '');
    $accessCode = normalize_access_code($data['access_code'] ?? '');
    if ($ticketInput === '' || $accessCode === '') {
        api_json(400, false, 'ticket_input and a valid 6-digit access_code are required');
    }

    ticket_enforce_request_rate_limit('access', $ticketInput);

    $ticket = fetch_ticket_by_credentials($baseUrl, $serviceKey, $ticketInput, $accessCode);
    if (!$ticket) {
        ticket_register_failed_auth_attempt($ticketInput);
        usleep(random_int(150000, 350000));
        api_json(401, false, 'Invalid ticket ID or access code');
    }

    ticket_reset_failed_auth_attempts($ticketInput);
    api_json(200, true, 'Ticket loaded', sanitize_reporter_ticket($ticket));
}

function handle_reporter_message(array $data): void {
    $baseUrl = get_supabase_url();
    $serviceKey = get_supabase_service_key();

    $ticketInput = (string)($data['ticket_input'] ?? $data['ticket_number'] ?? $data['ticket_id'] ?? '');
    $accessCode = normalize_access_code($data['access_code'] ?? '');
    $body = trim((string)($data['body'] ?? ''));

    if ($ticketInput === '' || $accessCode === '') {
        api_json(400, false, 'ticket_input and a valid 6-digit access_code are required');
    }
    if ($body === '') {
        api_json(400, false, 'Message body is required');
    }
    if (mb_strlen($body) > 1000) {
        api_json(400, false, 'Message body exceeds 1000 characters');
    }

    ticket_enforce_request_rate_limit('message', $ticketInput);

    $ticket = fetch_ticket_by_credentials($baseUrl, $serviceKey, $ticketInput, $accessCode);
    if (!$ticket) {
        ticket_register_failed_auth_attempt($ticketInput);
        usleep(random_int(150000, 350000));
        api_json(401, false, 'Invalid ticket ID or access code');
    }
    ticket_reset_failed_auth_attempts($ticketInput);

    $ticketId = (string)($ticket['id'] ?? '');
    if ($ticketId === '') {
        throw new Exception('Ticket lookup returned invalid data');
    }

    $messagePayload = [
        'ticket_id' => $ticketId,
        'sender' => 'reporter',
        'body' => $body,
        'is_internal' => false,
    ];

    [$msgCode, $msgDecoded, $msgRaw] = supabase_request(
        'POST',
        $baseUrl . '/rest/v1/messages',
        $serviceKey,
        $messagePayload,
        true
    );
    if ($msgCode < 200 || $msgCode >= 300) {
        $msg = is_array($msgDecoded) ? json_encode($msgDecoded, JSON_UNESCAPED_UNICODE) : (string)$msgRaw;
        throw new Exception('Failed to insert reporter message: ' . $msg);
    }

    $insertedMessage = get_first_row($msgDecoded) ?? [];

    $nowIso = gmdate('c');
    supabase_request(
        'PATCH',
        $baseUrl . '/rest/v1/tickets?id=eq.' . rawurlencode($ticketId),
        $serviceKey,
        ['last_update_at' => $nowIso]
    );

    $reporterName = trim((string)($ticket['reporter_name'] ?? ''));
    $performedBy = $reporterName !== '' ? $reporterName : 'Reporter';
    $actionPayload = [
        'ticket_id' => $ticketId,
        'action_type' => 'message_sent',
        'action' => 'Message Sent',
        'description' => 'Reporter sent a message',
        'performed_by' => $performedBy,
    ];
    try {
        supabase_request('POST', $baseUrl . '/rest/v1/ticket_actions', $serviceKey, $actionPayload, false);
    } catch (Throwable $e) {
        error_log('[tickets.api] Could not write ticket_actions for reporter message: ' . $e->getMessage());
    }

    $ticketAfter = fetch_ticket_by_credentials($baseUrl, $serviceKey, $ticketInput, $accessCode);
    $safeTicket = $ticketAfter ? sanitize_reporter_ticket($ticketAfter) : sanitize_reporter_ticket($ticket);

    api_json(200, true, 'Message sent', [
        'message' => $insertedMessage,
        'ticket' => $safeTicket,
    ]);
}

try {
    load_env_file(__DIR__ . '/../../.env.local', true);
    load_env_file(__DIR__ . '/../../.env', false);

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        api_json(405, false, 'Method not allowed');
    }

    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?? '', true);
    if (!is_array($data)) {
        throw new Exception('Invalid JSON payload');
    }

    $action = strtolower(trim((string)($data['action'] ?? 'create')));
    switch ($action) {
        case 'create':
            handle_create($data);
            break;
        case 'access':
            handle_access($data);
            break;
        case 'message':
            handle_reporter_message($data);
            break;
        default:
            api_json(400, false, 'Unsupported action');
    }
} catch (Throwable $e) {
    api_json(500, false, $e->getMessage());
}
