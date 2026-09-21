#!/usr/bin/env bash
# One-shot EC2 setup for Guess The Song (Ubuntu 22.04 / 24.04).
#
# Usage:
#   cd ~/guess-the-song
#   bash deploy/setup.sh
#
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_USER="${SUDO_USER:-$USER}"
PORT="${PORT:-3001}"
NODE_MAJOR="${NODE_MAJOR:-20}"

echo "== Guess The Song - EC2 setup =="
echo "   app dir : $APP_DIR"
echo "   run user: $RUN_USER"
echo "   port    : $PORT"
echo

if [ ! -f "$APP_DIR/package.json" ]; then
  echo "!! package.json not found in $APP_DIR - run this from the project root."
  exit 1
fi

echo "==> [1/5] Installing Node.js $NODE_MAJOR and nginx"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo apt-get install -y nginx

echo "==> [2/5] Installing dependencies"
cd "$APP_DIR"
npm run install:all

echo "==> [3/5] Building the client"
npm run build

if [ ! -f "$APP_DIR/client/dist/index.html" ]; then
  echo "!! client build failed (client/dist/index.html missing)"
  exit 1
fi

echo "==> [4/5] Installing systemd service"
NODE_BIN="$(command -v node)"
sudo tee /etc/systemd/system/songguess.service >/dev/null <<EOF
[Unit]
Description=Guess The Song (Node + Socket.io)
After=network.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$APP_DIR/server
Environment=NODE_ENV=production
Environment=PORT=$PORT
ExecStart=$NODE_BIN index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable songguess
sudo systemctl restart songguess

echo "==> [5/5] Configuring nginx"
sudo cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/songguess
sudo ln -sf /etc/nginx/sites-available/songguess /etc/nginx/sites-enabled/songguess
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

sleep 2
echo
echo "== Health check =="
if curl -fsS "http://127.0.0.1/api/health" >/dev/null; then
  echo "   OK  server is up"
else
  echo "   FAIL server did not answer - check: sudo journalctl -u songguess -n 50"
fi

PUBLIC_IP="$(curl -fsS --max-time 3 https://checkip.amazonaws.com 2>/dev/null | tr -d '\n' || echo '<your-ec2-ip>')"
echo
echo "Open:  http://${PUBLIC_IP}/"
echo
echo "Useful commands:"
echo "   sudo systemctl status songguess      # is it running?"
echo "   sudo journalctl -u songguess -f      # live logs"
echo "   sudo systemctl restart songguess     # restart after code changes"
