const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../../../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Manage reaction roles')
    .addSubcommand((sc) =>
      sc
        .setName('add')
        .setDescription('Add a reaction role to a message')
        .addStringOption((o) => o.setName('message_id').setDescription('ID of the message').setRequired(true))
        .addStringOption((o) => o.setName('emoji').setDescription('Emoji to react with (unicode or custom)').setRequired(true))
        .addRoleOption((o) => o.setName('role').setDescription('Role to grant').setRequired(true))
    )
    .addSubcommand((sc) => sc.setName('list').setDescription('List reaction roles in this server'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const rows = await db.getReactionRoles(interaction.guild.id);
      if (!rows.length) return interaction.reply({ content: 'No reaction roles configured.', flags: MessageFlags.Ephemeral });
      const lines = rows.map((r) => `#${r.id} — <#${r.channel_id}> msg \`${r.message_id}\`: ${r.emoji} → <@&${r.role_id}>`);
      return interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
    }

    const messageId = interaction.options.getString('message_id', true);
    const emojiInput = interaction.options.getString('emoji', true);
    const role = interaction.options.getRole('role', true);

    const message = await interaction.channel.messages.fetch(messageId).catch(() => null);
    if (!message) {
      return interaction.reply({ content: "Couldn't find that message in this channel.", flags: MessageFlags.Ephemeral });
    }

    await message.react(emojiInput).catch(() => {});
    const emojiMatch = emojiInput.match(/^<a?:\w+:(\d+)>$/);
    const emojiKey = emojiMatch ? emojiMatch[1] : emojiInput;

    await db.addReactionRole(interaction.guild.id, interaction.channel.id, messageId, emojiKey, role.id);
    await interaction.reply({ content: `Reaction role added: ${emojiInput} → ${role}`, flags: MessageFlags.Ephemeral });
  },
};
