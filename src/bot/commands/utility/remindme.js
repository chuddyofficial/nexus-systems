const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../../../database/db');

function parseDuration(input) {
  const match = /^(\d+)\s*(m|min|h|hr|hour|d|day)s?$/i.exec(input.trim());
  if (!match) return null;
  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers = { m: 60_000, min: 60_000, h: 3_600_000, hr: 3_600_000, hour: 3_600_000, d: 86_400_000, day: 86_400_000 };
  return amount * multipliers[unit];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remindme')
    .setDescription('Get a DM reminder after a delay')
    .addStringOption((o) => o.setName('duration').setDescription('e.g. 30m, 2h, 1d').setRequired(true))
    .addStringOption((o) => o.setName('message').setDescription('What to remind you about').setRequired(true))
    .setDMPermission(false),

  async execute(interaction) {
    const durationInput = interaction.options.getString('duration', true);
    const message = interaction.options.getString('message', true);

    const durationMs = parseDuration(durationInput);
    if (!durationMs || durationMs > 30 * 86_400_000) {
      return interaction.reply({ content: 'Invalid duration. Use formats like `30m`, `2h`, `1d` (max 30 days).', flags: MessageFlags.Ephemeral });
    }

    const remindAt = new Date(Date.now() + durationMs).toISOString().replace('T', ' ').slice(0, 19);
    await db.addReminder(interaction.guild.id, interaction.user.id, interaction.channel.id, message, remindAt);

    await interaction.reply({
      content: `⏰ Got it — I'll remind you in ${durationInput} (via DM, or here if your DMs are closed).`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
