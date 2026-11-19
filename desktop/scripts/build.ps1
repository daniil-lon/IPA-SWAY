param([switch]$FullMedia)
. (Join-Path $PSScriptRoot 'runtime.ps1')
$Executable = Initialize-SwayRuntime
$ReleaseRoot = Join-Path $DesktopRoot 'release'
$ReleaseName = 'Sway-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
$ReleaseDirectory = Join-Path $ReleaseRoot $ReleaseName
New-Item -ItemType Directory -Path $ReleaseDirectory -Force | Out-Null
Get-ChildItem -LiteralPath $RuntimeDirectory | Copy-Item -Destination $ReleaseDirectory -Recurse -Force
Rename-Item -LiteralPath (Join-Path $ReleaseDirectory 'electron.exe') -NewName 'Sway.exe'
$ApplicationDirectory = Join-Path $ReleaseDirectory 'resources\app'
New-Item -ItemType Directory -Path $ApplicationDirectory -Force | Out-Null
foreach ($SourceName in @('package.json','main.cjs','preload.cjs','local-assets.cjs','local-library.cjs','ui')) {
    Copy-Item -LiteralPath (Join-Path $DesktopRoot $SourceName) -Destination $ApplicationDirectory -Recurse -Force
}
$LibraryDirectory = [System.IO.Path]::GetFullPath((Join-Path $DesktopRoot '..\public'))
if ($FullMedia) {
    Write-Output 'Copying the complete local library (approximately 30 GB).'
    Copy-Item -LiteralPath $LibraryDirectory -Destination (Join-Path $ApplicationDirectory 'public') -Recurse -Force
    $LyricsDirectory = Join-Path (Split-Path $LibraryDirectory -Parent) 'lyrics_archive'
    if (Test-Path -LiteralPath $LyricsDirectory) { Copy-Item -LiteralPath $LyricsDirectory -Destination (Join-Path $ApplicationDirectory 'lyrics_archive') -Recurse -Force }
    $ReadmeText = "Sway for Windows`r`n`r`nStart Sway.exe. The complete music library is included.`r`nSettings and collection are stored beside the application in resources\app\.data.`r`n"
} else {
    @{ sharedPublic = $LibraryDirectory } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $ApplicationDirectory 'library.json') -Encoding UTF8
    $ReadmeText = "Sway for Windows`r`n`r`nStart Sway.exe. This build reads the existing music library without copying 30 GB.`r`nKeep this folder available: $LibraryDirectory`r`nTo make a fully independent build, run desktop\scripts\build.ps1 -FullMedia.`r`nSettings and collection are stored in resources\app\.data.`r`n"
}
Set-Content -LiteralPath (Join-Path $ReleaseDirectory 'README.txt') -Value $ReadmeText -Encoding UTF8
foreach ($DocumentationName in @('README.md','QA.md','FEATURE-MAP.md','REFERENCE-ASSETS.md','Sway.ico')) {
    $DocumentationPath = Join-Path $DesktopRoot $DocumentationName
    if (Test-Path -LiteralPath $DocumentationPath) { Copy-Item -LiteralPath $DocumentationPath -Destination $ReleaseDirectory -Force }
}
Set-Content -LiteralPath (Join-Path $ReleaseRoot 'latest.txt') -Value (Join-Path $ReleaseDirectory 'Sway.exe') -Encoding UTF8
Write-Output (Join-Path $ReleaseDirectory 'Sway.exe')
