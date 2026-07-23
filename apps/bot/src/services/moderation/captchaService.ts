import { type Client, type GuildMember, type Message, type TextChannel, AttachmentBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { createCanvas } from '@napi-rs/canvas';
import crypto from 'node:crypto';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { COLORS } from '../../utils/embeds.js';
import type { CaptchaSession, RaidProtectionConfig } from '@prisma/client';
import { getRaidProtectionConfig } from './raidProtectionService.js';

// Lettres sans ambiguïté (pas de I/O/0/1…)
const CAPTCHA_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CAPTCHA_LENGTH = 6;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CAPTCHA_LENGTH; i++) {
    code += CAPTCHA_ALPHABET[crypto.randomInt(CAPTCHA_ALPHABET.length)];
  }
  return code;
}

/** Génère l'image du captcha : lettres déformées + bruit (lignes, points). */
export function renderCaptchaImage(code: string): Buffer {
  const width = 360;
  const height = 140;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Fond
  ctx.fillStyle = '#2b2d31';
  ctx.fillRect(0, 0, width, height);

  // Lignes de bruit
  for (let i = 0; i < 8; i++) {
    ctx.strokeStyle = `rgba(${crypto.randomInt(100, 255)}, ${crypto.randomInt(100, 255)}, ${crypto.randomInt(100, 255)}, 0.35)`;
    ctx.lineWidth = 1 + crypto.randomInt(2);
    ctx.beginPath();
    ctx.moveTo(crypto.randomInt(width), crypto.randomInt(height));
    ctx.bezierCurveTo(
      crypto.randomInt(width), crypto.randomInt(height),
      crypto.randomInt(width), crypto.randomInt(height),
      crypto.randomInt(width), crypto.randomInt(height)
    );
    ctx.stroke();
  }

  // Lettres déformées
  const step = width / (CAPTCHA_LENGTH + 1);
  for (let i = 0; i < code.length; i++) {
    const fontSize = 52 + crypto.randomInt(16);
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = `rgb(${crypto.randomInt(180, 255)}, ${crypto.randomInt(180, 255)}, ${crypto.randomInt(180, 255)})`;
    ctx.save();
    const x = step * (i + 0.7) + crypto.randomInt(-8, 9);
    const y = height / 2 + crypto.randomInt(-12, 13);
    ctx.translate(x, y);
    ctx.rotate(((crypto.randomInt(-25, 26)) * Math.PI) / 180);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(code[i], 0, 0);
    ctx.restore();
  }

  // Points de bruit
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = `rgba(${crypto.randomInt(255)}, ${crypto.randomInt(255)}, ${crypto.randomInt(255)}, 0.4)`;
    ctx.fillRect(crypto.randomInt(width), crypto.randomInt(height), 2, 2);
  }

  return canvas.toBuffer('image/png');
}

// ── Cycle de vie d'une session ────────────────────────────────────────────────

/**
 * À l'arrivée d'un membre : applique le rôle non-vérifié, crée la session et
 * envoie l'image captcha dans le salon de vérification.
 */
export async function startCaptchaChallenge(member: GuildMember, config: RaidProtectionConfig): Promise<void> {
  if (member.user.bot) return;
  if (!config.captchaChannelId || !config.captchaUnverifiedRoleId) return;

  const me = member.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    logger.warn('Captcha', `Permission ManageRoles manquante sur ${member.guild.id}`);
    return;
  }

  await member.roles.add(config.captchaUnverifiedRoleId, 'Captcha : vérification requise').catch((err) => {
    logger.error('Captcha', `Impossible d'ajouter le rôle non-vérifié à ${member.id}`, err);
  });

  // Expire les sessions précédentes du membre
  await prisma.captchaSession.updateMany({
    where: { guildId: member.guild.id, userId: member.id, status: 'PENDING' },
    data: { status: 'EXPIRED' },
  });

  const code = generateCode();
  const session = await prisma.captchaSession.create({
    data: {
      guildId: member.guild.id,
      userId: member.id,
      code,
      expiresAt: new Date(Date.now() + config.captchaTimeoutMinutes * 60 * 1000),
    },
  });

  const channel = await member.guild.channels.fetch(config.captchaChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const attachment = new AttachmentBuilder(renderCaptchaImage(code), { name: 'captcha.png' });
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('🔐 Vérification requise')
    .setDescription(
      `Bienvenue ${member} !\n\nPour accéder au serveur, tape les **${CAPTCHA_LENGTH} caractères** affichés sur l'image ci-dessous dans ce salon.\n\n` +
      `⏱️ Tu as **${config.captchaTimeoutMinutes} minutes** et **${config.captchaMaxAttempts} tentatives**.`
    )
    .setImage('attachment://captcha.png')
    .setFooter({ text: 'Ce défi permet de vérifier que tu n\'es pas un robot.' });

  const sent = await (channel as TextChannel).send({ content: `${member}`, embeds: [embed], files: [attachment] }).catch(() => null);
  if (sent) {
    await prisma.captchaSession.update({ where: { id: session.id }, data: { messageId: sent.id } });
  }
}

/**
 * Traite un message posté dans le salon captcha : compare au code attendu.
 * Retourne true si le message a été consommé par le captcha.
 */
