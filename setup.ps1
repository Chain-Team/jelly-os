# JellyOS Setup Script for Windows PowerShell
# Run with: Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy Bypass; .\setup.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  ╔════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "  ║     JellyOS Setup  ·  v1.0.0           ║" -ForegroundColor Yellow
Write-Host "  ╚════════════════════════════════════════╝" -ForegroundColor Yellow
Write-Host ""

# Check Node.js
try {
    $nodeVersion = (node --version) -replace "v", "" -split "\." | Select-Object -First 1
    if ([int]$nodeVersion -lt 18) { throw "Node.js 18+ required" }
    Write-Host "  ✓ Node.js $(node --version)" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Node.js 18+ required. Download from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# Install Pi CLI if missing
try {
    pi --version 2>$null | Out-Null
    Write-Host "  ✓ Pi already installed" -ForegroundColor Green
} catch {
    Write-Host "  Installing Pi CLI..." -ForegroundColor Gray
    npm install -g @earendil-works/pi-coding-agent
    Write-Host "  ✓ Pi installed" -ForegroundColor Green
}

# Install
Write-Host ""
Write-Host "  Installing dependencies..." -ForegroundColor Gray
npm install
Write-Host "  ✓ Dependencies installed" -ForegroundColor Green

# Link
npm link 2>$null
Write-Host "  ✓ 'jelly' command linked" -ForegroundColor Green

# Setup wizard
Write-Host ""
node bin/jellyos setup

# Dashboard
if (Test-Path "dashboard/package.json") {
    Write-Host ""
    Write-Host "  Installing dashboard dependencies..." -ForegroundColor Gray
    Push-Location dashboard; npm install; Pop-Location
    Write-Host "  ✓ Dashboard ready" -ForegroundColor Green
}

Write-Host ""
Write-Host "  Setup Complete!" -ForegroundColor Yellow
Write-Host "  jelly                     - start agent"
Write-Host "  cd dashboard; npm run dev - start dashboard"
Write-Host ""
