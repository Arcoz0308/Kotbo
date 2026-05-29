/**
 * Service de modération automatique des pseudos Discord.
 * Délègue la détection des mots bannis à bannedWordsService (service générique partagé).
 */

import { EmbedBuilder, PermissionFlagsBits, type Guild } from 'discord.js';
import { containsBannedWord, INVISIBLE_ONLY_REGEX, loadBannedWords } from './bannedWordsService.js';
import { logger } from '../utils/logger.js';

export { loadBannedWords, invalidateBannedWordsCache } from './bannedWordsService.js';

/** Pseudo de remplacement appliqué automatiquement. */
export const SAFE_NICKNAME = 'pseudo non conforme | automod';

/**
 * Vérifie si un pseudo est non conforme.
 *
 * @param name  Le pseudo brut (nickname, globalName ou username) à analyser.
 * @param words Liste de mots bannis chargée via `loadBannedWords(guildId)`.
 * @returns `true` si le pseudo doit être remplacé.
 */
export function isNicknameProblematic(
  name: string,
  words: string[],
  options?: {
    whitelist?: string[];
    userId?: string;
    bypassUserIds?: string[];
  }
): boolean {
  if (!name || name.trim().length === 0) return true;
  if (INVISIBLE_ONLY_REGEX.test(name)) return true;

  const normalized = name.toLowerCase().trim();

  // Protection anti-boucle : Ignorer notre propre pseudo de remplacement ou tout ce qui s'y apparente (contient "automod" ou "pseudo non conforme")
  if (normalized.includes('automod') || normalized.includes('pseudo non conforme')) {
    return false;
  }

  // Membre exempté (Bypass par ID utilisateur)
  if (options?.userId && options.bypassUserIds?.includes(options.userId)) {
    return false;
  }

  // Pseudo sur la whitelist du serveur (comparaison exacte insensible à la casse)
  if (options?.whitelist) {
    const isWhitelisted = options.whitelist.some(
      (w) => typeof w === 'string' && w.trim().toLowerCase() === normalized
    );
    if (isWhitelisted) return false;
  }

  return containsBannedWord(name, words);
}

/**
 * Retourne une raison de renommage lisible pour les logs Discord.
 */
export function buildRenameReason(originalName: string): string {
  return `Automod: pseudo non conforme — original: "${originalName}"`;
}

// ---------------------------------------------------------------------------
// Résultat du scan massif
// ---------------------------------------------------------------------------

export type PseudoScanResult = {
  scannedCount: number;
  renamedCount: number;
  skippedCount: number;  // bots, owner, sans permission
  errorCount: number;
  renamed: Array<{ userId: string; original: string }>;
};

/**
 * Scanne TOUS les membres du serveur et renomme ceux dont le pseudo est non conforme.
 * Envoie un log dans le channel de logs du serveur pour chaque renommage.
 *
 * @param guild  Le serveur Discord à scanner.
 * @returns Un résumé du scan.
 */
export async function scanAndModeratePseudos(guild: Guild): Promise<PseudoScanResult> {
  const { default: prisma } = await import('../utils/db.js');

  const result: PseudoScanResult = {
    scannedCount: 0,
    renamedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    renamed: [],
  };

  // Vérification des permissions du bot
  const botMember = await guild.members.fetchMe().catch(() => null);
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageNicknames)) {
    logger.warn('NicknameRescan', `Pas la permission ManageNicknames sur "${guild.name}"`);
    return result;
  }

  // Charger les mots bannis une seule fois pour tout le scan
  const bannedWords = await loadBannedWords(guild.id);

  // Charger le channel de logs et la configuration de la whitelist/bypass
  const guildData = await prisma.guild.findUnique({
    where: { id: guild.id },
    select: {
      logChannelId: true,
      nicknameModerationWhitelist: true,
      nicknameModerationBypass: true,
    },
  }).catch(() => null);

  const logChannel = guildData?.logChannelId
    ? guild.channels.cache.get(guildData.logChannelId)
    : null;

  // Récupérer tous les membres
  const members = await guild.members.fetch().catch(() => null);
  if (!members) return result;

  const whitelist = guildData?.nicknameModerationWhitelist ?? [];
  const bypass = guildData?.nicknameModerationBypass ?? [];

  for (const [, member] of members) {
    if (member.user.bot) { result.skippedCount++; continue; }
    if (guild.ownerId === member.id) { result.skippedCount++; continue; }

    result.scannedCount++;

    const effectiveName = member.nickname ?? member.user.globalName ?? member.user.username;
    if (!effectiveName) { result.skippedCount++; continue; }

    // Déjà au pseudo de sécurité → skip
    if (effectiveName === SAFE_NICKNAME) continue;

    if (!isNicknameProblematic(effectiveName, bannedWords, { whitelist, userId: member.id, bypassUserIds: bypass })) continue;

    try {
      await member.setNickname(SAFE_NICKNAME, buildRenameReason(effectiveName));
      result.renamedCount++;
      result.renamed.push({ userId: member.id, original: effectiveName });

      logger.warn(
        'NicknameRescan',
        `Pseudo renommé: ${member.user.tag} — "${effectiveName}" → "${SAFE_NICKNAME}"`,
      );

      // Log embed dans le channel de logs
      if (logChannel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor(0xf4a261)
          .setTitle('Pseudo non conforme | Rescan')
          .addFields(
            { name: 'Membre', value: `<@${member.id}> \`${member.user.tag}\``, inline: false },
            { name: 'Pseudo original', value: `\`${effectiveName}\``, inline: true },
            { name: 'Pseudo appliqué', value: `\`${SAFE_NICKNAME}\``, inline: true },
          )
          .setThumbnail(member.displayAvatarURL())
          .setFooter({ text: 'Automod | Rescan des pseudos' })
          .setTimestamp();

        await logChannel.send({ embeds: [embed] }).catch(() => null);
      }

      // Audit dashboard
      await prisma.dashboardAuditLog.create({
        data: {
          guildId: guild.id,
          channelId: guildData?.logChannelId ?? null,
          user: 'Automod (Rescan)',
          action: 'Renommage automatique de pseudo (rescan)',
          context: guild.name,
          module: 'Modération des pseudos',
          eventType: 'Manuel',
          details: `Pseudo "${effectiveName}" remplacé par "${SAFE_NICKNAME}" pour ${member.user.tag}`,
          dateIso: new Date(),
        },
      }).catch(() => null);
    } catch (error) {
      result.errorCount++;
      logger.error('NicknameRescan', `Impossible de renommer ${member.user.tag}:`, error);
    }
  }

  return result;
}
