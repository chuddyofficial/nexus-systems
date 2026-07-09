const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../../database/db');
const config = require('../../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Submit a suggestion for the server')
    .addStringOption((o) => o.setName('suggestion').setDescription('Your suggestion').setRequired(true))
    .setDMPermission(false),

  async execute(interaction) {
    const cfg = await db.getGuildConfig(interaction.guild.id);
    const channel = cfg.suggestions_channel ? interaction.guild.channels.cache.get(cfg.suggestions_channel) : interaction.channel;
    if (!channel?.isTextBased()) {
      return interaction.reply({ content: 'The suggestions channel is not configured or no longer exists.', flags: MessageFlags.Ephemeral });
    }

    const content = interaction.options.getString('suggestion', true);
    const embed = new EmbedBuilder()
      .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
      .setDescription(content)
      .setColor(config.brandColor)
      .setFooter({ text: 'Pending review' })
      .setTimestamp(new Date());

    const message = await channel.send({ embeds: [embed] });
    await message.react('👍');
    await message.react('👎');

    await db.createSuggestion(interaction.guild.id, channel.id, message.id, interaction.user.id, content);

    await interaction.reply({ content: `Suggestion submitted in ${channel}. Thanks!`, flags: MessageFlags.Ephemeral });
  },
};
