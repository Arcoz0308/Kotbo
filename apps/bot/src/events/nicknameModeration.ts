import { EmbedBuilder, Events, PermissionFlagsBits, type Client, type GuildMember } from 'discord.js';
import { isNicknameProblematic, SAFE_NICKNAME, buildRenameReason, loadBannedWords } from '../services/nicknameModerationService.js';
import { invalidateBannedWordsCache } from '../services/bannedWordsService.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Cache du statut d'activation par serveur (TTL 60s)
// ---------------------------------------------------------------------------

type NicknameModConfig = {
  enabled: boolean;
  whitelist: string[];
  bypass: string[];
};

type ConfigCacheEntry = {
  config: NicknameModConfig;
  expiresAt: number;
};

const configCache = new Map<string, ConfigCacheEntry>();
const CACHE_TTL_MS = 60_000;

/**
 * Invalide uniquement le cache de configuration de modération de pseudos.
 * Pour les mots bannis, utiliser invalidateBannedWordsCache depuis bannedWordsService.
 */
export function invalidateNicknameModerationCache(guildId?: string): void {
  if (guildId) {
    configCache.delete(guildId);
    invalidateBannedWordsCache(guildId);
    return;
  }
  configCache.clear();
  invalidateBannedWordsCache();
}

// Re-export pour les usages existants dans dashboardApi.ts
export { invalidateBannedWordsCache };

async function getNicknameModerationConfig(guildId: string): Promise<NicknameModConfig> {
  const cached = configCache.get(guildId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.config;

  const { default: prisma } = await import('../utils/db.js');
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: {
      autoNicknameModerationEnabled: true,
      nicknameModerationWhitelist: true,
      nicknameModerationBypass: true,
    },
  });

  const config = {
    enabled: guild?.autoNicknameModerationEnabled ?? false,
    whitelist: guild?.nicknameModerationWhitelist ?? [],
    bypass: guild?.nicknameModerationBypass ?? [],
  };

  configCache.set(guildId, { config, expiresAt: now + CACHE_TTL_MS });
  return config;
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
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageNicknames)) return;

  // Le bot ne peut pas renommer le propriétaire du serveur
  if (member.guild.ownerId === member.id) return;

  // Pseudo effectif : nickname > globalName > username
  const effectiveName = member.nickname ?? member.user.globalName ?? member.user.username;
  if (!effectiveName) return;

  if (effectiveName.toLowerCase().trim() === SAFE_NICKNAME.toLowerCase().trim()) return;

  // Chargement des mots bannis depuis le service générique (global + serveur)
  const bannedWords = await loadBannedWords(guildId);

  if (
    !isNicknameProblematic(effectiveName, bannedWords, {
      whitelist: config.whitelist,
      userId: member.id,
      bypassUserIds: config.bypass,
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

        await logChannel.send({ embeds: [embed] }).catch(() => null);
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
    await checkAndRename(member).catch((err) => {
      logger.error('NicknameAutomod', 'Erreur GuildMemberAdd:', err);
    });
  });

  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    if (oldMember.partial || newMember.partial) return;

    const oldName = oldMember.nickname ?? oldMember.user.globalName ?? oldMember.user.username;
    const newName = newMember.nickname ?? newMember.user.globalName ?? newMember.user.username;

    if (oldName === newName) return;
    if (newName.toLowerCase().trim() === SAFE_NICKNAME.toLowerCase().trim()) return;

    await checkAndRename(newMember).catch((err) => {
      logger.error('NicknameAutomod', 'Erreur GuildMemberUpdate:', err);
    });
  });

  logger.success('NicknameAutomod', 'Listener de modération des pseudos enregistré.');
}
