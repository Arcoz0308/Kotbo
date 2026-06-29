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
  data: { dynamic: DynamicField[] };
}

function formatVoiceTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  if (hours > 0) return `${hours}h en vocal`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m en vocal`;
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
  const xp = memberLevel?.xp ?? 0;
  const messageCount = memberProfile?.messageCount ?? 0;
  const voiceSeconds = memberProfile?.voiceTimeSeconds ?? 0;
  const memberCount = guild.memberCount;
  const guildName = guild.name;
  const guildIconUrl = guild.iconURL({ size: 256 }) ?? '';

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
  ];

  return { data: { dynamic } };
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

  const url = `${API}/applications/${appId}/users/${userId}/identities/0/profile`;

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bot ${botToken}`,
    'User-Agent': 'DiscordBot (https://kotbo.fr, 1.0.0)',
  };

  try {
    let res = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error(TAG, `PATCH échoué pour ${userId} sur ${guildId}: ${res.status} ${body}`);
      return { ok: false, error: `Discord API ${res.status}: ${body}` };
    }

    logger.info(TAG, `Widget mis à jour pour ${userId} sur ${guildId}`);
    return { ok: true };
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

  const url = `${API}/applications/${appId}/users/${userId}/identities/0/profile`;
  const emptyPayload = { data: { dynamic: [] } };

  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${botToken}`,
        'User-Agent': 'DiscordBot (https://kotbo.fr, 1.0.0)',
      },
      body: JSON.stringify(emptyPayload),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error(TAG, `Clear widget échoué pour ${userId}: ${res.status} ${body}`);
      return { ok: false, error: `Discord API ${res.status}: ${body}` };
    }

    logger.info(TAG, `Widget vidé pour ${userId}`);
    return { ok: true };
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
