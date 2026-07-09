const { EmbedBuilder } = require('discord.js');

/**
 * Build a discord.js EmbedBuilder from a plain JSON object shape used by
 * both the dashboard embed builder and slash commands.
 */
function buildEmbedFromData(data = {}) {
  const embed = new EmbedBuilder();
  if (data.title) embed.setTitle(String(data.title).slice(0, 256));
  if (data.description) embed.setDescription(String(data.description).slice(0, 4096));
  if (data.color) {
    const color = typeof data.color === 'string' ? parseInt(data.color.replace('#', ''), 16) : data.color;
    if (!Number.isNaN(color)) embed.setColor(color);
  }
  if (data.url) embed.setURL(data.url);
  if (data.author?.name) {
    embed.setAuthor({
      name: data.author.name.slice(0, 256),
      iconURL: data.author.iconUrl || undefined,
      url: data.author.url || undefined,
    });
  }
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  if (data.image) embed.setImage(data.image);
  if (data.footer?.text) {
    embed.setFooter({ text: data.footer.text.slice(0, 2048), iconURL: data.footer.iconUrl || undefined });
  }
  if (data.timestamp) embed.setTimestamp(data.timestamp === true ? new Date() : new Date(data.timestamp));
  if (Array.isArray(data.fields)) {
    for (const f of data.fields.slice(0, 25)) {
      if (!f?.name || !f?.value) continue;
      embed.addFields({ name: String(f.name).slice(0, 256), value: String(f.value).slice(0, 1024), inline: !!f.inline });
    }
  }
  return embed;
}

function replacePlaceholders(template, { user, guild }) {
  if (!template) return '';
  return template
    .replaceAll('{user}', user ? `<@${user.id}>` : '')
    .replaceAll('{username}', user?.username ?? '')
    .replaceAll('{server}', guild?.name ?? '')
    .replaceAll('{memberCount}', guild?.memberCount != null ? String(guild.memberCount) : '');
}

module.exports = { buildEmbedFromData, replacePlaceholders };
