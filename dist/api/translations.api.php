<?php
declare(strict_types=1);
/**
 * translations.api.php
 * Translation Management API
 * Handles CRUD operations on i18n translation JSON files
 *
 * Endpoints:
 * - GET ?action=list&lang=en - List all translations (flattened)
 * - GET ?action=export&lang=en - Export JSON file
 * - GET ?action=detect-missing - Detect missing translations across languages
 * - POST (create) - Create new translation key
 * - PUT (update) - Update translation value
 * - DELETE - Delete translation key
 * - POST ?action=import - Import JSON file
 */

require_once __DIR__ . '/_crypto.php';
require_once __DIR__ . '/_admin_auth.php';
require_once __DIR__ . '/_scopes.php';
require_once __DIR__ . '/_errors.php';
require_once __DIR__ . '/_security_headers.php';
require_once __DIR__ . '/_rate_limit.php';

api_apply_security_headers([
    'allow_methods' => 'GET, POST, PUT, DELETE, OPTIONS',
    'allow_headers' => 'Content-Type, Authorization',
]);

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Error handling
ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/../../php-errors.log');
ini_set('display_errors', '0');
error_reporting(E_ALL);

const TRANSLATIONS_SCOPES_READ = [
    'admin:translations:read',
    'admin:translations:write',
    'read:translations',
    'write:translations',
    'manage:translations',
    'admin:all',
    'admin',
];
const TRANSLATIONS_SCOPES_WRITE = [
    'admin:translations:write',
    'write:translations',
    'manage:translations',
    'admin:all',
    'admin',
];

// Constants
define('BACKUP_DIR', __DIR__ . '/../../backups/translations');

$translationActorId = null;

function setTranslationActorId(?string $actorId): void {
    global $translationActorId;
    $translationActorId = is_string($actorId) && trim($actorId) !== '' ? trim($actorId) : null;
}

function getTranslationActorId(): ?string {
    global $translationActorId;
    return $translationActorId;
}

function validateLanguageCode(string $lang): string {
    $clean = trim($lang);
    if (!preg_match('/^[a-z]{2,5}(-[a-zA-Z]{2,5})?$/', $clean)) {
        throw new Exception("Invalid language code format: $lang");
    }
    return $clean;
}

function translations_has_locale_files(string $dir): bool {
    return is_dir($dir) && count(glob($dir . '/*/translation.json') ?: []) > 0;
}

function translations_runtime_dir(): string {
    static $resolved = null;
    if (is_string($resolved) && $resolved !== '') {
        return $resolved;
    }

    $candidates = [
        __DIR__ . '/locales',
        __DIR__ . '/../../src/i18n/locales',
    ];

    foreach ($candidates as $candidate) {
        if (translations_has_locale_files($candidate)) {
            $resolved = $candidate;
            return $resolved;
        }
    }

    $resolved = $candidates[0];
    return $resolved;
}

/**
 * Get list of supported languages (dynamically from filesystem)
 */
function getSupportedLanguages(): array {
    $dir = translations_runtime_dir();
    if (!is_dir($dir)) {
        return ['en', 'nl', 'fr', 'de', 'pt']; // fallback
    }

    $languages = [];
    $items = scandir($dir);

    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        $path = $dir . '/' . $item;
        if (is_dir($path) && file_exists($path . '/translation.json')) {
            $languages[] = $item;
        }
    }

    // Always ensure we have at least English
    if (empty($languages)) {
        $languages = ['en', 'nl', 'fr', 'de', 'pt'];
    }

    return $languages;
}

// Ensure backup directory exists
if (!is_dir(BACKUP_DIR)) {
    mkdir(BACKUP_DIR, 0755, true);
}

/**
 * Flatten nested array to dot notation
 * ['common' => ['save' => 'Save']] => ['common.save' => 'Save']
 */
function flattenArray(array $array, string $prefix = ''): array {
    $result = [];

    foreach ($array as $key => $value) {
        $newKey = $prefix ? "$prefix.$key" : $key;

        if (is_array($value)) {
            $result = array_merge($result, flattenArray($value, $newKey));
        } else {
            $result[$newKey] = $value;
        }
    }

    return $result;
}

/**
 * Unflatten dot notation to nested array
 * ['common.save' => 'Save'] => ['common' => ['save' => 'Save']]
 */
function unflattenArray(array $array): array {
    $result = [];

    foreach ($array as $key => $value) {
        $keys = explode('.', $key);
        $temp = &$result;

        foreach ($keys as $k) {
            if (!isset($temp[$k])) {
                $temp[$k] = [];
            }
            $temp = &$temp[$k];
        }

        $temp = $value;
    }

    return $result;
}

