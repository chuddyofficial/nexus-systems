#!/usr/bin/env bash
#
# Nexus Systems installer — provisions a fresh Ubuntu LTS VPS (22.04, 24.04,
# 26.04, ...) to run this bot + dashboard behind nginx with a free Let's
# Encrypt SSL certificate, backed by a dedicated local MySQL database.
#
# Usage: run this from inside the cloned repo, as root (or via sudo):
#   sudo ./install.sh
#
# Safe to re-run: it detects what's already installed/configured and skips
# or updates it rather than failing.

set -euo pipefail

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
C_RESET='\033[0m'; C_BOLD='\033[1m'; C_GREEN='\033[32m'; C_YELLOW='\033[33m'; C_RED='\033[31m'; C_BLUE='\033[36m'
info()  { echo -e "${C_BLUE}==>${C_RESET} $*"; }
ok()    { echo -e "${C_GREEN}✓${C_RESET} $*"; }
warn()  { echo -e "${C_YELLOW}!${C_RESET} $*"; }
fail()  { echo -e "${C_RED}✗ $*${C_RESET}" >&2; exit 1; }
section() { echo -e "\n${C_BOLD}${C_BLUE}== $* ==${C_RESET}"; }

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_USER="nexus"
SERVICE_NAME="nexus"
NODE_MAJOR="24"
ENV_FILE="$APP_DIR/.env"
DB_NAME="nexus_systems"
DB_USER="nexus"

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
section "Preflight checks"

if [[ $EUID -ne 0 ]]; then
  fail "Please run this as root: sudo ./install.sh"
fi

