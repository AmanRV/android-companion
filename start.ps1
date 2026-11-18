param([string]$AdbPath, [string]$FpsCsv, [string]$Game)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$executable = Join-Path $root 'bin\AndroidCompanion.exe'
try {
    $alreadyRunning = Get-Process AndroidCompanion -ErrorAction SilentlyContinue
    if (-not $alreadyRunning) {
        $sources = @(Get-ChildItem (Join-Path $root 'src') -Filter '*.cs') + @(Get-Item (Join-Path $root 'build.ps1'))
        $newest = ($sources | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc
        if (-not (Test-Path $executable) -or (Get-Item $executable).LastWriteTimeUtc -lt $newest) {
            & (Join-Path $root 'build.ps1')
        }
    }
    function Quote-Argument([string]$value) {
        '"' + ($value -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"'
    }
    $arguments = @()
    if ($AdbPath) { $arguments += '--adb'; $arguments += Quote-Argument $AdbPath }
    if ($FpsCsv) { $arguments += '--fps-csv'; $arguments += Quote-Argument $FpsCsv }
    if ($Game) { $arguments += '--game'; $arguments += Quote-Argument $Game }
    $launch = @{ FilePath = $executable; WorkingDirectory = $root; WindowStyle = 'Hidden' }
    if ($arguments.Count) { $launch.ArgumentList = ($arguments -join ' ') }
    Start-Process @launch
    Write-Host 'Android Companion is running in the system tray. Right-click its icon to exit.'
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Android Companion could not start') | Out-Null
    exit 1
}
