param([switch]$NoPrompt)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$statusScript = Join-Path $PSScriptRoot "capture-status.ps1"
$messagesPath = Join-Path $PSScriptRoot "capture-desktop-messages.json"
$publicHealthUrl = "https://human-stack-battle-game.pages.dev/capture/api/health"
$messages = [IO.File]::ReadAllText($messagesPath, [Text.Encoding]::UTF8) | ConvertFrom-Json

try {
  $statusOutput = (& $statusScript 2>&1 | Out-String).Trim()
  $publicStatus = $messages.statusPublicStopped
  try {
    $response = Invoke-RestMethod -Uri "${publicHealthUrl}?status=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" `
      -Headers @{ "Cache-Control" = "no-cache" } -TimeoutSec 10
    if ($response.ok -eq $true) {
      $publicStatus = $messages.statusPublicAvailable
    }
  } catch {
    $publicStatus = $messages.statusPublicStopped
  }

  if ($NoPrompt) {
    Write-Output "$statusOutput`n`n$publicStatus"
  } else {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
      "$statusOutput`n`n$publicStatus",
      $messages.statusTitle,
      "OK",
      "Information"
    ) | Out-Null
  }
  exit 0
} catch {
  if ($NoPrompt) {
    Write-Error "$($messages.statusFailure): $($_.Exception.Message)"
  } else {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
      "$($messages.statusFailure)`n`n$($_.Exception.Message)",
      $messages.statusTitle,
      "OK",
      "Error"
    ) | Out-Null
  }
  exit 1
}
