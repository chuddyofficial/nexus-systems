require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');
const config = require('../config');

function collectCommands() {
  const commandsPath = path.join(__dirname, 'commands');
  const categories = fs.readdirSync(commandsPath).filter((f) => fs.statSync(path.join(commandsPath, f)).isDirectory());
  const commands = [];
  for (const category of categories) {
    const categoryPath = path.join(commandsPath, category);
    for (const file of fs.readdirSync(categoryPath).filter((f) => f.endsWith('.js'))) {
      const command = require(path.join(categoryPath, file));
      if (command?.data) commands.push(command.data.toJSON());
    }
  }
  return commands;
}

async function main() {
  const commands = collectCommands();
  const rest = new REST({ version: '10' }).setToken(config.token);

  console.log(`[deploy] Registering ${commands.length} commands...`);

  if (config.devGuildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.devGuildId), { body: commands });
    console.log(`[deploy] Registered to dev guild ${config.devGuildId} (instant).`);
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
    console.log('[deploy] Registered globally (may take up to 1 hour to appear).');
  }
}

main().catch((err) => {
  console.error('[deploy] Failed:', err);
  process.exit(1);
});
