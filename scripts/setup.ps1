# JellyOS Setup Script for Windows (PowerShell)
param(
    [switch]$Dev,
    [switch]$Force,
    [switch]$NoEnv,
    [switch]$Help
)

# Colors
$RESET = "$([char]27)[0m"
$RED = "$([char]27)[31m"
$GREEN = "$([char]27)[32m"
$YELLOW = "$([char]27)[33m"
$BLUE = "$([char]27)[34m"

# Logging functions
function Log-Info($Message) {
    Write-Host "${BLUE}[INFO]${RESET} $Message"
}

function Log-Success($Message) {
    Write-Host "${GREEN}[SUCCESS]${RESET} $Message"
}

function Log-Warning($Message) {
    Write-Host "${YELLOW}[WARNING]${RESET} $Message"
}

function Log-Error($Message) {
    Write-Host "${RED}[ERROR]${RESET} $Message"
}

# Help
function Show-Help {
    Write-Host "JellyOS Setup Script"
    Write-Host ""
    Write-Host "Usage: .\scripts\setup.ps1 [-Dev] [-Force] [-NoEnv] [-Help]"
    Write-Host ""
    Write-Host "Parameters:"
    Write-Host "  -Dev       Install development dependencies"
    Write-Host "  -Force     Force reinstall even if already set up"
    Write-Host "  -NoEnv     Skip .env file creation"
    Write-Host "  -Help      Show this help message"
    Write-Host ""
    Write-Host "This script will:"
    Write-Host "  - Check system requirements"
    Write-Host "  - Install dependencies"
    Write-Host "  - Create configuration files"
    Write-Host "  - Set up directories"
    Write-Host "  - Configure platform-specific settings"
}

# Check if running as administrator (not recommended)
function Check-Admin {
    $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if ($isAdmin) {
        Log-Warning "Running as administrator is not recommended. Please run as a regular user."
    }
}

# Check prerequisites
function Check-Prerequisites {
    Log-Info "Checking prerequisites..."

    # Check Node.js
    try {
        $nodeVersion = node --version 2>$null
        if ($LASTEXITCODE -ne 0) {
            Log-Error "Node.js is not installed"
            Write-Host "Please download and install Node.js from https://nodejs.org/"
            exit 1
        }

        $nodeMajor = $nodeVersion -replace 'v','' -split '\.' | Select-Object -First 1
        if ([int]$nodeMajor -lt 18) {
            Log-Error "Node.js version >= 18 is required (found $nodeVersion)"
            exit 1
        }
        Log-Success "Node.js $nodeVersion detected"
    }
    catch {
        Log-Error "Node.js is not installed"
        Write-Host "Please download and install Node.js from https://nodejs.org/"
        exit 1
    }

    # Check npm
    try {
        $npmVersion = npm --version 2>$null
        if ($LASTEXITCODE -ne 0) {
            Log-Error "npm is not installed"
            exit 1
        }

        $npmMajor = $npmVersion -split '\.' | Select-Object -First 1
        if ([int]$npmMajor -lt 9) {
            Log-Error "npm version >= 9 is required (found $npmVersion)"
            exit 1
        }
        Log-Success "npm $npmVersion detected"
    }
    catch {
        Log-Error "npm is not installed"
        exit 1
    }

    # Check git
    try {
        $gitVersion = git --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Log-Success "git detected"
        } else {
            Log-Warning "git is not installed. Some features may not work correctly."
        }
    }
    catch {
        Log-Warning "git is not installed. Some features may not work correctly."
    }
}

# Check disk space
function Check-DiskSpace {
    Log-Info "Checking disk space..."
    $drive = Get-Location | Select-Object -ExpandProperty Drive
    $freeSpace = (Get-PSDrive $drive.DriveLetter).Free / 1MB

    if ($freeSpace -lt 100) {
        Log-Error "Insufficient disk space: $([Math]::Round($freeSpace, 2))MB available, 100MB required"
        exit 1
    }

    Log-Success "Sufficient disk space: $([Math]::Round($freeSpace, 2))MB available"
}

# Create directories
function Create-Directories {
    Log-Info "Creating directories..."

    if (!(Test-Path "config")) {
        New-Item -ItemType Directory -Path "config" | Out-Null
    }
    Log-Success "Created config directory"

    if (!(Test-Path "logs")) {
        New-Item -ItemType Directory -Path "logs" | Out-Null
    }
    Log-Success "Created logs directory"
}

# Install npm dependencies
function Install-Dependencies {
    Log-Info "Installing npm dependencies..."

    $installCmd = "npm install"
    if ($Dev) {
        Log-Info "Installing development dependencies..."
    } else {
        $installCmd += " --production"
    }

    # Retry logic
    $retries = 3
    $count = 0
    do {
        $count++
        try {
            Invoke-Expression $installCmd 2>$null
            if ($LASTEXITCODE -eq 0) {
                break
            } else {
                if ($count -lt $retries) {
                    Log-Warning "npm install failed, retrying ($count/$retries)..."
                    Start-Sleep -Seconds 2
                } else {
                    Log-Error "npm install failed after $retries attempts"
                    exit 1
                }
            }
        }
        catch {
            if ($count -lt $retries) {
                Log-Warning "npm install failed, retrying ($count/$retries)..."
                Start-Sleep -Seconds 2
            } else {
                Log-Error "npm install failed after $retries attempts"
                exit 1
            }
        }
    } while ($count -lt $retries)

    Log-Success "Dependencies installed"
}

