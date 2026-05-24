#!/usr/bin/env bash
set -euo pipefail

# JellyOS Setup Script
# Detects OS, checks prerequisites, installs dependencies, configures environment

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Spinner
spinner() {
  local pid=$1
  local delay=0.1
  local spinstr='|/-\'
  while ps -p "$pid" > /dev/null 2>&1; do
    local temp=${spinstr#?}
    printf " [%c]  " "$spinstr"
    local spinstr=$temp${spinstr%"$temp"}
    sleep $delay
    printf "\b\b\b\b\b\b"
  done
  printf "    \b\b\b\b"
}

# Logging
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Help
show_help() {
  echo "JellyOS Setup Script"
  echo ""
  echo "Usage: ./scripts/setup.sh [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --dev       Install development dependencies"
  echo "  --force     Force reinstall even if already set up"
  echo "  --no-env    Skip .env file creation"
  echo "  --help      Show this help message"
  echo ""
  echo "This script will:"
  echo "  - Check system requirements"
  echo "  - Install dependencies"
  echo "  - Create configuration files"
  echo "  - Set up directories"
  echo "  - Configure platform-specific settings"
}

# Parse arguments
DEV_MODE=false
FORCE=false
CREATE_ENV=true

while [[ $# -gt 0 ]]; do
  case $1 in
    --dev)
      DEV_MODE=true
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
    --no-env)
      CREATE_ENV=false
      shift
      ;;
    --help|-h)
      show_help
      exit 0
      ;;
    *)
      log_error "Unknown option: $1"
      show_help
      exit 1
      ;;
  esac
done

# Banner
print_banner() {
  echo -e "${BLUE}"
  echo "╔══════════════════════════════════════════════════╗"
  echo "║              JellyOS Setup Script                ║"
  echo "║   AI Prediction & Trading System Configuration   ║"
  echo "╚══════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

# Check if running as root (not recommended)
check_root() {
  if [[ $EUID -eq 0 ]]; then
    log_warning "Running as root is not recommended. Please run as a regular user."
  fi
}

# Detect OS
detect_os() {
  log_info "Detecting operating system..."
  case "$(uname -s)" in
    Darwin*)
      OS="macOS"
      OS_VERSION=$(sw_vers -productVersion)
      log_success "Detected macOS $OS_VERSION"
      ;;
    Linux*)
      OS="Linux"
      if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS_NAME=$NAME
        OS_VERSION=$VERSION_ID
        log_success "Detected $OS_NAME $OS_VERSION"
      else
        log_success "Detected Linux"
      fi
      ;;
    *)
      log_error "Unsupported operating system: $(uname -s)"
      exit 1
      ;;
  esac
}

# Check prerequisites
check_prerequisites() {
  log_info "Checking prerequisites..."

  # Check Node.js
  if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed"
    if [[ "$OS" == "macOS" ]]; then
      log_info "Install Node.js using Homebrew: brew install node"
    elif [[ "$OS" == "Linux" ]]; then
      log_info "Install Node.js using your package manager (apt, yum, etc.)"
    fi
    exit 1
  fi

  NODE_VERSION=$(node --version | cut -d'v' -f2)
  NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1)
  if [[ $NODE_MAJOR -lt 18 ]]; then
    log_error "Node.js version >= 18 is required (found $NODE_VERSION)"
    exit 1
  fi
  log_success "Node.js $NODE_VERSION detected"

  # Check npm
  if ! command -v npm &> /dev/null; then
    log_error "npm is not installed"
    exit 1
  fi

  NPM_VERSION=$(npm --version)
  NPM_MAJOR=$(echo "$NPM_VERSION" | cut -d'.' -f1)
  if [[ $NPM_MAJOR -lt 9 ]]; then
    log_error "npm version >= 9 is required (found $NPM_VERSION)"
    exit 1
  fi
  log_success "npm $NPM_VERSION detected"

  # Check git
  if ! command -v git &> /dev/null; then
    log_error "git is not installed"
    exit 1
  fi
  log_success "git detected"
}

# Check disk space
check_disk_space() {
  log_info "Checking disk space..."
  local required_space_mb=100
  local available_space_mb=$(df . | awk 'NR==2 {print int($4/1024)}')

  if [[ $available_space_mb -lt $required_space_mb ]]; then
    log_error "Insufficient disk space: ${available_space_mb}MB available, ${required_space_mb}MB required"
    exit 1
  fi
  log_success "Sufficient disk space: ${available_space_mb}MB available"
}

# Install system packages
install_system_packages() {
  log_info "Installing system packages..."

  case "$OS" in
    macOS)
      # Check for Homebrew
      if ! command -v brew &> /dev/null; then
        log_warning "Homebrew not found. Install from https://brew.sh"
      else
        log_info "Updating Homebrew..."
        brew update > /dev/null 2>&1 &
        spinner $!
        log_success "Homebrew updated"
      fi
      ;;
    Linux)
      # Common packages for Linux
      if command -v apt-get &> /dev/null; then
        log_info "Installing build tools (Debian/Ubuntu)..."
        sudo apt-get update > /dev/null 2>&1 &
        spinner $!
        sudo apt-get install -y build-essential python3 gcc > /dev/null 2>&1 &
        spinner $!
      elif command -v yum &> /dev/null; then
        log_info "Installing build tools (CentOS/RHEL)..."
        sudo yum groupinstall -y "Development Tools" > /dev/null 2>&1 &
        spinner $!
        sudo yum install -y python3 gcc > /dev/null 2>&1 &
        spinner $!
      elif command -v pacman &> /dev/null; then
        log_info "Installing build tools (Arch Linux)..."
        sudo pacman -Sy --noconfirm base-devel python3 gcc > /dev/null 2>&1 &
        spinner $!
      fi
      log_success "System packages installed"
      ;;
  esac
}

