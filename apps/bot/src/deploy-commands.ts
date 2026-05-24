import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

import { REST, Routes } from 'discord.js';
import { logger } from './utils/logger.js';
import * as setupCmd from './commands/setup.js';
import * as configCmd from './commands/config.js';
import * as pingCmd from './commands/ping.js';
import * as infoCmd from './commands/info.js';
import * as excuseCmd from './commands/excuse.js';
import * as epochCmd from './commands/epoch.js';
import * as devutilsCmd from './commands/devutils.js';
import * as statusCmd from './commands/status.js';
import * as adminCmd from './commands/admin.js';
import * as helpCmd from './commands/help.js';
import * as postCmd from './commands/post.js';
import * as dailyAlgoCmd from './commands/dailyAlgo.js';
import * as profileCmd from './commands/profile.js';
import * as sanctionCmd from './commands/sanction.js';
import * as casierCmd from './commands/casier.js';
import * as absentCmd from './commands/absent.js';
import * as statsCmd from './commands/stats.js';
import * as leaderboardCmd from './commands/leaderboard.js';
import * as serverstatsCmd from './commands/serverstats.js';
import * as invitesCmd from './commands/invites.js';
import * as noteCmd from './commands/note.js';
import * as transcriptCmd from './commands/transcript.js';
import * as sayCmd from './commands/say.js';
import * as demissionCmd from './commands/demission.js';
const commands = [
  setupCmd,
  configCmd,
  pingCmd,
  infoCmd,
  excuseCmd,
  epochCmd,
  devutilsCmd,
  statusCmd,
  adminCmd,
  postCmd,
  helpCmd,
  dailyAlgoCmd,
  profileCmd,
  sanctionCmd,
  casierCmd,
  absentCmd,
  statsCmd,
  leaderboardCmd,
  serverstatsCmd,
  invitesCmd,
  noteCmd,
  transcriptCmd,
  sayCmd,
  demissionCmd,
  { data: noteCmd.contextData },
  { data: casierCmd.contextData },
  { data: sanctionCmd.contextData },
].map((cmd) => cmd.data.toJSON());

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  logger.error('Déploiement', 'DISCORD_TOKEN et DISCORD_CLIENT_ID sont requis dans .env');
  process.exit(1);
}

const rest = new REST().setToken(token);

try {
  logger.info('Déploiement', `Déploiement de ${commands.length} commandes...`);

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    logger.success('Déploiement', `Commandes déployées sur le serveur ${guildId}`);
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    logger.success('Déploiement', 'Commandes déployées globalement (délai jusqu\'à 1h)');
  }
} catch (err) {
  logger.error('Déploiement', 'Échec du déploiement :', err);
  process.exit(1);
}
