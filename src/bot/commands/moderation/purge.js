const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { sendMessageLog } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk delete recent messages in this channel')
    .addIntegerOption((o) => o.setName('amount').setDescription('Number of messages (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((o) => o.setName('user').setDescription('Only delete messages from this user'))
    .addBooleanOption((o) => o.setName('bots_only').setDescription('Only delete messages from bots'))
    .addStringOption((o) => o.setName('contains').setDescription('Only delete messages containing this text'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount', true);
    const targetUser = interaction.options.getUser('user');
    const botsOnly = interaction.options.getBoolean('bots_only');
    const contains = interaction.options.getString('contains');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const messages = await interaction.channel.messages.fetch({ limit: 100 });
    let toDelete = [...messages.values()];
    if (targetUser) toDelete = toDelete.filter((m) => m.author.id === targetUser.id);
    if (botsOnly) toDelete = toDelete.filter((m) => m.author.bot);
    if (contains) toDelete = toDelete.filter((m) => m.content.toLowerCase().includes(contains.toLowerCase()));
    toDelete = toDelete.slice(0, amount);

    const deleted = await interaction.channel.bulkDelete(toDelete, true).catch(() => null);
    const count = deleted?.size ?? 0;

    await sendMessageLog(interaction.guild, {
      title: 'Messages Purged',
      description: `${interaction.user} purged ${count} message(s) in ${interaction.channel}${targetUser ? ` from ${targetUser}` : ''}`,
      color: 0xed4245,
    });

    await interaction.editReply({ content: `🧹 Deleted ${count} message(s). (Discord can only bulk-delete messages younger than 14 days.)` });
  },
};
