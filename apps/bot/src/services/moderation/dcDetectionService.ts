import { type Guild, type GuildMember, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import prisma from '../../utils/db.js';

import { LinkedAccountType, LinkedAccountStatus } from '@prisma/client';
import * as altAccountService from './altAccountService.js';
import { createNotification } from '../staff/staffLeadershipService.js';
import { fetchAllMembers } from '../../utils/discord.js';

const ACCOUNT_CREATION_PROXIMITY_MS = 15 * 60 * 1000;
export const JOIN_TO_ACCOUNT_CREATION_PROXIMITY_MS = 3 * 24 * 60 * 60 * 1000;
const USERNAME_SIMILARITY_THRESHOLD = 0.75;
const JOIN_PROXIMITY_MS = 10 * 60 * 1000; // joined within 10 min of each other
const _AVATAR_DEFAULT_HASH_PREFIX = 'a_'; // animated avatars prefix

export type DetectionReason = {
  type: 'young_account' | 'creation_proximity' | 'username_similarity' | 'invite_link' | 'join_proximity' | 'shared_avatar' | 'shared_locale' | 'low_activity_pair' | 'role_pattern' | 'sequential_ids';
  label: string;
  score: number; // 0-100 confidence
  matchedUserId?: string;
  detail?: string;
};

export type DetectionEvidence = {
  userId: string;
  reasons: DetectionReason[];
  suspectedAlts: string[];
  totalScore: number;
  detectedAt: string;
};

export type YoungAccountScanMatch = {
  userId: string;
  username: string | null;
  displayName: string | null;
  accountCreatedAt: string;
  guildJoinedAt: string;
  accountAgeMs: number;
  accountAgeLabel: string;
};

export type YoungAccountScanResult = {
  scannedCount: number;
  flaggedCount: number;
  thresholdMs: number;
  matches: YoungAccountScanMatch[];
};

function formatAgeLabel(durationMs: number): string {
  const totalSeconds = Math.max(1, Math.floor(durationMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} jour${days > 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} heure${hours > 1 ? 's' : ''}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
  if (seconds > 0 && parts.length === 0) parts.push(`${seconds} seconde${seconds > 1 ? 's' : ''}`);
  return parts.join(' ');
}

function buildYoungAccountSuspicion(member: GuildMember, thresholdMs: number): { reason: string; accountAgeMs: number; accountAgeLabel: string } | null {
  const joinedTimestamp = member.joinedTimestamp;
  const createdTimestamp = member.user.createdTimestamp;
  if (!joinedTimestamp || !createdTimestamp) return null;
  const accountAgeMs = joinedTimestamp - createdTimestamp;
  if (accountAgeMs < 0 || accountAgeMs > thresholdMs) return null;
  const accountAgeLabel = formatAgeLabel(accountAgeMs);
  return { reason: `Compte créé ${accountAgeLabel} avant l'arrivée sur le serveur.`, accountAgeMs, accountAgeLabel };
}

function levenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= len1; i++) matrix[i] = [i];
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[len1][len2];
}

function getSimilarityScore(s1: string, s2: string): number {
  const distance = levenshteinDistance(s1.toLowerCase(), s2.toLowerCase());
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  return 1.0 - distance / maxLen;
}

function extractUsernameBase(username: string): string {
  return username.toLowerCase().replace(/[0-9_.-]+$/g, '');
}

function areDiscordIdsSequential(id1: string, id2: string): boolean {
  try {
    const n1 = BigInt(id1);
    const n2 = BigInt(id2);
    const diff = n1 > n2 ? n1 - n2 : n2 - n1;
    // IDs created within ~5 seconds of each other (Discord snowflake increments ~4096/ms)
    return diff < BigInt(5 * 1000 * 4096);
  } catch { return false; }
}

