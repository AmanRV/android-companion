$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$programs = [Environment]::GetFolderPath('Programs')
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $programs 'Android Companion.lnk'))
$shortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$shortcut.Arguments = '"' + (Join-Path $root 'Launch Android Companion.vbs') + '"'
$shortcut.WorkingDirectory = $root
$shortcut.Description = 'USB phone dashboard and local media controller'
$shortcut.IconLocation = (Join-Path $root 'bin\AndroidCompanion.exe') + ',0'
$shortcut.Save()
Write-Host 'Added Android Companion to your Start menu. No automatic startup was enabled.'
