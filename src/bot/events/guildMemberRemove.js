const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const db = require('../../database/db');
const { sendJoinLog } = require('../utils/logger');
const { replacePlaceholders } = require('../utils/embedBuilder');
const { trackAction } = require('../automod/antinuke');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    const cfg = await db.getGuildConfig(member.guild.id);

    await sendJoinLog(member.guild, {
      title: 'Member Left',
      description: `<@${member.id}> (${member.user.tag}) left the server.`,
      color: 0xed4245,
    });

    // A kick shows up here (not as a distinct event) — check the audit log
    // for a matching kick entry so mass-kicking by a rogue mod trips
    // anti-nuke the same way mass channel/role deletes and bans do.
    member.guild
      .fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 })
      .then((logs) => {
        const entry = logs.entries.first();
        if (entry?.target?.id === member.id && Date.now() - entry.createdTimestamp < 10_000) {
          trackAction(member.guild, entry.executor?.id, 'member kick').catch(() => {});
        }
      })
      .catch(() => {});

    if (!cfg.leave_enabled || !cfg.leave_channel) return;
    const channel = member.guild.channels.cache.get(cfg.leave_channel);
    if (!channel?.isTextBased()) return;

    const text = replacePlaceholders(cfg.leave_message, { user: member.user, guild: member.guild });
    const embed = new EmbedBuilder().setDescription(text).setColor(0xed4245).setTimestamp(new Date());
    channel.send({ embeds: [embed] }).catch(() => {});
  },
};
