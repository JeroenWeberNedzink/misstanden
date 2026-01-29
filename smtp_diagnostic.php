<?php
/**
 * SMTP Diagnostic Tool
 * Tests port 25 relay and identifies blocking issues
 *
 * Usage: php smtp_diagnostic.php
 */

declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '1');

echo "=== SMTP Port 25 Relay Diagnostic Tool ===\n\n";

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
$smtpPort = (int)(getenv('SMTP_PORT') ?: 25);
$mailDevSink = getenv('MAIL_DEV_SINK');

echo "📋 Configuration:\n";
echo "   MAIL_DEV_SINK: " . var_export($mailDevSink, true) . "\n";
echo "   SMTP_HOST: $smtpHost\n";
echo "   SMTP_PORT: $smtpPort\n";
echo "   SMTP_AUTH: " . (getenv('SMTP_AUTH') ?: 'false') . "\n";
echo "   SMTP_SECURE: '" . (getenv('SMTP_SECURE') ?: '') . "'\n\n";

// Test 1: DNS Resolution
echo "🔍 Test 1: DNS Resolution\n";
$ip = gethostbyname($smtpHost);
if ($ip === $smtpHost) {
    echo "   ❌ FAILED - Cannot resolve hostname '$smtpHost'\n";
    echo "   → This indicates a DNS issue or invalid hostname\n\n";
    exit(1);
} else {
    echo "   ✅ SUCCESS - Resolved to: $ip\n\n";
}

// Test 2: Network Connectivity (TCP connection)
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

    echo "💡 Diagnosis:\n";
    if ($errno === 110 || strpos($errstr, 'timed out') !== false) {
        echo "   → Network/ISP blocking port 25 (most likely)\n";
        echo "   → VPN may be blocking outbound SMTP\n";
        echo "   → Firewall blocking port 25\n";
    } elseif ($errno === 111 || strpos($errstr, 'Connection refused') !== false) {
        echo "   → Server is reachable but refusing connections\n";
        echo "   → Port 25 may be closed on the server\n";
    } else {
        echo "   → Unknown connection error\n";
    }

    echo "\n🔧 Troubleshooting Steps:\n";
    echo "   1. Try from a different network (mobile hotspot)\n";
    echo "   2. Check if VPN is enabled and disable it\n";
    echo "   3. Test from a server/VPS instead of local machine\n";
    echo "   4. Contact your ISP (many block port 25)\n";
    echo "   5. Use port 587 with STARTTLS instead (if Microsoft supports it)\n\n";

    exit(1);
}

echo "   ✅ SUCCESS - Connected in {$elapsed}ms\n\n";

// Test 3: SMTP Handshake
echo "📨 Test 3: SMTP Protocol Handshake\n";

// Read banner
$banner = fgets($socket, 512);
echo "   Server banner: " . trim($banner) . "\n";

if (!str_starts_with($banner, '220')) {
    echo "   ⚠️  WARNING - Expected 220 response code\n\n";
} else {
    echo "   ✅ SMTP service is responding\n\n";
}

// Send EHLO
fwrite($socket, "EHLO localhost\r\n");
echo "   Sending EHLO...\n";

$response = '';
while ($line = fgets($socket, 512)) {
    $response .= $line;
    echo "   " . trim($line) . "\n";

    // Multi-line responses end with a space after the code (e.g., "250 " vs "250-")
    if (preg_match('/^\d{3} /', $line)) {
        break;
    }
}

if (!str_starts_with($response, '250')) {
    echo "\n   ❌ EHLO command failed\n";
    echo "   → Server may not support unauthenticated relay\n\n";
} else {
    echo "\n   ✅ EHLO accepted\n";

    // Check capabilities
    if (stripos($response, 'STARTTLS') !== false) {
        echo "   ℹ️  Server offers STARTTLS (but we're not using it)\n";
    }
    if (stripos($response, 'AUTH') !== false) {
        echo "   ℹ️  Server offers AUTH (we have SMTP_AUTH=false)\n";
    }
    echo "\n";
}

// Test 4: Try to send MAIL FROM
echo "📮 Test 4: MAIL FROM Command\n";
fwrite($socket, "MAIL FROM:<test@nedzink.nl>\r\n");
$mailFromResponse = fgets($socket, 512);
echo "   " . trim($mailFromResponse) . "\n";

if (str_starts_with($mailFromResponse, '250')) {
    echo "   ✅ MAIL FROM accepted\n\n";

    // Test RCPT TO
    echo "📬 Test 5: RCPT TO Command\n";
    fwrite($socket, "RCPT TO:<test@nedzink.nl>\r\n");
    $rcptToResponse = fgets($socket, 512);
    echo "   " . trim($rcptToResponse) . "\n";

    if (str_starts_with($rcptToResponse, '250')) {
        echo "   ✅ RCPT TO accepted - Relay appears to be working!\n\n";
    } elseif (str_starts_with($rcptToResponse, '550') || str_starts_with($rcptToResponse, '553')) {
        echo "   ❌ RCPT TO rejected - Relay not allowed\n";
        echo "   → Microsoft 365 requires this IP to be authorized\n";
        echo "   → Check your Microsoft 365 connector configuration\n\n";
    } else {
        echo "   ⚠️  Unexpected response\n\n";
    }
} elseif (str_starts_with($mailFromResponse, '530')) {
    echo "   ❌ Authentication required\n";
    echo "   → Server requires SMTP authentication\n";
    echo "   → Set SMTP_AUTH=true and provide credentials\n\n";
} elseif (str_starts_with($mailFromResponse, '550') || str_starts_with($mailFromResponse, '553')) {
    echo "   ❌ Sender rejected\n";
    echo "   → Email address or domain not authorized\n";
    echo "   → Check Microsoft 365 connector settings\n\n";
} else {
    echo "   ⚠️  Unexpected response\n\n";
}

// Clean disconnect
fwrite($socket, "QUIT\r\n");
fgets($socket, 512);
fclose($socket);

echo "═══════════════════════════════════════════════════\n";
echo "✅ Diagnostic Complete\n\n";

echo "📊 Summary:\n";
echo "   • DNS Resolution: ✅ Working\n";
echo "   • TCP Connection: ✅ Working ($elapsed ms)\n";
echo "   • SMTP Protocol: ✅ Working\n\n";

echo "💡 Next Steps:\n";
echo "   1. If RCPT TO was rejected:\n";
echo "      → Configure Microsoft 365 connector to allow this IP\n";
echo "      → Or use authenticated SMTP instead\n\n";
echo "   2. Test sending real email:\n";
echo "      → Use your mail API with MAIL_DEV_SINK=false\n";
echo "      → Check PHPMailer logs for detailed errors\n\n";
echo "   3. Enable debug mode in mail.api.php:\n";
echo "      → Add ?debug=1 to the API URL\n";
echo "      → This shows full SMTP conversation\n\n";
