import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

import './utils/patchV2.js';

import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  Events,
  ActivityType,
  MessageFlags,
  DiscordAPIError,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { logger } from './utils/logger.js';
import { parseInstanceIdFromArgs, setCurrentInstance, getCurrentInstance, isWhiteLabelInstance } from './utils/instanceContext.js';
import { loadAllInstances, getInstanceById, getDefaultInstance } from './utils/instanceResolver.js';
import { queueAuditLog } from './utils/auditLogger.js';
import { replyOrFollowUp } from './utils/interactionResponses.js';
import { registerCrons } from './events/crons.js';
import {
  handleButton,
  handleSelectMenu,
  handleModalSubmit,
} from './handlers/interactionHandler.js';
import prisma from './utils/db.js';
import { errorEmbed } from './utils/embeds.js';
import { loadApplicationEmojis } from './utils/emojis.js';
import { getCachedDashboardSettings, cache } from './utils/cache.js';
import {
  evaluateCommandRestriction,
  isPrivilegedCommandExecutor,
  normalizeCommandRestrictions,
} from './utils/commandAccess.js';
import { registerCodePoliceListener } from './events/codePolice.js';
import { registerAdvancedLogsListener } from './events/advancedLogs.js';
import { registerCloseSourceWarningListener } from './events/closeSourceWarning.js';
import { registerNicknameModerationListener } from './events/nicknameModeration.js';
import { registerTempVoiceListener } from './events/tempVoice.js';
import { registerHoneypotListener } from './events/honeypot.js';
import { registerMessageLoggingListener } from './events/messageLogging.js';
import { registerStatsChannelListener } from './events/stats.js';
import { registerFunEventsListener } from './events/funEvents.js';
import { registerDailyAlgoHandlers } from './handlers/dailyAlgoHandler.js';
import { registerMeetingEvents } from './events/meetingEvents.js';
import { syncOngoingDailyAlgoButtons } from './services/progression/dailyAlgoService.js';
import { checkTranslationProviderHealth } from './services/integrations/translationService.js';
import { startDashboardApi } from './api/dashboardApi.js';
import { initBotSentry, captureException } from './observability/sentry.js';
import { initRedis, assertRedisConnection } from './infra/redis.js';
import { startBackgroundQueueWorker } from './infra/queues/backgroundQueue.js';
import botPackageJson from '../package.json';
import { registerLevelingListener } from './events/levelingEvents.js';
import { registerSecurityVerificationListener } from './events/securityVerificationEvents.js';
import { registerAutoResponseListener } from './events/autoResponseEvents.js';
import { registerChannelLinkListener } from './events/channelLinkEvents.js';
import { registerStaffServerListener } from './events/staffServerEvents.js';
import { registerAbsenceMentionListener } from './events/absenceMentionEvents.js';
import { registerPartnershipListener } from './services/features/partnershipService.js';
import { registerEventBusBridge } from './events/eventBusBridge.js';
import { registerAnalyticsBusSubscribers } from './modules/analytics.module.js';
import { registerLevelingBusSubscribers } from './modules/leveling.module.js';
import { registerAutoModBusSubscribers } from './modules/autoMod.module.js';
import { registerAutoThreadBusSubscribers } from './modules/autoThread.module.js';
import { registerWelcomeGoodbyeBusSubscribers } from './modules/welcomeGoodbye.module.js';
import { registerModerationBusSubscribers } from './modules/moderation.module.js';
import { registerTicketsBusSubscribers } from './modules/tickets.module.js';
import { loadActivatedGuilds, isGuildActivated } from './utils/activation.js';
import { initializeAutoBackupForAllGuilds, initializeAutoBackup, stopAutoBackup } from './services/system/autoBackupService.js';
import {
  commands as slashCommandDefinitions,
  contextCommands as contextCommandDefinitions,
  type ContextCommandDefinition,
  type SlashCommandDefinition,
} from './commands.js';

initBotSentry();

// Resolve white-label instance from launcher args
const instanceId = parseInstanceIdFromArgs();
let resolvedInstance;

if (instanceId === '__default__') {
  resolvedInstance = getDefaultInstance();
  // Load white-label instances in the background to populate CORS origins and config cache
  loadAllInstances().catch((err) => {
    logger.warn('WhiteLabel', 'Failed to load white-label instances in background:', err);
  });
} else {
  await loadAllInstances();
  resolvedInstance = getInstanceById(instanceId);
}

