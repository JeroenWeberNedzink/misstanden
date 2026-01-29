<?php
/**
 * SMTP Port 587 (STARTTLS) Diagnostic Tool
 * Tests port 587 with STARTTLS and optional authentication
 *
 * Usage: php smtp_diagnostic_587.php
 */

declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '1');

echo "=== SMTP Port 587 (STARTTLS) Diagnostic Tool ===\n\n";

// Load environment variables
function loadEnvFile(string $file): void {
    if (!is_file($file)) return;

    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) continue;
        if (!str_contains($line, '=')) continue;

        [$key, $val] = explode('=', $line, 2);
        $key = trim($key);
        $val = trim($val);

        if ((str_starts_with($val, '"') && str_ends_with($val, '"')) ||
            (str_starts_with($val, "'") && str_ends_with($val, "'"))) {
            $val = substr($val, 1, -1);
        }

        putenv("$key=$val");
        $_ENV[$key] = $val;
    }
}

loadEnvFile(__DIR__ . '/.env.local');
loadEnvFile(__DIR__ . '/.env');

$smtpHost = getenv('SMTP_HOST') ?: 'nedzink-nl.mail.protection.outlook.com';
$smtpPort = (int)(getenv('SMTP_PORT') ?: 587);
$smtpAuth = (getenv('SMTP_AUTH') === 'true');
$smtpUser = getenv('SMTP_USER') ?: '';
$smtpPass = getenv('SMTP_PASS') ?: '';

echo "📋 Configuration:\n";
echo "   SMTP_HOST: $smtpHost\n";
echo "   SMTP_PORT: $smtpPort\n";
echo "   SMTP_AUTH: " . ($smtpAuth ? 'true' : 'false') . "\n";
echo "   SMTP_SECURE: " . (getenv('SMTP_SECURE') ?: 'tls') . "\n";
echo "   SMTP_USER: " . ($smtpUser ? '***' . substr($smtpUser, -10) : '(not set)') . "\n";
echo "   SMTP_PASS: " . ($smtpPass ? '***' : '(not set)') . "\n\n";

// Test 1: DNS Resolution
echo "🔍 Test 1: DNS Resolution\n";
$ip = gethostbyname($smtpHost);
if ($ip === $smtpHost) {
    echo "   ❌ FAILED - Cannot resolve hostname '$smtpHost'\n\n";
    exit(1);
} else {
    echo "   ✅ SUCCESS - Resolved to: $ip\n\n";
}

// Test 2: TCP Connection
echo "🔌 Test 2: TCP Connection to $smtpHost:$smtpPort\n";
$errno = 0;
$errstr = '';
$timeout = 10;

$startTime = microtime(true);
$socket = @fsockopen($smtpHost, $smtpPort, $errno, $errstr, $timeout);
$elapsed = round((microtime(true) - $startTime) * 1000, 2);

if (!$socket) {
    echo "   ❌ FAILED - Cannot connect ($errno: $errstr)\n";
    echo "   ⏱️  Timeout after {$elapsed}ms\n\n";
    echo "💡 This port is also blocked by your ISP/network\n";
    echo "   Try testing from a server/VPS instead of local machine\n\n";
    exit(1);
}

echo "   ✅ SUCCESS - Connected in {$elapsed}ms\n\n";

// Test 3: SMTP Banner
echo "📨 Test 3: SMTP Protocol Handshake\n";
$banner = fgets($socket, 512);
echo "   Server banner: " . trim($banner) . "\n";

if (!str_starts_with($banner, '220')) {
    echo "   ⚠️  WARNING - Expected 220 response code\n\n";
    fclose($socket);
    exit(1);
} else {
    echo "   ✅ SMTP service is responding\n\n";
}

// Test 4: EHLO
echo "📬 Test 4: EHLO Command\n";
fwrite($socket, "EHLO localhost\r\n");

$response = '';
while ($line = fgets($socket, 512)) {
    $response .= $line;
    echo "   " . trim($line) . "\n";
    if (preg_match('/^\d{3} /', $line)) {
        break;
    }
}

