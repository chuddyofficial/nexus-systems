const db = require('../../database/db');
const { handleStarReaction } = require('../utils/starboard');

function emojiKey(emoji) {
  return emoji.id ? emoji.id : emoji.name;
}

async function handleSuggestionVote(reaction, guild) {
  if (reaction.emoji.name !== '👍' && reaction.emoji.name !== '👎') return;
  const suggestion = await db.getSuggestionByMessage(reaction.message.id);
  if (!suggestion || suggestion.status !== 'pending') return;

  const cfg = await db.getGuildConfig(guild.id);
  if (!cfg.suggestions_auto_threshold_up && !cfg.suggestions_auto_threshold_down) return;

  const message = reaction.message;
  const up = message.reactions.cache.get('👍')?.count ?? 0;
  const down = message.reactions.cache.get('👎')?.count ?? 0;

  if (cfg.suggestions_auto_threshold_up && up >= cfg.suggestions_auto_threshold_up) {
    await db.setSuggestionStatus(guild.id, suggestion.id, 'approved');
    await message.edit({ embeds: message.embeds.map((e) => ({ ...e.data, footer: { text: `✅ Auto-approved at ${up} upvotes` }, color: 0x57f287 })) }).catch(() => {});
  } else if (cfg.suggestions_auto_threshold_down && down >= cfg.suggestions_auto_threshold_down) {
    await db.setSuggestionStatus(guild.id, suggestion.id, 'denied');
    await message.edit({ embeds: message.embeds.map((e) => ({ ...e.data, footer: { text: `❌ Auto-denied at ${down} downvotes` }, color: 0xed4245 })) }).catch(() => {});
  }
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
    handleSuggestionVote(reaction, reaction.message.guild).catch((err) => console.error('[suggestions]', err));

    const rr = await db.getReactionRoleByMessage(reaction.message.id, emojiKey(reaction.emoji));
    if (!rr) return;

    const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
    if (!member) return;
    const role = reaction.message.guild.roles.cache.get(rr.role_id);
    if (!role) return;

    // Exclusive group: picking one role in the group removes any other
    // reaction (and role) this member already has from the same group.
    if (rr.exclusive_group) {
      const groupRoles = await db.getReactionRolesByGroup(reaction.message.guild.id, reaction.message.id, rr.exclusive_group);
      for (const other of groupRoles) {
        if (other.role_id === rr.role_id) continue;
        if (member.roles.cache.has(other.role_id)) {
          await member.roles.remove(other.role_id).catch(() => {});
        }
        // reactions.cache is keyed the same way emojiKey() builds rr.emoji —
        // custom emoji ID or unicode name — so this looks up directly.
        await reaction.message.reactions.cache.get(other.emoji)?.users.remove(user.id).catch(() => {});
      }
    }

    await member.roles.add(role).catch(() => {});
  },
};
