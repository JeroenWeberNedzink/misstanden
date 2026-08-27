<?php
declare(strict_types=1);

require_once __DIR__ . '/../public/api/_crypto.php';
require_once __DIR__ . '/../public/api/_sqlserver.php';
require_once __DIR__ . '/../public/api/_attachment_security.php';
require_once __DIR__ . '/../public/api/_portal_tokens.php';

load_runtime_env(__DIR__ . '/../public/api');
if (trim((string)(getenv('ATTACHMENT_TOKEN_KEY') ?: '')) === '') putenv('ATTACHMENT_TOKEN_KEY=' . bin2hex(random_bytes(32)));
if (trim((string)(getenv('PORTAL_TOKEN_HASH_KEY') ?: '')) === '') putenv('PORTAL_TOKEN_HASH_KEY=' . bin2hex(random_bytes(32)));

$results = [];
function security_test(string $name, bool $ok): void {
    global $results;
    $results[] = ['name' => $name, 'ok' => $ok];
}

$ticketA = '11111111-1111-4111-8111-111111111111';
$ticketB = '22222222-2222-4222-8222-222222222222';
$attachmentA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
$public = ['id' => $attachmentA, 'ticket_id' => $ticketA, 'is_internal' => 0, 'note_id' => null];
$internal = ['id' => $attachmentA, 'ticket_id' => $ticketA, 'is_internal' => 1, 'note_id' => null];

security_test('attachment tokens use a dedicated server key', !str_contains((string)file_get_contents(__DIR__ . '/../public/api/_attachment_security.php'), 'get_email_crypto_key'));
security_test('portal hashes use a dedicated server key', !str_contains((string)file_get_contents(__DIR__ . '/../public/api/_portal_tokens.php'), 'get_email_crypto_key'));
$attachmentTestKey = (string)getenv('ATTACHMENT_TOKEN_KEY');
putenv('ATTACHMENT_TOKEN_KEY=');
try {
    attachment_security_root_key();
    security_test('missing attachment token key fails closed', false);
} catch (RuntimeException $e) {
    security_test('missing attachment token key fails closed', true);
} finally {
    putenv('ATTACHMENT_TOKEN_KEY=' . $attachmentTestKey);
}
$portalTestKey = (string)getenv('PORTAL_TOKEN_HASH_KEY');
putenv('PORTAL_TOKEN_HASH_KEY=');
try {
    portal_token_hash_key();
    security_test('missing portal token hash key fails closed', false);
} catch (RuntimeException $e) {
    security_test('missing portal token hash key fails closed', true);
} finally {
    putenv('PORTAL_TOKEN_HASH_KEY=' . $portalTestKey);
}

$downloadUrl = attachment_security_download_url($public, 'reporter');
security_test('signed link issued for public reporter attachment', is_string($downloadUrl) && str_contains($downloadUrl, 'token=v1.'));
security_test('signed link is opaque', is_string($downloadUrl) && !str_contains($downloadUrl, $attachmentA) && !str_contains($downloadUrl, $ticketA));
security_test('internal attachment denied to public scopes', attachment_security_download_url($internal, 'reporter') === null && attachment_security_download_url($internal, 'guest') === null);

$validToken = attachment_security_seal(['k' => 'download', 'a' => $attachmentA, 't' => $ticketA, 's' => 'handler', 'e' => time() + 60]);
$tamperedParts = explode('.', $validToken);
$tamperedParts[2][0] = $tamperedParts[2][0] === 'A' ? 'B' : 'A';
$tampered = implode('.', $tamperedParts);
security_test('modified signed token rejected', attachment_security_open($tampered) === null);
$expired = attachment_security_seal(['k' => 'download', 'a' => $attachmentA, 't' => $ticketA, 's' => 'handler', 'e' => time() - 1]);
security_test('expired signed token rejected', attachment_security_validate_download($expired) === null);

