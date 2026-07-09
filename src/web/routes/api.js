const express = require('express');
const { ChannelType, EmbedBuilder } = require('discord.js');
const db = require('../../database/db');
const config = require('../../config');
const { ensureAuthApi } = require('../middleware/ensureAuth');
const { ensureGuildAccess } = require('../middleware/ensureGuildAccess');
const { buildEmbedFromData } = require('../../bot/utils/embedBuilder');
const { performBan, performKick, performTimeout, performWarn, performTempBan } = require('../../bot/utils/modActions');

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
  const { userManagesGuild } = require('../middleware/ensureGuildAccess');
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

// ---- Guild config ----
router.get('/servers/:guildId/config', (req, res) => {
  res.json(db.getGuildConfig(req.params.guildId));
});

router.post('/servers/:guildId/config', (req, res) => {
  const updated = db.updateGuildConfig(req.params.guildId, req.body || {});
  res.json(updated);
});

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
router.get('/servers/:guildId/warnings', (req, res) => {
  res.json(db.getAllWarnings(req.params.guildId));
});

router.delete('/servers/:guildId/warnings/:id', (req, res) => {
  db.deleteWarning(req.params.guildId, req.params.id);
  res.json({ ok: true });
});

// ---- Mod log ----
router.get('/servers/:guildId/modlog', (req, res) => {
  res.json(db.getModActions(req.params.guildId, 200));
});

