#!/bin/bash
# Setup log rotation for Claude Manager
# Run with sudo: sudo ./scripts/setup-logrotate.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Detect current user (even when running as sudo)
if [ -n "$SUDO_USER" ]; then
  USER_NAME="$SUDO_USER"
else
  USER_NAME="$(whoami)"
fi

USER_HOME=$(eval echo "~$USER_NAME")
LOG_DIR="$USER_HOME/.claude-manager/logs"

echo "============================================"
echo "Setting up log rotation for Claude Manager"
echo "============================================"
echo ""
echo "User: $USER_NAME"
echo "Log directory: $LOG_DIR"
echo ""

# Check if running as root (needed for /etc/logrotate.d)
if [ "$EUID" -ne 0 ]; then
  echo "This script needs root privileges to install logrotate configuration."
  echo "Please run with: sudo $0"
  exit 1
fi

# Check if logrotate is installed
if ! command -v logrotate &> /dev/null; then
  echo "logrotate is not installed. Installing..."
  if command -v apt-get &> /dev/null; then
    apt-get update && apt-get install -y logrotate
  elif command -v yum &> /dev/null; then
    yum install -y logrotate
  elif command -v brew &> /dev/null; then
    brew install logrotate
  else
    echo "Could not install logrotate. Please install it manually."
    exit 1
  fi
fi

# Create logrotate configuration
cat > /etc/logrotate.d/claude-manager << EOF
# Log rotation configuration for Claude Manager
# Rotates daily, keeps 7 days, compresses old logs

$LOG_DIR/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0640 $USER_NAME $USER_NAME
    dateext
    dateformat -%Y%m%d
    postrotate
        # Reload PM2 logs if PM2 is managing the process
        if command -v pm2 &> /dev/null && pm2 list | grep -q claude-manager; then
            pm2 reloadLogs 2>/dev/null || true
        fi
    endscript
}
EOF

echo "Logrotate configuration installed at /etc/logrotate.d/claude-manager"
echo ""

# Create log directory if it doesn't exist
if [ ! -d "$LOG_DIR" ]; then
  mkdir -p "$LOG_DIR"
  chown "$USER_NAME:$USER_NAME" "$LOG_DIR"
  echo "Created log directory: $LOG_DIR"
fi

# Test logrotate configuration
echo "Testing logrotate configuration..."
logrotate -d /etc/logrotate.d/claude-manager 2>&1 | head -20

echo ""
echo "============================================"
echo "Log rotation setup complete!"
echo "============================================"
echo ""
echo "Configuration:"
echo "  - Rotates daily"
echo "  - Keeps 7 days of logs"
echo "  - Compresses old logs"
echo ""
echo "Manual rotation: sudo logrotate -f /etc/logrotate.d/claude-manager"
