const express = require('express');
const { ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database/db');
const config = require('../../config');
const { ensureAuthApi } = require('../middleware/ensureAuth');
const { ensureGuildAccess, userManagesGuild, requirePermission, requireServerManager } = require('../middleware/ensureGuildAccess');
const { buildEmbedFromData } = require('../../bot/utils/embedBuilder');
const { performBan, performKick, performTimeout, performWarn, performTempBan } = require('../../bot/utils/modActions');
const { endGiveawayNow } = require('../../bot/utils/giveaways');
const { isSnowflake } = require('../utils/validate');

const router = express.Router();

// ---- Public-ish status (no guild data) ----
router.get('/status', (req, res) => {
  const client = req.app.locals.discordClient;
  res.json({
    online: client.isReady(),
    tag: client.user?.tag ?? null,
    guildCount: client.guilds.cache.size,
    ping: Math.round(client.ws.ping),
    uptimeMs: client.uptime ?? 0,
  });
});

router.use(ensureAuthApi);

// ---- Guild list for the logged-in user ----
router.get('/servers', (req, res) => {
  const client = req.app.locals.discordClient;
  const managed = (req.user.guilds || []).filter(userManagesGuild);
  const result = managed.map((g) => {
    const botGuild = client.guilds.cache.get(g.id);
    return {
      id: g.id,
      name: g.name,
      icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
      botPresent: !!botGuild,
      memberCount: botGuild?.memberCount ?? null,
    };
  });
  res.json(result);
});

router.use('/servers/:guildId', ensureGuildAccess);

// ---- Current user's access level in this guild (drives sidebar visibility) ----
router.get('/servers/:guildId/me', (req, res) => {
  res.json({
    isServerManager: req.isServerManager,
    permissions: req.isServerManager ? db.ALL_TEAM_PERMISSIONS : [...req.userPermissions],
  });
});

// ---- Guild config ----
router.get('/servers/:guildId/config', async (req, res) => {
  res.json(await db.getGuildConfig(req.params.guildId));
});

router.post(
  '/servers/:guildId/config',
  requirePermission(['manage_config', 'manage_automod', 'manage_antiraid']),
  async (req, res) => {
    const updated = await db.updateGuildConfig(req.params.guildId, req.body || {});
    res.json(updated);
  }
);

// ---- Channels / roles for select inputs ----
router.get('/servers/:guildId/channels', (req, res) => {
  const channels = req.botGuild.channels.cache
    .filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
    .map((c) => ({ id: c.id, name: c.name, parent: c.parent?.name ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json(channels);
});

router.get('/servers/:guildId/roles', (req, res) => {
  const roles = req.botGuild.roles.cache
    .filter((r) => r.id !== req.botGuild.id)
    .map((r) => ({ id: r.id, name: r.name, color: r.hexColor, position: r.position }))
    .sort((a, b) => b.position - a.position);
  res.json(roles);
});

router.get('/servers/:guildId/categories', (req, res) => {
  const categories = req.botGuild.channels.cache
    .filter((c) => c.type === ChannelType.GuildCategory)
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json(categories);
});

router.get('/servers/:guildId/overview', (req, res) => {
  const g = req.botGuild;
  res.json({
    id: g.id,
    name: g.name,
    memberCount: g.memberCount,
    icon: g.iconURL(),
    channelCount: g.channels.cache.size,
    roleCount: g.roles.cache.size,
  });
});

// ---- Warnings ----
router.get('/servers/:guildId/warnings', async (req, res) => {
  res.json(await db.getAllWarnings(req.params.guildId));
});

router.delete('/servers/:guildId/warnings/:id', requirePermission('manage_moderation'), async (req, res) => {
  await db.deleteWarning(req.params.guildId, req.params.id);
  res.json({ ok: true });
});

// ---- Mod log ----
router.get('/servers/:guildId/modlog', async (req, res) => {
  res.json(await db.getModActions(req.params.guildId, 200));
});

// ---- Moderation actions from dashboard ----
router.use('/servers/:guildId/moderation', requirePermission('manage_moderation'));

router.post('/servers/:guildId/moderation/warn', async (req, res) => {
  const { userId, reason } = req.body;
  if (!isSnowflake(userId)) return res.status(400).json({ error: 'Invalid user ID' });
  try {
    const user = await req.app.locals.discordClient.users.fetch(userId);
    const warning = await performWarn(req.botGuild, user, req.user, reason || 'No reason provided');
    res.json({ ok: true, warning });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/servers/:guildId/moderation/kick', async (req, res) => {
  const { userId, reason } = req.body;
  if (!isSnowflake(userId)) return res.status(400).json({ error: 'Invalid user ID' });
  try {
    const member = await req.botGuild.members.fetch(userId);
    await performKick(req.botGuild, member, req.user, reason || 'No reason provided');
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/servers/:guildId/moderation/ban', async (req, res) => {
  const { userId, reason } = req.body;
  if (!isSnowflake(userId)) return res.status(400).json({ error: 'Invalid user ID' });
  try {
    const user = await req.app.locals.discordClient.users.fetch(userId);
    await performBan(req.botGuild, user, req.user, reason || 'No reason provided');
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/servers/:guildId/moderation/timeout', async (req, res) => {
  const { userId, reason, minutes } = req.body;
  if (!isSnowflake(userId)) return res.status(400).json({ error: 'Invalid user ID' });
  const durationMinutes = Number(minutes);
  if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 40320) {
    return res.status(400).json({ error: 'Invalid duration' });
  }
  try {
    const member = await req.botGuild.members.fetch(userId);
    await performTimeout(req.botGuild, member, req.user, durationMinutes * 60 * 1000, reason || 'No reason provided');
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/servers/:guildId/moderation/tempban', async (req, res) => {
  const { userId, reason, hours } = req.body;
  if (!isSnowflake(userId)) return res.status(400).json({ error: 'Invalid user ID' });
  const durationHours = Number(hours);
  if (!Number.isFinite(durationHours) || durationHours < 1) {
    return res.status(400).json({ error: 'Invalid duration' });
  }
  try {
    const user = await req.app.locals.discordClient.users.fetch(userId);
    await performTempBan(req.botGuild, user, req.user, reason || 'No reason provided', durationHours * 3_600_000);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---- Reaction roles ----
router.get('/servers/:guildId/reactionroles', async (req, res) => {
  res.json(await db.getReactionRoles(req.params.guildId));
});

router.delete('/servers/:guildId/reactionroles/:id', requirePermission('manage_reactionroles'), async (req, res) => {
  await db.deleteReactionRole(req.params.guildId, req.params.id);
  res.json({ ok: true });
});

// ---- Custom commands ----
router.get('/servers/:guildId/customcommands', async (req, res) => {
  res.json(await db.getCustomCommands(req.params.guildId));
});

router.post('/servers/:guildId/customcommands', requirePermission('manage_customcommands'), async (req, res) => {
  const { trigger, response } = req.body;
  if (!trigger) return res.status(400).json({ error: 'trigger is required' });
  const saved = await db.upsertCustomCommand(req.params.guildId, trigger, response, null);
  res.json(saved);
});

router.delete('/servers/:guildId/customcommands/:id', requirePermission('manage_customcommands'), async (req, res) => {
  await db.deleteCustomCommand(req.params.guildId, req.params.id);
  res.json({ ok: true });
});

// ---- Saved / custom embeds ----
router.get('/servers/:guildId/embeds', async (req, res) => {
  res.json(await db.getSavedEmbeds(req.params.guildId));
});

router.post('/servers/:guildId/embeds', requirePermission('manage_embeds'), async (req, res) => {
  const { name, embed } = req.body;
  if (!name || !embed) return res.status(400).json({ error: 'name and embed are required' });
  try {
    buildEmbedFromData(embed); // validate shape
  } catch (err) {
    return res.status(400).json({ error: `Invalid embed: ${err.message}` });
  }
  const saved = await db.saveEmbed(req.params.guildId, name, JSON.stringify(embed), req.user.id);
  res.json(saved);
});

router.delete('/servers/:guildId/embeds/:id', requirePermission('manage_embeds'), async (req, res) => {
  await db.deleteSavedEmbed(req.params.guildId, req.params.id);
  res.json({ ok: true });
});

router.post('/servers/:guildId/embeds/send', requirePermission('manage_embeds'), async (req, res) => {
  const { channelId, embed } = req.body;
  const channel = req.botGuild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return res.status(400).json({ error: 'Invalid channel' });
  try {
    const builtEmbed = buildEmbedFromData(embed);
    await channel.send({ content: embed.content || undefined, embeds: [builtEmbed] });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---- Leveling ----
router.get('/servers/:guildId/leaderboard', async (req, res) => {
  res.json(await db.getLeaderboard(req.params.guildId, 50));
});

// ---- Moderator notes ----
router.get('/servers/:guildId/notes', async (req, res) => {
  res.json(await db.getAllModNotes(req.params.guildId));
});

router.get('/servers/:guildId/notes/:userId', async (req, res) => {
  res.json(await db.getModNotes(req.params.guildId, req.params.userId));
});

router.post('/servers/:guildId/notes', requirePermission('manage_moderation'), async (req, res) => {
  const { userId, note } = req.body;
  if (!isSnowflake(userId) || !note) return res.status(400).json({ error: 'A valid userId and note are required' });
  const saved = await db.addModNote(req.params.guildId, userId, req.user.id, note);
  res.json(saved);
});

router.delete('/servers/:guildId/notes/:id', requirePermission('manage_moderation'), async (req, res) => {
  await db.deleteModNote(req.params.guildId, req.params.id);
  res.json({ ok: true });
});

// ---- Tickets ----
router.use('/servers/:guildId/tickets', requirePermission('manage_tickets'));

router.get('/servers/:guildId/tickets', async (req, res) => {
  res.json(await db.getAllTickets(req.params.guildId));
});

router.post('/servers/:guildId/tickets/setup', async (req, res) => {
  const { panelChannelId, categoryId, supportRoleId } = req.body;
  const panelChannel = req.botGuild.channels.cache.get(panelChannelId);
  if (!panelChannel?.isTextBased()) return res.status(400).json({ error: 'Invalid panel channel' });

  try {
    const embed = new EmbedBuilder()
      .setTitle('🎫 Support Tickets')
      .setDescription('Click the button below to open a private ticket with our support team.')
      .setColor(config.brandColor);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_open').setLabel('Open a Ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary)
    );
    const panelMessage = await panelChannel.send({ embeds: [embed], components: [row] });

    await db.updateGuildConfig(req.params.guildId, {
      ticket_category_id: categoryId,
      ticket_support_role_id: supportRoleId,
      ticket_panel_channel: panelChannelId,
      ticket_panel_message: panelMessage.id,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/servers/:guildId/tickets/:id/close', async (req, res) => {
  const tickets = await db.getAllTickets(req.params.guildId, 500);
  const ticket = tickets.find((t) => String(t.id) === req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  await db.closeTicket(req.params.guildId, ticket.channel_id);
  const channel = req.botGuild.channels.cache.get(ticket.channel_id);
  if (channel) await channel.delete().catch(() => {});
  res.json({ ok: true });
});

// ---- Giveaways ----
router.get('/servers/:guildId/giveaways', async (req, res) => {
  res.json(await db.getAllGiveaways(req.params.guildId));
});

router.post('/servers/:guildId/giveaways', requirePermission('manage_giveaways'), async (req, res) => {
  const { channelId, prize, winnerCount, durationMs } = req.body;
  const channel = req.botGuild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return res.status(400).json({ error: 'Invalid channel' });
  try {
    const endsAt = new Date(Date.now() + Number(durationMs));
    const embed = new EmbedBuilder()
      .setTitle('🎉 Giveaway!')
      .setDescription(`**Prize:** ${prize}\nReact with 🎉 to enter!\n**Winners:** ${winnerCount || 1}\n**Ends:** <t:${Math.floor(endsAt.getTime() / 1000)}:R>`)
      .setColor(config.brandColor)
      .setFooter({ text: `Hosted by ${req.user.username}` });
    const message = await channel.send({ embeds: [embed] });
    await message.react('🎉');
    const saved = await db.createGiveaway(
      req.params.guildId,
      channelId,
      message.id,
      prize,
      winnerCount || 1,
      req.user.id,
      endsAt.toISOString().replace('T', ' ').slice(0, 19)
    );
    res.json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---- Suggestions ----
router.get('/servers/:guildId/suggestions', async (req, res) => {
  res.json(await db.getSuggestions(req.params.guildId));
});

router.post('/servers/:guildId/suggestions/:id/status', requirePermission('manage_suggestions'), async (req, res) => {
  const { status } = req.body; // 'approved' | 'denied' | 'pending'
  if (!['approved', 'denied', 'pending'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  await db.setSuggestionStatus(req.params.guildId, req.params.id, status);

  const suggestion = await db.getSuggestionById(req.params.guildId, req.params.id);
  if (suggestion) {
    const channel = req.botGuild.channels.cache.get(suggestion.channel_id);
    const message = channel?.isTextBased() ? await channel.messages.fetch(suggestion.message_id).catch(() => null) : null;
    if (message?.embeds[0]) {
      const color = status === 'approved' ? 0x57f287 : status === 'denied' ? 0xed4245 : 0xfee75c;
      const embed = EmbedBuilder.from(message.embeds[0]).setFooter({ text: status[0].toUpperCase() + status.slice(1) }).setColor(color);
      await message.edit({ embeds: [embed] }).catch(() => {});
    }
  }
  res.json({ ok: true });
});

// ---- Analytics ----
router.get('/servers/:guildId/analytics', async (req, res) => {
  const actions = await db.getModActions(req.params.guildId, 1000);
  const warnings = await db.getAllWarnings(req.params.guildId);

  const byDay = {};
  for (const a of actions) {
    const day = a.created_at.slice(0, 10);
    byDay[day] = byDay[day] || { day, total: 0 };
    byDay[day].total++;
    byDay[day][a.action_type] = (byDay[day][a.action_type] || 0) + 1;
  }

  const byModerator = {};
  for (const a of actions) {
    byModerator[a.moderator_id] = (byModerator[a.moderator_id] || 0) + 1;
  }

  const byType = {};
  for (const a of actions) {
    byType[a.action_type] = (byType[a.action_type] || 0) + 1;
  }

  res.json({
    totalActions: actions.length,
    totalWarnings: warnings.length,
    byDay: Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day)).slice(-30),
    byModerator: Object.entries(byModerator).map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    byType: Object.entries(byType).map(([type, count]) => ({ type, count })),
  });
});

// ---- Member browser ----
router.get('/servers/:guildId/members', async (req, res) => {
  const query = (req.query.q || '').toString().toLowerCase().slice(0, 100);

  if (req.botGuild.members.cache.size < req.botGuild.memberCount && req.botGuild.memberCount < 2000) {
    await req.botGuild.members.fetch().catch(() => {});
  }

  let members = req.botGuild.members.cache;
  if (query) {
    members = members.filter(
      (m) => m.user.username.toLowerCase().includes(query) || m.displayName.toLowerCase().includes(query) || m.id === query
    );
  }
  const result = [...members.values()]
    .slice(0, 100)
    .map((m) => ({
      id: m.id,
      tag: m.user.tag,
      displayName: m.displayName,
      avatar: m.user.displayAvatarURL({ size: 64 }),
      joinedAt: m.joinedAt,
      roles: m.roles.cache.filter((r) => r.id !== req.botGuild.id).map((r) => r.name),
      bot: m.user.bot,
    }));
  res.json(result);
});

// ---- Audit log ----
router.get('/servers/:guildId/auditlog', async (req, res) => {
  try {
    const logs = await req.botGuild.fetchAuditLogs({ limit: 50 });
    const entries = [...logs.entries.values()].map((e) => ({
      id: e.id,
      action: e.action,
      executor: e.executor ? { id: e.executor.id, tag: e.executor.tag } : null,
      target: e.target ? { id: e.target.id ?? e.targetId } : null,
      reason: e.reason,
      createdAt: e.createdAt,
    }));
    res.json(entries);
  } catch (err) {
    res.status(400).json({ error: `Could not fetch audit log (bot may be missing View Audit Log permission): ${err.message}` });
  }
});

// ---- Config backup / restore ----
router.get('/servers/:guildId/backup', async (req, res) => {
  const cfg = await db.getGuildConfig(req.params.guildId);
  const { guild_id, updated_at, ...rest } = cfg;
  res.json({ exportedAt: new Date().toISOString(), guildName: req.botGuild.name, config: rest });
});

router.post('/servers/:guildId/restore', requirePermission('manage_config'), async (req, res) => {
  const { config: patch } = req.body;
  if (!patch || typeof patch !== 'object') return res.status(400).json({ error: 'Invalid backup file' });
  const updated = await db.updateGuildConfig(req.params.guildId, patch);
  res.json(updated);
});

// ---- Command toggles ----
router.get('/servers/:guildId/commands', requirePermission('manage_commands'), async (req, res) => {
  const client = req.app.locals.discordClient;
  const disabled = new Set(await db.getDisabledCommands(req.params.guildId));
  const commands = [...client.commands.values()]
    .map((c) => ({ name: c.data.name, description: c.data.description, category: c.category, enabled: !disabled.has(c.data.name) }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  res.json(commands);
});

router.post('/servers/:guildId/commands/:name/toggle', requirePermission('manage_commands'), async (req, res) => {
  const { enabled } = req.body;
  if (enabled) await db.enableCommand(req.params.guildId, req.params.name);
  else await db.disableCommand(req.params.guildId, req.params.name, req.user.id);
  res.json({ ok: true });
});

// ---- Teams / permissions (RBAC) ----
router.get('/servers/:guildId/teams', requireServerManager, async (req, res) => {
  const teams = await db.getTeams(req.params.guildId);
  const withMembers = await Promise.all(
    teams.map(async (team) => ({ ...team, members: await db.getTeamMembers(req.params.guildId, team.id) }))
  );
  res.json({ teams: withMembers, allPermissions: db.ALL_TEAM_PERMISSIONS });
});

router.post('/servers/:guildId/teams', requireServerManager, async (req, res) => {
  const { name, color } = req.body;
  if (!name || typeof name !== 'string' || name.length > 100) return res.status(400).json({ error: 'A valid team name is required' });
  try {
    const team = await db.createTeam(req.params.guildId, name, color || '#5865F2');
    res.json(team);
  } catch (err) {
    res.status(400).json({ error: err.code === 'ER_DUP_ENTRY' ? 'A team with that name already exists.' : err.message });
  }
});

router.post('/servers/:guildId/teams/:teamId/permissions', requireServerManager, async (req, res) => {
  const { permissions } = req.body;
  if (!Array.isArray(permissions)) return res.status(400).json({ error: 'permissions must be an array' });
  const team = await db.updateTeamPermissions(req.params.guildId, req.params.teamId, permissions);
  res.json(team);
});

router.post('/servers/:guildId/teams/:teamId/members', requireServerManager, async (req, res) => {
  const { discordId, memberType } = req.body;
  if (!isSnowflake(discordId)) return res.status(400).json({ error: 'A valid Discord ID is required' });
  await db.addTeamMember(req.params.guildId, req.params.teamId, discordId, memberType === 'role' ? 'role' : 'user', req.user.id);
  res.json({ ok: true, members: await db.getTeamMembers(req.params.guildId, req.params.teamId) });
});

router.delete('/servers/:guildId/teams/:teamId/members/:discordId', requireServerManager, async (req, res) => {
  await db.removeTeamMember(req.params.guildId, req.params.teamId, req.params.discordId);
  res.json({ ok: true });
});

router.delete('/servers/:guildId/teams/:teamId', requireServerManager, async (req, res) => {
  await db.deleteTeam(req.params.guildId, req.params.teamId);
  res.json({ ok: true });
});

// ---- Verification system ----
router.post('/servers/:guildId/verify/setup', requirePermission('manage_config'), async (req, res) => {
  const { channelId, roleId, message } = req.body;
  const channel = req.botGuild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return res.status(400).json({ error: 'Invalid channel' });
  if (!req.botGuild.roles.cache.has(roleId)) return res.status(400).json({ error: 'Invalid role' });

  try {
    const embed = new EmbedBuilder()
      .setTitle('✅ Verification Required')
      .setDescription(message || 'Click the button below to verify yourself and gain access to the rest of the server.')
      .setColor(config.brandColor);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('verify_click').setLabel('Verify').setEmoji('✅').setStyle(ButtonStyle.Success)
    );
    const panelMessage = await channel.send({ embeds: [embed], components: [row] });

    await db.updateGuildConfig(req.params.guildId, {
      verify_enabled: true,
      verify_channel_id: channelId,
      verify_role_id: roleId,
      verify_message: message || null,
      verify_panel_message: panelMessage.id,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---- Level roles ----
router.get('/servers/:guildId/levelroles', async (req, res) => {
  res.json(await db.getLevelRoles(req.params.guildId));
});

router.post('/servers/:guildId/levelroles', requirePermission('manage_config'), async (req, res) => {
  const { level, roleId } = req.body;
  const levelNum = Number(level);
  if (!Number.isInteger(levelNum) || levelNum < 1 || !isSnowflake(roleId)) {
    return res.status(400).json({ error: 'A valid level and role are required' });
  }
  await db.addLevelRole(req.params.guildId, levelNum, roleId);
  res.json({ ok: true });
});

router.delete('/servers/:guildId/levelroles/:id', requirePermission('manage_config'), async (req, res) => {
  await db.deleteLevelRole(req.params.guildId, req.params.id);
  res.json({ ok: true });
});

// ---- Giveaway management ----
router.post('/servers/:guildId/giveaways/:id/end', requirePermission('manage_giveaways'), async (req, res) => {
  try {
    await endGiveawayNow(req.app.locals.discordClient, req.params.guildId, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
