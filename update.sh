#!/usr/bin/env bash
#
# Pulls the latest code, reinstalls dependencies, and restarts the service.
# Run from the repo directory as root (or via sudo): sudo ./update.sh

set -euo pipefail

C_RESET='\033[0m'; C_GREEN='\033[32m'; C_BLUE='\033[36m'
info() { echo -e "${C_BLUE}==>${C_RESET} $*"; }
ok()   { echo -e "${C_GREEN}✓${C_RESET} $*"; }

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_USER="modbot"
SERVICE_NAME="modbot"

if [[ $EUID -ne 0 ]]; then
  echo "Please run this as root: sudo ./update.sh" >&2
  exit 1
fi

cd "$APP_DIR"

info "Pulling latest code"
sudo -u "$SERVICE_USER" git pull --ff-only

info "Installing dependencies"
npm install --omit=dev
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"

info "Re-registering slash commands (in case any changed)"
sudo -u "$SERVICE_USER" node src/bot/deploy-commands.js || echo "Slash command registration failed — check .env"

info "Restarting service"
systemctl restart "$SERVICE_NAME"
sleep 2

if systemctl is-active --quiet "$SERVICE_NAME"; then
  ok "Update complete — $SERVICE_NAME is running"
else
  echo "Service failed to start — check: journalctl -u $SERVICE_NAME -n 50 --no-pager" >&2
  exit 1
fi