if (!str_starts_with($response, '250')) {
    echo "\n   ❌ EHLO failed\n\n";
    fclose($socket);
    exit(1);
}

$hasStartTLS = stripos($response, 'STARTTLS') !== false;
$hasAuth = stripos($response, 'AUTH') !== false;

echo "\n   ✅ EHLO accepted\n";
echo "   STARTTLS available: " . ($hasStartTLS ? '✅ YES' : '❌ NO') . "\n";
echo "   AUTH available: " . ($hasAuth ? '✅ YES' : '❌ NO') . "\n\n";

if (!$hasStartTLS) {
    echo "   ⚠️  WARNING - Server doesn't offer STARTTLS on port 587\n";
    echo "   You may need to use port 25 (if unblocked) or port 465 (SSL)\n\n";
}

// Test 5: STARTTLS (if available)
if ($hasStartTLS) {
    echo "🔒 Test 5: STARTTLS Upgrade\n";
    fwrite($socket, "STARTTLS\r\n");
    $starttlsResponse = fgets($socket, 512);
    echo "   " . trim($starttlsResponse) . "\n";

    if (str_starts_with($starttlsResponse, '220')) {
        echo "   ✅ STARTTLS command accepted\n";
        echo "   ℹ️  TLS encryption would be enabled here\n";
        echo "   (PHPMailer handles this automatically)\n\n";
    } else {
        echo "   ❌ STARTTLS failed\n\n";
    }
}

// Test 6: AUTH (if configured)
if ($smtpAuth && $smtpUser && $smtpPass && $hasAuth) {
    echo "🔑 Test 6: Authentication Check\n";
    echo "   ℹ️  Full AUTH test requires TLS encryption\n";
    echo "   PHPMailer will handle this automatically\n";
    echo "   Your credentials are configured ✅\n\n";
} elseif ($smtpAuth && (!$smtpUser || !$smtpPass)) {
    echo "⚠️  Test 6: Authentication\n";
    echo "   SMTP_AUTH=true but credentials missing!\n";
    echo "   Please set SMTP_USER and SMTP_PASS in .env\n\n";
}

// Clean disconnect
fwrite($socket, "QUIT\r\n");
fgets($socket, 512);
fclose($socket);

echo "═══════════════════════════════════════════════════\n";
echo "✅ Port 587 Diagnostic Complete\n\n";

echo "📊 Summary:\n";
echo "   • DNS Resolution: ✅\n";
echo "   • TCP Connection to port 587: ✅ ($elapsed ms)\n";
echo "   • SMTP Protocol: ✅\n";
echo "   • STARTTLS Support: " . ($hasStartTLS ? '✅' : '❌') . "\n";
echo "   • AUTH Support: " . ($hasAuth ? '✅' : '❌') . "\n\n";

if ($hasStartTLS && $hasAuth) {
    echo "💡 Good news! Your configuration should work:\n";
    echo "   1. Make sure SMTP_USER and SMTP_PASS are set in .env\n";
    echo "   2. Use these settings:\n";
    echo "      SMTP_HOST=$smtpHost\n";
    echo "      SMTP_PORT=587\n";
    echo "      SMTP_AUTH=true\n";
    echo "      SMTP_SECURE=tls\n\n";
    echo "   3. Test with your mail API:\n";
    echo "      curl -X POST 'http://localhost:8081/api/mail.api.php?debug=1' \\\n";
    echo "        -H 'Content-Type: application/json' \\\n";
    echo "        -d '{\"to\":\"test@nedzink.nl\",\"subject\":\"Test\",\"text\":\"Hello\"}'\n\n";
} else {
    echo "⚠️  Port 587 may not be suitable. Consider:\n";
    echo "   • Port 465 (SMTPS - implicit SSL)\n";
    echo "   • Deploying to a server where port 25 isn't blocked\n";
    echo "   • Using a third-party SMTP relay (SendGrid, Mailgun, etc.)\n\n";
}
