const { AuditLogEvent } = require('discord.js');
const { trackAction } = require('../automod/antinuke');

module.exports = {
  name: 'channelDelete',
  async execute(channel) {
    if (!channel.guild) return;
    try {
      const logs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
      const entry = logs.entries.first();
      if (entry && Date.now() - entry.createdTimestamp < 10_000) {
        await trackAction(channel.guild, entry.executor?.id, 'channel delete');
      }
    } catch {
      // Missing "View Audit Log" permission or fetch failure — skip silently.
    }
  },
};
