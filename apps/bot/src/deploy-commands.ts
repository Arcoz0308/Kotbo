import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

import { REST, Routes } from 'discord.js';
import { logger } from './utils/logger.js';
import * as setupCmd from './commands/setup.js';
import * as configCmd from './commands/config.js';
import * as feedCmd from './commands/feed.js';
import * as newsCmd from './commands/news.js';
// import * as statsCmd from './commands/stats.js';

const commands = [setupCmd, configCmd, feedCmd, newsCmd].map((cmd) => cmd.data.toJSON());

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  logger.error('Deploy', 'DISCORD_TOKEN et DISCORD_CLIENT_ID requis dans .env');
  process.exit(1);
}

const rest = new REST().setToken(token);

try {
  logger.info('Deploy', `Déploiement de ${commands.length} commandes...`);

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    logger.success('Deploy', `Commandes déployées sur le serveur ${guildId}`);
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    logger.success('Deploy', 'Commandes déployées globalement (délai jusqu\'à 1h)');
  }
} catch (err) {
  logger.error('Deploy', 'Erreur de déploiement:', err);
  process.exit(1);
}
