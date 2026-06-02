import type { SlashCommandDefinition } from '../commands.js';
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
import { adminCommand } from './admin.js';
import { casierCommand } from './casier.js';
import { configCommand } from './config.js';
import { dailyAlgoCommand } from './dailyAlgo.js';
import { devutilsCommand } from './devutils.js';
import { epochCommand } from './epoch.js';
import { excuseCommand } from './excuse.js';
import { infoCommand } from './info.js';
import { pingCommand } from './ping.js';
import { postCommand } from './post.js';
import { profileCommand } from './profile.js';
import { sanctionCommand } from './sanction.js';
import { setupCommand } from './setup.js';
import { statusCommand } from './status.js';
import { ticketCommand } from './ticket.js';

type CommandJson = {
  name: string;
  description: string;
  options?: APIApplicationCommandOption[];
};

type HelpCategory = 'Mise en route' | 'Flux & actualités' | 'Outils' | 'Administration';

type HelpCommand = CommandJson & {
  icon: string;
  category: HelpCategory;
  summary: string;
};

const COMMANDS: HelpCommand[] = [
  {
    command: setupCommand,
    icon: '🚀',
    category: 'Mise en route',
    summary: 'Assistant de configuration guidée du serveur',
  },
  {
    command: configCommand,
    icon: '⚙️',
    category: 'Mise en route',
    summary: 'Panneau central pour régler toutes les fonctionnalités',
  },
  {
    command: infoCommand,
    icon: 'ℹ️',
    category: 'Mise en route',
    summary: 'Affiche l’état du bot et les statistiques du serveur',
  },
  {
    command: pingCommand,
    icon: '🏓',
    category: 'Mise en route',
    summary: 'Mesure la latence du bot et de l’API Discord',
  },
  {
    command: postCommand,
    icon: '🚀',
    category: 'Flux & actualités',
    summary: 'Publie le digest et/ou le Daily Algo du serveur',
  },
  {
    command: dailyAlgoCommand,
    icon: '📚',
    category: 'Flux & actualités',
    summary: 'Affiche le défi, le barème, le classement et la progression Daily Algo',
  },
  {
    command: profileCommand,
    icon: '👤',
    category: 'Outils',
    summary: 'Affiche le profil utilisateur avec classement/streak/historique Daily Algo',
  },
  {
    command: statusCommand,
    icon: '🌐',
    category: 'Outils',
    summary: 'Vérifie rapidement le statut HTTP d’une URL',
  },
  {
    command: epochCommand,
    icon: '🕐',
    category: 'Outils',
    summary: 'Convertit les timestamps Unix en dates lisibles',
  },
  {
    command: devutilsCommand,
    icon: '🛠️',
    category: 'Outils',
    summary: 'Décode des JWT, manipule la Base64 et génère des hash',
  },
  {
    command: excuseCommand,
    icon: '😅',
    category: 'Outils',
    summary: 'Génère une excuse de développeur aléatoire',
  },
  {
    command: adminCommand,
    icon: '🔧',
    category: 'Administration',
    summary: 'Réunit les commandes de maintenance et de configuration avancée',
  },
  {
    command: sanctionCommand,
    icon: '🛡️',
    category: 'Administration',
    summary: 'Gère les sanctions: warn, timeout, kick, ban et tempban',
  },
  {
    command: ticketCommand,
    icon: '🎫',
    category: 'Administration',
    summary: 'Gère les tickets: claim, info membre, close, reopen, delete et rename',
  },
  {
    command: casierCommand,
    icon: '📁',
    category: 'Administration',
    summary: 'Ouvre le casier utilisateur complet avec profil, activité et sanctions',
  },
].map(({ command, ...meta }) => ({
  ...meta,
  category: meta.category as HelpCategory,
  ...(command.data.toJSON() as CommandJson),
}));

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

const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('❓ Centre d’aide interactif des commandes Kotbo')
  .addStringOption((o) =>
    o
      .setName('cmd')
      .setDescription('Nom de la commande à détailler (ex: feed, news, admin)')
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

function formatCommandLine(command: HelpCommand) {
  return `• ${command.icon} \`/${command.name}\` — ${command.summary}`;
}

function buildGeneralHelpEmbed() {
  const categories: HelpCategory[] = ['Mise en route', 'Flux & actualités', 'Outils', 'Administration'];
  const commandSections = categories.map((category) => ({
    name: category,
    value: truncate(
      COMMANDS.filter((command) => command.category === category)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(formatCommandLine)
        .join('\n'),
    ),
  }));

  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle('❓ Centre d’aide Kotbo')
    .setDescription('Parcours les commandes par catégorie, puis utilise `/help cmd:<nom>` pour voir les sous-commandes et les options détaillées.')
    .addFields(
      ...commandSections.map((section) => ({
        name: `📌 ${section.name}`,
        value: section.value || 'Aucune commande dans cette catégorie.',
      })),
      {
        name: '💡 Astuce',
        value: 'L’autocomplétion propose les commandes disponibles. Exemples : `/help cmd:feed`, `/help cmd:news`, `/help cmd:admin`.',
      },
    )
    .setFooter({ text: `Kotbo · ${COMMANDS.length} commandes disponibles` })
    .setTimestamp();
}

function buildCommandHelpEmbed(command: CommandJson) {
  const summary = COMMANDS.find((entry) => entry.name === command.name)?.summary ?? command.description ?? 'Sans description';

  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(`❓ /${command.name}`)
    .setDescription(summary)
    .addFields({
      name: '🧾 Résumé',
      value: truncate(summary),
    })
    .addFields({
      name: '🧩 Options et sous-commandes',
      value: formatOptionTree(command.name, command.options),
    })
    .setFooter({ text: 'Kotbo · Les options marquées obligatoires doivent être renseignées' })
    .setTimestamp();
}

async function autocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused().toLowerCase();

  const choices = COMMANDS
    .map((cmd) => cmd.name)
    .filter((name) => name.includes(focused))
    .slice(0, 25)
    .map((name) => ({ name: `/${name}`, value: name }));

  await interaction.respond(choices);
}

async function execute(interaction: ChatInputCommandInteraction) {
  const requestedCmd = interaction.options.getString('cmd', false)?.trim().toLowerCase();

  if (!requestedCmd) {
    await interaction.reply({ embeds: [buildGeneralHelpEmbed()], flags: [MessageFlags.Ephemeral] });
    return;
  }

  const command = COMMANDS.find((cmd) => cmd.name.toLowerCase() === requestedCmd);

  if (!command) {
    await interaction.reply({
      content: `❌ Commande inconnue : \`/${requestedCmd}\`. Utilise l’autocomplétion de \`cmd\` pour choisir une commande valide.`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.reply({ embeds: [buildCommandHelpEmbed(command)], flags: [MessageFlags.Ephemeral] });
}

export const helpCommand = { data, execute, autocomplete } satisfies SlashCommandDefinition;
