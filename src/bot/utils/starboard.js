const { EmbedBuilder } = require('discord.js');
const db = require('../../database/db');

async function handleStarReaction(reaction, user) {
  if (user.bot) return;
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch {
      return;
    }
  }
  const message = reaction.message;
  if (!message.guild) return;

  const cfg = await db.getGuildConfig(message.guild.id);
  if (!cfg.starboard_enabled || !cfg.starboard_channel) return;
  if (reaction.emoji.name !== cfg.starboard_emoji) return;
  if (message.channel.id === cfg.starboard_channel) return;

  const starCount = reaction.count ?? 0;
  if (starCount < cfg.starboard_threshold) return;

  const starChannel = message.guild.channels.cache.get(cfg.starboard_channel);
  if (!starChannel?.isTextBased()) return;

  const existing = await db.getStarboardPost(message.guild.id, message.id);

  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setAuthor({ name: message.author?.tag ?? 'Unknown', iconURL: message.author?.displayAvatarURL() })
    .setDescription(message.content || '*(no text content)*')
    .addFields({ name: 'Source', value: `[Jump to message](${message.url}) in ${message.channel}` })
    .setTimestamp(message.createdAt);

  const firstImage = message.attachments.find((a) => a.contentType?.startsWith('image/'));
  if (firstImage) embed.setImage(firstImage.url);

  const content = `${cfg.starboard_emoji} **${starCount}** | ${message.channel}`;

  if (existing) {
    const starMessage = await starChannel.messages.fetch(existing.starboard_message_id).catch(() => null);
    if (starMessage) {
      await starMessage.edit({ content, embeds: [embed] }).catch(() => {});
      await db.upsertStarboardPost(message.guild.id, message.id, existing.starboard_message_id, starCount);
      return;
    }
  }

  const sent = await starChannel.send({ content, embeds: [embed] }).catch(() => null);
  if (sent) await db.upsertStarboardPost(message.guild.id, message.id, sent.id, starCount);
}

module.exports = { handleStarReaction };
