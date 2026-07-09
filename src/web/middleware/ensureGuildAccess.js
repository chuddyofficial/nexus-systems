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
 * Ensures the logged-in user has Manage Server permission (or is owner) in
 * :guildId, AND that the bot is actually a member of that guild.
 */
function ensureGuildAccess(req, res, next) {
  const { guildId } = req.params;
  const client = req.app.locals.discordClient;

  const botGuild = client.guilds.cache.get(guildId);
  if (!botGuild) {
    return res.status(404).render('error', { message: 'The bot is not in that server.' });
  }

  const userGuild = (req.user?.guilds || []).find((g) => g.id === guildId);
  if (!userGuild || !userManagesGuild(userGuild)) {
    return res.status(403).render('error', { message: "You don't have permission to manage that server." });
  }

  req.botGuild = botGuild;
  next();
}

module.exports = { ensureGuildAccess, userManagesGuild };
