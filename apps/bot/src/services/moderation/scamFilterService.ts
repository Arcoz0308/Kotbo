import { type Message, type TextChannel, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { createHash } from 'node:crypto';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { COLORS, truncate } from '../../utils/embeds.js';
import { getRaidProtectionConfig } from './raidProtectionService.js';
import { registerWarnSanction, registerTimeoutSanction, registerBanSanction } from './sanctionService.js';
import type { RaidProtectionConfig } from '@prisma/client';

// ── Heuristiques de détection d'arnaques (faux Nitro, phishing Steam/Discord…) ─

// Domaines légitimes qui ne doivent jamais être bloqués
const LEGIT_DOMAINS = new Set([
  'discord.com', 'discord.gg', 'discordapp.com', 'discordapp.net', 'discord.gift',
  'steamcommunity.com', 'steampowered.com', 'store.steampowered.com',
]);

// Patterns de domaines typiques des campagnes de scam
const SCAM_DOMAIN_PATTERNS: RegExp[] = [
  /d[il1]sc[o0]rd[a-z0-9-]*\.(?!com|gg)[a-z]{2,}/i,        // discörd lookalikes hors TLD officiels
  /discord[a-z0-9-]*(nitro|gift|airdrop|app|steam)[a-z0-9-]*\./i,
  /(nitro|gift)[a-z0-9-]*discord[a-z0-9-]*\./i,
  /ste[a4]m[a-z0-9-]*c[o0]mmun[il1]ty(?!\.com)[a-z0-9-]*\./i, // steamcommunity lookalikes
  /steamc?ommunlty\./i,
  /free[-_]?nitro/i,
  /nitro[-_]?(free|gen|drop)/i,
  /(airdrop|giveaway)[-_]?(nitro|crypto|eth|btc)/i,
];

// Combinaisons texte suspectes (mention massive + appât)
const SCAM_TEXT_PATTERNS: RegExp[] = [
  /@everyone[\s\S]{0,120}(free|gratuit)[\s\S]{0,40}(nitro|steam|skin|robux)/i,
  /(free|gratuit)\s+(discord\s+)?nitro[\s\S]{0,80}https?:\/\//i,
  /(steam\s+gift|cs2?\s*skins?|trade\s*offer)[\s\S]{0,80}https?:\/\/(?!(?:[a-z0-9-]+\.)?steam(?:community|powered)\.com)/i,
];

const URL_REGEX = /https?:\/\/([a-z0-9.-]+)/gi;

export type ScamDetection = { matched: true; domain?: string; pattern: string } | { matched: false };

export function detectScam(content: string, config: RaidProtectionConfig): ScamDetection {
  const whitelist = new Set(config.scamFilterWhitelist.map((d) => d.toLowerCase()));
  const customBlocked = config.scamFilterCustomDomains.map((d) => d.toLowerCase());

  // 1. Analyse des domaines présents dans le message
  for (const match of content.matchAll(URL_REGEX)) {
    const domain = match[1].toLowerCase();
    if (whitelist.has(domain) || LEGIT_DOMAINS.has(domain)) continue;

    if (customBlocked.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`))) {
      return { matched: true, domain, pattern: 'custom_domain' };
    }
    for (const pattern of SCAM_DOMAIN_PATTERNS) {
      if (pattern.test(domain)) return { matched: true, domain, pattern: pattern.source };
    }
  }

  // 2. Analyse des combinaisons de texte
  for (const pattern of SCAM_TEXT_PATTERNS) {
    if (pattern.test(content)) return { matched: true, pattern: pattern.source };
  }

  return { matched: false };
}

// ── Base d'images d'arnaques (hash SHA-256, alimentée par le honeypot) ────────

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES_PER_MESSAGE = 5;

async function hashRemoteImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) return null;
    return createHash('sha256').update(Buffer.from(buf)).digest('hex');
  } catch {
    return null;
  }
}

function imageAttachmentsOf(message: Message): { url: string; name: string }[] {
  return [...message.attachments.values()]
    .filter((a) => a.contentType?.startsWith('image/'))
    .slice(0, MAX_IMAGES_PER_MESSAGE)
    .map((a) => ({ url: a.url, name: a.name }));
}

/**
 * Enregistre les hash des images d'un message dans la base d'images scam.
 * Appelé par le honeypot quand un compte piégé poste une image.
 * Retourne le nombre d'images enregistrées.
 */
export async function recordScamImagesFromMessage(message: Message, source: 'HONEYPOT' | 'MANUAL' = 'HONEYPOT'): Promise<number> {
  if (!message.guild) return 0;
  let recorded = 0;

  for (const attachment of imageAttachmentsOf(message)) {
    const hash = await hashRemoteImage(attachment.url);
    if (!hash) continue;
    try {
      await prisma.scamImageHash.upsert({
        where: { guildId_hash: { guildId: message.guild.id, hash } },
        create: {
          guildId: message.guild.id,
          hash,
          filename: attachment.name,
          source,
          addedBy: message.author.id,
        },
        update: {},
      });
      recorded++;
    } catch (err) {
      logger.error('ScamFilter', `Enregistrement du hash d'image impossible (${message.guild.id})`, err);
    }
  }

  if (recorded > 0) {
    logger.info('ScamFilter', `${recorded} hash d'image(s) scam enregistré(s) pour ${message.guild.id} (source: ${source})`);
  }
  return recorded;
}

/** Compare les images du message aux hash d'images scam connues (guilde + globaux). */
export async function findKnownScamImage(message: Message): Promise<{ hash: string; filename: string | null } | null> {
  if (!message.guild || message.attachments.size === 0) return null;

  const hashes: string[] = [];
  for (const attachment of imageAttachmentsOf(message)) {
    const hash = await hashRemoteImage(attachment.url);
    if (hash) hashes.push(hash);
  }
  if (hashes.length === 0) return null;

  const match = await prisma.scamImageHash.findFirst({
    where: {
      hash: { in: hashes },
      OR: [{ guildId: message.guild.id }, { guildId: null }],
    },
    select: { hash: true, filename: true },
  });
  return match;
}

/** Traite un message : détection + action configurée. Retourne true si un scam a été traité. */
export async function handleScamMessage(message: Message): Promise<boolean> {
  if (!message.guild || !message.member || message.author.bot) return false;
  if (!message.content && message.attachments.size === 0) return false;

  const config = await getRaidProtectionConfig(message.guild.id);
  if (!config?.scamFilterEnabled) return false;

  // Le staff et les admins sont exemptés
  if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return false;

  let detection: ScamDetection = message.content ? detectScam(message.content, config) : { matched: false };

  // Comparaison des images avec la base d'images scam connues (honeypot)
  if (!detection.matched && config.scamImageFilterEnabled && message.attachments.size > 0) {
    const imageMatch = await findKnownScamImage(message);
    if (imageMatch) {
      detection = { matched: true, pattern: `known_scam_image:${imageMatch.filename ?? imageMatch.hash.slice(0, 12)}` };
    }
  }

  if (!detection.matched) return false;

  const guildId = message.guild.id;
  const reason = `Lien d'arnaque détecté${detection.domain ? ` (${detection.domain})` : ''}`;
  logger.warn('ScamFilter', `Scam détecté sur ${guildId} par ${message.author.id}: ${detection.pattern}`);

  await message.delete().catch(() => null);

  const target = { id: message.author.id, tag: message.author.tag };
  const moderator = { id: message.client.user.id, tag: message.client.user.tag };

  try {
    switch (config.scamFilterAction) {
      case 'DELETE_AND_WARN':
        await registerWarnSanction({ guildId, target, moderator, reason, client: message.client });
        break;
      case 'DELETE_AND_TIMEOUT':
        await registerTimeoutSanction({
          guildId, target, moderator, reason,
          durationMs: config.scamFilterTimeoutMin * 60 * 1000,
          member: message.member,
          client: message.client,
        });
        break;
      case 'DELETE_AND_BAN':
        await registerBanSanction({ guildId, target, moderator, reason, client: message.client });
        break;
      // 'DELETE' : suppression seule
    }
  } catch (err) {
    logger.error('ScamFilter', `Sanction impossible pour ${message.author.id}`, err);
  }

  // Alerte staff
  const alertChannelId = config.scamFilterAlertChannelId;
  if (alertChannelId) {
    const channel = await message.guild.channels.fetch(alertChannelId).catch(() => null);
    if (channel?.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor(COLORS.danger)
        .setTitle('🎣 Arnaque bloquée')
        .addFields(
          { name: 'Membre', value: `<@${message.author.id}> (\`${message.author.id}\`)`, inline: true },
          { name: 'Salon', value: `<#${message.channelId}>`, inline: true },
          { name: 'Action', value: config.scamFilterAction, inline: true },
          { name: 'Message', value: truncate(message.content, 1000), inline: false },
        )
        .setTimestamp();
      await (channel as TextChannel).send({ embeds: [embed] }).catch(() => null);
    }
  }

  return true;
}
