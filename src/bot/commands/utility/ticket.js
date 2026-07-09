const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const db = require('../../../database/db');
const config = require('../../../config');
const { closeCurrentTicket } = require('../../utils/tickets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage the support ticket system')
    .addSubcommand((sc) =>
      sc
        .setName('setup')
        .setDescription('Post the ticket panel in a channel')
        .addChannelOption((o) => o.setName('panel_channel').setDescription('Where to post the "Open a Ticket" button').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addChannelOption((o) => o.setName('category').setDescription('Category new ticket channels are created under').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
        .addRoleOption((o) => o.setName('support_role').setDescription('Role that can see and manage tickets').setRequired(true))
    )
    .addSubcommand((sc) => sc.setName('close').setDescription('Close the current ticket channel'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const panelChannel = interaction.options.getChannel('panel_channel', true);
      const category = interaction.options.getChannel('category', true);
      const supportRole = interaction.options.getRole('support_role', true);

      const embed = new EmbedBuilder()
        .setTitle('🎫 Support Tickets')
        .setDescription('Click the button below to open a private ticket with our support team.')
        .setColor(config.brandColor);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_open').setLabel('Open a Ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary)
      );

      const panelMessage = await panelChannel.send({ embeds: [embed], components: [row] });

      db.updateGuildConfig(interaction.guild.id, {
        ticket_category_id: category.id,
        ticket_support_role_id: supportRole.id,
        ticket_panel_channel: panelChannel.id,
        ticket_panel_message: panelMessage.id,
      });

      return interaction.reply({ content: `Ticket panel posted in ${panelChannel}.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'close') {
      await closeCurrentTicket(interaction);
    }
  },
};
