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
  'antiraid_min_account_age_days', 'antiraid_alert_channel', 'antiraid_lockdown_active',
  'antinuke_enabled', 'antinuke_threshold', 'antinuke_window', 'antinuke_punishment', 'antinuke_bypass_ids',
  'vip_nickname', 'vip_theme_color',
  'automod_anti_link', 'automod_link_whitelist', 'automod_word_regex_patterns',
  'automod_repeated_chars', 'automod_repeated_chars_max', 'automod_emoji_spam', 'automod_emoji_spam_max',
  'warn_escalation_enabled', 'warn_escalation_threshold', 'warn_escalation_action', 'warn_escalation_timeout_minutes',
  'leveling_enabled', 'leveling_announce_channel', 'leveling_announce_message',
  'leveling_no_xp_channels', 'leveling_xp_multiplier',
  'starboard_enabled', 'starboard_channel', 'starboard_emoji', 'starboard_threshold', 'starboard_exclude_self',
  'ticket_category_id', 'ticket_support_role_id', 'ticket_panel_channel', 'ticket_panel_message',
  'ticket_transcript_channel', 'ticket_auto_close_hours',
  'suggestions_channel', 'suggestions_auto_threshold_up', 'suggestions_auto_threshold_down',
  'verify_enabled', 'verify_role_id', 'verify_channel_id', 'verify_message', 'verify_panel_message',
  'member_update_log_channel',
];

const BOOLEAN_COLUMNS = new Set([
  'welcome_enabled', 'leave_enabled', 'automod_enabled', 'automod_anti_invite',
  'automod_anti_spam', 'automod_anti_mass_mention', 'automod_caps_filter',
  'antiraid_enabled', 'leveling_enabled', 'starboard_enabled', 'verify_enabled',
  'antiraid_lockdown_active', 'antinuke_enabled',
  'automod_anti_link', 'automod_repeated_chars', 'automod_emoji_spam',
  'warn_escalation_enabled', 'starboard_exclude_self',
]);

// Ticket panels: patchable columns for updateTicketPanel (mirrors ticket_panels
// schema, minus panel_channel_id/panel_message_id which are only ever set via
// setTicketPanelMessage after actually posting the panel to Discord).
const TICKET_PANEL_COLUMNS = [
  'name', 'embed_title', 'embed_description', 'embed_color', 'button_label', 'button_emoji',
  'category_channel_id', 'support_role_id', 'transcript_channel_id',
];

const JSON_COLUMNS = new Set([
  'automod_banned_words', 'automod_ignored_channels', 'automod_link_whitelist',
  'automod_word_regex_patterns', 'leveling_no_xp_channels', 'antinuke_bypass_ids',
]);

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
        // Re-running the installer / restarting shouldn't fail on indexes,
        // tables, or columns that already exist — MySQL has no "IF NOT
        // EXISTS" for CREATE INDEX or ALTER TABLE ADD COLUMN (unlike
        // MariaDB), so idempotency on re-run is handled here instead.
        if (
          err.code === 'ER_DUP_KEYNAME' ||
          err.code === 'ER_TABLE_EXISTS_ERROR' ||
          err.code === 'ER_DUP_FIELDNAME'
        ) {
          continue;
        }
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
  out.automod_link_whitelist = safeJsonParse(row.automod_link_whitelist, []);
  out.automod_word_regex_patterns = safeJsonParse(row.automod_word_regex_patterns, []);
  out.leveling_no_xp_channels = safeJsonParse(row.leveling_no_xp_channels, []);
  out.antinuke_bypass_ids = safeJsonParse(row.antinuke_bypass_ids, []);
  // Computed rather than a stored flag: a "year" VIP naturally lapses once
  // vip_expires_at passes, with no scheduler sweep needed to keep this
  // accurate — "lifetime" never expires (vip_expires_at stays NULL for it).
  out.vip_active = !!row.vip_tier && (row.vip_tier === 'lifetime' || (!!row.vip_expires_at && new Date(row.vip_expires_at.replace(' ', 'T') + 'Z') > new Date()));
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

async function getWarningsPage(guildId, limit = 50, offset = 0) {
  const [rows] = await pool.query('SELECT * FROM warnings WHERE guild_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?', [
    guildId,
    limit,
    offset,
  ]);
  const [[{ total }]] = await pool.execute('SELECT COUNT(*) AS total FROM warnings WHERE guild_id = ?', [guildId]);
  return { rows, total };
}