export async function handleCaptchaMessage(message: Message): Promise<boolean> {
  if (!message.guild || !message.member || message.author.bot) return false;

  const config = await getRaidProtectionConfig(message.guild.id);
  if (!config?.captchaEnabled || config.captchaChannelId !== message.channelId) return false;

  const session = await prisma.captchaSession.findFirst({
    where: { guildId: message.guild.id, userId: message.author.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });

  // Le membre n'a pas de session : on nettoie son message pour garder le salon propre
  await message.delete().catch(() => null);
  if (!session) return true;

  const answer = message.content.trim().toUpperCase();

  if (answer === session.code) {
    await prisma.captchaSession.update({ where: { id: session.id }, data: { status: 'VERIFIED' } });
    await cleanupCaptchaMessage(message.guild.id, session, message.client, config);

    if (config.captchaUnverifiedRoleId) {
      await message.member.roles.remove(config.captchaUnverifiedRoleId, 'Captcha réussi').catch(() => null);
    }

    const confirmation = message.channel.isSendable() ? await message.channel.send(`✅ ${message.author}, vérification réussie ! Bienvenue sur le serveur.`).catch(() => null) : null;
    if (confirmation) setTimeout(() => confirmation.delete().catch(() => null), 10_000);
    await logCaptcha(message.client, message.guild.id, config, `✅ <@${message.author.id}> a réussi le captcha.`);
    return true;
  }

  // Mauvaise réponse
  const attempts = session.attempts + 1;
  if (attempts >= config.captchaMaxAttempts) {
    await prisma.captchaSession.update({ where: { id: session.id }, data: { status: 'FAILED', attempts } });
    await cleanupCaptchaMessage(message.guild.id, session, message.client, config);
    await applyFailAction(message.member, config, 'Échec du captcha (tentatives épuisées)');
    await logCaptcha(message.client, message.guild.id, config, `❌ <@${message.author.id}> a échoué le captcha (${attempts} tentatives) — ${config.captchaFailAction === 'BAN' ? 'banni' : 'expulsé'}.`);
  } else {
    await prisma.captchaSession.update({ where: { id: session.id }, data: { attempts } });
    const warning = message.channel.isSendable()
      ? await message.channel.send(`⚠️ ${message.author}, code incorrect. Il te reste **${config.captchaMaxAttempts - attempts}** tentative(s).`).catch(() => null)
      : null;
    if (warning) setTimeout(() => warning.delete().catch(() => null), 8_000);
  }
  return true;
}

async function applyFailAction(member: GuildMember, config: RaidProtectionConfig, reason: string): Promise<void> {
  await member.send(`🔐 **${member.guild.name}** — ${reason}. Tu peux retenter en rejoignant à nouveau le serveur.`).catch(() => null);
  if (config.captchaFailAction === 'BAN') {
    await member.ban({ reason }).catch(() => null);
  } else {
    await member.kick(reason).catch(() => null);
  }
}

async function cleanupCaptchaMessage(guildId: string, session: CaptchaSession, client: Client, config: RaidProtectionConfig): Promise<void> {
  if (!session.messageId || !config.captchaChannelId) return;
  const guild = client.guilds.cache.get(guildId);
  const channel = guild ? await guild.channels.fetch(config.captchaChannelId).catch(() => null) : null;
  if (channel?.isTextBased()) {
    await (channel as TextChannel).messages.delete(session.messageId).catch(() => null);
  }
}

async function logCaptcha(client: Client, guildId: string, config: RaidProtectionConfig, content: string): Promise<void> {
  if (!config.captchaLogChannelId) return;
  const guild = client.guilds.cache.get(guildId);
  const channel = guild ? await guild.channels.fetch(config.captchaLogChannelId).catch(() => null) : null;
  if (channel?.isTextBased()) {
    await (channel as TextChannel).send(content).catch(() => null);
  }
}

/** Cron : expire les sessions dépassées et applique la sanction d'échec. */
export async function expireOverdueCaptchaSessions(client: Client): Promise<void> {
  const overdue = await prisma.captchaSession.findMany({
    where: { status: 'PENDING', expiresAt: { lte: new Date() } },
    take: 100,
  });

  for (const session of overdue) {
    await prisma.captchaSession.update({ where: { id: session.id }, data: { status: 'EXPIRED' } });

    const guild = client.guilds.cache.get(session.guildId);
    if (!guild) continue;
    const config = await getRaidProtectionConfig(session.guildId);
    if (!config?.captchaEnabled) continue;

    await cleanupCaptchaMessage(session.guildId, session, client, config);

    const member = await guild.members.fetch(session.userId).catch(() => null);
    // On ne sanctionne que si le membre porte toujours le rôle non-vérifié
    if (member && config.captchaUnverifiedRoleId && member.roles.cache.has(config.captchaUnverifiedRoleId)) {
      await applyFailAction(member, config, 'Captcha expiré (délai dépassé)');
      await logCaptcha(client, session.guildId, config, `⏱️ <@${session.userId}> n'a pas complété le captcha à temps — ${config.captchaFailAction === 'BAN' ? 'banni' : 'expulsé'}.`);
    }
  }
}
