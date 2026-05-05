import { type GuildMember, type Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { LinkedAccountType, LinkedAccountStatus } from '@prisma/client';
import * as altAccountService from './altAccountService.js';
import { createNotification } from './staffLeadershipService.js';

/**
 * Service de détection des Double Comptes (DC)
 */

// Heuristique : Proximité de création de compte (ex: moins de 15 mins)
const ACCOUNT_CREATION_PROXIMITY_MS = 15 * 60 * 1000;
// Heuristique : Similitude de pseudo (Levenshtein distance relative)
const USERNAME_SIMILARITY_THRESHOLD = 0.8;

/**
 * Calcule la distance de Levenshtein entre deux chaînes
 */
function levenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) matrix[i] = [i];
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[len1][len2];
}

/**
 * Calcule un score de similitude entre 0 et 1
 */
function getSimilarityScore(s1: string, s2: string): number {
  const distance = levenshteinDistance(s1.toLowerCase(), s2.toLowerCase());
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  return 1.0 - distance / maxLen;
}

/**
 * Analyse un membre qui vient de rejoindre pour détecter des DCs potentiels
 */
export async function analyzeMemberJoin(member: GuildMember): Promise<void> {
  const guildId = member.guild.id;
  const userId = member.id;
  const reasons: string[] = [];
  const suspectedAlts: Set<string> = new Set();

  // 1. Détection par Invite (si invité par un membre existant)
  const inviteRecord = await prisma.memberInvite.findFirst({
    where: { guildId, userId },
    orderBy: { joinedAt: 'desc' }
  });

  if (inviteRecord?.inviterId) {
    reasons.push(`Invité par : <@${inviteRecord.inviterId}> (souvent un signe de DC)`);
    suspectedAlts.add(inviteRecord.inviterId);
  }

  // 2. Détection par date de création de compte
  const accountsCreatedNear = await prisma.memberProfile.findMany({
    where: {
      guildId,
      userId: { not: userId },
      accountCreatedAt: {
        gte: new Date(member.user.createdTimestamp - ACCOUNT_CREATION_PROXIMITY_MS),
        lte: new Date(member.user.createdTimestamp + ACCOUNT_CREATION_PROXIMITY_MS)
      }
    },
    take: 5
  });

  if (accountsCreatedNear.length > 0) {
    reasons.push(`Comptes créés à moins de 15 minutes d'intervalle : ${accountsCreatedNear.map(p => `<@${p.userId}>`).join(', ')}`);
    accountsCreatedNear.forEach(p => suspectedAlts.add(p.userId));
  }

  // 3. Détection par similitude de pseudo avec les membres récents
  const recentMembers = await prisma.memberProfile.findMany({
    where: {
      guildId,
      userId: { not: userId },
      guildJoinedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Arrivés dans les 7 derniers jours
    },
    take: 100,
    orderBy: { guildJoinedAt: 'desc' }
  });

  const username = member.user.username;
  for (const recent of recentMembers) {
    if (recent.username && getSimilarityScore(username, recent.username) >= USERNAME_SIMILARITY_THRESHOLD) {
      reasons.push(`Pseudo très similaire à <@${recent.userId}> (${recent.username})`);
      suspectedAlts.add(recent.userId);
    }
  }

  if (reasons.length > 0) {
    // Marquer comme suspect dans la DB
    await prisma.memberProfile.update({
      where: { guildId_userId: { guildId, userId } },
      data: { isSuspectedDC: true }
    }).catch(() => null);

    // Signaler au staff
    await reportSuspectedDC(member, Array.from(suspectedAlts), reasons);

    // Notification Dashboard pour le staff (sans MP)
    const managers = await prisma.staffMember.findMany({
      where: {
        guildId,
        grade: { in: ['Manager', 'Admin', 'Administrateur', 'Fondateur', 'Direction'] }
      }
    });

    if (managers.length > 0) {
      await Promise.all(managers.map(m => createNotification(
        guildId,
        m.userId,
        '⚠️ Alerte DC suspect',
        `Un double compte potentiel a été détecté : ${member.user.tag}.`,
        'WARNING',
        `/members/${member.id}`,
        false // Pas de notification MP pour les alertes DC (à la demande de l'utilisateur)
      ).catch(() => null)));
    }
  }
}

