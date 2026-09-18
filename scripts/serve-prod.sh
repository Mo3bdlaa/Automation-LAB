#!/usr/bin/env bash
# Assembles and starts the production build for local verification.
# Usage: scripts/serve-prod.sh [port]
set -euo pipefail
PORT="${1:-3000}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Free the port first: a stale server silently serves an old build otherwise.
#
# Match on the port, not the command line — Next renames its process to
# "next-server (v16.3.4)", so grepping for server.js finds nothing while the
# old build is still listening, its cwd pointing at a .next/standalone that
# the rebuild has already deleted out from under it.
#
# Ask every tool that is installed and take the union, rather than the first
# one that exists. `ss` is absent from some containers; `lsof` is present in
# this one and reports nothing at all for a listening socket it cannot see.
# Either alone returns empty, the "still held?" guard agrees, and the script
# announces a ready server that is the previous build. That is not
# hypothetical — it cost a round of screenshots of a change that was not on
# screen. If none of the three is installed, stop instead of guessing.
if ! command -v ss >/dev/null 2>&1 && ! command -v lsof >/dev/null 2>&1 && ! command -v fuser >/dev/null 2>&1; then
  echo "no way to find what holds port $PORT (need ss, lsof or fuser)" >&2
  exit 1
fi

port_pids() {
  {
    command -v ss >/dev/null 2>&1 &&
      ss -lptnH "sport = :$PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2
    command -v lsof >/dev/null 2>&1 &&
      lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null
    command -v fuser >/dev/null 2>&1 &&
      fuser -n tcp "$PORT" 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$'
  } | sort -u
}

for _ in $(seq 1 20); do
  # `|| true`: every one of these exits non-zero when the port is free, and
  # `set -e` would take that for a failure of the script.
  pids=$(port_pids || true)
  [ -z "$pids" ] && break
  for pid in $pids; do kill -9 "$pid" 2>/dev/null || true; done
  sleep 1
done
if [ -n "$(port_pids || true)" ]; then echo "port $PORT is still held" >&2; exit 1; fi

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
SERVER_PID=$!

# Wait for *our* server, not for any server. Checking only that the port
# answers is how a survivor of the last run gets mistaken for this one.
for _ in $(seq 1 40); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "the server exited during startup; see .data/prod.log" >&2
    tail -5 .data/prod.log >&2
    exit 1
  fi
  if curl -s -o /dev/null -m 2 "http://localhost:$PORT/api/health"; then break; fi
  sleep 1
done
if grep -q EADDRINUSE .data/prod.log; then echo "port $PORT still in use" >&2; exit 1; fi
if ! kill -0 "$SERVER_PID" 2>/dev/null; then echo "the server is not running" >&2; exit 1; fi
echo "production server ready on $PORT (pid $SERVER_PID)"
