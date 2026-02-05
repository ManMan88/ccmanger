#!/bin/bash
# Production startup script for Claude Manager
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Set production environment
export NODE_ENV=production

echo "============================================"
echo "Starting Claude Manager (Production)"
echo "============================================"
echo ""

# Check if production build exists
if [ ! -d "dist" ]; then
  echo "Error: Frontend build not found (dist/)"
  echo "Run './scripts/build.sh' first."
  exit 1
fi

if [ ! -d "server/dist" ]; then
  echo "Error: Backend build not found (server/dist/)"
  echo "Run './scripts/build.sh' first."
  exit 1
fi

# Check for required environment variables
if [ -z "$PORT" ]; then
  export PORT=3001
fi

echo "Configuration:"
echo "  Port: $PORT"
echo "  Environment: $NODE_ENV"
echo "  Data directory: ${DATA_DIR:-~/.claude-manager}"
echo ""

# Start the server
echo "Starting server..."
exec node server/dist/index.js
