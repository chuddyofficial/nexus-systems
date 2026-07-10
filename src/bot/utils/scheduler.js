const { EmbedBuilder } = require('discord.js');
const db = require('../../database/db');
const { sendModLog, pushConsole } = require('./logger');
const { processDueGiveaways } = require('./giveaways');
const { postTranscript } = require('./tickets');

const CHECK_INTERVAL_MS = 20_000;
let lastVipReminderDate = null; // "YYYY-MM-DD" — gates the once-a-day VIP expiry sweep

async function processDueScheduledActions(client) {
  const due = await db.getDueScheduledActions();
  for (const row of due) {
    await db.markScheduledActionExecuted(row.id);
    const payload = JSON.parse(row.payload);
    const guild = client.guilds.cache.get(row.guild_id);
    if (!guild) continue;

    try {
      if (row.action_type === 'tempban_unban') {
        await guild.members.unban(payload.userId, 'Temp-ban duration expired').catch(() => {});
        await db.logModAction(row.guild_id, payload.userId, client.user.id, 'unban', 'Temp-ban expired');
        await sendModLog(guild, {
          action: 'Unban (Temp-ban expired)',
          target: { id: payload.userId, tag: payload.userId },
          moderator: client.user,
          reason: 'Temp-ban duration expired',
          color: 0x57f287,
        });
      } else if (row.action_type === 'scheduled_announcement') {
        const channel = guild.channels.cache.get(payload.channelId);
        if (channel?.isTextBased()) {
          const embed = payload.embed ? new EmbedBuilder(payload.embed) : null;
          await channel.send({ content: payload.content || undefined, embeds: embed ? [embed] : [] });
        }
      }
    } catch (err) {
      pushConsole(row.guild_id, 'system', `Scheduled action ${row.action_type} failed: ${err.message}`);
    }
  }
}

function startScheduler(client) {
  setInterval(() => {
    processDueScheduledActions(client).catch((err) => console.error('[scheduler]', err));
    processDueGiveaways(client).catch((err) => console.error('[scheduler]', err));
    processStaleTickets(client).catch((err) => console.error('[scheduler]', err));
    processDueReminders(client).catch((err) => console.error('[scheduler]', err));
    processVipExpiryReminders(client).catch((err) => console.error('[scheduler]', err));
  }, CHECK_INTERVAL_MS);
  console.log('[scheduler] Started (interval ' + CHECK_INTERVAL_MS + 'ms)');
}

async function processDueReminders(client) {
  const due = await db.getDueReminders();
  for (const reminder of due) {
    await db.markReminderFulfilled(reminder.id);
    try {
      const user = await client.users.fetch(reminder.user_id);
      const text = `⏰ **Reminder:** ${reminder.message}`;
      const sent = await user.send(text).catch(() => null);
      if (!sent) {
        const guild = reminder.guild_id ? client.guilds.cache.get(reminder.guild_id) : null;
        const channel = guild?.channels.cache.get(reminder.channel_id);
        if (channel?.isTextBased()) await channel.send(`<@${reminder.user_id}> ${text}`).catch(() => {});
      }
    } catch (err) {
      pushConsole(reminder.guild_id, 'system', `Reminder ${reminder.id} failed to send: ${err.message}`);
    }
  }
}

async function processVipExpiryReminders(client) {
  const today = new Date().toISOString().slice(0, 10);
  if (lastVipReminderDate === today) return;
  lastVipReminderDate = today;

  const expiring = await db.getGuildsWithExpiringVip(7);
  for (const row of expiring) {
    const guild = client.guilds.cache.get(row.guild_id);
    if (!guild) continue;
    const cfg = await db.getGuildConfig(row.guild_id);
    const channel = cfg.mod_log_channel ? guild.channels.cache.get(cfg.mod_log_channel) : null;
    const expiresText = `<t:${Math.floor(new Date(row.vip_expires_at.replace(' ', 'T') + 'Z').getTime() / 1000)}:R>`;
    const text = `💎 This server's VIP expires ${expiresText}. Contact the Nexus Systems team to renew.`;
    if (channel?.isTextBased()) {
      channel.send(text).catch(() => {});
    }
    pushConsole(row.guild_id, 'system', `VIP expiry reminder: expires ${row.vip_expires_at}`);
  }
}

async function processStaleTickets(client) {
  const stale = await db.getAllStaleTickets();
  for (const ticket of stale) {
    const guild = client.guilds.cache.get(ticket.guild_id);
    if (!guild) continue;
    try {
      const panel = ticket.panel_id ? await db.getTicketPanel(ticket.guild_id, ticket.panel_id) : null;
      await db.closeTicket(ticket.guild_id, ticket.channel_id);
      const channel = guild.channels.cache.get(ticket.channel_id);
      if (channel) {
        await postTranscript(guild, channel, ticket, panel).catch(() => {});
        await channel.send('🔒 This ticket was automatically closed due to inactivity.').catch(() => {});
        setTimeout(() => channel.delete().catch(() => {}), 10_000);
      }
      pushConsole(ticket.guild_id, 'system', `Auto-closed inactive ticket #${ticket.id}`);
    } catch (err) {
      pushConsole(ticket.guild_id, 'system', `Failed to auto-close ticket #${ticket.id}: ${err.message}`);
    }
  }
}

module.exports = { startScheduler };
