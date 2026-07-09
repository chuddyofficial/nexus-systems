const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'bot.sqlite'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

const DEFAULT_CONFIG_COLUMNS = db.prepare('PRAGMA table_info(guild_config)').all().map((c) => c.name);

function getGuildConfig(guildId) {
  let row = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
  if (!row) {
    db.prepare('INSERT INTO guild_config (guild_id, updated_at) VALUES (?, datetime(\'now\'))').run(guildId);
    row = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
  }
  return normalizeConfig(row);
}

function normalizeConfig(row) {
  if (!row) return row;
  return {
    ...row,
    welcome_enabled: !!row.welcome_enabled,
    leave_enabled: !!row.leave_enabled,
    automod_enabled: !!row.automod_enabled,
    automod_anti_invite: !!row.automod_anti_invite,
    automod_anti_spam: !!row.automod_anti_spam,
    automod_anti_mass_mention: !!row.automod_anti_mass_mention,
    automod_caps_filter: !!row.automod_caps_filter,
    automod_banned_words: safeJsonParse(row.automod_banned_words, []),
    automod_ignored_channels: safeJsonParse(row.automod_ignored_channels, []),
    antiraid_enabled: !!row.antiraid_enabled,
    leveling_enabled: !!row.leveling_enabled,
    starboard_enabled: !!row.starboard_enabled,
  };
}

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str ?? '');
  } catch {
    return fallback;
  }
}

function updateGuildConfig(guildId, patch) {
  getGuildConfig(guildId); // ensure row exists
  const cols = [];
  const values = [];
  for (const [key, value] of Object.entries(patch)) {
    if (!DEFAULT_CONFIG_COLUMNS.includes(key) || key === 'guild_id') continue;
    cols.push(`${key} = ?`);
    if (Array.isArray(value)) {
      values.push(JSON.stringify(value));
    } else if (typeof value === 'boolean') {
      values.push(value ? 1 : 0);
    } else {
      values.push(value);
    }
  }
  if (cols.length === 0) return getGuildConfig(guildId);
  cols.push('updated_at = datetime(\'now\')');
  values.push(guildId);
  db.prepare(`UPDATE guild_config SET ${cols.join(', ')} WHERE guild_id = ?`).run(...values);
  return getGuildConfig(guildId);
}

// Warnings
function addWarning(guildId, userId, moderatorId, reason) {
  const info = db
    .prepare('INSERT INTO warnings (guild_id, user_id, moderator_id, reason) VALUES (?, ?, ?, ?)')
    .run(guildId, userId, moderatorId, reason || 'No reason provided');
  return db.prepare('SELECT * FROM warnings WHERE id = ?').get(info.lastInsertRowid);
}

function getWarnings(guildId, userId) {
  return db
    .prepare('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC')
    .all(guildId, userId);
}

function getAllWarnings(guildId) {
  return db.prepare('SELECT * FROM warnings WHERE guild_id = ? ORDER BY created_at DESC').all(guildId);
}

function clearWarnings(guildId, userId) {
  return db.prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
}

function deleteWarning(guildId, warningId) {
  return db.prepare('DELETE FROM warnings WHERE guild_id = ? AND id = ?').run(guildId, warningId);
}

// Mod actions
function logModAction(guildId, userId, moderatorId, actionType, reason) {
  const info = db
    .prepare(
      'INSERT INTO mod_actions (guild_id, user_id, moderator_id, action_type, reason) VALUES (?, ?, ?, ?, ?)'
    )
    .run(guildId, userId, moderatorId, actionType, reason || null);
  return db.prepare('SELECT * FROM mod_actions WHERE id = ?').get(info.lastInsertRowid);
}

