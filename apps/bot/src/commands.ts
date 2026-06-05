import type { AutocompleteInteraction, ChatInputCommandInteraction, MessageContextMenuCommandInteraction, UserContextMenuCommandInteraction } from 'discord.js';
import { absentCommand } from './commands/absent.js';
import { activateCommand } from './commands/activate.js';
import { adminCommand } from './commands/admin.js';
import { casierCommand, casierContextCommand } from './commands/casier.js';
import { configCommand } from './commands/config.js';
import { dailyAlgoCommand } from './commands/dailyAlgo.js';
import { dcCommand } from './commands/dc.js';
import { demissionCommand } from './commands/demission.js';
import { devutilsCommand } from './commands/devutils.js';
import { epochCommand } from './commands/epoch.js';
import { eventCommand } from './commands/event.js';
import { ctfCommand } from './commands/ctf.js';
import { excuseCommand } from './commands/excuse.js';
import { giveawayCommand } from './commands/giveaway.js';
import { helpCommand } from './commands/help.js';
import { infoCommand } from './commands/info.js';
import { invitesCommand } from './commands/invites.js';
import { leaderboardCommand } from './commands/leaderboard.js';
import { meetingCommand } from './commands/meeting.js';
import { noteCommand, noteContextCommand } from './commands/note.js';
import { pingCommand } from './commands/ping.js';
import { postCommand } from './commands/post.js';
import { profilCommand } from './commands/profil.js';
import { profileCommand } from './commands/profile.js';
import { rankCommand } from './commands/rank.js';
import { rescanCommand } from './commands/rescan.js';
import { sanctionCommand, sanctionContextCommand } from './commands/sanction.js';
import { sayCommand } from './commands/say.js';
import { serverstatsCommand } from './commands/serverstats.js';
import { setupCommand } from './commands/setup.js';
import { statsCommand } from './commands/stats.js';
import { statusCommand } from './commands/status.js';
import { suggestCommand } from './commands/suggest.js';
import { ticketCommand } from './commands/ticket.js';
import { transcriptCommand } from './commands/transcript.js';
import { suggestionConfigCommand } from './commands/suggestion-config.js';
import { clearCommand } from './commands/clear.js';
import { channelCommand } from './commands/channel.js';
import { signalCommand, signalContextCommand } from './commands/signal.js';

export type SlashCommandDefinition = {
  data: { name: string; toJSON: () => unknown };
  execute: (interaction: ChatInputCommandInteraction) => Promise<unknown>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<unknown>;
};

export type ContextCommandDefinition = {
  data: { name: string; toJSON: () => unknown };
  execute:
  (interaction: UserContextMenuCommandInteraction) => Promise<unknown> | ((interaction: MessageContextMenuCommandInteraction) => Promise<unknown>);
};

export type ApplicationCommandDefinition = SlashCommandDefinition | ContextCommandDefinition;

export const commands: SlashCommandDefinition[] = [
  setupCommand,
  configCommand,
  pingCommand,
  infoCommand,
  excuseCommand,
  epochCommand,
  devutilsCommand,
  statusCommand,
  adminCommand,
  postCommand,
  helpCommand,
  dailyAlgoCommand,
  profileCommand,
  profilCommand,
  sanctionCommand,
  dcCommand,
  rescanCommand,
  casierCommand,
  absentCommand,
  meetingCommand,
  statsCommand,
  invitesCommand,
  leaderboardCommand,
  serverstatsCommand,
  noteCommand,
  eventCommand,
  ctfCommand,
  activateCommand,
  transcriptCommand,
  ticketCommand,
  sayCommand,
  demissionCommand,
  rankCommand,
  giveawayCommand,
  suggestCommand,
  suggestionConfigCommand,
  clearCommand,
  channelCommand,
  signalCommand,
];

export const contextCommands: ContextCommandDefinition[] = [
  noteContextCommand,
  casierContextCommand,
  sanctionContextCommand,
  signalContextCommand,
];

export const applicationCommands: ApplicationCommandDefinition[] = [
  ...commands,
  ...contextCommands,
];
