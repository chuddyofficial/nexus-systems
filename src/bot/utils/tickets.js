const { MessageFlags } = require('discord.js');
const db = require('../../database/db');

async function closeCurrentTicket(interaction) {
  const openTickets = db.getOpenTickets(interaction.guild.id);
  const ticket = openTickets.find((t) => t.channel_id === interaction.channel.id);
  if (!ticket) {
    await interaction.reply({ content: 'This is not an open ticket channel.', flags: MessageFlags.Ephemeral });
    return;
  }
  db.closeTicket(interaction.guild.id, interaction.channel.id);
  await interaction.reply('🔒 Closing this ticket in 5 seconds...');
  setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
}

module.exports = { closeCurrentTicket };
