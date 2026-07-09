const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { performBan } = require('../../utils/modActions');
const { canModerate } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .addUserOption((o) => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the ban'))
    .addIntegerOption((o) =>
      o.setName('delete_days').setDescription('Days of messages to delete (0-7)').setMinValue(0).setMaxValue(7)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const deleteDays = interaction.options.getInteger('delete_days') || 0;

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (targetMember && !canModerate(interaction.member, targetMember)) {
      return interaction.reply({ content: "You can't ban that user (role hierarchy).", flags: MessageFlags.Ephemeral });
    }

    try {
      await performBan(interaction.guild, targetUser, interaction.user, reason, deleteDays * 86400);
      await interaction.reply({ content: `🔨 Banned **${targetUser.tag}**. Reason: ${reason}` });
    } catch (err) {
      await interaction.reply({ content: `Failed to ban: ${err.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
