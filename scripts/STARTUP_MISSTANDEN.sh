#!/usr/bin/env bash
# NedZink Incident Portal - Dev Startup Script
# - Starts: PHP built-in server, SLA monitor, Vite dev server
# - Handles: missing dirs, port conflicts, stale processes, clean shutdown, helpful health checks
# - Works when script lives in ./scripts (auto-resolves project root)

set -Eeuo pipefail

echo "================================================"
echo "Starting NedZink Incident Portal - Dev Mode"
echo "================================================"
echo ""

# -----------------------------
# Paths
# -----------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PUBLIC_DIR="$ROOT_DIR/public"
API_DIR="$PUBLIC_DIR/api"

# -----------------------------
# Defaults (override with env)
# -----------------------------
PHP_HOST="${PHP_HOST:-127.0.0.1}"
PHP_PORT="${PHP_PORT:-8081}"
VITE_PORT="${VITE_PORT:-3000}"

PHP_LOG="${PHP_LOG:-$ROOT_DIR/php-server.log}"
SLA_LOG="${SLA_LOG:-$ROOT_DIR/sla-monitor.log}"

# SLA monitor file candidates (support different layouts)
SLA_CANDIDATES=(
  "$API_DIR/sla_monitor.php"
  "$API_DIR/sla-monitor.php"
  "$PUBLIC_DIR/api/sla_monitor.php"
)

# -----------------------------
# Colors
# -----------------------------
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# -----------------------------
# Helpers
# -----------------------------
die() { echo -e "${RED}❌ $*${NC}"; exit 1; }
warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }
info() { echo -e "${BLUE}$*${NC}"; }
ok() { echo -e "${GREEN}✅ $*${NC}"; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is not installed or not on PATH"
}

port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  elif command -v ss >/dev/null 2>&1; then
    ss -ltn | awk '{print $4}' | grep -q ":$port$"
  else
    # fallback: cannot reliably check
    return 1
  fi
}

pids_on_port() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true
  else
    echo ""
  fi
}

kill_pids() {
  local pids="$1"
  [ -z "${pids// /}" ] && return 0
  # shellcheck disable=SC2086
  kill $pids >/dev/null 2>&1 || true
}

