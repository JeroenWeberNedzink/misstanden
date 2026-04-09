<?php
require __DIR__ . '/../public/api/_crypto.php';
require __DIR__ . '/../public/api/_sqlserver.php';
load_runtime_env(__DIR__ . '/../public/api');
$rows = [
 'tickets' => sqlserver_query("SELECT TOP 1 * FROM dbo.tickets ORDER BY submitted_at DESC"),
 'access_requests' => sqlserver_query("SELECT TOP 1 * FROM dbo.access_requests ORDER BY created_at DESC"),
 'sla_escalations' => sqlserver_query("SELECT TOP 1 * FROM dbo.sla_escalations ORDER BY escalated_at DESC"),
 'workflow_statuses' => sqlserver_query("SELECT TOP 3 * FROM dbo.workflow_statuses ORDER BY sort_order ASC"),
];
echo json_encode($rows, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
