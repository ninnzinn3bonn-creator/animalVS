$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtime = Join-Path $root "runtime"
$processFile = Join-Path $runtime "capture-processes.json"

function Stop-KnownProcess([int]$ProcessId, [string[]]$AllowedNames, [string]$CommandLinePattern) {
  if (-not $ProcessId) { return }
  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $process) { return }
  if ($AllowedNames -notcontains $process.ProcessName) {
    Write-Warning "Skipped PID $ProcessId because it is $($process.ProcessName)."
    return
  }
  $details = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
  if (-not $details -or $details.CommandLine -notmatch $CommandLinePattern) {
    Write-Warning "Skipped PID $ProcessId because its command line does not match the capture service."
    return
  }
  Stop-Process -Id $ProcessId -Force
  Wait-Process -Id $ProcessId -Timeout 10 -ErrorAction SilentlyContinue
}

if (-not (Test-Path $processFile)) {
  Write-Output "No capture process state was found."
  exit 0
}

$state = Get-Content -Raw $processFile | ConvertFrom-Json
Stop-KnownProcess ([int]$state.tunnelPid) @("cloudflared") "(?i)\btunnel\b.*\brun\b.*--token-file"
Stop-KnownProcess ([int]$state.serverPid) @("node") "(?i)apps[\\/]server[\\/]dist[\\/]index\.js"
Stop-KnownProcess ([int]$state.workerPid) @("python", "python3") "(?i)uvicorn.*--app-dir\s+services[\\/]image-worker"

Remove-Item -LiteralPath $processFile -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $runtime "capture-tunnel-token.tmp") -Force -ErrorAction SilentlyContinue
Write-Output "Capture services stopped."
