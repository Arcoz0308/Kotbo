import type { ContextCommandDefinition, SlashCommandDefinition } from '../../commands.js';
import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  type UserContextMenuCommandInteraction,
} from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { renderPanelTarget } from '../../utils/interactionResponses.js';
import { buildMemberCasePanel } from '../../services/moderation/memberCaseService.js';

const data = new SlashCommandBuilder()
  .setName('casier')
  .setDescription('📁 Ouvre le casier utilisateur complet')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addSubcommand((sub) =>
    sub
      .setName('voir')
      .setDescription('Affiche le casier d’un membre ou d’un ID Discord')
      .addUserOption((option) => option.setName('membre').setDescription('Membre à consulter').setRequired(false))
      .addStringOption((option) => option.setName('id').setDescription('ID Discord à consulter si le membre n’est plus présent').setRequired(false)),
  );

const contextData = new ContextMenuCommandBuilder()
  .setName('Voir le Casier')
  .setType(ApplicationCommandType.User)
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

function canModerate(interaction: ChatInputCommandInteraction): interaction is ChatInputCommandInteraction<'cached'> {
  if (!interaction.inCachedGuild()) return false;
  return Boolean(interaction.guild.members.me);
}

function extractUserId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(?:<@!?)?(\d{15,25})(?:>)?$/);
  return match?.[1] ?? null;
}

async function replyError(interaction: ChatInputCommandInteraction, title: string, description: string) {
  await interaction.reply({ embeds: [errorEmbed(title, description)], flags: [MessageFlags.Ephemeral] });
}

async function execute(interaction: ChatInputCommandInteraction | UserContextMenuCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) return;

  const targetUserId = interaction.isChatInputCommand()
    ? (interaction.options.getUser('membre', false)?.id ?? (interaction.options.getString('id', false) ? extractUserId(interaction.options.getString('id', false)!) : null))
    : interaction.targetId;

  if (!targetUserId) {
    if (interaction.isChatInputCommand()) {
      await replyError(interaction, 'Cible manquante', 'Indique un membre ou un ID Discord valide.');
    }
    return;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    const panel = await buildMemberCasePanel(interaction.guild, targetUserId, 'resume', 0);
    await renderPanelTarget(interaction, {
      embeds: [panel.embed],
      components: panel.components,
      files: panel.files,
      flags: [MessageFlags.Ephemeral],
    });
  } catch (error) {
    await renderPanelTarget(interaction, {
      embeds: [errorEmbed('Casier indisponible', error instanceof Error ? error.message : 'Impossible de charger le casier.')],
      flags: [MessageFlags.Ephemeral],
    });
  }
}

export const casierCommand = { data, execute } satisfies SlashCommandDefinition;
export const casierContextCommand = { data: contextData, execute } satisfies ContextCommandDefinition;
