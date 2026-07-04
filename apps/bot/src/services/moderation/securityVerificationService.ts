import {
  type Client,
  type GuildMember,
  type TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import crypto from 'node:crypto';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { LinkedAccountType, LinkedAccountStatus, VerificationStatus } from '@prisma/client';
import * as altAccountService from './altAccountService.js';
import { createNotification } from '../staff/staffLeadershipService.js';

const VERIFICATION_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h

export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function createVerificationSession(guildId: string, userId: string): Promise<string> {
  await prisma.securityVerification.updateMany({
    where: { guildId, userId, status: VerificationStatus.PENDING },
    data: { status: VerificationStatus.EXPIRED },
  });

  const token = generateVerificationToken();
  await prisma.securityVerification.create({
    data: {
      guildId,
      userId,
      token,
      status: VerificationStatus.PENDING,
      expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_MS),
    },
  });

  return token;
}

export async function getVerificationByToken(token: string) {
  const verification = await prisma.securityVerification.findUnique({
    where: { token },
  });

  if (!verification) return null;
  if (verification.expiresAt < new Date()) {
    await prisma.securityVerification.update({
      where: { id: verification.id },
      data: { status: VerificationStatus.EXPIRED },
    });
    return null;
  }
  if (verification.status !== VerificationStatus.PENDING) return null;

  return verification;
}

export function buildVerificationUrl(dashboardUrl: string, guildId: string, token: string): string {
  return `${dashboardUrl}/verify/${guildId}/${token}`;
}

export function buildVerificationEmbed(
  guildName: string,
  title: string,
  description: string,
  color: string,
  verifyUrl: string,
): { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> } {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(parseInt(color.replace('#', ''), 16))
    .addFields({
      name: '🔒 Pourquoi vérifier ?',
      value: 'Ce système protège la communauté contre les doubles comptes. La vérification est rapide et sécurisée via Discord OAuth.',
    })
    .setFooter({ text: `${guildName} • Vérification de sécurité` })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Vérifier mon identité')
      .setStyle(ButtonStyle.Link)
      .setURL(verifyUrl)
      .setEmoji('🔐'),
  );

  return { embed, row };
}

export async function sendVerificationDM(
  member: GuildMember,
  dashboardUrl: string,
): Promise<boolean> {
  const guild = member.guild;
  const guildConfig = await prisma.guild.findUnique({
    where: { id: guild.id },
    select: {
      verificationEnabled: true,
      verificationEmbedTitle: true,
      verificationEmbedDesc: true,
      verificationEmbedColor: true,
    },
  });

  if (!guildConfig?.verificationEnabled) return false;

  const token = await createVerificationSession(guild.id, member.id);
  const verifyUrl = buildVerificationUrl(dashboardUrl, guild.id, token);
  const { embed, row } = buildVerificationEmbed(
    guild.name,
    guildConfig.verificationEmbedTitle,
    guildConfig.verificationEmbedDesc,
    guildConfig.verificationEmbedColor,
    verifyUrl,
  );

  try {
    await member.send({ embeds: [embed], components: [row], allowedMentions: { parse: [] } });
    logger.info('SecurityVerif', `DM de vérification envoyé à ${member.user.tag} sur ${guild.name}`);
    return true;
  } catch {
    logger.warn('SecurityVerif', `Impossible d'envoyer le DM de vérification à ${member.user.tag}`);
    return false;
  }
}

export async function sendVerificationEmbed(
  client: Client,
  guildId: string,
  channelId: string,
  _dashboardUrl: string,
): Promise<boolean> {
  const guildConfig = await prisma.guild.findUnique({
    where: { id: guildId },
    select: {
      verificationEmbedTitle: true,
      verificationEmbedDesc: true,
      verificationEmbedColor: true,
    },
  });

  if (!guildConfig) return false;

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return false;

  const channel = await guild.channels.fetch(channelId).catch(() => null) as TextChannel | null;
  if (!channel) return false;

  const embed = new EmbedBuilder()
    .setTitle(guildConfig.verificationEmbedTitle)
    .setDescription(guildConfig.verificationEmbedDesc)
    .setColor(parseInt(guildConfig.verificationEmbedColor.replace('#', ''), 16))
    .addFields({
      name: '🔒 Pourquoi vérifier ?',
      value: 'Ce système protège la communauté contre les doubles comptes. Cliquez sur le bouton ci-dessous pour lancer la vérification.',
    })
    .setFooter({ text: `${guild.name} • Vérification de sécurité` })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`secverif_start_${guildId}`)
      .setLabel('Vérifier mon identité')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔐'),
  );

  await channel.send({ embeds: [embed], components: [row], allowedMentions: { parse: [] } });
  return true;
}

