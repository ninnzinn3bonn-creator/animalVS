param([switch]$NoPrompt)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtime = Join-Path $root "runtime"
$stopScript = Join-Path $PSScriptRoot "capture-stop.ps1"
$statusScript = Join-Path $PSScriptRoot "capture-status.ps1"
$messagesPath = Join-Path $PSScriptRoot "capture-desktop-messages.json"
$logFile = Join-Path $runtime "capture-desktop-launcher.log"
$messages = [IO.File]::ReadAllText($messagesPath, [Text.Encoding]::UTF8) | ConvertFrom-Json

function Write-LauncherLog([string]$Message) {
  $line = "{0} {1}{2}" -f (Get-Date).ToString("s"), $Message, [Environment]::NewLine
  [IO.File]::AppendAllText($logFile, $line, [Text.Encoding]::UTF8)
}

function Show-LauncherMessage([string]$Message, [bool]$IsError = $false) {
  Add-Type -AssemblyName PresentationFramework
  $icon = if ($IsError) { "Error" } else { "Information" }
  [System.Windows.MessageBox]::Show($Message, $messages.appTitle, "OK", $icon) | Out-Null
}

try {
  Write-LauncherLog "STOP requested"
  $stopOutput = & $stopScript 2>&1 | Out-String
  $statusOutput = & $statusScript 2>&1 | Out-String
  Write-LauncherLog $stopOutput.Trim()
  Write-LauncherLog $statusOutput.Trim()
  if ($statusOutput -notmatch "Image worker 8788:\s+STOPPED" -or
      $statusOutput -notmatch "Capture API 5180:\s+STOPPED" -or
      $statusOutput -notmatch "Named Tunnel:\s+STOPPED") {
    throw $messages.stopIncomplete
  }
  Write-LauncherLog "STOP completed"
  if (-not $NoPrompt) {
    Show-LauncherMessage $messages.stopSuccess
  }
  exit 0
} catch {
  Write-LauncherLog "STOP failed: $($_.Exception.ToString())"
  if (-not $NoPrompt) {
    Show-LauncherMessage "$($messages.stopFailure)`n`n$($_.Exception.Message)`n`n$($messages.logLabel): $logFile" $true
  }
  exit 1
}
