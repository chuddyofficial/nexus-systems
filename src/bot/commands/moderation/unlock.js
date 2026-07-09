const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock the current channel (restore @everyone Send Messages)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
    await interaction.reply({ content: '🔓 Channel unlocked.' });
  },
};
