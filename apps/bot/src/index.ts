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
import * as feedCmd from './commands/feed.js';
import * as newsCmd from './commands/news.js';
import * as newsRecoveryCmd from './commands/news-rattrapage.js';
import * as pingCmd from './commands/ping.js';
import * as infoCmd from './commands/info.js';
import * as youtubeCmd from './commands/youtube.js';
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
import { checkTranslationProviderHealth } from './services/translationService.js';
import { startDashboardApi } from './api/dashboardApi.js';
import botPackageJson from '../package.json';
// import * as statsCmd from './commands/stats.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

startDashboardApi(client);


type SlashCommand = {
  data: { name: string; toJSON: () => unknown };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
};

const commands = new Collection<string, SlashCommand>();
[setupCmd, configCmd, feedCmd, newsCmd, newsRecoveryCmd, pingCmd, infoCmd, youtubeCmd, excuseCmd, epochCmd, devutilsCmd, statusCmd, adminCmd, helpCmd, postCmd, dailyAlgoCmd, profileCmd, profilCmd, sanctionCmd, casierCmd].forEach((cmd) => {
  commands.set(cmd.data.name, cmd as SlashCommand);
});

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

  await checkTranslationProviderHealth();

  registerCodePoliceListener(client);
  registerModerationAuditListener(client);
  registerAdvancedLogsListener(client);
  registerCloseSourceWarningListener(client);
  registerDailyAlgoHandlers(client);
  await registerCrons(client);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
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

client.login(token);
