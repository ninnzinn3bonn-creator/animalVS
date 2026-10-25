param([int]$Port = 8789)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$stateFile = Join-Path $root "runtime\fast-worker-process.json"
$pattern = "(?i)uvicorn\s+fast_app:app\b.*--port\s+$Port\b"
$candidatePid = 0

$connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($connection) { $candidatePid = [int]$connection.OwningProcess }

if (-not $candidatePid -and (Test-Path $stateFile)) {
  try { $candidatePid = [int](Get-Content -Raw $stateFile | ConvertFrom-Json).pid } catch { $candidatePid = 0 }
}
if ($candidatePid) {
  $process = Get-Process -Id $candidatePid -ErrorAction SilentlyContinue
  $details = Get-CimInstance Win32_Process -Filter "ProcessId=$candidatePid" -ErrorAction SilentlyContinue
  if ($process -and $details -and $details.CommandLine -match $pattern) {
    Stop-Process -Id $candidatePid -Force
    Wait-Process -Id $candidatePid -Timeout 15 -ErrorAction SilentlyContinue
    Write-Output "Fast image worker stopped."
  } elseif ($process) {
    throw "Refusing to stop PID $candidatePid because it is not the fast image worker."
  }
} else {
  Write-Output "Fast image worker is already stopped."
}

Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
