import type { SlashCommandDefinition } from '../../commands.js';
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import prisma from '../../utils/db.js';
import { infoEmbed, successEmbed, errorEmbed } from '../../utils/embeds.js';
import { scanGuildMembersForYoungAccounts } from '../../services/moderation/dcDetectionService.js';
import { scanAndModeratePseudos } from '../../services/moderation/nicknameModerationService.js';

const data = new SlashCommandBuilder()
  .setName('rescan')
  .setDescription('Scanner les membres du serveur.')
  // ──────────────────────────────────────────────────────────────────────────
  // Sous-groupe : dc (comptes récents)
  // ──────────────────────────────────────────────────────────────────────────
  .addSubcommandGroup((group) =>
    group
      .setName('dc')
      .setDescription('Scanner les comptes Discord récents.')
      .addSubcommand((sub) =>
        sub
          .setName('scan')
          .setDescription('Signaler les membres dont le compte est trop récent à l\'arrivée.')
          .addIntegerOption((opt) =>
            opt
              .setName('seuil_jours')
              .setDescription('Nombre de jours maximum entre création du compte et arrivée')
              .setMinValue(1)
              .setMaxValue(30)
              .setRequired(false)
          )
      )
  )
  // ──────────────────────────────────────────────────────────────────────────
  // Sous-groupe : pseudo (modération des pseudos)
  // ──────────────────────────────────────────────────────────────────────────
  .addSubcommandGroup((group) =>
    group
      .setName('pseudo')
      .setDescription('Modération des pseudos.')
      .addSubcommand((sub) =>
        sub
          .setName('rescan')
          .setDescription('Scanner et modérer tous les pseudos non conformes du serveur.')
      )
  )
  // ──────────────────────────────────────────────────────────────────────────
  // Sous-groupe : stats (reconstruction des statistiques)
  // ──────────────────────────────────────────────────────────────────────────
  .addSubcommandGroup((group) =>
    group
      .setName('stats')
      .setDescription('Reconstruire ou lancer les statistiques historiques.')
      .addSubcommand((sub) =>
        sub
          .setName('rescan')
          .setDescription('Scrapper l\'historique des messages pour initialiser les statistiques.')
          .addBooleanOption((opt) =>
            opt
              .setName('forcer')
              .setDescription('Forcer le re-scrap complet de tous les salons (recommencer à zéro)')
              .setRequired(false)
          )
      )
  );

// ---------------------------------------------------------------------------
// Vérification des permissions
// ---------------------------------------------------------------------------

async function canUseModerationTools(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const guild = interaction.guild;
  if (!guild || !interaction.guildId) return false;

  const isStaffDb = await prisma.staffMember.findUnique({
    where: { guildId_userId: { guildId: guild.id, userId: interaction.user.id } },
  });
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) || false;

  return isAdmin || !!isStaffDb || (interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) ?? false);
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

async function execute(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild || !interaction.guildId) {
    return interaction.reply({
      content: '❌ Cette commande doit être utilisée dans un serveur.',
      flags: [MessageFlags.Ephemeral],
    });
  }

  if (!(await canUseModerationTools(interaction))) {
    return interaction.reply({
      content: '❌ Tu n\'as pas les permissions nécessaires pour lancer ce scan.',
      flags: [MessageFlags.Ephemeral],
    });
  }

  const group = interaction.options.getSubcommandGroup();
  const sub = interaction.options.getSubcommand();

  // ──────────────────────────────────────────────────────────────────────────
  // /rescan dc scan
  // ──────────────────────────────────────────────────────────────────────────
  if (group === 'dc' && sub === 'scan') {
    const thresholdDays = interaction.options.getInteger('seuil_jours') ?? 3;
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const result = await scanGuildMembersForYoungAccounts(guild, thresholdMs);
    const preview = result.matches
      .slice(0, 10)
      .map((m) => `• <@${m.userId}> — compte créé ${m.accountAgeLabel} avant l'arrivée`)
      .join('\n');

    const summaryLines = [
      `Membres analysés : **${result.scannedCount}**`,
      `Membres signalés : **${result.flaggedCount}**`,
      `Seuil : **${thresholdDays} jour${thresholdDays > 1 ? 's' : ''}**`,
    ];

    if (result.flaggedCount > 0) {
      summaryLines.push('');
      summaryLines.push('Premiers signalements :');
      summaryLines.push(preview);
      if (result.matches.length > 10) {
        summaryLines.push(`… et ${result.matches.length - 10} autre(s).`);
      }
    }

    return interaction.editReply({
      embeds: [infoEmbed('Scan DC terminé', summaryLines.join('\n'))],
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // /rescan pseudo rescan
  // ──────────────────────────────────────────────────────────────────────────
  if (group === 'pseudo' && sub === 'rescan') {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const result = await scanAndModeratePseudos(guild);

    const summaryLines = [
      `Membres analysés : **${result.scannedCount}**`,
      `Pseudos modérés  : **${result.renamedCount}**`,
      `Ignorés (bots, owner…) : **${result.skippedCount}**`,
    ];

    if (result.errorCount > 0) {
      summaryLines.push(`⚠️ Erreurs : **${result.errorCount}**`);
    }

    if (result.renamedCount > 0) {
      summaryLines.push('');
      summaryLines.push('Pseudos modérés :');
      const preview = result.renamed
        .slice(0, 10)
        .map((r) => `• <@${r.userId}> — \`${r.original}\``)
        .join('\n');
      summaryLines.push(preview);
      if (result.renamed.length > 10) {
        summaryLines.push(`… et ${result.renamed.length - 10} autre(s).`);
      }
    }

    const embed =
      result.renamedCount > 0
        ? successEmbed('Rescan des pseudos terminé', summaryLines.join('\n'))
        : infoEmbed('Rescan des pseudos terminé', summaryLines.join('\n'));

    return interaction.editReply({ embeds: [embed] });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // /rescan stats rescan
  // ──────────────────────────────────────────────────────────────────────────
  if (group === 'stats' && sub === 'rescan') {
    const force = interaction.options.getBoolean('forcer') ?? false;

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      const { startHistoricalScraping } = await import('../../services/analytics/messageScraperService.js');
      await startHistoricalScraping(interaction.client, guild.id, force);

      return interaction.editReply({
        embeds: [
          successEmbed(
            'Scan des Statistiques Lancé',
            `Le scraping historique des messages a été démarré avec succès en arrière-plan.\n\n` +
            `• **Mode forcé :** ${force ? 'Oui (recommencer à zéro)' : 'Non'}\n` +
            `• Vous pouvez suivre l'avancement dans les logs ou via le statut en base de données.`
          ),
        ],
      });
    } catch (err) {
      console.error('Error starting historical scraping:', err);
      return interaction.editReply({
        embeds: [
          errorEmbed(
            'Erreur',
            `Impossible de démarrer le scraping : ${err instanceof Error ? err.message : String(err)}`
          ),
        ],
      });
    }
  }
}

export const rescanCommand = { data, execute } satisfies SlashCommandDefinition;
