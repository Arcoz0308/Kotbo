import type { ContextCommandDefinition, SlashCommandDefinition } from '../../commands.js';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  type ChatInputCommandInteraction,
  type UserContextMenuCommandInteraction,
  type User,
  type AutocompleteInteraction,
} from 'discord.js';
import { SanctionStatus, SanctionType } from '@prisma/client';
import prisma from '../../utils/db.js';
import { errorEmbed, infoEmbed, successEmbed } from '../../utils/embeds.js';
import {
  countWarns,
  formatDurationFr,
  getSanctionTypeBreakdown,
  listSanctionsByMember,
  parseDurationToMs,
  registerBanSanction,
  registerKickSanction,
  registerTimeoutSanction,
  registerWarnSanction,
  registerSoftbanSanction,
  runGuildBan,
} from '../../services/moderation/sanctionService.js';
import { applyProgressiveSanction, getOrCreateDefaultTables } from '../../services/moderation/sanctionTableService.js';
import * as altAccountService from '../../services/moderation/altAccountService.js';
import { buildMemberCaseActionRow } from '../../services/moderation/memberCaseService.js';
import { extractTrackingInfo, resolveModuleFromCommand, wrapModuleTracking } from '../../utils/moduleTracking.js';

const DURATION_HELP = 'Exemples: 30m, 2h, 3j, 1 semaine';
const SANCTION_PAGE_SIZE = 5;
const SANCTION_LIST_TIMEOUT_MS = 2 * 60 * 1000;
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:5173';

