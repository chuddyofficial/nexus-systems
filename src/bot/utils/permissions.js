const { PermissionsBitField } = require('discord.js');

function memberHasAny(member, permissions) {
  if (!member) return false;
  return permissions.some((p) => member.permissions.has(PermissionsBitField.Flags[p]));
}

function canModerate(moderator, target) {
  if (!target) return true;
  if (target.id === moderator.id) return false;
  if (!target.moderatable && target.roles) {
    // fall through to role comparison below
  }
  const modHighest = moderator.roles.highest.position;
  const targetHighest = target.roles.highest.position;
  return modHighest > targetHighest || moderator.guild.ownerId === moderator.id;
}

module.exports = { memberHasAny, canModerate };