# Install npm dependencies
install_dependencies() {
  log_info "Installing npm dependencies..."

  local install_cmd="npm install"
  if [[ "$DEV_MODE" == true ]]; then
    log_info "Installing development dependencies..."
  else
    install_cmd="$install_cmd --production"
  fi

  # Retry logic
  local retries=3
  local count=0
  until [ $count -ge $retries ]; do
    if $install_cmd > /dev/null 2>&1; then
      break
    else
      count=$((count+1))
      if [ $count -lt $retries ]; then
        log_warning "npm install failed, retrying ($count/$retries)..."
        sleep 2
      else
        log_error "npm install failed after $retries attempts"
        exit 1
      fi
    fi
  done

  log_success "Dependencies installed"
}

# Create directories
create_directories() {
  log_info "Creating directories..."

  mkdir -p logs
  log_success "Created logs directory"

  mkdir -p config
  log_success "Created config directory"

  # Platform-specific config directory
  case "$OS" in
    macOS)
      mkdir -p "$HOME/Library/Application Support/jellyos"
      log_success "Created platform config directory"
      ;;
    Linux)
      mkdir -p "$HOME/.config/jellyos"
      log_success "Created platform config directory"
      ;;
  esac
}

# Create .env file
create_env_file() {
  if [[ "$CREATE_ENV" == false ]]; then
    log_info "Skipping .env file creation (--no-env flag)"
    return
  fi

  if [[ -f ".env.local" ]] && [[ "$FORCE" == false ]]; then
    log_info ".env.local already exists, skipping creation"
    return
  fi

  log_info "Creating .env.local file..."

  if [[ -f ".env.example" ]]; then
    cp .env.example .env.local
    log_success "Created .env.local from .env.example"
    log_info "Please edit .env.local with your API keys and configuration"
  else
    log_warning ".env.example not found, creating minimal .env.local"
    cat > .env.local << EOF
# JellyOS Environment Variables
ALCHEMY_KEY=your_alchemy_key_here
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
LOG_LEVEL=info
TRADING_ENABLED=false
PREDICTION_ENABLED=true
EOF
    log_success "Created minimal .env.local"
  fi
}

# Platform-specific setup
platform_specific_setup() {
  case "$OS" in
    macOS)
      log_info "Performing macOS-specific setup..."
      # Check for Homebrew and offer to install Node via nvm if needed
      if command -v brew &> /dev/null; then
        if ! command -v nvm &> /dev/null; then
          log_info "Consider installing nvm for Node.js version management: brew install nvm"
        fi
      fi
      ;;
    Linux)
      log_info "Performing Linux-specific setup..."
      # Check for systemd
      if command -v systemctl &> /dev/null; then
        log_info "systemd detected. Consider setting up JellyOS as a service"
      fi
      ;;
  esac
}

# Create logs directory
create_logs_directory() {
  log_info "Creating logs directory..."
  mkdir -p logs
  log_success "Logs directory created"
}

# Create config directory
create_config_directory() {
  log_info "Creating config directory..."
  mkdir -p "$HOME/.jellyos"
  log_success "Config directory created at ~/.jellyos"
}

# Main setup function
main() {
  print_banner
  log_info "Starting JellyOS setup..."

  check_root
  detect_os
  check_prerequisites
  check_disk_space

  # Change to JellyOS directory
  JELLYOS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  cd "$JELLYOS_DIR"

  # Setup steps
  install_system_packages &
  spinner $!

  create_directories &
  spinner $!

  install_dependencies &
  spinner $!

  create_env_file &
  spinner $!

  create_logs_directory &
  spinner $!

  create_config_directory &
  spinner $!

  platform_specific_setup &
  spinner $!

  # Success banner
  echo -e "${GREEN}"
  echo "╔══════════════════════════════════════════════════╗"
  echo "║                                                  ║"
  echo "║   █▀▀ █░█ █▀▀ █▀▀ █▄░█ █▀▀ █▀█ █▀▀              ║"
  echo "║   █▄▄ █▀█ ██▄ ██▄ █░▀█ ██▄ █▀▄ ██▄              ║"
  echo "║                                                  ║"
  echo "║        🚀 JellyOS Setup Complete! 🚀            ║"
  echo "║                                                  ║"
  echo "╚══════════════════════════════════════════════════╝"
  echo -e "${NC}"

  echo -e "${BLUE}Next steps:${NC}"
  echo "  1. Edit .env.local with your API keys and configuration"
  echo "  2. Run \`npm run build\` to compile the project"
  echo "  3. Run \`npm start\` to start JellyOS"
  echo ""
  echo -e "${YELLOW}Need help? Check the documentation at: https://github.com/jelly-chain/JellyOS${NC}"

  log_success "Setup completed successfully!"
}

# Trap Ctrl+C
trap 'echo -e "\n${YELLOW}Setup interrupted. Cleaning up...${NC}"; exit 1' INT TERM

# Run main function
main "$@"