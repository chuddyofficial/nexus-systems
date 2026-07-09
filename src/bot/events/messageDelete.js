const { sendMessageLog } = require('../utils/logger');

module.exports = {
  name: 'messageDelete',
  async execute(message) {
    if (!message.guild || message.author?.bot) return;
    if (message.partial) return; // can't recover content for uncached messages

    await sendMessageLog(message.guild, {
      title: 'Message Deleted',
      description: `Message by <@${message.author?.id ?? 'unknown'}> deleted in <#${message.channel.id}>`,
      color: 0xed4245,
      fields: message.content ? [{ name: 'Content', value: message.content.slice(0, 1000), inline: false }] : [],
    });
  },
};
