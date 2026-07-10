const { AuditLogEvent } = require('discord.js');
const { trackAction } = require('../automod/antinuke');

module.exports = {
  name: 'webhookUpdate',
  async execute(channel) {
    if (!channel.guild) return;
    try {
      const [createLogs, deleteLogs] = await Promise.all([
        channel.guild.fetchAuditLogs({ type: AuditLogEvent.WebhookCreate, limit: 1 }),
        channel.guild.fetchAuditLogs({ type: AuditLogEvent.WebhookDelete, limit: 1 }),
      ]);
      const entry = [createLogs.entries.first(), deleteLogs.entries.first()]
        .filter(Boolean)
        .sort((a, b) => b.createdTimestamp - a.createdTimestamp)[0];
      if (entry && Date.now() - entry.createdTimestamp < 10_000) {
        await trackAction(channel.guild, entry.executor?.id, 'webhook change');
      }
    } catch {
      // Missing "View Audit Log" permission or fetch failure — skip silently.
    }
  },
};
