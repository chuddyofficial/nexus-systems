const { EmbedBuilder } = require('discord.js');
const db = require('../../database/db');
const { sendJoinLog } = require('../utils/logger');
const { replacePlaceholders } = require('../utils/embedBuilder');
const { checkAntiRaid } = require('../automod/antiraid');
const config = require('../../config');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    const cfg = await db.getGuildConfig(member.guild.id);

    await sendJoinLog(member.guild, {
      title: 'Member Joined',
      description: `<@${member.id}> (${member.user.tag}) joined. Account created <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>.`,
      color: 0x57f287,
    });

    const actioned = await checkAntiRaid(member).catch((err) => {
      console.error('[antiraid]', err);
      return false;
    });
    if (actioned) return;

    if (cfg.autorole_id) {
      const role = member.guild.roles.cache.get(cfg.autorole_id);
      if (role) await member.roles.add(role).catch(() => {});
    }

    if (!cfg.welcome_enabled || !cfg.welcome_channel) return;
    const channel = member.guild.channels.cache.get(cfg.welcome_channel);
    if (!channel?.isTextBased()) return;

    const text = replacePlaceholders(cfg.welcome_message, { user: member.user, guild: member.guild });
    const embed = new EmbedBuilder()
      .setDescription(text)
      .setColor(cfg.welcome_embed_color || config.brandColor)
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp(new Date());

    channel.send({ embeds: [embed] }).catch(() => {});
  },
};
