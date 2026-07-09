const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { performUntimeout } = require('../../utils/modActions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Remove a timeout from a member')
    .addUserOption((o) => o.setName('user').setDescription('User to remove timeout from').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      return interaction.reply({ content: 'That user is not in this server.', flags: MessageFlags.Ephemeral });
    }

    try {
      await performUntimeout(interaction.guild, targetMember, interaction.user, reason);
      await interaction.reply({ content: `🔊 Removed timeout from **${targetUser.tag}**.` });
    } catch (err) {
      await interaction.reply({ content: `Failed: ${err.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
