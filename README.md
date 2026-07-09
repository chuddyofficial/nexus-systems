# Nexus Systems — Community Security & Moderation Bot + Web Dashboard

A Carl-bot style moderation bot with a full web dashboard: login with Discord, manage every server you have **Manage Server** permission in, configure AutoMod, logging, welcome/leave messages, reaction roles, custom commands, and build/send custom embeds with a live preview — all from the browser.

Running locally for development? Keep reading below. Deploying to a real VPS
with your own domain? See **[DEPLOY.md](DEPLOY.md)** — `sudo ./install.sh`
handles Node.js, nginx, HTTPS (Let's Encrypt), and a systemd service for you.

## What's included

- **Bot** (discord.js v14, 31 slash commands): moderation, AutoMod, anti-raid, temp-bans, leveling/XP with role rewards, starboard, a full ticket system, giveaways, polls, suggestions, moderator notes, reaction roles, member verification, custom text commands, custom embeds, and more (full list below).
- **Dashboard** (Express + EJS): Discord OAuth2 login, light/dark theme, a command palette (Ctrl/Cmd+K), a visual embed builder with a live Discord-style preview, analytics charts, a member browser, an audit log viewer, config backup/restore, and a live console (Socket.IO) streaming bot events in real time.
- **Access control**: a Teams/RBAC permission system — create Teams (Admin/Mod/Support-style groups), grant each one specific dashboard permissions, and add members by Discord user ID or role, without handing out full "Manage Server" access. Plus per-server slash command enable/disable toggles.
- **Storage**: MySQL, via a connection pool (`mysql2`) — built for multi-tenant scale, with every Discord server's config, warnings, tickets, etc. isolated by `guild_id`. `install.sh` provisions MySQL automatically on the VPS.

## Feature list

**Moderation & safety**: ban / unban / kick / timeout / temp-ban (auto-unban) / warn / clear-warnings / purge / lock / unlock / lockdown-all / slowmode, moderator notes, AutoMod (anti-invite, anti-spam, banned words, caps filter, mass-mention), anti-raid (join-burst detection + minimum account age gate), auto-role on join, member verification (button-gated access), full mod/message/join logging, and a real Discord audit-log viewer.

**Engagement**: leveling/XP with `/rank`, a leaderboard, and level-up role rewards; starboard; a ticket system with category selection, staff claiming, transcript logging, and auto-close on inactivity; giveaways (`/giveaway`, with dashboard "End Now"); polls (`/poll`); a suggestion box with approve/deny; reaction roles; welcome/leave messages; custom embeds; and custom text commands with a per-server configurable prefix (`/setprefix`).

**Access control**: Teams with granular permissions (`/team` bot command or the Teams dashboard page), per-server command enable/disable toggles, and everything gated so a Team only ever sees the dashboard pages and API routes its permissions actually cover.

**Dashboard-only**: analytics (mod actions over time, top moderators, action-type breakdown), a searchable member browser with quick warn/kick/ban, and one-click JSON config backup/restore.

## One-time setup

1. **Install dependencies** (already done if you're reading this after the initial build):
   ```
   npm install
   ```

2. **A local MySQL (or MariaDB) server**, running and reachable — the app connects to it on startup and creates all tables automatically. Any recent MySQL 8.x or MariaDB 10.x/11.x works. Once it's running, create a database and user:
   ```sql
   CREATE DATABASE nexus_systems CHARACTER SET utf8mb4;
   CREATE USER 'nexus'@'localhost' IDENTIFIED BY 'some-password';
   GRANT ALL PRIVILEGES ON nexus_systems.* TO 'nexus'@'localhost';
   ```

3. **Discord Developer Portal** — https://discord.com/developers/applications → your application:
   - **OAuth2 → General**: add this exact Redirect URI, then Save Changes:
     ```
     http://localhost:3000/auth/discord/callback
     ```
   - **Bot** tab → under "Privileged Gateway Intents", enable:
     - `SERVER MEMBERS INTENT`
     - `MESSAGE CONTENT INTENT`
     (Required for welcome/leave messages, moderation, and AutoMod message scanning.)

4. **`.env` file** (already created at the project root) — confirm these are filled in:
   - `DISCORD_TOKEN` — your bot token
   - `CLIENT_ID` — your application/client ID
   - `CLIENT_SECRET` — from OAuth2 → General → "Client Secret" (**required** for the dashboard login to work)
   - `DEV_GUILD_ID` *(optional)* — set this to a test server's ID while developing so slash commands register instantly instead of waiting up to an hour for global propagation.
   - `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` — matching whatever you set up in step 2 (defaults to `127.0.0.1:3306`, user `nexus`, database `nexus_systems`).

5. **Invite the bot to a server** using an invite URL of this shape (replace `CLIENT_ID`):
   ```
   https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=1099511627775&scope=bot%20applications.commands
   ```
   (The dashboard's home page and server picker also generate this link for you.)

On a real VPS, none of this is manual — `sudo ./install.sh` installs and configures MySQL for you. See **[DEPLOY.md](DEPLOY.md)**.

## Running it

```
npm run deploy-commands   # registers slash commands with Discord (run again whenever commands change)
npm start                 # starts the bot + web dashboard together
```

Then open **http://localhost:3000** and click **Login**.

- `npm run dev` restarts automatically on file changes (Node's `--watch`).

## How it's laid out

```
src/
  index.js              entrypoint — starts the bot and the web server together
  config.js              loads .env
  database/
    schema.sql            MySQL table definitions
    db.js                 connection pool + all queries (async, shared by bot + web)
  bot/
    client.js             discord.js Client + intents
    commandHandler.js      loads slash commands from bot/commands/**
    eventHandler.js        loads events from bot/events/**
    deploy-commands.js     registers slash commands with Discord
    commands/
      moderation/          /ban /kick /timeout /untimeout /tempban /warn /warnings /clearwarnings /note /purge /lock /unlock /lockdown /slowmode
      config/               /setlogs /setprefix /dashboard /team
      embeds/                /embed send|saved
      utility/               /ping /reactionrole /tag /rank /ticket /giveaway /poll /suggest /userinfo /serverinfo /avatar
    events/                ready, interactionCreate (incl. ticket/verify buttons + ticket category select), message create/update/delete, member add/remove, reactions, guildCreate
    automod/                spam / invite / banned-word / caps / mass-mention filters, anti-raid
    utils/                  embed builder, mod-action executor, logger, event bus, permissions, leveling (+ level-role rewards), starboard, tickets (+ transcripts), giveaways, scheduler (giveaways + temp-ban unbans + stale-ticket auto-close)
  web/
    server.js              Express app + session + Socket.IO
    passport.js             Discord OAuth2 strategy
    routes/                 auth.js, dashboard.js (pages), api.js (JSON)
    middleware/              login guard, per-guild + per-permission (Teams/RBAC) guards, rate limiters
    utils/                  validate.js (input validation helpers)
    views/                  EJS pages (dark theme, Discord-style)
    public/                 CSS + client-side JS (vanilla, no build step)
brand/                    generated server/bot PFPs, banner, favicon, bio.txt, tos.txt, p.txt
scripts/
  generate-brand-assets.js  regenerates everything in brand/ (npm run generate-brand-assets)
```

## Notes

- **Sessions** are stored in MySQL (a `sessions` table is created automatically), so logins — and the live console's WebSocket auth — survive bot restarts and deploys. This also means the Live Console genuinely needs a valid, non-expired login; if you ever see it stuck on "Connecting..." or showing an auth error, just refresh and log in again.
- **Bot status**: the bot's Discord presence shows "Watching Dashboard: localhost:3000" (Discord doesn't allow bots to post a clickable link in their status — only Twitch/YouTube streaming activities support that — so it's shown as text). The `/dashboard` slash command posts a clickable link instead.
- **Custom commands** are triggered with a per-server prefix (default `!`, change with `/setprefix`), separate from the `/` slash commands, matching Carl-bot's "tags" behavior.
- **Audit Log page** requires the bot to have the "View Audit Log" permission in the server (included in the default invite link).
- **Theme & navigation**: click the moon/sun icon in the sidebar to toggle light/dark mode, and press `Ctrl+K` (or `Cmd+K` on Mac) anywhere on a server's dashboard to jump to any page instantly.
- **Background scheduler**: a 20-second interval loop handles giveaway endings, temp-ban auto-unbans, and stale-ticket auto-closing, so the bot process needs to stay running for those to fire on time.
- **Teams/RBAC**: only users with Discord's own "Manage Server" (or Administrator) permission can create Teams or change their permissions — a Team can never grant itself more access, even if you give it every other permission. Regular Team members can only reach the specific dashboard pages and API routes their Team's permissions cover; direct links to other pages 403.
- **Brand assets**: `brand/` has ready-to-upload server/bot profile pictures, a server banner, bios (`bio.txt`), and a Terms of Service / Privacy Policy (`tos.txt` / `p.txt`) written for CH Services. Regenerate the images anytime with `npm run generate-brand-assets` (uses `sharp`, a dev-only dependency).
- The bot token you provided was pasted directly in chat — treat it as potentially exposed and consider regenerating it from the Developer Portal's Bot tab if this ever leaves your machine.
