const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../../database/db');
const { sendModLog } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription('Clear all warnings for a member')
    .addUserOption((o) => o.setName('user').setDescription('User to clear warnings for').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user', true);
    const result = db.clearWarnings(interaction.guild.id, targetUser.id);
    db.logModAction(interaction.guild.id, targetUser.id, interaction.user.id, 'clear_warnings', `Cleared ${result.changes} warning(s)`);
    await sendModLog(interaction.guild, {
      action: 'Warnings Cleared',
      target: targetUser,
      moderator: interaction.user,
      reason: `${result.changes} warning(s) removed`,
      color: 0x57f287,
    });
    await interaction.reply({ content: `Cleared ${result.changes} warning(s) for **${targetUser.tag}**.` });
  },
};
