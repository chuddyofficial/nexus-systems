const { EventEmitter } = require('node:events');

/**
 * Process-wide event bus. The bot emits console/log events here; the web
 * server (Socket.IO) subscribes and relays them to connected dashboard
 * clients in real time, and the bot itself uses it to push mod-log embeds.
 */
class BotEventBus extends EventEmitter {}

const bus = new BotEventBus();
// Each connected dashboard socket adds a 'console' and 'announcement'
// listener — the default cap of 10 would trip MaxListenersExceededWarning
// with more than ~5 concurrent sessions.
bus.setMaxListeners(0);

module.exports = bus;
