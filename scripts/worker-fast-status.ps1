param([int]$Port = 8789)

$pattern = "(?i)uvicorn\s+fast_app:app\b.*--port\s+$Port\b"
$connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $connection) {
  Write-Output "Fast image worker ${Port}: STOPPED"
  exit 0
}

$details = Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)" -ErrorAction SilentlyContinue
if (-not $details -or $details.CommandLine -notmatch $pattern) {
  Write-Output "Fast image worker ${Port}: IN USE BY ANOTHER PROCESS (PID $($connection.OwningProcess))"
  exit 1
}

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 3
  Write-Output "Fast image worker ${Port}: READY (PID $($connection.OwningProcess))"
  Write-Output "Provider: $($health.provider) / model: $($health.model) / warmup: $($health.warmupMs) ms"
  if ($health.fallbackReason) { Write-Warning $health.fallbackReason }
} catch {
  Write-Output "Fast image worker ${Port}: STARTING OR UNHEALTHY (PID $($connection.OwningProcess))"
  exit 1
}
