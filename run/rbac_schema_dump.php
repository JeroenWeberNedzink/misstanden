<?php
require __DIR__ . '/../public/api/_crypto.php';
require __DIR__ . '/../public/api/_sqlserver.php';
load_runtime_env(__DIR__ . '/../public/api');
$tables = ['roles','permissions','role_permissions','handler_roles'];
$out = [];
foreach ($tables as $table) {
  $out[$table] = sqlserver_query("SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME=@table ORDER BY ORDINAL_POSITION", ['table' => $table]);
}
echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
