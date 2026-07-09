const { ActivityType } = require('discord.js');
const bus = require('../utils/eventBus');
const { startScheduler } = require('../utils/scheduler');

module.exports = {
  name: 'clientReady',
  once: true,
  execute(client) {
    console.log(`[bot] Logged in as ${client.user.tag}`);

    const setPresence = () => {
      client.user.setPresence({
        activities: [
          {
            name: `Serving and Protecting ${client.guilds.cache.size} server${client.guilds.cache.size === 1 ? '' : 's'}`,
            type: ActivityType.Watching,
          },
        ],
        status: 'online',
      });
    };
    setPresence();
    setInterval(setPresence, 10 * 60 * 1000);

    bus.emit('console', { level: 'system', message: `Bot ready as ${client.user.tag}`, at: Date.now() });
    bus.emit('ready', { tag: client.user.tag, guilds: client.guilds.cache.size });

    startScheduler(client);
  },
};
