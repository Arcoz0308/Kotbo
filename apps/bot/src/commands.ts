import type { AutocompleteInteraction, ChatInputCommandInteraction, MessageContextMenuCommandInteraction, UserContextMenuCommandInteraction } from 'discord.js';
import { absentCommand } from './commands/admin/absent.js';
import { activateCommand } from './commands/admin/activate.js';
import { adminCommand } from './commands/admin/admin.js';
import { casierCommand, casierContextCommand } from './commands/moderation/casier.js';
import { configCommand } from './commands/admin/config.js';
import { dailyAlgoCommand } from './commands/fun/dailyAlgo.js';
import { dcCommand } from './commands/moderation/dc.js';
import { demissionCommand } from './commands/admin/demission.js';
import { devutilsCommand } from './commands/admin/devutils.js';
import { epochCommand } from './commands/utility/epoch.js';
import { eventCommand } from './commands/utility/event.js';
import { ctfCommand } from './commands/fun/ctf.js';
import { excuseCommand } from './commands/fun/excuse.js';
import { giveawayCommand } from './commands/fun/giveaway.js';
import { helpCommand } from './commands/utility/help.js';
import { infoCommand } from './commands/utility/info.js';
import { invitesCommand } from './commands/utility/invites.js';
import { leaderboardCommand } from './commands/profile/leaderboard.js';
import { meetingCommand } from './commands/admin/meeting.js';
import { noteCommand, noteContextCommand } from './commands/moderation/note.js';
import { pingCommand } from './commands/utility/ping.js';
import { postCommand } from './commands/utility/post.js';
import { profilCommand } from './commands/profile/profil.js';
import { profileCommand } from './commands/profile/profile.js';
import { rankCommand } from './commands/profile/rank.js';
import { rescanCommand } from './commands/moderation/rescan.js';
import { sanctionCommand, sanctionContextCommand } from './commands/moderation/sanction.js';
import { sayCommand } from './commands/fun/say.js';
import { serverstatsCommand } from './commands/utility/serverstats.js';
import { setupCommand } from './commands/admin/setup.js';
import { statsCommand } from './commands/utility/stats.js';
import { statusCommand } from './commands/admin/status.js';
import { suggestCommand } from './commands/utility/suggest.js';
import { ticketCommand } from './commands/utility/ticket.js';
import { transcriptCommand } from './commands/moderation/transcript.js';
import { suggestionConfigCommand } from './commands/utility/suggestion-config.js';
import { clearCommand } from './commands/moderation/clear.js';
import { channelCommand } from './commands/moderation/channel.js';
import { signalCommand, signalContextCommand } from './commands/moderation/signal.js';
import { dashboardCommand } from './commands/utility/dashboard.js';

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
  dashboardCommand,
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
