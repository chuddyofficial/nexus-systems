const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../../database/db');
const config = require('../../../config');
const { toDate } = require('../../utils/date');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('note')
    .setDescription('Private moderator notes about a member (not shown to the member)')
    .addSubcommand((sc) =>
      sc
        .setName('add')
        .setDescription('Add a note about a member')
        .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
        .addStringOption((o) => o.setName('note').setDescription('Note content').setRequired(true))
    )
    .addSubcommand((sc) => sc.setName('list').setDescription('List notes for a member').addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('user', true);

    if (sub === 'add') {
      const note = interaction.options.getString('note', true);
      await db.addModNote(interaction.guild.id, targetUser.id, interaction.user.id, note);
      return interaction.reply({ content: `📝 Note added for **${targetUser.tag}**.`, flags: MessageFlags.Ephemeral });
    }

    const notes = await db.getModNotes(interaction.guild.id, targetUser.id);
    if (!notes.length) return interaction.reply({ content: `No notes for ${targetUser.tag}.`, flags: MessageFlags.Ephemeral });

    const embed = new EmbedBuilder()
      .setTitle(`Notes for ${targetUser.tag}`)
      .setColor(config.brandColor)
      .setDescription(notes.slice(0, 15).map((n) => `**#${n.id}** — ${n.note}\n<t:${Math.floor(toDate(n.created_at).getTime() / 1000)}:R> by <@${n.moderator_id}>`).join('\n\n'));

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
