const { EmbedBuilder } = require('discord.js');
const db = require('../../database/db');
const bus = require('./eventBus');
const config = require('../../config');

function pushConsole(guildId, level, message, meta = {}) {
  bus.emit('console', { guildId, level, message, meta, at: Date.now() });
}

// Accepts either a discord.js User (has .tag) or a passport-discord profile
// (has .username/.discriminator) since moderation actions can originate
// from either a slash command or the web dashboard.
function label(person) {
  if (!person) return 'Unknown';
  if (person.tag) return person.tag;
  if (person.username) {
    return person.discriminator && person.discriminator !== '0'
      ? `${person.username}#${person.discriminator}`
      : person.username;
  }
  return String(person.id ?? person);
}

async function sendModLog(guild, { action, target, moderator, reason, color = config.brandColor, extra = [] }) {
  pushConsole(guild.id, 'mod', `${action}: ${label(target)} by ${label(moderator)} — ${reason ?? 'no reason'}`);
  const cfg = await db.getGuildConfig(guild.id);
  if (!cfg.mod_log_channel) return;
  const channel = guild.channels.cache.get(cfg.mod_log_channel);
  if (!channel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle(`Moderation Action: ${action}`)
    .setColor(color)
    .addFields(
      { name: 'User', value: target ? `${label(target)} (${target.id})` : 'Unknown', inline: false },
      { name: 'Moderator', value: moderator ? `${label(moderator)} (${moderator.id})` : 'Unknown', inline: false },
      { name: 'Reason', value: reason || 'No reason provided', inline: false },
      ...extra
    )
    .setTimestamp(new Date());

  channel.send({ embeds: [embed] }).catch(() => {});
}

async function sendMessageLog(guild, { title, description, color = 0xed4245, fields = [] }) {
  pushConsole(guild.id, 'message', `${title}: ${description}`);
  const cfg = await db.getGuildConfig(guild.id);
  if (!cfg.message_log_channel) return;
  const channel = guild.channels.cache.get(cfg.message_log_channel);
  if (!channel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description?.slice(0, 4000) || null)
    .setColor(color)
    .addFields(fields)
    .setTimestamp(new Date());

  channel.send({ embeds: [embed] }).catch(() => {});
}

async function sendJoinLog(guild, { title, description, color = 0x57f287 }) {
  pushConsole(guild.id, 'member', `${title}: ${description}`);
  const cfg = await db.getGuildConfig(guild.id);
  if (!cfg.join_log_channel) return;
  const channel = guild.channels.cache.get(cfg.join_log_channel);
  if (!channel?.isTextBased()) return;

  const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp(new Date());
  channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = { sendModLog, sendMessageLog, sendJoinLog, pushConsole };
