#!/usr/bin/env bash
#
# Claude Manager Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/ManMan88/ccmanger/master/scripts/install.sh | bash
#
# Options (via environment variables):
#   INSTALL_DIR   - Installation directory (default: ~/.claude-manager/app)
#   VERSION       - Version to install (default: latest)
#   SKIP_START    - Set to 1 to skip starting the server after install
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO="ManMan88/ccmanger"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.claude-manager/app}"
DATA_DIR="$HOME/.claude-manager"
VERSION="${VERSION:-latest}"
SKIP_START="${SKIP_START:-0}"

# Logging functions
log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    local missing=()

    # Check Node.js
    if ! command -v node &> /dev/null; then
        missing+=("Node.js 20+ (https://nodejs.org/)")
    else
        local node_version
        node_version=$(node -v | sed 's/v//' | cut -d. -f1)
        if [ "$node_version" -lt 20 ]; then
            missing+=("Node.js 20+ (current: $(node -v))")
        fi
    fi

    # Check pnpm
    if ! command -v pnpm &> /dev/null; then
        missing+=("pnpm (npm install -g pnpm)")
    fi

    # Check git
    if ! command -v git &> /dev/null; then
        missing+=("git (https://git-scm.com/)")
    fi

    # Check Claude CLI
    if ! command -v claude &> /dev/null; then
        log_warn "Claude CLI not found. You'll need it to use agents."
        log_warn "Install from: https://docs.anthropic.com/claude-code"
    fi

    if [ ${#missing[@]} -ne 0 ]; then
        log_error "Missing prerequisites:"
        for item in "${missing[@]}"; do
            echo "  - $item"
        done
        exit 1
    fi

    log_success "All prerequisites met"
}

# Get latest release version
get_latest_version() {
    curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/'
}

# Download and extract release
download_release() {
    local version="$1"
    local tarball_url="https://github.com/$REPO/releases/download/$version/claude-manager-${version#v}.tar.gz"
    local temp_dir
    temp_dir=$(mktemp -d)

    log_info "Downloading Claude Manager $version..."

    if ! curl -fsSL "$tarball_url" -o "$temp_dir/release.tar.gz"; then
        log_error "Failed to download release. Check if version $version exists."
        rm -rf "$temp_dir"
        exit 1
    fi

    # Create install directory
    mkdir -p "$INSTALL_DIR"

    # Extract
    log_info "Extracting to $INSTALL_DIR..."
    tar -xzf "$temp_dir/release.tar.gz" -C "$INSTALL_DIR"

    # Cleanup
    rm -rf "$temp_dir"

    log_success "Downloaded and extracted"
}

# Install from git clone (development/advanced)
install_from_source() {
    log_info "Installing from source..."

    # Clone or update repo
    if [ -d "$INSTALL_DIR/.git" ]; then
        log_info "Updating existing installation..."
        cd "$INSTALL_DIR"
        git fetch origin
        if [ "$VERSION" = "latest" ]; then
            git checkout master
            git pull origin master
        else
            git checkout "$VERSION"
        fi
    else
        log_info "Cloning repository..."
        rm -rf "$INSTALL_DIR"
        git clone "https://github.com/$REPO.git" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
        if [ "$VERSION" != "latest" ]; then
            git checkout "$VERSION"
        fi
    fi

    log_success "Source ready"
}

# Install dependencies and build
install_dependencies() {
    log_info "Installing dependencies..."
    cd "$INSTALL_DIR"
    pnpm install --frozen-lockfile
    log_success "Dependencies installed"
}

# Build the application
build_app() {
    log_info "Building application..."
    cd "$INSTALL_DIR"

    # Build shared package first
    pnpm --filter @claude-manager/shared build

    # Build frontend
    pnpm build

    # Build server
    pnpm --filter @claude-manager/server build

    log_success "Build complete"
}

# Create data directories
setup_data_dirs() {
    log_info "Setting up data directories..."
    mkdir -p "$DATA_DIR/logs"
    mkdir -p "$DATA_DIR/backups"
    log_success "Data directories ready"
}

# Create systemd service (optional)
create_systemd_service() {
    local service_file="/etc/systemd/system/claude-manager.service"

    if [ "$EUID" -ne 0 ]; then
        log_warn "Run with sudo to install systemd service"
        return
    fi

    cat > "$service_file" << EOF
[Unit]
Description=Claude Manager
After=network.target

[Service]
Type=simple
User=$SUDO_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node $INSTALL_DIR/server/dist/index.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=DATA_DIR=$DATA_DIR

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    log_success "Systemd service created"
}

# Create shell aliases
create_aliases() {
    local shell_rc=""

    if [ -f "$HOME/.zshrc" ]; then
        shell_rc="$HOME/.zshrc"
    elif [ -f "$HOME/.bashrc" ]; then
        shell_rc="$HOME/.bashrc"
    fi

    if [ -n "$shell_rc" ]; then
        if ! grep -q "claude-manager" "$shell_rc"; then
            cat >> "$shell_rc" << EOF

# Claude Manager
alias cm-start='cd $INSTALL_DIR && ./scripts/start-prod.sh'
alias cm-stop='pm2 stop claude-manager 2>/dev/null || pkill -f "node.*claude-manager"'
alias cm-logs='tail -f $DATA_DIR/logs/out.log'
alias cm-status='curl -s http://localhost:3001/api/health | jq .'
EOF
            log_success "Shell aliases added to $shell_rc"
            log_info "Run 'source $shell_rc' to use aliases"
        fi
    fi
}

# Start the server
start_server() {
    if [ "$SKIP_START" = "1" ]; then
        log_info "Skipping server start (SKIP_START=1)"
        return
    fi

    log_info "Starting Claude Manager..."
    cd "$INSTALL_DIR"

    # Check if PM2 is available
    if command -v pm2 &> /dev/null; then
        pm2 start ecosystem.config.js --env production
        log_success "Started with PM2"
        log_info "View logs: pm2 logs claude-manager"
    else
        # Start directly in background
        NODE_ENV=production nohup node server/dist/index.js > "$DATA_DIR/logs/out.log" 2> "$DATA_DIR/logs/error.log" &
        log_success "Started in background"
        log_info "View logs: tail -f $DATA_DIR/logs/out.log"
    fi
}

# Print completion message
print_completion() {
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Claude Manager installed successfully!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "  Installation directory: $INSTALL_DIR"
    echo "  Data directory: $DATA_DIR"
    echo ""
    echo "  Access the application:"
    echo "    • Frontend: http://localhost:8080"
    echo "    • API: http://localhost:3001"
    echo "    • API Docs: http://localhost:3001/api/docs/ui"
    echo ""
    echo "  Useful commands:"
    echo "    • Start: cd $INSTALL_DIR && ./scripts/start-prod.sh"
    echo "    • Stop: pm2 stop claude-manager (or pkill -f claude-manager)"
    echo "    • Logs: tail -f $DATA_DIR/logs/out.log"
    echo "    • Status: curl http://localhost:3001/api/health"
    echo ""
    if ! command -v claude &> /dev/null; then
        echo -e "  ${YELLOW}⚠ Remember to install Claude CLI to use agents${NC}"
        echo ""
    fi
}

# Main installation flow
main() {
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║           Claude Manager Installer                        ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""

    check_prerequisites

    # Determine version
    if [ "$VERSION" = "latest" ]; then
        VERSION=$(get_latest_version)
        if [ -z "$VERSION" ]; then
            log_warn "Could not fetch latest version, installing from source"
            install_from_source
        else
            log_info "Latest version: $VERSION"
        fi
    fi

    # Try release tarball first, fall back to source
    if [ -n "$VERSION" ] && [ "$VERSION" != "latest" ]; then
        if ! download_release "$VERSION" 2>/dev/null; then
            log_warn "Release tarball not available, installing from source"
            install_from_source
            install_dependencies
            build_app
        else
            # For tarball installs, we still need to install production deps
            cd "$INSTALL_DIR"
            log_info "Installing production dependencies..."

            # Setup shared package (workspace dependency)
            if [ -f "shared-package.json" ]; then
                mkdir -p shared
                mv shared-package.json shared/package.json
                rm -rf shared/dist
                mv shared-dist shared/dist
            fi

            # Setup server package
            if [ -f "server-package.json" ]; then
                mkdir -p server
                mv server-package.json server/package.json
                rm -rf server/dist
                mv server-dist server/dist
            fi

            # Install all workspace dependencies
            pnpm install --prod --frozen-lockfile --ignore-scripts || pnpm install --prod --no-frozen-lockfile --ignore-scripts
        fi
    else
        install_from_source
        install_dependencies
        build_app
    fi

    setup_data_dirs
    create_aliases
    start_server
    print_completion
}

# Run main
main "$@"
