const config = require('./config');
const db = require('./database/db');
const client = require('./bot/client');
const { loadCommands } = require('./bot/commandHandler');
const { loadEvents } = require('./bot/eventHandler');
const { createServer } = require('./web/server');

if (!config.token || !config.clientId) {
  console.error('[boot] Missing DISCORD_TOKEN or CLIENT_ID in .env');
  process.exit(1);
}

async function main() {
  await db.initDb().catch((err) => {
    console.error('[boot] Failed to connect to MySQL:', err.message);
    console.error('[boot] Check DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME in .env, and that MySQL is running.');
    process.exit(1);
  });
  console.log('[db] Connected and schema is up to date');

  loadCommands(client);
  loadEvents(client);

  const { server } = createServer(client);
  server.listen(config.port, () => {
    console.log(`[web] Dashboard listening at ${config.dashboardUrl}`);
  });

  await client.login(config.token).catch((err) => {
    console.error('[boot] Failed to log in to Discord:', err.message);
    process.exit(1);
  });
}

main();

process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});