# Create .env file
function Create-EnvFile {
    if ($NoEnv) {
        Log-Info "Skipping .env file creation (-NoEnv flag)"
        return
    }

    if (Test-Path ".env.local" -and !$Force) {
        Log-Info ".env.local already exists, skipping creation"
        return
    }

    Log-Info "Creating .env.local file..."

    if (Test-Path ".env.example") {
        Copy-Item ".env.example" -Destination ".env.local" -Force
        Log-Success "Created .env.local from .env.example"
        Log-Info "Please edit .env.local with your API keys and configuration"
    } else {
        Create-MinimalEnvFile
    }
}

# Create minimal .env file
function Create-MinimalEnvFile {
    $envContent = @"
# JellyOS Environment Variables
ALCHEMY_KEY=your_alchemy_key_here
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
LOG_LEVEL=info
TRADING_ENABLED=false
PREDICTION_ENABLED=true
"@

    $envContent | Out-File -FilePath ".env.local" -Encoding UTF8
    Log-Success "Created minimal .env.local"
}

# Create logs directory
function Create-LogsDirectory {
    Log-Info "Creating logs directory..."
    if (!(Test-Path "logs")) {
        New-Item -ItemType Directory -Path "logs" | Out-Null
    }
    Log-Success "Logs directory created"
}

# Create config directory
function Create-ConfigDirectory {
    Log-Info "Creating config directory..."
    $configDir = Join-Path $env:USERPROFILE ".jellyos"
    if (!(Test-Path $configDir)) {
        New-Item -ItemType Directory -Path $configDir | Out-Null
    }
    Log-Success "Config directory created at $configDir"
}

# Windows-specific setup
function Windows-SpecificSetup {
    Log-Info "Performing Windows-specific setup..."

    # Check for Scoop or Winget
    try {
        $scoop = scoop --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Log-Success "Scoop detected"
        }
    }
    catch {}

    try {
        $winget = winget --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Log-Success "Winget detected"
        }
    }
    catch {}

    Log-Success "Windows setup complete"
}

# Main function
function Main {
    # Show help if requested
    if ($Help) {
        Show-Help
        return
    }

    # Banner
    Write-Host "${BLUE}"
    Write-Host "╔══════════════════════════════════════════════════╗"
    Write-Host "║              JellyOS Setup Script                ║"
    Write-Host "║   AI Prediction & Trading System Configuration   ║"
    Write-Host "╚══════════════════════════════════════════════════╝"
    Write-Host "${RESET}"

    Log-Info "Starting JellyOS setup..."

    Check-Admin
    Check-Prerequisites
    Check-DiskSpace

    # Change to JellyOS directory
    $jellyosDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
    Set-Location $jellyosDir

    # Setup steps with progress
    Write-Progress -Activity "Setting up JellyOS" -Status "Creating directories" -PercentComplete 10
    Create-Directories

    Write-Progress -Activity "Setting up JellyOS" -Status "Installing dependencies" -PercentComplete 30
    Install-Dependencies

    Write-Progress -Activity "Setting up JellyOS" -Status "Creating environment file" -PercentComplete 50
    Create-EnvFile

    Write-Progress -Activity "Setting up JellyOS" -Status "Creating logs directory" -PercentComplete 60
    Create-LogsDirectory

    Write-Progress -Activity "Setting up JellyOS" -Status "Creating config directory" -PercentComplete 70
    Create-ConfigDirectory

    Write-Progress -Activity "Setting up JellyOS" -Status "Windows-specific setup" -PercentComplete 80
    Windows-SpecificSetup

    Write-Progress -Activity "Setting up JellyOS" -Status "Complete" -PercentComplete 100

    # Success banner
    Write-Host "${GREEN}"
    Write-Host "╔══════════════════════════════════════════════════╗"
    Write-Host "║                                                  ║"
    Write-Host "║   █▀▀ █░█ █▀▀ █▀▀ █▄░█ █▀▀ █▀█ █▀▀              ║"
    Write-Host "║   █▄▄ █▀█ ██▄ ██▄ █░▀█ ██▄ █▀▄ ██▄              ║"
    Write-Host "║                                                  ║"
    Write-Host "║        🚀 JellyOS Setup Complete! 🚀            ║"
    Write-Host "║                                                  ║"
    Write-Host "╚══════════════════════════════════════════════════╝"
    Write-Host "${RESET}"

    Write-Host "${BLUE}Next steps:${RESET}"
    Write-Host "  1. Edit .env.local with your API keys and configuration"
    Write-Host "  2. Run 'npm run build' to compile the project"
    Write-Host "  3. Run 'npm start' to start JellyOS"
    Write-Host ""
    Write-Host "${YELLOW}Need help? Check the documentation at: https://github.com/jelly-chain/JellyOS${RESET}"

    Log-Success "Setup completed successfully!"
}

# Trap Ctrl+C
try {
    Main
}
catch {
    Log-Error "Setup was interrupted. Cleaning up..."
    exit 1
}