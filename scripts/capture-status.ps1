$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtime = Join-Path $root "runtime"
$processFile = Join-Path $runtime "capture-processes.json"
$tunnelFile = Join-Path $runtime "capture-tunnel.json"

function Get-PortState([int]$Port, [string[]]$AllowedNames, [string]$CommandLinePattern) {
  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($connection) {
    $process = Get-Process -Id ([int]$connection.OwningProcess) -ErrorAction SilentlyContinue
    $details = Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)" -ErrorAction SilentlyContinue
    if ($process -and $AllowedNames -contains $process.ProcessName -and $details -and
        $details.CommandLine -match $CommandLinePattern) {
      return "LISTEN (PID $($connection.OwningProcess))"
    }
    return "IN USE BY ANOTHER PROCESS (PID $($connection.OwningProcess))"
  }
  return "STOPPED"
}

$tunnelState = "STOPPED"
if (Test-Path $processFile) {
  try {
    $state = Get-Content -Raw $processFile | ConvertFrom-Json
    $process = Get-Process -Id ([int]$state.tunnelPid) -ErrorAction SilentlyContinue
    $details = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$state.tunnelPid)" -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -eq "cloudflared" -and $details -and
        $details.CommandLine -match "(?i)\btunnel\b.*\brun\b.*--token-file") {
      $tunnelState = "RUNNING (PID $($process.Id))"
    }
  } catch {
    $tunnelState = "UNKNOWN"
  }
}

$tunnelName = "not configured"
if (Test-Path $tunnelFile) {
  $meta = Get-Content -Raw $tunnelFile | ConvertFrom-Json
  $tunnelName = "$($meta.name) / $($meta.id)"
}

Write-Output "Image worker 8788: $(Get-PortState 8788 @("python", "python3") "(?i)uvicorn.*--app-dir\s+services[\\/]image-worker")"
Write-Output "Capture API 5180:  $(Get-PortState 5180 @("node") "(?i)apps[\\/]server[\\/]dist[\\/]index\.js")"
Write-Output "Named Tunnel:      $tunnelState"
Write-Output "Tunnel identity:   $tunnelName"
