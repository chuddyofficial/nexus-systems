const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { performBan } = require('../../utils/modActions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('massban')
    .setDescription('Ban multiple users at once by ID')
    .addStringOption((o) => o.setName('user_ids').setDescription('Space or comma-separated list of Discord user IDs').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason applied to every ban'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const raw = interaction.options.getString('user_ids', true);
    const reason = interaction.options.getString('reason') || 'Mass ban';
    const ids = [...new Set(raw.split(/[\s,]+/).filter((id) => /^\d{15,21}$/.test(id)))];

    if (!ids.length) {
      return interaction.reply({ content: 'No valid Discord IDs found in that list.', flags: MessageFlags.Ephemeral });
    }
    if (ids.length > 50) {
      return interaction.reply({ content: 'Limit is 50 IDs per run.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();

    let banned = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await performBan(interaction.guild, { id, tag: id }, interaction.user, reason);
        banned++;
      } catch {
        failed++;
      }
    }

    await interaction.editReply(`🔨 Mass ban complete — **${banned}** banned, **${failed}** failed, out of ${ids.length} ID(s).`);
  },
};
