import type { SlashCommandDefinition } from '../../commands.js';
import {
  ApplicationCommandOptionType,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type AnySelectMenuInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { COLORS } from '../../utils/embeds.js';

interface CommandOption {
  name: string;
  description: string;
  type: ApplicationCommandOptionType;
  required?: boolean;
  options?: CommandOption[];
}

interface CommandJson {
  name: string;
  description: string;
  default_member_permissions?: string | null;
  options?: CommandOption[];
}

const CATEGORIES = [
  { name: 'Mise en route', emoji: '🚀', description: 'Configuration de base et informations du serveur/bot.' },
  { name: 'Flux & Actualités', emoji: '📰', description: 'Flux RSS, Daily Algo, suggestions et événements.' },
  { name: 'Modération & Staff', emoji: '🛡️', description: 'Sanctions, dossiers, réunions et gestion de tickets.' },
  { name: 'Profil & RPG', emoji: '👤', description: 'Profils communautaires, classement et économie RPG.' },
  { name: 'Outils & Fun', emoji: '🛠️', description: 'Utilitaires divers, jeux, gifs et divertissement.' },
];

const OPTION_TYPE_LABEL: Record<number, string> = {
  [ApplicationCommandOptionType.Subcommand]: 'Sous-commande',
  [ApplicationCommandOptionType.SubcommandGroup]: 'Groupe',
  [ApplicationCommandOptionType.String]: 'Texte',
  [ApplicationCommandOptionType.Integer]: 'Entier',
  [ApplicationCommandOptionType.Boolean]: 'Booléen',
  [ApplicationCommandOptionType.User]: 'Membre',
  [ApplicationCommandOptionType.Channel]: 'Salon',
  [ApplicationCommandOptionType.Role]: 'Rôle',
  [ApplicationCommandOptionType.Mentionable]: 'Mention',
  [ApplicationCommandOptionType.Number]: 'Nombre',
  [ApplicationCommandOptionType.Attachment]: 'Fichier',
};

let cachedCommands: SlashCommandDefinition[] | null = null;

async function getCommands(): Promise<SlashCommandDefinition[]> {
  if (!cachedCommands) {
    const { commands } = await import('../../commands.js');
    cachedCommands = commands.filter((c) => c.data && typeof c.data.name === 'string');
  }
  return cachedCommands;
}

function getCommandCategory(name: string): string {
  const adminAndMod = [
    'admin', 'sanction', 'dc', 'rescan', 'casier', 'absent', 'meeting',
    'note', 'transcript', 'clear', 'channel', 'signal', 'demission', 'ticket'
  ];
  const gettingStarted = [
    'setup', 'config', 'ping', 'info', 'dashboard', 'serverstats', 'stats', 'activate'
  ];
  const feedAndNews = [
    'post', 'daily-algo', 'suggest', 'suggestion-config', 'event'
  ];
  const profileAndRpg = [
    'profile', 'profil', 'leaderboard', 'invites', 'rank'
  ];
  
  if (name.startsWith('rpg-')) return 'Profil & RPG';
  if (gettingStarted.includes(name)) return 'Mise en route';
  if (feedAndNews.includes(name)) return 'Flux & Actualités';
  if (adminAndMod.includes(name)) return 'Modération & Staff';
  if (profileAndRpg.includes(name)) return 'Profil & RPG';
  
  return 'Outils & Fun';
}

function getCategoryThemeColor(category: string) {
  switch (category) {
    case 'Mise en route': return COLORS.primary;
    case 'Flux & Actualités': return COLORS.warning;
    case 'Modération & Staff': return COLORS.danger;
    case 'Profil & RPG': return COLORS.success;
    default: return COLORS.info;
  }
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

function formatPermissions(permBitfieldStr?: string | null) {
  if (!permBitfieldStr) return 'Tout le monde';
  try {
    const bitfield = BigInt(permBitfieldStr);
    const perms = new PermissionsBitField(bitfield).toArray();
    if (perms.length === 0) return 'Tout le monde';
    return perms.map((p) => `\`${p}\``).join(', ');
  } catch {
    return 'Tout le monde';
  }
}

function buildCommandSyntax(command: CommandJson): string {
  const name = command.name;
  const options = command.options || [];
  
  if (options.length === 0) {
    return `\`/${name}\``;
  }
  
  const hasSubcommands = options.some(
    (opt) =>
      opt.type === ApplicationCommandOptionType.Subcommand ||
      opt.type === ApplicationCommandOptionType.SubcommandGroup
  );
  
  if (hasSubcommands) {
    const lines: string[] = [];
    for (const opt of options) {
      if (opt.type === ApplicationCommandOptionType.Subcommand) {
        const subOpts = opt.options || [];
        const optString = subOpts
          .map((so) => (so.required ? `<${so.name}>` : `[${so.name}]`))
          .join(' ');
        lines.push(`\`/${name} ${opt.name}${optString ? ' ' + optString : ''}\``);
      } else if (opt.type === ApplicationCommandOptionType.SubcommandGroup) {
        const subCmds = opt.options || [];
        for (const sc of subCmds) {
          const subOpts = sc.options || [];
          const optString = subOpts
            .map((so) => (so.required ? `<${so.name}>` : `[${so.name}]`))
            .join(' ');
          lines.push(`\`/${name} ${opt.name} ${sc.name}${optString ? ' ' + optString : ''}\``);
        }
      }
    }
    return lines.join('\n');
  }
  
  const optString = options
    .map((opt) => (opt.required ? `<${opt.name}>` : `[${opt.name}]`))
    .join(' ');
  return `\`/${name} ${optString}\``;
}

function formatOption(opt: CommandOption): string {
  const typeLabel = OPTION_TYPE_LABEL[opt.type] ?? 'Option';
  const reqLabel = opt.required ? 'obligatoire' : 'facultatif';
  return `• \`${opt.name}\` *(type: ${typeLabel}, ${reqLabel})*\n  └─ ${opt.description || 'Pas de description.'}`;
}

function formatCommandOptionsTree(command: CommandJson): string {
  const options = command.options || [];
  if (options.length === 0) return 'Aucune option requise.';
  
  const lines: string[] = [];
  for (const opt of options) {
    if (opt.type === ApplicationCommandOptionType.Subcommand) {
      lines.push(`• **Sous-commande** \`${opt.name}\` — *${opt.description}*`);
      if (opt.options?.length) {
        for (const subOpt of opt.options) {
          lines.push(`  └─ \`${subOpt.name}\` *(type: ${OPTION_TYPE_LABEL[subOpt.type] ?? 'Option'}, ${subOpt.required ? 'obligatoire' : 'facultatif'})* — ${subOpt.description}`);
        }
      }
    } else if (opt.type === ApplicationCommandOptionType.SubcommandGroup) {
      lines.push(`• **Groupe** \`${opt.name}\` — *${opt.description}*`);
      if (opt.options?.length) {
        for (const subCmd of opt.options) {
          lines.push(`  ├─ **Sous-commande** \`${subCmd.name}\` — *${subCmd.description}*`);
          if (subCmd.options?.length) {
            for (const subOpt of subCmd.options) {
              lines.push(`  │  └─ \`${subOpt.name}\` *(type: ${OPTION_TYPE_LABEL[subOpt.type] ?? 'Option'}, ${subOpt.required ? 'obligatoire' : 'facultatif'})* — ${subOpt.description}`);
            }
          }
        }
      }
    } else {
      lines.push(formatOption(opt));
    }
  }
  return truncate(lines.join('\n'), 1024);
}

function buildHomeView(commands: SlashCommandDefinition[]) {
  const embed = new EmbedBuilder()
    .setTitle('❓ Kotbo — Centre d\'aide interactif')
    .setDescription(
      `Bienvenue dans le centre d'aide de **Kotbo** !\n\n` +
      `Sélectionnez une catégorie ci-dessous pour voir la liste des commandes associées, ou cliquez sur 🔍 pour chercher une commande directement.`
    )
    .setColor(COLORS.primary)
    .setTimestamp()
    .setFooter({ text: `Kotbo · ${commands.length} commandes disponibles` });

  for (const cat of CATEGORIES) {
    const catCmds = commands.filter((c) => getCommandCategory(c.data.name) === cat.name);
    embed.addFields({
      name: `${cat.emoji} ${cat.name} (${catCmds.length})`,
      value: cat.description,
      inline: false,
    });
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('help_category_select')
    .setPlaceholder('📁 Choisir une catégorie...')
    .addOptions(
      CATEGORIES.map((cat) => ({
        label: cat.name,
        value: `cat:${cat.name}`,
        emoji: cat.emoji,
      }))
    );

  const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const searchBtn = new ButtonBuilder()
    .setCustomId('help_search')
    .setLabel('Rechercher')
    .setEmoji('🔍')
    .setStyle(ButtonStyle.Success);

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(searchBtn);

  return {
    embeds: [embed],
    components: [row1, row2],
  };
}

function buildCategoryView(commands: SlashCommandDefinition[], categoryName: string) {
  const cat = CATEGORIES.find((c) => c.name === categoryName) || CATEGORIES[0];
  const catCmds = commands
    .filter((c) => getCommandCategory(c.data.name) === cat.name)
    .sort((a, b) => a.data.name.localeCompare(b.data.name));

  const embed = new EmbedBuilder()
    .setTitle(`${cat.emoji} Catégorie : ${cat.name}`)
    .setDescription(
      `*${cat.description}*\n\n` +
      (catCmds.length > 0
        ? catCmds.map((c) => `• \`/${c.data.name}\` — ${c.data.description}`).join('\n')
        : 'Aucune commande dans cette catégorie.')
    )
    .setColor(getCategoryThemeColor(cat.name))
    .setTimestamp()
    .setFooter({ text: `Kotbo · ${catCmds.length} commandes dans cette catégorie` });

  const selectCategory = new StringSelectMenuBuilder()
    .setCustomId('help_category_select')
    .setPlaceholder('📁 Choisir une autre catégorie...')
    .addOptions(
      CATEGORIES.map((c) => ({
        label: c.name,
        value: `cat:${c.name}`,
        emoji: c.emoji,
        default: c.name === cat.name,
      }))
    );

  const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectCategory);
  const components: any[] = [row1];

  if (catCmds.length > 0) {
    const selectCommand = new StringSelectMenuBuilder()
      .setCustomId('help_command_select')
      .setPlaceholder('🔍 Choisir une commande à détailler...')
      .addOptions(
        catCmds.slice(0, 25).map((c) => ({
          label: `/${c.data.name}`,
          value: `cmd:${c.data.name}`,
          description: truncate(c.data.description || '', 100),
        }))
      );
    const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectCommand);
    components.push(row2);
  }

  const homeBtn = new ButtonBuilder()
    .setCustomId('help_home')
    .setLabel('Accueil')
    .setEmoji('🏠')
    .setStyle(ButtonStyle.Primary);

  const searchBtn = new ButtonBuilder()
    .setCustomId('help_search')
    .setLabel('Rechercher')
    .setEmoji('🔍')
    .setStyle(ButtonStyle.Success);

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(homeBtn, searchBtn);
  components.push(row3);

  return {
    embeds: [embed],
    components,
  };
}

function buildCommandView(commands: SlashCommandDefinition[], commandName: string) {
  const command = commands.find((c) => c.data.name.toLowerCase() === commandName.toLowerCase());
  if (!command) {
    return buildHomeView(commands);
  }

  const category = getCommandCategory(command.data.name);
  const cat = CATEGORIES.find((c) => c.name === category) || CATEGORIES[0];

  const commandJson = (command.data.toJSON ? command.data.toJSON() : command.data) as CommandJson;
  const syntax = buildCommandSyntax(commandJson);
  const optionsTree = formatCommandOptionsTree(commandJson);
  const permissions = formatPermissions(commandJson.default_member_permissions);

  const embed = new EmbedBuilder()
    .setTitle(`${cat.emoji} Commande : /${command.data.name}`)
    .setDescription(command.data.description || 'Pas de description.')
    .setColor(getCategoryThemeColor(category))
    .addFields(
      { name: '📁 Catégorie', value: category, inline: true },
      { name: '🔒 Permissions requises', value: permissions, inline: true },
      { name: 'ℹ️ Syntaxe', value: syntax, inline: false },
      { name: '🧩 Options et Sous-commandes', value: optionsTree, inline: false }
    )
    .setTimestamp()
    .setFooter({ text: 'Kotbo · Aide détaillée de la commande' });

  const catCmds = commands
    .filter((c) => getCommandCategory(c.data.name) === category)
    .sort((a, b) => a.data.name.localeCompare(b.data.name));

  const currentIndex = catCmds.findIndex((c) => c.data.name === command.data.name);
  const prevCmd = catCmds[(currentIndex - 1 + catCmds.length) % catCmds.length];
  const nextCmd = catCmds[(currentIndex + 1) % catCmds.length];

  const components: any[] = [];

  const selectCategory = new StringSelectMenuBuilder()
    .setCustomId('help_category_select')
    .setPlaceholder('📁 Choisir une autre catégorie...')
    .addOptions(
      CATEGORIES.map((c) => ({
        label: c.name,
        value: `cat:${c.name}`,
        emoji: c.emoji,
        default: c.name === category,
      }))
    );
  components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectCategory));

  const selectCommand = new StringSelectMenuBuilder()
    .setCustomId('help_command_select')
    .setPlaceholder('🔍 Choisir une autre commande...')
    .addOptions(
      catCmds.slice(0, 25).map((c) => ({
        label: `/${c.data.name}`,
        value: `cmd:${c.data.name}`,
        description: truncate(c.data.description || '', 100),
        default: c.data.name === command.data.name,
      }))
    );
  components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectCommand));

  const prevBtn = new ButtonBuilder()
    .setCustomId(`help_prev:${category}:${prevCmd.data.name}`)
    .setEmoji('◀️')
    .setLabel(`/${prevCmd.data.name}`)
    .setStyle(ButtonStyle.Secondary);

  const homeBtn = new ButtonBuilder()
    .setCustomId('help_home')
    .setLabel('Accueil')
    .setEmoji('🏠')
    .setStyle(ButtonStyle.Primary);

  const searchBtn = new ButtonBuilder()
    .setCustomId('help_search')
    .setLabel('Rechercher')
    .setEmoji('🔍')
    .setStyle(ButtonStyle.Success);

  const nextBtn = new ButtonBuilder()
    .setCustomId(`help_next:${category}:${nextCmd.data.name}`)
    .setEmoji('▶️')
    .setLabel(`/${nextCmd.data.name}`)
    .setStyle(ButtonStyle.Secondary);

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, homeBtn, searchBtn, nextBtn);
  components.push(buttonRow);

  return {
    embeds: [embed],
    components,
  };
}

