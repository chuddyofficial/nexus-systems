const { AuditLogEvent } = require('discord.js');
const { trackAction } = require('../automod/antinuke');

module.exports = {
  name: 'guildBanAdd',
  async execute(ban) {
    const guild = ban.guild;
    if (!guild) return;
    try {
      const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
      const entry = logs.entries.first();
      if (entry && Date.now() - entry.createdTimestamp < 10_000) {
        await trackAction(guild, entry.executor?.id, 'member ban');
      }
    } catch {
      // Missing "View Audit Log" permission or fetch failure — skip silently.
    }
  },
};
