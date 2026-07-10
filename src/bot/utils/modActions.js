const db = require('../../database/db');
const { sendModLog } = require('./logger');

/**
 * Shared moderation-action executor used by both slash commands and the
 * web dashboard, so behavior (DB logging + mod-log embed) stays identical
 * no matter where the action was triggered from.
 */
async function performBan(guild, targetUser, moderator, reason, deleteMessageSeconds = 0) {
  await guild.members.ban(targetUser.id, { reason, deleteMessageSeconds });
  await db.logModAction(guild.id, targetUser.id, moderator.id, 'ban', reason);
  await sendModLog(guild, { action: 'Ban', target: targetUser, moderator, reason, color: 0xed4245 });
}

async function performUnban(guild, targetId, moderator, reason) {
  await guild.members.unban(targetId, reason);
  await db.logModAction(guild.id, targetId, moderator.id, 'unban', reason);
  await sendModLog(guild, { action: 'Unban', target: { id: targetId }, moderator, reason, color: 0x57f287 });
}

async function performKick(guild, targetMember, moderator, reason) {
  await targetMember.kick(reason);
  await db.logModAction(guild.id, targetMember.id, moderator.id, 'kick', reason);
  await sendModLog(guild, { action: 'Kick', target: targetMember.user, moderator, reason, color: 0xfee75c });
}

async function performTimeout(guild, targetMember, moderator, durationMs, reason) {
  await targetMember.timeout(durationMs, reason);
  await db.logModAction(guild.id, targetMember.id, moderator.id, 'timeout', reason);
  await sendModLog(guild, {
    action: 'Timeout',
    target: targetMember.user,
    moderator,
    reason,
    color: 0xfee75c,
    extra: [{ name: 'Duration', value: `${Math.round(durationMs / 60000)} minute(s)`, inline: false }],
  });
}

async function performUntimeout(guild, targetMember, moderator, reason) {
  await targetMember.timeout(null, reason);
  await db.logModAction(guild.id, targetMember.id, moderator.id, 'untimeout', reason);
  await sendModLog(guild, { action: 'Timeout Removed', target: targetMember.user, moderator, reason, color: 0x57f287 });
}

async function performWarn(guild, targetUser, moderator, reason) {
  const warning = await db.addWarning(guild.id, targetUser.id, moderator.id, reason);
  await db.logModAction(guild.id, targetUser.id, moderator.id, 'warn', reason);
  await sendModLog(guild, { action: 'Warn', target: targetUser, moderator, reason, color: 0xfee75c });

  const cfg = await db.getGuildConfig(guild.id);
  if (cfg.warn_escalation_enabled) {
    const warnings = await db.getWarnings(guild.id, targetUser.id);
    if (warnings.length === cfg.warn_escalation_threshold) {
      const escalationReason = `Reached ${warnings.length} warnings (auto-escalation)`;
      const member = await guild.members.fetch(targetUser.id).catch(() => null);
      if (member) {
        try {
          if (cfg.warn_escalation_action === 'kick') {
            await performKick(guild, member, guild.client.user, escalationReason);
          } else if (cfg.warn_escalation_action === 'ban') {
            await performBan(guild, targetUser, guild.client.user, escalationReason);
          } else {
            await performTimeout(guild, member, guild.client.user, cfg.warn_escalation_timeout_minutes * 60_000, escalationReason);
          }
        } catch {
          // Missing permissions to escalate — the warning itself still landed.
        }
      }
    }
  }

  return warning;
}

async function performSoftban(guild, targetUser, moderator, reason, deleteMessageSeconds = 86400) {
  await guild.members.ban(targetUser.id, { reason, deleteMessageSeconds });
  await guild.members.unban(targetUser.id, 'Softban — messages purged, user not actually banned').catch(() => {});
  await db.logModAction(guild.id, targetUser.id, moderator.id, 'softban', reason);
  await sendModLog(guild, { action: 'Softban (message purge)', target: targetUser, moderator, reason, color: 0xed4245 });
}

async function performTempBan(guild, targetUser, moderator, reason, durationMs, deleteMessageSeconds = 0) {
  await guild.members.ban(targetUser.id, { reason, deleteMessageSeconds });
  await db.logModAction(guild.id, targetUser.id, moderator.id, 'tempban', reason);

  const runAt = new Date(Date.now() + durationMs).toISOString().replace('T', ' ').slice(0, 19);
  await db.addScheduledAction(guild.id, 'tempban_unban', { userId: targetUser.id }, runAt);

  await sendModLog(guild, {
    action: 'Temp-Ban',
    target: targetUser,
    moderator,
    reason,
    color: 0xed4245,
    extra: [{ name: 'Duration', value: `${Math.round(durationMs / 3_600_000)} hour(s)`, inline: false }],
  });
}

module.exports = {
  performBan,
  performUnban,
  performKick,
  performTimeout,
  performUntimeout,
  performWarn,
  performSoftban,
  performTempBan,
};
