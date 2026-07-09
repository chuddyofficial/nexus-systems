const { MessageFlags, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const db = require('../../database/db');
const config = require('../../config');

const TICKET_CATEGORIES = ['General Support', 'Report a User', 'Billing / Other'];

async function postTranscript(guild, channel, ticket) {
  const cfg = await db.getGuildConfig(guild.id);
  if (!cfg.ticket_transcript_channel) return;
  const logChannel = guild.channels.cache.get(cfg.ticket_transcript_channel);
  if (!logChannel?.isTextBased()) return;

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) return;

  const lines = [...messages.values()]
    .reverse()
    .map((m) => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content || '[embed/attachment]'}`)
    .join('\n');

  const attachment = new AttachmentBuilder(Buffer.from(lines || 'No messages.', 'utf8'), {
    name: `transcript-${channel.name}.txt`,
  });

  const embed = new EmbedBuilder()
    .setTitle('🎫 Ticket Transcript')
    .setColor(config.brandColor)
    .addFields(
      { name: 'Opened by', value: `<@${ticket.user_id}>`, inline: true },
      { name: 'Category', value: ticket.category || 'General', inline: true },
      { name: 'Claimed by', value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : 'Unclaimed', inline: true }
    )
    .setTimestamp(new Date());

  await logChannel.send({ embeds: [embed], files: [attachment] }).catch(() => {});
}

async function closeCurrentTicket(interaction) {
  const ticket = await db.getTicketByChannel(interaction.channel.id);
  if (!ticket || ticket.status !== 'open') {
    await interaction.reply({ content: 'This is not an open ticket channel.', flags: MessageFlags.Ephemeral });
    return;
  }
  await db.closeTicket(interaction.guild.id, interaction.channel.id);
  await interaction.reply('🔒 Closing this ticket in 5 seconds...');
  await postTranscript(interaction.guild, interaction.channel, ticket);
  setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
}

module.exports = { closeCurrentTicket, postTranscript, TICKET_CATEGORIES };
