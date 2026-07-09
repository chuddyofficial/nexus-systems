const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { performUnban } = require('../../utils/modActions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user by ID')
    .addStringOption((o) => o.setName('user_id').setDescription('User ID to unban').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the unban'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const userId = interaction.options.getString('user_id', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';

    try {
      await performUnban(interaction.guild, userId, interaction.user, reason);
      await interaction.reply({ content: `Unbanned <@${userId}>.` });
    } catch (err) {
      await interaction.reply({ content: `Failed to unban: ${err.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