# The app runs as an unprivileged "nexus" service user, which can never
# traverse into /root (mode 700, root-only) no matter how the files inside
# are chowned. Cloning into /root (the natural default when logged in as
# root) silently breaks the systemd service and command registration deep
# into the run — so catch it up front and relocate automatically instead.
if [[ "$APP_DIR" == "/root" || "$APP_DIR" == /root/* ]]; then
  NEW_DIR="/opt/$(basename "$APP_DIR")"
  warn "This repo is under /root, which the '$SERVICE_USER' service user can never access."
  if [[ -e "$NEW_DIR" ]]; then
    fail "Move this repo out of /root yourself ($NEW_DIR already exists) — e.g. 'rm -rf $NEW_DIR && mv \"$APP_DIR\" \"$NEW_DIR\"' — then re-run ./install.sh from $NEW_DIR."
  fi
  info "Relocating to $NEW_DIR and continuing from there..."
  mv "$APP_DIR" "$NEW_DIR"
  cd "$NEW_DIR"
  exec "$NEW_DIR/install.sh" "$@"
fi

if [[ -f /etc/os-release ]]; then
  . /etc/os-release
  case "${ID:-}:${VERSION_ID:-}" in
    ubuntu:22.04|ubuntu:24.04|ubuntu:26.04)
      ok "Detected ${PRETTY_NAME}"
      ;;
    ubuntu:*)
      warn "Detected ${PRETTY_NAME} — not explicitly tested, but should work fine on any modern Ubuntu LTS. Continuing."
      ;;
    *)
      warn "This installer targets Ubuntu. Detected: ${PRETTY_NAME:-unknown}. Continuing anyway."
      ;;
  esac
fi

ok "App directory: $APP_DIR"

# ---------------------------------------------------------------------------
# Swap file (2GB RAM VPS benefits from headroom during npm install / apt / MySQL)
# ---------------------------------------------------------------------------
section "Checking memory / swap"

TOTAL_MEM_KB=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
TOTAL_MEM_MB=$((TOTAL_MEM_KB / 1024))
info "Detected ${TOTAL_MEM_MB}MB RAM"

if [[ $TOTAL_MEM_MB -lt 4096 ]] && ! swapon --show | grep -q .; then
  info "Low-memory VPS with no swap detected — creating a 2GB swap file for stability"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
  ok "2GB swap file created and enabled"
else
  ok "Swap already present or not needed"
fi

# ---------------------------------------------------------------------------
# System packages
# ---------------------------------------------------------------------------
section "Installing system packages"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git ufw nginx certbot python3-certbot-nginx ca-certificates gnupg dnsutils
ok "System packages installed"

# ---------------------------------------------------------------------------
# MySQL Server
# ---------------------------------------------------------------------------
section "Installing MySQL"

if command -v mysql >/dev/null 2>&1; then
  ok "MySQL already installed: $(mysql --version)"
else
  apt-get install -y mysql-server
  systemctl enable mysql
  systemctl start mysql
  ok "Installed MySQL: $(mysql --version)"
fi

systemctl is-active --quiet mysql || fail "MySQL did not start — check: journalctl -u mysql -n 50 --no-pager"

# Reuse a previously generated DB password across re-runs so we don't
# desync the app's .env from the actual MySQL user password.
existing_env_value() {
  local key="$1"
  if [[ -f "$ENV_FILE" ]]; then
    grep -E "^${key}=" "$ENV_FILE" | head -n1 | cut -d'=' -f2- || true
  fi
}
DB_PASSWORD="$(existing_env_value DB_PASSWORD)"
if [[ -z "$DB_PASSWORD" ]]; then
  DB_PASSWORD="$(openssl rand -hex 24)"
fi

# Root on a fresh `apt install mysql-server` uses unix socket auth, so `mysql`
# run as root needs no password. Provisioning is fully idempotent.
mysql --protocol=socket -u root <<SQL
CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

ok "Database '${DB_NAME}' and user '${DB_USER}'@'localhost' ready"

# ---------------------------------------------------------------------------
# Node.js
# ---------------------------------------------------------------------------
section "Installing Node.js ${NODE_MAJOR}.x"

if command -v node >/dev/null 2>&1 && [[ "$(node -v | sed -E 's/^v([0-9]+).*/\1/')" -ge "$NODE_MAJOR" ]]; then
  ok "Node.js already installed: $(node -v)"
else
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
  ok "Installed Node.js: $(node -v)"
fi

# ---------------------------------------------------------------------------
# Service user
# ---------------------------------------------------------------------------
section "Setting up service user"

if id "$SERVICE_USER" >/dev/null 2>&1; then
  ok "User '$SERVICE_USER' already exists"
else
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
  ok "Created system user '$SERVICE_USER'"
fi

# ---------------------------------------------------------------------------
# App configuration (.env)
# ---------------------------------------------------------------------------
section "Configuring the bot (.env)"

prompt_with_default() {
  local prompt="$1" default="$2" input
  read -rp "$prompt${default:+ [$default]}: " input || true
  echo "${input:-$default}"
}

prompt_secret() {
  local prompt="$1" default="$2" input
  if [[ -n "$default" ]]; then
    read -rsp "$prompt [hidden, keep existing value, blank = keep]: " input || true
    echo >&2
    echo "${input:-$default}"
  else
    read -rsp "$prompt [hidden]: " input || true
    echo >&2
    echo "$input"
  fi
}

EXISTING_TOKEN="$(existing_env_value DISCORD_TOKEN)"
EXISTING_CLIENT_ID="$(existing_env_value CLIENT_ID)"
EXISTING_CLIENT_SECRET="$(existing_env_value CLIENT_SECRET)"
EXISTING_DOMAIN=""
if [[ -f "$ENV_FILE" ]]; then
  EXISTING_DASHBOARD_URL="$(existing_env_value DASHBOARD_URL)"
  EXISTING_DOMAIN="${EXISTING_DASHBOARD_URL#https://}"
  EXISTING_DOMAIN="${EXISTING_DOMAIN#http://}"
fi
EXISTING_SESSION_SECRET="$(existing_env_value SESSION_SECRET)"
EXISTING_DEV_GUILD="$(existing_env_value DEV_GUILD_ID)"

echo "Enter your Discord application credentials (from https://discord.com/developers/applications)."
echo "Leave a field blank to keep its current value from .env, if one exists."
echo

DISCORD_TOKEN="$(prompt_secret 'Bot Token' "$EXISTING_TOKEN")"
CLIENT_ID="$(prompt_with_default 'Client ID' "$EXISTING_CLIENT_ID")"
CLIENT_SECRET="$(prompt_secret 'Client Secret' "$EXISTING_CLIENT_SECRET")"
DEV_GUILD_ID="$(prompt_with_default 'Dev Guild ID (optional, blank = global commands)' "$EXISTING_DEV_GUILD")"

[[ -n "$DISCORD_TOKEN" ]] || fail "A bot token is required."
[[ -n "$CLIENT_ID" ]] || fail "A client ID is required."
[[ -n "$CLIENT_SECRET" ]] || fail "A client secret is required."

echo
DOMAIN="$(prompt_with_default 'Domain that points at this VPS (e.g. bot.example.com)' "$EXISTING_DOMAIN")"
[[ -n "$DOMAIN" ]] || fail "A domain is required to configure nginx + SSL."

LE_EMAIL="$(prompt_with_default 'Email for SSL certificate renewal notices' "")"
[[ -n "$LE_EMAIL" ]] || fail "An email is required for the SSL certificate."

SESSION_SECRET="${EXISTING_SESSION_SECRET:-$(openssl rand -hex 32)}"

cat > "$ENV_FILE" <<EOF
DISCORD_TOKEN=${DISCORD_TOKEN}
CLIENT_ID=${CLIENT_ID}
CLIENT_SECRET=${CLIENT_SECRET}
DEV_GUILD_ID=${DEV_GUILD_ID}

PORT=3000
NODE_ENV=production
DASHBOARD_URL=https://${DOMAIN}
CALLBACK_URL=https://${DOMAIN}/auth/discord/callback
SESSION_SECRET=${SESSION_SECRET}

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=${DB_NAME}
EOF

# .env holds live secrets (bot token, client secret, DB password, session
# secret) — keep it unreadable to anyone but the service user and root.
chmod 600 "$ENV_FILE"

ok ".env written (permissions restricted to owner)"

# ---------------------------------------------------------------------------
# Install dependencies
# ---------------------------------------------------------------------------
section "Installing npm dependencies"

cd "$APP_DIR"
npm install --omit=dev
ok "Dependencies installed"

chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
ok "Ownership set to $SERVICE_USER"

# ---------------------------------------------------------------------------
# Register slash commands
# ---------------------------------------------------------------------------
section "Registering Discord slash commands"

if sudo -u "$SERVICE_USER" node src/bot/deploy-commands.js; then
  ok "Slash commands registered"
else
  warn "Slash command registration failed — double check DISCORD_TOKEN/CLIENT_ID, then re-run: node src/bot/deploy-commands.js"
fi

# ---------------------------------------------------------------------------
# systemd service
# ---------------------------------------------------------------------------
section "Creating systemd service"

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

# Light sandboxing — the service only needs to read/write its own directory.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=${APP_DIR}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"
sleep 3

if systemctl is-active --quiet "$SERVICE_NAME"; then
  ok "$SERVICE_NAME service is running"
else
  warn "$SERVICE_NAME did not start — check: journalctl -u $SERVICE_NAME -n 50 --no-pager"
fi

# ---------------------------------------------------------------------------
# Firewall
# ---------------------------------------------------------------------------
section "Configuring firewall (ufw)"

ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
if ufw status | grep -q "Status: active"; then
  ok "ufw already active"
else
  ufw --force enable >/dev/null
  ok "ufw enabled"
fi

# ---------------------------------------------------------------------------
# nginx reverse proxy
# ---------------------------------------------------------------------------
section "Configuring nginx"

cat > "/etc/nginx/sites-available/${SERVICE_NAME}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -sf "/etc/nginx/sites-available/${SERVICE_NAME}" "/etc/nginx/sites-enabled/${SERVICE_NAME}"
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx
ok "nginx configured and reloaded"

# ---------------------------------------------------------------------------
# Domain / DNS check + SSL
# ---------------------------------------------------------------------------
section "Domain & SSL setup"

PUBLIC_IP="$(curl -4 -fsSL https://ifconfig.me || curl -4 -fsSL https://api.ipify.org || echo unknown)"
echo "This VPS's public IPv4 address is: ${C_BOLD}${PUBLIC_IP}${C_RESET}"
echo
echo "Before continuing, make sure your domain's DNS has an A record:"
echo "    ${C_BOLD}${DOMAIN}${C_RESET}  ->  ${C_BOLD}${PUBLIC_IP}${C_RESET}"
echo "(Set this at wherever you registered/manage ${DOMAIN}'s DNS — an A record with"
echo " the hostname pointing at that IP. DNS changes can take a few minutes to an hour.)"
echo

RESOLVED_IP="$(dig +short "$DOMAIN" A | tail -n1 || true)"
if [[ -n "$RESOLVED_IP" && "$RESOLVED_IP" == "$PUBLIC_IP" ]]; then
  ok "DNS already resolves ${DOMAIN} -> ${PUBLIC_IP}"
elif [[ -n "$RESOLVED_IP" ]]; then
  warn "${DOMAIN} currently resolves to ${RESOLVED_IP}, not this server (${PUBLIC_IP})."
  warn "SSL setup will likely fail until DNS is updated and has propagated."
else
  warn "${DOMAIN} does not resolve yet. SSL setup will likely fail until DNS propagates."
fi

read -rp "Press Enter once DNS is pointing at this server (or Ctrl+C to stop and run this later)..." || true

if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$LE_EMAIL" --redirect; then
  ok "SSL certificate installed — https://${DOMAIN} is live"
else
  warn "Certbot failed (often just DNS not propagated yet). Once DNS is correct, re-run:"
  warn "    sudo certbot --nginx -d ${DOMAIN}"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
section "Done"

echo -e "${C_GREEN}${C_BOLD}Nexus Systems is installed.${C_RESET}"
echo
echo "Dashboard:      https://${DOMAIN}"
echo "Database:       MySQL, database '${DB_NAME}', local-only (not exposed to the internet)"
echo "Service status: systemctl status ${SERVICE_NAME}"
echo "Live logs:      journalctl -u ${SERVICE_NAME} -f"
echo "Restart:        sudo systemctl restart ${SERVICE_NAME}"
echo "Update later:   sudo ./update.sh"
echo
echo -e "${C_YELLOW}One more manual step:${C_RESET} in the Discord Developer Portal"
echo "(https://discord.com/developers/applications -> your app -> OAuth2 -> General),"
echo "add this exact redirect URI, then Save Changes:"
echo "    https://${DOMAIN}/auth/discord/callback"
echo
echo "Also confirm under the Bot tab that SERVER MEMBERS INTENT and MESSAGE CONTENT"
echo "INTENT are both enabled — they're required for moderation, welcome messages,"
echo "and AutoMod to work."
