#!/bin/bash
# Production build script for Claude Manager
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "============================================"
echo "Building Claude Manager for production..."
echo "============================================"

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "Error: Node.js 20+ required (found v$(node -v))"
  exit 1
fi

# Install dependencies
echo ""
echo "[1/4] Installing dependencies..."
pnpm install --frozen-lockfile

# Build shared types
echo ""
echo "[2/4] Building shared types..."
pnpm --filter @claude-manager/shared build 2>/dev/null || echo "  (shared package has no build step)"

# Build backend
echo ""
echo "[3/4] Building backend..."
pnpm --filter @claude-manager/server build

# Build frontend
echo ""
echo "[4/4] Building frontend..."
pnpm build

echo ""
echo "============================================"
echo "Build complete!"
echo "============================================"
echo ""
echo "Output directories:"
echo "  Frontend: dist/"
echo "  Backend:  server/dist/"
echo ""
echo "To start in production mode:"
echo "  ./scripts/start-prod.sh"
echo ""
