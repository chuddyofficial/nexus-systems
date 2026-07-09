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
        .setDescription('Create and post a new ticket panel')
        .addStringOption((o) => o.setName('name').setDescription('Internal name for this panel (e.g. "General Support")').setRequired(true))
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
      const name = interaction.options.getString('name', true);
      const panelChannel = interaction.options.getChannel('panel_channel', true);
      const category = interaction.options.getChannel('category', true);
      const supportRole = interaction.options.getRole('support_role', true);

      const panel = await db.createTicketPanel(interaction.guild.id, name);
      await db.updateTicketPanel(interaction.guild.id, panel.id, {
        category_channel_id: category.id,
        support_role_id: supportRole.id,
      });

      const embed = new EmbedBuilder()
        .setTitle(panel.embed_title)
        .setDescription(panel.embed_description)
        .setColor(panel.embed_color || config.brandColor);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_open:${panel.id}`)
          .setLabel(panel.button_label)
          .setEmoji(panel.button_emoji || '🎫')
          .setStyle(ButtonStyle.Primary)
      );

      const panelMessage = await panelChannel.send({ embeds: [embed], components: [row] });
      await db.setTicketPanelMessage(interaction.guild.id, panel.id, panelChannel.id, panelMessage.id);

      return interaction.reply({
        content: `Ticket panel "${name}" created and posted in ${panelChannel}. Add categories or restyle it from the web dashboard's Tickets page.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'close') {
      await closeCurrentTicket(interaction);
    }
  },
};
