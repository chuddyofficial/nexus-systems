const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const db = require('../../../database/db');
const { buildEmbedFromData } = require('../../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Send a custom embed')
    .addSubcommand((sc) =>
      sc
        .setName('send')
        .setDescription('Build and send a quick embed')
        .addStringOption((o) => o.setName('description').setDescription('Embed description').setRequired(true))
        .addStringOption((o) => o.setName('title').setDescription('Embed title'))
        .addStringOption((o) => o.setName('color').setDescription('Hex color, e.g. #5865F2'))
        .addStringOption((o) => o.setName('image_url').setDescription('Image URL'))
        .addStringOption((o) => o.setName('footer').setDescription('Footer text'))
        .addChannelOption((o) => o.setName('channel').setDescription('Channel to send to').addChannelTypes(ChannelType.GuildText))
    )
    .addSubcommand((sc) =>
      sc
        .setName('saved')
        .setDescription('Send an embed previously created on the web dashboard')
        .addStringOption((o) => o.setName('name').setDescription('Saved embed name').setRequired(true).setAutocomplete(true))
        .addChannelOption((o) => o.setName('channel').setDescription('Channel to send to').addChannelTypes(ChannelType.GuildText))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const embeds = await db.getSavedEmbeds(interaction.guild.id);
    const filtered = embeds.filter((e) => e.name.toLowerCase().includes(focused.toLowerCase())).slice(0, 25);
    await interaction.respond(filtered.map((e) => ({ name: e.name, value: e.name })));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    let embedData;
    if (sub === 'send') {
      embedData = {
        title: interaction.options.getString('title'),
        description: interaction.options.getString('description'),
        color: interaction.options.getString('color'),
        image: interaction.options.getString('image_url'),
        footer: interaction.options.getString('footer') ? { text: interaction.options.getString('footer') } : undefined,
      };
    } else {
      const name = interaction.options.getString('name', true);
      const savedEmbeds = await db.getSavedEmbeds(interaction.guild.id);
      const saved = savedEmbeds.find((e) => e.name === name);
      if (!saved) {
        return interaction.reply({ content: `No saved embed named "${name}". Create one on the dashboard first.`, flags: MessageFlags.Ephemeral });
      }
      embedData = JSON.parse(saved.embed_json);
    }

    const embed = buildEmbedFromData(embedData);
    await channel.send({ embeds: [embed] });
    await interaction.reply({ content: `Embed sent to ${channel}.`, flags: MessageFlags.Ephemeral });
  },
};
