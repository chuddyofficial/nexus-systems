const db = require('../../database/db');
const { handleStarReaction } = require('../utils/starboard');

function emojiKey(emoji) {
  return emoji.id ? emoji.id : emoji.name;
}

module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user) {
    if (user.bot) return;
    try {
      if (reaction.partial) await reaction.fetch();
    } catch {
      return;
    }
    if (!reaction.message.guild) return;

    handleStarReaction(reaction, user).catch((err) => console.error('[starboard]', err));

    const rr = await db.getReactionRoleByMessage(reaction.message.id, emojiKey(reaction.emoji));
    if (!rr) return;

    const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
    if (!member) return;
    const role = reaction.message.guild.roles.cache.get(rr.role_id);
    if (!role) return;

    await member.roles.add(role).catch(() => {});
  },
};