async function notifyManagersOfSuspectedDC(guildId: string, member: GuildMember): Promise<void> {
  const managers = await prisma.staffMember.findMany({
    where: { guildId, grade: { in: ['Manager', 'Admin', 'Administrateur', 'Fondateur', 'Direction'] } }
  });
  if (managers.length === 0) return;
  await Promise.all(managers.map(m => createNotification(
    guildId, m.userId, '⚠️ Alerte DC suspect',
    `Un double compte potentiel a été détecté : ${member.user.tag}.`,
    'WARNING', `/double-accounts?tab=detections`, false
  ).catch(() => null)));
}

export async function analyzeMemberJoin(member: GuildMember): Promise<DetectionEvidence | null> {
  const guildId = member.guild.id;
  const userId = member.id;
  const reasons: DetectionReason[] = [];
  const suspectedAlts = new Set<string>();

  // 1. Invite tracking
  const inviteRecord = await prisma.memberInvite.findFirst({
    where: { guildId, userId },
    orderBy: { joinedAt: 'desc' }
  });
  if (inviteRecord?.inviterId) {
    reasons.push({
      type: 'invite_link', label: `Invité par <@${inviteRecord.inviterId}>`,
      score: 20, matchedUserId: inviteRecord.inviterId, detail: `Code invite utilisé par ce membre, créé par ${inviteRecord.inviterId}`,
    });
    suspectedAlts.add(inviteRecord.inviterId);
  }

  // 2. Account creation proximity (±15 min)
  const accountsCreatedNear = await prisma.memberProfile.findMany({
    where: {
      guildId, userId: { not: userId },
      accountCreatedAt: {
        gte: new Date(member.user.createdTimestamp - ACCOUNT_CREATION_PROXIMITY_MS),
        lte: new Date(member.user.createdTimestamp + ACCOUNT_CREATION_PROXIMITY_MS)
      }
    },
    take: 10
  });
  for (const p of accountsCreatedNear) {
    const diffMs = Math.abs((p.accountCreatedAt?.getTime() ?? 0) - member.user.createdTimestamp);
    reasons.push({
      type: 'creation_proximity', label: `Compte créé à ${formatAgeLabel(diffMs)} d'intervalle de <@${p.userId}>`,
      score: diffMs < 60_000 ? 50 : 35, matchedUserId: p.userId,
      detail: `Création du compte à ${new Date(member.user.createdTimestamp).toISOString()}, autre compte à ${p.accountCreatedAt?.toISOString()}`,
    });
    suspectedAlts.add(p.userId);
  }

  // 3. Username similarity (recent members, 30 days window)
  const recentMembers = await prisma.memberProfile.findMany({
    where: {
      guildId, userId: { not: userId },
      guildJoinedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    },
    take: 200, orderBy: { guildJoinedAt: 'desc' }
  });

  const username = member.user.username;
  const usernameBase = extractUsernameBase(username);

  for (const recent of recentMembers) {
    if (!recent.username) continue;
    const sim = getSimilarityScore(username, recent.username);
    if (sim >= USERNAME_SIMILARITY_THRESHOLD) {
      reasons.push({
        type: 'username_similarity',
        label: `Pseudo similaire à <@${recent.userId}> (${recent.username}) — ${Math.round(sim * 100)}%`,
        score: Math.round(sim * 40), matchedUserId: recent.userId,
        detail: `Levenshtein: "${username}" vs "${recent.username}" = ${Math.round(sim * 100)}% similitude`,
      });
      suspectedAlts.add(recent.userId);
    } else if (usernameBase.length >= 3) {
      const recentBase = extractUsernameBase(recent.username);
      if (recentBase === usernameBase && recentBase.length >= 3) {
        reasons.push({
          type: 'username_similarity',
          label: `Base de pseudo identique à <@${recent.userId}> ("${usernameBase}")`,
          score: 30, matchedUserId: recent.userId,
          detail: `Base commune "${usernameBase}": "${username}" et "${recent.username}"`,
        });
        suspectedAlts.add(recent.userId);
      }
    }
  }

  // 4. Join proximity (joined within 10 min of another member)
  const joinedAt = member.joinedAt;
  if (joinedAt) {
    const nearJoiners = await prisma.memberProfile.findMany({
      where: {
        guildId, userId: { not: userId },
        guildJoinedAt: {
          gte: new Date(joinedAt.getTime() - JOIN_PROXIMITY_MS),
          lte: new Date(joinedAt.getTime() + JOIN_PROXIMITY_MS)
        }
      },
      take: 5
    });
    for (const j of nearJoiners) {
      if (suspectedAlts.has(j.userId)) {
        const existing = reasons.find(r => r.matchedUserId === j.userId);
        if (existing) existing.score += 15;
      } else {
        const diffMs = Math.abs((j.guildJoinedAt?.getTime() ?? 0) - joinedAt.getTime());
        reasons.push({
          type: 'join_proximity', label: `Arrivée à ${formatAgeLabel(diffMs)} d'intervalle de <@${j.userId}>`,
          score: 15, matchedUserId: j.userId,
        });
        suspectedAlts.add(j.userId);
      }
    }
  }

  // 5. Shared avatar hash (default avatar = same discriminator pattern)
  const memberAvatar = member.user.avatar;
  if (memberAvatar) {
    const sameAvatarMembers = await prisma.memberProfile.findMany({
      where: { guildId, userId: { not: userId }, avatarUrl: { contains: memberAvatar } },
      take: 5
    });
    for (const s of sameAvatarMembers) {
      reasons.push({
        type: 'shared_avatar', label: `Même avatar que <@${s.userId}>`,
        score: 25, matchedUserId: s.userId,
      });
      suspectedAlts.add(s.userId);
    }
  }

  // 6. Sequential Discord IDs (accounts created very close together)
  for (const altId of [...suspectedAlts]) {
    if (areDiscordIdsSequential(userId, altId)) {
      reasons.push({
        type: 'sequential_ids', label: `IDs Discord séquentiels avec <@${altId}>`,
        score: 40, matchedUserId: altId,
        detail: `Les IDs ${userId} et ${altId} sont très proches, indiquant une création quasi-simultanée`,
      });
    }
  }

  // 7. Shared locale among suspected alts
  const memberProfile = await prisma.memberProfile.findUnique({
    where: { guildId_userId: { guildId, userId } },
    select: { locale: true }
  });
  if (memberProfile?.locale) {
    for (const altId of [...suspectedAlts]) {
      const altProfile = await prisma.memberProfile.findUnique({
        where: { guildId_userId: { guildId, userId: altId } },
        select: { locale: true }
      });
      if (altProfile?.locale && altProfile.locale === memberProfile.locale) {
        const existing = reasons.find(r => r.matchedUserId === altId);
        if (existing) existing.score += 5;
      }
    }
  }

  // 8. Low activity pair (both accounts have very few messages — typical of alts)
  for (const altId of [...suspectedAlts]) {
    const altProfile = await prisma.memberProfile.findUnique({
      where: { guildId_userId: { guildId, userId: altId } },
      select: { messageCount: true }
    });
    if (altProfile && altProfile.messageCount < 5) {
      const existing = reasons.find(r => r.matchedUserId === altId);
      if (existing) existing.score += 10;
    }
  }

  if (reasons.length === 0) return null;

  const totalScore = Math.min(100, reasons.reduce((sum, r) => sum + r.score, 0));

  const evidence: DetectionEvidence = {
    userId, reasons, suspectedAlts: Array.from(suspectedAlts), totalScore, detectedAt: new Date().toISOString(),
  };

  // Store evidence in memberProfile
  await prisma.memberProfile.upsert({
    where: { guildId_userId: { guildId, userId } },
    update: { isSuspectedDC: true },
    create: { guildId, userId, isSuspectedDC: true }
  }).catch(() => null);

  await reportSuspectedDC(member, evidence);
  await notifyManagersOfSuspectedDC(guildId, member);

  return evidence;
}

