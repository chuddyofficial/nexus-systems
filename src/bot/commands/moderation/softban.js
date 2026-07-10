const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { performSoftban } = require('../../utils/modActions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('softban')
    .setDescription('Ban and immediately unban a member, purging their recent messages')
    .addUserOption((o) => o.setName('user').setDescription('User to softban').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the softban'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';

    await interaction.deferReply();
    await performSoftban(interaction.guild, targetUser, interaction.user, reason);
    await interaction.editReply(`🧹 Softbanned **${targetUser.tag}** — their recent messages were purged. Reason: ${reason}`);
  },
};