export async function handleVerifyButtonClick(
  interaction: unknown,
  dashboardUrl: string,
): Promise<void> {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  const existing = await prisma.securityVerification.findFirst({
    where: {
      guildId,
      userId,
      status: VerificationStatus.PENDING,
      expiresAt: { gt: new Date() },
    },
  });

  let token: string;
  if (existing) {
    token = existing.token;
  } else {
    token = await createVerificationSession(guildId, userId);
  }

  const verifyUrl = buildVerificationUrl(dashboardUrl, guildId, token);

  const embed = new EmbedBuilder()
    .setTitle('🔐 Vérification de sécurité')
    .setDescription('Cliquez sur le lien ci-dessous pour vérifier votre identité. Le lien expire dans 24 heures.')
    .setColor(0x5865F2)
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Ouvrir la vérification')
      .setStyle(ButtonStyle.Link)
      .setURL(verifyUrl)
      .setEmoji('🔗'),
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

export async function completeVerification(params: {
  token: string;
  verifiedDiscordId: string;
  ipAddress: string;
  dashboardUrl: string;
  client: Client;
}): Promise<{ success: boolean; message: string; duplicateDetected: boolean; duplicateUserId?: string }> {
  const { token, verifiedDiscordId, ipAddress, client } = params;

  const verification = await getVerificationByToken(token);
  if (!verification) {
    return { success: false, message: 'Token invalide ou expiré.', duplicateDetected: false };
  }

  if (verification.userId !== verifiedDiscordId) {
    const guildConfig = await prisma.guild.findUnique({
      where: { id: verification.guildId },
      select: { verificationAction: true, verificationLogChannelId: true, logChannelId: true },
    });

    const evidence = {
      expectedUserId: verification.userId,
      authenticatedUserId: verifiedDiscordId,
      ipAddress,
      detectedAt: new Date().toISOString(),
      method: 'oauth_mismatch',
    };

    await prisma.securityVerification.update({
      where: { id: verification.id },
      data: {
        status: VerificationStatus.FLAGGED,
        verifiedDiscordId,
        ipAddress,
        verifiedAt: new Date(),
        duplicateDetected: true,
        duplicateUserId: verifiedDiscordId,
        duplicateEvidence: evidence,
      },
    });

    const action = guildConfig?.verificationAction || 'NOTIFY_STAFF';

    if (action === 'AUTO_LINK') {
      await altAccountService.linkAccounts({
        guildId: verification.guildId,
        user1Id: verification.userId,
        user2Id: verifiedDiscordId,
        type: LinkedAccountType.AUTOMATIC,
        status: LinkedAccountStatus.VALIDATED,
        reason: 'Détecté automatiquement via vérification de sécurité (OAuth mismatch).',
        metadata: evidence,
      });

      await notifyStaffOfDuplicate(client, verification.guildId, verification.userId, verifiedDiscordId, evidence, guildConfig?.verificationLogChannelId || guildConfig?.logChannelId, true);

      return {
        success: true,
        message: 'Double compte détecté et lié automatiquement.',
        duplicateDetected: true,
        duplicateUserId: verifiedDiscordId,
      };
    } else {
      await notifyStaffOfDuplicate(client, verification.guildId, verification.userId, verifiedDiscordId, evidence, guildConfig?.verificationLogChannelId || guildConfig?.logChannelId, false);

      return {
        success: true,
        message: 'Double compte détecté. Les modérateurs ont été notifiés.',
        duplicateDetected: true,
        duplicateUserId: verifiedDiscordId,
      };
    }
  }

  // Same user — check IP for other verifications on the same guild
  const sameIpVerifications = await prisma.securityVerification.findMany({
    where: {
      guildId: verification.guildId,
      ipAddress,
      userId: { not: verifiedDiscordId },
      status: { in: [VerificationStatus.VERIFIED, VerificationStatus.FLAGGED] },
    },
    take: 5,
  });

  let duplicateDetected = false;
  let duplicateUserId: string | undefined;

  if (sameIpVerifications.length > 0) {
    duplicateDetected = true;
    duplicateUserId = sameIpVerifications[0].userId;

    const guildConfig = await prisma.guild.findUnique({
      where: { id: verification.guildId },
      select: { verificationAction: true, verificationLogChannelId: true, logChannelId: true },
    });

    const evidence = {
      sharedIp: ipAddress,
      matchedUserIds: sameIpVerifications.map(v => v.userId),
      detectedAt: new Date().toISOString(),
      method: 'ip_match',
    };

    const action = guildConfig?.verificationAction || 'NOTIFY_STAFF';

    if (action === 'AUTO_LINK') {
      await altAccountService.linkAccounts({
        guildId: verification.guildId,
        user1Id: verifiedDiscordId,
        user2Id: duplicateUserId,
        type: LinkedAccountType.AUTOMATIC,
        status: LinkedAccountStatus.VALIDATED,
        reason: 'Détecté automatiquement via vérification de sécurité (même IP).',
        metadata: evidence,
      });
    }

    await notifyStaffOfDuplicate(
      client,
      verification.guildId,
      verifiedDiscordId,
      duplicateUserId,
      evidence,
      guildConfig?.verificationLogChannelId || guildConfig?.logChannelId,
      action === 'AUTO_LINK',
    );

    await prisma.securityVerification.update({
      where: { id: verification.id },
      data: {
        status: VerificationStatus.FLAGGED,
        verifiedDiscordId,
        ipAddress,
        verifiedAt: new Date(),
        duplicateDetected: true,
        duplicateUserId,
        duplicateEvidence: evidence,
      },
    });
  } else {
    await prisma.securityVerification.update({
      where: { id: verification.id },
      data: {
        status: VerificationStatus.VERIFIED,
        verifiedDiscordId,
        ipAddress,
        verifiedAt: new Date(),
      },
    });
  }

  // Grant verification role if configured
  const guildConfig = await prisma.guild.findUnique({
    where: { id: verification.guildId },
    select: { verificationRoleId: true },
  });

  if (guildConfig?.verificationRoleId && !duplicateDetected) {
    try {
      const guild = await client.guilds.fetch(verification.guildId).catch(() => null);
      if (guild) {
        const member = await guild.members.fetch(verifiedDiscordId).catch(() => null);
        if (member) {
          await member.roles.add(guildConfig.verificationRoleId).catch(() => null);
        }
      }
    } catch {
      logger.warn('SecurityVerif', `Impossible d'attribuer le rôle de vérification à ${verifiedDiscordId}`);
    }
  }

  return {
    success: true,
    message: duplicateDetected
      ? 'Vérification terminée. Un double compte potentiel a été détecté.'
      : 'Vérification réussie ! Votre identité a été confirmée.',
    duplicateDetected,
    duplicateUserId,
  };
}

async function notifyStaffOfDuplicate(
  client: Client,
  guildId: string,
  userId1: string,
  userId2: string,
  evidence: unknown,
  logChannelId: string | null | undefined,
  autoLinked: boolean,
): Promise<void> {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const method = evidence.method === 'oauth_mismatch'
    ? "L'utilisateur s'est authentifié avec un compte Discord différent de celui attendu."
    : `Les deux comptes partagent la même adresse IP.`;

  const embed = new EmbedBuilder()
    .setTitle(autoLinked ? '🔗 Double compte détecté et lié' : '⚠️ Double compte potentiel détecté')
    .setColor(autoLinked ? 0x57F287 : 0xFFA500)
    .setDescription(`Un double compte a été détecté via la vérification de sécurité.`)
    .addFields(
      { name: 'Compte 1', value: `<@${userId1}> (\`${userId1}\`)`, inline: true },
      { name: 'Compte 2', value: `<@${userId2}> (\`${userId2}\`)`, inline: true },
      { name: 'Méthode de détection', value: method },
      { name: 'Statut', value: autoLinked ? '✅ Comptes liés automatiquement' : '⏳ En attente de validation par le staff' },
    )
    .setTimestamp();

  const components: ActionRowBuilder<ButtonBuilder>[] = [];

  if (!autoLinked) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`secverif_validate:${userId1}:${userId2}`)
          .setLabel('Valider la liaison')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅'),
        new ButtonBuilder()
          .setCustomId(`secverif_reject:${userId1}:${userId2}`)
          .setLabel('Faux positif')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('❌'),
      ),
    );
  }

  const targetChannelId = logChannelId;
  if (targetChannelId) {
    const channel = await guild.channels.fetch(targetChannelId).catch(() => null) as TextChannel | null;
    if (channel) {
      await channel.send({ embeds: [embed], components, allowedMentions: { parse: [] } }).catch(() => null);
    }
  }

  // Notify managers via dashboard notifications
  const managers = await prisma.staffMember.findMany({
    where: {
      guildId,
      grade: { in: ['Manager', 'Admin', 'Administrateur', 'Fondateur', 'Direction'] },
    },
  });

  await Promise.all(
    managers.map(m =>
      createNotification(
        guildId,
        m.userId,
        autoLinked ? '🔗 DC détecté et lié' : '⚠️ DC potentiel détecté',
        `Double compte détecté : <@${userId1}> ↔ <@${userId2}> (${evidence.method === 'oauth_mismatch' ? 'OAuth mismatch' : 'même IP'}).`,
        autoLinked ? 'SUCCESS' : 'WARNING',
        '/double-accounts',
        false,
      ).catch(() => null),
    ),
  );
}

