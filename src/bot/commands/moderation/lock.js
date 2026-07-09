const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock the current channel (deny @everyone Send Messages)')
    .addStringOption((o) => o.setName('reason').setDescription('Reason for locking'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),

  async execute(interaction) {
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await interaction.channel.permissionOverwrites.edit(
      interaction.guild.roles.everyone,
      { SendMessages: false },
      { reason }
    );
    await interaction.reply({ content: `🔒 Channel locked. Reason: ${reason}` });
  },
};
