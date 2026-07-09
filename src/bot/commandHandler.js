const fs = require('node:fs');
const path = require('node:path');

function loadCommands(client) {
  const commandsPath = path.join(__dirname, 'commands');
  const categories = fs.readdirSync(commandsPath).filter((f) => fs.statSync(path.join(commandsPath, f)).isDirectory());

  for (const category of categories) {
    const categoryPath = path.join(commandsPath, category);
    const files = fs.readdirSync(categoryPath).filter((f) => f.endsWith('.js'));
    for (const file of files) {
      const command = require(path.join(categoryPath, file));
      if (!command?.data || !command?.execute) {
        console.warn(`[commands] Skipping ${category}/${file}: missing "data" or "execute"`);
        continue;
      }
      command.category = category;
      client.commands.set(command.data.name, command);
    }
  }
  console.log(`[commands] Loaded ${client.commands.size} slash commands`);
}

module.exports = { loadCommands };
