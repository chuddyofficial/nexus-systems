const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const config = require('../../../config');

module.exports = {
  data: new SlashCommandBuilder().setName('dashboard').setDescription('Get the link to the web dashboard'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('Web Dashboard')
      .setDescription(`Configure everything for **${interaction.guild?.name ?? 'this bot'}** here:\n${config.dashboardUrl}`)
      .setColor(config.brandColor);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Open Dashboard').setEmoji('🖥️').setStyle(ButtonStyle.Link).setURL(config.dashboardUrl)
    );
    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
  },
};
