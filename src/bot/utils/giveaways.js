const { EmbedBuilder } = require('discord.js');
const db = require('../../database/db');
const { pushConsole } = require('./logger');
const config = require('../../config');

/**
 * Resolves a single giveaway row: picks winners from 🎉 reactors, edits the
 * original message, and announces the result. Shared by the background
 * scheduler (natural expiry) and the dashboard/bot "end now" actions, so
 * winner selection behaves identically no matter how it was triggered.
 */
async function eligiblePool(guild, users, row) {
  if (!row.required_role_id && !row.min_level) return [...users.values()];
  const pool = [];
  for (const user of users.values()) {
    if (row.required_role_id) {
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member?.roles.cache.has(row.required_role_id)) continue;
    }
    if (row.min_level) {
      const level = await db.getLevel(guild.id, user.id).catch(() => null);
      if (!level || level.level < row.min_level) continue;
    }
    pool.push(user);
  }
  return pool;
}

async function resolveGiveaway(client, row) {
  const guild = client.guilds.cache.get(row.guild_id);
  if (!guild) throw new Error('Bot is not in that server.');
  const channel = guild.channels.cache.get(row.channel_id);
  if (!channel?.isTextBased()) throw new Error('Giveaway channel no longer exists.');

  const message = await channel.messages.fetch(row.message_id);
  const reaction = message.reactions.cache.get('🎉');
  const users = reaction ? (await reaction.users.fetch()).filter((u) => !u.bot) : new Map();
  const pool = await eligiblePool(guild, users, row);
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
    content: winners.length
      ? `🎉 Congratulations ${winners.map((w) => `<@${w.id}>`).join(', ')}! You won **${row.prize}**!`
      : `No winner could be determined for **${row.prize}**.`,
  });

  return winners;
}

async function processDueGiveaways(client) {
  const due = await db.getDueGiveaways();
  for (const row of due) {
    await db.markGiveawayEnded(row.id);
    try {
      await resolveGiveaway(client, row);
    } catch (err) {
      pushConsole(row.guild_id, 'system', `Giveaway ${row.id} failed to resolve: ${err.message}`);
    }
  }
}

// Used by the dashboard's "End Now" button and a possible /giveaway end command.
async function endGiveawayNow(client, guildId, giveawayId) {
  const active = await db.getActiveGiveaways(guildId);
  const row = active.find((g) => String(g.id) === String(giveawayId));
  if (!row) throw new Error('Giveaway not found or already ended.');
  await db.markGiveawayEnded(row.id);
  return resolveGiveaway(client, row);
}

// Re-picks winner(s) from an already-ended giveaway's original reactor pool
// and posts a follow-up announcement — doesn't touch the ended/winner_count
// state, just runs selection again.
async function rerollGiveaway(client, guildId, giveawayId) {
  const all = await db.getAllGiveaways(guildId, 500);
  const row = all.find((g) => String(g.id) === String(giveawayId));
  if (!row) throw new Error('Giveaway not found.');
  if (!row.ended) throw new Error('Giveaway has not ended yet.');

  const guild = client.guilds.cache.get(row.guild_id);
  if (!guild) throw new Error('Bot is not in that server.');
  const channel = guild.channels.cache.get(row.channel_id);
  if (!channel?.isTextBased()) throw new Error('Giveaway channel no longer exists.');

  const message = await channel.messages.fetch(row.message_id);
  const reaction = message.reactions.cache.get('🎉');
  const users = reaction ? (await reaction.users.fetch()).filter((u) => !u.bot) : new Map();
  const pool = await eligiblePool(guild, users, row);
  const winners = [];
  for (let i = 0; i < row.winner_count && pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(idx, 1)[0]);
  }

  await channel.send({
    content: winners.length
      ? `🎉 **Reroll!** New winner(s) for **${row.prize}**: ${winners.map((w) => `<@${w.id}>`).join(', ')}!`
      : `No valid entries to reroll **${row.prize}** — no winner could be chosen.`,
  });

  return winners;
}

module.exports = { processDueGiveaways, endGiveawayNow, rerollGiveaway, resolveGiveaway };
