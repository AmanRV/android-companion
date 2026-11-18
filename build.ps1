$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path $compiler)) { throw 'Windows .NET Framework C# compiler was not found.' }
$bin = Join-Path $root 'bin'
New-Item -ItemType Directory -Force -Path $bin | Out-Null
$framework = Split-Path $compiler
$metadata = Join-Path $env:WINDIR 'System32\WinMetadata'
$references = @('Windows.Foundation.winmd', 'Windows.Media.winmd', 'Windows.Storage.winmd') | ForEach-Object { '/r:' + (Join-Path $metadata $_) }
$references += '/r:' + (Join-Path $framework 'System.Runtime.InteropServices.WindowsRuntime.dll')
$references += Get-ChildItem (Join-Path $env:WINDIR 'Microsoft.NET\assembly\GAC_MSIL\System.Runtime') -Recurse -Filter '*.dll' | ForEach-Object { '/r:' + $_.FullName }
& $compiler /nologo /optimize+ /target:exe /platform:anycpu /r:System.Web.Extensions.dll /r:System.Management.dll $references "/out:$(Join-Path $bin 'Monitor.exe')" (Join-Path $root 'src\Monitor.cs') (Join-Path $root 'src\Media.cs')
if ($LASTEXITCODE -ne 0) { throw 'Compilation failed.' }
Write-Host "Built $bin\Monitor.exe"
