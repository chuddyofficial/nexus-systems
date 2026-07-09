const { sendMessageLog } = require('../utils/logger');

module.exports = {
  name: 'messageUpdate',
  async execute(oldMessage, newMessage) {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.partial || newMessage.partial) return;
    if (oldMessage.content === newMessage.content) return;

    await sendMessageLog(newMessage.guild, {
      title: 'Message Edited',
      description: `Message by <@${newMessage.author.id}> edited in <#${newMessage.channel.id}> [Jump to message](${newMessage.url})`,
      color: 0xfee75c,
      fields: [
        { name: 'Before', value: (oldMessage.content || '*empty*').slice(0, 1000), inline: false },
        { name: 'After', value: (newMessage.content || '*empty*').slice(0, 1000), inline: false },
      ],
    });
  },
};
