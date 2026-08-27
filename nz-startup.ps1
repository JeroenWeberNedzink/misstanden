param(
    [ValidateSet('dev', 'local')]
    [string]$Mode = 'dev',
    [switch]$RequireAuth0Audience,
    [switch]$SkipTests,
    [switch]$SkipPerformance,
    [switch]$SkipMutatingTests,
    [switch]$SkipPostDeploySmoke
)

$ErrorActionPreference = "Stop"

# -----------------------------
# Helpers
# -----------------------------
function Info($m) { Write-Host "[INFO] $m" }
function Ok($m)   { Write-Host "[OK]   $m" }
function Warn($m) { Write-Host "[WARN] $m" }
function Die($m)  { Write-Host "[FAIL] $m"; exit 1 }

function Tail($path, $n = 80) {
    if (Test-Path $path) { Get-Content $path -Tail $n }
}

function Prepare-Log($path) {
    $dir = Split-Path -Parent $path
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }

    try {
        $fs = [System.IO.File]::Open($path, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        $fs.SetLength(0)
        $fs.Close()
        Info "Using log file: $path"
        return $path
    } catch {
        # If file is locked, fall back to a rotated filename
        $ts = Get-Date -Format "yyyyMMdd_HHmmss"
        $alt = "$path.$ts.locked"
        try {
            $fs2 = [System.IO.File]::Open($alt, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
            $fs2.Close()
            Warn "Log file was locked, using $alt"
            return $alt
        } catch {
            Warn "Could not prepare log file: $path (continuing)"
            return $path
        }
    }
}

function Is-Truthy($value) {
    $text = ([string]$value).Trim().ToLowerInvariant()
    return @('1', 'true', 'yes', 'on') -contains $text
}

function Read-DotEnvValue($filePath, $key) {
    if (-not (Test-Path $filePath)) { return '' }
    $pattern = '^\s*(?:export\s+)?' + [regex]::Escape($key) + '\s*=\s*(.*)$'
    foreach ($line in (Get-Content $filePath -Encoding utf8)) {
        $trimmed = $line.Trim()
        if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
        if ($trimmed -notmatch $pattern) { continue }

        $rawValue = ''
        if ($Matches.Count -gt 1) {
            $rawValue = [string]$Matches[1]
        }
        $rawValue = $rawValue.Trim()
        if ($rawValue -eq '') { return '' }

        if (($rawValue.StartsWith('"') -and $rawValue.EndsWith('"')) -or ($rawValue.StartsWith("'") -and $rawValue.EndsWith("'"))) {
            return $rawValue.Substring(1, $rawValue.Length - 2).Trim()
        }

        $inlineCommentAt = $rawValue.IndexOf(' #')
        if ($inlineCommentAt -ge 0) {
            $rawValue = $rawValue.Substring(0, $inlineCommentAt)
        }
        return $rawValue.Trim()
    }
    return ''
}

function Resolve-ConfigValue($key, $rootDir) {
    $fromProcess = ([string]([Environment]::GetEnvironmentVariable($key))).Trim()
    if ($fromProcess -ne '') {
        return [PSCustomObject]@{
            Value  = $fromProcess
            Source = 'process env'
            Path   = ''
        }
    }

    foreach ($relative in @('.env.local', '.env')) {
        $path = Join-Path $rootDir $relative
        $value = Read-DotEnvValue $path $key
        if ($value -ne '') {
            return [PSCustomObject]@{
                Value  = $value
                Source = $relative
                Path   = $path
            }
        }
    }

    return [PSCustomObject]@{
        Value  = ''
        Source = 'missing'
        Path   = ''
    }
}

function Invoke-RobocopyChecked($source, $destination, $files = @('*'), $extraArgs = @()) {
    if (-not (Test-Path $source)) {
        Die "Source path not found: $source"
    }

    if (-not (Test-Path $destination)) {
        Info "Creating destination: $destination"
        New-Item -ItemType Directory -Path $destination -Force | Out-Null
    }

    $fileArgs = @()
    foreach ($pattern in $files) {
        $fileArgs += [string]$pattern
    }

    $args = @(
        $source,
        $destination
    ) + $fileArgs + $extraArgs

    & robocopy @args | Out-Host
    $exitCode = $LASTEXITCODE
    if ($exitCode -gt 7) {
        Die "Robocopy failed ($exitCode) while copying '$source' to '$destination'"
    }
}

function Grant-IisModifyAccess($path, [bool]$isolateFromParent = $false) {
    if (-not (Test-Path -LiteralPath $path)) {
        Info "Creating IIS writable directory: $path"
        New-Item -ItemType Directory -Path $path -Force | Out-Null
    }

    # IIS_IUSRS contains application-pool identities. PHP FastCGI can also run
    # with impersonation enabled, in which case writes use the IUSR identity.
    # Use well-known SIDs so this also works when executed from another host.
    Info "Granting IIS modify access to $path"
    if ($isolateFromParent) {
        & icacls.exe $path '/inheritance:d' '/T' '/C' '/Q' | Out-Host
        if ($LASTEXITCODE -ne 0) {
            Die "Could not isolate IIS writable directory '$path' (icacls exit code $LASTEXITCODE)"
        }

        & icacls.exe $path '/remove:g' '*S-1-1-0' '*S-1-5-11' '*S-1-5-32-545' '*S-1-3-0' '/T' '/C' '/Q' | Out-Host
        if ($LASTEXITCODE -ne 0) {
            Die "Could not remove broad access from '$path' (icacls exit code $LASTEXITCODE)"
        }
    }

    & icacls.exe $path '/grant' '*S-1-5-32-568:(OI)(CI)M' '/T' '/C' '/Q' | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Die "Could not grant IIS_IUSRS modify access to '$path' (icacls exit code $LASTEXITCODE)"
    }

    & icacls.exe $path '/grant' '*S-1-5-17:(OI)(CI)M' '/T' '/C' '/Q' | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Die "Could not grant IUSR modify access to '$path' (icacls exit code $LASTEXITCODE)"
    }
}

