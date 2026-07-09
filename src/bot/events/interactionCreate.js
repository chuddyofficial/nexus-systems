const { MessageFlags, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database/db');
const config = require('../../config');
const { closeCurrentTicket } = require('../utils/tickets');

async function handleTicketOpen(interaction) {
  const cfg = db.getGuildConfig(interaction.guild.id);
  if (!cfg.ticket_category_id || !cfg.ticket_support_role_id) {
    return interaction.reply({ content: 'The ticket system is not configured yet.', flags: MessageFlags.Ephemeral });
  }

  const existing = db.getOpenTickets(interaction.guild.id).find((t) => t.user_id === interaction.user.id);
  if (existing) {
    const stillExists = interaction.guild.channels.cache.has(existing.channel_id);
    if (stillExists) {
      return interaction.reply({ content: `You already have an open ticket: <#${existing.channel_id}>`, flags: MessageFlags.Ephemeral });
    }
    // Channel was deleted outside of /ticket close (e.g. manually) — the DB row was
    // never marked closed, which would otherwise permanently block this user from
    // opening a new ticket. Reconcile it here instead.
    db.closeTicket(interaction.guild.id, existing.channel_id);
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channel = await interaction.guild.channels.create({
    name: `ticket-${interaction.user.username}`.slice(0, 90),
    type: ChannelType.GuildText,
    parent: cfg.ticket_category_id,
    permissionOverwrites: [
      { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: cfg.ticket_support_role_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ],
  });

  db.createTicket(interaction.guild.id, channel.id, interaction.user.id);

  const embed = new EmbedBuilder()
    .setTitle('🎫 Ticket Opened')
    .setDescription(`Hi ${interaction.user}, support will be with you shortly.\nUse \`/ticket close\` when this is resolved.`)
    .setColor(config.brandColor);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)
  );

  await channel.send({ content: `${interaction.user} <@&${cfg.ticket_support_role_id}>`, embeds: [embed], components: [row] });
  await interaction.editReply({ content: `Ticket created: ${channel}` });
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction, client);
      } catch (err) {
        console.error(`[command:${interaction.commandName}]`, err);
        const payload = { content: 'Something went wrong running that command.', flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload).catch(() => {});
        } else {
          await interaction.reply(payload).catch(() => {});
        }
      }
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (!command?.autocomplete) return;
      try {
        await command.autocomplete(interaction, client);
      } catch (err) {
        console.error(`[autocomplete:${interaction.commandName}]`, err);
      }
      return;
    }

    if (interaction.isButton()) {
      try {
        if (interaction.customId === 'ticket_open') return await handleTicketOpen(interaction);
        if (interaction.customId === 'ticket_close') return await closeCurrentTicket(interaction);
      } catch (err) {
        console.error('[button]', err);
        const payload = { content: 'Something went wrong.', flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
        else await interaction.reply(payload).catch(() => {});
      }
    }
  },
};
