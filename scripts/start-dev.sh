#!/bin/bash
# Development startup script for Claude Manager
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Cleanup function
cleanup() {
  echo ""
  echo "Shutting down..."
  if [ -n "$BACKEND_PID" ]; then
    kill $BACKEND_PID 2>/dev/null || true
    wait $BACKEND_PID 2>/dev/null || true
  fi
  exit 0
}

trap cleanup SIGINT SIGTERM

echo "============================================"
echo "Starting Claude Manager (Development)"
echo "============================================"
echo ""

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  pnpm install
  echo ""
fi

# Start backend in background
echo "Starting backend server on http://localhost:3001..."
pnpm --filter @claude-manager/server dev &
BACKEND_PID=$!

# Wait for backend to be ready
echo "Waiting for backend to be ready..."
MAX_WAIT=30
WAITED=0
while ! curl -s http://localhost:3001/api/health > /dev/null 2>&1; do
  sleep 1
  WAITED=$((WAITED + 1))
  if [ $WAITED -ge $MAX_WAIT ]; then
    echo "Error: Backend failed to start within ${MAX_WAIT}s"
    cleanup
    exit 1
  fi
done
echo "Backend ready!"
echo ""

# Start frontend
echo "Starting frontend on http://localhost:8080..."
echo ""
pnpm dev

# Wait for cleanup
wait
