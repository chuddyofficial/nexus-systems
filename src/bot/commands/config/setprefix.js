const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setprefix')
    .setDescription('Change the prefix used for custom text commands (default: !)')
    .addStringOption((o) => o.setName('prefix').setDescription('New prefix, e.g. ? or $').setRequired(true).setMaxLength(5))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    const prefix = interaction.options.getString('prefix', true);
    await db.updateGuildConfig(interaction.guild.id, { prefix });
    await interaction.reply({ content: `Custom command prefix set to \`${prefix}\`.` });
  },
};
