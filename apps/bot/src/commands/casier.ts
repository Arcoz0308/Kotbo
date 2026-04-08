import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { errorEmbed } from '../utils/embeds.js';
import { renderPanelTarget } from '../utils/interactionResponses.js';
import { buildMemberCasePanel } from '../services/memberCaseService.js';

export const data = new SlashCommandBuilder()
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

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!canModerate(interaction)) {
    await replyError(interaction, 'Serveur requis', 'Cette commande ne peut être utilisée qu’en serveur.');
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand !== 'voir') {
    await replyError(interaction, 'Sous-commande inconnue', 'Cette sous-commande n’est pas encore supportée.');
    return;
  }

  const targetUser = interaction.options.getUser('membre', false);
  const rawId = interaction.options.getString('id', false);
  const targetUserId = targetUser?.id ?? (rawId ? extractUserId(rawId) : null);

  if (!targetUserId) {
    await replyError(interaction, 'Cible manquante', 'Indique un membre ou un ID Discord valide.');
    return;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  try {
    const panel = await buildMemberCasePanel(interaction.guild, targetUserId, 'resume', 0);
    await renderPanelTarget(interaction, {
      embeds: [panel.embed],
      components: panel.components,
      flags: [MessageFlags.Ephemeral],
    });
  } catch (error) {
    await renderPanelTarget(interaction, {
      embeds: [errorEmbed('Casier indisponible', error instanceof Error ? error.message : 'Impossible de charger le casier.')],
      flags: [MessageFlags.Ephemeral],
    });
  }
}
