import { EmbedBuilder, Events, PermissionFlagsBits, type Client, type GuildMember } from 'discord.js';
import { isNicknameProblematic, SAFE_NICKNAME, buildRenameReason, loadBannedWords } from '../services/moderation/nicknameModerationService.js';
import { invalidateBannedWordsCache, loadGlobalWords, loadCustomWords } from '../services/moderation/bannedWordsService.js';
import { logger } from '../utils/logger.js';

import { getCachedGuild, cache } from '../utils/cache.js';

// ---------------------------------------------------------------------------
// Cache du statut d'activation par serveur (TTL 60s)
// ---------------------------------------------------------------------------

type NicknameModConfig = {
  enabled: boolean;
  whitelist: string[];
  bypass: string[];
  onJoin: boolean;
  onUpdate: boolean;
  checkInvisible: boolean;
  checkGlobal: boolean;
  checkCustom: boolean;
};

/**
 * Invalide uniquement le cache de configuration de modération de pseudos.
 * Pour les mots bannis, utiliser invalidateBannedWordsCache depuis bannedWordsService.
 */
export function invalidateNicknameModerationCache(guildId?: string): void {
  if (guildId) {
    cache.invalidateGuild(guildId);
    invalidateBannedWordsCache(guildId);
    return;
  }
  invalidateBannedWordsCache();
}

// Re-export pour les usages existants dans dashboardApi.ts
export { invalidateBannedWordsCache };

async function getNicknameModerationConfig(guildId: string): Promise<NicknameModConfig> {
  const guild = await getCachedGuild(guildId);

  return {
    enabled: guild?.autoNicknameModerationEnabled ?? false,
    whitelist: guild?.nicknameModerationWhitelist ?? [],
    bypass: guild?.nicknameModerationBypass ?? [],
    onJoin: guild?.nickModOnJoin ?? true,
    onUpdate: guild?.nickModOnUpdate ?? true,
    checkInvisible: guild?.nickModCheckInvisible ?? true,
    checkGlobal: guild?.nickModCheckGlobal ?? true,
    checkCustom: guild?.nickModCheckCustom ?? true,
  };
}

// ---------------------------------------------------------------------------
// Logique principale de vérification + renommage
// ---------------------------------------------------------------------------

async function checkAndRename(member: GuildMember): Promise<void> {
  if (member.user.bot) return;

  const guildId = member.guild.id;
  const config = await getNicknameModerationConfig(guildId);
  if (!config.enabled) return;

  // Vérification des permissions du bot
  const botMember = member.guild.members.me ?? await member.guild.members.fetchMe().catch(() => null);
  if (!botMember) return;
  if (!botMember.permissions.has(PermissionFlagsBits.ManageNicknames)) return;

  // Le bot ne peut pas renommer le propriétaire du serveur ou des membres avec des rôles supérieurs ou égaux au sien
  if (member.guild.ownerId === member.id) return;
  if (botMember.roles.highest.comparePositionTo(member.roles.highest) <= 0) return;

  // Pseudo effectif : nickname > globalName > username
  const effectiveName = member.nickname ?? member.user.globalName ?? member.user.username;
  if (!effectiveName) return;

  if (effectiveName.toLowerCase().trim() === SAFE_NICKNAME.toLowerCase().trim()) return;

  // Chargement des mots bannis selon les toggles actifs
  let bannedWords: string[] = [];
  if (config.checkGlobal && config.checkCustom) {
    bannedWords = await loadBannedWords(guildId);
  } else if (config.checkGlobal) {
    bannedWords = await loadGlobalWords();
  } else if (config.checkCustom) {
    bannedWords = await loadCustomWords(guildId);
  }

  if (
    !isNicknameProblematic(effectiveName, bannedWords, {
      whitelist: config.whitelist,
      userId: member.id,
      bypassUserIds: config.bypass,
      checkInvisible: config.checkInvisible,
    })
  ) {
    return;
  }

  try {
    await member.setNickname(SAFE_NICKNAME, buildRenameReason(effectiveName));

    logger.warn(
      'NicknameAutomod',
      `Pseudo renommé pour ${member.user.tag} dans "${member.guild.name}": "${effectiveName}" → "${SAFE_NICKNAME}"`,
    );

    // Log dans le channel de logs du serveur
    const { default: prisma } = await import('../utils/db.js');
    const guildData = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { logChannelId: true },
    });

    if (guildData?.logChannelId) {
      const logChannel = member.guild.channels.cache.get(guildData.logChannelId);
      if (logChannel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor(0xf4a261)
          .setTitle('Pseudo non conforme | Automod')
          .addFields(
            { name: 'Membre', value: `<@${member.id}> \`${member.user.tag}\``, inline: false },
            { name: 'Pseudo original', value: `\`${effectiveName}\``, inline: true },
            { name: 'Pseudo appliqué', value: `\`${SAFE_NICKNAME}\``, inline: true },
          )
          .setThumbnail(member.displayAvatarURL())
          .setFooter({ text: 'Automod | Modération des pseudos' })
          .setTimestamp();

        await logChannel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
      }
    }

    // Audit dashboard
    await prisma.dashboardAuditLog.create({
      data: {
        guildId,
        channelId: guildData?.logChannelId ?? null,
        user: 'Automod',
        action: 'Renommage automatique de pseudo',
        context: member.guild.name,
        module: 'Modération des pseudos',
        eventType: 'Automatique',
        details: `Pseudo "${effectiveName}" remplacé par "${SAFE_NICKNAME}" pour ${member.user.tag}`,
        dateIso: new Date(),
      },
    }).catch(() => null);
  } catch (error) {
    logger.error('NicknameAutomod', `Impossible de renommer ${member.user.tag}:`, error);
  }
}

// ---------------------------------------------------------------------------
// Enregistrement des listeners
// ---------------------------------------------------------------------------

export function registerNicknameModerationListener(client: Client): void {
  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      const config = await getNicknameModerationConfig(member.guild.id);
      if (!config.enabled || !config.onJoin) return;
      await checkAndRename(member);
    } catch (err) {
      logger.error('NicknameAutomod', 'Erreur GuildMemberAdd:', err);
    }
  });

  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    if (oldMember.partial || newMember.partial) return;

    const oldName = oldMember.nickname ?? oldMember.user.globalName ?? oldMember.user.username;
    const newName = newMember.nickname ?? newMember.user.globalName ?? newMember.user.username;

    if (oldName === newName) return;
    if (newName.toLowerCase().trim() === SAFE_NICKNAME.toLowerCase().trim()) return;

    try {
      const config = await getNicknameModerationConfig(newMember.guild.id);
      if (!config.enabled || !config.onUpdate) return;
      await checkAndRename(newMember);
    } catch (err) {
      logger.error('NicknameAutomod', 'Erreur GuildMemberUpdate:', err);
    }
  });

  logger.success('NicknameAutomod', 'Listener de modération des pseudos enregistré.');
}
