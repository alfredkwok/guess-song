#!/usr/bin/env bash
# Update the game on EC2: pull the latest code, rebuild, restart.
#
# Usage:
#   cd ~/guess-the-song
#   bash deploy/update.sh
#
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

echo "==> [1/4] Pulling latest code"
git pull --ff-only

echo "==> [2/4] Installing dependencies"
npm run install:all

echo "==> [3/4] Building client"
npm run build

echo "==> [4/4] Restarting service"
sudo systemctl restart songguess

sleep 2
echo
if curl -fsS http://127.0.0.1/api/health >/dev/null; then
  echo "OK  updated and running"
else
  echo "FAIL server is not healthy - check: sudo journalctl -u songguess -n 50"
  exit 1
fi
