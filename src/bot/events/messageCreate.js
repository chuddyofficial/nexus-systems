const db = require('../../database/db');
const { runAutomod } = require('../automod');
const { buildEmbedFromData, replacePlaceholders } = require('../utils/embedBuilder');
const { awardMessageXp } = require('../utils/leveling');

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot || !message.guild) return;

    const actioned = await runAutomod(message).catch((err) => {
      console.error('[automod]', err);
      return false;
    });
    if (actioned) return;

    awardMessageXp(message).catch((err) => console.error('[leveling]', err));

    const cfg = db.getGuildConfig(message.guild.id);
    const prefix = cfg.prefix || '!';
    if (!message.content.startsWith(prefix)) return;
    const trigger = message.content.slice(prefix.length).trim().split(/\s+/)[0]?.toLowerCase();
    if (!trigger) return;

    const cmd = db.getCustomCommand(message.guild.id, trigger);
    if (!cmd) return;

    const payload = {};
    if (cmd.response) payload.content = replacePlaceholders(cmd.response, { user: message.author, guild: message.guild });
    if (cmd.embed_json) {
      try {
        payload.embeds = [buildEmbedFromData(JSON.parse(cmd.embed_json))];
      } catch {
        /* ignore malformed embed json */
      }
    }
    if (!payload.content && !payload.embeds) return;
    message.channel.send(payload).catch(() => {});
  },
};
