const { EventEmitter } = require('node:events');

/**
 * Process-wide event bus. The bot emits console/log events here; the web
 * server (Socket.IO) subscribes and relays them to connected dashboard
 * clients in real time, and the bot itself uses it to push mod-log embeds.
 */
class BotEventBus extends EventEmitter {}

module.exports = new BotEventBus();
