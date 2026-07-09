const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { performTempBan } = require('../../utils/modActions');
const { canModerate } = require('../../utils/permissions');

function parseDuration(input) {
  const match = /^(\d+)\s*(h|hr|hour|d|day)s?$/i.exec(input.trim());
  if (!match) return null;
  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers = { h: 3_600_000, hr: 3_600_000, hour: 3_600_000, d: 86_400_000, day: 86_400_000 };
  return amount * multipliers[unit];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tempban')
    .setDescription('Temporarily ban a member — automatically unbanned after the duration expires')
    .addUserOption((o) => o.setName('user').setDescription('User to temp-ban').setRequired(true))
    .addStringOption((o) => o.setName('duration').setDescription('e.g. 12h, 3d').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the ban'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user', true);
    const durationInput = interaction.options.getString('duration', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const durationMs = parseDuration(durationInput);
    if (!durationMs) {
      return interaction.reply({ content: 'Invalid duration. Use formats like `12h` or `3d`.', flags: MessageFlags.Ephemeral });
    }

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (targetMember && !canModerate(interaction.member, targetMember)) {
      return interaction.reply({ content: "You can't ban that user (role hierarchy).", flags: MessageFlags.Ephemeral });
    }

    try {
      await performTempBan(interaction.guild, targetUser, interaction.user, reason, durationMs);
      await interaction.reply({ content: `🔨 Temp-banned **${targetUser.tag}** for ${durationInput}. Reason: ${reason}` });
    } catch (err) {
      await interaction.reply({ content: `Failed to temp-ban: ${err.message}`, flags: MessageFlags.Ephemeral });
    }
  },
};