wait_for_http() {
  local url="$1"
  local tries="${2:-30}"
  local sleep_s="${3:-0.2}"

  if ! command -v curl >/dev/null 2>&1; then
    # Can't probe; best-effort
    return 0
  fi

  for _ in $(seq 1 "$tries"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$sleep_s"
  done
  return 1
}

# -----------------------------
# Cleanup / traps
# -----------------------------
PHP_PID=""
SLA_PID=""
VITE_PID=""

cleanup() {
  echo ""
  info "Stopping servers..."

  # Try graceful stop
  [ -n "$VITE_PID" ] && kill "$VITE_PID" >/dev/null 2>&1 || true
  [ -n "$SLA_PID" ] && kill "$SLA_PID" >/dev/null 2>&1 || true
  [ -n "$PHP_PID" ] && kill "$PHP_PID" >/dev/null 2>&1 || true

  # Best-effort: stop anything still listening on PHP port
  local still
  still="$(pids_on_port "$PHP_PORT" || true)"
  [ -n "${still// /}" ] && kill_pids "$still"

  ok "Stopped."
}

on_error() {
  local exit_code=$?
  echo ""
  warn "Startup failed (exit code: $exit_code)."

  if [ -f "$PHP_LOG" ]; then
    warn "Last PHP log lines:"
    tail -n 30 "$PHP_LOG" || true
  fi
  if [ -f "$SLA_LOG" ]; then
    warn "Last SLA log lines:"
    tail -n 30 "$SLA_LOG" || true
  fi

  cleanup
  exit "$exit_code"
}

trap cleanup SIGINT SIGTERM
trap on_error ERR

# -----------------------------
# Preconditions
# -----------------------------
[ -d "$PUBLIC_DIR" ] || die "Could not find public/ at: $PUBLIC_DIR (wrong repo?)"
[ -d "$API_DIR" ] || warn "Could not find api/ at: $API_DIR (SLA monitor/mail endpoints might be missing)"

need_cmd php
need_cmd node
need_cmd npm

# Optional but helpful
if ! command -v curl >/dev/null 2>&1; then
  warn "curl not found; skipping HTTP readiness checks."
fi

# -----------------------------
# Resolve SLA monitor path
# -----------------------------
SLA_FILE=""
for f in "${SLA_CANDIDATES[@]}"; do
  if [ -f "$f" ]; then
    SLA_FILE="$f"
    break
  fi
done

if [ -z "$SLA_FILE" ]; then
  warn "SLA monitor script not found. Looked for:"
  for f in "${SLA_CANDIDATES[@]}"; do echo "   - $f"; done
  warn "SLA monitor will not be started."
fi

# -----------------------------
# Handle port conflicts
# -----------------------------
if port_in_use "$PHP_PORT"; then
  warn "Port $PHP_PORT already in use."
  pids="$(pids_on_port "$PHP_PORT")"
  if [ -n "${pids// /}" ]; then
    warn "Killing processes on port $PHP_PORT: $pids"
    kill_pids "$pids"
    sleep 0.4
  else
    warn "Could not determine PID(s) using port $PHP_PORT."
    warn "Set a different port: PHP_PORT=8082 ./STARTUP_MISSTANDEN.sh"
  fi
fi

# -----------------------------
# Start PHP server
# -----------------------------
info "Starting PHP server on http://$PHP_HOST:$PHP_PORT ..."
: > "$PHP_LOG" || true

# Ensure we start from public/ so routes like /api/mail.api.php resolve
(
  cd "$PUBLIC_DIR"
  php -S "$PHP_HOST:$PHP_PORT" > "$PHP_LOG" 2>&1
) &
PHP_PID=$!

sleep 0.25
kill -0 "$PHP_PID" >/dev/null 2>&1 || die "PHP server failed to start. Check: $PHP_LOG"

# Optionally verify mail api file exists
if [ ! -f "$API_DIR/mail.api.php" ]; then
  warn "Mail API not found at: $API_DIR/mail.api.php"
  warn "If your frontend calls /api/mail.api.php you'll get 404/500."
fi

# -----------------------------
# Start SLA monitor
# -----------------------------
if [ -n "$SLA_FILE" ]; then
  info "Starting SLA Monitor service..."
  : > "$SLA_LOG" || true
  php "$SLA_FILE" > "$SLA_LOG" 2>&1 &
  SLA_PID=$!

  sleep 0.25
  if kill -0 "$SLA_PID" >/dev/null 2>&1; then
    ok "SLA Monitor running (PID: $SLA_PID)"
  else
    warn "SLA Monitor failed to start. Check: $SLA_LOG"
    SLA_PID=""
  fi
fi

# -----------------------------
# PHP readiness check
# -----------------------------
if command -v curl >/dev/null 2>&1; then
  # Hitting /api/mail.api.php with GET will return 405, but should be reachable.
  # We'll accept any HTTP response (including 405) as "reachable":
  PHP_REACH_URL="http://$PHP_HOST:$PHP_PORT/api/mail.api.php"
  if curl -sS -o /dev/null -D - "$PHP_REACH_URL" >/dev/null 2>&1; then
    ok "PHP server reachable (Mail API route responds)"
  else
    warn "PHP server not reachable via curl: $PHP_REACH_URL"
    warn "If Vite proxy shows ECONNREFUSED, check host/port and firewall."
  fi
fi

ok "PHP server running"
echo -e "${GREEN}   Base URL: http://$PHP_HOST:$PHP_PORT${NC}"
echo -e "${GREEN}   Mail API: http://$PHP_HOST:$PHP_PORT/api/mail.api.php${NC}"
echo ""

# -----------------------------
# Start Vite
# -----------------------------
info "Starting Vite dev server..."
(
  cd "$ROOT_DIR"
  # Prefer npm run dev if it exists, otherwise npm start
  if npm run | grep -qE '^\s*dev\b'; then
    npm run dev
  else
    npm start
  fi
) &
VITE_PID=$!

sleep 0.25
kill -0 "$VITE_PID" >/dev/null 2>&1 || die "Vite failed to start."

# -----------------------------
# Nice output
# -----------------------------
echo ""
echo "================================================"
ok "Development servers started!"
echo "================================================"
echo ""
echo "  🌐 Frontend: http://localhost:$VITE_PORT"
echo "  📧 Mail API: http://$PHP_HOST:$PHP_PORT/api/mail.api.php"
[ -n "$SLA_PID" ] && echo "  ⏰ SLA Monitor: Running" || echo "  ⏰ SLA Monitor: Not running"
echo ""
echo "  📝 Logs:"
echo "     PHP: tail -f \"$PHP_LOG\""
[ -n "$SLA_FILE" ] && echo "     SLA: tail -f \"$SLA_LOG\""
echo ""
echo "Tips:"
echo "  • Override ports: PHP_PORT=8082 VITE_PORT=3001 ./STARTUP_MISSTANDEN.sh"
echo "  • Debug mail API: curl -i \"http://$PHP_HOST:$PHP_PORT/api/mail.api.php?debug=1\""
echo ""
echo "Press Ctrl+C to stop all servers"
echo "================================================"
echo ""

# Wait for child processes
wait