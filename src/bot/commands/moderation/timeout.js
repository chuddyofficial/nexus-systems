const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { performTimeout } = require('../../utils/modActions');
const { canModerate } = require('../../utils/permissions');

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout (mute) a member for a duration')
    .addUserOption((o) => o.setName('user').setDescription('User to timeout').setRequired(true))
    .addIntegerOption((o) =>
      o.setName('minutes').setDescription('Duration in minutes (max 40320 = 28 days)').setRequired(true).setMinValue(1).setMaxValue(40320)
    )
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the timeout'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user', true);
    const minutes = interaction.options.getInteger('minutes', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const durationMs = Math.min(minutes * 60 * 1000, MAX_TIMEOUT_MS);

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      return interaction.reply({ content: 'That user is not in this server.', flags: MessageFlags.Ephemeral });
    }
    if (!canModerate(interaction.member, targetMember)) {
      return interaction.reply({ content: "You can't timeout that user (role hierarchy).", flags: MessageFlags.Ephemeral });
    }

    try {
      await performTimeout(interaction.guild, targetMember, interaction.user, durationMs, reason);
      await interaction.reply({ content: `🔇 Timed out **${targetUser.tag}** for ${minutes} minute(s). Reason: ${reason}` });
    } catch (err) {
      await interaction.reply({ content: `Failed to timeout: ${err.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
