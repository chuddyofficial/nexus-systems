CREATE TABLE IF NOT EXISTS guild_config (
  guild_id TEXT PRIMARY KEY,
  mod_log_channel TEXT,
  message_log_channel TEXT,
  join_log_channel TEXT,
  mute_role_id TEXT,

  welcome_enabled INTEGER NOT NULL DEFAULT 0,
  welcome_channel TEXT,
  welcome_message TEXT DEFAULT 'Welcome {user} to **{server}**! You are member #{memberCount}.',
  welcome_embed_color TEXT DEFAULT '#5865F2',

  leave_enabled INTEGER NOT NULL DEFAULT 0,
  leave_channel TEXT,
  leave_message TEXT DEFAULT '{user} has left **{server}**. We now have {memberCount} members.',

  automod_enabled INTEGER NOT NULL DEFAULT 0,
  automod_anti_invite INTEGER NOT NULL DEFAULT 0,
  automod_anti_spam INTEGER NOT NULL DEFAULT 0,
  automod_spam_threshold INTEGER NOT NULL DEFAULT 5,
  automod_spam_interval INTEGER NOT NULL DEFAULT 5000,
  automod_anti_mass_mention INTEGER NOT NULL DEFAULT 0,
  automod_max_mentions INTEGER NOT NULL DEFAULT 5,
  automod_caps_filter INTEGER NOT NULL DEFAULT 0,
  automod_caps_percent INTEGER NOT NULL DEFAULT 70,
  automod_caps_min_len INTEGER NOT NULL DEFAULT 10,
  automod_banned_words TEXT NOT NULL DEFAULT '[]',
  automod_ignored_channels TEXT NOT NULL DEFAULT '[]',
  automod_action TEXT NOT NULL DEFAULT 'delete',

  prefix TEXT NOT NULL DEFAULT '!',

  autorole_id TEXT,

  antiraid_enabled INTEGER NOT NULL DEFAULT 0,
  antiraid_join_threshold INTEGER NOT NULL DEFAULT 6,
  antiraid_join_window INTEGER NOT NULL DEFAULT 10000,
  antiraid_action TEXT NOT NULL DEFAULT 'kick',
  antiraid_min_account_age_days INTEGER NOT NULL DEFAULT 0,

  leveling_enabled INTEGER NOT NULL DEFAULT 0,
  leveling_announce_channel TEXT,
  leveling_announce_message TEXT DEFAULT 'GG {user}, you just reached **level {level}**!',

  starboard_enabled INTEGER NOT NULL DEFAULT 0,
  starboard_channel TEXT,
  starboard_emoji TEXT NOT NULL DEFAULT '⭐',
  starboard_threshold INTEGER NOT NULL DEFAULT 3,

  ticket_category_id TEXT,
  ticket_support_role_id TEXT,
  ticket_panel_channel TEXT,
  ticket_panel_message TEXT,

  suggestions_channel TEXT,

  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mod_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reaction_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  role_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS custom_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  response TEXT,
  embed_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(guild_id, trigger)
);

CREATE TABLE IF NOT EXISTS saved_embeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  embed_json TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(guild_id, name)
);

CREATE TABLE IF NOT EXISTS levels (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS starboard_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  original_message_id TEXT NOT NULL,
  starboard_message_id TEXT NOT NULL,
  star_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(guild_id, original_message_id)
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS giveaways (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  prize TEXT NOT NULL,
  winner_count INTEGER NOT NULL DEFAULT 1,
  host_id TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  ended INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mod_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scheduled_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  run_at TEXT NOT NULL,
  executed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_warnings_guild_user ON warnings(guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_modactions_guild ON mod_actions(guild_id);
CREATE INDEX IF NOT EXISTS idx_reactionroles_message ON reaction_roles(guild_id, message_id);
CREATE INDEX IF NOT EXISTS idx_levels_guild_xp ON levels(guild_id, xp);
CREATE INDEX IF NOT EXISTS idx_modnotes_guild_user ON mod_notes(guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_due ON scheduled_actions(executed, run_at);
CREATE INDEX IF NOT EXISTS idx_tickets_guild_status ON tickets(guild_id, status);
CREATE INDEX IF NOT EXISTS idx_giveaways_ended ON giveaways(ended, ends_at);
CREATE INDEX IF NOT EXISTS idx_suggestions_guild ON suggestions(guild_id, status);
