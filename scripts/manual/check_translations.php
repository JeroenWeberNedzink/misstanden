<?php
$dir = __DIR__ . '/../src/i18n/locales';
if (!is_dir($dir)) {
    echo "Locales directory not found: $dir\n";
    exit(1);
}
$items = scandir($dir);
foreach ($items as $item) {
    if ($item === '.' || $item === '..') continue;
    $path = $dir . '/' . $item . '/translation.json';
    if (!file_exists($path)) {
        echo "$item: MISSING translation.json\n";
        continue;
    }

    $contents = file_get_contents($path);
    json_decode($contents, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        echo "$item: INVALID JSON - " . json_last_error_msg() . "\n";
    } else {
        echo "$item: OK\n";
    }
}
