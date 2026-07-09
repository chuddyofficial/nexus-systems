const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../../config');

const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a quick poll')
    .addStringOption((o) => o.setName('question').setDescription('The poll question').setRequired(true))
    .addStringOption((o) => o.setName('options').setDescription('Comma-separated options (2-10). Leave blank for a simple yes/no poll.'))
    .setDMPermission(false),

  async execute(interaction) {
    const question = interaction.options.getString('question', true);
    const optionsInput = interaction.options.getString('options');

    let options = [];
    if (optionsInput) {
      options = optionsInput
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
        .slice(0, 10);
    }

    const embed = new EmbedBuilder().setTitle('📊 ' + question).setColor(config.brandColor).setFooter({ text: `Poll by ${interaction.user.tag}` });

    let emojis;
    if (options.length >= 2) {
      emojis = NUMBER_EMOJIS.slice(0, options.length);
      embed.setDescription(options.map((o, i) => `${emojis[i]} ${o}`).join('\n'));
    } else {
      emojis = ['👍', '👎'];
    }

    await interaction.reply({ embeds: [embed] });
    const message = await interaction.fetchReply();
    for (const emoji of emojis) await message.react(emoji);
  },
};
