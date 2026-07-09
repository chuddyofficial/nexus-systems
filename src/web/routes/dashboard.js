const express = require('express');
const config = require('../../config');
const { ensureAuth } = require('../middleware/ensureAuth');
const { ensureGuildAccess } = require('../middleware/ensureGuildAccess');

const router = express.Router();

router.get('/', (req, res) => {
  const client = req.app.locals.discordClient;
  res.render('home', {
    user: req.user || null,
    botTag: client.user?.tag ?? 'Bot',
    guildCount: client.guilds.cache.size,
    inviteUrl: `https://discord.com/api/oauth2/authorize?client_id=${config.clientId}&permissions=1099511627775&scope=bot%20applications.commands`,
  });
});

router.get('/login', (req, res) => {
  if (req.isAuthenticated?.()) return res.redirect('/servers');
  res.render('login', { user: null });
});

router.get('/servers', ensureAuth, (req, res) => {
  const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${config.clientId}&permissions=1099511627775&scope=bot%20applications.commands&guild_id=`;
  res.render('servers', { user: req.user, inviteUrl });
});

// Simple guild pages: just render guild/<page> with the standard locals.
const guildPages = [
  'overview',
  'automod',
  'antiraid',
  'verify',
  'welcome',
  'embeds',
  'warnings',
  'notes',
  'modlog',
  'auditlog',
  'reactionroles',
  'customcommands',
  'commands',
  'teams',
  'moderation',
  'leveling',
  'starboard',
  'tickets',
  'giveaways',
  'suggestions',
  'analytics',
  'members',
  'backup',
  'console',
];

for (const page of guildPages) {
  const urlPath = page === 'overview' ? '/servers/:guildId' : `/servers/:guildId/${page}`;
  router.get(urlPath, ensureAuth, ensureGuildAccess, (req, res) => {
    res.render(`guild/${page}`, {
      user: req.user,
      guild: req.botGuild,
      guildId: req.params.guildId,
      page,
      isServerManager: req.isServerManager,
      userPermissions: req.isServerManager ? null : [...req.userPermissions],
    });
  });
}

module.exports = router;
