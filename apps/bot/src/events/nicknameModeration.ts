import { EmbedBuilder, Events, PermissionFlagsBits, type Client, type GuildMember } from 'discord.js';
import { isNicknameProblematic, SAFE_NICKNAME, buildRenameReason } from '../services/nicknameModerationService.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Cache du statut d'activation par serveur (TTL 60s, même pattern que codePolice)
// ---------------------------------------------------------------------------

type GuildNicknameModerationConfig = {
  enabled: boolean;
  customWords: string[];
  expiresAt: number;
};

const configCache = new Map<string, GuildNicknameModerationConfig>();
const CACHE_TTL_MS = 60_000;

export function invalidateNicknameModerationCache(guildId?: string): void {
  if (guildId) {
    configCache.delete(guildId);
    return;
  }
  configCache.clear();
}

async function getNicknameModerationConfig(guildId: string): Promise<{ enabled: boolean; customWords: string[] }> {
  const cached = configCache.get(guildId);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return { enabled: cached.enabled, customWords: cached.customWords };
  }

  const { default: prisma } = await import('../utils/db.js');
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: {
      autoNicknameModerationEnabled: true,
      autoNicknameModerationWords: true,
    },
  });

  const enabled = guild?.autoNicknameModerationEnabled ?? false;
  const customWords = guild?.autoNicknameModerationWords ?? [];

  configCache.set(guildId, { enabled, customWords, expiresAt: now + CACHE_TTL_MS });
  return { enabled, customWords };
}

// ---------------------------------------------------------------------------
// Logique principale de vérification + renommage
// ---------------------------------------------------------------------------

async function checkAndRename(member: GuildMember): Promise<void> {
  if (member.user.bot) return;

  const guildId = member.guild.id;
  const { enabled, customWords } = await getNicknameModerationConfig(guildId);
  if (!enabled) return;

  // Vérification des permissions du bot
  const botMember = await member.guild.members.fetchMe().catch(() => null);
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageNicknames)) return;

  // Le bot ne peut pas renommer le propriétaire du serveur
  if (member.guild.ownerId === member.id) return;

  // Pseudo effectif : nickname > globalName > username
  const effectiveName = member.nickname ?? member.user.globalName ?? member.user.username;
  if (!effectiveName) return;

  if (!isNicknameProblematic(effectiveName, customWords)) return;

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

export function registerNicknameModerationListener(client: Client): void {
  // Nouveau membre qui rejoint
  client.on(Events.GuildMemberAdd, async (member) => {
    await checkAndRename(member).catch((err) => {
      logger.error('NicknameAutomod', 'Erreur GuildMemberAdd:', err);
    });
  });

  // Membre qui change son pseudo (ou dont le pseudo global change)
  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    if (oldMember.partial || newMember.partial) return;

    const oldName = oldMember.nickname ?? oldMember.user.globalName ?? oldMember.user.username;
    const newName = newMember.nickname ?? newMember.user.globalName ?? newMember.user.username;

    // Ne rien faire si le pseudo n'a pas changé
    if (oldName === newName) return;

    // Éviter une boucle infinie si le bot vient de poser le pseudo safe
    if (newName === SAFE_NICKNAME) return;

    await checkAndRename(newMember).catch((err) => {
      logger.error('NicknameAutomod', 'Erreur GuildMemberUpdate:', err);
    });
  });

  logger.success('NicknameAutomod', 'Listener de modération des pseudos enregistré.');
}