function buildHelpView(commands: SlashCommandDefinition[], state: string) {
  if (state === 'home') return buildHomeView(commands);
  if (state.startsWith('cat:')) return buildCategoryView(commands, state.slice(4));
  if (state.startsWith('cmd:')) return buildCommandView(commands, state.slice(4));
  return buildHomeView(commands);
}

export async function handleHelpInteraction(
  interaction: ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction
) {
  const commands = await getCommands();
  const customId = interaction.customId;

  if (interaction.isButton()) {
    if (customId === 'help_home') {
      const view = buildHelpView(commands, 'home');
      await interaction.update(view);
      return;
    }
    if (customId === 'help_search') {
      const modal = new ModalBuilder()
        .setCustomId('help_search_modal')
        .setTitle('🔍 Rechercher une commande');

      const input = new TextInputBuilder()
        .setCustomId('command_name')
        .setLabel('Nom de la commande')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Exemple: sanction, ping, rpg-profile...')
        .setRequired(true)
        .setMaxLength(32);

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
      await interaction.showModal(modal);
      return;
    }
    if (customId.startsWith('help_prev:') || customId.startsWith('help_next:')) {
      const [, , commandName] = customId.split(':');
      const view = buildHelpView(commands, `cmd:${commandName}`);
      await interaction.update(view);
      return;
    }
  }

  if (interaction.isAnySelectMenu()) {
    if (customId === 'help_category_select') {
      const value = interaction.values[0];
      const view = buildHelpView(commands, value);
      await interaction.update(view);
      return;
    }
    if (customId === 'help_command_select') {
      const value = interaction.values[0];
      const view = buildHelpView(commands, value);
      await interaction.update(view);
      return;
    }
  }

  if (interaction.isModalSubmit()) {
    if (customId === 'help_search_modal') {
      const searchName = interaction.fields.getTextInputValue('command_name').trim().toLowerCase();
      const found = commands.find((c) => c.data.name.toLowerCase() === searchName) ||
                    commands.find((c) => c.data.name.toLowerCase().includes(searchName)) ||
                    commands.find((c) => searchName.includes(c.data.name.toLowerCase()));

      if (found) {
        const view = buildHelpView(commands, `cmd:${found.data.name}`);
        await interaction.update(view);
      } else {
        await interaction.reply({
          content: `❌ Commande \`/${searchName}\` non trouvée. Veuillez vérifier l'orthographe.`,
          flags: [MessageFlags.Ephemeral],
        });
      }
      return;
    }
  }
}

