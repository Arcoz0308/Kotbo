import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

import {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  ActivityType,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
  MessageFlags,
  DiscordAPIError,
} from 'discord.js';
import { logger } from './utils/logger.js';
import { replyOrFollowUp } from './utils/interactionResponses.js';
import { registerCrons } from './events/crons.js';
import {
  handleButton,
  handleSelectMenu,
  handleModalSubmit,
} from './handlers/interactionHandler.js';
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
import * as profilCmd from './commands/profil.js';
import * as sanctionCmd from './commands/sanction.js';
import * as casierCmd from './commands/casier.js';
import * as absentCmd from './commands/absent.js';
import * as meetingCmd from './commands/meeting.js';
import * as noteCmd from './commands/note.js';
import prisma from './utils/db.js';
import {
  evaluateCommandRestriction,
  isPrivilegedCommandExecutor,
  normalizeCommandRestrictions,
} from './utils/commandAccess.js';
import { registerCodePoliceListener } from './events/codePolice.js';
import { registerModerationAuditListener } from './events/moderation.js';
import { registerAdvancedLogsListener } from './events/advancedLogs.js';
import { registerCloseSourceWarningListener } from './events/closeSourceWarning.js';
import { registerDailyAlgoHandlers } from './handlers/dailyAlgoHandler.js';
import { registerMeetingEvents } from './events/meetingEvents.js';
import { registerAnalyticsListeners } from './events/analyticsEvents.js';
import { syncOngoingDailyAlgoButtons } from './services/dailyAlgoService.js';
import { checkTranslationProviderHealth } from './services/translationService.js';
import { startDashboardApi } from './api/dashboardApi.js';
import { initBotSentry, captureException } from './observability/sentry.js';
import { initRedis } from './infra/redis.js';
import { startBackgroundQueueWorker } from './infra/queues/backgroundQueue.js';
import botPackageJson from '../package.json';
import * as leaderboardCmd from './commands/leaderboard.js';
import * as serverstatsCmd from './commands/serverstats.js';
import * as statsCmd from './commands/stats.js';
import * as invitesCmd from './commands/invites.js';

initBotSentry();

import { setClient } from './utils/client.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

setClient(client);

startDashboardApi(client);


type SlashCommand = {
  data: { name: string; toJSON: () => unknown };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
};

const commands = new Collection<string, SlashCommand>();
[setupCmd, configCmd, pingCmd, infoCmd, excuseCmd, epochCmd, devutilsCmd, statusCmd, adminCmd, helpCmd, postCmd, dailyAlgoCmd, profileCmd, profilCmd, sanctionCmd, casierCmd, absentCmd, meetingCmd, statsCmd, invitesCmd, leaderboardCmd, serverstatsCmd, noteCmd].forEach((cmd) => {
  commands.set(cmd.data.name, cmd as SlashCommand);
});
commands.set(noteCmd.contextData.name, noteCmd as unknown as SlashCommand);
commands.set(casierCmd.contextData.name, casierCmd as unknown as SlashCommand);
commands.set(sanctionCmd.contextData.name, sanctionCmd as unknown as SlashCommand);

async function enforceCommandAccess(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.guildId) return true;

  const settings = await prisma.dashboardSettings.findUnique({
    where: { guildId: interaction.guildId },
    select: { commandRestrictions: true },
  });

  const commandRestrictions = normalizeCommandRestrictions(settings?.commandRestrictions);
  if (commandRestrictions.length === 0) return true;

  const isPrivileged = isPrivilegedCommandExecutor(interaction);
  const roleIds = isPrivileged
    ? []
    : (await interaction.guild?.members.fetch(interaction.user.id).catch(() => null))?.roles.cache.map((role) => role.id) ?? [];

  const decision = evaluateCommandRestriction(
    commandRestrictions,
    interaction.commandName,
    interaction.channelId,
    roleIds,
    isPrivileged,
  );

  if (decision.allowed) return true;

  await interaction.reply({
    content: `❌ ${decision.reason ?? 'Cette commande est bloquée par la configuration du serveur.'}`,
    flags: [MessageFlags.Ephemeral],
  });

  return false;
}


client.once(Events.ClientReady, async (c) => {
  logger.success('Bot', `Connecté en tant que ${c.user.tag}`);
  c.user.setActivity(`/help | v${botPackageJson.version}`, { type: ActivityType.Playing });

  await initRedis();
  await startBackgroundQueueWorker();
  await checkTranslationProviderHealth();

  // Load global config & blacklist into memory
  try {
    const config = await prisma.botGlobalConfig.findUnique({ where: { key: 'MAINTENANCE_MODE' } });
    (global as any).KOTBO_MAINTENANCE_MODE = config?.value === 'true';

    const blacklist = await prisma.globalBlacklist.findMany({ select: { userId: true } });
    (global as any).KOTBO_BLACKLIST = new Set(blacklist.map(b => b.userId));
  } catch (err) {
    logger.error('System', 'Erreur lors du chargement de la config globale', err);
    (global as any).KOTBO_MAINTENANCE_MODE = false;
    (global as any).KOTBO_BLACKLIST = new Set();
  }

  registerCodePoliceListener(client);
  registerModerationAuditListener(client);
  registerAdvancedLogsListener(client);
  registerCloseSourceWarningListener(client);
  registerDailyAlgoHandlers(client);
  registerMeetingEvents(client);
  registerAnalyticsListeners(client);
  await syncOngoingDailyAlgoButtons(client).catch((error) =>
    logger.error('DailyAlgo', 'Impossible de synchroniser les boutons des runs en cours:', error),
  );
  await registerCrons(client);
  logger.success('System', 'Bot opérationnel et synchronisé.');
});

