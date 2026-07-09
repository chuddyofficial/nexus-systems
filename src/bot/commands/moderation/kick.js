const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { performKick } = require('../../utils/modActions');
const { canModerate } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .addUserOption((o) => o.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the kick'))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      return interaction.reply({ content: 'That user is not in this server.', flags: MessageFlags.Ephemeral });
    }
    if (!canModerate(interaction.member, targetMember)) {
      return interaction.reply({ content: "You can't kick that user (role hierarchy).", flags: MessageFlags.Ephemeral });
    }

    try {
      await performKick(interaction.guild, targetMember, interaction.user, reason);
      await interaction.reply({ content: `👢 Kicked **${targetUser.tag}**. Reason: ${reason}` });
    } catch (err) {
      await interaction.reply({ content: `Failed to kick: ${err.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
