const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../../database/db');
const config = require('../../../config');
const { toDate } = require('../../utils/date');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View warnings for a member')
    .addUserOption((o) => o.setName('user').setDescription('User to check').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user', true);
    const warnings = await db.getWarnings(interaction.guild.id, targetUser.id);

    if (!warnings.length) {
      return interaction.reply({ content: `${targetUser.tag} has no warnings.`, flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setTitle(`Warnings for ${targetUser.tag}`)
      .setColor(config.brandColor)
      .setDescription(
        warnings
          .slice(0, 15)
          .map((w) => `**#${w.id}** — ${w.reason}\n<t:${Math.floor(toDate(w.created_at).getTime() / 1000)}:R> by <@${w.moderator_id}>`)
          .join('\n\n')
      )
      .setFooter({ text: `${warnings.length} total warning(s)` });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
