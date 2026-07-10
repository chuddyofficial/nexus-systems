const path = require('node:path');
const { execFile } = require('node:child_process');
const express = require('express');
const { ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database/db');
const config = require('../../config');
const { ensureAuthApi } = require('../middleware/ensureAuth');
const { ensureGuildAccess, userManagesGuild, requirePermission, requireServerManager } = require('../middleware/ensureGuildAccess');
const { ensureOwnerApi } = require('../middleware/ensureOwner');
const { buildEmbedFromData } = require('../../bot/utils/embedBuilder');
const { performBan, performKick, performTimeout, performWarn, performTempBan } = require('../../bot/utils/modActions');
const { endGiveawayNow, rerollGiveaway } = require('../../bot/utils/giveaways');
const { sendAnnouncementToGuild, broadcastSiteWideBanner } = require('../../bot/utils/announcements');
const { isSnowflake } = require('../utils/validate');

const router = express.Router();

// Free-tier caps — VIP servers (config.vip_active) are unlimited on all of
// these. Enforced only at creation time, so a server that already exceeds
// its cap (e.g. from before this existed) is never broken retroactively —
// it just can't add more until it's VIP.
const FREE_LIMITS = {
  ticketPanels: { max: 2, label: 'ticket panels' },
  customCommands: { max: 10, label: 'custom commands' },
  savedEmbeds: { max: 5, label: 'saved embeds' },
  levelRoles: { max: 5, label: 'level roles' },
  reactionRoles: { max: 10, label: 'reaction roles' },
};

async function checkVipLimit(guildId, res, kind, currentCount) {
  const { max, label } = FREE_LIMITS[kind];
  const cfg = await db.getGuildConfig(guildId);
  if (cfg.vip_active) return true;
  if (currentCount >= max) {
    res.status(403).json({ error: `Free servers are limited to ${max} ${label}. Upgrade to VIP for unlimited — see the VIP page in the sidebar.` });
    return false;
  }
  return true;
}

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
  requirePermission(['manage_config', 'manage_automod', 'manage_antiraid', 'manage_tickets']),
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

router.get('/servers/:guildId/warnings/page', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  res.json(await db.getWarningsPage(req.params.guildId, limit, offset));
});

router.delete('/servers/:guildId/warnings/:id', requirePermission('manage_moderation'), async (req, res) => {
  await db.deleteWarning(req.params.guildId, req.params.id);
  res.json({ ok: true });
});

// ---- Mod log ----
router.get('/servers/:guildId/modlog', async (req, res) => {
  res.json(await db.getModActions(req.params.guildId, 200));
});