function Invoke-CheckedCommand($label, $filePath, $argumentList, $workingDirectory) {
    Info $label
    Push-Location $workingDirectory
    try {
        & $filePath @argumentList
        if ($LASTEXITCODE -ne 0) {
            Die "$label failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
}

function Invoke-DeployHealthCheck($siteUrl) {
    $settingsUrl = ($siteUrl.TrimEnd('/') + '/api/settings.api.php?debug=1')
    Info "Running post-deploy health check: $settingsUrl"
    try {
        $response = Invoke-WebRequest -Uri $settingsUrl -UseBasicParsing -TimeoutSec 30
        $body = $response.Content
        Ok "Health check responded with HTTP $([int]$response.StatusCode)"
        if ($body) {
            Write-Host $body
        }
    } catch {
        $resp = $_.Exception.Response
        if ($resp) {
            $statusCode = [int]$resp.StatusCode
            $stream = $resp.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $body = $reader.ReadToEnd()
            $reader.Close()
            Warn "Health check returned HTTP $statusCode"
            if ($body) {
                Write-Host $body
            }
            return
        }
        Warn "Health check failed: $($_.Exception.Message)"
    }
}

function Resolve-FirstConfigValue($keys, $rootDir) {
    foreach ($key in $keys) {
        $resolved = Resolve-ConfigValue $key $rootDir
        if (-not [string]::IsNullOrWhiteSpace($resolved.Value)) {
            return [PSCustomObject]@{
                Key    = $key
                Value  = $resolved.Value
                Source = $resolved.Source
                Path   = $resolved.Path
            }
        }
    }

    return [PSCustomObject]@{
        Key    = ''
        Value  = ''
        Source = 'missing'
        Path   = ''
    }
}

function Normalize-Auth0Domain($domain) {
    $value = ([string]$domain).Trim().TrimEnd('/')
    if ($value -match '^https?://') {
        try {
            return ([Uri]$value).Host
        } catch {
            return $value -replace '^https?://', ''
        }
    }
    return $value
}

function Read-JwtPayload($token) {
    $parts = ([string]$token).Split('.')
    if ($parts.Count -lt 2) { return $null }

    $payload = $parts[1].Replace('-', '+').Replace('_', '/')
    switch ($payload.Length % 4) {
        2 { $payload += '==' }
        3 { $payload += '=' }
        1 { return $null }
    }

    try {
        $json = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload))
        return $json | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Test-ApiTestAuthTokenFresh($token, $minimumSecondsRemaining = 300) {
    $payload = Read-JwtPayload $token
    if ($null -eq $payload -or $null -eq $payload.exp) {
        return $false
    }

    try {
        $expiresAt = [DateTimeOffset]::FromUnixTimeSeconds([int64]$payload.exp)
        return $expiresAt -gt ([DateTimeOffset]::UtcNow.AddSeconds($minimumSecondsRemaining))
    } catch {
        return $false
    }
}

function Resolve-Auth0ClientCredentialPair($rootDir) {
    $pairs = @(
        @('API_TEST_CLIENT_ID', 'API_TEST_CLIENT_SECRET', $false),
        @('AUTH0_API_TEST_CLIENT_ID', 'AUTH0_API_TEST_CLIENT_SECRET', $false),
        @('AUTH0_TEST_CLIENT_ID', 'AUTH0_TEST_CLIENT_SECRET', $false),
        @('AUTH0_M2M_CLIENT_ID', 'AUTH0_M2M_CLIENT_SECRET', $false),
        @('AUTH0_MGMT_CLIENT_ID', 'AUTH0_MGMT_CLIENT_SECRET', $true)
    )

    foreach ($pair in $pairs) {
        $id = Resolve-ConfigValue $pair[0] $rootDir
        $secret = Resolve-ConfigValue $pair[1] $rootDir
        if (
            -not [string]::IsNullOrWhiteSpace($id.Value) `
            -and -not [string]::IsNullOrWhiteSpace($secret.Value)
        ) {
            return [PSCustomObject]@{
                ClientIdKey     = $pair[0]
                ClientId        = $id.Value
                ClientSecretKey = $pair[1]
                ClientSecret    = $secret.Value
                IsMgmtFallback  = [bool]$pair[2]
            }
        }
    }

    return $null
}

function Set-ApiTestAuthToken($rootDir) {
    $existingToken = ([string]$env:API_TEST_AUTH_TOKEN).Trim()
    if ($existingToken -ne '') {
        if (Test-ApiTestAuthTokenFresh $existingToken) {
            Info "Using API_TEST_AUTH_TOKEN from process environment for authenticated API tests"
            return
        }

        Warn "API_TEST_AUTH_TOKEN is expired or near expiry; requesting a fresh API test token"
    }

    $domain = Resolve-FirstConfigValue @('API_TEST_AUTH0_DOMAIN', 'AUTH0_DOMAIN', 'VITE_AUTH0_DOMAIN') $rootDir
    $audience = Resolve-FirstConfigValue @('API_TEST_AUDIENCE', 'AUTH0_AUDIENCE', 'VITE_AUTH0_AUDIENCE') $rootDir
    $clientCredentials = Resolve-Auth0ClientCredentialPair $rootDir
    $scope = Resolve-FirstConfigValue @('API_TEST_AUTH_SCOPE', 'VITE_AUTH0_API_SCOPE') $rootDir

    $missing = @()
    if ([string]::IsNullOrWhiteSpace($domain.Value)) { $missing += 'API_TEST_AUTH0_DOMAIN/AUTH0_DOMAIN/VITE_AUTH0_DOMAIN' }
    if ([string]::IsNullOrWhiteSpace($audience.Value)) { $missing += 'API_TEST_AUDIENCE/AUTH0_AUDIENCE/VITE_AUTH0_AUDIENCE' }
    if ($null -eq $clientCredentials) { $missing += 'a matching Machine-to-Machine client id/secret pair such as AUTH0_API_TEST_CLIENT_ID + AUTH0_API_TEST_CLIENT_SECRET' }
    if ($missing.Count -gt 0) {
        Die "Authenticated API tests need an Auth0 API token. Set API_TEST_AUTH_TOKEN, or configure a Machine-to-Machine test client. Missing: $($missing -join ', ')"
    }

    if ($clientCredentials.IsMgmtFallback) {
        Warn "Using AUTH0_MGMT_* credentials as fallback for API tests. Prefer AUTH0_API_TEST_CLIENT_ID and AUTH0_API_TEST_CLIENT_SECRET for the application API audience."
    }

    $auth0Domain = Normalize-Auth0Domain $domain.Value
    $tokenUrl = "https://$auth0Domain/oauth/token"
    $payload = @{
        grant_type    = 'client_credentials'
        client_id     = $clientCredentials.ClientId
        client_secret = $clientCredentials.ClientSecret
        audience      = $audience.Value
    }
    if (-not [string]::IsNullOrWhiteSpace($scope.Value)) {
        $payload.scope = $scope.Value
    }

    Info "Requesting short-lived Auth0 API test token for audience $($audience.Value)"
    try {
        $response = Invoke-RestMethod `
            -Method Post `
            -Uri $tokenUrl `
            -ContentType 'application/json' `
            -Body ($payload | ConvertTo-Json -Compress) `
            -TimeoutSec 30
        $token = ([string]$response.access_token).Trim()
        if ($token -eq '') {
            Die "Auth0 token response did not include access_token"
        }
        $env:API_TEST_AUTH_TOKEN = $token
        Ok "Auth0 API test token acquired for this process"
    } catch {
        Die "Could not obtain Auth0 API test token from $tokenUrl. Ensure the Machine-to-Machine app is authorized for audience '$($audience.Value)' and allowed scopes '$($scope.Value)'. $($_.Exception.Message)"
    }
}

function Invoke-BackendPipelineTests($rootDir) {
    $skipAllTests = $SkipTests -or (Is-Truthy $env:NZ_LOCAL_SKIP_TESTS)
    if ($skipAllTests) {
        Warn "Skipping backend/API tests before deploy"
        return
    }

    Set-ApiTestAuthToken $rootDir

    $testArgs = @('scripts/api-backend-test.mjs', '--start-server')
    if (-not ($SkipMutatingTests -or (Is-Truthy $env:NZ_LOCAL_SKIP_MUTATING_TESTS))) {
        $testArgs += '--mutate'
    } else {
        Warn "Skipping mutating backend/API tests"
    }

    if (-not ($SkipPerformance -or (Is-Truthy $env:NZ_LOCAL_SKIP_PERFORMANCE))) {
        $testArgs += '--performance'
    } else {
        Warn "Skipping backend/API performance probes"
    }

    Invoke-CheckedCommand "Running backend/API pipeline tests" 'node' $testArgs $rootDir
}

function Invoke-PostDeploySmoke($rootDir, $siteUrl) {
    if ($SkipPostDeploySmoke -or (Is-Truthy $env:NZ_LOCAL_SKIP_POST_DEPLOY_SMOKE)) {
        Warn "Skipping post-deploy API smoke test"
        return
    }

    $smokeArgs = @(
        'scripts/api-backend-test.mjs',
        "--base-url=$($siteUrl.TrimEnd('/'))",
        '--performance'
    )

    if ($SkipTests -or (Is-Truthy $env:NZ_LOCAL_SKIP_TESTS)) {
        Warn "Post-deploy smoke still runs because deploy tests were skipped. Use -SkipPostDeploySmoke to skip it too."
    }

    Invoke-CheckedCommand "Running post-deploy IIS API smoke test" 'node' $smokeArgs $rootDir
}

function Invoke-LocalDeploy($rootDir) {
    $deployTarget = '\\nz-web02\Websites\misstanden.nedzink.nl'
    $deploySiteUrl = if ($env:MISSTANDEN_DEPLOY_URL) { $env:MISSTANDEN_DEPLOY_URL } else { 'https://misstanden.nedzink.nl' }
    $distDir = Join-Path $rootDir 'dist'
    $distAssetsDir = Join-Path $distDir 'assets'
    $distApiDir = Join-Path $distDir 'api'
    $targetAssetsDir = Join-Path $deployTarget 'assets'
    $targetApiDir = Join-Path $deployTarget 'api'
    $vendorDir = Join-Path $rootDir 'vendor'
    $privateDir = Join-Path $rootDir 'private'
    $targetVendorDir = Join-Path $deployTarget 'vendor'
    $targetPrivateDir = Join-Path $deployTarget 'private'
    $targetAttachmentDir = Join-Path $targetPrivateDir 'uploads\attachments'

    foreach ($cmd in @('php','node','npm','robocopy')) {
        if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
            Die "$cmd not found in PATH"
        }
    }

    Invoke-BackendPipelineTests $rootDir
    Invoke-CheckedCommand "Running production build" 'npm' @('run', 'build') $rootDir

    if (-not (Test-Path $deployTarget)) {
        Die "Deploy target is not reachable: $deployTarget"
    }
    if (-not (Test-Path $distDir)) {
        Die "Build output not found: $distDir"
    }

    Info "Deploying build output to $deployTarget"

    $rootFiles = @('favicon.ico', 'manifest.json', 'robots.txt', 'web.config')
    $existingRootFiles = @()
    foreach ($file in $rootFiles) {
        if (Test-Path (Join-Path $distDir $file)) {
            $existingRootFiles += $file
        }
    }
    if ($existingRootFiles.Count -gt 0) {
        Invoke-RobocopyChecked $distDir $deployTarget $existingRootFiles @('/R:2', '/W:2', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
    }

    # Production environment files are server-owned secrets and must never be
    # overwritten by a deployment from a developer workstation.
    $runtimeRootFiles = @('cacert.pem')
    $existingRuntimeFiles = @()
    foreach ($file in $runtimeRootFiles) {
        if (Test-Path (Join-Path $rootDir $file)) {
            $existingRuntimeFiles += $file
        }
    }
    if ($existingRuntimeFiles.Count -gt 0) {
        Info "Deploying non-secret runtime support files"
        Invoke-RobocopyChecked $rootDir $deployTarget $existingRuntimeFiles @('/R:2', '/W:2', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
    } else {
        Warn "No non-secret runtime support files found to deploy (cacert.pem)"
    }

    if (Test-Path $distAssetsDir) {
        Info "Deploying frontend assets before index.html to avoid hash mismatch during rollout"
        Invoke-RobocopyChecked $distAssetsDir $targetAssetsDir @('*') @('/E', '/R:2', '/W:2', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
    } else {
        Warn "Build output has no assets directory: $distAssetsDir"
    }

    if (Test-Path $distApiDir) {
        Invoke-RobocopyChecked $distApiDir $targetApiDir @('*') @('/MIR', '/R:2', '/W:2', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')

        Grant-IisModifyAccess (Join-Path $targetApiDir 'locales')
        Grant-IisModifyAccess (Join-Path $deployTarget 'backups\translations')
        Grant-IisModifyAccess (Join-Path $deployTarget 'logs')
    } else {
        Warn "Build output has no api directory: $distApiDir"
    }

    if (Test-Path $vendorDir) {
        Info "Deploying Composer vendor directory"
        Invoke-RobocopyChecked $vendorDir $targetVendorDir @('*') @('/MIR', '/R:2', '/W:2', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
    } else {
        Warn "vendor directory not found locally: $vendorDir"
    }

    if (Test-Path $privateDir) {
        # Never mirror local keys or uploads into production. Only publish the
        # IIS deny rule; runtime secrets and attachment data remain server-owned.
        $privateWebConfig = Join-Path $privateDir 'web.config'
        if (Test-Path $privateWebConfig) {
            Info "Deploying private IIS access-deny rule"
            Invoke-RobocopyChecked $privateDir $targetPrivateDir @('web.config') @('/R:2', '/W:2', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
        } else {
            Warn "Private IIS access-deny rule not found: $privateWebConfig"
        }
        Grant-IisModifyAccess $targetAttachmentDir $true
    } else {
        Warn "private directory not found locally: $privateDir"
    }

    if (Test-Path (Join-Path $distDir 'index.html')) {
        Info "Publishing index.html last"
        Invoke-RobocopyChecked $distDir $deployTarget @('index.html') @('/R:2', '/W:2', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
    } else {
        Warn "Build output has no index.html: $distDir"
    }

    Ok "Local deploy completed"
    Write-Host "Target  : $deployTarget"
    Write-Host "Build   : $distDir"
    Write-Host "Site    : $deploySiteUrl"

    Invoke-DeployHealthCheck $deploySiteUrl
    Invoke-PostDeploySmoke $rootDir $deploySiteUrl
}

# -----------------------------
# Paths
# -----------------------------
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = $ScriptDir
$PublicDir = Join-Path $RootDir "public"
$ApiDir    = Join-Path $PublicDir "api"
$DistApiDir = Join-Path $RootDir "dist\\api"

if (-not (Test-Path $PublicDir)) { Die "public folder not found: $PublicDir" }

if ($Mode -eq 'local') {
    Invoke-LocalDeploy $RootDir
    exit 0
}

# -----------------------------
# Env defaults (PS 5.1 safe)
# -----------------------------
$PHP_HOST  = if ($env:PHP_HOST) { $env:PHP_HOST } else { "127.0.0.1" }
$PHP_PORT  = if ($env:PHP_PORT) { [int]$env:PHP_PORT } else { 8081 }
$VITE_PORT = if ($env:VITE_PORT){ [int]$env:VITE_PORT } else { 3000 }

# Guard: API token audience must be configured for Auth0 access-token API flows.
$strictAudienceGuard = $RequireAuth0Audience -or (Is-Truthy $env:NZ_REQUIRE_AUTH0_AUDIENCE)
$audienceConfig = Resolve-ConfigValue 'VITE_AUTH0_AUDIENCE' $RootDir
if ([string]::IsNullOrWhiteSpace($audienceConfig.Value)) {
    $message = 'Missing VITE_AUTH0_AUDIENCE (required for API access-token flow; no fallback is used)'
    if ($strictAudienceGuard) {
        Die "$message. Set VITE_AUTH0_AUDIENCE in process env, .env.local, or .env."
    }
    Warn "$message. Continuing in dev mode. Use -RequireAuth0Audience or set NZ_REQUIRE_AUTH0_AUDIENCE=true to hard fail."
} else {
    Info "Auth0 API audience detected from $($audienceConfig.Source)"
}

# -----------------------------
# Logs (stdout / stderr separate)
# -----------------------------
$LogsDir     = Join-Path $RootDir "logs"
$PhpLogsDir  = Join-Path $LogsDir "php"
$SlaLogsDir  = Join-Path $LogsDir "sla"
$ViteLogsDir = Join-Path $LogsDir "vite"

$PHP_LOG   = Join-Path $PhpLogsDir "php-server.log"
$PHP_ERR   = Join-Path $PhpLogsDir "php-server.err.log"
$SLA_LOG   = Join-Path $SlaLogsDir "sla-monitor.log"
$SLA_ERR   = Join-Path $SlaLogsDir "sla-monitor.err.log"
$VITE_LOG  = Join-Path $ViteLogsDir "vite.log"
$VITE_ERR  = Join-Path $ViteLogsDir "vite.err.log"

# -----------------------------
# PID files (to prevent duplicates)
# -----------------------------
$RunDir      = Join-Path $RootDir "run"
$PidDir      = Join-Path $RunDir "pids"
$PHP_PID     = Join-Path $PidDir "php.pid"
$SLA_PID     = Join-Path $PidDir "sla.pid"
$VITE_PID    = Join-Path $PidDir "vite.pid"
$PHP_PID_OLD = Join-Path $RootDir ".php.pid"
$SLA_PID_OLD = Join-Path $RootDir ".sla.pid"
$VITE_PID_OLD = Join-Path $RootDir ".vite.pid"

if (-not (Test-Path $PidDir)) { New-Item -ItemType Directory -Path $PidDir | Out-Null }

# -----------------------------
# Command checks
# -----------------------------
foreach ($cmd in @("php","node","npm")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Die "$cmd not found in PATH"
    }
}

# -----------------------------
# Network helpers (LISTENING only)
# -----------------------------
function Get-ListeningProcIdsOnPort($port) {
    $procIds = @()
    netstat -ano | Select-String "LISTENING" | Select-String "[:.]$port\s" | ForEach-Object {
        $parts = ($_ -split '\s+') | Where-Object { $_ -ne "" }
        if ($parts.Count -ge 5) {
            $procId = $parts[-1]
            if ($procId -match '^\d+$') { $procIds += [int]$procId }
        }
    }
    $procIds | Sort-Object -Unique
}

function PortInUse($port) { (Get-ListeningProcIdsOnPort $port).Count -gt 0 }

function KillProcIds($procIds) {
    foreach ($procId in $procIds) {
        try { Stop-Process -Id $procId -Force -ErrorAction Stop } catch {}
    }
}

function Read-PidFile($path) {
    if (-not (Test-Path $path)) { return $null }
    try {
        $raw = (Get-Content $path -ErrorAction Stop | Select-Object -First 1).Trim()
        if ($raw -match '^\d+$') { return [int]$raw }
    } catch {}
    return $null
}

function Kill-IfRunning($procId, $label, $expectedName = $null) {
    if (-not $procId) { return }
    try {
        $p = Get-Process -Id $procId -ErrorAction Stop
        $cmdLine = $null
        try {
            $procInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $procId"
            $cmdLine = $procInfo.CommandLine
        } catch {}
        if ($expectedName -and ($p.ProcessName -notlike $expectedName)) {
            Warn "$label PID $procId is not $expectedName (found $($p.ProcessName)). Skipping kill."
            return
        }
        if ($cmdLine) {
            Warn "$label PID $procId command line: $cmdLine"
        }
        Warn "$label already running (PID $procId). Killing..."
        Stop-Process -Id $procId -Force -ErrorAction Stop
    } catch {}
}

function Kill-IfRunningWithCommandMatch($procId, $label, $expectedName = $null, $expectedCmdContains = $null) {
    if (-not $procId) { return }
    try {
        $p = Get-Process -Id $procId -ErrorAction Stop
        $cmdLine = $null
        try {
            $procInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $procId"
            $cmdLine = $procInfo.CommandLine
        } catch {}
        if ($expectedName -and ($p.ProcessName -notlike $expectedName)) {
            Warn "$label PID $procId is not $expectedName (found $($p.ProcessName)). Skipping kill."
            return
        }
        if ($expectedCmdContains -and $cmdLine -and ($cmdLine -notmatch [regex]::Escape($expectedCmdContains))) {
            Warn "$label PID $procId command line did not match '$expectedCmdContains'. Skipping kill."
            return
        }
        if ($cmdLine) {
            Warn "$label PID $procId command line: $cmdLine"
        }
        Warn "$label already running (PID $procId). Killing..."
        Stop-Process -Id $procId -Force -ErrorAction Stop
    } catch {}
}

function Cleanup-LockedLogs($path, $days = 7) {
    try {
        $cutoff = (Get-Date).AddDays(-$days)
        Get-ChildItem -Path $path -Filter "*.locked" -File -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.LastWriteTime -lt $cutoff } |
            ForEach-Object {
                try { Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue } catch {}
            }
    } catch {}
}

function Find-FreePortFrom($startPort, $maxTries = 50) {
    $p = $startPort
    for ($i=0; $i -lt $maxTries; $i++) {
        if (-not (PortInUse $p)) { return $p }
        $p++
    }
    Die "No free port found starting from $startPort (tried $maxTries ports)"
}

function Wait-ForPort($port, $timeoutSeconds = 15) {
    $deadline = (Get-Date).AddSeconds($timeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (PortInUse $port) { return $true }
        Start-Sleep -Milliseconds 250
    }
    return $false
}

# -----------------------------
# Kill previous known processes (PID files)
# -----------------------------
Kill-IfRunning (Read-PidFile $PHP_PID) "PHP" "php*"
Kill-IfRunning (Read-PidFile $PHP_PID_OLD) "PHP" "php*"
Kill-IfRunningWithCommandMatch (Read-PidFile $SLA_PID) "SLA" "php*" "sla_monitor.php"
Kill-IfRunningWithCommandMatch (Read-PidFile $SLA_PID_OLD) "SLA" "php*" "sla_monitor.php"
Kill-IfRunning (Read-PidFile $VITE_PID) "Frontend" "node*"
Kill-IfRunning (Read-PidFile $VITE_PID_OLD) "Frontend" "node*"

# Remove legacy root PID files once handled.
foreach ($f in @($PHP_PID_OLD,$SLA_PID_OLD,$VITE_PID_OLD)) {
    try { if (Test-Path $f) { Remove-Item $f -Force -ErrorAction SilentlyContinue } } catch {}
}

# -----------------------------
# Kill port conflicts (only for the ports we want)
# -----------------------------
foreach ($port in @($PHP_PORT, $VITE_PORT)) {
    $procIds = Get-ListeningProcIdsOnPort $port
    if ($procIds.Count -gt 0) {
        Warn "Port $port is in use by PID(s): $($procIds -join ', '). Killing..."
        KillProcIds $procIds
        Start-Sleep -Milliseconds 400
    }
}

# -----------------------------
# Start PHP
# -----------------------------
Info "Starting PHP on http://${PHP_HOST}:${PHP_PORT}"
$null = Cleanup-LockedLogs $LogsDir 7
$PHP_LOG = Prepare-Log $PHP_LOG
$PHP_ERR = Prepare-Log $PHP_ERR

$PHP_Process = Start-Process `
    -FilePath "php" `
    -ArgumentList "-S ${PHP_HOST}:${PHP_PORT}" `
    -WorkingDirectory $PublicDir `
    -RedirectStandardOutput $PHP_LOG `
    -RedirectStandardError  $PHP_ERR `
    -PassThru

Start-Sleep -Milliseconds 600
if ($PHP_Process.HasExited) {
    Warn "PHP process exited early."
    Tail $PHP_ERR 120
    Die "PHP failed to start"
}

if (-not (Wait-ForPort $PHP_PORT 10)) {
    Warn "PHP started but port $PHP_PORT is not listening."
    Tail $PHP_ERR 120
    Die "PHP health check failed"
}
Ok "PHP running"
Set-Content -Path $PHP_PID -Value $PHP_Process.Id -Encoding ascii

# -----------------------------
# SLA monitor (auto-disable if missing env)
# -----------------------------
$SLA_FILE = $null
foreach ($f in @(
    (Join-Path $ApiDir "sla_monitor.php"),
    (Join-Path $ApiDir "sla-monitor.php"),
    (Join-Path $DistApiDir "sla_monitor.php"),
    (Join-Path $DistApiDir "sla-monitor.php")
)) {
    if (Test-Path $f) { $SLA_FILE = $f; break }
}

$SLA_Process = $null
if ($SLA_FILE) {
    Info "Starting SLA monitor ($SLA_FILE)"
    $SLA_LOG = Prepare-Log $SLA_LOG
    $SLA_ERR = Prepare-Log $SLA_ERR

    $SLA_Process = Start-Process `
        -FilePath "php" `
        -ArgumentList "`"$SLA_FILE`"" `
        -WorkingDirectory $RootDir `
        -RedirectStandardOutput $SLA_LOG `
        -RedirectStandardError  $SLA_ERR `
        -PassThru

    Start-Sleep -Milliseconds 600
    if ($SLA_Process.HasExited) {
        # SLA shouldn't kill the whole dev env; show logs and continue.
        Warn "SLA monitor exited early (disabled). Last lines:"
        Tail $SLA_ERR 120
        $SLA_Process = $null
    } else {
        Ok "SLA running (PID $($SLA_Process.Id))"
        Set-Content -Path $SLA_PID -Value $SLA_Process.Id -Encoding ascii
    }
} else {
    Warn "SLA monitor not found in $ApiDir"
}

# -----------------------------
# Detect npm dev script reliably
# -----------------------------
function Get-DevScriptFromPackageJson($workingDir) {
    $pkg = Join-Path $workingDir "package.json"
    if (-not (Test-Path $pkg)) { return $null }

    try {
        $json = Get-Content $pkg -Raw -Encoding utf8 | ConvertFrom-Json
        if ($null -eq $json.scripts) { return $null }

        $names = @($json.scripts.PSObject.Properties.Name)

        foreach ($candidate in @("dev","start","serve","preview","watch")) {
            if ($names -contains $candidate) { return $candidate }
        }
        return $null
    } catch {
        return $null
    }
}

function Get-DevScriptFromNpmRunOutput() {
    try {
        $out = npm run 2>$null
        $text = ($out | Out-String)
        foreach ($candidate in @("dev","start","serve","preview","watch")) {
            if ($text -match "^\s+$candidate\s*$" -or $text -match "^\s+$candidate\r?$") { return $candidate }
            if ($text -match "^\s+$candidate\s*$") { return $candidate }
        }
        # last resort: if start is mentioned anywhere
        if ($text -match "\bstart\b") { return "start" }
        return $null
    } catch {
        return $null
    }
}

# -----------------------------
# Start Vite (npm) with auto-detect + port strategy
# -----------------------------
Info "Starting frontend dev server (Vite via npm)"
$VITE_LOG = Prepare-Log $VITE_LOG
$VITE_ERR = Prepare-Log $VITE_ERR

$devScript = Get-DevScriptFromPackageJson $RootDir
if (-not $devScript) { $devScript = Get-DevScriptFromNpmRunOutput }

if (-not $devScript) {
    Warn "No suitable dev script found. Available scripts from 'npm run':"
    try { npm run | ForEach-Object { Write-Host "  $_" } } catch {}
    Die "Cannot start frontend dev server"
}

$VITE_PORT = Find-FreePortFrom $VITE_PORT 50
$FrontendUrl = "http://127.0.0.1:$VITE_PORT"

Info "Using npm script '$devScript' and port $VITE_PORT"
$viteArgs = "/c npm run $devScript -- --host 127.0.0.1 --port $VITE_PORT"

$VITE_Process = Start-Process `
  -FilePath "cmd.exe" `
  -ArgumentList $viteArgs `
  -WorkingDirectory $RootDir `
  -RedirectStandardOutput $VITE_LOG `
  -RedirectStandardError  $VITE_ERR `
  -WindowStyle Hidden `
  -PassThru

Start-Sleep -Milliseconds 600
if ($VITE_Process.HasExited) {
    Warn "Frontend process exited early."
    Tail $VITE_ERR 160
    Tail $VITE_LOG 120
    Die "Frontend failed to start (npm script '$devScript')"
}

if (-not (Wait-ForPort $VITE_PORT 20)) {
    Warn "Frontend process is running but port $VITE_PORT never started listening."
    Warn "Last Vite stderr:"
    Tail $VITE_ERR 200
    Warn "Last Vite stdout:"
    Tail $VITE_LOG 120
    Die "Frontend health check failed"
}

Ok "Frontend running on $FrontendUrl"
Set-Content -Path $VITE_PID -Value $VITE_Process.Id -Encoding ascii

# -----------------------------
# Cleanup
# -----------------------------
Register-EngineEvent PowerShell.Exiting -Action {
    Info "Stopping services"
    foreach ($p in @($VITE_Process,$SLA_Process,$PHP_Process)) {
        if ($p) {
            try { Stop-Process $p.Id -Force -ErrorAction SilentlyContinue } catch {}
        }
    }
    foreach ($f in @($VITE_PID,$SLA_PID,$PHP_PID)) {
        try { if (Test-Path $f) { Remove-Item $f -Force -ErrorAction SilentlyContinue } } catch {}
    }
    foreach ($f in @($VITE_PID_OLD,$SLA_PID_OLD,$PHP_PID_OLD)) {
        try { if (Test-Path $f) { Remove-Item $f -Force -ErrorAction SilentlyContinue } } catch {}
    }
} | Out-Null

# -----------------------------
# Done
# -----------------------------
Write-Host ""
Ok "Dev environment READY"
Write-Host "Frontend: $FrontendUrl"
Write-Host "API     : http://${PHP_HOST}:${PHP_PORT}"
Write-Host "SLA     : " -NoNewline
if ($SLA_Process) { Write-Host "Running" } else { Write-Host "Disabled" }

Write-Host ""
Write-Host "Logs:"
Write-Host " - PHP      : $PHP_LOG"
Write-Host " - PHP ERR  : $PHP_ERR"
Write-Host " - SLA      : $SLA_LOG"
Write-Host " - SLA ERR  : $SLA_ERR"
Write-Host " - Vite     : $VITE_LOG"
Write-Host " - Vite ERR : $VITE_ERR"
Write-Host ""
Write-Host "Press CTRL+C to stop"

Wait-Process -Id $PHP_Process.Id, $VITE_Process.Id
