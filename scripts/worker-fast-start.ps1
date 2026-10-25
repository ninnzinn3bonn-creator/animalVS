param(
  [string]$PythonExe = "",
  [int]$Port = 8789,
  [int]$TimeoutSeconds = 180,
  [switch]$RequireGpu
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$bundledPython = Join-Path $root "work\fast-worker-venv\Scripts\python.exe"
if (-not $PythonExe) {
  $PythonExe = if ($env:FAST_WORKER_PYTHON) { $env:FAST_WORKER_PYTHON } elseif (Test-Path $bundledPython) { $bundledPython } else { "python" }
}
$runtime = Join-Path $root "runtime"
$stateFile = Join-Path $runtime "fast-worker-process.json"
$pattern = "(?i)uvicorn\s+fast_app:app\b.*--port\s+$Port\b"
New-Item -ItemType Directory -Path $runtime -Force | Out-Null

$connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($connection) {
  $details = Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)" -ErrorAction SilentlyContinue
  if (-not $details -or $details.CommandLine -notmatch $pattern) {
    throw "Port $Port is already used by an unrelated process."
  }
  $process = Get-Process -Id ([int]$connection.OwningProcess)
} else {
  $process = Start-Process -FilePath $PythonExe -ArgumentList @(
    "-m", "uvicorn", "fast_app:app", "--app-dir", "services/image-worker",
    "--host", "127.0.0.1", "--port", "$Port"
  ) -WorkingDirectory $root -RedirectStandardOutput (Join-Path $runtime "fast-worker.out.log") `
    -RedirectStandardError (Join-Path $runtime "fast-worker.err.log") -WindowStyle Hidden -PassThru
}

@{
  pid = $process.Id
  port = $Port
  startedAt = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding utf8

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
try {
  do {
    if ($process.HasExited) { throw "Fast worker stopped during startup." }
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 3
      if ($health.ok -eq $true -and $health.ready -eq $true) { break }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  } while ((Get-Date) -lt $deadline)

  if (-not $health -or $health.ready -ne $true) { throw "Fast worker warmup timed out." }
  if ($RequireGpu -and $health.provider -notin @("CUDAExecutionProvider", "DmlExecutionProvider")) {
    throw "GPU was required, but the fast worker selected $($health.provider)."
  }
} catch {
  Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
  throw
}

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  $process = Get-Process -Id ([int]$listener.OwningProcess)
  @{
    pid = $process.Id
    port = $Port
    startedAt = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding utf8
}

Write-Output "Fast image worker is ready on http://127.0.0.1:$Port (PID $($process.Id))."
Write-Output "Provider: $($health.provider) / model: $($health.model) / warmup: $($health.warmupMs) ms"
if ($health.fallbackReason) { Write-Warning $health.fallbackReason }
