param(
  [switch]$NoPrompt,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtime = Join-Path $root "runtime"
$startScript = Join-Path $PSScriptRoot "capture-start.ps1"
$stopScript = Join-Path $PSScriptRoot "capture-stop.ps1"
$messagesPath = Join-Path $PSScriptRoot "capture-desktop-messages.json"
$logFile = Join-Path $runtime "capture-desktop-launcher.log"
$gameUrl = "https://human-stack-battle-game.pages.dev/?view=capture"
$publicHealthUrl = "https://human-stack-battle-game.pages.dev/capture/api/health"
$messages = [IO.File]::ReadAllText($messagesPath, [Text.Encoding]::UTF8) | ConvertFrom-Json

New-Item -ItemType Directory -Path $runtime -Force | Out-Null

function Write-LauncherLog([string]$Message) {
  $line = "{0} {1}{2}" -f (Get-Date).ToString("s"), $Message, [Environment]::NewLine
  [IO.File]::AppendAllText($logFile, $line, [Text.Encoding]::UTF8)
}

function Show-LauncherMessage([string]$Message, [bool]$IsError = $false) {
  Add-Type -AssemblyName PresentationFramework
  $icon = if ($IsError) { "Error" } else { "Information" }
  [System.Windows.MessageBox]::Show(
    $Message,
    $messages.appTitle,
    "OK",
    $icon
  ) | Out-Null
}

function Wait-ForPublicHealth {
  for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
      $separator = if ($publicHealthUrl.Contains("?")) { "&" } else { "?" }
      $response = Invoke-RestMethod -Uri "$publicHealthUrl${separator}launcher=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" `
        -Headers @{ "Cache-Control" = "no-cache" } -TimeoutSec 10
      if ($response.ok -eq $true) { return }
    } catch {
      Write-LauncherLog "Public health attempt $attempt failed: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 1
  }
  throw $messages.publicHealthFailure
}

try {
  Write-LauncherLog "START requested"
  $startOutput = & $startScript 2>&1 | Out-String
  Write-LauncherLog $startOutput.Trim()

  $workerHealth = Invoke-RestMethod -Uri "http://127.0.0.1:8788/health" -TimeoutSec 5
  $apiHealth = Invoke-RestMethod -Uri "http://127.0.0.1:5180/api/health" -TimeoutSec 5
  if ($workerHealth.ok -ne $true -or $apiHealth.ok -ne $true) {
    throw $messages.localHealthFailure
  }

  Wait-ForPublicHealth
  Write-LauncherLog "START completed"
  if (-not $NoBrowser) { Start-Process $gameUrl }
  if (-not $NoPrompt) {
    Show-LauncherMessage $messages.startSuccess
  }
  exit 0
} catch {
  Write-LauncherLog "START failed: $($_.Exception.ToString())"
  try {
    & $stopScript 2>&1 | Out-String | ForEach-Object { Write-LauncherLog $_.Trim() }
  } catch {
    Write-LauncherLog "Rollback failed: $($_.Exception.Message)"
  }
  if (-not $NoPrompt) {
    Show-LauncherMessage "$($messages.startFailure)`n`n$($_.Exception.Message)`n`n$($messages.logLabel): $logFile" $true
  }
  exit 1
}
