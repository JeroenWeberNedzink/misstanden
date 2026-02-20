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

    $ticket = fetch_ticket_by_credentials($baseUrl, $serviceKey, $ticketInput, $accessCode);
    if (!$ticket) {
        api_json(401, false, 'Invalid ticket ID or access code');
    }

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

    $ticket = fetch_ticket_by_credentials($baseUrl, $serviceKey, $ticketInput, $accessCode);
    if (!$ticket) {
        api_json(401, false, 'Invalid ticket ID or access code');
    }

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