export async function getDetectionEvidence(guildId: string, userId: string): Promise<DetectionEvidence | null> {
  const profile = await prisma.memberProfile.findUnique({
    where: { guildId_userId: { guildId, userId } },
    select: { userId: true, username: true, accountCreatedAt: true, guildJoinedAt: true, locale: true, avatarUrl: true, messageCount: true, isSuspectedDC: true }
  });
  if (!profile) return null;

  const reasons: DetectionReason[] = [];
  const suspectedAlts = new Set<string>();

  // Young account — use 30-day window so scan results always show up
  const EVIDENCE_YOUNG_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;
  if (profile.accountCreatedAt && profile.guildJoinedAt) {
    const ageMs = profile.guildJoinedAt.getTime() - profile.accountCreatedAt.getTime();
    if (ageMs >= 0 && ageMs < EVIDENCE_YOUNG_THRESHOLD_MS) {
      const score = ageMs < 3600_000 ? 40 : ageMs < JOIN_TO_ACCOUNT_CREATION_PROXIMITY_MS ? 25 : 15;
      reasons.push({
        type: 'young_account', label: `Compte créé ${formatAgeLabel(ageMs)} avant l'arrivée`,
        score,
        detail: `Création: ${profile.accountCreatedAt.toISOString()}, Arrivée: ${profile.guildJoinedAt.toISOString()}`,
      });
    }
  }

  // Invite
  const invite = await prisma.memberInvite.findFirst({ where: { guildId, userId }, orderBy: { joinedAt: 'desc' } });
  if (invite?.inviterId) {
    reasons.push({ type: 'invite_link', label: `Invité par <@${invite.inviterId}>`, score: 20, matchedUserId: invite.inviterId });
    suspectedAlts.add(invite.inviterId);
  }

  // Creation proximity
  if (profile.accountCreatedAt) {
    const near = await prisma.memberProfile.findMany({
      where: {
        guildId, userId: { not: userId },
        accountCreatedAt: { gte: new Date(profile.accountCreatedAt.getTime() - ACCOUNT_CREATION_PROXIMITY_MS), lte: new Date(profile.accountCreatedAt.getTime() + ACCOUNT_CREATION_PROXIMITY_MS) }
      }, take: 10
    });
    for (const p of near) {
      const diffMs = Math.abs((p.accountCreatedAt?.getTime() ?? 0) - profile.accountCreatedAt.getTime());
      reasons.push({ type: 'creation_proximity', label: `Compte créé à ${formatAgeLabel(diffMs)} de <@${p.userId}>`, score: diffMs < 60_000 ? 50 : 35, matchedUserId: p.userId });
      suspectedAlts.add(p.userId);
    }
  }

  // Username similarity
  if (profile.username) {
    const base = extractUsernameBase(profile.username);
    const others = await prisma.memberProfile.findMany({
      where: { guildId, userId: { not: userId }, username: { not: null } }, take: 200, orderBy: { guildJoinedAt: 'desc' }
    });
    for (const o of others) {
      if (!o.username) continue;
      const sim = getSimilarityScore(profile.username, o.username);
      if (sim >= USERNAME_SIMILARITY_THRESHOLD) {
        reasons.push({ type: 'username_similarity', label: `Pseudo similaire à <@${o.userId}> — ${Math.round(sim * 100)}%`, score: Math.round(sim * 40), matchedUserId: o.userId });
        suspectedAlts.add(o.userId);
      } else if (base.length >= 3 && extractUsernameBase(o.username) === base) {
        reasons.push({ type: 'username_similarity', label: `Base de pseudo identique à <@${o.userId}> ("${base}")`, score: 30, matchedUserId: o.userId });
        suspectedAlts.add(o.userId);
      }
    }
  }

  // Join proximity
  if (profile.guildJoinedAt) {
    const nearJoin = await prisma.memberProfile.findMany({
      where: {
        guildId, userId: { not: userId },
        guildJoinedAt: { gte: new Date(profile.guildJoinedAt.getTime() - JOIN_PROXIMITY_MS), lte: new Date(profile.guildJoinedAt.getTime() + JOIN_PROXIMITY_MS) }
      }, take: 5
    });
    for (const j of nearJoin) {
      const diffMs = Math.abs((j.guildJoinedAt?.getTime() ?? 0) - profile.guildJoinedAt.getTime());
      if (!suspectedAlts.has(j.userId)) {
        reasons.push({ type: 'join_proximity', label: `Arrivée à ${formatAgeLabel(diffMs)} de <@${j.userId}>`, score: 15, matchedUserId: j.userId });
        suspectedAlts.add(j.userId);
      }
    }
  }

  // Sequential IDs
  for (const altId of [...suspectedAlts]) {
    if (areDiscordIdsSequential(userId, altId)) {
      reasons.push({ type: 'sequential_ids', label: `IDs séquentiels avec <@${altId}>`, score: 40, matchedUserId: altId });
    }
  }

  if (reasons.length === 0) {
    if (!profile.isSuspectedDC) return null;
    reasons.push({
      type: 'young_account',
      label: 'Marqué comme suspect par un scan précédent',
      score: 10,
      detail: "Ce membre a été signalé lors d'un scan de détection. Les conditions exactes ne sont plus reproductibles (seuil ou données modifiées depuis).",
    });
  }

  return {
    userId, reasons, suspectedAlts: Array.from(suspectedAlts),
    totalScore: Math.min(100, reasons.reduce((s, r) => s + r.score, 0)),
    detectedAt: new Date().toISOString(),
  };
}

