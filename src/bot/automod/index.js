const db = require('../../database/db');
const { sendMessageLog } = require('../utils/logger');

// In-memory sliding-window message tracker for spam detection: Map<"guildId:userId", number[]>
const recentMessages = new Map();

const INVITE_REGEX = /(discord\.gg|discord(?:app)?\.com\/invite|dsc\.gg)\/[a-z0-9-]+/i;

function checkCaps(content, minLen, percent) {
  if (content.length < minLen) return false;
  const letters = content.replace(/[^a-zA-Z]/g, '');
  if (letters.length < minLen) return false;
  const upper = letters.replace(/[^A-Z]/g, '');
  return (upper.length / letters.length) * 100 >= percent;
}

function checkBannedWords(content, words) {
  if (!words?.length) return null;
  const lower = content.toLowerCase();
  return words.find((w) => w && lower.includes(w.toLowerCase())) ?? null;
}

function checkSpam(guildId, userId, threshold, intervalMs) {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const arr = (recentMessages.get(key) ?? []).filter((t) => now - t < intervalMs);
  arr.push(now);
  recentMessages.set(key, arr);
  return arr.length > threshold;
}

/**
 * Runs automod checks against a message. Returns true if the message was
 * actioned (deleted) so the caller can skip further processing.
 */
async function runAutomod(message) {
  if (!message.guild || message.author.bot) return false;
  const cfg = db.getGuildConfig(message.guild.id);
  if (!cfg.automod_enabled) return false;
  if (cfg.automod_ignored_channels.includes(message.channel.id)) return false;

  const member = message.member;
  if (member?.permissions?.has('ManageMessages')) return false; // mods are exempt

  let violation = null;

  if (cfg.automod_anti_invite && INVITE_REGEX.test(message.content)) {
    violation = 'Posting a Discord invite link';
  }

  if (!violation && cfg.automod_banned_words.length) {
    const hit = checkBannedWords(message.content, cfg.automod_banned_words);
    if (hit) violation = `Using a banned word ("${hit}")`;
  }

  if (!violation && cfg.automod_caps_filter && checkCaps(message.content, cfg.automod_caps_min_len, cfg.automod_caps_percent)) {
    violation = 'Excessive caps';
  }

  if (!violation && cfg.automod_anti_mass_mention) {
    const mentionCount = message.mentions.users.size + message.mentions.roles.size;
    if (mentionCount > cfg.automod_max_mentions) violation = 'Mass mentioning';
  }

  if (!violation && cfg.automod_anti_spam) {
    if (checkSpam(message.guild.id, message.author.id, cfg.automod_spam_threshold, cfg.automod_spam_interval)) {
      violation = 'Sending messages too quickly (spam)';
    }
  }

  if (!violation) return false;

  await message.delete().catch(() => {});

  await sendMessageLog(message.guild, {
    title: 'AutoMod Action',
    description: `Deleted a message from <@${message.author.id}> in <#${message.channel.id}>\n**Reason:** ${violation}`,
    color: 0xed4245,
    fields: message.content
      ? [{ name: 'Content', value: message.content.slice(0, 1000), inline: false }]
      : [],
  });

  message.channel
    .send({ content: `${message.author}, that message was removed by AutoMod: **${violation}**.` })
    .then((m) => setTimeout(() => m.delete().catch(() => {}), 6000))
    .catch(() => {});

  return true;
}

module.exports = { runAutomod };
