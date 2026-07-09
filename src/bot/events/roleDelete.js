const { AuditLogEvent } = require('discord.js');
const { trackAction } = require('../automod/antinuke');

module.exports = {
  name: 'roleDelete',
  async execute(role) {
    if (!role.guild) return;
    try {
      const logs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
      const entry = logs.entries.first();
      if (entry && Date.now() - entry.createdTimestamp < 10_000) {
        await trackAction(role.guild, entry.executor?.id, 'role delete');
      }
    } catch {
      // Missing "View Audit Log" permission or fetch failure — skip silently.
    }
  },
};
