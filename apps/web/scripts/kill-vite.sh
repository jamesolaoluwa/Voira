#!/usr/bin/env bash
# Safe helper to kill lingering vite/node dev processes and clear Vite cache.
# Compatible with macOS and Linux.

set -eu

echo "[dev-clean] Finding node/vite listeners..."
# List PIDs listening on TCP and matching 'node' or 'vite'
PIDS="$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk '/node|vite/{print $2}' | sort -u | tr '\n' ' ')" || true

if [ -n "$PIDS" ]; then
  echo "[dev-clean] Killing PIDs: $PIDS"
  # kill gracefully first, then force if needed
  kill $PIDS 2>/dev/null || true
  sleep 0.25
  # ensure termination
  PIDS_REMAINING="$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk '/node|vite/{print $2}' | sort -u | tr '\n' ' ')" || true
  if [ -n "$PIDS_REMAINING" ]; then
    echo "[dev-clean] Forcing kill for: $PIDS_REMAINING"
    kill -9 $PIDS_REMAINING 2>/dev/null || true
  fi
else
  echo "[dev-clean] No node/vite listeners found."
fi

# Clear Vite cache only (do not delete node_modules)
if [ -d "node_modules/.vite" ]; then
  echo "[dev-clean] Clearing Vite cache: node_modules/.vite"
  rm -rf node_modules/.vite
else
  echo "[dev-clean] No Vite cache present."
fi

echo "[dev-clean] Done."