const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('❓ Centre d’aide interactif des commandes Kotbo')
  .addStringOption((o) =>
    o
      .setName('cmd')
      .setDescription('Nom de la commande à détailler (ex: sanction, ping)')
      .setAutocomplete(true),
  );

async function autocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const commands = await getCommands();

  const choices = commands
    .map((cmd) => cmd.data.name)
    .filter((name) => name.toLowerCase().includes(focused))
    .slice(0, 25)
    .map((name) => ({ name: `/${name}`, value: name }));

  await interaction.respond(choices);
}

async function execute(interaction: ChatInputCommandInteraction) {
  const requestedCmd = interaction.options.getString('cmd', false)?.trim().toLowerCase();
  const commands = await getCommands();

  let state = 'home';
  if (requestedCmd) {
    const found = commands.find((cmd) => cmd.data.name.toLowerCase() === requestedCmd);
    if (found) {
      state = `cmd:${found.data.name}`;
    } else {
      await interaction.reply({
        content: `❌ Commande \`/${requestedCmd}\` inconnue. Affichage du menu d'aide général.`,
        flags: [MessageFlags.Ephemeral],
      });
      state = 'home';
    }
  }

  const view = buildHelpView(commands, state);

  if (interaction.replied) {
    await interaction.followUp({ ...view, flags: [MessageFlags.Ephemeral] });
  } else {
    await interaction.reply({ ...view, flags: [MessageFlags.Ephemeral] });
  }
}

export const helpCommand = { data, execute, autocomplete } satisfies SlashCommandDefinition;