client.on(Events.InteractionCreate, async (interaction) => {
  logger.info('Interactions', `Interaction reçue: ${interaction.type} - ${interaction.id}`);
  try {
    // 1. Vérification de la blacklist globale
    const blacklist: Set<string> = (global as any).KOTBO_BLACKLIST || new Set();
    if (blacklist.has(interaction.user.id)) {
      if (interaction.isRepliable()) {
        await interaction.reply({
          content: '❌ Vous avez été banni globalement de l\'utilisation de ce bot.',
          flags: [MessageFlags.Ephemeral]
        });
      }
      return;
    }

    // 2. Vérification du mode maintenance (sauf pour créateur et admins globaux)
    if ((global as any).KOTBO_MAINTENANCE_MODE && interaction.user.id !== process.env.DISCORD_CLIENT_OWNER_ID) {
      // Allow global admins bypass
      const admin = await prisma.globalAdmin.findUnique({ where: { userId: interaction.user.id } });
      if (!admin) {
        if (interaction.isRepliable()) {
          await interaction.reply({
            content: '⚠️ **Mode Maintenance**\nKotbo est actuellement en cours de maintenance globale. Réessayez plus tard.',
            flags: [MessageFlags.Ephemeral]
          });
        }
        return;
      }
    }

    if (interaction.isChatInputCommand()) {
      if (!(await enforceCommandAccess(interaction))) {
        return;
      }

      const cmd = commands.get(interaction.commandName);
      if (!cmd) {
        await interaction.reply({
          content: '⚠️ Cette commande n\'est pas encore disponible sur cette instance du bot. Redémarre le bot puis redéploie les commandes.',
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      await cmd.execute(interaction);
    }

    else if (interaction.isAutocomplete()) {
      const cmd = commands.get(interaction.commandName);
      if (cmd?.autocomplete) await cmd.autocomplete(interaction);
    }

    else if (interaction.isUserContextMenuCommand()) {
      const cmd = commands.get(interaction.commandName);
      if (cmd) await cmd.execute(interaction as any);
    }

    else if (interaction.isButton()) {
      await handleButton(interaction, client);
    }

    else if (interaction.isAnySelectMenu()) {
      await handleSelectMenu(interaction, client);
    }

    else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction, client);
    }
  } catch (err) {
    captureException(err, 'interaction-create');

    if (err instanceof DiscordAPIError && err.code === 10062) {
      logger.warn('Event', 'InteractionCreate: DiscordAPIError 10062 (Unknown interaction) ignored.');
      return;
    }

    logger.error('Event', 'InteractionCreate error:', err);
    try {
      if (interaction.isRepliable()) {
        await replyOrFollowUp(interaction, { content: '❌ Une erreur est survenue.', flags: [MessageFlags.Ephemeral] });
      }
    } catch (e){
      captureException(e, 'interaction-create-error-handler');

      if (e instanceof DiscordAPIError && e.code === 40060) {
        logger.warn('Event', 'InteractionCreate follow-up: DiscordAPIError 40060 (already acknowledged) ignored.');
        return;
      }
      if (e instanceof DiscordAPIError && e.code === 10062) {
        logger.warn('Event', 'InteractionCreate follow-up: DiscordAPIError 10062 ignored.');
        return;
      }
      logger.error('Event', 'InteractionCreate error:', e);
    }
  }
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  logger.error('Bot', 'DISCORD_TOKEN non défini dans .env !');
  process.exit(1);
}

// Global Error Logging for Dashboard
async function logErrorToDb(error: Error, source: string) {
  try {
    await prisma.botErrorLog.create({
      data: {
        message: error.message || 'Erreur inconnue',
        stack: error.stack?.substring(0, 4000) || null,
        source
      }
    });
  } catch (e) {
    logger.error('System', 'Impossible de sauvegarder l\'erreur en BDD', e);
  }
}

process.on('uncaughtException', (error) => {
  logger.error('System', 'Uncaught Exception:', error);
  logErrorToDb(error, 'uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('System', 'Unhandled Rejection at:', promise, 'reason:', reason);
  logErrorToDb(reason instanceof Error ? reason : new Error(String(reason)), 'unhandledRejection');
});

client.login(token);