if (!resolvedInstance) {
  logger.error('Bot', `Instance white-label introuvable: ${instanceId}`);
  process.exit(1);
}
setCurrentInstance(resolvedInstance);
if (!resolvedInstance.isDefault) {
  logger.info('WhiteLabel', `Worker démarré pour l'instance "${resolvedInstance.name}" (${resolvedInstance.slug})`);
}

import { setClient } from './utils/client.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Reaction],
});

setClient(client);

// ==========================================================
// Guild Activation Central Event Interceptor Gate
// ==========================================================
const PASSTHROUGH_EVENTS = new Set<string | symbol>([
  Events.ClientReady,
  Events.ShardReady,
  Events.GuildCreate,
  Events.GuildDelete,
]);
const OWNER_ID = process.env.DISCORD_CLIENT_OWNER_ID;

const originalEmit = client.emit;
client.emit = function (eventName: string | symbol, ...args: unknown[]) {
  if (PASSTHROUGH_EVENTS.has(eventName)) {
    return originalEmit.call(client, eventName, ...args);
  }

  // Fast path: extract guildId from first arg (covers 99% of Discord events)
  const arg = args[0];
  if (!arg || typeof arg !== 'object') {
    return originalEmit.call(client, eventName, ...args);
  }

  let guildId: string | null = null;
  let isActivateCommand = false;
  let isOwnerInteraction = false;

  if (arg.guild && typeof arg.guild.id === 'string') {
    guildId = arg.guild.id;
  } else if (typeof arg.guildId === 'string') {
    guildId = arg.guildId;
  } else if (typeof arg.id === 'string' && (arg.constructor?.name === 'Guild' || (arg.name && arg.roles))) {
    guildId = arg.id;
  }

  // Fallback: check remaining args only if first didn't yield a guildId
  if (!guildId) {
    for (let i = 1; i < args.length; i++) {
      const a = args[i];
      if (!a || typeof a !== 'object') continue;
      if (a.guild && typeof a.guild.id === 'string') { guildId = a.guild.id; break; }
      if (typeof a.guildId === 'string') { guildId = a.guildId; break; }
    }
  }

  if (guildId) {
    if (
      eventName === Events.InteractionCreate &&
      typeof arg.isChatInput === 'function' &&
      arg.isChatInput() &&
      arg.commandName === 'activate'
    ) {
      isActivateCommand = true;
    }

    if (OWNER_ID) {
      const userId = arg.user?.id ?? arg.author?.id;
      if (userId === OWNER_ID) isOwnerInteraction = true;
    }
  }

  // Intercept and block unactivated guilds silently
  if (guildId && !isActivateCommand && !isOwnerInteraction) {
    if (!isGuildActivated(guildId)) {
      return false;
    }
  }

  return originalEmit.call(client, eventName, ...args);
};

if (!client.shard || client.shard.ids.includes(0)) {
  await startDashboardApi(client);
}

const slashCommands = new Collection<string, SlashCommandDefinition>();
slashCommandDefinitions.forEach((cmd) => {
  slashCommands.set(cmd.data.name, cmd);
});

const userContextCommands = new Collection<string, ContextCommandDefinition>();
contextCommandDefinitions.forEach((cmd) => {
  userContextCommands.set(cmd.data.name, cmd);
});