$badPaths = ['../secret', '../../.env', '..\\..\\private\\keys', 'C:\\Windows\\win.ini', '\\\\server\\share\\file', 'attachments/' . $ticketA . '/file.pdf.php', 'attachments/' . $ticketA . '/document.pdf.exe', 'attachments/' . $ticketA . '/%252e%252e%252f.env'];
foreach ($badPaths as $path) security_test('path rejected: ' . $path, attachment_security_normalize_storage_key($path) === null);
$goodKey = 'attachments/' . $ticketA . '/0123456789abcdef.pdf';
security_test('generated storage key accepted', attachment_security_normalize_storage_key($goodKey) === $goodKey);
$originalStorageRoot = getenv('ATTACHMENT_STORAGE_ROOT');
$exactAttachmentRoot = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'nz-attachment-security-' . bin2hex(random_bytes(8)) . DIRECTORY_SEPARATOR . 'attachments';
putenv('ATTACHMENT_STORAGE_ROOT=' . $exactAttachmentRoot);
$exactStoragePath = attachment_security_storage_path($goodKey);
security_test(
    'exact attachment storage root does not duplicate attachments segment',
    $exactStoragePath === realpath($exactAttachmentRoot) . DIRECTORY_SEPARATOR . $ticketA . DIRECTORY_SEPARATOR . '0123456789abcdef.pdf'
);
putenv($originalStorageRoot === false ? 'ATTACHMENT_STORAGE_ROOT' : 'ATTACHMENT_STORAGE_ROOT=' . $originalStorageRoot);
@rmdir($exactAttachmentRoot);
@rmdir(dirname($exactAttachmentRoot));

if (sqlserver_is_configured()) {
    $columns = (int)sqlserver_scalar("SELECT (CASE WHEN COL_LENGTH(N'dbo.tickets', N'access_code_hash') IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN COL_LENGTH(N'dbo.ticket_reply_tokens', N'token_hash') IS NOT NULL THEN 1 ELSE 0 END)");
    security_test('one-way token hash columns installed', $columns === 2);

    $pair = sqlserver_query('SELECT TOP 1 h.id AS handler_id, t.id AS ticket_id FROM dbo.handlers h INNER JOIN dbo.ticket_handlers th ON th.handler_id = h.id INNER JOIN dbo.tickets t ON t.id = th.ticket_id WHERE h.active = 1');
    if (!empty($pair[0])) security_test('assigned handler ticket access allowed', attachment_security_handler_can_access_ticket(['id' => $pair[0]['handler_id']], $pair[0]['ticket_id']));

    $denied = sqlserver_query('SELECT TOP 1 h.id AS handler_id, t.id AS ticket_id FROM dbo.handlers h CROSS JOIN dbo.tickets t WHERE h.active = 1 AND t.handler_id <> h.id AND NOT EXISTS (SELECT 1 FROM dbo.ticket_handlers th WHERE th.ticket_id=t.id AND th.handler_id=h.id) AND NOT EXISTS (SELECT 1 FROM dbo.workflows w INNER JOIN dbo.handler_workflows hw ON hw.workflow_id=w.id WHERE hw.handler_id=h.id AND w.code=t.workflow_type)');
    if (!empty($denied[0])) security_test('unscoped handler ticket access denied', !attachment_security_handler_can_access_ticket(['id' => $denied[0]['handler_id']], $denied[0]['ticket_id']));

    $createdTicketId = trim((string)(getenv('SECURITY_TEST_TICKET_ID') ?: ''));
    if (attachment_security_uuid($createdTicketId)) {
        $ticketRows = sqlserver_query('SELECT TOP 1 access_code, access_code_hash FROM dbo.tickets WHERE id = @id', ['id' => $createdTicketId]);
        $replyRows = sqlserver_query('SELECT TOP 1 token, token_hash FROM dbo.ticket_reply_tokens WHERE ticket_id = @id ORDER BY created_at ASC', ['id' => $createdTicketId]);
        security_test('new access code stored only as hash', !empty($ticketRows[0]['access_code_hash']) && trim((string)($ticketRows[0]['access_code'] ?? '')) === '');
        security_test('new reply token stored only as hash', !empty($replyRows[0]['token_hash']) && trim((string)($replyRows[0]['token'] ?? '')) === '');
    }
}

$failed = array_values(array_filter($results, static fn(array $item): bool => !$item['ok']));
echo json_encode(['success' => !$failed, 'results' => $results], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL;
exit($failed ? 1 : 0);
