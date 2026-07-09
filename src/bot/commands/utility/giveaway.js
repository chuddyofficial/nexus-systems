const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags, ChannelType } = require('discord.js');
const db = require('../../../database/db');
const config = require('../../../config');

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
    .setName('giveaway')
    .setDescription('Run a giveaway')
    .addSubcommand((sc) =>
      sc
        .setName('start')
        .setDescription('Start a new giveaway')
        .addStringOption((o) => o.setName('prize').setDescription('What are you giving away?').setRequired(true))
        .addStringOption((o) => o.setName('duration').setDescription('e.g. 30m, 2h, 1d').setRequired(true))
        .addIntegerOption((o) => o.setName('winners').setDescription('Number of winners').setMinValue(1).setMaxValue(20))
        .addChannelOption((o) => o.setName('channel').setDescription('Channel to post in').addChannelTypes(ChannelType.GuildText))
    )
    .addSubcommand((sc) => sc.setName('list').setDescription('List active giveaways'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const active = db.getActiveGiveaways(interaction.guild.id);
      if (!active.length) return interaction.reply({ content: 'No active giveaways.', flags: MessageFlags.Ephemeral });
      const lines = active.map((g) => `**${g.prize}** — ends <t:${Math.floor(new Date(g.ends_at.replace(' ', 'T') + 'Z').getTime() / 1000)}:R> in <#${g.channel_id}>`);
      return interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
    }

    const prize = interaction.options.getString('prize', true);
    const durationInput = interaction.options.getString('duration', true);
    const winnerCount = interaction.options.getInteger('winners') || 1;
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    const durationMs = parseDuration(durationInput);
    if (!durationMs) {
      return interaction.reply({ content: 'Invalid duration. Use formats like `30m`, `2h`, or `1d`.', flags: MessageFlags.Ephemeral });
    }

    const endsAt = new Date(Date.now() + durationMs);
    const embed = new EmbedBuilder()
      .setTitle('🎉 Giveaway!')
      .setDescription(`**Prize:** ${prize}\nReact with 🎉 to enter!\n**Winners:** ${winnerCount}\n**Ends:** <t:${Math.floor(endsAt.getTime() / 1000)}:R>`)
      .setColor(config.brandColor)
      .setFooter({ text: `Hosted by ${interaction.user.tag}` });

    const message = await channel.send({ embeds: [embed] });
    await message.react('🎉');

    db.createGiveaway(interaction.guild.id, channel.id, message.id, prize, winnerCount, interaction.user.id, endsAt.toISOString().replace('T', ' ').slice(0, 19));

    await interaction.reply({ content: `🎉 Giveaway started in ${channel}!`, flags: MessageFlags.Ephemeral });
  },
};
