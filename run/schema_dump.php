<?php
require __DIR__ . '/../public/api/_crypto.php';
require __DIR__ . '/../public/api/_sqlserver.php';
load_runtime_env(__DIR__ . '/../public/api');
$tables = ['tickets','messages','attachments','ticket_comments','ticket_actions','ticket_reply_tokens','access_requests','sla_escalations','workflow_statuses','workflows','handlers','handler_workflows','ticket_handlers','locations','incident_severities'];
$out = [];
foreach ($tables as $table) {
  $rows = sqlserver_query("SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME=@table ORDER BY ORDINAL_POSITION", ['table' => $table]);
  $out[$table] = $rows;
}
echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
