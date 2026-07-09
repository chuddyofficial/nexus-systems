const {
  MessageFlags,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const db = require('../../database/db');
const config = require('../../config');
const { closeCurrentTicket, TICKET_CATEGORIES } = require('../utils/tickets');

async function handleTicketOpenClick(interaction) {
  const cfg = await db.getGuildConfig(interaction.guild.id);
  if (!cfg.ticket_category_id || !cfg.ticket_support_role_id) {
    return interaction.reply({ content: 'The ticket system is not configured yet.', flags: MessageFlags.Ephemeral });
  }

  const openTickets = await db.getOpenTickets(interaction.guild.id);
  const existing = openTickets.find((t) => t.user_id === interaction.user.id);
  if (existing) {
    const stillExists = interaction.guild.channels.cache.has(existing.channel_id);
    if (stillExists) {
      return interaction.reply({ content: `You already have an open ticket: <#${existing.channel_id}>`, flags: MessageFlags.Ephemeral });
    }
    // Channel was deleted outside of /ticket close (e.g. manually) — the DB row was
    // never marked closed, which would otherwise permanently block this user from
    // opening a new ticket. Reconcile it here instead.
    await db.closeTicket(interaction.guild.id, existing.channel_id);
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_category_select')
    .setPlaceholder('What do you need help with?')
    .addOptions(TICKET_CATEGORIES.map((c) => ({ label: c, value: c })));

  await interaction.reply({
    content: 'Pick a category to open your ticket:',
    components: [new ActionRowBuilder().addComponents(menu)],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleTicketCategorySelect(interaction) {
  const category = interaction.values[0];
  const cfg = await db.getGuildConfig(interaction.guild.id);

  await interaction.update({ content: `Opening your ticket (${category})...`, components: [] });

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

  await db.createTicket(interaction.guild.id, channel.id, interaction.user.id, category);

  const embed = new EmbedBuilder()
    .setTitle('🎫 Ticket Opened')
    .setDescription(`Hi ${interaction.user}, support will be with you shortly.\n**Category:** ${category}\nUse \`/ticket close\` or the button below when this is resolved.`)
    .setColor(config.brandColor);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setEmoji('🙋').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)
  );

  await channel.send({ content: `${interaction.user} <@&${cfg.ticket_support_role_id}>`, embeds: [embed], components: [row] });
  await interaction.editReply({ content: `Ticket created: ${channel}`, components: [] });
}

async function handleTicketClaim(interaction) {
  const ticket = await db.getTicketByChannel(interaction.channel.id);
  if (!ticket || ticket.status !== 'open') {
    return interaction.reply({ content: 'This is not an open ticket channel.', flags: MessageFlags.Ephemeral });
  }
  await db.claimTicket(interaction.guild.id, interaction.channel.id, interaction.user.id);
  await interaction.reply(`🙋 ${interaction.user} has claimed this ticket.`);
}

async function handleVerifyClick(interaction) {
  const cfg = await db.getGuildConfig(interaction.guild.id);
  if (!cfg.verify_enabled || !cfg.verify_role_id) {
    return interaction.reply({ content: 'Verification is not configured on this server.', flags: MessageFlags.Ephemeral });
  }
  const role = interaction.guild.roles.cache.get(cfg.verify_role_id);
  if (!role) {
    return interaction.reply({ content: 'The verification role no longer exists — contact a staff member.', flags: MessageFlags.Ephemeral });
  }
  if (interaction.member.roles.cache.has(role.id)) {
    return interaction.reply({ content: "You're already verified!", flags: MessageFlags.Ephemeral });
  }
  await interaction.member.roles.add(role).catch(() => {});
  await interaction.reply({ content: '✅ You are now verified. Welcome!', flags: MessageFlags.Ephemeral });
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      if (interaction.guild) {
        const disabled = await db.isCommandDisabled(interaction.guild.id, interaction.commandName).catch(() => false);
        if (disabled) {
          return interaction.reply({ content: 'This command is disabled on this server.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
      }

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

    if (interaction.isStringSelectMenu()) {
      try {
        if (interaction.customId === 'ticket_category_select') return await handleTicketCategorySelect(interaction);
      } catch (err) {
        console.error('[select]', err);
      }
      return;
    }

    if (interaction.isButton()) {
      try {
        if (interaction.customId === 'ticket_open') return await handleTicketOpenClick(interaction);
        if (interaction.customId === 'ticket_close') return await closeCurrentTicket(interaction);
        if (interaction.customId === 'ticket_claim') return await handleTicketClaim(interaction);
        if (interaction.customId === 'verify_click') return await handleVerifyClick(interaction);
      } catch (err) {
        console.error('[button]', err);
        const payload = { content: 'Something went wrong.', flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
        else await interaction.reply(payload).catch(() => {});
      }
    }
  },
};
