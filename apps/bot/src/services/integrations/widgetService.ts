import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { getStaffMember } from '../staff/staffManagementService.js';
import { getLevelFromXp } from '../progression/levelingService.js';
import { getClient } from '../../utils/client.js';

const TAG = 'Widget';
const API = 'https://discord.com/api/v9';

const ICON_MSG = 'https://cdn.discordapp.com/emojis/1519265291849170994.png';
const ICON_VOICE = 'https://cdn.discordapp.com/emojis/1519265313911345234.png';
const ICON_LEVEL = 'https://cdn.discordapp.com/emojis/1519265285251792927.png';
const ICON_SHIELD = 'https://cdn.discordapp.com/emojis/1519265302968406096.png';

interface DynamicField {
  type: 1 | 2 | 3;
  name: string;
  value: string | number | { url: string };
}

interface WidgetPayload {
  username: string;
  data: { dynamic: DynamicField[] };
}

interface DiscordApiError {
  code?: number;
  message?: string;
}

function getWidgetProfileUrl(appId: string, userId: string, identityId: string): string {
  return `${API}/applications/${appId}/users/${userId}/identities/${encodeURIComponent(identityId)}/profile`;
}

function formatGrade(grade: string): string {
  const grades: Record<string, string> = {
    HELPER: 'Helper',
    MODERATOR: 'Modérateur',
    ADMIN: 'Admin',
    OWNER: 'Propriétaire',
  };
  return grades[grade] ?? grade;
}

async function buildWidgetPayload(guildId: string, userId: string): Promise<WidgetPayload | null> {
  const client = getClient();
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return null;

  const [staffMember, memberProfile, memberLevel] = await Promise.all([
    getStaffMember(guildId, userId),
    prisma.memberProfile.findFirst({ where: { guildId, userId } }),
    prisma.memberLevel.findFirst({ where: { guildId, userId } }),
  ]);

  if (!staffMember) return null;

  const level = memberLevel ? getLevelFromXp(memberLevel.xp) : 0;
  const messageCount = memberProfile?.messageCount ?? 0;
  const voiceSeconds = memberProfile?.voiceTimeSeconds ?? 0;
  const memberCount = guild.memberCount;
  const guildName = guild.name;
  const guildIconUrl = guild.iconURL({ size: 256 }) ?? '';
  const username = guild.members.cache.get(userId)?.user.username ?? memberProfile?.username ?? userId;

  const staffSince = staffMember.joinedStaffAt
    ? staffMember.joinedStaffAt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

  const staffActivities = await prisma.staffActivity.findMany({
    where: { guildId, staffUserId: staffMember.id },
    orderBy: { activityDate: 'desc' },
    take: 30,
  });
  const staffScore = staffActivities.length > 0
    ? Math.min(100, Math.round(staffActivities.reduce((s, a) => s + a.messageCount + a.voiceMinutes, 0) / staffActivities.length))
    : 0;

  const voiceMinutes = Math.floor(voiceSeconds / 60);

  const inviteImageUrl = guild.splashURL({ size: 256 }) ?? guild.bannerURL({ size: 256 }) ?? guildIconUrl;
  let inviteUrl = '';
  if (guild.vanityURLCode) {
    inviteUrl = `discord.gg/${guild.vanityURLCode}`;
  } else {
    const invites = await guild.invites.fetch().catch(() => null);
    const permanent = invites?.find(i => i.maxAge === 0);
    if (permanent) inviteUrl = `discord.gg/${permanent.code}`;
  }

  const dynamic: DynamicField[] = [
    { type: 3, name: 'serveur.logo', value: { url: guildIconUrl } },
    { type: 1, name: 'user.staffRank', value: formatGrade(staffMember.grade) },
    { type: 1, name: 'server.name', value: guildName },
    { type: 1, name: 'serveur.membersCount', value: memberCount.toLocaleString('fr-FR') },
    { type: 1, name: 'user.staffSinceTo', value: staffSince },
    { type: 3, name: 'user.statMessage.image', value: { url: ICON_MSG } },
    { type: 1, name: 'user.statMessage.title', value: 'Message count :' },
    { type: 1, name: 'user.statMessage.description', value: messageCount.toLocaleString('fr-FR') },
    { type: 3, name: 'user.statVocal.image', value: { url: ICON_VOICE } },
    { type: 1, name: 'user.statVocal.title', value: 'Vocal Count :' },
    { type: 1, name: 'user.statVocal.description', value: `${voiceMinutes.toLocaleString('fr-FR')} min` },
    { type: 3, name: 'user.level.image', value: { url: ICON_LEVEL } },
    { type: 1, name: 'user.level.title', value: 'Level :' },
    { type: 1, name: 'user.level.description', value: `${level} lvl` },
    { type: 3, name: 'user.statStaffScore.image', value: { url: ICON_SHIELD } },
    { type: 1, name: 'user.statStaffScore.title', value: 'Staff Score :' },
    { type: 1, name: 'user.statStaffScore.description', value: `${staffScore} points` },
    { type: 1, name: 'user.staffRankHero', value: formatGrade(staffMember.grade) },
    { type: 1, name: 'serveur.name', value: guildName },
    { type: 3, name: 'server.images.invite', value: { url: inviteImageUrl } },
    { type: 1, name: 'server.invite.name', value: guildName },
    { type: 1, name: 'server.invite.description', value: inviteUrl },
  ];

  return { username, data: { dynamic } };
}

