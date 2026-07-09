const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("View a member's avatar in full size")
    .addUserOption((o) => o.setName('user').setDescription('User to inspect'))
    .setDMPermission(false),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const embed = new EmbedBuilder()
      .setTitle(`${targetUser.tag}'s avatar`)
      .setImage(targetUser.displayAvatarURL({ size: 1024 }))
      .setColor(config.brandColor);
    await interaction.reply({ embeds: [embed] });
  },
};