// ---- Moderation actions from dashboard ----
router.post('/servers/:guildId/moderation/warn', async (req, res) => {
  const { userId, reason } = req.body;
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
  try {
    const member = await req.botGuild.members.fetch(userId);
    await performTimeout(req.botGuild, member, req.user, Number(minutes) * 60 * 1000, reason || 'No reason provided');
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/servers/:guildId/moderation/tempban', async (req, res) => {
  const { userId, reason, hours } = req.body;
  try {
    const user = await req.app.locals.discordClient.users.fetch(userId);
    await performTempBan(req.botGuild, user, req.user, reason || 'No reason provided', Number(hours) * 3_600_000);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---- Reaction roles ----
router.get('/servers/:guildId/reactionroles', (req, res) => {
  res.json(db.getReactionRoles(req.params.guildId));
});

router.delete('/servers/:guildId/reactionroles/:id', (req, res) => {
  db.deleteReactionRole(req.params.guildId, req.params.id);
  res.json({ ok: true });
});

// ---- Custom commands ----
router.get('/servers/:guildId/customcommands', (req, res) => {
  res.json(db.getCustomCommands(req.params.guildId));
});

router.post('/servers/:guildId/customcommands', (req, res) => {
  const { trigger, response } = req.body;
  if (!trigger) return res.status(400).json({ error: 'trigger is required' });
  const saved = db.upsertCustomCommand(req.params.guildId, trigger, response, null);
  res.json(saved);
});

router.delete('/servers/:guildId/customcommands/:id', (req, res) => {
  db.deleteCustomCommand(req.params.guildId, req.params.id);
  res.json({ ok: true });
});

// ---- Saved / custom embeds ----
router.get('/servers/:guildId/embeds', (req, res) => {
  res.json(db.getSavedEmbeds(req.params.guildId));
});

router.post('/servers/:guildId/embeds', (req, res) => {
  const { name, embed } = req.body;
  if (!name || !embed) return res.status(400).json({ error: 'name and embed are required' });
  try {
    buildEmbedFromData(embed); // validate shape
  } catch (err) {
    return res.status(400).json({ error: `Invalid embed: ${err.message}` });
  }
  const saved = db.saveEmbed(req.params.guildId, name, JSON.stringify(embed), req.user.id);
  res.json(saved);
});

router.delete('/servers/:guildId/embeds/:id', (req, res) => {
  db.deleteSavedEmbed(req.params.guildId, req.params.id);
  res.json({ ok: true });
});

router.post('/servers/:guildId/embeds/send', async (req, res) => {
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
router.get('/servers/:guildId/leaderboard', (req, res) => {
  res.json(db.getLeaderboard(req.params.guildId, 50));
});

// ---- Moderator notes ----
router.get('/servers/:guildId/notes', (req, res) => {
  res.json(db.getAllModNotes(req.params.guildId));
});

router.get('/servers/:guildId/notes/:userId', (req, res) => {
  res.json(db.getModNotes(req.params.guildId, req.params.userId));
});

router.post('/servers/:guildId/notes', (req, res) => {
  const { userId, note } = req.body;
  if (!userId || !note) return res.status(400).json({ error: 'userId and note are required' });
  const saved = db.addModNote(req.params.guildId, userId, req.user.id, note);
  res.json(saved);
});

router.delete('/servers/:guildId/notes/:id', (req, res) => {
  db.deleteModNote(req.params.guildId, req.params.id);
  res.json({ ok: true });
});

// ---- Tickets ----
router.get('/servers/:guildId/tickets', (req, res) => {
  res.json(db.getAllTickets(req.params.guildId));
});

router.post('/servers/:guildId/tickets/setup', async (req, res) => {
  const { panelChannelId, categoryId, supportRoleId } = req.body;
  const panelChannel = req.botGuild.channels.cache.get(panelChannelId);
  if (!panelChannel?.isTextBased()) return res.status(400).json({ error: 'Invalid panel channel' });

  try {
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const embed = new EmbedBuilder()
      .setTitle('🎫 Support Tickets')
      .setDescription('Click the button below to open a private ticket with our support team.')
      .setColor(config.brandColor);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_open').setLabel('Open a Ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary)
    );
    const panelMessage = await panelChannel.send({ embeds: [embed], components: [row] });

    db.updateGuildConfig(req.params.guildId, {
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
  const tickets = db.getAllTickets(req.params.guildId, 500);
  const ticket = tickets.find((t) => String(t.id) === req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  db.closeTicket(req.params.guildId, ticket.channel_id);
  const channel = req.botGuild.channels.cache.get(ticket.channel_id);
  if (channel) await channel.delete().catch(() => {});
  res.json({ ok: true });
});

// ---- Giveaways ----
router.get('/servers/:guildId/giveaways', (req, res) => {
  res.json(db.getAllGiveaways(req.params.guildId));
});

router.post('/servers/:guildId/giveaways', async (req, res) => {
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
    const saved = db.createGiveaway(req.params.guildId, channelId, message.id, prize, winnerCount || 1, req.user.id, endsAt.toISOString().replace('T', ' ').slice(0, 19));
    res.json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---- Suggestions ----
router.get('/servers/:guildId/suggestions', (req, res) => {
  res.json(db.getSuggestions(req.params.guildId));
});

router.post('/servers/:guildId/suggestions/:id/status', async (req, res) => {
  const { status } = req.body; // 'approved' | 'denied' | 'pending'
  if (!['approved', 'denied', 'pending'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.setSuggestionStatus(req.params.guildId, req.params.id, status);

  const suggestion = db.getSuggestions(req.params.guildId, 1000).find((s) => String(s.id) === req.params.id);
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
router.get('/servers/:guildId/analytics', (req, res) => {
  const actions = db.getModActions(req.params.guildId, 1000);
  const warnings = db.getAllWarnings(req.params.guildId);

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
  const query = (req.query.q || '').toLowerCase();

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
router.get('/servers/:guildId/backup', (req, res) => {
  const cfg = db.getGuildConfig(req.params.guildId);
  const { guild_id, updated_at, ...rest } = cfg;
  res.json({ exportedAt: new Date().toISOString(), guildName: req.botGuild.name, config: rest });
});

router.post('/servers/:guildId/restore', (req, res) => {
  const { config: patch } = req.body;
  if (!patch || typeof patch !== 'object') return res.status(400).json({ error: 'Invalid backup file' });
  const updated = db.updateGuildConfig(req.params.guildId, patch);
  res.json(updated);
});

module.exports = router;
