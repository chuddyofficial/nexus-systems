const { EmbedBuilder } = require('discord.js');
const db = require('../../database/db');
const { replacePlaceholders } = require('./embedBuilder');
const config = require('../../config');

const XP_COOLDOWN_MS = 60_000;
const lastAward = new Map(); // "guildId:userId" -> timestamp

function xpForLevel(level) {
  return Math.pow(level / 0.2, 2);
}

async function awardMessageXp(message) {
  const cfg = await db.getGuildConfig(message.guild.id);
  if (!cfg.leveling_enabled) return;
  if (cfg.leveling_no_xp_channels.includes(message.channel.id)) return;

  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  if (now - (lastAward.get(key) ?? 0) < XP_COOLDOWN_MS) return;
  lastAward.set(key, now);

  const base = 15 + Math.floor(Math.random() * 11); // 15-25
  // VIP servers get an automatic 2x on top of whatever multiplier is configured.
  const multiplier = (cfg.leveling_xp_multiplier / 100) * (cfg.vip_active ? 2 : 1);
  const amount = Math.max(1, Math.round(base * multiplier));
  const result = await db.addXp(message.guild.id, message.author.id, amount);

  if (result.leveledUp && cfg.leveling_announce_channel) {
    const channel = message.guild.channels.cache.get(cfg.leveling_announce_channel);
    if (channel?.isTextBased()) {
      const text = replacePlaceholders(cfg.leveling_announce_message, { user: message.author, guild: message.guild }).replace(
        '{level}',
        String(result.level)
      );
      channel.send({ content: text }).catch(() => {});
    }
  } else if (result.leveledUp) {
    message.channel
      .send({
        embeds: [
          new EmbedBuilder()
            .setDescription(`GG ${message.author}, you just reached **level ${result.level}**!`)
            .setColor((cfg.vip_active && cfg.vip_theme_color) || config.brandColor),
        ],
      })
      .catch(() => {});
  }

  if (result.leveledUp) {
    const levelRoles = await db.getLevelRoles(message.guild.id);
    const earned = levelRoles.filter((r) => r.level <= result.level);
    const member = message.member;
    if (member && earned.length) {
      const roleIds = earned.map((r) => r.role_id).filter((id) => message.guild.roles.cache.has(id));
      await member.roles.add(roleIds).catch(() => {});
    }
  }
}

module.exports = { awardMessageXp, xpForLevel };
