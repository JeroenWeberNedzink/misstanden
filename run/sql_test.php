<?php
require 'c:/Projects/nz-misstanden/public/api/_crypto.php';
require 'c:/Projects/nz-misstanden/public/api/_sqlserver.php';
load_runtime_env('\\\\nz-web02\\Websites\\misstanden.nedzink.nl\\api');
try {
  $rows = sqlserver_query('SELECT TOP 1 1 AS ok');
  echo json_encode(['success' => true, 'rows' => $rows], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
} catch (Throwable $e) {
  echo json_encode(['success' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
}
