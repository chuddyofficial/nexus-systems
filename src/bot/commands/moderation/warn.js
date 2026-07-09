const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { performWarn } = require('../../utils/modActions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member')
    .addUserOption((o) => o.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the warning').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);

    const warning = await performWarn(interaction.guild, targetUser, interaction.user, reason);
    await interaction.reply({ content: `⚠️ Warned **${targetUser.tag}** (warning #${warning.id}). Reason: ${reason}` });

    await targetUser
      .send(`You were warned in **${interaction.guild.name}**. Reason: ${reason}`)
      .catch(() => {});
  },
};
