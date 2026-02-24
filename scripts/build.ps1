$ErrorActionPreference = 'Stop'

$rootDir = Resolve-Path (Join-Path $PSScriptRoot '..')
$distDir = Join-Path $rootDir 'dist'
$extDir = Join-Path $distDir 'extension'
$pagesDir = Join-Path $distDir 'pages'

$version = $env:VERSION
if ([string]::IsNullOrWhiteSpace($version)) {
  $package = Get-Content -Raw (Join-Path $rootDir 'package.json') | ConvertFrom-Json
  $version = $package.version
}

$zipName = "torrent-link-proxy-v$version.zip"
$zipPath = Join-Path $distDir $zipName

$extensionFiles = @(
  'manifest.json',
  'background.js',
  'content.js',
  'popup.html',
  'popup.js',
  'options.html',
  'options.js',
  'icon16.svg',
  'icon48.svg',
  'icon128.svg',
  '_locales'
)

$pagesFiles = @(
  'index.html',
  'README.md',
  'icon16.svg',
  'icon48.svg',
  'icon128.svg'
)

if (Test-Path $distDir) {
  Remove-Item -Recurse -Force $distDir
}
New-Item -ItemType Directory -Force -Path $extDir, $pagesDir | Out-Null

foreach ($file in $extensionFiles) {
  Copy-Item -Path (Join-Path $rootDir $file) -Destination $extDir -Recurse -Force
}

Compress-Archive -Path (Join-Path $extDir '*') -DestinationPath $zipPath -Force

foreach ($file in $pagesFiles) {
  Copy-Item -Path (Join-Path $rootDir $file) -Destination $pagesDir -Recurse -Force
}

Copy-Item -Path $zipPath -Destination $pagesDir -Force

Write-Output "Built extension package: $zipPath"
Write-Output "Built pages artifact dir: $pagesDir"