export async function scanGuildMembersForYoungAccounts(guild: Guild, thresholdMs = JOIN_TO_ACCOUNT_CREATION_PROXIMITY_MS): Promise<YoungAccountScanResult> {
  const fetchedMembers = await fetchAllMembers(guild).catch(() => null);
  if (!fetchedMembers) return { scannedCount: 0, flaggedCount: 0, thresholdMs, matches: [] };

  const matches: YoungAccountScanMatch[] = [];
  let scannedCount = 0;

  for (const member of fetchedMembers.values()) {
    if (member.user.bot) continue;
    scannedCount++;
    const suspicion = buildYoungAccountSuspicion(member, thresholdMs);
    if (!suspicion) continue;

    await prisma.memberProfile.upsert({
      where: { guildId_userId: { guildId: guild.id, userId: member.id } },
      update: { isSuspectedDC: true },
      create: { guildId: guild.id, userId: member.id, isSuspectedDC: true }
    }).catch(() => null);

    const evidence: DetectionEvidence = {
      userId: member.id, reasons: [{ type: 'young_account', label: suspicion.reason, score: 30 }],
      suspectedAlts: [], totalScore: 30, detectedAt: new Date().toISOString(),
    };
    await reportSuspectedDC(member, evidence);
    await notifyManagersOfSuspectedDC(guild.id, member);

    matches.push({
      userId: member.id, username: member.user.username, displayName: member.displayName,
      accountCreatedAt: member.user.createdAt.toISOString(),
      guildJoinedAt: member.joinedAt?.toISOString() ?? new Date(member.joinedTimestamp ?? Date.now()).toISOString(),
      accountAgeMs: suspicion.accountAgeMs, accountAgeLabel: suspicion.accountAgeLabel,
    });
  }

  return { scannedCount, flaggedCount: matches.length, thresholdMs, matches };
}