/**
 * Envoie une alerte dans le salon de log pour les modérateurs
 */
async function reportSuspectedDC(member: GuildMember, altIds: string[], reasons: string[]): Promise<void> {
  const guild = member.guild;
  const config = await prisma.guild.findUnique({
    where: { id: guild.id },
    select: { logChannelId: true }
  });

  const logChannelId = config?.logChannelId;
  if (!logChannelId) return;

  const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
  if (!logChannel || !('send' in logChannel)) return;

  const embed = new EmbedBuilder()
    .setTitle('⚠️ Détection de Double Compte (DC) suspect')
    .setColor('#FFA500')
    .setThumbnail(member.user.displayAvatarURL())
    .setDescription(`Le membre **${member.user.tag}** (<@${member.id}>) a été identifié comme un DC potentiel.`)
    .addFields(
      { name: 'Raisons de la suspicion', value: reasons.map(r => `• ${r}`).join('\n') },
      { name: 'Comptes suspects associés', value: altIds.length > 0 ? altIds.map(id => `<@${id}>`).join(', ') : 'Aucun' },
      { name: 'Date de création', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: 'Arrivée', value: `<t:${Math.floor(member.joinedTimestamp! / 1000)}:R>`, inline: true }
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`dc_validate_${member.id}_${altIds[0] || 'none'}`)
      .setLabel('Valider la liaison')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`dc_reject_${member.id}`)
      .setLabel('Ignorer / Faux positif')
      .setStyle(ButtonStyle.Secondary)
  );

  const message = await (logChannel as any).send({ embeds: [embed], components: [row] });

  // On peut ajouter un collecteur ici ou gérer via un handler global (préférable)
}

/**
 * Gère les interactions de boutons pour la validation des DCs
 */
export async function handleDCInteraction(interaction: any): Promise<void> {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('dc_')) return;

  // Handle both dc_validate_ID_ALT (detection) and dc_validate_link:ID:ALT (manual report)
  let action: string;
  let userId: string;
  let altId: string | undefined;

  if (interaction.customId.includes(':')) {
    const parts = interaction.customId.split(':');
    action = parts[0].replace('dc_', '').replace('_link', ''); // 'validate' or 'reject'
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
      guildId: interaction.guildId!,
      user1Id: userId,
      user2Id: altId,
      type: LinkedAccountType.AUTOMATIC,
      status: LinkedAccountStatus.VALIDATED,
      reason: 'Validé par la modération (Interface de détection ou signalement).',
      linkedByUserId: interaction.user.id
    });

    // Mark both as no longer suspect
    await prisma.memberProfile.updateMany({
      where: { userId: { in: [userId, altId] }, guildId: interaction.guildId! },
      data: { isSuspectedDC: false }
    }).catch(() => null);

    // PM Users
    const dmEmbed = new EmbedBuilder()
      .setColor('#57F287')
      .setTitle('🔗 Comptes liés officiellement')
      .setDescription(`Vos comptes **<@${userId}>** et **<@${altId}>** ont été reliés sur **${interaction.guild?.name || 'le serveur'}**.`)
      .setTimestamp();

    try {
      const u1 = await interaction.client.users.fetch(userId).catch(() => null);
      if (u1) await u1.send({ embeds: [dmEmbed] }).catch(() => null);
    } catch (e) {}

    try {
      const u2 = await interaction.client.users.fetch(altId!).catch(() => null);
      if (u2) await u2.send({ embeds: [dmEmbed] }).catch(() => null);
    } catch (e) {}

    await interaction.update({
      content: `✅ Le compte <@${userId}> a été lié à <@${altId}> par <@${interaction.user.id}>.`,
      embeds: [],
      components: []
    });
  } else if (action === 'reject') {
    // Mark as no longer suspect even if rejected
    await prisma.memberProfile.updateMany({
      where: { userId: { in: [userId, altId || userId] }, guildId: interaction.guildId! },
      data: { isSuspectedDC: false }
    }).catch(() => null);

    await interaction.update({
      content: `⚠️ Alerte/Signalement ignoré par <@${interaction.user.id}>.`,
      embeds: [],
      components: []
    });
  }
}
