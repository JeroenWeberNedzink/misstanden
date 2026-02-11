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

# -----------------------------
# Paths
# -----------------------------
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = $ScriptDir
$PublicDir = Join-Path $RootDir "public"
$ApiDir    = Join-Path $PublicDir "api"
$DistApiDir = Join-Path $RootDir "dist\\api"

if (-not (Test-Path $PublicDir)) { Die "public folder not found: $PublicDir" }

# -----------------------------
# Env defaults (PS 5.1 safe)
# -----------------------------
$PHP_HOST  = if ($env:PHP_HOST) { $env:PHP_HOST } else { "127.0.0.1" }
$PHP_PORT  = if ($env:PHP_PORT) { [int]$env:PHP_PORT } else { 8081 }
$VITE_PORT = if ($env:VITE_PORT){ [int]$env:VITE_PORT } else { 3000 }

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