async function reportSuspectedDC(member: GuildMember, evidence: DetectionEvidence): Promise<void> {
  const guild = member.guild;
  const config = await prisma.guild.findUnique({ where: { id: guild.id }, select: { logChannelId: true } });
  const logChannelId = config?.logChannelId;
  if (!logChannelId) return;

  const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
  if (!logChannel || !('send' in logChannel)) return;

  const scoreColor = evidence.totalScore >= 60 ? '#ED4245' : evidence.totalScore >= 30 ? '#FFA500' : '#FEE75C';
  const scoreLabel = evidence.totalScore >= 60 ? 'Élevé' : evidence.totalScore >= 30 ? 'Moyen' : 'Faible';

  const reasonsText = evidence.reasons
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(r => `\`${r.score}pts\` ${r.label}`)
    .join('\n');

  const altsText = evidence.suspectedAlts.length > 0
    ? evidence.suspectedAlts.map(id => `<@${id}>`).join(', ')
    : 'Aucun';

  const embed = new EmbedBuilder()
    .setTitle('Détection de Double Compte')
    .setColor(parseInt(scoreColor.replace('#', ''), 16))
    .setThumbnail(member.user.displayAvatarURL())
    .setDescription(`**${member.user.tag}** (<@${member.id}>) identifié comme DC potentiel.`)
    .addFields(
      { name: 'Score de confiance', value: `**${evidence.totalScore}/100** (${scoreLabel})`, inline: true },
      { name: 'Heuristiques', value: `${evidence.reasons.length} signal${evidence.reasons.length > 1 ? 'aux' : ''}`, inline: true },
      { name: 'Création', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: 'Raisons', value: reasonsText || 'Aucune' },
      { name: 'Comptes suspects', value: altsText },
    )
    .setTimestamp();

  const primaryAlt = evidence.suspectedAlts[0] || 'none';

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`dc_validate_${member.id}_${primaryAlt}`)
      .setLabel('Lier les comptes')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`dc_reject_${member.id}`)
      .setLabel('Faux positif')
      .setStyle(ButtonStyle.Secondary),
  );

  await (logChannel as unknown).send({ embeds: [embed], components: [row] });
}

