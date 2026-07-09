const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../../../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setlogs')
    .setDescription('Configure logging channels for this server')
    .addSubcommand((sc) =>
      sc
        .setName('modlog')
        .setDescription('Set the moderation action log channel')
        .addChannelOption((o) => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName('messagelog')
        .setDescription('Set the message edit/delete log channel')
        .addChannelOption((o) => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName('joinlog')
        .setDescription('Set the member join/leave log channel')
        .addChannelOption((o) => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const channel = interaction.options.getChannel('channel', true);
    const columnMap = { modlog: 'mod_log_channel', messagelog: 'message_log_channel', joinlog: 'join_log_channel' };
    db.updateGuildConfig(interaction.guild.id, { [columnMap[sub]]: channel.id });
    await interaction.reply({ content: `Set ${sub} channel to ${channel}.` });
  },
};
