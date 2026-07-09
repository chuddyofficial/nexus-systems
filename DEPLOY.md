# Deploying to your VPS

This walks through getting this repo onto GitHub, then onto your Ubuntu 22.04
VPS, with a real domain and HTTPS.

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
git clone https://github.com/<you>/<repo>.git modbot
cd modbot
```

## 4. Run the installer

```
sudo ./install.sh
```

This single script:

- Creates a 2GB swap file if your VPS is low on RAM and doesn't have one
  (recommended for a 2GB droplet/VPS)
- Installs Node.js, nginx, and certbot
- Creates a dedicated `modbot` system user to run the bot (not root)
- Prompts you for your bot token, client ID/secret, and domain — writes `.env`
- Installs npm dependencies and registers your slash commands
- Creates and starts a `systemd` service (`modbot`) so the bot auto-restarts
  on crash or VPS reboot
- Configures `ufw` (firewall) to allow SSH + HTTP/HTTPS
- Configures nginx as a reverse proxy in front of the bot's internal port
- Shows you the VPS's public IP and waits for you to confirm DNS is pointed
  at it, then requests a free Let's Encrypt SSL certificate via certbot and
  enables HTTPS with auto-redirect

It's safe to re-run `sudo ./install.sh` any time — it skips steps that are
already done and lets you update values (leave a prompt blank to keep the
current value).

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
systemctl status modbot        # is it running?
journalctl -u modbot -f        # live logs
sudo systemctl restart modbot  # restart
sudo systemctl stop modbot     # stop
```

## Updating after you push new commits

```
cd modbot
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
- **Bot won't start**: `journalctl -u modbot -n 100 --no-pager` shows the
  real error — usually a bad token or missing `.env` value.
- **502 Bad Gateway from nginx**: the bot process isn't running or crashed —
  check `systemctl status modbot` and the journal logs above.