function getModActions(guildId, limit = 100) {
  return db
    .prepare('SELECT * FROM mod_actions WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(guildId, limit);
}

// Reaction roles
function addReactionRole(guildId, channelId, messageId, emoji, roleId) {
  const info = db
    .prepare(
      'INSERT INTO reaction_roles (guild_id, channel_id, message_id, emoji, role_id) VALUES (?, ?, ?, ?, ?)'
    )
    .run(guildId, channelId, messageId, emoji, roleId);
  return db.prepare('SELECT * FROM reaction_roles WHERE id = ?').get(info.lastInsertRowid);
}

function getReactionRoles(guildId) {
  return db.prepare('SELECT * FROM reaction_roles WHERE guild_id = ?').all(guildId);
}

function getReactionRoleByMessage(messageId, emoji) {
  return db
    .prepare('SELECT * FROM reaction_roles WHERE message_id = ? AND emoji = ?')
    .get(messageId, emoji);
}

function deleteReactionRole(guildId, id) {
  return db.prepare('DELETE FROM reaction_roles WHERE guild_id = ? AND id = ?').run(guildId, id);
}

// Custom commands
function getCustomCommands(guildId) {
  return db.prepare('SELECT * FROM custom_commands WHERE guild_id = ?').all(guildId);
}

function getCustomCommand(guildId, trigger) {
  return db
    .prepare('SELECT * FROM custom_commands WHERE guild_id = ? AND trigger = ?')
    .get(guildId, trigger.toLowerCase());
}

function upsertCustomCommand(guildId, trigger, response, embedJson) {
  db.prepare(
    `INSERT INTO custom_commands (guild_id, trigger, response, embed_json)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, trigger) DO UPDATE SET response = excluded.response, embed_json = excluded.embed_json`
  ).run(guildId, trigger.toLowerCase(), response || null, embedJson || null);
  return getCustomCommand(guildId, trigger);
}

function deleteCustomCommand(guildId, id) {
  return db.prepare('DELETE FROM custom_commands WHERE guild_id = ? AND id = ?').run(guildId, id);
}

// Saved embeds
function getSavedEmbeds(guildId) {
  return db.prepare('SELECT * FROM saved_embeds WHERE guild_id = ? ORDER BY created_at DESC').all(guildId);
}

function saveEmbed(guildId, name, embedJson, createdBy) {
  db.prepare(
    `INSERT INTO saved_embeds (guild_id, name, embed_json, created_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, name) DO UPDATE SET embed_json = excluded.embed_json`
  ).run(guildId, name, embedJson, createdBy);
  return db.prepare('SELECT * FROM saved_embeds WHERE guild_id = ? AND name = ?').get(guildId, name);
}

function deleteSavedEmbed(guildId, id) {
  return db.prepare('DELETE FROM saved_embeds WHERE guild_id = ? AND id = ?').run(guildId, id);
}

// Leveling
function getLevel(guildId, userId) {
  let row = db.prepare('SELECT * FROM levels WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (!row) {
    db.prepare('INSERT INTO levels (guild_id, user_id, xp, level) VALUES (?, ?, 0, 0)').run(guildId, userId);
    row = db.prepare('SELECT * FROM levels WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  }
  return row;
}

function addXp(guildId, userId, amount) {
  const row = getLevel(guildId, userId);
  const newXp = row.xp + amount;
  const newLevel = Math.floor(0.2 * Math.sqrt(newXp));
  db.prepare('UPDATE levels SET xp = ?, level = ?, last_message_at = datetime(\'now\') WHERE guild_id = ? AND user_id = ?').run(
    newXp,
    newLevel,
    guildId,
    userId
  );
  return { xp: newXp, level: newLevel, leveledUp: newLevel > row.level };
}

function getLeaderboard(guildId, limit = 10) {
  return db.prepare('SELECT * FROM levels WHERE guild_id = ? ORDER BY xp DESC LIMIT ?').all(guildId, limit);
}

function getRank(guildId, userId) {
  const all = db.prepare('SELECT user_id FROM levels WHERE guild_id = ? ORDER BY xp DESC').all(guildId);
  return all.findIndex((r) => r.user_id === userId) + 1;
}

// Starboard
function getStarboardPost(guildId, originalMessageId) {
  return db.prepare('SELECT * FROM starboard_posts WHERE guild_id = ? AND original_message_id = ?').get(guildId, originalMessageId);
}

function upsertStarboardPost(guildId, originalMessageId, starboardMessageId, starCount) {
  db.prepare(
    `INSERT INTO starboard_posts (guild_id, original_message_id, starboard_message_id, star_count)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, original_message_id) DO UPDATE SET star_count = excluded.star_count`
  ).run(guildId, originalMessageId, starboardMessageId, starCount);
  return getStarboardPost(guildId, originalMessageId);
}

// Tickets
function createTicket(guildId, channelId, userId) {
  const info = db.prepare('INSERT INTO tickets (guild_id, channel_id, user_id) VALUES (?, ?, ?)').run(guildId, channelId, userId);
  return db.prepare('SELECT * FROM tickets WHERE id = ?').get(info.lastInsertRowid);
}

function closeTicket(guildId, channelId) {
  return db
    .prepare("UPDATE tickets SET status = 'closed', closed_at = datetime('now') WHERE guild_id = ? AND channel_id = ?")
    .run(guildId, channelId);
}

function getOpenTickets(guildId) {
  return db.prepare("SELECT * FROM tickets WHERE guild_id = ? AND status = 'open' ORDER BY created_at DESC").all(guildId);
}

function getAllTickets(guildId, limit = 100) {
  return db.prepare('SELECT * FROM tickets WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?').all(guildId, limit);
}

// Giveaways
function createGiveaway(guildId, channelId, messageId, prize, winnerCount, hostId, endsAt) {
  const info = db
    .prepare('INSERT INTO giveaways (guild_id, channel_id, message_id, prize, winner_count, host_id, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(guildId, channelId, messageId, prize, winnerCount, hostId, endsAt);
  return db.prepare('SELECT * FROM giveaways WHERE id = ?').get(info.lastInsertRowid);
}

function getActiveGiveaways(guildId) {
  return db.prepare('SELECT * FROM giveaways WHERE guild_id = ? AND ended = 0 ORDER BY ends_at ASC').all(guildId);
}

function getAllGiveaways(guildId, limit = 50) {
  return db.prepare('SELECT * FROM giveaways WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?').all(guildId, limit);
}

function getDueGiveaways() {
  return db.prepare("SELECT * FROM giveaways WHERE ended = 0 AND ends_at <= datetime('now')").all();
}

function markGiveawayEnded(id) {
  return db.prepare('UPDATE giveaways SET ended = 1 WHERE id = ?').run(id);
}

// Suggestions
function createSuggestion(guildId, channelId, messageId, userId, content) {
  const info = db
    .prepare('INSERT INTO suggestions (guild_id, channel_id, message_id, user_id, content) VALUES (?, ?, ?, ?, ?)')
    .run(guildId, channelId, messageId, userId, content);
  return db.prepare('SELECT * FROM suggestions WHERE id = ?').get(info.lastInsertRowid);
}

function getSuggestions(guildId, limit = 100) {
  return db.prepare('SELECT * FROM suggestions WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?').all(guildId, limit);
}

function setSuggestionStatus(guildId, id, status) {
  return db.prepare('UPDATE suggestions SET status = ? WHERE guild_id = ? AND id = ?').run(status, guildId, id);
}

// Moderator notes
function addModNote(guildId, userId, moderatorId, note) {
  const info = db
    .prepare('INSERT INTO mod_notes (guild_id, user_id, moderator_id, note) VALUES (?, ?, ?, ?)')
    .run(guildId, userId, moderatorId, note);
  return db.prepare('SELECT * FROM mod_notes WHERE id = ?').get(info.lastInsertRowid);
}

function getModNotes(guildId, userId) {
  return db.prepare('SELECT * FROM mod_notes WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC').all(guildId, userId);
}

function getAllModNotes(guildId, limit = 200) {
  return db.prepare('SELECT * FROM mod_notes WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?').all(guildId, limit);
}

function deleteModNote(guildId, id) {
  return db.prepare('DELETE FROM mod_notes WHERE guild_id = ? AND id = ?').run(guildId, id);
}

// Scheduled actions (temp-bans, scheduled announcements, etc.)
function addScheduledAction(guildId, actionType, payload, runAt) {
  const info = db
    .prepare('INSERT INTO scheduled_actions (guild_id, action_type, payload, run_at) VALUES (?, ?, ?, ?)')
    .run(guildId, actionType, JSON.stringify(payload), runAt);
  return db.prepare('SELECT * FROM scheduled_actions WHERE id = ?').get(info.lastInsertRowid);
}

function getDueScheduledActions() {
  return db.prepare("SELECT * FROM scheduled_actions WHERE executed = 0 AND run_at <= datetime('now')").all();
}

function markScheduledActionExecuted(id) {
  return db.prepare('UPDATE scheduled_actions SET executed = 1 WHERE id = ?').run(id);
}

function getPendingScheduledActions(guildId, actionType) {
  return db
    .prepare('SELECT * FROM scheduled_actions WHERE guild_id = ? AND action_type = ? AND executed = 0 ORDER BY run_at ASC')
    .all(guildId, actionType);
}

module.exports = {
  raw: db,
  getGuildConfig,
  updateGuildConfig,
  addWarning,
  getWarnings,
  getAllWarnings,
  clearWarnings,
  deleteWarning,
  logModAction,
  getModActions,
  addReactionRole,
  getReactionRoles,
  getReactionRoleByMessage,
  deleteReactionRole,
  getCustomCommands,
  getCustomCommand,
  upsertCustomCommand,
  deleteCustomCommand,
  getSavedEmbeds,
  saveEmbed,
  deleteSavedEmbed,
  getLevel,
  addXp,
  getLeaderboard,
  getRank,
  getStarboardPost,
  upsertStarboardPost,
  createTicket,
  closeTicket,
  getOpenTickets,
  getAllTickets,
  createGiveaway,
  getActiveGiveaways,
  getAllGiveaways,
  getDueGiveaways,
  markGiveawayEnded,
  createSuggestion,
  getSuggestions,
  setSuggestionStatus,
  addModNote,
  getModNotes,
  getAllModNotes,
  deleteModNote,
  addScheduledAction,
  getDueScheduledActions,
  markScheduledActionExecuted,
  getPendingScheduledActions,
};
