CREATE TABLE IF NOT EXISTS guild_config (
  guild_id VARCHAR(32) PRIMARY KEY,
  mod_log_channel VARCHAR(32),
  message_log_channel VARCHAR(32),
  join_log_channel VARCHAR(32),
  mute_role_id VARCHAR(32),

  welcome_enabled TINYINT(1) NOT NULL DEFAULT 0,
  welcome_channel VARCHAR(32),
  welcome_message VARCHAR(1000) DEFAULT 'Welcome {user} to **{server}**! You are member #{memberCount}.',
  welcome_embed_color VARCHAR(16) DEFAULT '#5865F2',

  leave_enabled TINYINT(1) NOT NULL DEFAULT 0,
  leave_channel VARCHAR(32),
  leave_message VARCHAR(1000) DEFAULT '{user} has left **{server}**. We now have {memberCount} members.',

  automod_enabled TINYINT(1) NOT NULL DEFAULT 0,
  automod_anti_invite TINYINT(1) NOT NULL DEFAULT 0,
  automod_anti_spam TINYINT(1) NOT NULL DEFAULT 0,
  automod_spam_threshold INT NOT NULL DEFAULT 5,
  automod_spam_interval INT NOT NULL DEFAULT 5000,
  automod_anti_mass_mention TINYINT(1) NOT NULL DEFAULT 0,
  automod_max_mentions INT NOT NULL DEFAULT 5,
  automod_caps_filter TINYINT(1) NOT NULL DEFAULT 0,
  automod_caps_percent INT NOT NULL DEFAULT 70,
  automod_caps_min_len INT NOT NULL DEFAULT 10,
  automod_banned_words TEXT,
  automod_ignored_channels TEXT,
  automod_action VARCHAR(32) NOT NULL DEFAULT 'delete',

  prefix VARCHAR(8) NOT NULL DEFAULT '!',

  autorole_id VARCHAR(32),

  antiraid_enabled TINYINT(1) NOT NULL DEFAULT 0,
  antiraid_join_threshold INT NOT NULL DEFAULT 6,
  antiraid_join_window INT NOT NULL DEFAULT 10000,
  antiraid_action VARCHAR(16) NOT NULL DEFAULT 'kick',
  antiraid_min_account_age_days INT NOT NULL DEFAULT 0,

  leveling_enabled TINYINT(1) NOT NULL DEFAULT 0,
  leveling_announce_channel VARCHAR(32),
  leveling_announce_message VARCHAR(1000) DEFAULT 'GG {user}, you just reached **level {level}**!',

  starboard_enabled TINYINT(1) NOT NULL DEFAULT 0,
  starboard_channel VARCHAR(32),
  starboard_emoji VARCHAR(32) NOT NULL DEFAULT '⭐',
  starboard_threshold INT NOT NULL DEFAULT 3,

  ticket_category_id VARCHAR(32),
  ticket_support_role_id VARCHAR(32),
  ticket_panel_channel VARCHAR(32),
  ticket_panel_message VARCHAR(32),

  suggestions_channel VARCHAR(32),

  updated_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS warnings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  moderator_id VARCHAR(32) NOT NULL,
  reason TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mod_actions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  moderator_id VARCHAR(32) NOT NULL,
  action_type VARCHAR(32) NOT NULL,
  reason TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reaction_roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  channel_id VARCHAR(32) NOT NULL,
  message_id VARCHAR(32) NOT NULL,
  emoji VARCHAR(64) NOT NULL,
  role_id VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS custom_commands (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  trigger_word VARCHAR(64) NOT NULL,
  response TEXT,
  embed_json TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_guild_trigger (guild_id, trigger_word)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS saved_embeds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  name VARCHAR(128) NOT NULL,
  embed_json TEXT NOT NULL,
  created_by VARCHAR(32),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_guild_name (guild_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS levels (
  guild_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  xp INT NOT NULL DEFAULT 0,
  level INT NOT NULL DEFAULT 0,
  last_message_at DATETIME NULL,
  PRIMARY KEY (guild_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS starboard_posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  original_message_id VARCHAR(32) NOT NULL,
  starboard_message_id VARCHAR(32) NOT NULL,
  star_count INT NOT NULL DEFAULT 0,
  UNIQUE KEY uniq_guild_message (guild_id, original_message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  channel_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS giveaways (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  channel_id VARCHAR(32) NOT NULL,
  message_id VARCHAR(32) NOT NULL,
  prize VARCHAR(256) NOT NULL,
  winner_count INT NOT NULL DEFAULT 1,
  host_id VARCHAR(32) NOT NULL,
  ends_at DATETIME NOT NULL,
  ended TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS suggestions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  channel_id VARCHAR(32) NOT NULL,
  message_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  content TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mod_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  moderator_id VARCHAR(32) NOT NULL,
  note TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS scheduled_actions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  action_type VARCHAR(32) NOT NULL,
  payload TEXT NOT NULL,
  run_at DATETIME NOT NULL,
  executed TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS disabled_commands (
  guild_id VARCHAR(32) NOT NULL,
  command_name VARCHAR(64) NOT NULL,
  disabled_by VARCHAR(32),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, command_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(16) NOT NULL DEFAULT '#5865F2',
  permissions VARCHAR(2000) NOT NULL DEFAULT '[]',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_guild_team_name (guild_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS team_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  guild_id VARCHAR(32) NOT NULL,
  member_type VARCHAR(8) NOT NULL DEFAULT 'user',
  discord_id VARCHAR(32) NOT NULL,
  added_by VARCHAR(32),
  added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_team_member (team_id, discord_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS level_roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  level INT NOT NULL,
  role_id VARCHAR(32) NOT NULL,
  UNIQUE KEY uniq_guild_level (guild_id, level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Columns added after the initial release, applied via plain ALTER TABLE
-- (MySQL, unlike MariaDB, has no "ADD COLUMN IF NOT EXISTS" — idempotency
-- on re-run is instead handled in db.js's initDb() by tolerating the
-- "duplicate column" error code). Kept as separate ALTERs rather than
-- folded into the CREATE TABLE statements above so this file stays safe to
-- run against both brand-new and already-provisioned databases.
ALTER TABLE guild_config ADD COLUMN verify_enabled TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE guild_config ADD COLUMN verify_role_id VARCHAR(32);
ALTER TABLE guild_config ADD COLUMN verify_channel_id VARCHAR(32);
ALTER TABLE guild_config ADD COLUMN verify_message VARCHAR(1000) DEFAULT 'Click the button below to verify yourself and gain access to the rest of the server.';
ALTER TABLE guild_config ADD COLUMN verify_panel_message VARCHAR(32);
ALTER TABLE guild_config ADD COLUMN ticket_transcript_channel VARCHAR(32);
ALTER TABLE guild_config ADD COLUMN ticket_auto_close_hours INT NOT NULL DEFAULT 0;

ALTER TABLE tickets ADD COLUMN claimed_by VARCHAR(32);
ALTER TABLE tickets ADD COLUMN category VARCHAR(64);
ALTER TABLE tickets ADD COLUMN last_activity_at DATETIME NULL;

CREATE INDEX idx_warnings_guild_user ON warnings(guild_id, user_id);
CREATE INDEX idx_modactions_guild ON mod_actions(guild_id);
CREATE INDEX idx_reactionroles_message ON reaction_roles(guild_id, message_id);
CREATE INDEX idx_levels_guild_xp ON levels(guild_id, xp);
CREATE INDEX idx_modnotes_guild_user ON mod_notes(guild_id, user_id);
CREATE INDEX idx_scheduled_due ON scheduled_actions(executed, run_at);
CREATE INDEX idx_tickets_guild_status ON tickets(guild_id, status);
CREATE INDEX idx_giveaways_ended ON giveaways(ended, ends_at);
CREATE INDEX idx_suggestions_guild ON suggestions(guild_id, status);
CREATE INDEX idx_teams_guild ON teams(guild_id);
CREATE INDEX idx_teammembers_guild_discord ON team_members(guild_id, discord_id);
CREATE INDEX idx_levelroles_guild ON level_roles(guild_id);
