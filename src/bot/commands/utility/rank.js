const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../../database/db');
const { xpForLevel } = require('../../utils/leveling');
const config = require('../../../config');

function progressBar(current, min, max, size = 14) {
  const pct = Math.max(0, Math.min(1, (current - min) / (max - min || 1)));
  const filled = Math.round(pct * size);
  return '█'.repeat(filled) + '░'.repeat(size - filled);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('View XP rank or the server leaderboard')
    .addSubcommand((sc) => sc.setName('me').setDescription('View your own rank').addUserOption((o) => o.setName('user').setDescription('Check someone else')))
    .addSubcommand((sc) => sc.setName('leaderboard').setDescription('View the top 10 members by XP'))
    .setDMPermission(false),

  async execute(interaction) {
    const cfg = db.getGuildConfig(interaction.guild.id);
    if (!cfg.leveling_enabled) {
      return interaction.reply({ content: 'Leveling is not enabled on this server.', flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'leaderboard') {
      const top = db.getLeaderboard(interaction.guild.id, 10);
      if (!top.length) return interaction.reply({ content: 'No XP data yet — start chatting!' });
      const lines = top.map((r, i) => `**${i + 1}.** <@${r.user_id}> — Level ${r.level} (${r.xp} XP)`);
      const embed = new EmbedBuilder().setTitle(`🏆 ${interaction.guild.name} Leaderboard`).setDescription(lines.join('\n')).setColor(config.brandColor);
      return interaction.reply({ embeds: [embed] });
    }

    const target = interaction.options.getUser('user') || interaction.user;
    const level = db.getLevel(interaction.guild.id, target.id);
    const rank = db.getRank(interaction.guild.id, target.id);
    const currentFloor = xpForLevel(level.level);
    const nextCeil = xpForLevel(level.level + 1);

    const embed = new EmbedBuilder()
      .setAuthor({ name: target.tag, iconURL: target.displayAvatarURL() })
      .setDescription(
        `**Rank:** #${rank || '—'}\n**Level:** ${level.level}\n**XP:** ${level.xp}\n${progressBar(level.xp, currentFloor, nextCeil)} ${Math.round(level.xp - currentFloor)}/${Math.round(nextCeil - currentFloor)} to next level`
      )
      .setColor(config.brandColor);

    await interaction.reply({ embeds: [embed] });
  },
};
