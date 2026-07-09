const { EmbedBuilder } = require('discord.js');
const db = require('../../database/db');
const { sendJoinLog } = require('../utils/logger');
const { replacePlaceholders } = require('../utils/embedBuilder');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    const cfg = await db.getGuildConfig(member.guild.id);

    await sendJoinLog(member.guild, {
      title: 'Member Left',
      description: `<@${member.id}> (${member.user.tag}) left the server.`,
      color: 0xed4245,
    });

    if (!cfg.leave_enabled || !cfg.leave_channel) return;
    const channel = member.guild.channels.cache.get(cfg.leave_channel);
    if (!channel?.isTextBased()) return;

    const text = replacePlaceholders(cfg.leave_message, { user: member.user, guild: member.guild });
    const embed = new EmbedBuilder().setDescription(text).setColor(0xed4245).setTimestamp(new Date());
    channel.send({ embeds: [embed] }).catch(() => {});
  },
};
