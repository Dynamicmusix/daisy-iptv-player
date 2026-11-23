<#
  build-tizen.ps1: Packages Daisy IPTV into a Samsung Tizen Smart TV .wgt package.
  Usage:
    powershell -ExecutionPolicy Bypass -File .\tools\build-tizen.ps1
#>
param(
    [string]$Output = "dist\daisy-iptv-v1.0.0.wgt",
    [string]$TizenCli,
    [string]$Profile = "DaisyPartner"
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$public = Join-Path $root "public"
$dist = Join-Path $root "dist"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Daisy IPTV v1.0.0 - Tizen WGT Builder" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if (-not (Test-Path $dist)) {
    New-Item -ItemType Directory -Force -Path $dist | Out-Null
}

$targetWgt = Join-Path $root $Output
if (Test-Path $targetWgt) {
    Remove-Item -LiteralPath $targetWgt -Force
}

# Verify required files in public/
$required = @("config.xml", "index.html", "icon.png")
foreach ($f in $required) {
    $p = Join-Path $public $f
    if (-not (Test-Path $p)) {
        throw "Missing required Tizen file: $p"
    }
}

Write-Host "Packaging files from public/ into $targetWgt..." -ForegroundColor Yellow

Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($targetWgt, 'Create')
try {
    Get-ChildItem -LiteralPath $public -Recurse -File | ForEach-Object {
        $rel = $_.FullName.Substring($public.Length + 1).Replace('\', '/')
        if ($rel -notlike ".git*" -and $rel -notlike "*~*") {
            [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel, 'Optimal')
            Write-Host "  + $rel" -ForegroundColor Gray
        }
    }
} finally {
    $zip.Dispose()
}

$hash = (Get-FileHash -LiteralPath $targetWgt -Algorithm SHA256).Hash
$size = (Get-Item -LiteralPath $targetWgt).Length

Write-Host "`nSuccessfully built Samsung Tizen package:" -ForegroundColor Green
Write-Host "  File   : $targetWgt" -ForegroundColor Green
Write-Host "  Size   : $([math]::Round($size / 1KB, 1)) KB ($size bytes)" -ForegroundColor Green
Write-Host "  SHA256 : $hash" -ForegroundColor Green

# Optional signing with Tizen Studio CLI if provided
if ($TizenCli -and (Test-Path $TizenCli)) {
    Write-Host "`nSigning package with Tizen CLI ($Profile)..." -ForegroundColor Yellow
    $signedDir = Join-Path $dist "signed"
    if (Test-Path $signedDir) { Remove-Item -LiteralPath $signedDir -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $signedDir | Out-Null
    
    $signOut = & cmd /c "`"$TizenCli`" package -t wgt -s $Profile -o `"$signedDir`" -- `"$targetWgt`" 2>&1"
    $signOut | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
    
    $signedWgt = Get-ChildItem -LiteralPath $signedDir -Filter *.wgt | Select-Object -First 1
    if ($signedWgt) {
        Copy-Item -LiteralPath $signedWgt.FullName -Destination $targetWgt -Force
        Remove-Item -LiteralPath $signedDir -Recurse -Force
        Write-Host "Signed package updated: $targetWgt" -ForegroundColor Green
    }
}

Write-Host "`nReady for sideloading on Samsung Smart TV via Developer Mode, Apps2Samsung, or Vetro!" -ForegroundColor Cyan
