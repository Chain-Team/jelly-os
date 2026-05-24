#!/usr/bin/env bash
# JellyOS setup script — installs Pi, deps, runs wizard
set -e

GREEN='\033[0;32m'; GOLD='\033[0;33m'; RED='\033[0;31m'; GRAY='\033[0;37m'; BOLD='\033[1m'; NC='\033[0m'

echo ""
echo -e "${GOLD}${BOLD}  🪼  JellyOS Setup${NC}"
echo ""

# Check Node.js
command -v node &>/dev/null || { echo -e "${RED}  ✗ Node.js 20+ required: https://nodejs.org${NC}"; exit 1; }
NODE_VER=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
[ "$NODE_VER" -ge 20 ] || { echo -e "${RED}  ✗ Node.js 20+ required. Found: $(node --version)${NC}"; exit 1; }
echo -e "${GREEN}  ✓ Node.js $(node --version)${NC}"

# Install Pi CLI if missing
if ! command -v pi &>/dev/null; then
  echo ""
  echo -e "${GRAY}  Installing Pi CLI...${NC}"
  npm install -g @earendil-works/pi-coding-agent
  echo -e "${GREEN}  ✓ Pi installed${NC}"
else
  echo -e "${GREEN}  ✓ Pi $(pi --version 2>/dev/null || echo '?')${NC}"
fi

# Install JellyOS dependencies
echo ""
echo -e "${GRAY}  Installing dependencies...${NC}"
npm install
echo -e "${GREEN}  ✓ Dependencies installed${NC}"

# Make bin executable
chmod +x bin/jellyos

# Optionally link globally
npm link 2>/dev/null && echo -e "${GREEN}  ✓ 'jellyos' linked globally${NC}" || true

# Run setup wizard
echo ""
node bin/jellyos setup

echo ""
echo -e "${GOLD}${BOLD}  ══ Setup complete ════════════════════════${NC}"
echo -e "  Run: ${BOLD}jellyos${NC}"
echo ""
