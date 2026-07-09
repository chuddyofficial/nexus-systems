const bus = require('../utils/eventBus');

module.exports = {
  name: 'guildCreate',
  execute(guild) {
    bus.emit('console', { level: 'system', message: `Joined guild: ${guild.name} (${guild.id})`, at: Date.now() });
  },
};
