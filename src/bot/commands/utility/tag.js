const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../../../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tag')
    .setDescription('Manage custom text commands (triggered with ! prefix)')
    .addSubcommand((sc) =>
      sc
        .setName('add')
        .setDescription('Add or update a custom command')
        .addStringOption((o) => o.setName('trigger').setDescription('Word that triggers it (after !)').setRequired(true))
        .addStringOption((o) => o.setName('response').setDescription('Text response').setRequired(true))
    )
    .addSubcommand((sc) =>
      sc.setName('remove').setDescription('Remove a custom command').addStringOption((o) => o.setName('trigger').setDescription('Trigger to remove').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((sc) => sc.setName('list').setDescription('List all custom commands'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const tags = await db.getCustomCommands(interaction.guild.id);
    const filtered = tags.filter((t) => t.trigger.includes(focused.toLowerCase())).slice(0, 25);
    await interaction.respond(filtered.map((t) => ({ name: t.trigger, value: t.trigger })));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const tags = await db.getCustomCommands(interaction.guild.id);
      if (!tags.length) return interaction.reply({ content: 'No custom commands yet.', flags: MessageFlags.Ephemeral });
      return interaction.reply({ content: tags.map((t) => `\`!${t.trigger}\``).join(', '), flags: MessageFlags.Ephemeral });
    }

    if (sub === 'add') {
      const trigger = interaction.options.getString('trigger', true);
      const response = interaction.options.getString('response', true);
      await db.upsertCustomCommand(interaction.guild.id, trigger, response, null);
      return interaction.reply({ content: `Saved custom command \`!${trigger.toLowerCase()}\`.` });
    }

    if (sub === 'remove') {
      const trigger = interaction.options.getString('trigger', true);
      const cmd = await db.getCustomCommand(interaction.guild.id, trigger);
      if (!cmd) return interaction.reply({ content: 'No such command.', flags: MessageFlags.Ephemeral });
      await db.deleteCustomCommand(interaction.guild.id, cmd.id);
      return interaction.reply({ content: `Removed \`!${trigger.toLowerCase()}\`.` });
    }
  },
};
