$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path $compiler)) { throw 'Windows .NET Framework C# compiler was not found.' }
$bin = Join-Path $root 'bin'
New-Item -ItemType Directory -Force -Path $bin | Out-Null
& $compiler /nologo /optimize+ /target:exe /platform:anycpu /r:System.Web.Extensions.dll /r:System.Management.dll "/out:$(Join-Path $bin 'Monitor.exe')" (Join-Path $root 'src\Monitor.cs')
if ($LASTEXITCODE -ne 0) { throw 'Compilation failed.' }
Write-Host "Built $bin\Monitor.exe"
