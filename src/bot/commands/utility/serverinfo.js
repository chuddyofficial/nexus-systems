const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const config = require('../../../config');

module.exports = {
  data: new SlashCommandBuilder().setName('serverinfo').setDescription('View info about this server').setDMPermission(false),

  async execute(interaction) {
    const guild = interaction.guild;
    const textCount = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).size;
    const voiceCount = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size;

    const embed = new EmbedBuilder()
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL({ size: 256 }))
      .setColor(config.brandColor)
      .addFields(
        { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
        { name: 'Members', value: String(guild.memberCount), inline: true },
        { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Text Channels', value: String(textCount), inline: true },
        { name: 'Voice Channels', value: String(voiceCount), inline: true },
        { name: 'Roles', value: String(guild.roles.cache.size), inline: true },
        { name: 'Boost Level', value: `Tier ${guild.premiumTier} (${guild.premiumSubscriptionCount ?? 0} boosts)`, inline: true }
      );

    await interaction.reply({ embeds: [embed] });
  },
};
