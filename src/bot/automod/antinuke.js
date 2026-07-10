const db = require('../../database/db');
const { pushConsole } = require('../utils/logger');

// In-memory sliding window of recent destructive-action timestamps per
// guild per actor: Map<guildId, Map<executorId, number[]>>
const recentActions = new Map();

async function trackAction(guild, executorId, actionType) {
  if (!executorId || executorId === guild.client.user.id || executorId === guild.ownerId) return;

  const cfg = await db.getGuildConfig(guild.id);
  if (!cfg.antinuke_enabled) return;
  if (cfg.antinuke_bypass_ids.includes(executorId)) return;
  if (guild.members.cache.get(executorId)?.roles.cache.some((r) => cfg.antinuke_bypass_ids.includes(r.id))) return;

  const now = Date.now();
  let guildMap = recentActions.get(guild.id);
  if (!guildMap) {
    guildMap = new Map();
    recentActions.set(guild.id, guildMap);
  }
  const arr = (guildMap.get(executorId) ?? []).filter((t) => now - t < cfg.antinuke_window);
  arr.push(now);
  guildMap.set(executorId, arr);

  if (arr.length >= cfg.antinuke_threshold) {
    guildMap.set(executorId, []); // reset so we don't re-punish on every subsequent action this burst
    await punish(guild, cfg, executorId, `Rapid ${actionType} actions detected (${arr.length} in ${Math.round(cfg.antinuke_window / 1000)}s) — possible nuke attempt`);
  }
}

async function punish(guild, cfg, executorId, reason) {
  try {
    const member = await guild.members.fetch(executorId).catch(() => null);
    if (member) {
      if (cfg.antinuke_punishment === 'ban') {
        await member.ban({ reason });
      } else {
        const removable = member.roles.cache.filter((r) => r.id !== guild.id && r.editable);
        if (removable.size) await member.roles.remove(removable, reason).catch(() => {});
      }
    }
    await db.logModAction(guild.id, executorId, guild.client.user.id, cfg.antinuke_punishment === 'ban' ? 'ban' : 'antinuke_strip_roles', reason);
    pushConsole(guild.id, 'system', `🛡️ Anti-nuke triggered on <@${executorId}>: ${reason}`);

    const alertChannelId = cfg.antiraid_alert_channel || cfg.mod_log_channel;
    const alertChannel = alertChannelId ? guild.channels.cache.get(alertChannelId) : null;
    if (alertChannel?.isTextBased()) {
      await alertChannel
        .send(`🚨 **Anti-Nuke Triggered** — <@${executorId}> was ${cfg.antinuke_punishment === 'ban' ? 'banned' : 'stripped of all roles'}.\n${reason}`)
        .catch(() => {});
    }
  } catch (err) {
    pushConsole(guild.id, 'system', `Anti-nuke punishment failed for ${executorId}: ${err.message}`);
  }
}

module.exports = { trackAction };
