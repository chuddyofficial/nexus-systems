const db = require('../../database/db');
const { sendModLog, pushConsole } = require('../utils/logger');

// In-memory sliding window of join timestamps per guild: Map<guildId, number[]>
const recentJoins = new Map();

async function checkAntiRaid(member) {
  const cfg = await db.getGuildConfig(member.guild.id);
  if (!cfg.antiraid_enabled) return false;

  const accountAgeDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
  if (cfg.antiraid_min_account_age_days > 0 && accountAgeDays < cfg.antiraid_min_account_age_days) {
    await actOn(member, cfg.antiraid_action, `Account younger than ${cfg.antiraid_min_account_age_days} day(s) (anti-raid account age gate)`);
    return true;
  }

  const now = Date.now();
  const arr = (recentJoins.get(member.guild.id) ?? []).filter((t) => now - t < cfg.antiraid_join_window);
  arr.push(now);
  recentJoins.set(member.guild.id, arr);

  if (arr.length >= cfg.antiraid_join_threshold) {
    pushConsole(member.guild.id, 'system', `⚠️ Possible raid detected: ${arr.length} joins in ${cfg.antiraid_join_window}ms`);
    await actOn(member, cfg.antiraid_action, `Rapid join burst detected (${arr.length} joins in ${Math.round(cfg.antiraid_join_window / 1000)}s) — possible raid`);
    return true;
  }

  return false;
}

async function actOn(member, action, reason) {
  try {
    if (action === 'ban') {
      await member.ban({ reason });
      await db.logModAction(member.guild.id, member.id, member.client.user.id, 'ban', reason);
    } else {
      await member.kick(reason);
      await db.logModAction(member.guild.id, member.id, member.client.user.id, 'kick', reason);
    }
    await sendModLog(member.guild, {
      action: `AutoMod Anti-Raid ${action === 'ban' ? 'Ban' : 'Kick'}`,
      target: member.user,
      moderator: member.client.user,
      reason,
      color: 0xed4245,
    });
  } catch (err) {
    pushConsole(member.guild.id, 'system', `Anti-raid action failed for ${member.id}: ${err.message}`);
  }
}

module.exports = { checkAntiRaid };
