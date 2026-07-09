const fs = require('node:fs');
const path = require('node:path');

function loadEvents(client) {
  const eventsPath = path.join(__dirname, 'events');
  const files = fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    const event = require(path.join(eventsPath, file));
    if (!event?.name || !event?.execute) {
      console.warn(`[events] Skipping ${file}: missing "name" or "execute"`);
      continue;
    }
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
  }
  console.log(`[events] Loaded ${files.length} event handlers`);
}

module.exports = { loadEvents };
