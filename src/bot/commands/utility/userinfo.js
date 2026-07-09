const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription("View info about a member")
    .addUserOption((o) => o.setName('user').setDescription('User to inspect'))
    .setDMPermission(false),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    const embed = new EmbedBuilder()
      .setAuthor({ name: targetUser.tag, iconURL: targetUser.displayAvatarURL() })
      .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
      .setColor(member?.displayHexColor && member.displayHexColor !== '#000000' ? member.displayHexColor : config.brandColor)
      .addFields(
        { name: 'ID', value: targetUser.id, inline: true },
        { name: 'Account Created', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true }
      );

    if (member) {
      embed.addFields(
        { name: 'Joined Server', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown', inline: true },
        { name: 'Nickname', value: member.nickname || '*none*', inline: true },
        { name: `Roles (${member.roles.cache.size - 1})`, value: member.roles.cache.filter((r) => r.id !== interaction.guild.id).map((r) => `<@&${r.id}>`).join(' ') || '*none*' }
      );
    }

    await interaction.reply({ embeds: [embed] });
  },
};
