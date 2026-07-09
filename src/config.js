require('dotenv').config();

function required(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  return value;
}

module.exports = {
  token: required('DISCORD_TOKEN'),
  clientId: required('CLIENT_ID'),
  clientSecret: required('CLIENT_SECRET'),
  devGuildId: required('DEV_GUILD_ID', ''),
  port: parseInt(required('PORT', '3000'), 10),
  dashboardUrl: required('DASHBOARD_URL', 'https://services.chnexus.net'),
  callbackUrl: required('CALLBACK_URL', 'http://localhost:3000/auth/discord/callback'),
  sessionSecret: required('SESSION_SECRET', 'dev-secret-change-me'),
  // Website admins: full site-wide control panel (/admin) — every server's
  // dashboard, broadcast, and bot-process controls. Distinct from a Discord
  // server's own "Manage Server" holders. Defaults to the bot owner's ID so
  // this works out of the box; override/extend via OWNER_IDS in .env.
  ownerIds: (required('OWNER_IDS', '999432150908682330') || '').split(',').map((s) => s.trim()).filter(Boolean),
  brandColor: 0x5865f2,
  discordSupportUrl: 'https://discord.gg/V6KgNknCt6',
  isProduction: required('NODE_ENV', 'development') === 'production',
  db: {
    host: required('DB_HOST', '127.0.0.1'),
    port: parseInt(required('DB_PORT', '3306'), 10),
    user: required('DB_USER', 'nexus'),
    password: required('DB_PASSWORD', ''),
    database: required('DB_NAME', 'nexus_systems'),
  },
};
