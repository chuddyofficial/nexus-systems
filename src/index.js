const config = require('./config');
const client = require('./bot/client');
const { loadCommands } = require('./bot/commandHandler');
const { loadEvents } = require('./bot/eventHandler');
const { createServer } = require('./web/server');

if (!config.token || !config.clientId) {
  console.error('[boot] Missing DISCORD_TOKEN or CLIENT_ID in .env');
  process.exit(1);
}

loadCommands(client);
loadEvents(client);

const { server } = createServer(client);
server.listen(config.port, () => {
  console.log(`[web] Dashboard listening at ${config.dashboardUrl}`);
});

client.login(config.token).catch((err) => {
  console.error('[boot] Failed to log in to Discord:', err.message);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});