async function enforceCommandAccess(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.guildId) return true;

  const settings = await getCachedDashboardSettings(interaction.guildId);

  const commandRestrictions = normalizeCommandRestrictions(settings?.commandRestrictions);
  if (commandRestrictions.length === 0) return true;

  const isPrivileged = isPrivilegedCommandExecutor(interaction);
  let roleIds: string[] = [];
  if (!isPrivileged) {
    if (interaction.member) {
      if (Array.isArray(interaction.member.roles)) {
        roleIds = interaction.member.roles;
      } else if (interaction.member.roles && 'cache' in interaction.member.roles) {
        roleIds = interaction.member.roles.cache.map((role: unknown) => role.id);
      }
    }
    if (roleIds.length === 0) {
      roleIds = (await interaction.guild?.members.fetch(interaction.user.id).catch(() => null))?.roles.cache.map((role) => role.id) ?? [];
    }
  }

  const decision = evaluateCommandRestriction(
    commandRestrictions,
    interaction.commandName,
    interaction.channelId,
    roleIds,
    interaction.user.id,
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
  const activityPrefix = isWhiteLabelInstance() ? `${getCurrentInstance().brandName} | ` : '';
  c.user.setActivity(`${activityPrefix}/help | v${botPackageJson.version}`, { type: ActivityType.Playing });

  // Load application emojis before anything else
  await loadApplicationEmojis(client);

  // Load activated guilds into cache at startup
  await loadActivatedGuilds().catch((error) =>
    logger.error('Activation', 'Impossible de charger les serveurs activés :', error)
  );

  await initRedis();
  await assertRedisConnection().catch((err) => {
    logger.warn('Redis', String(err));
  });

  // Enable distributed Event Bus if configured (Phase 2: multi-process split)
  if (process.env.EVENTBUS_DISTRIBUTED === 'true') {
    try {
      const { createRedisForWorker } = await import('./infra/redis.js');
      const { kotboEventBus } = await import('@kotbo/core');
      const pub = createRedisForWorker();
      const sub = createRedisForWorker();
      if (pub && sub) {
        await pub.connect();
        await sub.connect();
        kotboEventBus.enableDistributed(pub, sub);
        logger.success('EventBus', 'Mode distribué (Redis Pub/Sub) activé.');
      }
    } catch (err) {
      logger.warn('EventBus', 'Impossible d\'activer le mode distribué:', err);
    }
  }

  await startBackgroundQueueWorker();
  await checkTranslationProviderHealth();

  // Load global config & blacklist into memory
  try {
    const config = await prisma.botGlobalConfig.findUnique({ where: { key: 'MAINTENANCE_MODE' } });
    (global as unknown).KOTBO_MAINTENANCE_MODE = config?.value === 'true';

    const blacklist = await prisma.globalBlacklist.findMany({ select: { userId: true } });
    (global as unknown).KOTBO_BLACKLIST = new Set(blacklist.map(b => b.userId));
  } catch (err) {
    logger.error('System', 'Erreur lors du chargement de la config globale', err);
    (global as unknown).KOTBO_MAINTENANCE_MODE = false;
    (global as unknown).KOTBO_BLACKLIST = new Set();
  }

  // ── Event Bus Bridge (Phase 1: in-process) ──────────────────
  // The bridge captures raw Discord events and publishes normalized
  // payloads on the Kotbo Event Bus. Modules can subscribe to bus
  // events instead of client.on() directly, enabling future split
  // into independent processes (Phase 2).
  registerEventBusBridge(client);

  // ── Bus-based modules (decoupled, error-isolated) ─────────
  registerAnalyticsBusSubscribers(client);
  registerLevelingBusSubscribers(client);
  registerAutoModBusSubscribers(client);
  registerAutoThreadBusSubscribers(client);
  registerWelcomeGoodbyeBusSubscribers(client);
  registerModerationBusSubscribers(client);
  registerTicketsBusSubscribers(client);

  // ── Direct listeners (not yet migrated to the bus) ────────
  client.setMaxListeners(25);
  registerCodePoliceListener(client);
  registerAdvancedLogsListener(client);
  registerCloseSourceWarningListener(client);
  registerNicknameModerationListener(client);
  registerTempVoiceListener(client);
  registerHoneypotListener(client);
  registerMessageLoggingListener(client);
  registerStatsChannelListener(client);
  registerFunEventsListener(client);
  registerDailyAlgoHandlers(client);
  registerMeetingEvents(client);
  registerLevelingListener(client); // XP vocale uniquement (boucle de polling)
  registerSecurityVerificationListener(client);
  registerAutoResponseListener(client);
  registerChannelLinkListener(client);
  registerStaffServerListener(client);
  registerAbsenceMentionListener(client);
  registerPartnershipListener(client);

  // Enregistrer les cron jobs AVANT les opérations potentiellement bloquantes
  logger.info('System', 'Enregistrement des cron jobs...');
  await registerCrons(client);
  logger.info('System', 'Cron jobs enregistrés');
  
  logger.info('System', 'Début de la synchronisation des boutons DailyAlgo...');
  await syncOngoingDailyAlgoButtons(client).catch((error) =>
    logger.error('DailyAlgo', 'Impossible de synchroniser les boutons des runs en cours:', error),
  );
  logger.info('System', 'Synchronisation DailyAlgo terminée, initialisation des backups automatiques...');
  await initializeAutoBackupForAllGuilds(c.guilds.cache.values()).catch((error) =>
    logger.error('AutoBackup', "Impossible d'initialiser les backups automatiques:", error)
  );
  logger.info('System', 'Backups automatiques initialisés');

  // Trigger historical message scraping for any activated guild that hasn't started yet
  try {
    const { startHistoricalScraping } = await import('./services/analytics/messageScraperService.js');
    const activatedGuilds = await prisma.guild.findMany({
      where: { activated: true },
      select: { id: true, statsConfig: true }
    });

    for (const g of activatedGuilds) {
      let config = (g.statsConfig as unknown) || {};
      
      // If the scraping was stuck in IN_PROGRESS (e.g. bot crashed/restarted), reset it so it can be resumed
      if (config.historicalScrapeStatus === 'IN_PROGRESS') {
        logger.info('System', `Correction du scrap historique bloqué en IN_PROGRESS pour la guilde ${g.id}`);
        config = {
          ...config,
          historicalScrapeStatus: 'FAILED',
          historicalScrapeError: 'Interrompu par le redémarrage du bot',
        };
        delete config.historicalScrapeProgress;

        await prisma.guild.update({
          where: { id: g.id },
          data: { statsConfig: config }
        });
      }

      if (
        !config.historicalScrapeStatus ||
        config.historicalScrapeStatus === 'NOT_STARTED' ||
        config.historicalScrapeStatus === 'FAILED'
      ) {
        logger.info('System', `Démarrage du scrap historique automatique pour la guilde ${g.id}`);
        startHistoricalScraping(client, g.id).catch((err) =>
          logger.error('System', `Erreur lors du démarrage du scrap historique pour ${g.id}:`, err)
        );
      }
    }
  } catch (err) {
    logger.error('System', 'Erreur lors de la vérification du scrap historique au démarrage:', err);
  }

  // Trigger historical member scraping for any activated guild that hasn't started yet
  try {
    const { startMemberScraping } = await import('./services/analytics/memberScraperService.js');
    const activatedGuildsForMembers = await prisma.guild.findMany({
      where: { activated: true },
      select: { id: true, statsConfig: true }
    });

    interface MemberScrapeConfig {
      memberScrapeStatus?: string;
      memberScrapeError?: string;
      memberScrapeProgress?: unknown;
    }

    for (const g of activatedGuildsForMembers) {
      let config = { ...((g.statsConfig as MemberScrapeConfig | null) || {}) } as MemberScrapeConfig;

      if (config.memberScrapeStatus === 'IN_PROGRESS') {
        logger.info('System', `Correction du scrap membres bloqué en IN_PROGRESS pour la guilde ${g.id}`);
        config = {
          ...config,
          memberScrapeStatus: 'FAILED',
          memberScrapeError: 'Interrompu par le redémarrage du bot',
        };
        delete config.memberScrapeProgress;

        await prisma.guild.update({
          where: { id: g.id },
          data: { statsConfig: config }
        });
      }

      if (
        !config.memberScrapeStatus ||
        config.memberScrapeStatus === 'NOT_STARTED' ||
        config.memberScrapeStatus === 'FAILED'
      ) {
        logger.info('System', `Démarrage du scrap membres automatique pour la guilde ${g.id}`);
        startMemberScraping(client, g.id).catch((err) =>
          logger.error('System', `Erreur lors du démarrage du scrap membres pour ${g.id}:`, err)
        );
      }
    }
  } catch (err) {
    logger.error('System', 'Erreur lors de la vérification du scrap membres au démarrage:', err);
  }

  logger.success('System', 'Bot opérationnel et synchronisé.');
});

