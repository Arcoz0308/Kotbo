import type { SlashCommandDefinition } from '../../commands.js';
import {
  SlashCommandBuilder,
  ContainerBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';
import prisma from '../../utils/db.js';
import { pushWidgetForUser, clearWidgetForUser } from '../../services/integrations/widgetService.js';
import { getStaffMember } from '../../services/staff/staffManagementService.js';
import { COLORS_RAW, text, successContainer, errorContainer } from '../../utils/embeds.js';
import { E } from '../../utils/emojis.js';

const data = new SlashCommandBuilder()
  .setName('widget')
  .setDescription('Gérer ton widget de profil Discord (Social Layer)')
  .addSubcommand((sub) =>
    sub
      .setName('activer')
      .setDescription('Activer le widget sur ton profil pour ce serveur'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('desactiver')
      .setDescription('Désactiver et supprimer le widget de ton profil'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('refresh')
      .setDescription('Rafraîchir manuellement les données du widget'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('info')
      .setDescription('Voir le statut de ton widget'),
  );

function getDashboardLoginUrl(): string {
  const baseRedirect = process.env.DISCORD_REDIRECT_URI ?? '';
  if (!baseRedirect) return '';
  const base = new URL(baseRedirect).origin;
  return `${base}/api/auth/discord/widget-login?returnTo=/widget`;
}

async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  if (!guildId) {
    await interaction.editReply({
      components: [errorContainer('Cette commande doit être utilisée dans un serveur.')],
      flags: MessageFlags.IsComponentsV2,
    });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'activer') {
    const staffMember = await getStaffMember(guildId, userId);
    if (!staffMember) {
      await interaction.editReply({
        components: [errorContainer('Accès refusé', 'Tu dois être membre du staff pour activer le widget.')],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    await prisma.widgetSubscription.upsert({
      where: { guildId_userId: { guildId, userId } },
      update: { enabled: true },
      create: { guildId, userId, enabled: true },
    });

    const result = await pushWidgetForUser(guildId, userId);
    if (!result.ok) {
      const container = new ContainerBuilder()
        .setAccentColor(COLORS_RAW.warning)
        .addTextDisplayComponents(text(`### ${E.warning} Widget — Synchronisation échouée`))
        .addTextDisplayComponents(text(
          `Widget activé en base mais la mise à jour Discord a échoué.\n\n` +
          `${E.arrow} **Si tu as retiré l'accès à Kotbo, autorise-le de nouveau.**\n` +
          `${E.dot} [Réautoriser Kotbo](${getDashboardLoginUrl()})`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(text(`${E.error} Erreur: \`${result.error}\``))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · Widget`));

      await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      return;
    }

    const container = new ContainerBuilder()
      .setAccentColor(COLORS_RAW.success)
      .addTextDisplayComponents(text(`### ${E.success} Widget activé`))
      .addTextDisplayComponents(text(
        `Tes stats staff sont synchronisées. Pour ajouter Kotbo à ton Profile Board, ` +
        `[ouvre le dashboard](${getDashboardLoginUrl()}).`
      ))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · Widget`));

    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    return;
  }

  if (sub === 'desactiver') {
    await prisma.widgetSubscription.updateMany({
      where: { guildId, userId },
      data: { enabled: false },
    });

    const result = await clearWidgetForUser(userId);
    if (!result.ok) {
      await interaction.editReply({
        components: [errorContainer('Erreur partielle', `Widget désactivé en base mais la suppression Discord a échoué: \`${result.error}\``)],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    await interaction.editReply({
      components: [successContainer('Widget désactivé', 'Le widget a été supprimé de ton profil.')],
      flags: MessageFlags.IsComponentsV2,
    });
    return;
  }

  if (sub === 'refresh') {
    const subscription = await prisma.widgetSubscription.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });

    if (!subscription?.enabled) {
      await interaction.editReply({
        components: [errorContainer('Aucun widget actif', 'Utilise `/widget activer` d\'abord.')],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    const result = await pushWidgetForUser(guildId, userId);
    if (!result.ok) {
      await interaction.editReply({
        components: [errorContainer('Échec du refresh', `\`${result.error}\``)],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    await interaction.editReply({
      components: [successContainer('Widget rafraîchi', 'Tes dernières stats ont été poussées sur ton profil.')],
      flags: MessageFlags.IsComponentsV2,
    });
    return;
  }

  if (sub === 'info') {
    const subscription = await prisma.widgetSubscription.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });

    const isActive = subscription?.enabled ?? false;
    const since = subscription?.createdAt
      ? subscription.createdAt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '—';

    const container = new ContainerBuilder()
      .setAccentColor(isActive ? COLORS_RAW.success : COLORS_RAW.dark)
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(text(`### ${E.profile} Widget Kotbo`))
          .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: interaction.user.displayAvatarURL() } }))
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text([
        `${E.arrow} **Statut** · ${isActive ? `${E.online} Actif` : `${E.offline} Inactif`}`,
        `${E.arrow} **Serveur** · ${interaction.guild?.name ?? guildId}`,
        `${E.arrow} **Activé depuis** · ${since}`,
      ].join('\n')))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(`${E.link} [Autoriser Kotbo sur ton profil](${getDashboardLoginUrl()})`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(`-# ${E.kotbo} Kotbo · Widget`));

    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    return;
  }
}

export const widgetCommand: SlashCommandDefinition = { data, execute };
