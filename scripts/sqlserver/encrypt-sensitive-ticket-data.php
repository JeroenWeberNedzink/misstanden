<?php
declare(strict_types=1);

require_once __DIR__ . '/../../public/api/_ticket_crypto.php';
require_once __DIR__ . '/../../public/api/_sqlserver.php';

load_runtime_env(__DIR__ . '/../../public/api');

if (!sqlserver_is_configured()) {
    fwrite(STDERR, "SQL Server is not configured.\n");
    exit(1);
}

$key = get_email_crypto_key();
$batchSize = 40;

function migrate_run_batches(array $commands, int $batchSize): int {
    $count = 0;
    foreach (array_chunk($commands, $batchSize) as $batch) {
        sqlserver_run_commands($batch, true);
        $count += count($batch);
    }
    return $count;
}

function migrate_blank($value): bool {
    return trim((string)($value ?? '')) === '';
}

$ticketCommands = [];
$ticketRows = sqlserver_query(
    'SELECT id,
            description, description_encrypted,
            location, location_encrypted,
            reporter_name, reporter_name_encrypted,
            reporter_phone, reporter_phone_encrypted,
            reporter_email, reporter_email_encrypted,
            reporter_email_hash
     FROM dbo.tickets
     WHERE description IS NOT NULL
        OR location IS NOT NULL
        OR reporter_name IS NOT NULL
        OR reporter_phone IS NOT NULL
        OR reporter_email IS NOT NULL'
);

foreach ($ticketRows as $row) {
    $params = ['id' => $row['id']];
    $sets = [];
    foreach ([
        'description' => 'description_encrypted',
        'location' => 'location_encrypted',
        'reporter_name' => 'reporter_name_encrypted',
        'reporter_phone' => 'reporter_phone_encrypted',
    ] as $plainField => $encryptedField) {
        if (migrate_blank($row[$encryptedField] ?? null) && !migrate_blank($row[$plainField] ?? null)) {
            $params[$encryptedField] = ticket_crypto_encrypt_nullable($row[$plainField], $GLOBALS['key'], $plainField === 'description' ? false : true);
            $sets[] = $encryptedField . ' = @' . $encryptedField;
        }
        if (!migrate_blank($row[$plainField] ?? null)) {
            $sets[] = $plainField . ' = NULL';
        }
    }

    $email = strtolower(trim((string)($row['reporter_email'] ?? '')));
    if ($email !== '') {
        if (migrate_blank($row['reporter_email_encrypted'] ?? null)) {
            $params['reporter_email_encrypted'] = encrypt_email($email, $GLOBALS['key']);
            $sets[] = 'reporter_email_encrypted = @reporter_email_encrypted';
        }
        if (migrate_blank($row['reporter_email_hash'] ?? null)) {
            $params['reporter_email_hash'] = hash_email($email);
            $sets[] = 'reporter_email_hash = @reporter_email_hash';
        }
        $sets[] = 'reporter_email = NULL';
    }

    if ($sets) {
        $sets[] = 'updated_at = SYSUTCDATETIME()';
        $ticketCommands[] = sqlserver_command(
            'nonquery',
            'UPDATE dbo.tickets SET ' . implode(', ', array_values(array_unique($sets))) . ' WHERE id = @id',
            $params
        );
    }
}

$messageCommands = [];
$messageRows = sqlserver_query(
    'SELECT id, body, body_encrypted
     FROM dbo.messages
     WHERE body IS NOT NULL AND body <> @placeholder',
    ['placeholder' => TICKET_ENCRYPTED_PLACEHOLDER]
);
foreach ($messageRows as $row) {
    $params = [
        'id' => $row['id'],
        'body' => TICKET_ENCRYPTED_PLACEHOLDER,
    ];
    $sets = ['body = @body'];
    if (migrate_blank($row['body_encrypted'] ?? null) && !migrate_blank($row['body'] ?? null)) {
        $params['body_encrypted'] = ticket_crypto_encrypt_nullable($row['body'], $key, false);
        $sets[] = 'body_encrypted = @body_encrypted';
    }
    $messageCommands[] = sqlserver_command(
        'nonquery',
        'UPDATE dbo.messages SET ' . implode(', ', $sets) . ' WHERE id = @id',
        $params
    );
}

$commentCommands = [];
$commentRows = sqlserver_query(
    'SELECT id, comment, comment_encrypted
     FROM dbo.ticket_comments
     WHERE comment IS NOT NULL AND comment <> @placeholder',
    ['placeholder' => TICKET_ENCRYPTED_PLACEHOLDER]
);
foreach ($commentRows as $row) {
    $params = [
        'id' => $row['id'],
        'comment' => TICKET_ENCRYPTED_PLACEHOLDER,
    ];
    $sets = ['comment = @comment'];
    if (migrate_blank($row['comment_encrypted'] ?? null) && !migrate_blank($row['comment'] ?? null)) {
        $params['comment_encrypted'] = ticket_crypto_encrypt_nullable($row['comment'], $key, false);
        $sets[] = 'comment_encrypted = @comment_encrypted';
    }
    $commentCommands[] = sqlserver_command(
        'nonquery',
        'UPDATE dbo.ticket_comments SET ' . implode(', ', $sets) . ' WHERE id = @id',
        $params
    );
}

$actionCommands = [];
$actionRows = sqlserver_query(
    'SELECT id, description, description_encrypted
     FROM dbo.ticket_actions
     WHERE description IS NOT NULL'
);
foreach ($actionRows as $row) {
    $params = ['id' => $row['id']];
    $sets = ['description = NULL'];
    if (migrate_blank($row['description_encrypted'] ?? null) && !migrate_blank($row['description'] ?? null)) {
        $params['description_encrypted'] = ticket_crypto_encrypt_nullable($row['description'], $key, false);
        $sets[] = 'description_encrypted = @description_encrypted';
    }
    $actionCommands[] = sqlserver_command(
        'nonquery',
        'UPDATE dbo.ticket_actions SET ' . implode(', ', $sets) . ' WHERE id = @id',
        $params
    );
}

$counts = [
    'tickets' => migrate_run_batches($ticketCommands, $batchSize),
    'messages' => migrate_run_batches($messageCommands, $batchSize),
    'ticket_comments' => migrate_run_batches($commentCommands, $batchSize),
    'ticket_actions' => migrate_run_batches($actionCommands, $batchSize),
];

echo json_encode(['success' => true, 'updated' => $counts], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