client.on(Events.GuildCreate, async (guild) => {
  logger.info('System', `Le bot a rejoint le serveur : ${guild.name} (${guild.id})`);
  
  // Initialize auto backup if the guild is activated
  await initializeAutoBackup(guild).catch((err) =>
    logger.error('AutoBackup', `Impossible d'initialiser les backups pour le serveur ${guild.name}:`, err)
  );

  if (isGuildActivated(guild.id)) {
    // Start historical message scraping
    const { startHistoricalScraping } = await import('./services/analytics/messageScraperService.js');
    startHistoricalScraping(client, guild.id).catch((err) =>
      logger.error('System', `Impossible de démarrer le scraping historique pour ${guild.name}:`, err)
    );

    // Start member scraping
    const { startMemberScraping } = await import('./services/analytics/memberScraperService.js');
    startMemberScraping(client, guild.id).catch((err) =>
      logger.error('System', `Impossible de démarrer le scraping membres pour ${guild.name}:`, err)
    );
  } else {
    const channel = guild.systemChannel || guild.channels.cache.find(
      (c) => c.isTextBased() && c.permissionsFor(guild.members.me!)?.has('SendMessages')
    );

    if (channel && channel.isTextBased()) {
      const embed = errorEmbed(
        '🔑 Activation Requise',
        `Merci d'avoir invité **Kotbo** sur votre serveur !\n\nPour des raisons de sécurité, ce bot nécessite un code d'activation pour fonctionner.\n\n👉 **Comment faire ?**\n1. Récupérez un code auprès de l'administrateur global de Kotbo.\n2. Exécutez la commande slash suivante sur ce serveur : \`/activate <code>\`\n\n*Note : Tant que le serveur n'est pas activé, aucune fonctionnalité du bot ni du dashboard ne sera opérationnelle.*`
      );
      await channel.send({ embeds: [embed] }).catch(() => null);
    }
  }
});