export async function handleVerificationStaffAction(interaction: unknown): Promise<void> {
  if (!interaction.isButton()) return;

  const parts = interaction.customId.split(':');
  const action = parts[0];
  const userId1 = parts[1];
  const userId2 = parts[2];

  if (action === 'secverif_validate') {
    await altAccountService.linkAccounts({
      guildId: interaction.guildId!,
      user1Id: userId1,
      user2Id: userId2,
      type: LinkedAccountType.AUTOMATIC,
      status: LinkedAccountStatus.VALIDATED,
      reason: 'Validé par le staff via vérification de sécurité.',
      linkedByUserId: interaction.user.id,
    });

    await interaction.update({
      content: `✅ Comptes <@${userId1}> et <@${userId2}> liés par <@${interaction.user.id}>.`,
      embeds: [],
      components: [],
    });
  } else if (action === 'secverif_reject') {
    // Mark the verification as not a duplicate
    await prisma.securityVerification.updateMany({
      where: {
        guildId: interaction.guildId!,
        userId: userId1,
        duplicateUserId: userId2,
        status: VerificationStatus.FLAGGED,
      },
      data: {
        status: VerificationStatus.VERIFIED,
        duplicateDetected: false,
        duplicateUserId: null,
      },
    });

    // Grant verification role since it was a false positive
    const guildConfig = await prisma.guild.findUnique({
      where: { id: interaction.guildId! },
      select: { verificationRoleId: true },
    });

    if (guildConfig?.verificationRoleId) {
      const guild = interaction.guild;
      if (guild) {
        const member = await guild.members.fetch(userId1).catch(() => null);
        if (member) {
          await member.roles.add(guildConfig.verificationRoleId).catch(() => null);
        }
      }
    }

    await interaction.update({
      content: `⚠️ Faux positif confirmé par <@${interaction.user.id}>. Alerte ignorée.`,
      embeds: [],
      components: [],
    });
  }
}

export async function cleanupExpiredVerifications(): Promise<number> {
  const result = await prisma.securityVerification.updateMany({
    where: {
      status: VerificationStatus.PENDING,
      expiresAt: { lt: new Date() },
    },
    data: { status: VerificationStatus.EXPIRED },
  });
  return result.count;
}
