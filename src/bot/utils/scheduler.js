const { EmbedBuilder } = require('discord.js');
const db = require('../../database/db');
const { sendModLog, pushConsole } = require('./logger');
const config = require('../../config');

const CHECK_INTERVAL_MS = 20_000;

async function processDueScheduledActions(client) {
  const due = db.getDueScheduledActions();
  for (const row of due) {
    db.markScheduledActionExecuted(row.id);
    const payload = JSON.parse(row.payload);
    const guild = client.guilds.cache.get(row.guild_id);
    if (!guild) continue;

    try {
      if (row.action_type === 'tempban_unban') {
        await guild.members.unban(payload.userId, 'Temp-ban duration expired').catch(() => {});
        db.logModAction(row.guild_id, payload.userId, client.user.id, 'unban', 'Temp-ban expired');
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

async function processDueGiveaways(client) {
  const due = db.getDueGiveaways();
  for (const row of due) {
    db.markGiveawayEnded(row.id);
    const guild = client.guilds.cache.get(row.guild_id);
    if (!guild) continue;
    const channel = guild.channels.cache.get(row.channel_id);
    if (!channel?.isTextBased()) continue;

    try {
      const message = await channel.messages.fetch(row.message_id);
      const reaction = message.reactions.cache.get('🎉');
      const users = reaction ? (await reaction.users.fetch()).filter((u) => !u.bot) : new Map();
      const pool = [...users.values()];
      const winners = [];
      for (let i = 0; i < row.winner_count && pool.length; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        winners.push(pool.splice(idx, 1)[0]);
      }

      const resultEmbed = new EmbedBuilder()
        .setTitle('🎉 Giveaway Ended')
        .setDescription(
          winners.length
            ? `**Prize:** ${row.prize}\n**Winner(s):** ${winners.map((w) => `<@${w.id}>`).join(', ')}`
            : `**Prize:** ${row.prize}\nNo valid entries — no winner could be chosen.`
        )
        .setColor(config.brandColor)
        .setTimestamp(new Date());

      await message.edit({ embeds: [resultEmbed] }).catch(() => {});
      await channel.send({
        content: winners.length ? `🎉 Congratulations ${winners.map((w) => `<@${w.id}>`).join(', ')}! You won **${row.prize}**!` : `No winner could be determined for **${row.prize}**.`,
      });
    } catch (err) {
      pushConsole(row.guild_id, 'system', `Giveaway ${row.id} failed to resolve: ${err.message}`);
    }
  }
}

function startScheduler(client) {
  setInterval(() => {
    processDueScheduledActions(client).catch((err) => console.error('[scheduler]', err));
    processDueGiveaways(client).catch((err) => console.error('[scheduler]', err));
  }, CHECK_INTERVAL_MS);
  console.log('[scheduler] Started (interval ' + CHECK_INTERVAL_MS + 'ms)');
}

module.exports = { startScheduler };
