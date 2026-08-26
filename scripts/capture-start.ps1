$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtime = Join-Path $root "runtime"
$processFile = Join-Path $runtime "capture-processes.json"
$tokenFile = Join-Path $runtime "capture-tunnel-token.dat"
$tunnelFile = Join-Path $runtime "capture-tunnel.json"
$cloudflared = Join-Path $env:LOCALAPPDATA "cloudflared\cloudflared.exe"

New-Item -ItemType Directory -Path $runtime -Force | Out-Null

function Get-ListenerPid([int]$Port, [string[]]$AllowedNames, [string]$CommandLinePattern) {
  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($connection) {
    $process = Get-Process -Id ([int]$connection.OwningProcess) -ErrorAction SilentlyContinue
    $details = Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)" -ErrorAction SilentlyContinue
    if (-not $process -or $AllowedNames -notcontains $process.ProcessName -or
        -not $details -or $details.CommandLine -notmatch $CommandLinePattern) {
      throw "Port $Port is already used by an unrelated process."
    }
    return [int]$connection.OwningProcess
  }
  return 0
}

function Wait-ForHealth([string]$Url, [string]$Label) {
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
      $response = Invoke-RestMethod -Uri $Url -TimeoutSec 2
      if ($response.ok -eq $true) { return }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  throw "$Label did not become healthy: $Url"
}

function Start-HiddenProcess(
  [string]$FilePath,
  [string[]]$ArgumentList,
  [string]$Stdout,
  [string]$Stderr
) {
  return Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WorkingDirectory $root `
    -RedirectStandardOutput $Stdout -RedirectStandardError $Stderr -WindowStyle Hidden -PassThru
}

$workerPid = Get-ListenerPid 8788 @("python", "python3") "(?i)uvicorn.*--app-dir\s+services[\\/]image-worker"
if (-not $workerPid) {
  $worker = Start-HiddenProcess "python" @(
    "-m", "uvicorn", "app:app", "--app-dir", "services/image-worker",
    "--host", "127.0.0.1", "--port", "8788"
  ) (Join-Path $runtime "capture-worker.out.log") (Join-Path $runtime "capture-worker.err.log")
  $workerPid = $worker.Id
}

$serverPid = Get-ListenerPid 5180 @("node") "(?i)apps[\\/]server[\\/]dist[\\/]index\.js"
if (-not $serverPid) {
  if (-not (Test-Path (Join-Path $root "apps\server\dist\index.js"))) {
    throw "apps/server/dist/index.js is missing. Run npm run build first."
  }
  $server = Start-HiddenProcess "node" @(
    "--env-file=.env.public", "apps/server/dist/index.js"
  ) (Join-Path $runtime "capture-server.out.log") (Join-Path $runtime "capture-server.err.log")
  $serverPid = $server.Id
}

Wait-ForHealth "http://127.0.0.1:8788/health" "Image worker"
Wait-ForHealth "http://127.0.0.1:5180/api/health" "Capture API"

if (-not (Test-Path $cloudflared)) { throw "cloudflared is missing: $cloudflared" }
if (-not (Test-Path $tokenFile)) { throw "Encrypted tunnel token is missing: $tokenFile" }
if (-not (Test-Path $tunnelFile)) { throw "Tunnel metadata is missing: $tunnelFile" }

$tunnelMeta = Get-Content -Raw $tunnelFile | ConvertFrom-Json
$tunnelPid = 0
if (Test-Path $processFile) {
  try {
    $previous = Get-Content -Raw $processFile | ConvertFrom-Json
    $candidate = Get-Process -Id ([int]$previous.tunnelPid) -ErrorAction SilentlyContinue
    $candidateDetails = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$previous.tunnelPid)" -ErrorAction SilentlyContinue
    if ($candidate -and $candidate.ProcessName -eq "cloudflared" -and $candidateDetails -and
        $candidateDetails.CommandLine -match "(?i)\btunnel\b.*\brun\b.*--token-file") {
      $tunnelPid = $candidate.Id
    }
  } catch {
    $tunnelPid = 0
  }
}

if (-not $tunnelPid) {
  $encryptedToken = (Get-Content -Raw $tokenFile).Trim()
  $secureToken = $encryptedToken | ConvertTo-SecureString
  $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  try {
    $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
    $temporaryTokenFile = Join-Path $runtime "capture-tunnel-token.tmp"
    Set-Content -LiteralPath $temporaryTokenFile -Value $plainToken -NoNewline -Encoding ascii
  } finally {
    if ($tokenPointer -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    }
    $plainToken = $null
  }

  try {
    $tunnel = Start-HiddenProcess $cloudflared @(
      "tunnel", "--no-autoupdate", "run", "--token-file", $temporaryTokenFile
    ) (Join-Path $runtime "capture-named-tunnel.out.log") (Join-Path $runtime "capture-named-tunnel.err.log")
    Start-Sleep -Seconds 3
    if ($tunnel.HasExited) {
      throw "Named Tunnel stopped during startup. Check runtime/capture-named-tunnel.err.log."
    }
    $tunnelPid = $tunnel.Id
  } finally {
    Remove-Item -LiteralPath $temporaryTokenFile -Force -ErrorAction SilentlyContinue
  }
}

$state = [ordered]@{
  workerPid = $workerPid
  serverPid = $serverPid
  tunnelPid = $tunnelPid
  tunnelId = $tunnelMeta.id
  tunnelName = $tunnelMeta.name
  startedAt = (Get-Date).ToUniversalTime().ToString("o")
}
$state | ConvertTo-Json | Set-Content -LiteralPath $processFile -Encoding utf8

Write-Output "Capture services are running."
Write-Output "Image worker: http://127.0.0.1:8788 (PID $workerPid)"
Write-Output "Capture API:  http://127.0.0.1:5180 (PID $serverPid)"
Write-Output "Named Tunnel: $($tunnelMeta.name) / $($tunnelMeta.id) (PID $tunnelPid)"
