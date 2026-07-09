const { EmbedBuilder } = require('discord.js');
const db = require('../../database/db');
const { sendModLog, pushConsole } = require('./logger');
const { processDueGiveaways } = require('./giveaways');

const CHECK_INTERVAL_MS = 20_000;

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
  }, CHECK_INTERVAL_MS);
  console.log('[scheduler] Started (interval ' + CHECK_INTERVAL_MS + 'ms)');
}

async function processStaleTickets(client) {
  const stale = await db.getAllStaleTickets();
  for (const ticket of stale) {
    const guild = client.guilds.cache.get(ticket.guild_id);
    if (!guild) continue;
    try {
      await db.closeTicket(ticket.guild_id, ticket.channel_id);
      const channel = guild.channels.cache.get(ticket.channel_id);
      if (channel) {
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