/**
 * Read translation JSON file
 */
function readTranslationFile(string $lang): array {
    $lang = validateLanguageCode($lang);
    $filePath = translations_runtime_dir() . "/$lang/translation.json";

    if (!file_exists($filePath)) {
        throw new Exception("Translation file not found: $filePath");
    }

    $contents = file_get_contents($filePath);
    if ($contents === false) {
        throw new Exception("Failed to read translation file: $filePath");
    }

    $data = json_decode($contents, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception("Invalid JSON in file: $filePath - " . json_last_error_msg());
    }

    return $data;
}

/**
 * Write translation JSON file with backup
 */
function writeTranslationFile(string $lang, array $data): void {
    $lang = validateLanguageCode($lang);

    $langDir = translations_runtime_dir() . "/$lang";
    $filePath = "$langDir/translation.json";

    // Create language directory if it doesn't exist
    if (!is_dir($langDir)) {
        if (!mkdir($langDir, 0755, true)) {
            throw new Exception("Failed to create language directory: $langDir");
        }
    }

    // Create backup before writing (if file exists)
    if (file_exists($filePath)) {
        $backupPath = BACKUP_DIR . "/$lang-" . date('Y-m-d-His') . '.json';
        copy($filePath, $backupPath);

        // Keep only last 10 backups per language
        cleanupBackups($lang);
    }

    // Unflatten if data is flat
    $isFlat = false;
    foreach (array_keys($data) as $key) {
        if (strpos($key, '.') !== false) {
            $isFlat = true;
            break;
        }
    }

    $dataToWrite = $isFlat ? unflattenArray($data) : $data;

    // Write with pretty formatting
    $json = json_encode($dataToWrite, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    if ($json === false) {
        throw new Exception("Failed to encode JSON for $lang");
    }

    $written = file_put_contents($filePath, $json);

    if ($written === false) {
        throw new Exception("Failed to write translation file: $filePath");
    }
}

/**
 * Clean up old backups, keep only last 10
 */
function cleanupBackups(string $lang): void {
    $files = glob(BACKUP_DIR . "/$lang-*.json");
    if (count($files) > 10) {
        usort($files, function($a, $b) {
            return filemtime($b) - filemtime($a);
        });

        $filesToDelete = array_slice($files, 10);
        foreach ($filesToDelete as $file) {
            @unlink($file);
        }
    }
}

/**
 * Log change to the translation audit trail.
 */
function logAuditChange(string $keyPath, string $lang, string $action, ?string $oldValue, ?string $newValue, ?string $userId = null): void {
    // TODO: Persist this in a database-backed audit store.
    // For now, log to file.
    $rawIp = trim((string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    $ipHash = api_rate_limit_hash('translation_audit_ip:' . $rawIp);

    $logEntry = [
        'timestamp' => date('c'),
        'key_path' => $keyPath,
        'language_code' => $lang,
        'action' => $action,
        'old_value' => $oldValue,
        'new_value' => $newValue,
        'user_id' => $userId ?? getTranslationActorId() ?? 'unknown',
        'ip_hash' => $ipHash,
    ];

    $logFile = __DIR__ . '/../../logs/translation-audit.log';
    $logDir = dirname($logFile);
    if (!is_dir($logDir)) {
        mkdir($logDir, 0755, true);
    }

    file_put_contents($logFile, json_encode($logEntry) . "\n", FILE_APPEND);
}

/**
 * API Response helper
 */
function apiResponse(int $code, bool $success, string $message, $data = null): void {
    http_response_code($code);
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// Main request handling
try {
    load_runtime_env(__DIR__);

    $method = $_SERVER['REQUEST_METHOD'];
    $requiredScopes = $method === 'GET' ? TRANSLATIONS_SCOPES_READ : TRANSLATIONS_SCOPES_WRITE;
    $adminCtx = api_authz_require_admin(static function (int $status, string $message): void {
        apiResponse($status, false, $message);
    }, $requiredScopes);
    setTranslationActorId((string)($adminCtx['handler']['id'] ?? ''));
    if ($method !== 'GET') {
        $handlerId = trim((string)($adminCtx['handler']['id'] ?? ''));
        $claimSub = trim((string)($adminCtx['claims']['sub'] ?? ''));
        $actorRaw = $handlerId !== '' ? $handlerId : ($claimSub !== '' ? $claimSub : 'unknown');
        $actorKey = api_rate_limit_hash('translations_actor:' . $actorRaw);
        $clientKey = api_rate_limit_client_fingerprint();
        api_rate_limit_enforce(
            'translations:write:actor:' . $actorKey,
            120,
            300,
            static function (int $retryAfter): void {
                apiResponse(429, false, 'Too many requests. Try again later.', ['retry_after' => $retryAfter]);
            }
        );
        api_rate_limit_enforce(
            'translations:write:client:' . $clientKey,
            300,
            300,
            static function (int $retryAfter): void {
                apiResponse(429, false, 'Too many requests. Try again later.', ['retry_after' => $retryAfter]);
            }
        );
    }
    $action = $_GET['action'] ?? null;

    // GET requests
    if ($method === 'GET') {
        if ($action === 'list') {
            // List translations for a language
            $lang = $_GET['lang'] ?? 'en';

            $data = readTranslationFile($lang);
            $flattened = flattenArray($data);
            $supportedLanguages = getSupportedLanguages();

            apiResponse(200, true, 'Translations loaded', [
                'language' => $lang,
                'languages' => $supportedLanguages,
                'count' => count($flattened),
                'translations' => $flattened
            ]);

        } elseif ($action === 'languages') {
            apiResponse(200, true, 'Supported languages loaded', [
                'languages' => getSupportedLanguages(),
            ]);

        } elseif ($action === 'export') {
            // Export JSON file for download
            $lang = $_GET['lang'] ?? 'en';

            $data = readTranslationFile($lang);

            api_apply_no_store_headers();
            header('Content-Type: application/json');
            header('Content-Disposition: attachment; filename="translation-' . $lang . '-' . date('Y-m-d') . '.json"');
            echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
            exit;

        } elseif ($action === 'detect-missing') {
            // Detect missing translations across all languages
            $supportedLanguages = getSupportedLanguages();
            $allData = [];

            foreach ($supportedLanguages as $lang) {
                try {
                    $data = readTranslationFile($lang);
                    $allData[$lang] = flattenArray($data);
                } catch (Exception $e) {
                    // Skip languages that can't be read
                    continue;
                }
            }

            // Find all unique keys
            $allKeys = [];
            foreach ($allData as $langData) {
                $allKeys = array_merge($allKeys, array_keys($langData));
            }
            $allKeys = array_unique($allKeys);

            // Check which keys are missing in which languages
            $missing = [];
            foreach ($allKeys as $key) {
                $presentIn = [];
                $missingIn = [];

                foreach ($supportedLanguages as $lang) {
                    if (isset($allData[$lang][$key]) && trim($allData[$lang][$key]) !== '') {
                        $presentIn[] = $lang;
                    } else {
                        $missingIn[] = $lang;
                    }
                }

                if (!empty($missingIn)) {
                    $missing[] = [
                        'key' => $key,
                        'category' => explode('.', $key)[0],
                        'presentIn' => $presentIn,
                        'missingIn' => $missingIn
                    ];
                }
            }

            apiResponse(200, true, 'Missing translations detected', [
                'totalKeys' => count($allKeys),
                'missingCount' => count($missing),
                'missing' => $missing,
                'languages' => $supportedLanguages
            ]);

        } else {
            apiResponse(400, false, 'Invalid action for GET request');
        }
    }

    // POST, PUT, DELETE requests
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    if (json_last_error() !== JSON_ERROR_NONE && $input !== '') {
        apiResponse(400, false, 'Invalid JSON input');
    }

    if ($method === 'POST') {
        $postAction = $data['action'] ?? null;

        if ($postAction === 'create') {
            // Create new translation key in all languages
            $keyPath = $data['keyPath'] ?? null;
            $translations = $data['translations'] ?? [];

            if (!$keyPath || empty($translations)) {
                apiResponse(400, false, 'keyPath and translations are required');
            }

            // Validate key path format
            if (!preg_match('/^[a-zA-Z0-9_.]+$/', $keyPath)) {
                apiResponse(400, false, 'Invalid key path format. Use alphanumeric characters, dots, and underscores only.');
            }

            // Check if key already exists
            $enData = readTranslationFile('en');
            $enFlat = flattenArray($enData);

            if (isset($enFlat[$keyPath])) {
                apiResponse(409, false, 'Translation key already exists');
            }

            // Add to all supported languages
            $supportedLanguages = getSupportedLanguages();
            foreach ($supportedLanguages as $lang) {
                try {
                    $langData = readTranslationFile($lang);
                    $flatData = flattenArray($langData);

                    $value = $translations[$lang] ?? '';
                    $flatData[$keyPath] = $value;

                    writeTranslationFile($lang, $flatData);
                    logAuditChange($keyPath, $lang, 'CREATE', null, $value);
                } catch (Exception $e) {
                    // Skip languages that can't be read/written
                    error_log("Failed to create translation for $lang: " . api_redact_sensitive($e->getMessage()));
                }
            }

            apiResponse(201, true, 'Translation key created successfully', ['keyPath' => $keyPath]);

        } elseif ($postAction === 'import') {
            // Import JSON file
            $lang = $data['lang'] ?? null;
            $importData = $data['data'] ?? null;

            if (!$lang || !$importData) {
                apiResponse(400, false, 'lang and data are required');
            }

            // Validate language code format
            if (!preg_match('/^[a-z]{2,5}(-[a-zA-Z]{2,5})?$/', $lang)) {
                apiResponse(400, false, 'Invalid language code format');
            }

            // Flatten imported data
            $flatImport = flattenArray($importData);

            // Load current data
            $currentData = readTranslationFile($lang);
            $flatCurrent = flattenArray($currentData);

            $imported = 0;
            $updated = 0;
            $failed = 0;

            foreach ($flatImport as $key => $value) {
                try {
                    $oldValue = $flatCurrent[$key] ?? null;
                    $flatCurrent[$key] = $value;

                    if ($oldValue === null) {
                        $imported++;
                        logAuditChange($key, $lang, 'IMPORT_CREATE', null, $value);
                    } else {
                        $updated++;
                        logAuditChange($key, $lang, 'IMPORT_UPDATE', $oldValue, $value);
                    }
                } catch (Exception $e) {
                    $failed++;
                }
            }

            // Write back
            writeTranslationFile($lang, $flatCurrent);

            api_apply_no_store_headers();
            apiResponse(200, true, 'Import completed', [
                'language' => $lang,
                'imported' => $imported,
                'updated' => $updated,
                'failed' => $failed,
                'total' => count($flatImport)
            ]);

        } else {
            apiResponse(400, false, 'Invalid action for POST request');
        }

    } elseif ($method === 'PUT') {
        // Update existing translation value (or create if missing - upsert)
        $keyPath = $data['keyPath'] ?? null;
        $lang = $data['lang'] ?? null;
        $value = $data['value'] ?? null;

        if (!$keyPath || !$lang) {
            apiResponse(400, false, 'keyPath and lang are required');
        }

        // Validate language code format
        if (!preg_match('/^[a-z]{2,5}(-[a-zA-Z]{2,5})?$/', $lang)) {
            apiResponse(400, false, 'Invalid language code format');
        }

        $langData = readTranslationFile($lang);
        $flatData = flattenArray($langData);

        $oldValue = $flatData[$keyPath] ?? null;
        $isNew = !isset($flatData[$keyPath]);

        $flatData[$keyPath] = $value;

        writeTranslationFile($lang, $flatData);

        if ($isNew) {
            logAuditChange($keyPath, $lang, 'CREATE', null, $value);
        } else {
            logAuditChange($keyPath, $lang, 'UPDATE', $oldValue, $value);
        }

        apiResponse(200, true, $isNew ? 'Translation created successfully' : 'Translation updated successfully', [
            'keyPath' => $keyPath,
            'language' => $lang,
            'oldValue' => $oldValue,
            'newValue' => $value,
            'wasCreated' => $isNew
        ]);

    } elseif ($method === 'DELETE') {
        // Delete translation key from all languages
        $keyPath = $data['keyPath'] ?? null;

        if (!$keyPath) {
            apiResponse(400, false, 'keyPath is required');
        }

        // Remove from all languages
        $supportedLanguages = getSupportedLanguages();
        foreach ($supportedLanguages as $lang) {
            try {
                $langData = readTranslationFile($lang);
                $flatData = flattenArray($langData);

                if (isset($flatData[$keyPath])) {
                    $oldValue = $flatData[$keyPath];
                    unset($flatData[$keyPath]);

                    writeTranslationFile($lang, $flatData);
                    logAuditChange($keyPath, $lang, 'DELETE', $oldValue, null);
                }
            } catch (Exception $e) {
                // Skip languages that can't be read/written
                error_log("Failed to delete translation for $lang: " . api_redact_sensitive($e->getMessage()));
            }
        }

        apiResponse(200, true, 'Translation key deleted successfully', ['keyPath' => $keyPath]);

    } else {
        apiResponse(405, false, 'Method not allowed');
    }

} catch (Exception $e) {
    $errorId = api_log_exception('translations.api', $e);
    apiResponse(500, false, 'Internal server error', ['error_id' => $errorId]);
}
