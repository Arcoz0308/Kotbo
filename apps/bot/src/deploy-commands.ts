import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

import { REST, Routes } from 'discord.js';
import { logger } from './utils/logger.js';
import { applicationCommands } from './commands.js';

const commands = applicationCommands.map((cmd) => cmd.data.toJSON());

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
  logger.error('Déploiement', 'DISCORD_TOKEN et DISCORD_CLIENT_ID sont requis dans .env');
  process.exit(1);
}

const rest = new REST().setToken(token);

try {
  // Récupère toutes les guilds sur lesquelles le bot est présent pour nettoyer les commandes locales
  const guilds = await rest.get(Routes.userGuilds()) as { id: string; name: string }[];

  logger.info('Déploiement', `Nettoyage des anciennes commandes locales sur ${guilds.length} serveur(s)...`);

  const cleanupResults = await Promise.allSettled(
    guilds.map((guild) =>
      rest
        .put(Routes.applicationGuildCommands(clientId!, guild.id), { body: [] })
        .then(() => ({ guild, ok: true }))
        .catch((err) => ({ guild, ok: false, err }))
    )
  );

  let cleanupSuccess = 0;
  for (const result of cleanupResults) {
    if (result.status === 'fulfilled') {
      const { guild, ok, err } = result.value as any;
      if (ok) {
        cleanupSuccess++;
      } else {
        logger.error('Déploiement', `✗ Échec du nettoyage sur "${guild.name}" (${guild.id}) :`, err);
      }
    }
  }
  logger.info('Déploiement', `Nettoyage terminé : ${cleanupSuccess}/${guilds.length} serveurs nettoyés.`);

  // Déploiement global des commandes
  logger.info('Déploiement', `Déploiement de ${commands.length} commandes globales (sera visible dans le profil du bot)...`);
  await rest.put(Routes.applicationCommands(clientId!), { body: commands });
  
  logger.success('Déploiement', `✓ Déploiement global réussi pour les ${commands.length} commandes !`);
  process.exit(0);
} catch (err) {
  logger.error('Déploiement', 'Échec du déploiement :', err);
  process.exit(1);
}
