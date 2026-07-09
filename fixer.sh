#!/usr/bin/env bash
#
# One-shot, non-interactive fix for deployments that got installed under
# /root (which the "nexus" service user can never access — see install.sh
# for the full explanation). Moves the app to /opt, points the systemd
# service at the new location, and restarts everything. Does NOT touch the
# existing .env — it's already correct from the original install run.
#
# Usage: sudo ./fixer.sh

set -euo pipefail

C_RESET='\033[0m'; C_GREEN='\033[32m'; C_BLUE='\033[36m'; C_RED='\033[31m'
info() { echo -e "${C_BLUE}==>${C_RESET} $*"; }
ok()   { echo -e "${C_GREEN}✓${C_RESET} $*"; }
fail() { echo -e "${C_RED}✗ $*${C_RESET}" >&2; exit 1; }

if [[ $EUID -ne 0 ]]; then
  fail "Run as root: sudo ./fixer.sh"
fi

SERVICE_USER="nexus"
SERVICE_NAME="nexus"
CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$CURRENT_DIR" == "/root" || "$CURRENT_DIR" == /root/* ]]; then
  NEW_DIR="/opt/$(basename "$CURRENT_DIR")"
  if [[ -d "$NEW_DIR" ]]; then
    info "Removing stale $NEW_DIR from a previous attempt..."
    rm -rf "$NEW_DIR"
  fi
  info "Moving $CURRENT_DIR -> $NEW_DIR (the 'nexus' user can never reach anything under /root)"
  mv "$CURRENT_DIR" "$NEW_DIR"
  APP_DIR="$NEW_DIR"
else
  APP_DIR="$CURRENT_DIR"
  info "Already outside /root ($APP_DIR) — no move needed."
fi

cd "$APP_DIR"

id "$SERVICE_USER" &>/dev/null || useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"

info "Fixing ownership..."
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
[[ -f "$APP_DIR/.env" ]] && chmod 600 "$APP_DIR/.env"

info "Rewriting systemd service to point at $APP_DIR..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Nexus Systems Discord bot + dashboard
After=network.target mysql.service
Wants=mysql.service

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
ExecStart=$(command -v node) ${APP_DIR}/src/index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=${APP_DIR}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null
systemctl restart "$SERVICE_NAME"
sleep 3

if systemctl is-active --quiet "$SERVICE_NAME"; then
  ok "$SERVICE_NAME is running from $APP_DIR"
else
  fail "$SERVICE_NAME still not running — run: journalctl -u $SERVICE_NAME -n 50 --no-pager"
fi

info "Re-registering slash commands (harmless if already done)..."
sudo -u "$SERVICE_USER" node src/bot/deploy-commands.js || echo "Slash command registration failed — check .env"

ok "Done. The repo now lives at $APP_DIR — use that path (not /root/...) for any future 'cd' or 'git pull'."