router.get('/servers/:guildId/modlog/page', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  res.json(await db.getModActionsPage(req.params.guildId, limit, offset));
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
  const { trigger, response, cooldownSeconds } = req.body;
  if (!trigger) return res.status(400).json({ error: 'trigger is required' });
  const existing = await db.getCustomCommands(req.params.guildId);
  const isNew = !existing.some((c) => c.trigger.toLowerCase() === trigger.toLowerCase());
  if (isNew && !(await checkVipLimit(req.params.guildId, res, 'customCommands', existing.length))) return;
  const saved = await db.upsertCustomCommand(req.params.guildId, trigger, response, null, Number(cooldownSeconds) || 0);
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
  const existing = await db.getSavedEmbeds(req.params.guildId);
  const isNew = !existing.some((e) => e.name.toLowerCase() === name.toLowerCase());
  if (isNew && !(await checkVipLimit(req.params.guildId, res, 'savedEmbeds', existing.length))) return;
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

router.post('/servers/:guildId/leaderboard/:userId/reset', requirePermission('manage_config'), async (req, res) => {
  await db.resetXp(req.params.guildId, req.params.userId);
  res.json({ ok: true });
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

// ---- Ticket Panels — each is its own configurable "sector": embed, button,
// category channel, support role, transcript channel, and optional dropdown
// categories members pick from when opening a ticket.
router.get('/servers/:guildId/tickets/panels', async (req, res) => {
  res.json(await db.getTicketPanels(req.params.guildId));
});

router.post('/servers/:guildId/tickets/panels', async (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.length > 100) return res.status(400).json({ error: 'A valid panel name is required' });
  const existing = await db.getTicketPanels(req.params.guildId);
  if (!(await checkVipLimit(req.params.guildId, res, 'ticketPanels', existing.length))) return;
  res.json(await db.createTicketPanel(req.params.guildId, name));
});

router.post('/servers/:guildId/tickets/panels/:id', async (req, res) => {
  const panel = await db.updateTicketPanel(req.params.guildId, req.params.id, req.body || {});
  if (!panel) return res.status(404).json({ error: 'Panel not found' });
  res.json(panel);
});

router.delete('/servers/:guildId/tickets/panels/:id', async (req, res) => {
  await db.deleteTicketPanel(req.params.guildId, req.params.id);
  res.json({ ok: true });
});

router.post('/servers/:guildId/tickets/panels/:id/options', async (req, res) => {
  const { label, emoji, description } = req.body;
  if (!label || typeof label !== 'string' || label.length > 80) return res.status(400).json({ error: 'A valid option label is required' });
  res.json(await db.addPanelOption(req.params.id, req.params.guildId, label, emoji || null, description || null));
});

router.delete('/servers/:guildId/tickets/panels/:panelId/options/:optionId', async (req, res) => {
  await db.deletePanelOption(req.params.guildId, req.params.optionId);
  res.json({ ok: true });
});

router.post('/servers/:guildId/tickets/panels/:id/post', async (req, res) => {
  const { channelId } = req.body;
  const panel = await db.getTicketPanel(req.params.guildId, req.params.id);
  if (!panel) return res.status(404).json({ error: 'Panel not found' });
  if (!panel.support_role_id) return res.status(400).json({ error: 'Set a support role for this panel before posting it.' });
  const channel = req.botGuild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return res.status(400).json({ error: 'Invalid channel' });

  try {
    const embed = new EmbedBuilder()
      .setTitle(panel.embed_title)
      .setDescription(panel.embed_description)
      .setColor(panel.embed_color || config.brandColor);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_open:${panel.id}`)
        .setLabel(panel.button_label)
        .setEmoji(panel.button_emoji || '🎫')
        .setStyle(ButtonStyle.Primary)
    );
    const message = await channel.send({ embeds: [embed], components: [row] });
    res.json(await db.setTicketPanelMessage(req.params.guildId, panel.id, channelId, message.id));
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
  const { channelId, prize, winnerCount, durationMs, requiredRoleId, minLevel } = req.body;
  const channel = req.botGuild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return res.status(400).json({ error: 'Invalid channel' });
  try {
    const endsAt = new Date(Date.now() + Number(durationMs));
    const requirementLines = [];
    if (requiredRoleId) requirementLines.push(`Requires role: <@&${requiredRoleId}>`);
    if (minLevel) requirementLines.push(`Requires level ${minLevel}+`);
    const embed = new EmbedBuilder()
      .setTitle('🎉 Giveaway!')
      .setDescription(
        `**Prize:** ${prize}\nReact with 🎉 to enter!\n**Winners:** ${winnerCount || 1}\n**Ends:** <t:${Math.floor(endsAt.getTime() / 1000)}:R>${requirementLines.length ? `\n${requirementLines.join('\n')}` : ''}`
      )
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
      endsAt.toISOString().replace('T', ' ').slice(0, 19),
      requiredRoleId || null,
      Number(minLevel) || 0
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

// ---- VIP status & perks (guild-scoped) ----
router.get('/servers/:guildId/vip', async (req, res) => {
  const guildId = req.params.guildId;
  const cfg = await db.getGuildConfig(guildId);
  const [panels, commands, embeds, levelRoles, reactionRoles] = await Promise.all([
    db.getTicketPanels(guildId),
    db.getCustomCommands(guildId),
    db.getSavedEmbeds(guildId),
    db.getLevelRoles(guildId),
    db.getReactionRoles(guildId),
  ]);
  res.json({
    active: cfg.vip_active,
    tier: cfg.vip_tier,
    expiresAt: cfg.vip_expires_at,
    nickname: cfg.vip_nickname,
    themeColor: cfg.vip_theme_color,
    code: cfg.vip_code,
    grantedAt: cfg.vip_granted_at,
    limits: Object.fromEntries(Object.entries(FREE_LIMITS).map(([k, v]) => [k, v.max])),
    usage: {
      ticketPanels: panels.length,
      customCommands: commands.length,
      savedEmbeds: embeds.length,
      levelRoles: levelRoles.length,
      reactionRoles: reactionRoles.length,
    },
  });
});

router.post('/servers/:guildId/vip/redeem', requirePermission('manage_config'), async (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string') return res.status(400).json({ error: 'Enter a code' });
  try {
    const cfg = await db.redeemVipCode(code.trim().toUpperCase(), req.params.guildId, req.user.id);
    res.json(cfg);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.post('/servers/:guildId/vip/nickname', requirePermission('manage_config'), async (req, res) => {
  const cfg = await db.getGuildConfig(req.params.guildId);
  if (!cfg.vip_active) return res.status(403).json({ error: 'VIP only.' });
  const nickname = (req.body.nickname || '').trim().slice(0, 32);
  try {
    await req.botGuild.members.me.setNickname(nickname || null);
    const updated = await db.updateGuildConfig(req.params.guildId, { vip_nickname: nickname || null });
    res.json(updated);
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
  const existing = await db.getLevelRoles(req.params.guildId);
  const isNew = !existing.some((r) => r.level === levelNum);
  if (isNew && !(await checkVipLimit(req.params.guildId, res, 'levelRoles', existing.length))) return;
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

router.post('/servers/:guildId/giveaways/:id/reroll', requirePermission('manage_giveaways'), async (req, res) => {
  try {
    const winners = await rerollGiveaway(req.app.locals.discordClient, req.params.guildId, req.params.id);
    res.json({ ok: true, winnerCount: winners.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---- Website Admin (owner-only, site-wide bot control) ----
router.use('/admin', ensureOwnerApi);

router.get('/admin/stats', (req, res) => {
  const client = req.app.locals.discordClient;
  const guilds = [...client.guilds.cache.values()];
  res.json({
    tag: client.user?.tag ?? null,
    online: client.isReady(),
    ping: Math.round(client.ws.ping),
    guildCount: guilds.length,
    totalMembers: guilds.reduce((sum, g) => sum + (g.memberCount || 0), 0),
    uptimeMs: client.uptime ?? 0,
    nodeVersion: process.version,
    botVersion: require('../../../package.json').version,
    memory: process.memoryUsage(),
    pid: process.pid,
  });
});

router.get('/admin/servers/:guildId/detail', async (req, res) => {
  const client = req.app.locals.discordClient;
  const guild = client.guilds.cache.get(req.params.guildId);
  if (!guild) return res.status(404).json({ error: 'Server not found' });
  const [cfg, warnings, tickets, modActions] = await Promise.all([
    db.getGuildConfig(req.params.guildId),
    db.getAllWarnings(req.params.guildId),
    db.getAllTickets(req.params.guildId, 500),
    db.getModActions(req.params.guildId, 500),
  ]);
  res.json({
    id: guild.id,
    name: guild.name,
    memberCount: guild.memberCount,
    ownerId: guild.ownerId,
    createdAt: guild.createdAt.toISOString(),
    vipActive: cfg.vip_active,
    vipTier: cfg.vip_tier,
    warningCount: warnings.length,
    ticketCount: tickets.length,
    openTicketCount: tickets.filter((t) => t.status === 'open').length,
    modActionCount: modActions.length,
    automodEnabled: cfg.automod_enabled,
    antiraidEnabled: cfg.antiraid_enabled,
    antinukeEnabled: cfg.antinuke_enabled,
  });
});

// Cross-guild — searches by Discord user ID across every server's warnings
// and mod notes (see the multi-tenant isolation exception documented for
// this owner-only tool).
router.get('/admin/lookup/:userId', async (req, res) => {
  const client = req.app.locals.discordClient;
  const [warnings, notes, modActions] = await Promise.all([
    db.getWarningsForUser(req.params.userId),
    db.getModNotesForUser(req.params.userId),
    db.getModActionsForUser(req.params.userId),
  ]);
  const withGuildName = (rows) => rows.map((r) => ({ ...r, guildName: client.guilds.cache.get(r.guild_id)?.name || r.guild_id }));
  res.json({
    warnings: withGuildName(warnings),
    notes: withGuildName(notes),
    modActions: withGuildName(modActions),
  });
});

router.get('/admin/maintenance', async (req, res) => {
  res.json({
    enabled: (await db.getSiteSetting('maintenance_mode')) === '1',
    message: (await db.getSiteSetting('maintenance_message')) || '',
  });
});

router.post('/admin/maintenance', async (req, res) => {
  const { enabled, message } = req.body;
  await db.setSiteSetting('maintenance_mode', enabled ? '1' : '0');
  await db.setSiteSetting('maintenance_message', message || '');
  await db.logAdminAction(req.user.id, 'maintenance_mode', enabled ? `Enabled: ${message || ''}` : 'Disabled');
  res.json({ ok: true });
});

router.get('/admin/servers', async (req, res) => {
  const client = req.app.locals.discordClient;
  const guilds = await Promise.all(
    [...client.guilds.cache.values()].map(async (g) => {
      const cfg = await db.getGuildConfig(g.id);
      return {
        id: g.id,
        name: g.name,
        icon: g.iconURL() || null,
        memberCount: g.memberCount,
        ownerId: g.ownerId,
        joinedAt: g.joinedAt ? g.joinedAt.toISOString() : null,
        vipActive: cfg.vip_active,
        vipTier: cfg.vip_tier,
      };
    })
  );
  res.json(guilds.sort((a, b) => b.memberCount - a.memberCount));
});

router.post('/admin/servers/:guildId/leave', async (req, res) => {
  const client = req.app.locals.discordClient;
  const guild = client.guilds.cache.get(req.params.guildId);
  if (!guild) return res.status(404).json({ error: 'Server not found' });
  await guild.leave();
  await db.logAdminAction(req.user.id, 'leave_server', `Left "${guild.name}" (${guild.id})`);
  res.json({ ok: true });
});

router.post('/admin/broadcast', async (req, res) => {
  const { guildId, channelId, content, embedTitle, embedDescription, embedColor } = req.body;
  const client = req.app.locals.discordClient;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(400).json({ error: 'Invalid server' });
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return res.status(400).json({ error: 'Invalid channel' });
  if (!content?.trim() && !embedDescription?.trim()) return res.status(400).json({ error: 'Provide a message or an embed description' });

  try {
    const payload = {};
    if (content?.trim()) payload.content = content.trim();
    if (embedDescription?.trim()) {
      payload.embeds = [
        new EmbedBuilder().setTitle(embedTitle?.trim() || null).setDescription(embedDescription.trim()).setColor(embedColor || config.brandColor),
      ];
    }
    await channel.send(payload);
    // Beyond the chosen channel, every broadcast also DMs the server owner,
    // posts a distinctly-styled copy to the mod log, and pushes a live
    // banner to anyone currently viewing that server's dashboard.
    await sendAnnouncementToGuild(guild, {
      title: embedTitle?.trim() || 'Announcement',
      description: embedDescription?.trim() || content?.trim(),
      color: embedColor,
      skipModLogChannelId: channelId,
    });
    await db.logAdminAction(req.user.id, 'broadcast', `Sent to #${channel.name} in "${guild.name}" (${guild.id})`);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Broadcasts to every server the bot is in: DMs each server's owner, posts
// a distinctly-styled announcement to each server's mod log (if configured),
// and pushes a site-wide live banner to every connected dashboard visitor.
router.post('/admin/broadcast-all', async (req, res) => {
  const { content, embedTitle, embedDescription, embedColor } = req.body;
  if (!content?.trim() && !embedDescription?.trim()) return res.status(400).json({ error: 'Provide a message or an embed description' });
  const client = req.app.locals.discordClient;

  const announcementBody = { title: embedTitle?.trim() || 'Announcement', description: embedDescription?.trim() || content?.trim(), color: embedColor };

  let sent = 0;
  let failed = 0;
  for (const guild of client.guilds.cache.values()) {
    try {
      await sendAnnouncementToGuild(guild, { ...announcementBody, skipBanner: true });
      sent++;
    } catch {
      failed++;
    }
  }
  // One site-wide banner for the whole broadcast, not one per server.
  broadcastSiteWideBanner(announcementBody);

  await db.logAdminAction(req.user.id, 'broadcast_all', `Sent to ${sent} server(s), failed ${failed}`);
  res.json({ ok: true, sent, skipped: failed });
});

router.post('/admin/redeploy-commands', (req, res) => {
  execFile('node', [path.join(__dirname, '../../bot/deploy-commands.js')], { timeout: 60_000 }, async (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: stderr || err.message });
    await db.logAdminAction(req.user.id, 'redeploy_commands', null);
    res.json({ ok: true, output: stdout });
  });
});

router.post('/admin/restart', async (req, res) => {
  await db.logAdminAction(req.user.id, 'restart', null);
  res.json({ ok: true });
  setTimeout(() => {
    // Exit non-zero so systemd's "Restart=on-failure" policy brings the
    // process back up — a clean exit(0) would NOT trigger a restart.
    process.exit(1);
  }, 500);
});

// ---- VIP codes & manual grants (owner-only) ----
router.get('/admin/vip/codes', async (req, res) => {
  res.json(await db.getVipCodes());
});

router.post('/admin/vip/codes', async (req, res) => {
  const { duration, quantity, note } = req.body;
  if (!['month', 'year', 'lifetime'].includes(duration)) return res.status(400).json({ error: 'duration must be "month", "year", or "lifetime"' });
  const qty = Math.min(Math.max(Number(quantity) || 1, 1), 50);
  const codes = await db.generateVipCodes(req.user.id, duration, qty, note || null);
  await db.logAdminAction(req.user.id, 'generate_vip_codes', `${codes.length}x ${duration}${note ? ` — ${note}` : ''}`);
  res.json({ codes });
});

router.delete('/admin/vip/codes/:id', async (req, res) => {
  const result = await db.deleteVipCode(req.params.id);
  if (!result.changes) return res.status(400).json({ error: 'Code not found or already redeemed' });
  res.json({ ok: true });
});

router.get('/admin/vip/servers', async (req, res) => {
  const client = req.app.locals.discordClient;
  const guilds = [...client.guilds.cache.values()];
  const withVip = await Promise.all(
    guilds.map(async (g) => {
      const cfg = await db.getGuildConfig(g.id);
      return { id: g.id, name: g.name, active: cfg.vip_active, tier: cfg.vip_tier, expiresAt: cfg.vip_expires_at };
    })
  );
  res.json(withVip.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)));
});

router.post('/admin/vip/grant', async (req, res) => {
  const { guildId, tier } = req.body;
  const client = req.app.locals.discordClient;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(400).json({ error: 'Invalid server' });
  if (!['month', 'year', 'lifetime'].includes(tier)) return res.status(400).json({ error: 'tier must be "month", "year", or "lifetime"' });
  const cfg = await db.grantVip(guildId, tier, db.vipExpiryFor(tier), null);
  await db.logAdminAction(req.user.id, 'grant_vip', `Manually granted ${tier} VIP to "${guild.name}" (${guildId})`);
  res.json(cfg);
});

router.post('/admin/vip/revoke', async (req, res) => {
  const { guildId } = req.body;
  const client = req.app.locals.discordClient;
  const guild = client.guilds.cache.get(guildId);
  const cfg = await db.revokeVip(guildId);
  await db.logAdminAction(req.user.id, 'revoke_vip', `Revoked VIP from "${guild?.name || guildId}"`);
  res.json(cfg);
});

router.get('/admin/vip/stats', async (req, res) => {
  res.json(await db.getVipStats());
});

router.get('/admin/activity', async (req, res) => {
  res.json(await db.getAdminAuditLog(200));
});

module.exports = router;
