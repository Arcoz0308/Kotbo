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
  type ChatInputCommandInteraction,
  type User,
} from 'discord.js';
import { SanctionStatus, SanctionType } from '@prisma/client';
import { errorEmbed, infoEmbed, successEmbed } from '../utils/embeds.js';
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
  runGuildBan,
} from '../services/sanctionService.js';

const DURATION_HELP = 'Exemples: 30m, 2h, 3j, 1 semaine';
const SANCTION_PAGE_SIZE = 5;
const SANCTION_LIST_TIMEOUT_MS = 2 * 60 * 1000;

export const data = new SlashCommandBuilder()
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
      .setName('list')
      .setDescription('Affiche la liste des sanctions d\'un membre')
      .addUserOption((option) => option.setName('membre').setDescription('Membre à afficher').setRequired(true)),
  );

function canModerate(interaction: ChatInputCommandInteraction): interaction is ChatInputCommandInteraction<'cached'> {
  if (!interaction.inCachedGuild()) return false;
  const me = interaction.guild.members.me;
  return Boolean(me);
}

async function fetchTargetMember(interaction: ChatInputCommandInteraction<'cached'>, targetUser: User) {
  return interaction.guild.members.fetch(targetUser.id).catch(() => null);
}

function validateTarget(interaction: ChatInputCommandInteraction<'cached'>, member: GuildMember | null, targetUser: User, action: string): string | null {
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
  const [listResult, typeBreakdown] = await Promise.all([
    listSanctionsByMember({ guildId, targetUserId, page: pageIndex, pageSize: SANCTION_PAGE_SIZE }),
    getSanctionTypeBreakdown(guildId, targetUserId),
  ]);

  const total = listResult.total;
  const totalPages = Math.max(1, Math.ceil(total / SANCTION_PAGE_SIZE));
  const safePageIndex = Math.min(Math.max(0, pageIndex), totalPages - 1);

  const finalList = safePageIndex === pageIndex
    ? listResult
    : await listSanctionsByMember({ guildId, targetUserId, page: safePageIndex, pageSize: SANCTION_PAGE_SIZE });

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

  return { embed, row, pageIndex: safePageIndex, totalPages };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!canModerate(interaction)) {
    await replyError(interaction, 'Serveur requis', 'Cette commande ne peut être utilisée qu\'en serveur.');
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
        components: [view.row],
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

        await buttonInteraction.update({ embeds: [nextView.embed], components: [nextView.row] });
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
          await interaction.editReply({ embeds: [expiredView.embed], components: [disabledRow] });
        } catch {
          // Message possiblement supprimé ou interaction expirée.
        }
      });

      return;
    }

    if (subcommand === 'warn') {
      const reason = interaction.options.getString('raison', true).trim();

      await registerWarnSanction({ guildId: interaction.guildId, target, moderator, reason });
      const warnCount = await countWarns(interaction.guildId, targetUser.id);

      await interaction.reply({
        embeds: [
          successEmbed('Warn enregistré', `${targetUser} a reçu un avertissement.`).addFields(
            { name: 'Raison', value: reason },
            { name: 'Nombre total de warns', value: `${warnCount}`, inline: true },
          ),
        ],
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
      await registerKickSanction({ guildId: interaction.guildId, target, moderator, reason });

      await interaction.reply({
        embeds: [successEmbed('Kick exécuté', `${targetUser.tag} a été exclu du serveur.`).addFields({ name: 'Raison', value: reason })],
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
      await registerBanSanction({ guildId: interaction.guildId, target, moderator, reason });

      await interaction.reply({
        embeds: [successEmbed('Ban exécuté', `${targetUser.tag} a été banni définitivement.`).addFields({ name: 'Raison', value: reason })],
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
      });

      await interaction.reply({
        embeds: [
          successEmbed('Tempban exécuté', `${targetUser.tag} a été banni temporairement.`).addFields(
            { name: 'Durée', value: formatDurationFr(durationMs), inline: true },
            { name: 'Raison', value: reason, inline: false },
            { name: 'Déban auto', value: `<t:${Math.floor((sanction.expiresAt?.getTime() ?? Date.now()) / 1000)}:F>`, inline: false },
          ),
        ],
      });
      return;
    }

    await interaction.reply({
      embeds: [infoEmbed('Sous-commande inconnue', 'Cette sous-commande n\'est pas encore supportée.')],
      flags: [MessageFlags.Ephemeral],
    });
  } catch (error) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', error instanceof Error ? error.message : 'Erreur inconnue')],
      flags: [MessageFlags.Ephemeral],
    });
  }
}