const data = new SlashCommandBuilder()
  .setName('sanction')
  .setDescription('🛡️ Gère les sanctions (warn, TO, kick, ban, tempban, list)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addSubcommand((sub) =>
    sub
      .setName('warn')
      .setDescription('Ajoute un avertissement à un membre')
      .addUserOption((option) => option.setName('membre').setDescription('Membre à avertir').setRequired(true))
      .addStringOption((option) => option.setName('raison').setDescription('Raison du warn').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName('to')
      .setDescription('Applique un timeout, avec renouvellement auto si nécessaire')
      .addUserOption((option) => option.setName('membre').setDescription('Membre à timeout').setRequired(true))
      .addStringOption((option) => option.setName('duree').setDescription(DURATION_HELP).setRequired(true))
      .addStringOption((option) => option.setName('raison').setDescription('Raison du timeout').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName('kick')
      .setDescription('Exclut un membre du serveur')
      .addUserOption((option) => option.setName('membre').setDescription('Membre à exclure').setRequired(true))
      .addStringOption((option) => option.setName('raison').setDescription('Raison du kick').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName('ban')
      .setDescription('Bannit définitivement un membre')
      .addUserOption((option) => option.setName('membre').setDescription('Membre à bannir').setRequired(true))
      .addStringOption((option) => option.setName('raison').setDescription('Raison du ban').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName('tempban')
      .setDescription('Bannit temporairement un membre')
      .addUserOption((option) => option.setName('membre').setDescription('Membre à bannir temporairement').setRequired(true))
      .addStringOption((option) => option.setName('duree').setDescription(DURATION_HELP).setRequired(true))
      .addStringOption((option) => option.setName('raison').setDescription('Raison du tempban').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName('softban')
      .setDescription('Bannit puis débannit immédiatement un membre pour supprimer ses messages récents (7 jours)')
      .addUserOption((option) => option.setName('membre').setDescription('Membre à softban').setRequired(true))
      .addStringOption((option) => option.setName('raison').setDescription('Raison du softban').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription("Affiche la liste des sanctions d'un membre")
      .addUserOption((option) => option.setName('membre').setDescription('Membre à afficher').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName('tableau')
      .setDescription('Applique une sanction progressive via un tableau de sanction')
      .addUserOption((option) => option.setName('membre').setDescription('Membre à sanctionner').setRequired(true))
      .addStringOption((option) =>
        option
          .setName('nom')
          .setDescription('Nom du tableau de sanction')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption((option) =>
        option
          .setName('raison')
          .setDescription('Raison de la sanction')
          .setRequired(true)
      )
      .addIntegerOption((option) =>
        option
          .setName('bypass')
          .setDescription('Forcer un palier spécifique (ex: 3 pour T3) (optionnel)')
          .setRequired(false)
          .setMinValue(1)
      ),
  );

const contextData = new ContextMenuCommandBuilder()
  .setName('Sanctionner')
  .setType(ApplicationCommandType.User)
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

function canModerate(interaction: ChatInputCommandInteraction | UserContextMenuCommandInteraction): interaction is ChatInputCommandInteraction<'cached'> | UserContextMenuCommandInteraction<'cached'> {
  if (!interaction.inCachedGuild()) return false;
  const me = interaction.guild.members.me;
  return Boolean(me);
}

async function fetchTargetMember(interaction: ChatInputCommandInteraction<'cached'> | UserContextMenuCommandInteraction<'cached'>, targetUser: User) {
  return interaction.guild.members.fetch(targetUser.id).catch(() => null);
}

function validateTarget(interaction: ChatInputCommandInteraction<'cached'> | UserContextMenuCommandInteraction<'cached'>, member: GuildMember | null, targetUser: User, action: string): string | null {
  if (targetUser.bot && action === 'warn') return 'Impossible de warn un bot.';
  if (targetUser.id === interaction.user.id) return 'Tu ne peux pas te sanctionner toi-même.';
  if (targetUser.id === interaction.client.user.id) return 'Impossible de sanctionner le bot.';

  const executor = interaction.member;
  if (executor instanceof GuildMember && member) {
    if (member.roles.highest.position >= executor.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
      return 'Tu ne peux pas sanctionner un membre avec un rôle égal ou supérieur au tien.';
    }
  }

  return null;
}

async function replyError(interaction: ChatInputCommandInteraction, title: string, description: string) {
  await interaction.reply({ embeds: [errorEmbed(title, description)], flags: [MessageFlags.Ephemeral] });
}

async function notifyModeratorDashboardReportReminder(
  interaction: ChatInputCommandInteraction<'cached'>,
  params: { sanctionId: string; targetLabel: string },
) {
  const dashboardSanctionsUrl = `${DASHBOARD_URL.replace(/\/+$/, '')}/sanctions`;
  const _reminderEmbed = infoEmbed(
    'Rapport à compléter',
    [
      `Tu as sanctionné ${params.targetLabel}.`,
      'Pense à compléter le rapport associé dans le dashboard.',
      `Accès: ${dashboardSanctionsUrl}`,
    ].join('\n'),
  ).addFields({ name: 'ID sanction', value: params.sanctionId, inline: false });

  try {
    await interaction.followUp({
      embeds: [infoEmbed('Rapport requis', "N'oubliez pas de compléter le rapport de sanction sur le dashboard.")],
      flags: [MessageFlags.Ephemeral],
    });
  } catch {
    // Silent catch if interaction is already replied/expired
  }
}

function sanctionTypeLabel(type: SanctionType): string {
  switch (type) {
    case SanctionType.WARN:
      return 'Avertissement';
    case SanctionType.TIMEOUT:
      return 'Timeout';
    case SanctionType.KICK:
      return 'Kick';
    case SanctionType.TEMP_BAN:
      return 'Tempban';
    case SanctionType.BAN:
      return 'Ban';
    case SanctionType.SOFTBAN:
      return 'Softban';
    default:
      return type;
  }
}

function sanctionTypeEmoji(type: SanctionType): string {
  switch (type) {
    case SanctionType.WARN:
      return '⚠️';
    case SanctionType.TIMEOUT:
      return '⏳';
    case SanctionType.KICK:
      return '👢';
    case SanctionType.TEMP_BAN:
      return '🚫';
    case SanctionType.BAN:
      return '⛔';
    case SanctionType.SOFTBAN:
      return '🧼';
    default:
      return '📌';
  }
}

function sanctionStatusLabel(status: SanctionStatus): string {
  switch (status) {
    case SanctionStatus.ACTIVE:
      return 'Active';
    case SanctionStatus.RESOLVED:
      return 'Résolue';
    case SanctionStatus.FAILED:
      return 'En échec';
    default:
      return status;
  }
}

function sanitizeReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) return 'Aucune raison renseignée.';
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed;
}

async function buildSanctionListView(guildId: string, targetUserId: string, targetLabel: string, pageIndex: number) {
  const linkedUserIds = await altAccountService.getAllLinkedUserIds(guildId, targetUserId);

  const [listResult, typeBreakdown] = await Promise.all([
    listSanctionsByMember({ guildId, targetUserId, targetUserIds: linkedUserIds, page: pageIndex, pageSize: SANCTION_PAGE_SIZE }),
    getSanctionTypeBreakdown(guildId, targetUserId, linkedUserIds),
  ]);

  const total = listResult.total;
  const totalPages = Math.max(1, Math.ceil(total / SANCTION_PAGE_SIZE));
  const safePageIndex = Math.min(Math.max(0, pageIndex), totalPages - 1);

  const finalList = safePageIndex === pageIndex
    ? listResult
    : await listSanctionsByMember({ guildId, targetUserId, targetUserIds: linkedUserIds, page: safePageIndex, pageSize: SANCTION_PAGE_SIZE });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🛡️ Historique des sanctions · ${targetLabel}`)
    .setTimestamp()
    .setFooter({ text: `Page ${safePageIndex + 1} / ${totalPages}` });

  if (finalList.total === 0) {
    embed.setDescription('Aucune sanction trouvée pour ce membre.');
  } else {
    const lines = finalList.sanctions.map((sanction, index) => {
      const absoluteIndex = safePageIndex * SANCTION_PAGE_SIZE + index + 1;
      const reason = sanitizeReason(sanction.reason);
      const moderatorLabel = sanction.moderatorTag ?? `<@${sanction.moderatorUserId}>`;
      const durationLabel = sanction.durationSeconds ? ` · ${formatDurationFr(sanction.durationSeconds * 1000)}` : '';
      const expiryLabel = sanction.expiresAt ? `\nFin: <t:${Math.floor(sanction.expiresAt.getTime() / 1000)}:R>` : '';

      return [
        `**${absoluteIndex}. ${sanctionTypeEmoji(sanction.type)} ${sanctionTypeLabel(sanction.type)}** (${sanctionStatusLabel(sanction.status)})${durationLabel}`,
        `Motif: ${reason}`,
        `Modération: ${moderatorLabel} · Créée: <t:${Math.floor(sanction.createdAt.getTime() / 1000)}:R>${expiryLabel}`,
      ].join('\n');
    });

    embed.setDescription(lines.join('\n\n'));
  }

  embed.addFields({
    name: 'Résumé',
    value: [
      `Total: **${total}**`,
      `Warn: **${typeBreakdown.WARN}**`,
      `Timeout: **${typeBreakdown.TIMEOUT}**`,
      `Kick: **${typeBreakdown.KICK}**`,
      `Tempban: **${typeBreakdown.TEMP_BAN}**`,
      `Ban: **${typeBreakdown.BAN}**`,
    ].join(' · '),
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('sanction:list:prev')
      .setLabel('Précédent')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePageIndex === 0 || finalList.total === 0),
    new ButtonBuilder()
      .setCustomId('sanction:list:next')
      .setLabel('Suivant')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePageIndex >= totalPages - 1 || finalList.total === 0),
  );

  const caseRow = buildMemberCaseActionRow(targetUserId);

  return { embed, row, caseRow, pageIndex: safePageIndex, totalPages };
}

async function execute(interaction: ChatInputCommandInteraction | UserContextMenuCommandInteraction): Promise<void> {
  const { guildId, userId } = extractTrackingInfo(interaction);
  const moduleName = resolveModuleFromCommand('sanction');
  const actionName = interaction.isChatInputCommand() ? interaction.options.getSubcommand(true) : 'context_menu';

  // Wrapper pour tracker les performances et l'utilisation
  await wrapModuleTracking(
    moduleName,
    executeInternal,
    [interaction],
    {
      actionType: 'command',
      actionName,
      guildId,
      userId,
    }
  );
}

async function executeInternal(interaction: ChatInputCommandInteraction | UserContextMenuCommandInteraction): Promise<void> {
  if (!canModerate(interaction)) {
    await replyError(interaction as unknown, 'Serveur requis', "Cette commande ne peut être utilisée qu'en serveur.");
    return;
  }

  if (interaction.isUserContextMenuCommand()) {
    const targetUserId = interaction.targetId;
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`case:sanction_action:${targetUserId}`)
      .setPlaceholder("Sanctionner l'utilisateur")
      .addOptions(
        { label: 'Avertissement (Warn)', value: 'warn', emoji: '⚠️' },
        { label: 'Exclusion temporaire (Timeout)', value: 'timeout', emoji: '⏳' },
        { label: 'Expulsion (Kick)', value: 'kick', emoji: '👢' },
        { label: 'Bannissement (Ban)', value: 'ban', emoji: '🔨' },
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

    await interaction.reply({
      content: `Choisis la sanction à appliquer à <@${targetUserId}> :`,
      components: [row],
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const targetUser = interaction.options.getUser('membre', true);
  const targetMember = await fetchTargetMember(interaction, targetUser);

  const validationError = subcommand === 'list' ? null : validateTarget(interaction, targetMember, targetUser, subcommand);
  if (validationError) {
    await replyError(interaction, 'Action refusée', validationError);
    return;
  }

  const moderator = { id: interaction.user.id, tag: interaction.user.tag };
  const target = { id: targetUser.id, tag: targetUser.tag };

  try {
    if (subcommand === 'list') {
      let currentPage = 0;
      const view = await buildSanctionListView(interaction.guildId, targetUser.id, targetUser.tag, currentPage);
      currentPage = view.pageIndex;

      const reply = await interaction.reply({
        embeds: [view.embed],
        components: [view.row, view.caseRow],
        fetchReply: true,
      });

      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: SANCTION_LIST_TIMEOUT_MS,
      });

      collector.on('collect', async (buttonInteraction) => {
        if (buttonInteraction.user.id !== interaction.user.id) {
          await buttonInteraction.reply({
            embeds: [infoEmbed('Action refusée', 'Seul le modérateur ayant exécuté la commande peut changer de page.')],
            flags: [MessageFlags.Ephemeral],
          });
          return;
        }

        if (buttonInteraction.customId === 'sanction:list:prev') {
          currentPage = Math.max(0, currentPage - 1);
        } else if (buttonInteraction.customId === 'sanction:list:next') {
          currentPage += 1;
        }

        const nextView = await buildSanctionListView(interaction.guildId, targetUser.id, targetUser.tag, currentPage);
        currentPage = nextView.pageIndex;

        await buttonInteraction.update({ embeds: [nextView.embed], components: [nextView.row, nextView.caseRow] });
      });

      collector.on('end', async () => {
        try {
          const expiredView = await buildSanctionListView(interaction.guildId, targetUser.id, targetUser.tag, currentPage);
          const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('sanction:list:prev')
              .setLabel('Précédent')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId('sanction:list:next')
              .setLabel('Suivant')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
          );
          await interaction.editReply({ embeds: [expiredView.embed], components: [disabledRow, expiredView.caseRow] });
        } catch {
          // Message possiblement supprimé ou interaction expirée.
        }
      });

      return;
    }

    if (subcommand === 'warn') {
      const reason = interaction.options.getString('raison', true).trim();

      const sanction = await registerWarnSanction({ guildId: interaction.guildId, target, moderator, reason, client: interaction.client });
      const linkedUserIds = await altAccountService.getAllLinkedUserIds(interaction.guildId, targetUser.id);
      const warnCount = await countWarns(interaction.guildId, targetUser.id, linkedUserIds);

      await interaction.reply({
        embeds: [
          successEmbed('Warn enregistré', `${targetUser} a reçu un avertissement.`).addFields(
            { name: 'Raison', value: reason },
            { name: 'Nombre total de warns', value: `${warnCount}`, inline: true },
          ),
        ],
        components: [buildMemberCaseActionRow(targetUser.id)],
      });

      await notifyModeratorDashboardReportReminder(interaction, {
        sanctionId: sanction.id,
        targetLabel: targetUser.tag,
      });
      return;
    }

    if (subcommand === 'to') {
      const reason = interaction.options.getString('raison', true).trim();

      if (!targetMember) {
        await replyError(interaction, 'Membre introuvable', 'Le membre doit être présent sur le serveur pour un timeout.');
        return;
      }
      if (!targetMember.moderatable) {
        await replyError(interaction, 'Action impossible', 'Le bot ne peut pas appliquer de timeout à ce membre. Vérifie la hiérarchie des rôles.');
        return;
      }

      const durationInput = interaction.options.getString('duree', true);
      const durationMs = parseDurationToMs(durationInput);
      if (!durationMs) {
        await replyError(interaction, 'Durée invalide', `Format de durée invalide. ${DURATION_HELP}`);
        return;
      }

      const sanction = await registerTimeoutSanction({
        guildId: interaction.guildId,
        target,
        moderator,
        reason,
        durationMs,
        member: targetMember,
        client: interaction.client,
      });

      await interaction.reply({
        embeds: [
          successEmbed('Timeout appliqué', `${targetUser} est en timeout.`).addFields(
            { name: 'Durée', value: formatDurationFr(durationMs), inline: true },
            { name: 'Raison', value: reason, inline: false },
            { name: 'Suivi automatique', value: 'Le bot renouvellera automatiquement le TO si la durée dépasse la limite Discord.', inline: false },
            { name: 'ID sanction', value: sanction.id, inline: false },
          ),
        ],
        components: [buildMemberCaseActionRow(targetUser.id)],
      });

      await notifyModeratorDashboardReportReminder(interaction, {
        sanctionId: sanction.id,
        targetLabel: targetUser.tag,
      });
      return;
    }

    if (subcommand === 'kick') {
      const reason = interaction.options.getString('raison', true).trim();

      if (!targetMember) {
        await replyError(interaction, 'Membre introuvable', 'Le membre doit être présent sur le serveur pour être kick.');
        return;
      }
      if (!targetMember.kickable) {
        await replyError(interaction, 'Action impossible', 'Le bot ne peut pas exclure ce membre. Vérifie la hiérarchie des rôles.');
        return;
      }

      await targetMember.kick(`${reason} | Modération: ${interaction.user.tag}`);
      const sanction = await registerKickSanction({ guildId: interaction.guildId, target, moderator, reason, client: interaction.client });

      await interaction.reply({
        embeds: [successEmbed('Kick exécuté', `${targetUser.tag} a été exclu du serveur.`).addFields({ name: 'Raison', value: reason })],
        components: [buildMemberCaseActionRow(targetUser.id)],
      });

      await notifyModeratorDashboardReportReminder(interaction, {
        sanctionId: sanction.id,
        targetLabel: targetUser.tag,
      });
      return;
    }

    if (subcommand === 'ban') {
      const reason = interaction.options.getString('raison', true).trim();

      if (targetMember && !targetMember.bannable) {
        await replyError(interaction, 'Action impossible', 'Le bot ne peut pas bannir ce membre. Vérifie la hiérarchie des rôles.');
        return;
      }

      await runGuildBan(interaction.guild, targetUser.id, `${reason} | Modération: ${interaction.user.tag}`);
      const sanction = await registerBanSanction({ guildId: interaction.guildId, target, moderator, reason, client: interaction.client });

      await interaction.reply({
        embeds: [successEmbed('Ban exécuté', `${targetUser.tag} a été banni définitivement.`).addFields({ name: 'Raison', value: reason })],
        components: [buildMemberCaseActionRow(targetUser.id)],
      });

      await notifyModeratorDashboardReportReminder(interaction, {
        sanctionId: sanction.id,
        targetLabel: targetUser.tag,
      });
      return;
    }

    if (subcommand === 'tempban') {
      const reason = interaction.options.getString('raison', true).trim();

      if (targetMember && !targetMember.bannable) {
        await replyError(interaction, 'Action impossible', 'Le bot ne peut pas bannir ce membre. Vérifie la hiérarchie des rôles.');
        return;
      }

      const durationInput = interaction.options.getString('duree', true);
      const durationMs = parseDurationToMs(durationInput);
      if (!durationMs) {
        await replyError(interaction, 'Durée invalide', `Format de durée invalide. ${DURATION_HELP}`);
        return;
      }

      await runGuildBan(interaction.guild, targetUser.id, `${reason} | Modération: ${interaction.user.tag}`);
      const sanction = await registerBanSanction({
        guildId: interaction.guildId,
        target,
        moderator,
        reason,
        temporaryDurationMs: durationMs,
        client: interaction.client,
      });

      await interaction.reply({
        embeds: [
          successEmbed('Tempban exécuté', `${targetUser.tag} a été banni temporairement.`).addFields(
            { name: 'Durée', value: formatDurationFr(durationMs), inline: true },
            { name: 'Raison', value: reason, inline: false },
            { name: 'Déban auto', value: `<t:${Math.floor((sanction.expiresAt?.getTime() ?? Date.now()) / 1000)}:F>`, inline: false },
          ),
        ],
        components: [buildMemberCaseActionRow(targetUser.id)],
      });

      await notifyModeratorDashboardReportReminder(interaction, {
        sanctionId: sanction.id,
        targetLabel: targetUser.tag,
      });
      return;
    }

    if (subcommand === 'softban') {
      const reason = interaction.options.getString('raison', true).trim();

      if (targetMember && !targetMember.bannable) {
        await replyError(interaction, 'Action impossible', 'Le bot ne peut pas bannir/softban ce membre. Vérifie la hiérarchie des rôles.');
        return;
      }

      // 1. Bannir le membre avec suppression des messages de 7 jours (604800 secondes)
      await interaction.guild.members.ban(targetUser.id, {
        deleteMessageSeconds: 7 * 24 * 60 * 60,
        reason: `${reason} | Softban par ${interaction.user.tag}`
      });

      // 2. Débannir le membre immédiatement
      await interaction.guild.members.unban(targetUser.id, `Softban (re-déban automatique) | Modération: ${interaction.user.tag}`);

      // 3. Enregistrer la sanction dans la BDD
      const sanction = await registerSoftbanSanction({
        guildId: interaction.guildId,
        target,
        moderator,
        reason,
        client: interaction.client,
      });

      await interaction.reply({
        embeds: [
          successEmbed('Softban exécuté', `${targetUser.tag} a été softban (banni puis débanni immédiatement).`).addFields(
            { name: 'Messages supprimés', value: '7 derniers jours', inline: true },
            { name: 'Raison', value: reason, inline: false },
            { name: 'ID sanction', value: sanction.id, inline: false }
          ),
        ],
        components: [buildMemberCaseActionRow(targetUser.id)],
      });

      await notifyModeratorDashboardReportReminder(interaction, {
        sanctionId: sanction.id,
        targetLabel: targetUser.tag,
      });
      return;
    }

    if (subcommand === 'tableau') {
      const reason = interaction.options.getString('raison', true).trim();
      const tableName = interaction.options.getString('nom', true).trim();
      const bypassLevel = interaction.options.getInteger('bypass');

      if (targetUser.bot) {
        await replyError(interaction, 'Action refusée', 'Impossible de sanctionner un bot.');
        return;
      }

      await interaction.deferReply();

      try {
        const result = await applyProgressiveSanction({
          guildId: interaction.guildId!,
          target,
          moderator,
          tableName,
          bypassLevel,
          reason,
          guild: interaction.guild!,
          member: targetMember,
          client: interaction.client,
        });

        const actionLabel = sanctionTypeLabel(result.action);
        const actionEmoji = sanctionTypeEmoji(result.action);
        const bypassText = bypassLevel ? ` (Tier T${bypassLevel} forcé via bypass)` : '';

        const embed = successEmbed(
          'Sanction progressive appliquée',
          `${targetUser} a reçu une sanction progressive via le tableau **${result.table.name}**.`
        ).addFields(
          { name: 'Sanction appliquée', value: `${actionEmoji} ${actionLabel}${bypassText}`, inline: true },
          { name: 'Palier atteint', value: `T${result.level}`, inline: true },
          { name: 'Raison', value: result.sanction.reason, inline: false },
          { name: 'ID sanction', value: result.sanction.id, inline: false }
        );

        await interaction.editReply({
          embeds: [embed],
          components: [buildMemberCaseActionRow(targetUser.id)],
        });

        await notifyModeratorDashboardReportReminder(interaction, {
          sanctionId: result.sanction.id,
          targetLabel: targetUser.tag,
        });
      } catch (err: unknown) {
        const embed = errorEmbed('Erreur de sanction progressive', err.message || "Impossible d'appliquer la sanction progressive.");
        await interaction.editReply({ embeds: [embed] });
      }
      return;
    }

    await interaction.reply({
      embeds: [infoEmbed('Sous-commande inconnue', "Cette sous-commande n'est pas encore supportée.")],
      flags: [MessageFlags.Ephemeral],
    });
  } catch (error) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', error instanceof Error ? error.message : 'Erreur inconnue')],
      flags: [MessageFlags.Ephemeral],
    });
  }
}

async function autocomplete(interaction: AutocompleteInteraction) {
  const focusedValue = interaction.options.getFocused().toLowerCase();
  const guildId = interaction.guildId!;

  try {
    await getOrCreateDefaultTables(guildId);

    const tables = await prisma.sanctionTable.findMany({
      where: {
        guildId,
        name: { contains: focusedValue, mode: 'insensitive' },
      },
      take: 25,
    });

    await interaction.respond(
      tables.map((table) => ({
        name: table.name,
        value: table.name,
      }))
    );
  } catch {
    await interaction.respond([]);
  }
}

export const sanctionCommand = { data, execute, autocomplete } satisfies SlashCommandDefinition;
export const sanctionContextCommand = { data: contextData, execute } satisfies ContextCommandDefinition;
