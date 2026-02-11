<?php
declare(strict_types=1);
/**
 * tickets.api.php
 * Creates tickets with encrypted/hashed reporter email for anonymous reporting.
 */

require_once __DIR__ . '/_crypto.php';

// Headers
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

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

try {
    // Load env
    load_env_file(__DIR__ . '/../../.env.local', true);
    load_env_file(__DIR__ . '/../../.env', false);

    $supabaseUrl = getenv('VITE_SUPABASE_URL');
    $supabaseAnon = getenv('VITE_SUPABASE_ANON_KEY');
    if (!$supabaseUrl || !$supabaseAnon) {
        throw new Exception('Missing Supabase environment configuration');
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?? '', true);
    if (!is_array($data)) {
        throw new Exception('Invalid JSON payload');
    }

    $email = trim((string)($data['reporter_email'] ?? ''));
    if ($email === '') {
        throw new Exception('reporter_email is required');
    }

    $isAnonymous = !empty($data['is_anonymous']);

    if ($isAnonymous) {
        $email = null;
    } else {
        $email = trim((string)($data['reporter_email'] ?? ''));
        if ($email === '') {
            throw new Exception('reporter_email is required for non‑anonymous reports');
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

    // Remove nulls to let DB defaults apply
    $payload = array_filter($payload, fn($v) => $v !== null);

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => rtrim($supabaseUrl, '/') . '/rest/v1/tickets',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => 'POST',
        CURLOPT_HTTPHEADER => [
            'apikey: ' . $supabaseAnon,
            'Authorization: Bearer ' . $supabaseAnon,
            'Content-Type: application/json',
            'Prefer: return=representation'
        ],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE)
    ]);

    $resp = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($resp === false) {
        throw new Exception('Supabase request failed: ' . curl_error($ch));
    }
    curl_close($ch);

    $decoded = json_decode($resp, true);
    if ($httpCode < 200 || $httpCode >= 300) {
        $msg = is_array($decoded) ? json_encode($decoded) : $resp;
        throw new Exception('Supabase insert failed: ' . $msg);
    }

    // Supabase returns array of inserted rows
    $row = is_array($decoded) && count($decoded) > 0 ? $decoded[0] : $decoded;

    echo json_encode(['success' => true, 'data' => $row], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
