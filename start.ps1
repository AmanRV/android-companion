param(
    [string]$AdbPath,
    [string]$FpsCsv,
    [string]$Game
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $root 'build.ps1')

if (-not $AdbPath) {
    $adbCommand = Get-Command adb.exe -ErrorAction SilentlyContinue
    if ($adbCommand) { $AdbPath = $adbCommand.Source }
    else {
        $candidate = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
        if (Test-Path $candidate) { $AdbPath = $candidate }
    }
}
if (-not $AdbPath -or -not (Test-Path $AdbPath)) {
    throw 'ADB not found. Install Google Android SDK Platform Tools, then pass -AdbPath C:\path\to\adb.exe.'
}
$arguments = @()
if ($FpsCsv) { $arguments += @('--fps-csv', $FpsCsv) }
if ($Game) { $arguments += @('--game', $Game) }
if ($arguments.Count -eq 0) {
    $monitor = Start-Process -FilePath (Join-Path $root 'bin\Monitor.exe') -PassThru -WindowStyle Hidden
} else {
    $monitor = Start-Process -FilePath (Join-Path $root 'bin\Monitor.exe') -ArgumentList $arguments -PassThru -WindowStyle Hidden
}
Write-Host 'Monitor started. Press Ctrl+C to stop. USB link checks every 5 seconds.'
# ADB prints expected disconnect states to stderr. PowerShell 5.1 turns those
# into terminating errors under Stop, even when the stream is redirected.
$ErrorActionPreference = 'Continue'
$wasConnected = $false
try {
    while (-not $monitor.HasExited) {
        # -d selects a physical USB device and rejects wireless ADB transports.
        $state = & $AdbPath -d get-state 2>$null
        $connected = ($LASTEXITCODE -eq 0 -and $state -eq 'device')
        if ($connected) {
            & $AdbPath -d reverse tcp:8765 tcp:8765 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0 -and -not $wasConnected) {
                $installed = & $AdbPath -d shell pm path com.androidcompanion.dashboard 2>$null
                if ($installed -match '^package:') {
                    & $AdbPath -d shell am start -n com.androidcompanion.dashboard/.MainActivity 2>$null | Out-Null
                    Write-Host 'Phone connected. Opened Android Companion over USB.'
                } else {
                    & $AdbPath -d shell am start -a android.intent.action.VIEW -d 'http://127.0.0.1:8765/' 2>$null | Out-Null
                    Write-Host 'Phone connected. Opened the browser dashboard over USB.'
                }
            }
        } elseif ($wasConnected) { Write-Host 'Phone disconnected. Waiting for USB...' }
        $wasConnected = $connected
        Start-Sleep -Seconds 5
        $monitor.Refresh()
    }
} finally {
    if ($monitor -and -not $monitor.HasExited) { Stop-Process -Id $monitor.Id }
    if ($AdbPath -and (Test-Path $AdbPath)) { & $AdbPath -d reverse --remove tcp:8765 2>$null | Out-Null }
}
