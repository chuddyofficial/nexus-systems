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
// Pages not listed here (overview, analytics, modlog, auditlog, console) are
// visible to anyone with any dashboard access — everything else requires at
// least one of the listed permissions, mirroring the sidebar's visibility
// rules so a direct link never reveals more than the nav does. `null` means
// "server managers only" (Teams itself, to prevent privilege escalation).
const PAGE_PERMISSIONS = {
  moderation: ['manage_moderation'],
  automod: ['manage_automod', 'manage_config'],
  antiraid: ['manage_antiraid', 'manage_config'],
  verify: ['manage_config'],
  warnings: ['manage_moderation'],
  notes: ['manage_moderation'],
  members: ['manage_moderation'],
  leveling: ['manage_config'],
  starboard: ['manage_config'],
  tickets: ['manage_tickets'],
  giveaways: ['manage_giveaways'],
  suggestions: ['manage_suggestions'],
  reactionroles: ['manage_reactionroles'],
  welcome: ['manage_config'],
  embeds: ['manage_embeds'],
  customcommands: ['manage_customcommands'],
  commands: ['manage_commands'],
  backup: ['manage_config'],
  teams: null,
};

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
    const required = PAGE_PERMISSIONS[page];
    if (required !== undefined && !req.isServerManager) {
      const allowed = required === null ? false : required.some((p) => req.userPermissions.has(p));
      if (!allowed) {
        return res.status(403).render('error', { message: "You don't have permission to view that page." });
      }
    }
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
