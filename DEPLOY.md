# Deploying Nexus Systems to your VPS

This walks through getting this repo onto GitHub, then onto your Ubuntu 22.04
VPS, with a real domain, HTTPS, and a dedicated MySQL database.

## 1. Push this repo to GitHub

From this project folder on your Windows machine (a local git repo has
already been initialized for you):

1. Create a new **empty** repository on GitHub: https://github.com/new
   — don't check "Add a README" or ".gitignore" (this repo already has both;
   an empty remote avoids a merge conflict on first push).
2. Copy the repository URL it gives you (looks like
   `https://github.com/<you>/<repo>.git`).
3. Run these commands here:
   ```
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
   GitHub will prompt for authentication on push — if you don't already have
   git credentials configured, GitHub will open a browser login, or you can
   use a [Personal Access Token](https://github.com/settings/tokens) as the
   password when prompted.

Your bot token and `.env` are **not** included (`.gitignore` excludes them) —
only source code goes to GitHub.

## 2. Point your domain at the VPS

In your domain registrar / DNS provider's control panel, add an **A record**:

| Type | Host                      | Value (VPS public IPv4) |
|------|---------------------------|--------------------------|
| A    | `bot` (or `@` for root domain) | `<your VPS IP>`     |

This makes e.g. `bot.yourdomain.com` resolve to your VPS. DNS changes can
take anywhere from a couple of minutes to an hour to propagate. `install.sh`
will check this for you and tell you if it's not ready yet.

## 3. Get onto the VPS and clone the repo

SSH into your VPS (replace with your actual IP/user — most VPS providers
email you root credentials or an SSH key on signup):

```
ssh root@<your-vps-ip>
```

Then clone your repo:

```
git clone https://github.com/<you>/<repo>.git nexus-systems
cd nexus-systems
```

## 4. Run the installer

```
sudo ./install.sh
```

This single script:

- Creates a 2GB swap file if your VPS is low on RAM and doesn't have one
  (recommended for a 2GB droplet/VPS)
- Installs Node.js, **MySQL Server**, nginx, and certbot
- Creates a dedicated MySQL database (`nexus_systems`) and a database user
  scoped to only that database, with a randomly generated password — MySQL
  itself is never exposed to the internet, only reachable from localhost
- Creates a dedicated `nexus` system user to run the bot (not root), and a
  sandboxed systemd service (read-only filesystem access outside its own
  directory)
- Prompts you for your bot token, client ID/secret, and domain — writes
  `.env` with `chmod 600` so only the service user and root can read it
- Installs npm dependencies and registers your slash commands
- Starts a `systemd` service (`nexus`) so the bot auto-restarts on crash or
  VPS reboot, and auto-creates all database tables on first boot
- Configures `ufw` (firewall) to allow SSH + HTTP/HTTPS only
- Configures nginx as a reverse proxy in front of the bot's internal port
- Shows you the VPS's public IP and waits for you to confirm DNS is pointed
  at it, then requests a free Let's Encrypt SSL certificate via certbot and
  enables HTTPS with auto-redirect

It's safe to re-run `sudo ./install.sh` any time — it skips steps that are
already done, reuses the existing database password, and lets you update
values (leave a prompt blank to keep the current value).

## 5. Finish Discord setup

In the [Discord Developer Portal](https://discord.com/developers/applications):

1. Your app → **OAuth2 → General** → add this exact redirect URI → Save:
   ```
   https://<your-domain>/auth/discord/callback
   ```
2. Your app → **Bot** tab → enable **SERVER MEMBERS INTENT** and
   **MESSAGE CONTENT INTENT** (required for moderation, welcome messages,
   and AutoMod).

Then open `https://<your-domain>` and log in.

## Managing the bot on the VPS

```
systemctl status nexus        # is it running?
journalctl -u nexus -f        # live logs
sudo systemctl restart nexus  # restart
sudo systemctl stop nexus     # stop
```

To inspect the database directly:

```
sudo mysql nexus_systems
```

## Updating after you push new commits

```
cd nexus-systems
sudo ./update.sh
```

This pulls the latest code, reinstalls dependencies, re-registers any
changed slash commands, and restarts the service.

## Troubleshooting

- **Certbot failed / "DNS problem"**: your domain isn't pointing at the VPS
  yet. Wait for DNS to propagate (check with `dig +short <domain>` — it
  should print the VPS's IP), then re-run: `sudo certbot --nginx -d <domain>`
- **"Invalid OAuth2 redirect_uri" on login**: the redirect URI in the
  Developer Portal doesn't exactly match `https://<domain>/auth/discord/callback`
  — check for typos, a trailing slash, or `http` vs `https`.
- **Bot won't start / "Failed to connect to MySQL"**:
  `journalctl -u nexus -n 100 --no-pager` shows the real error. Confirm
  MySQL is running (`systemctl status mysql`) and the `DB_*` values in
  `.env` are correct.
- **502 Bad Gateway from nginx**: the bot process isn't running or crashed —
  check `systemctl status nexus` and the journal logs above.

## Scaling to many servers

This bot is built for multi-tenancy out of the box — every Discord server
gets its own independent row in `guild_config` and its own settings, so one
deployment can serve as many servers as your VPS can handle. For a 2GB VPS,
that's comfortably thousands of small-to-medium servers; if you outgrow it,
the usual path is a larger VPS (more RAM mainly benefits MySQL's buffer
pool) — the app code itself doesn't need to change.
