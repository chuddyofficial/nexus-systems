const db = require('../../database/db');
const { isOwner } = require('./ensureOwner');

const MANAGE_GUILD = 0x20n;
const ADMINISTRATOR = 0x8n;

function userManagesGuild(discordGuild) {
  if (!discordGuild) return false;
  if (discordGuild.owner) return true;
  try {
    const perms = BigInt(discordGuild.permissions);
    return (perms & MANAGE_GUILD) === MANAGE_GUILD || (perms & ADMINISTRATOR) === ADMINISTRATOR;
  } catch {
    return false;
  }
}

/**
 * Ensures the logged-in user is allowed into :guildId's dashboard at all —
 * either because they hold Discord's own Manage Server / Administrator
 * permission (in which case they get every permission, including managing
 * Teams themselves), or because an admin has added them to a Team with at
 * least one permission via the Teams page or the /team bot command.
 *
 * Also verifies the bot is actually a member of that guild.
 */
async function ensureGuildAccess(req, res, next) {
  try {
    const { guildId } = req.params;
    const client = req.app.locals.discordClient;

    const botGuild = client.guilds.cache.get(guildId);
    if (!botGuild) {
      return res.status(404).render('error', { message: 'The bot is not in that server.' });
    }

    const userGuild = (req.user?.guilds || []).find((g) => g.id === guildId);
    // Website admins (config.ownerIds) get full access to every server's
    // dashboard for support/management purposes, regardless of whether they
    // personally hold Manage Server or sit on a Team in that guild.
    const isServerManager = isOwner(req.user?.id) || userManagesGuild(userGuild);

    let permissions = new Set();
    if (isServerManager) {
      permissions = new Set(db.ALL_TEAM_PERMISSIONS);
    } else {
      // Not a Discord "Manage Server" holder — see if they've been added to a
      // Team, either directly by Discord ID or via one of their roles in this
      // guild (resolved through the bot's own member cache, since the OAuth
      // scope we request doesn't expose per-guild roles).
      const member = await botGuild.members.fetch(req.user.id).catch(() => null);
      if (!member) {
        return res.status(403).render('error', { message: "You don't have permission to manage that server." });
      }
      const roleIds = [...member.roles.cache.keys()];
      const teams = await db.getTeamsForMember(guildId, req.user.id, roleIds);
      for (const team of teams) {
        for (const perm of team.permissions) permissions.add(perm);
      }
      if (permissions.size === 0) {
        return res.status(403).render('error', { message: "You don't have permission to manage that server." });
      }
    }

    req.botGuild = botGuild;
    req.isServerManager = isServerManager;
    req.userPermissions = permissions;
    next();
  } catch (err) {
    next(err);
  }
}

function hasPermission(req, key) {
  return req.isServerManager || req.userPermissions?.has(key);
}

/**
 * Route-level guard for a specific permission. Team management itself is
 * intentionally NOT grantable through this system — only true Discord
 * "Manage Server" holders can create Teams or change their permissions, so a
 * Team can never escalate itself.
 */
function requirePermission(keyOrKeys) {
  const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
  return (req, res, next) => {
    if (!keys.some((key) => hasPermission(req, key))) {
      return res.status(403).json({ error: `Missing permission: ${keys.join(' or ')}` });
    }
    next();
  };
}

function requireServerManager(req, res, next) {
  if (!req.isServerManager) {
    return res.status(403).json({ error: 'Only Discord "Manage Server" holders can do this.' });
  }
  next();
}

module.exports = { ensureGuildAccess, userManagesGuild, hasPermission, requirePermission, requireServerManager };
