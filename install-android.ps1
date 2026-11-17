param(
    [string]$AdbPath,
    [string]$ApkPath
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $AdbPath) {
    $command = Get-Command adb.exe -ErrorAction SilentlyContinue
    if ($command) { $AdbPath = $command.Source }
}
if (-not $AdbPath -or -not (Test-Path $AdbPath)) {
    throw 'ADB not found. Pass -AdbPath C:\path\to\adb.exe.'
}
if (-not $ApkPath) { $ApkPath = Join-Path $root 'bin\android-companion-debug-apk\app-debug.apk' }
if (-not (Test-Path $ApkPath)) { throw "APK not found: $ApkPath" }
$state = & $AdbPath -d get-state
if ($LASTEXITCODE -ne 0 -or $state -ne 'device') { throw 'No authorized USB phone found.' }
& $AdbPath -d install -r $ApkPath
if ($LASTEXITCODE -ne 0) { throw 'APK install failed. If replacing a debug APK signed by another build, uninstall the old app first.' }
& $AdbPath -d reverse tcp:8765 tcp:8765
if ($LASTEXITCODE -ne 0) { throw 'ADB reverse failed.' }
& $AdbPath -d shell am start -n com.androidcompanion.dashboard/.MainActivity
if ($LASTEXITCODE -ne 0) { throw 'Could not launch Android Companion.' }
