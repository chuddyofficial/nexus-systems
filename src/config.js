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
  dashboardUrl: required('DASHBOARD_URL', 'http://localhost:3000'),
  callbackUrl: required('CALLBACK_URL', 'http://localhost:3000/auth/discord/callback'),
  sessionSecret: required('SESSION_SECRET', 'dev-secret-change-me'),
  ownerIds: (required('OWNER_IDS', '') || '').split(',').map((s) => s.trim()).filter(Boolean),
  brandColor: 0x5865f2,
  isProduction: required('NODE_ENV', 'development') === 'production',
};
