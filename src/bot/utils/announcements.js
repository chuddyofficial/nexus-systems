const { EmbedBuilder } = require('discord.js');
const db = require('../../database/db');
const bus = require('./eventBus');

// A website-admin broadcast always lands in three distinctly-styled places:
// the guild's mod log (gold "announcement" embed, separate from whatever
// color the admin picked for the channel post), a DM to the server owner,
// and a real-time banner across the top of the dashboard.
async function sendAnnouncementToGuild(guild, { title, description, color, skipModLogChannelId, skipBanner = false } = {}) {
  const embed = new EmbedBuilder()
    .setTitle(`📢 ${title || 'Announcement'}`)
    .setDescription(description || '')
    .setColor(color || 0xfee75c)
    .setFooter({ text: 'Nexus Systems — Website Admin Broadcast' })
    .setTimestamp(new Date());

  const cfg = await db.getGuildConfig(guild.id);
  if (cfg.mod_log_channel && cfg.mod_log_channel !== skipModLogChannelId) {
    const channel = guild.channels.cache.get(cfg.mod_log_channel);
    if (channel?.isTextBased()) await channel.send({ embeds: [embed] }).catch(() => {});
  }

  await guild
    .fetchOwner()
    .then((owner) => owner.send({ embeds: [embed] }))
    .catch(() => {});

  if (!skipBanner) {
    bus.emit('announcement', { guildId: guild.id, title: title || 'Announcement', message: description || '', at: Date.now() });
  }
}

// Site-wide banner: fires once for every connected dashboard visitor,
// regardless of which server (if any) they're currently viewing.
function broadcastSiteWideBanner({ title, description }) {
  bus.emit('announcement', { guildId: null, title: title || 'Announcement', message: description || '', at: Date.now() });
}

module.exports = { sendAnnouncementToGuild, broadcastSiteWideBanner };
