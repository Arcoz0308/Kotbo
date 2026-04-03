import {
  ApplicationCommandOptionType,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type APIApplicationCommandOption,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { COLORS } from '../utils/embeds.js';
import * as setupCmd from './setup.js';
import * as configCmd from './config.js';
import * as feedCmd from './feed.js';
import * as newsCmd from './news.js';
import * as pingCmd from './ping.js';
import * as infoCmd from './info.js';
import * as youtubeCmd from './youtube.js';
import * as excuseCmd from './excuse.js';
import * as epochCmd from './epoch.js';
import * as devutilsCmd from './devutils.js';
import * as statusCmd from './status.js';
import * as adminCmd from './admin.js';
import * as postCmd from './post.js';

type CommandJson = {
  name: string;
  description: string;
  options?: APIApplicationCommandOption[];
};

const COMMANDS: CommandJson[] = [
  setupCmd,
  configCmd,
  feedCmd,
  newsCmd,
  pingCmd,
  infoCmd,
  youtubeCmd,
  excuseCmd,
  epochCmd,
  devutilsCmd,
  statusCmd,
  adminCmd,
  postCmd,
].map((cmd) => cmd.data.toJSON() as CommandJson);

const OPTION_TYPE_LABEL: Record<number, string> = {
  [ApplicationCommandOptionType.String]: 'texte',
  [ApplicationCommandOptionType.Integer]: 'entier',
  [ApplicationCommandOptionType.Boolean]: 'booléen',
  [ApplicationCommandOptionType.User]: 'utilisateur',
  [ApplicationCommandOptionType.Channel]: 'salon',
  [ApplicationCommandOptionType.Role]: 'rôle',
  [ApplicationCommandOptionType.Mentionable]: 'mentionnable',
  [ApplicationCommandOptionType.Number]: 'nombre',
  [ApplicationCommandOptionType.Attachment]: 'fichier',
};

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('❓ Affiche l’aide des commandes disponibles')
  .addStringOption((o) =>
    o
      .setName('cmd')
      .setDescription('Nom de la commande à détailler (ex: feed)')
      .setAutocomplete(true),
  );

function truncate(text: string, max = 1000) {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function formatBasicOption(opt: APIApplicationCommandOption) {
  const typeLabel = OPTION_TYPE_LABEL[opt.type] ?? 'option';
  const required = 'required' in opt && opt.required ? 'obligatoire' : 'facultatif';
  const description = opt.description || 'Sans description';
  return `• \`${opt.name}\` (${typeLabel}, ${required}) - ${description}`;
}

function formatOptionTree(commandName: string, options?: APIApplicationCommandOption[]) {
  if (!options?.length) {
    return 'Aucune option pour cette commande.';
  }

  const lines: string[] = [];

  for (const opt of options) {
    if (opt.type === ApplicationCommandOptionType.Subcommand) {
      lines.push(`• \`/${commandName} ${opt.name}\` - ${opt.description || 'Sans description'}`);
      const subOptions = ('options' in opt ? opt.options : undefined) as APIApplicationCommandOption[] | undefined;
      if (subOptions?.length) {
        for (const sub of subOptions) {
          lines.push(`  - ${formatBasicOption(sub)}`);
        }
      }
      continue;
    }

    if (opt.type === ApplicationCommandOptionType.SubcommandGroup) {
      lines.push(`• Groupe \`${opt.name}\` - ${opt.description || 'Sans description'}`);
      const subCommands = ('options' in opt ? opt.options : undefined) as APIApplicationCommandOption[] | undefined;
      if (subCommands?.length) {
        for (const subCmd of subCommands) {
          lines.push(`  - \`/${commandName} ${opt.name} ${subCmd.name}\` - ${subCmd.description || 'Sans description'}`);
          const subOptions = ('options' in subCmd ? subCmd.options : undefined) as APIApplicationCommandOption[] | undefined;
          if (subOptions?.length) {
            for (const sub of subOptions) {
              lines.push(`    • ${formatBasicOption(sub)}`);
            }
          }
        }
      }
      continue;
    }

    lines.push(formatBasicOption(opt));
  }

  return truncate(lines.join('\n'));
}

function buildGeneralHelpEmbed() {
  const commandLines = COMMANDS
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((cmd) => `• \`/${cmd.name}\` - ${cmd.description}`);

  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle('❓ Aide des commandes')
    .setDescription('Utilise `/help cmd:<nom>` pour afficher le détail d’une commande (options, sous-commandes, etc.).')
    .addFields({
      name: '📚 Commandes disponibles',
      value: truncate(commandLines.join('\n')),
    })
    .setFooter({ text: 'Kotbo · Exemple : /help cmd:feed' })
    .setTimestamp();
}

function buildCommandHelpEmbed(command: CommandJson) {
  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(`❓ /${command.name}`)
    .setDescription(command.description || 'Sans description')
    .addFields({
      name: '🧩 Options et sous-commandes',
      value: formatOptionTree(command.name, command.options),
    })
    .setFooter({ text: 'Kotbo · Les options marquées obligatoires doivent être renseignées' })
    .setTimestamp();
}

export async function autocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused().toLowerCase();

  const choices = COMMANDS
    .map((cmd) => cmd.name)
    .filter((name) => name.includes(focused))
    .slice(0, 25)
    .map((name) => ({ name: `/${name}`, value: name }));

  await interaction.respond(choices);
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const requestedCmd = interaction.options.getString('cmd', false)?.trim().toLowerCase();

  if (!requestedCmd) {
    await interaction.reply({ embeds: [buildGeneralHelpEmbed()], flags: [MessageFlags.Ephemeral] });
    return;
  }

  const command = COMMANDS.find((cmd) => cmd.name.toLowerCase() === requestedCmd);

  if (!command) {
    await interaction.reply({
      content: `❌ Commande inconnue: \`/${requestedCmd}\`. Utilise l’autocomplétion de \`cmd\` pour choisir une commande valide.`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.reply({ embeds: [buildCommandHelpEmbed(command)], flags: [MessageFlags.Ephemeral] });
}