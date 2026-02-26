param(
  [string]$ApiUrl = "http://127.0.0.1:8081/api/sla-backfill.api.php",
  [string]$CronKey = $env:SLA_BACKFILL_CRON_KEY,
  [switch]$Force,
  [int]$Limit = 0
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($CronKey)) {
  Write-Error "Missing cron key. Set SLA_BACKFILL_CRON_KEY env var or pass -CronKey."
  exit 1
}

$payload = @{}
if ($Force.IsPresent) { $payload.force = $true }
if ($Limit -gt 0) { $payload.limit = $Limit }

$headers = @{
  "Content-Type"   = "application/json"
  "X-SLA-CRON-KEY" = $CronKey
}

try {
  $response = Invoke-RestMethod `
    -Method Post `
    -Uri $ApiUrl `
    -Headers $headers `
    -Body ($payload | ConvertTo-Json -Depth 4 -Compress)

  if (-not $response.success) {
    throw ($response.message ?? "Unknown SLA backfill error")
  }

  $updated = [int]($response.updated ?? 0)
  $skipped = [int]($response.skipped ?? 0)
  $mode = [string]($response.auth_mode ?? "unknown")
  $stamp = (Get-Date).ToString("s")
  Write-Output "[$stamp] SLA backfill OK. updated=$updated skipped=$skipped mode=$mode"
  exit 0
}
catch {
  Write-Error "SLA backfill failed: $($_.Exception.Message)"
  exit 1
}
