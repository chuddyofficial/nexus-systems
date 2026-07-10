const db = require('../../database/db');
const { pushConsole } = require('../utils/logger');

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember) {
    const cfg = await db.getGuildConfig(newMember.guild.id);
    if (!cfg.member_update_log_channel) return;
    const channel = newMember.guild.channels.cache.get(cfg.member_update_log_channel);
    if (!channel?.isTextBased()) return;

    if (oldMember.nickname !== newMember.nickname) {
      const line = `👤 **${newMember.user.tag}**'s nickname changed: \`${oldMember.nickname || oldMember.user.username}\` → \`${newMember.nickname || newMember.user.username}\``;
      pushConsole(newMember.guild.id, 'member', line);
      channel.send(line).catch(() => {});
    }

    if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
      const added = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
      const removed = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id));
      const parts = [];
      if (added.size) parts.push(`+${added.map((r) => r.name).join(', ')}`);
      if (removed.size) parts.push(`-${removed.map((r) => r.name).join(', ')}`);
      if (parts.length) {
        const line = `🎭 **${newMember.user.tag}**'s roles changed: ${parts.join(' ')}`;
        pushConsole(newMember.guild.id, 'member', line);
        channel.send(line).catch(() => {});
      }
    }
  },
};