export async function handleDCInteraction(interaction: unknown): Promise<void> {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('dc_')) return;

  let action: string;
  let userId: string;
  let altId: string | undefined;

  if (interaction.customId.includes(':')) {
    const parts = interaction.customId.split(':');
    action = parts[0].replace('dc_', '').replace('_link', '');
    userId = parts[1];
    altId = parts[2];
  } else {
    const parts = interaction.customId.split('_');
    action = parts[1];
    userId = parts[2];
    altId = parts[3];
  }

  if (action === 'validate') {
    if (!altId || altId === 'none') {
      await interaction.reply({ content: '❌ Impossible de valider sans un autre compte spécifié.', ephemeral: true });
      return;
    }

    await altAccountService.linkAccounts({
      guildId: interaction.guildId!, user1Id: userId, user2Id: altId,
      type: LinkedAccountType.AUTOMATIC, status: LinkedAccountStatus.VALIDATED,
      reason: 'Validé par la modération (Interface de détection ou signalement).',
      linkedByUserId: interaction.user.id
    });

    await prisma.memberProfile.updateMany({
      where: { userId: { in: [userId, altId] }, guildId: interaction.guildId! },
      data: { isSuspectedDC: false }
    }).catch(() => null);

    const dmEmbed = new EmbedBuilder()
      .setColor('#57F287')
      .setTitle('Comptes liés officiellement')
      .setDescription(`Vos comptes <@${userId}> et <@${altId}> ont été reliés sur **${interaction.guild?.name || 'le serveur'}**.`)
      .setTimestamp();

    const u1 = await interaction.client.users.fetch(userId).catch(() => null);
    if (u1) await u1.send({ embeds: [dmEmbed] }).catch(() => null);
    const u2 = await interaction.client.users.fetch(altId).catch(() => null);
    if (u2) await u2.send({ embeds: [dmEmbed] }).catch(() => null);

    await interaction.update({
      content: `✅ <@${userId}> lié à <@${altId}> par <@${interaction.user.id}>.`,
      embeds: [], components: []
    });
  } else if (action === 'reject') {
    await prisma.memberProfile.updateMany({
      where: { userId: { in: [userId, altId || userId] }, guildId: interaction.guildId! },
      data: { isSuspectedDC: false }
    }).catch(() => null);

    await interaction.update({
      content: `Alerte ignorée par <@${interaction.user.id}>.`,
      embeds: [], components: []
    });
  }
}
