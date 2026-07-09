const path = require('node:path');
const fs = require('node:fs');
const mysql = require('mysql2/promise');
const config = require('../config');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z', // treat/report all datetimes as UTC, regardless of server timezone config
  decimalNumbers: true,
  // Keep DATETIME columns as "YYYY-MM-DD HH:MM:SS" strings (matching the old
  // SQLite behavior) instead of auto-converting to JS Date objects — a lot of
  // call sites (client-side JS, src/bot/utils/date.js) parse that exact shape.
  dateStrings: true,
});

// Explicit allow-list of patchable guild_config columns (mirrors schema.sql).
// Kept as code rather than introspected from the DB so the web API's
// updateGuildConfig can never write to an unexpected column.
const CONFIG_COLUMNS = [
  'mod_log_channel', 'message_log_channel', 'join_log_channel', 'mute_role_id',
  'welcome_enabled', 'welcome_channel', 'welcome_message', 'welcome_embed_color',
  'leave_enabled', 'leave_channel', 'leave_message',
  'automod_enabled', 'automod_anti_invite', 'automod_anti_spam', 'automod_spam_threshold',
  'automod_spam_interval', 'automod_anti_mass_mention', 'automod_max_mentions',
  'automod_caps_filter', 'automod_caps_percent', 'automod_caps_min_len',
  'automod_banned_words', 'automod_ignored_channels', 'automod_action',
  'prefix', 'autorole_id',
  'antiraid_enabled', 'antiraid_join_threshold', 'antiraid_join_window', 'antiraid_action',
  'antiraid_min_account_age_days',
  'leveling_enabled', 'leveling_announce_channel', 'leveling_announce_message',
  'starboard_enabled', 'starboard_channel', 'starboard_emoji', 'starboard_threshold',
  'ticket_category_id', 'ticket_support_role_id', 'ticket_panel_channel', 'ticket_panel_message',
  'ticket_transcript_channel', 'ticket_auto_close_hours',
  'suggestions_channel',
  'verify_enabled', 'verify_role_id', 'verify_channel_id', 'verify_message', 'verify_panel_message',
];

const BOOLEAN_COLUMNS = new Set([
  'welcome_enabled', 'leave_enabled', 'automod_enabled', 'automod_anti_invite',
  'automod_anti_spam', 'automod_anti_mass_mention', 'automod_caps_filter',
  'antiraid_enabled', 'leveling_enabled', 'starboard_enabled', 'verify_enabled',
]);

const JSON_COLUMNS = new Set(['automod_banned_words', 'automod_ignored_channels']);

async function initDb() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const statements = schema
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  const conn = await pool.getConnection();
  try {
    for (const statement of statements) {
      try {
        await conn.query(statement);
      } catch (err) {
        // Re-running the installer / restarting shouldn't fail on indexes or
        // tables that already exist (CREATE INDEX has no IF NOT EXISTS in MySQL).
        if (err.code === 'ER_DUP_KEYNAME' || err.code === 'ER_TABLE_EXISTS_ERROR') continue;
        throw err;
      }
    }
  } finally {
    conn.release();
  }
}

function normalizeConfig(row) {
  if (!row) return row;
  const out = { ...row };
  for (const col of BOOLEAN_COLUMNS) out[col] = !!out[col];
  out.automod_banned_words = safeJsonParse(row.automod_banned_words, []);
  out.automod_ignored_channels = safeJsonParse(row.automod_ignored_channels, []);
  return out;
}

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str ?? '');
  } catch {
    return fallback;
  }
}

async function getGuildConfig(guildId) {
  let [rows] = await pool.execute('SELECT * FROM guild_config WHERE guild_id = ?', [guildId]);
  if (!rows.length) {
    await pool.execute('INSERT INTO guild_config (guild_id, updated_at) VALUES (?, UTC_TIMESTAMP())', [guildId]);
    [rows] = await pool.execute('SELECT * FROM guild_config WHERE guild_id = ?', [guildId]);
  }
  return normalizeConfig(rows[0]);
}

