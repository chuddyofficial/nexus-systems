const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('../../../config');

module.exports = {
  data: new SlashCommandBuilder().setName('dashboard').setDescription('Get the link to the web dashboard'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('Web Dashboard')
      .setDescription(`Configure everything for **${interaction.guild?.name ?? 'this bot'}** here:\n${config.dashboardUrl}`)
      .setColor(config.brandColor);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