// Cross-guild lookups — owner-only user-lookup tool in the website admin
// panel intentionally has no guild_id filter; see the multi-tenant
// isolation note in db.js's module docs / memory for why this is safe.
async function getWarningsForUser(userId) {
  const [rows] = await pool.execute('SELECT * FROM warnings WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  return rows;
}

async function getModNotesForUser(userId) {
  const [rows] = await pool.execute('SELECT * FROM mod_notes WHERE user_id = ? ORDER BY created_at DESC', [userId]);
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

async function getModActionsPage(guildId, limit = 50, offset = 0) {
  const [rows] = await pool.query('SELECT * FROM mod_actions WHERE guild_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?', [
    guildId,
    limit,
    offset,
  ]);
  const [[{ total }]] = await pool.execute('SELECT COUNT(*) AS total FROM mod_actions WHERE guild_id = ?', [guildId]);
  return { rows, total };
}

async function getModActionsForUser(userId) {
  const [rows] = await pool.execute('SELECT * FROM mod_actions WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  return rows;
}

// Reaction roles
async function addReactionRole(guildId, channelId, messageId, emoji, roleId, exclusiveGroup = null) {
  const [result] = await pool.execute(
    'INSERT INTO reaction_roles (guild_id, channel_id, message_id, emoji, role_id, exclusive_group) VALUES (?, ?, ?, ?, ?, ?)',
    [guildId, channelId, messageId, emoji, roleId, exclusiveGroup || null]
  );
  const [rows] = await pool.execute('SELECT * FROM reaction_roles WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function getReactionRoles(guildId) {
  const [rows] = await pool.execute('SELECT * FROM reaction_roles WHERE guild_id = ?', [guildId]);
  return rows;
}

async function getReactionRolesByGroup(guildId, messageId, exclusiveGroup) {
  const [rows] = await pool.execute(
    'SELECT * FROM reaction_roles WHERE guild_id = ? AND message_id = ? AND exclusive_group = ?',
    [guildId, messageId, exclusiveGroup]
  );
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

async function upsertCustomCommand(guildId, trigger, response, embedJson, cooldownSeconds = 0) {
  await pool.execute(
    `INSERT INTO custom_commands (guild_id, trigger_word, response, embed_json, cooldown_seconds)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE response = VALUES(response), embed_json = VALUES(embed_json), cooldown_seconds = VALUES(cooldown_seconds)`,
    [guildId, trigger.toLowerCase(), response || null, embedJson || null, cooldownSeconds || 0]
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

async function resetXp(guildId, userId) {
  await pool.execute('UPDATE levels SET xp = 0, level = 0 WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
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
async function createTicket(guildId, channelId, userId, category, panelId) {
  const [result] = await pool.execute(
    'INSERT INTO tickets (guild_id, channel_id, user_id, category, panel_id, last_activity_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())',
    [guildId, channelId, userId, category || null, panelId || null]
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

// Ticket panels — each panel is its own configurable "sector": custom embed,
// button, discord category to file tickets under, support role, transcript
// channel, and an optional set of categories members pick from when opening.
async function createTicketPanel(guildId, name) {
  const [result] = await pool.execute('INSERT INTO ticket_panels (guild_id, name) VALUES (?, ?)', [guildId, name]);
  return getTicketPanel(guildId, result.insertId);
}

async function updateTicketPanel(guildId, id, patch) {
  const cols = [];
  const values = [];
  for (const [key, value] of Object.entries(patch)) {
    if (!TICKET_PANEL_COLUMNS.includes(key)) continue;
    cols.push(`${key} = ?`);
    values.push(value === '' ? null : value);
  }
  if (cols.length) {
    values.push(guildId, id);
    await pool.execute(`UPDATE ticket_panels SET ${cols.join(', ')} WHERE guild_id = ? AND id = ?`, values);
  }
  return getTicketPanel(guildId, id);
}

async function setTicketPanelMessage(guildId, id, channelId, messageId) {
  await pool.execute(
    'UPDATE ticket_panels SET panel_channel_id = ?, panel_message_id = ? WHERE guild_id = ? AND id = ?',
    [channelId, messageId, guildId, id]
  );
  return getTicketPanel(guildId, id);
}

async function getTicketPanels(guildId) {
  const [rows] = await pool.execute('SELECT * FROM ticket_panels WHERE guild_id = ? ORDER BY created_at ASC', [guildId]);
  return Promise.all(rows.map(async (p) => ({ ...p, options: await getPanelOptions(p.id) })));
}

async function getTicketPanel(guildId, id) {
  const [rows] = await pool.execute('SELECT * FROM ticket_panels WHERE guild_id = ? AND id = ?', [guildId, id]);
  if (!rows[0]) return undefined;
  return { ...rows[0], options: await getPanelOptions(id) };
}

async function deleteTicketPanel(guildId, id) {
  await pool.execute('DELETE FROM ticket_panel_options WHERE guild_id = ? AND panel_id = ?', [guildId, id]);
  const [result] = await pool.execute('DELETE FROM ticket_panels WHERE guild_id = ? AND id = ?', [guildId, id]);
  return { changes: result.affectedRows };
}

async function addPanelOption(panelId, guildId, label, emoji, description) {
  const [result] = await pool.execute(
    'INSERT INTO ticket_panel_options (panel_id, guild_id, label, emoji, description) VALUES (?, ?, ?, ?, ?)',
    [panelId, guildId, label, emoji || null, description || null]
  );
  const [rows] = await pool.execute('SELECT * FROM ticket_panel_options WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function deletePanelOption(guildId, id) {
  const [result] = await pool.execute('DELETE FROM ticket_panel_options WHERE guild_id = ? AND id = ?', [guildId, id]);
  return { changes: result.affectedRows };
}

async function getPanelOptions(panelId) {
  const [rows] = await pool.execute('SELECT * FROM ticket_panel_options WHERE panel_id = ? ORDER BY id ASC', [panelId]);
  return rows;
}

// Giveaways
async function createGiveaway(guildId, channelId, messageId, prize, winnerCount, hostId, endsAt, requiredRoleId = null, minLevel = 0) {
  const [result] = await pool.execute(
    'INSERT INTO giveaways (guild_id, channel_id, message_id, prize, winner_count, host_id, ends_at, required_role_id, min_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [guildId, channelId, messageId, prize, winnerCount, hostId, endsAt, requiredRoleId, minLevel || 0]
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

async function getSuggestionByMessage(messageId) {
  const [rows] = await pool.execute('SELECT * FROM suggestions WHERE message_id = ?', [messageId]);
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

// ---- Reminders (/remindme) ----
async function addReminder(guildId, userId, channelId, message, remindAt) {
  const [result] = await pool.execute(
    'INSERT INTO reminders (guild_id, user_id, channel_id, message, remind_at) VALUES (?, ?, ?, ?, ?)',
    [guildId, userId, channelId, message, remindAt]
  );
  const [rows] = await pool.execute('SELECT * FROM reminders WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function getDueReminders() {
  const [rows] = await pool.execute('SELECT * FROM reminders WHERE fulfilled = 0 AND remind_at <= UTC_TIMESTAMP()');
  return rows;
}

async function markReminderFulfilled(id) {
  await pool.execute('UPDATE reminders SET fulfilled = 1 WHERE id = ?', [id]);
}

// ---- Site settings (key/value, site-wide — not guild-scoped) ----
async function getSiteSetting(key) {
  const [rows] = await pool.execute('SELECT setting_value FROM site_settings WHERE setting_key = ?', [key]);
  return rows[0]?.setting_value ?? null;
}

async function setSiteSetting(key, value) {
  await pool.execute(
    'INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
    [key, value]
  );
}

// ---- VIP codes ----
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — avoids ambiguous codes

function generateCodeString() {
  let out = 'NEXUS';
  for (let group = 0; group < 3; group++) {
    out += '-';
    for (let i = 0; i < 4; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

async function generateVipCodes(createdBy, duration, quantity, note) {
  const codes = [];
  for (let i = 0; i < quantity; i++) {
    let code;
    let inserted = false;
    // Collisions are astronomically unlikely (32^12 keyspace) but retry a
    // few times against the UNIQUE constraint just in case.
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      code = generateCodeString();
      try {
        await pool.execute('INSERT INTO vip_codes (code, duration, note, created_by) VALUES (?, ?, ?, ?)', [
          code,
          duration,
          note || null,
          createdBy,
        ]);
        inserted = true;
      } catch (err) {
        if (err.code !== 'ER_DUP_ENTRY') throw err;
      }
    }
    if (inserted) codes.push(code);
  }
  return codes;
}

async function getVipCodes() {
  const [rows] = await pool.execute('SELECT * FROM vip_codes ORDER BY created_at DESC');
  return rows;
}

async function getVipCodeByCode(code) {
  const [rows] = await pool.execute('SELECT * FROM vip_codes WHERE code = ?', [code]);
  return rows[0];
}

async function deleteVipCode(id) {
  const [result] = await pool.execute('DELETE FROM vip_codes WHERE id = ? AND redeemed_guild_id IS NULL', [id]);
  return { changes: result.affectedRows };
}

function vipExpiryFor(duration) {
  if (duration === 'lifetime') return null;
  const d = new Date();
  if (duration === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

async function redeemVipCode(code, guildId, userId) {
  const row = await getVipCodeByCode(code);
  if (!row) throw Object.assign(new Error('Invalid code.'), { status: 400 });
  if (row.redeemed_guild_id) throw Object.assign(new Error('This code has already been redeemed.'), { status: 400 });

  const expiresAt = vipExpiryFor(row.duration);
  await pool.execute(
    'UPDATE vip_codes SET redeemed_guild_id = ?, redeemed_by = ?, redeemed_at = UTC_TIMESTAMP() WHERE id = ?',
    [guildId, userId, row.id]
  );
  await grantVip(guildId, row.duration, expiresAt, row.code);
  return getGuildConfig(guildId);
}

async function grantVip(guildId, tier, expiresAt, code = null) {
  await getGuildConfig(guildId); // ensure row exists
  await pool.execute(
    'UPDATE guild_config SET vip_tier = ?, vip_expires_at = ?, vip_code = ?, vip_granted_at = UTC_TIMESTAMP() WHERE guild_id = ?',
    [tier, tier === 'lifetime' ? null : expiresAt, code, guildId]
  );
  return getGuildConfig(guildId);
}

async function revokeVip(guildId) {
  await pool.execute(
    'UPDATE guild_config SET vip_tier = NULL, vip_expires_at = NULL, vip_code = NULL, vip_granted_at = NULL WHERE guild_id = ?',
    [guildId]
  );
  return getGuildConfig(guildId);
}

async function getVipStats() {
  const [[codeStats]] = await pool.query(`
    SELECT COUNT(*) AS total, SUM(redeemed_guild_id IS NOT NULL) AS redeemed
    FROM vip_codes
  `);
  const [[guildStats]] = await pool.query(`
    SELECT COUNT(*) AS active
    FROM guild_config
    WHERE vip_tier = 'lifetime' OR (vip_tier IN ('year', 'month') AND vip_expires_at > UTC_TIMESTAMP())
  `);
  return {
    totalCodes: Number(codeStats.total) || 0,
    redeemedCodes: Number(codeStats.redeemed) || 0,
    activeVipServers: Number(guildStats.active) || 0,
  };
}

// Servers whose non-lifetime VIP expires within the next `days` days —
// used by the scheduler to post a renewal reminder before it lapses.
async function getGuildsWithExpiringVip(days = 7) {
  const [rows] = await pool.query(
    `SELECT guild_id, vip_tier, vip_expires_at FROM guild_config
     WHERE vip_tier IN ('year', 'month')
       AND vip_expires_at > UTC_TIMESTAMP()
       AND vip_expires_at <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY)`,
    [days]
  );
  return rows;
}

// ---- Admin audit log (website admin panel actions) ----
async function logAdminAction(actorId, action, detail) {
  await pool.execute('INSERT INTO admin_audit_log (actor_id, action, detail) VALUES (?, ?, ?)', [actorId, action, detail || null]);
}

async function getAdminAuditLog(limit = 200) {
  const [rows] = await pool.query('SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT ?', [limit]);
  return rows;
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
  resetXp,
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
  createTicketPanel,
  updateTicketPanel,
  setTicketPanelMessage,
  getTicketPanels,
  getTicketPanel,
  deleteTicketPanel,
  addPanelOption,
  deletePanelOption,
  getPanelOptions,
  createGiveaway,
  getActiveGiveaways,
  getAllGiveaways,
  getDueGiveaways,
  markGiveawayEnded,
  createSuggestion,
  getSuggestions,
  setSuggestionStatus,
  getSuggestionById,
  getSuggestionByMessage,
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
  vipExpiryFor,
  generateVipCodes,
  getVipCodes,
  getVipCodeByCode,
  deleteVipCode,
  redeemVipCode,
  grantVip,
  revokeVip,
  getVipStats,
  getGuildsWithExpiringVip,
  logAdminAction,
  getAdminAuditLog,
  getWarningsPage,
  getWarningsForUser,
  getModNotesForUser,
  getModActionsPage,
  getModActionsForUser,
  getReactionRolesByGroup,
  addReminder,
  getDueReminders,
  markReminderFulfilled,
  getSiteSetting,
  setSiteSetting,
};
