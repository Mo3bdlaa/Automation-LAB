#!/usr/bin/env bash
# Assembles and starts the production build for local verification.
# Usage: scripts/serve-prod.sh [port]
set -euo pipefail
PORT="${1:-3000}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Free the port first: a stale server silently serves an old build otherwise.
# Match on the port, not the command line, so a renamed or detached process is
# still cleared, and wait until the socket is actually released.
for _ in $(seq 1 20); do
  pids=$(ss -lptnH "sport = :$PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)
  [ -z "$pids" ] && break
  for pid in $pids; do kill -9 "$pid" 2>/dev/null || true; done
  sleep 1
done
if ss -lptnH "sport = :$PORT" 2>/dev/null | grep -q .; then echo "port $PORT is still held" >&2; exit 1; fi

cp -r public .next/standalone/ 2>/dev/null || true
cp -r .next/static .next/standalone/.next/
cp -r templates config .next/standalone/
: > .data/prod.log
PORT="$PORT" NODE_ENV=production \
  ALLOW_LOCAL_IDENTITY_IN_PROD=1 \
  SESSION_SECRET="${SESSION_SECRET:-dev-secret-for-local-verification-only}" \
  DATABASE_URL="${DATABASE_URL:-postgres://automationlab:automationlab@127.0.0.1:5432/automationlab}" \
  BLOB_LOCAL_DIR="${BLOB_LOCAL_DIR:-$ROOT/.data/blobs}" \
  CHROMIUM_EXECUTABLE_PATH="${CHROMIUM_EXECUTABLE_PATH:-/opt/pw-browsers/chromium}" \
  nohup node .next/standalone/server.js > .data/prod.log 2>&1 &

for _ in $(seq 1 40); do
  if curl -s -o /dev/null -m 2 "http://localhost:$PORT/api/health"; then break; fi
  sleep 1
done
if grep -q EADDRINUSE .data/prod.log; then echo "port $PORT still in use" >&2; exit 1; fi
echo "production server ready on $PORT"