async function updateGuildConfig(guildId, patch) {
  await getGuildConfig(guildId); // ensure row exists
  const cols = [];
  const values = [];
  for (const [key, value] of Object.entries(patch)) {
    if (!CONFIG_COLUMNS.includes(key)) continue;
    cols.push(`${key} = ?`);
    if (JSON_COLUMNS.has(key)) {
      values.push(JSON.stringify(value ?? []));
    } else if (BOOLEAN_COLUMNS.has(key)) {
      values.push(value ? 1 : 0);
    } else {
      values.push(value);
    }
  }
  if (cols.length === 0) return getGuildConfig(guildId);
  cols.push('updated_at = UTC_TIMESTAMP()');
  values.push(guildId);
  await pool.execute(`UPDATE guild_config SET ${cols.join(', ')} WHERE guild_id = ?`, values);
  return getGuildConfig(guildId);
}

// Warnings
async function addWarning(guildId, userId, moderatorId, reason) {
  const [result] = await pool.execute(
    'INSERT INTO warnings (guild_id, user_id, moderator_id, reason) VALUES (?, ?, ?, ?)',
    [guildId, userId, moderatorId, reason || 'No reason provided']
  );
  const [rows] = await pool.execute('SELECT * FROM warnings WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function getWarnings(guildId, userId) {
  const [rows] = await pool.execute(
    'SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC',
    [guildId, userId]
  );
  return rows;
}

async function getAllWarnings(guildId) {
  const [rows] = await pool.execute('SELECT * FROM warnings WHERE guild_id = ? ORDER BY created_at DESC', [guildId]);
  return rows;
}

async function clearWarnings(guildId, userId) {
  const [result] = await pool.execute('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return { changes: result.affectedRows };
}

async function deleteWarning(guildId, warningId) {
  const [result] = await pool.execute('DELETE FROM warnings WHERE guild_id = ? AND id = ?', [guildId, warningId]);
  return { changes: result.affectedRows };
}

// Mod actions
async function logModAction(guildId, userId, moderatorId, actionType, reason) {
  const [result] = await pool.execute(
    'INSERT INTO mod_actions (guild_id, user_id, moderator_id, action_type, reason) VALUES (?, ?, ?, ?, ?)',
    [guildId, userId, moderatorId, actionType, reason || null]
  );
  const [rows] = await pool.execute('SELECT * FROM mod_actions WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function getModActions(guildId, limit = 100) {
  const [rows] = await pool.query('SELECT * FROM mod_actions WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?', [
    guildId,
    limit,
  ]);
  return rows;
}

// Reaction roles
async function addReactionRole(guildId, channelId, messageId, emoji, roleId) {
  const [result] = await pool.execute(
    'INSERT INTO reaction_roles (guild_id, channel_id, message_id, emoji, role_id) VALUES (?, ?, ?, ?, ?)',
    [guildId, channelId, messageId, emoji, roleId]
  );
  const [rows] = await pool.execute('SELECT * FROM reaction_roles WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function getReactionRoles(guildId) {
  const [rows] = await pool.execute('SELECT * FROM reaction_roles WHERE guild_id = ?', [guildId]);
  return rows;
}

async function getReactionRoleByMessage(messageId, emoji) {
  const [rows] = await pool.execute('SELECT * FROM reaction_roles WHERE message_id = ? AND emoji = ?', [messageId, emoji]);
  return rows[0];
}

async function deleteReactionRole(guildId, id) {
  const [result] = await pool.execute('DELETE FROM reaction_roles WHERE guild_id = ? AND id = ?', [guildId, id]);
  return { changes: result.affectedRows };
}

// Custom commands
async function getCustomCommands(guildId) {
  const [rows] = await pool.execute('SELECT * FROM custom_commands WHERE guild_id = ?', [guildId]);
  return rows.map((r) => ({ ...r, trigger: r.trigger_word }));
}

async function getCustomCommand(guildId, trigger) {
  const [rows] = await pool.execute('SELECT * FROM custom_commands WHERE guild_id = ? AND trigger_word = ?', [
    guildId,
    trigger.toLowerCase(),
  ]);
  return rows[0] ? { ...rows[0], trigger: rows[0].trigger_word } : undefined;
}

async function upsertCustomCommand(guildId, trigger, response, embedJson) {
  await pool.execute(
    `INSERT INTO custom_commands (guild_id, trigger_word, response, embed_json)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE response = VALUES(response), embed_json = VALUES(embed_json)`,
    [guildId, trigger.toLowerCase(), response || null, embedJson || null]
  );
  return getCustomCommand(guildId, trigger);
}

async function deleteCustomCommand(guildId, id) {
  const [result] = await pool.execute('DELETE FROM custom_commands WHERE guild_id = ? AND id = ?', [guildId, id]);
  return { changes: result.affectedRows };
}

// Saved embeds
async function getSavedEmbeds(guildId) {
  const [rows] = await pool.execute('SELECT * FROM saved_embeds WHERE guild_id = ? ORDER BY created_at DESC', [guildId]);
  return rows;
}

async function saveEmbed(guildId, name, embedJson, createdBy) {
  await pool.execute(
    `INSERT INTO saved_embeds (guild_id, name, embed_json, created_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE embed_json = VALUES(embed_json)`,
    [guildId, name, embedJson, createdBy]
  );
  const [rows] = await pool.execute('SELECT * FROM saved_embeds WHERE guild_id = ? AND name = ?', [guildId, name]);
  return rows[0];
}

async function deleteSavedEmbed(guildId, id) {
  const [result] = await pool.execute('DELETE FROM saved_embeds WHERE guild_id = ? AND id = ?', [guildId, id]);
  return { changes: result.affectedRows };
}

// Leveling
async function getLevel(guildId, userId) {
  let [rows] = await pool.execute('SELECT * FROM levels WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  if (!rows.length) {
    await pool.execute('INSERT INTO levels (guild_id, user_id, xp, level) VALUES (?, ?, 0, 0)', [guildId, userId]);
    [rows] = await pool.execute('SELECT * FROM levels WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  }
  return rows[0];
}

async function addXp(guildId, userId, amount) {
  const row = await getLevel(guildId, userId);
  const newXp = row.xp + amount;
  const newLevel = Math.floor(0.2 * Math.sqrt(newXp));
  await pool.execute('UPDATE levels SET xp = ?, level = ?, last_message_at = UTC_TIMESTAMP() WHERE guild_id = ? AND user_id = ?', [
    newXp,
    newLevel,
    guildId,
    userId,
  ]);
  return { xp: newXp, level: newLevel, leveledUp: newLevel > row.level };
}

async function getLeaderboard(guildId, limit = 10) {
  const [rows] = await pool.query('SELECT * FROM levels WHERE guild_id = ? ORDER BY xp DESC LIMIT ?', [guildId, limit]);
  return rows;
}

async function getRank(guildId, userId) {
  const [rows] = await pool.execute('SELECT user_id FROM levels WHERE guild_id = ? ORDER BY xp DESC', [guildId]);
  return rows.findIndex((r) => r.user_id === userId) + 1;
}

// Starboard
async function getStarboardPost(guildId, originalMessageId) {
  const [rows] = await pool.execute('SELECT * FROM starboard_posts WHERE guild_id = ? AND original_message_id = ?', [
    guildId,
    originalMessageId,
  ]);
  return rows[0];
}

async function upsertStarboardPost(guildId, originalMessageId, starboardMessageId, starCount) {
  await pool.execute(
    `INSERT INTO starboard_posts (guild_id, original_message_id, starboard_message_id, star_count)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE star_count = VALUES(star_count)`,
    [guildId, originalMessageId, starboardMessageId, starCount]
  );
  return getStarboardPost(guildId, originalMessageId);
}

// Tickets
async function createTicket(guildId, channelId, userId, category) {
  const [result] = await pool.execute(
    'INSERT INTO tickets (guild_id, channel_id, user_id, category, last_activity_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())',
    [guildId, channelId, userId, category || null]
  );
  const [rows] = await pool.execute('SELECT * FROM tickets WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function closeTicket(guildId, channelId) {
  const [result] = await pool.execute(
    "UPDATE tickets SET status = 'closed', closed_at = UTC_TIMESTAMP() WHERE guild_id = ? AND channel_id = ?",
    [guildId, channelId]
  );
  return { changes: result.affectedRows };
}

async function claimTicket(guildId, channelId, moderatorId) {
  await pool.execute('UPDATE tickets SET claimed_by = ? WHERE guild_id = ? AND channel_id = ?', [
    moderatorId,
    guildId,
    channelId,
  ]);
}

async function touchTicketActivity(channelId) {
  await pool.execute('UPDATE tickets SET last_activity_at = UTC_TIMESTAMP() WHERE channel_id = ? AND status = \'open\'', [
    channelId,
  ]);
}

async function getTicketByChannel(channelId) {
  const [rows] = await pool.execute('SELECT * FROM tickets WHERE channel_id = ?', [channelId]);
  return rows[0];
}

// Single joined query (rather than one round-trip per guild) so this stays
// cheap regardless of how many servers the bot is in.
async function getAllStaleTickets() {
  const [rows] = await pool.query(`
    SELECT t.* FROM tickets t
    JOIN guild_config g ON g.guild_id = t.guild_id
    WHERE t.status = 'open'
      AND g.ticket_auto_close_hours > 0
      AND t.last_activity_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL g.ticket_auto_close_hours HOUR)
  `);
  return rows;
}

async function getOpenTickets(guildId) {
  const [rows] = await pool.execute("SELECT * FROM tickets WHERE guild_id = ? AND status = 'open' ORDER BY created_at DESC", [
    guildId,
  ]);
  return rows;
}

async function getAllTickets(guildId, limit = 100) {
  const [rows] = await pool.query('SELECT * FROM tickets WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?', [
    guildId,
    limit,
  ]);
  return rows;
}

// Giveaways
async function createGiveaway(guildId, channelId, messageId, prize, winnerCount, hostId, endsAt) {
  const [result] = await pool.execute(
    'INSERT INTO giveaways (guild_id, channel_id, message_id, prize, winner_count, host_id, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [guildId, channelId, messageId, prize, winnerCount, hostId, endsAt]
  );
  const [rows] = await pool.execute('SELECT * FROM giveaways WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function getActiveGiveaways(guildId) {
  const [rows] = await pool.execute('SELECT * FROM giveaways WHERE guild_id = ? AND ended = 0 ORDER BY ends_at ASC', [guildId]);
  return rows;
}

async function getAllGiveaways(guildId, limit = 50) {
  const [rows] = await pool.query('SELECT * FROM giveaways WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?', [
    guildId,
    limit,
  ]);
  return rows;
}

async function getDueGiveaways() {
  const [rows] = await pool.execute('SELECT * FROM giveaways WHERE ended = 0 AND ends_at <= UTC_TIMESTAMP()');
  return rows;
}

async function markGiveawayEnded(id) {
  await pool.execute('UPDATE giveaways SET ended = 1 WHERE id = ?', [id]);
}

// Suggestions
async function createSuggestion(guildId, channelId, messageId, userId, content) {
  const [result] = await pool.execute(
    'INSERT INTO suggestions (guild_id, channel_id, message_id, user_id, content) VALUES (?, ?, ?, ?, ?)',
    [guildId, channelId, messageId, userId, content]
  );
  const [rows] = await pool.execute('SELECT * FROM suggestions WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function getSuggestions(guildId, limit = 100) {
  const [rows] = await pool.query('SELECT * FROM suggestions WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?', [
    guildId,
    limit,
  ]);
  return rows;
}

async function setSuggestionStatus(guildId, id, status) {
  await pool.execute('UPDATE suggestions SET status = ? WHERE guild_id = ? AND id = ?', [status, guildId, id]);
}

async function getSuggestionById(guildId, id) {
  const [rows] = await pool.execute('SELECT * FROM suggestions WHERE guild_id = ? AND id = ?', [guildId, id]);
  return rows[0];
}

// Moderator notes
async function addModNote(guildId, userId, moderatorId, note) {
  const [result] = await pool.execute('INSERT INTO mod_notes (guild_id, user_id, moderator_id, note) VALUES (?, ?, ?, ?)', [
    guildId,
    userId,
    moderatorId,
    note,
  ]);
  const [rows] = await pool.execute('SELECT * FROM mod_notes WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function getModNotes(guildId, userId) {
  const [rows] = await pool.execute('SELECT * FROM mod_notes WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC', [
    guildId,
    userId,
  ]);
  return rows;
}

async function getAllModNotes(guildId, limit = 200) {
  const [rows] = await pool.query('SELECT * FROM mod_notes WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?', [
    guildId,
    limit,
  ]);
  return rows;
}

async function deleteModNote(guildId, id) {
  const [result] = await pool.execute('DELETE FROM mod_notes WHERE guild_id = ? AND id = ?', [guildId, id]);
  return { changes: result.affectedRows };
}

// Scheduled actions (temp-bans, scheduled announcements, etc.)
async function addScheduledAction(guildId, actionType, payload, runAt) {
  const [result] = await pool.execute('INSERT INTO scheduled_actions (guild_id, action_type, payload, run_at) VALUES (?, ?, ?, ?)', [
    guildId,
    actionType,
    JSON.stringify(payload),
    runAt,
  ]);
  const [rows] = await pool.execute('SELECT * FROM scheduled_actions WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function getDueScheduledActions() {
  const [rows] = await pool.execute('SELECT * FROM scheduled_actions WHERE executed = 0 AND run_at <= UTC_TIMESTAMP()');
  return rows;
}

async function markScheduledActionExecuted(id) {
  await pool.execute('UPDATE scheduled_actions SET executed = 1 WHERE id = ?', [id]);
}

async function getPendingScheduledActions(guildId, actionType) {
  const [rows] = await pool.execute(
    'SELECT * FROM scheduled_actions WHERE guild_id = ? AND action_type = ? AND executed = 0 ORDER BY run_at ASC',
    [guildId, actionType]
  );
  return rows;
}

// Disabled commands (per-server command toggles)
async function isCommandDisabled(guildId, commandName) {
  const [rows] = await pool.execute('SELECT 1 FROM disabled_commands WHERE guild_id = ? AND command_name = ?', [
    guildId,
    commandName,
  ]);
  return rows.length > 0;
}

async function getDisabledCommands(guildId) {
  const [rows] = await pool.execute('SELECT command_name FROM disabled_commands WHERE guild_id = ?', [guildId]);
  return rows.map((r) => r.command_name);
}

async function disableCommand(guildId, commandName, disabledBy) {
  await pool.execute(
    'INSERT INTO disabled_commands (guild_id, command_name, disabled_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE disabled_by = VALUES(disabled_by)',
    [guildId, commandName, disabledBy || null]
  );
}

async function enableCommand(guildId, commandName) {
  await pool.execute('DELETE FROM disabled_commands WHERE guild_id = ? AND command_name = ?', [guildId, commandName]);
}

// Teams / permissions (RBAC)
const ALL_TEAM_PERMISSIONS = [
  'manage_config',
  'manage_automod',
  'manage_antiraid',
  'manage_moderation',
  'manage_tickets',
  'manage_embeds',
  'manage_giveaways',
  'manage_suggestions',
  'manage_reactionroles',
  'manage_customcommands',
  'manage_commands',
  'view_dashboard',
];

function normalizeTeam(row) {
  if (!row) return row;
  return { ...row, permissions: safeJsonParse(row.permissions, []) };
}

async function createTeam(guildId, name, color = '#5865F2') {
  const [result] = await pool.execute('INSERT INTO teams (guild_id, name, color) VALUES (?, ?, ?)', [guildId, name, color]);
  const [rows] = await pool.execute('SELECT * FROM teams WHERE id = ?', [result.insertId]);
  return normalizeTeam(rows[0]);
}

async function getTeams(guildId) {
  const [rows] = await pool.execute('SELECT * FROM teams WHERE guild_id = ? ORDER BY created_at ASC', [guildId]);
  return rows.map(normalizeTeam);
}

async function getTeam(guildId, teamId) {
  const [rows] = await pool.execute('SELECT * FROM teams WHERE guild_id = ? AND id = ?', [guildId, teamId]);
  return normalizeTeam(rows[0]);
}

async function deleteTeam(guildId, teamId) {
  await pool.execute('DELETE FROM team_members WHERE guild_id = ? AND team_id = ?', [guildId, teamId]);
  await pool.execute('DELETE FROM teams WHERE guild_id = ? AND id = ?', [guildId, teamId]);
}

async function updateTeamPermissions(guildId, teamId, permissions) {
  const filtered = permissions.filter((p) => ALL_TEAM_PERMISSIONS.includes(p));
  await pool.execute('UPDATE teams SET permissions = ? WHERE guild_id = ? AND id = ?', [
    JSON.stringify(filtered),
    guildId,
    teamId,
  ]);
  return getTeam(guildId, teamId);
}

async function addTeamMember(guildId, teamId, discordId, memberType = 'user', addedBy) {
  await pool.execute(
    'INSERT IGNORE INTO team_members (team_id, guild_id, member_type, discord_id, added_by) VALUES (?, ?, ?, ?, ?)',
    [teamId, guildId, memberType, discordId, addedBy || null]
  );
}

async function removeTeamMember(guildId, teamId, discordId) {
  await pool.execute('DELETE FROM team_members WHERE guild_id = ? AND team_id = ? AND discord_id = ?', [
    guildId,
    teamId,
    discordId,
  ]);
}

async function getTeamMembers(guildId, teamId) {
  const [rows] = await pool.execute('SELECT * FROM team_members WHERE guild_id = ? AND team_id = ?', [guildId, teamId]);
  return rows;
}

// Resolves every team a Discord user belongs to in a guild, either by direct
// user-ID membership or via one of the caller's Discord role IDs.
async function getTeamsForMember(guildId, userId, roleIds = []) {
  const teams = await getTeams(guildId);
  if (!teams.length) return [];

  const placeholders = [userId, ...roleIds].map(() => '?').join(',');
  const [memberRows] = await pool.query(
    `SELECT DISTINCT team_id FROM team_members WHERE guild_id = ? AND discord_id IN (${placeholders})`,
    [guildId, userId, ...roleIds]
  );
  const memberTeamIds = new Set(memberRows.map((r) => r.team_id));
  return teams.filter((t) => memberTeamIds.has(t.id));
}

// Level roles (leveling reward roles)
async function addLevelRole(guildId, level, roleId) {
  await pool.execute(
    'INSERT INTO level_roles (guild_id, level, role_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role_id = VALUES(role_id)',
    [guildId, level, roleId]
  );
}

async function getLevelRoles(guildId) {
  const [rows] = await pool.execute('SELECT * FROM level_roles WHERE guild_id = ? ORDER BY level ASC', [guildId]);
  return rows;
}

async function deleteLevelRole(guildId, id) {
  await pool.execute('DELETE FROM level_roles WHERE guild_id = ? AND id = ?', [guildId, id]);
}

module.exports = {
  pool,
  initDb,
  ALL_TEAM_PERMISSIONS,
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
  claimTicket,
  touchTicketActivity,
  getTicketByChannel,
  getAllStaleTickets,
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
  getSuggestionById,
  addModNote,
  getModNotes,
  getAllModNotes,
  deleteModNote,
  addScheduledAction,
  getDueScheduledActions,
  markScheduledActionExecuted,
  getPendingScheduledActions,
  isCommandDisabled,
  getDisabledCommands,
  disableCommand,
  enableCommand,
  createTeam,
  getTeams,
  getTeam,
  deleteTeam,
  updateTeamPermissions,
  addTeamMember,
  removeTeamMember,
  getTeamMembers,
  getTeamsForMember,
  addLevelRole,
  getLevelRoles,
  deleteLevelRole,
};
