const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set slowmode for the current channel')
    .addIntegerOption((o) => o.setName('seconds').setDescription('Seconds between messages (0 to disable, max 21600)').setRequired(true).setMinValue(0).setMaxValue(21600))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),

  async execute(interaction) {
    const seconds = interaction.options.getInteger('seconds', true);
    await interaction.channel.setRateLimitPerUser(seconds);
    await interaction.reply({
      content: seconds === 0 ? 'Slowmode disabled.' : `🐌 Slowmode set to ${seconds} second(s).`,
    });
  },
};
