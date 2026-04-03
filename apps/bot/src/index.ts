import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

import {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
  MessageFlags,
  DiscordAPIError,
} from 'discord.js';
import { logger } from './utils/logger.js';
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
import * as pingCmd from './commands/ping.js';
import * as infoCmd from './commands/info.js';
import * as youtubeCmd from './commands/youtube.js';
import * as excuseCmd from './commands/excuse.js';
import * as epochCmd from './commands/epoch.js';
import * as devutilsCmd from './commands/devutils.js';
import * as statusCmd from './commands/status.js';
import * as adminCmd from './commands/admin.js';
import { registerCodePoliceListener } from './events/codePolice.js';
import { registerDailyAlgoHandlers } from './handlers/dailyAlgoHandler.js';
// import * as statsCmd from './commands/stats.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
  ],
});


type SlashCommand = {
  data: { name: string; toJSON: () => unknown };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
};

const commands = new Collection<string, SlashCommand>();
[setupCmd, configCmd, feedCmd, newsCmd, pingCmd, infoCmd, youtubeCmd, excuseCmd, epochCmd, devutilsCmd, statusCmd, adminCmd].forEach((cmd) => {
  commands.set(cmd.data.name, cmd as SlashCommand);
});


client.once(Events.ClientReady, async (c) => {
  logger.success('Bot', `Connecté en tant que ${c.user.tag}`);

  registerCodePoliceListener(client);
  registerDailyAlgoHandlers(client);
  await registerCrons(client);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = commands.get(interaction.commandName);
      if (!cmd) return;
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
      if ('replied' in interaction && interaction.replied) return;
      
      const replyOptions: import('discord.js').InteractionReplyOptions = { content: '❌ Une erreur est survenue.', flags: [MessageFlags.Ephemeral] };
      
      if ('deferred' in interaction && interaction.deferred) {
        await (interaction as ChatInputCommandInteraction).followUp(replyOptions);
      } else if ('reply' in interaction) {
        await (interaction as ChatInputCommandInteraction).reply(replyOptions);
      }
    } catch (e){
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
