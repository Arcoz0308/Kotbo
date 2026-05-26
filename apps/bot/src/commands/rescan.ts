import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import prisma from '../utils/db.js';
import { infoEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';
import { scanGuildMembersForYoungAccounts } from '../services/dcDetectionService.js';
import { scanAndModeratePseudos } from '../services/nicknameModerationService.js';

export const data = new SlashCommandBuilder()
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

export async function execute(interaction: ChatInputCommandInteraction) {
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
}
