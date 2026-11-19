$ErrorActionPreference = 'Stop'
$DesktopRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$RuntimeVersion = '45.3.2'
$RuntimeDirectory = Join-Path $DesktopRoot 'runtime'
$RuntimeExecutable = Join-Path $RuntimeDirectory 'electron.exe'

function Initialize-SwayRuntime {
    if (Test-Path -LiteralPath $RuntimeExecutable) { return $RuntimeExecutable }
    $CacheRoots = @((Join-Path $env:LOCALAPPDATA 'electron\Cache'), (Join-Path $env:USERPROFILE 'AppData\Local\electron\Cache')) | Select-Object -Unique
    $Archive = $CacheRoots | ForEach-Object { Get-ChildItem -LiteralPath $_ -Recurse -File -Filter "electron-v$RuntimeVersion-win32-x64.zip" -ErrorAction SilentlyContinue } | Select-Object -First 1
    if (-not $Archive) { throw "Electron $RuntimeVersion is not in the local cache. No software was downloaded or installed." }
    New-Item -ItemType Directory -Path $RuntimeDirectory -Force | Out-Null
    Expand-Archive -LiteralPath $Archive.FullName -DestinationPath $RuntimeDirectory -Force
    if (-not (Test-Path -LiteralPath $RuntimeExecutable)) { throw 'Electron archive did not contain electron.exe.' }
    $VersionFile = Join-Path $RuntimeDirectory 'version'
    if ((Get-Content -LiteralPath $VersionFile -Raw).Trim() -ne $RuntimeVersion) { throw 'Unexpected Electron runtime version.' }
    return $RuntimeExecutable
}