export async function pushWidgetForUser(guildId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const payload = await buildWidgetPayload(guildId, userId);
  if (!payload) {
    return { ok: false, error: 'Membre staff introuvable ou serveur inaccessible' };
  }

  const botToken = process.env.DISCORD_TOKEN;
  const appId = process.env.DISCORD_CLIENT_ID;
  if (!botToken || !appId) {
    return { ok: false, error: 'DISCORD_TOKEN ou DISCORD_CLIENT_ID manquant' };
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bot ${botToken}`,
    'User-Agent': 'DiscordBot (https://kotbo.fr, 1.0.0)',
  };

  try {
    // The identity is an external-account identifier and must be unique per
    // Discord user. The former constant "0" made the first user claim the
    // identity and caused every subsequent user to receive Discord error 40106.
    // Keep "0" only as a compatibility fallback for that first legacy user.
    const identityIds = [userId, '0'];
    for (const [index, identityId] of identityIds.entries()) {
      const res = await fetch(getWidgetProfileUrl(appId, userId, identityId), {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        logger.info(TAG, `Widget mis à jour pour ${userId} sur ${guildId} (identité ${identityId})`);
        return { ok: true };
      }

      const body = await res.text();
      let parsed: DiscordApiError = {};
      try { parsed = JSON.parse(body); } catch { /* Preserve the raw Discord response below. */ }

      if (parsed.code === 40113 && index === 0) {
        logger.info(TAG, `Identité unique indisponible pour ${userId}; tentative avec l'identité legacy 0`);
        continue;
      }

      if (parsed.code === 40106) {
        logger.warn(TAG, `Conflit d'identité Discord 40106 pour ${userId} sur ${guildId}: ${body}`);
        return {
          ok: false,
          error: 'Une identité Kotbo est déjà liée à un autre compte Discord. Contacte un administrateur.',
        };
      }
      logger.error(TAG, `PATCH échoué pour ${userId} sur ${guildId}: ${res.status} ${body}`);
      return { ok: false, error: `Discord API ${res.status}: ${body}` };
    }

    return { ok: false, error: 'Impossible de sélectionner une identité Discord pour ce widget.' };
  } catch (err) {
    logger.error(TAG, `Erreur réseau widget ${userId}:`, err);
    return { ok: false, error: String(err) };
  }
}

export async function clearWidgetForUser(userId: string): Promise<{ ok: boolean; error?: string }> {
  const botToken = process.env.DISCORD_TOKEN;
  const appId = process.env.DISCORD_CLIENT_ID;
  if (!botToken || !appId) {
    return { ok: false, error: 'DISCORD_TOKEN ou DISCORD_CLIENT_ID manquant' };
  }

  const emptyPayload = { data: { dynamic: [] } };

  try {
    const identityIds = [userId, '0'];
    for (const [index, identityId] of identityIds.entries()) {
      const res = await fetch(getWidgetProfileUrl(appId, userId, identityId), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bot ${botToken}`,
          'User-Agent': 'DiscordBot (https://kotbo.fr, 1.0.0)',
        },
        body: JSON.stringify(emptyPayload),
      });

      if (res.ok) {
        logger.info(TAG, `Widget vidé pour ${userId} (identité ${identityId})`);
        return { ok: true };
      }

      const body = await res.text();
      let parsed: DiscordApiError = {};
      try { parsed = JSON.parse(body); } catch { /* Preserve the raw Discord response below. */ }

      if (parsed.code === 40113 && index === 0) {
        logger.info(TAG, `Clear via identité unique indisponible pour ${userId}; tentative legacy 0`);
        continue;
      }

      // A conflicting or absent identity means this user has no widget to clear.
      if (parsed.code === 40106 || parsed.code === 10069 || res.status === 404) {
        logger.info(TAG, `Clear widget ignoré pour ${userId} (code ${parsed.code ?? res.status}): pas d'identité liée`);
        return { ok: true };
      }
      logger.error(TAG, `Clear widget échoué pour ${userId}: ${res.status} ${body}`);
      return { ok: false, error: `Discord API ${res.status}: ${body}` };
    }

    return { ok: false, error: 'Impossible de sélectionner une identité Discord pour ce widget.' };
  } catch (err) {
    logger.error(TAG, `Erreur réseau clear widget ${userId}:`, err);
    return { ok: false, error: String(err) };
  }
}

export async function refreshAllStaffWidgets(guildId: string): Promise<{ success: number; failed: number }> {
  const staffMembers = await prisma.staffMember.findMany({ where: { guildId } });
  let success = 0;
  let failed = 0;

  const widgetSubscriptions = await prisma.widgetSubscription.findMany({
    where: { guildId },
  });
  const subscribedUserIds = new Set(widgetSubscriptions.map((s) => s.userId));

  for (const staff of staffMembers) {
    if (!subscribedUserIds.has(staff.userId)) continue;
    const result = await pushWidgetForUser(guildId, staff.userId);
    if (result.ok) success++;
    else failed++;
  }

  logger.info(TAG, `Refresh widgets ${guildId}: ${success} OK, ${failed} échoués`);
  return { success, failed };
}