client.on(Events.GuildDelete, (guild) => {
  logger.info('System', `Le bot a quitté le serveur : ${guild.name} (${guild.id})`);
  stopAutoBackup(guild.id);
});

client.on(Events.InteractionCreate, async (interaction) => {
  logger.info('Interactions', `Interaction reçue: ${interaction.type} - ${interaction.id}`);
  try {
    // 1. Vérification de la blacklist globale
    const blacklist: Set<string> = (global as unknown).KOTBO_BLACKLIST || new Set();
    if (blacklist.has(interaction.user.id)) {
      if (interaction.isRepliable()) {
        await interaction.reply({
          content: "❌ Vous avez été banni globalement de l'utilisation de ce bot.",
          flags: [MessageFlags.Ephemeral]
        });
      }
      return;
    }

    // 2. Vérification du mode maintenance (sauf pour créateur et admins globaux)
    if ((global as unknown).KOTBO_MAINTENANCE_MODE && interaction.user.id !== process.env.DISCORD_CLIENT_OWNER_ID) {
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

      const cmd = slashCommands.get(interaction.commandName);
      if (!cmd) {
        await interaction.reply({
          content: "⚠️ Cette commande n'est pas encore disponible sur cette instance du bot. Redémarre le bot puis redéploie les commandes.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      if (interaction.guildId) {
        const optionsString = interaction.options.data.map(opt => {
          if (opt.value !== undefined) {
            return `${opt.name}: ${opt.value}`;
          }
          if (opt.options) {
            return `${opt.name} (${opt.options.map(subOpt => `${subOpt.name}: ${subOpt.value}`).join(', ')})`;
          }
          return opt.name;
        }).join(' | ');

        queueAuditLog({
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          user: `${interaction.user.tag} (<@${interaction.user.id}>)`,
          action: `Commande /${interaction.commandName}`,
          context: interaction.guild?.name || 'Discord',
          module: 'Commandes',
          eventType: 'Discord',
          details: `Commande slash /${interaction.commandName} exécutée.${optionsString ? ` Arguments: ${optionsString}` : ''}`,
        });
      }

      await cmd.execute(interaction);
      if (interaction.guildId && (interaction.commandName === 'admin' || interaction.commandName === 'config' || interaction.commandName === 'setup')) {
        await cache.invalidateGuild(interaction.guildId);
      }

      // Track command usage for analytics (buffered)
      try {
        const usageKey = `${interaction.guildId || 'DM'}:${interaction.commandName}:${interaction.user.id}`;
        commandUsageBuffer.set(usageKey, (commandUsageBuffer.get(usageKey) || 0) + 1);
      } catch (e) {
        logger.error('Analytics', 'Erreur lors de la mise en buffer de commande', e);
      }
    }

    else if (interaction.isAutocomplete()) {
      const cmd = slashCommands.get(interaction.commandName);
      if (cmd?.autocomplete) await cmd.autocomplete(interaction);
    }

    else if (interaction.isUserContextMenuCommand()) {
      const cmd = userContextCommands.get(interaction.commandName);
      if (cmd) {
        if (interaction.guildId) {
          queueAuditLog({
            guildId: interaction.guildId,
            channelId: interaction.channelId,
            user: `${interaction.user.tag} (<@${interaction.user.id}>)`,
            action: `Menu contextuel: ${interaction.commandName}`,
            context: interaction.guild?.name || 'Discord',
            module: 'Commandes',
            eventType: 'Discord',
            details: `Commande de menu contextuel "${interaction.commandName}" exécutée sur l'utilisateur <@${interaction.targetId}> (${interaction.targetId}).`,
          });
        }
        await cmd.execute(interaction);
      }
    }

    else if (interaction.isButton()) {
      await handleButton(interaction, client);
      if (interaction.guildId) await cache.invalidateGuild(interaction.guildId);
    }

    else if (interaction.isAnySelectMenu()) {
      await handleSelectMenu(interaction, client);
      if (interaction.guildId) await cache.invalidateGuild(interaction.guildId);
    }

    else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction, client);
      if (interaction.guildId) await cache.invalidateGuild(interaction.guildId);
    }
  } catch (err) {
    captureException(err, 'interaction-create');

    if (err instanceof DiscordAPIError && err.code === 10062) {
      logger.warn('Event', 'InteractionCreate: DiscordAPIError 10062 (Unknown interaction) ignored.');
      return;
    }

    logger.error('Event', 'InteractionCreate error:', err);
    try {
      if (interaction.isRepliable() && !interaction.deferred && !interaction.replied) {
        await replyOrFollowUp(interaction, { content: '❌ Une erreur est survenue.', flags: [MessageFlags.Ephemeral] });
      } else {
        logger.warn('Event', "Interaction déjà acquittée au moment de la gestion d'erreur; aucun message supplémentaire envoyé.");
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

// ============================================================================
// IN-MEMORY BUFFERS FOR PERFORMANCE
// ============================================================================
const commandUsageBuffer = new Map<string, number>();
let errorLogBuffer: Array<{ message: string, stack: string | null, source: string }> = [];

async function flushIndexBuffers() {
  // Flush Command Usage
  const usageEntries = [...commandUsageBuffer.entries()];
  commandUsageBuffer.clear();
  
  if (usageEntries.length > 0) {
    try {
      const ops = usageEntries.map(([key, count]) => {
        const [guildId, commandName, userId] = key.split(':');
        return prisma.dashboardCommandUsage.upsert({
          where: { guildId_commandName_userId: { guildId, commandName, userId } },
          update: { count: { increment: count }, lastUsedAt: new Date() },
          create: { guildId, commandName, userId, count }
        });
      });
      await Promise.all(ops);
    } catch (e) {
      // Re-queue entries so they can be retried on next flush
      for (const [key, count] of usageEntries) {
        commandUsageBuffer.set(key, (commandUsageBuffer.get(key) || 0) + count);
      }
      logger.error('Analytics', 'Erreur lors du flush des command usages', e);
    }
  }

  // Flush Error Logs
  const errorsToInsert = [...errorLogBuffer];
  errorLogBuffer = [];
  if (errorsToInsert.length > 0) {
    try {
      await prisma.botErrorLog.createMany({
        data: errorsToInsert
      });
    } catch (e) {
      // Re-queue entries so they can be retried on next flush
      errorLogBuffer.unshift(...errorsToInsert);
      logger.error('System', 'Erreur lors du flush des bot error logs', e);
    }
  }
}

const FLUSH_INTERVAL_MS = Number.parseInt(process.env.FLUSH_INTERVAL_MS ?? '10000', 10) || 10000;
const flushInterval = setInterval(() => {
  void flushIndexBuffers();
}, FLUSH_INTERVAL_MS);

async function flushAndStop(exitCode = 0) {
  clearInterval(flushInterval);
  try {
    await flushIndexBuffers();
  } finally {
    process.exit(exitCode);
  }
}

process.on('SIGINT', () => {
  void flushAndStop(0);
});

process.on('SIGTERM', () => {
  void flushAndStop(0);
});

process.on('beforeExit', () => {
  clearInterval(flushInterval);
  void flushIndexBuffers();
});
// ============================================================================

const token = getCurrentInstance().discordToken;
if (!token) {
  logger.error('Bot', `DISCORD_TOKEN non défini pour l'instance "${getCurrentInstance().slug}" !`);
  process.exit(1);
}

// Global Error Logging for Dashboard (buffered)
function logErrorToDb(error: Error, source: string) {
  errorLogBuffer.push({
    message: error.message || 'Erreur inconnue',
    stack: error.stack?.substring(0, 4000) || null,
    source
  });
}

process.on('uncaughtException', (error) => {
  logger.error('System', 'Uncaught Exception:', error);
  logErrorToDb(error, 'uncaughtException');
  void flushAndStop(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('System', 'Unhandled Rejection at:', promise, 'reason:', reason);
  logErrorToDb(reason instanceof Error ? reason : new Error(String(reason)), 'unhandledRejection');
});

client.login(token);
