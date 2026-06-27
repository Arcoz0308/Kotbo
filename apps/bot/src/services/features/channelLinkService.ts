import {
  type Client,
  type Message,
  type MessageReaction,
  type TextChannel,
  type NewsChannel,
  type ThreadChannel,
  type User,
  EmbedBuilder,
  WebhookClient,
  ChannelType,
} from 'discord.js';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import { COLORS } from '../../utils/embeds.js';
import { cache } from '../../utils/cache.js';
import { randomBytes } from 'node:crypto';
import type { ChannelLink, ChannelLinkInvite } from '@prisma/client';

const TAG = 'ChannelLink';

// ── Cache helpers ───────────────────────────────────────────

function linksCacheKey(guildId: string, channelId: string) {
  return `channellinks:${guildId}:${channelId}`;
}

export async function getLinksForChannel(guildId: string, channelId: string): Promise<ChannelLink[]> {
  const key = linksCacheKey(guildId, channelId);
  const cached = await cache.get<ChannelLink[]>(key);
  if (cached) return cached;

  const links = await prisma.channelLink.findMany({
    where: {
      enabled: true,
      OR: [
        { sourceGuildId: guildId, sourceChannelId: channelId },
        { targetGuildId: guildId, targetChannelId: channelId },
      ],
    },
  });

  if (links.length > 0) {
    await cache.set(key, links, 120);
  }
  return links;
}

export async function invalidateLinkCache(link: ChannelLink) {
  await cache.delete(linksCacheKey(link.sourceGuildId, link.sourceChannelId));
  await cache.delete(linksCacheKey(link.targetGuildId, link.targetChannelId));
}

// ── Invite code generation ──────────────────────────────────

export function generateInviteCode(): string {
  return randomBytes(6).toString('hex').toUpperCase();
}

// ── Invite management ───────────────────────────────────────

export async function createLinkInvite(opts: {
  guildId: string;
  channelId: string;
  createdByUserId: string;
  direction?: 'BIDIRECTIONAL' | 'UNIDIRECTIONAL';
  relayMode?: 'WEBHOOK' | 'EMBED';
  relayText?: boolean;
  relayImages?: boolean;
  relayEmbeds?: boolean;
  relayReactions?: boolean;
  relayEdits?: boolean;
  relayDeletes?: boolean;
  relayThreads?: boolean;
  relayPolls?: boolean;
  expiresInMinutes?: number;
}): Promise<ChannelLinkInvite> {
  const code = generateInviteCode();
  const expiresAt = new Date(Date.now() + (opts.expiresInMinutes ?? 30) * 60 * 1000);

  return prisma.channelLinkInvite.create({
    data: {
      code,
      guildId: opts.guildId,
      channelId: opts.channelId,
      direction: opts.direction ?? 'BIDIRECTIONAL',
      relayMode: opts.relayMode ?? 'WEBHOOK',
      relayText: opts.relayText ?? true,
      relayImages: opts.relayImages ?? true,
      relayEmbeds: opts.relayEmbeds ?? false,
      relayReactions: opts.relayReactions ?? false,
      relayEdits: opts.relayEdits ?? true,
      relayDeletes: opts.relayDeletes ?? true,
      relayThreads: opts.relayThreads ?? false,
      relayPolls: opts.relayPolls ?? false,
      expiresAt,
      createdByUserId: opts.createdByUserId,
    },
  });
}

export async function acceptLinkInvite(opts: {
  code: string;
  targetGuildId: string;
  targetChannelId: string;
  updateTopic?: boolean;
  includeTopicLink?: boolean;
  client: Client;
}): Promise<{ link: ChannelLink; invite: ChannelLinkInvite } | { error: string }> {
  const invite = await prisma.channelLinkInvite.findUnique({
    where: { code: opts.code },
  });

  if (!invite) return { error: 'Code d\'invitation invalide.' };
  if (invite.status !== 'PENDING') return { error: 'Cette invitation a déjà été utilisée ou révoquée.' };
  if (invite.expiresAt < new Date()) {
    await prisma.channelLinkInvite.update({
      where: { id: invite.id },
      data: { status: 'EXPIRED' },
    });
    return { error: 'Cette invitation a expiré.' };
  }
  if (invite.uses >= invite.maxUses) return { error: 'Cette invitation a atteint son nombre maximum d\'utilisations.' };

  if (invite.guildId === opts.targetGuildId && invite.channelId === opts.targetChannelId) {
    return { error: 'Impossible de lier un salon à lui-même.' };
  }

  const existing = await prisma.channelLink.findFirst({
    where: {
      OR: [
        {
          sourceGuildId: invite.guildId,
          sourceChannelId: invite.channelId,
          targetGuildId: opts.targetGuildId,
          targetChannelId: opts.targetChannelId,
        },
        {
          sourceGuildId: opts.targetGuildId,
          sourceChannelId: opts.targetChannelId,
          targetGuildId: invite.guildId,
          targetChannelId: invite.channelId,
        },
      ],
    },
  });

  if (existing) return { error: 'Ces deux salons sont déjà liés.' };

  const sourceWebhookId = await createRelayWebhook(opts.client, invite.guildId, invite.channelId);
  const targetWebhookId = await createRelayWebhook(opts.client, opts.targetGuildId, opts.targetChannelId);

  const shouldUpdateTopic = opts.updateTopic ?? true;
  const includeLink = opts.includeTopicLink ?? true;

  const link = await prisma.channelLink.create({
    data: {
      sourceGuildId: invite.guildId,
      sourceChannelId: invite.channelId,
      targetGuildId: opts.targetGuildId,
      targetChannelId: opts.targetChannelId,
      direction: invite.direction,
      sourceRelayMode: invite.relayMode,
      targetRelayMode: invite.relayMode,
      sourceWebhookId,
      targetWebhookId,
      relayText: invite.relayText,
      relayImages: invite.relayImages,
      relayEmbeds: invite.relayEmbeds,
      relayReactions: invite.relayReactions,
      relayEdits: invite.relayEdits,
      relayDeletes: invite.relayDeletes,
      relayThreads: invite.relayThreads,
      relayPolls: invite.relayPolls,
      updateTopic: shouldUpdateTopic,
      createdByUserId: invite.createdByUserId,
      createdByGuildId: invite.guildId,
    },
  });

  await prisma.channelLinkInvite.update({
    where: { id: invite.id },
    data: { status: 'ACCEPTED', uses: { increment: 1 } },
  });

  if (shouldUpdateTopic) {
    await Promise.all([
      updateChannelTopic(opts.client, invite.guildId, invite.channelId, opts.targetChannelId, opts.targetGuildId, invite.createdByUserId, includeLink),
      updateChannelTopic(opts.client, opts.targetGuildId, opts.targetChannelId, invite.channelId, invite.guildId, invite.createdByUserId, includeLink),
    ]);
  }

  return { link, invite };
}

// ── Direct link creation (admin on both servers) ────────────

export async function createDirectLink(opts: {
  sourceGuildId: string;
  sourceChannelId: string;
  targetGuildId: string;
  targetChannelId: string;
  createdByUserId: string;
  direction?: 'BIDIRECTIONAL' | 'UNIDIRECTIONAL';
  relayMode?: 'WEBHOOK' | 'EMBED';
  relayThreads?: boolean;
  relayPolls?: boolean;
  updateTopic?: boolean;
  includeTopicLink?: boolean;
  client: Client;
}): Promise<ChannelLink | { error: string }> {
  if (opts.sourceGuildId === opts.targetGuildId && opts.sourceChannelId === opts.targetChannelId) {
    return { error: 'Impossible de lier un salon à lui-même.' };
  }

  const existing = await prisma.channelLink.findFirst({
    where: {
      OR: [
        {
          sourceGuildId: opts.sourceGuildId,
          sourceChannelId: opts.sourceChannelId,
          targetGuildId: opts.targetGuildId,
          targetChannelId: opts.targetChannelId,
        },
        {
          sourceGuildId: opts.targetGuildId,
          sourceChannelId: opts.targetChannelId,
          targetGuildId: opts.sourceGuildId,
          targetChannelId: opts.sourceChannelId,
        },
      ],
    },
  });

  if (existing) return { error: 'Ces deux salons sont déjà liés.' };

  const sourceWebhookId = await createRelayWebhook(opts.client, opts.sourceGuildId, opts.sourceChannelId);
  const targetWebhookId = await createRelayWebhook(opts.client, opts.targetGuildId, opts.targetChannelId);

  const shouldUpdateTopic = opts.updateTopic ?? true;
  const includeLink = opts.includeTopicLink ?? true;

  const link = await prisma.channelLink.create({
    data: {
      sourceGuildId: opts.sourceGuildId,
      sourceChannelId: opts.sourceChannelId,
      targetGuildId: opts.targetGuildId,
      targetChannelId: opts.targetChannelId,
      direction: opts.direction ?? 'BIDIRECTIONAL',
      sourceRelayMode: opts.relayMode ?? 'WEBHOOK',
      targetRelayMode: opts.relayMode ?? 'WEBHOOK',
      sourceWebhookId,
      targetWebhookId,
      relayReactions: true,
      relayThreads: opts.relayThreads ?? false,
      relayPolls: opts.relayPolls ?? false,
      updateTopic: shouldUpdateTopic,
      createdByUserId: opts.createdByUserId,
      createdByGuildId: opts.sourceGuildId,
    },
  });

  if (shouldUpdateTopic) {
    await Promise.all([
      updateChannelTopic(opts.client, opts.sourceGuildId, opts.sourceChannelId, opts.targetChannelId, opts.targetGuildId, opts.createdByUserId, includeLink),
      updateChannelTopic(opts.client, opts.targetGuildId, opts.targetChannelId, opts.sourceChannelId, opts.sourceGuildId, opts.createdByUserId, includeLink),
    ]);
  }

  return link;
}

// ── Webhook management ──────────────────────────────────────

async function createRelayWebhook(
  client: Client,
  guildId: string,
  channelId: string,
): Promise<string | null> {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return null;

    const channel = guild.channels.cache.get(channelId);
    if (!channel || !('createWebhook' in channel)) return null;

    const textChannel = channel as TextChannel | NewsChannel;

    const existingWebhooks = await textChannel.fetchWebhooks();
    const existing = existingWebhooks.find(
      (w) => w.owner?.id === client.user!.id && w.name === 'Kotbo Link Relay',
    );
    if (existing) return existing.id;

    const webhook = await textChannel.createWebhook({
      name: 'Kotbo Link Relay',
      reason: 'Cross-server channel link relay',
    });

    return webhook.id;
  } catch (err) {
    logger.warn(TAG, `Impossible de créer le webhook relay pour ${guildId}/${channelId}`, err);
    return null;
  }
}

// ── Topic management ───────────────────────────────────────

const TOPIC_MARKER_START = '🔗 ──── Kotbo Link ────';
const TOPIC_MARKER_END = '──── Kotbo Link 🔗';

function buildLinkTopicBlock(opts: {
  linkedChannelId: string;
  linkedGuildName: string;
  sameGuild: boolean;
  createdByUserId: string;
  includeLink: boolean;
  inviteUrl?: string;
}): string {
  const lines: string[] = [TOPIC_MARKER_START];

  if (opts.sameGuild) {
    lines.push(`Lié avec <#${opts.linkedChannelId}>`);
  } else {
    lines.push(`Lié avec ${opts.linkedGuildName}`);
  }

  lines.push(`Par <@${opts.createdByUserId}>`);

  if (opts.includeLink) {
    if (opts.sameGuild) {
      lines.push(`→ <#${opts.linkedChannelId}>`);
    } else if (opts.inviteUrl) {
      lines.push(`→ Rejoindre : ${opts.inviteUrl}`);
    }
  }

  lines.push(TOPIC_MARKER_END);
  return lines.join('\n');
}

function stripLinkTopic(topic: string): string {
  const regex = new RegExp(
    `\\n?${TOPIC_MARKER_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${TOPIC_MARKER_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`,
    'g',
  );
  return topic.replace(regex, '').trim();
}

async function updateChannelTopic(
  client: Client,
  guildId: string,
  channelId: string,
  linkedChannelId: string,
  linkedGuildId: string,
  createdByUserId: string,
  includeLink: boolean,
): Promise<void> {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      logger.warn(TAG, `Guild ${guildId} introuvable dans le cache pour mise à jour du topic`);
      return;
    }
    const channel = guild.channels.cache.get(channelId);
    if (!channel || !('setTopic' in channel)) {
      logger.warn(TAG, `Channel ${channelId} introuvable ou sans topic dans ${guildId}`);
      return;
    }

    const textChannel = channel as TextChannel;
    const currentTopic = textChannel.topic ?? '';
    const cleanTopic = stripLinkTopic(currentTopic);

    const linkedGuild = client.guilds.cache.get(linkedGuildId);
    const sameGuild = guildId === linkedGuildId;

    let inviteUrl: string | undefined;
    if (!sameGuild && includeLink && linkedGuild) {
      try {
        const linkedChannel = linkedGuild.channels.cache.get(linkedChannelId);
        if (linkedChannel && 'createInvite' in linkedChannel && typeof linkedChannel.createInvite === 'function') {
          const invite = await linkedChannel.createInvite({
            maxAge: 0,
            maxUses: 0,
            reason: `Kotbo Link: invitation pour le topic de #${textChannel.name}`,
          });
          inviteUrl = invite.url;
        }
      } catch (err) {
        logger.warn(TAG, `Impossible de créer l'invitation Discord pour ${linkedGuildId}/${linkedChannelId}`, err);
      }
    }

    const block = buildLinkTopicBlock({
      linkedChannelId,
      linkedGuildName: linkedGuild?.name ?? linkedGuildId,
      sameGuild,
      createdByUserId,
      includeLink,
      inviteUrl,
    });

    const newTopic = cleanTopic ? `${cleanTopic}\n${block}` : block;
    await textChannel.setTopic(newTopic).catch((err) =>
      logger.warn(TAG, `Impossible de mettre à jour le topic de ${channelId}`, err),
    );
  } catch (err) {
    logger.warn(TAG, `Erreur mise à jour topic ${guildId}/${channelId}`, err);
  }
}

async function clearChannelLinkTopic(
  client: Client,
  guildId: string,
  channelId: string,
): Promise<void> {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const channel = guild.channels.cache.get(channelId);
    if (!channel || !('setTopic' in channel)) return;

    const textChannel = channel as TextChannel;
    const currentTopic = textChannel.topic ?? '';
    const cleanTopic = stripLinkTopic(currentTopic);

    await textChannel.setTopic(cleanTopic || null).catch((err) =>
      logger.warn(TAG, `Impossible de nettoyer le topic de ${channelId}`, err),
    );
  } catch (err) {
    logger.warn(TAG, `Erreur nettoyage topic ${guildId}/${channelId}`, err);
  }
}

// ── Helpers ─────────────────────────────────────────────────

function resolveRelay(link: ChannelLink, guildId: string, channelId: string) {
  const isSource = link.sourceGuildId === guildId && link.sourceChannelId === channelId;
  const isTarget = link.targetGuildId === guildId && link.targetChannelId === channelId;
  if (!isSource && !isTarget) return null;
  if (link.direction === 'UNIDIRECTIONAL' && isTarget) return null;
  return {
    isSource,
    destGuildId: isSource ? link.targetGuildId : link.sourceGuildId,
    destChannelId: isSource ? link.targetChannelId : link.sourceChannelId,
    relayMode: isSource ? link.targetRelayMode : link.sourceRelayMode,
    webhookId: isSource ? link.targetWebhookId : link.sourceWebhookId,
  };
}

async function getWebhookClient(destChannel: TextChannel, webhookId: string): Promise<WebhookClient | null> {
  try {
    const webhooks = await destChannel.fetchWebhooks();
    const webhook = webhooks.get(webhookId);
    if (!webhook?.token) return null;
    return new WebhookClient({ id: webhook.id, token: webhook.token });
  } catch {
    return null;
  }
}

async function saveMessageMapping(linkId: string, sourceMessageId: string, sourceChannelId: string, relayedMessageId: string, relayedChannelId: string, webhookId?: string | null) {
  logger.debug(TAG, `Saving mapping: ${sourceMessageId} → ${relayedMessageId} (webhook: ${webhookId ?? 'none'})`);
  await prisma.channelLinkMessage.create({
    data: { channelLinkId: linkId, sourceMessageId, sourceChannelId, relayedMessageId, relayedChannelId, webhookId },
  }).catch((err) => logger.warn(TAG, 'Impossible de sauvegarder le mapping message', err));
}

async function findRelayedMessage(linkId: string, sourceMessageId: string) {
  return prisma.channelLinkMessage.findUnique({
    where: { channelLinkId_sourceMessageId: { channelLinkId: linkId, sourceMessageId } },
  });
}

async function findSourceMessage(linkId: string, relayedMessageId: string, relayedChannelId: string) {
  return prisma.channelLinkMessage.findFirst({
    where: { channelLinkId: linkId, relayedMessageId, relayedChannelId },
  });
}

// ── Message relay ───────────────────────────────────────────

export async function relayMessage(message: Message, client: Client): Promise<void> {
  if (message.author.bot || !message.guild) return;

  const links = await getLinksForChannel(message.guild.id, message.channel.id);
  if (links.length === 0) return;

  logger.debug(TAG, `Relay message ${message.id} dans ${message.channel.id} — ${links.length} lien(s) trouvé(s)`);

  for (const link of links) {
    try {
      const relay = resolveRelay(link, message.guild.id, message.channel.id);
      if (!relay) continue;

      if (!link.relayText && !message.attachments.size) continue;

      const destGuild = client.guilds.cache.get(relay.destGuildId);
      if (!destGuild) continue;
      const destChannel = destGuild.channels.cache.get(relay.destChannelId);
      if (!destChannel || !destChannel.isTextBased()) continue;

      // Resolve reply context (check both directions: original→relayed and relayed→original)
      let replyContent = '';
      if (message.reference?.messageId) {
        const mapping = await findRelayedMessage(link.id, message.reference.messageId);
        if (mapping) {
          replyContent = `https://discord.com/channels/${relay.destGuildId}/${mapping.relayedChannelId}/${mapping.relayedMessageId}`;
        } else {
          const reverseMapping = await findSourceMessage(link.id, message.reference.messageId, message.channel.id);
          if (reverseMapping) {
            replyContent = `https://discord.com/channels/${relay.destGuildId}/${reverseMapping.sourceChannelId}/${reverseMapping.sourceMessageId}`;
          }
        }
      }

      if (relay.relayMode === 'WEBHOOK' && relay.webhookId) {
        const webhookClient = await getWebhookClient(destChannel as TextChannel, relay.webhookId);
        if (!webhookClient) {
          logger.warn(TAG, `Webhook ${relay.webhookId} introuvable pour relay vers ${relay.destGuildId}/${relay.destChannelId} — recréation...`);
          const newWebhookId = await createRelayWebhook(client, relay.destGuildId, relay.destChannelId);
          if (newWebhookId) {
            const updateField = relay.isSource ? 'targetWebhookId' : 'sourceWebhookId';
            await prisma.channelLink.update({ where: { id: link.id }, data: { [updateField]: newWebhookId } });
            await invalidateLinkCache(link);
          }
          continue;
        }

        const content = link.relayText ? message.content : '';
        const files = link.relayImages
          ? message.attachments.map((a) => ({ attachment: a.url, name: a.name ?? 'file' }))
          : [];

        let fullContent = '';
        if (replyContent) {
          const refMsg = await message.fetchReference().catch(() => null);
          const refAuthor = refMsg?.author?.displayName || refMsg?.author?.username || '?';
          const refPreview = refMsg?.content?.slice(0, 50) || '';
          fullContent += `> **↩ ${refAuthor}:** ${refPreview}${(refMsg?.content?.length ?? 0) > 50 ? '…' : ''}\n> [Aller au message](${replyContent})\n`;
        }
        if (content) fullContent += content;

        const sent = await webhookClient.send({
          content: fullContent || undefined,
          username: message.author.displayName || message.author.username,
          avatarURL: message.author.displayAvatarURL(),
          files,
          allowedMentions: { parse: [] },
        });

        await saveMessageMapping(link.id, message.id, message.channel.id, sent.id, relay.destChannelId, relay.webhookId);
        webhookClient.destroy();
      } else {
        const sourceGuild = message.guild!;
        const embed = new EmbedBuilder()
          .setColor(COLORS.info)
          .setAuthor({
            name: `${message.author.displayName || message.author.username} • ${sourceGuild.name}`,
            iconURL: message.author.displayAvatarURL(),
          })
          .setTimestamp(message.createdAt)
          .setFooter({ text: `🔗 ${sourceGuild.name}`, iconURL: sourceGuild.iconURL() ?? undefined });

        let desc = '';
        if (replyContent) desc += `> ↩ [Message cité](${replyContent})\n\n`;
        if (link.relayText && message.content) desc += message.content;
        if (desc) embed.setDescription(desc);

        if (link.relayImages && message.attachments.size > 0) {
          const img = message.attachments.find((a) => a.contentType?.startsWith('image/'));
          if (img) embed.setImage(img.url);
        }

        const files = link.relayImages
          ? message.attachments.filter((a) => !a.contentType?.startsWith('image/')).map((a) => ({ attachment: a.url, name: a.name ?? 'file' }))
          : [];

        const sent = await (destChannel as TextChannel).send({ embeds: [embed], files });
        await saveMessageMapping(link.id, message.id, message.channel.id, sent.id, relay.destChannelId);
      }
    } catch (err) {
      logger.error(TAG, `Erreur relay message ${message.id} vers link ${link.id}`, err);
    }
  }
}

// ── Edit relay ──────────────────────────────────────────────

export async function relayMessageEdit(message: Message, client: Client): Promise<void> {
  if (message.author.bot || !message.guild) return;

  const links = await getLinksForChannel(message.guild.id, message.channel.id);
  const editLinks = links.filter((l) => l.relayEdits);
  if (editLinks.length === 0) return;

  for (const link of editLinks) {
    try {
      const relay = resolveRelay(link, message.guild.id, message.channel.id);
      if (!relay) continue;

      const mapping = await findRelayedMessage(link.id, message.id);
      logger.debug(TAG, `Edit relay ${message.id}: mapping=${mapping ? mapping.relayedMessageId : 'none'}`);
      if (!mapping) continue;

      const destGuild = client.guilds.cache.get(relay.destGuildId);
      if (!destGuild) continue;
      const destChannel = destGuild.channels.cache.get(relay.destChannelId);
      if (!destChannel || !destChannel.isTextBased()) continue;

      if (mapping.webhookId) {
        const webhookClient = await getWebhookClient(destChannel as TextChannel, mapping.webhookId);
        if (!webhookClient) {
          logger.warn(TAG, `Webhook introuvable pour edit ${mapping.webhookId}`);
          continue;
        }

        await webhookClient.editMessage(mapping.relayedMessageId, {
          content: message.content || undefined,
          allowedMentions: { parse: [] },
        }).catch((err) => logger.warn(TAG, `Impossible d'éditer le message webhook ${mapping.relayedMessageId}`, err));

        webhookClient.destroy();
      } else {
        const relayedMsg = await (destChannel as TextChannel).messages.fetch(mapping.relayedMessageId).catch(() => null);
        if (relayedMsg?.editable && relayedMsg.embeds.length > 0) {
          const oldEmbed = relayedMsg.embeds[0];
          const newEmbed = EmbedBuilder.from(oldEmbed).setDescription(message.content || '*[vide]*');
          await relayedMsg.edit({ embeds: [newEmbed] }).catch(() => null);
        }
      }
    } catch (err) {
      logger.error(TAG, `Erreur relay edit ${message.id}`, err);
    }
  }
}

// ── Delete relay ────────────────────────────────────────────

export async function relayMessageDelete(message: Message, client: Client): Promise<void> {
  if (message.author?.bot || !message.guild) return;

  const links = await getLinksForChannel(message.guild.id, message.channel.id);
  const deleteLinks = links.filter((l) => l.relayDeletes);
  if (deleteLinks.length === 0) return;

  for (const link of deleteLinks) {
    try {
      const relay = resolveRelay(link, message.guild.id, message.channel.id);
      if (!relay) continue;

      const mapping = await findRelayedMessage(link.id, message.id);
      if (!mapping) continue;

      const destGuild = client.guilds.cache.get(relay.destGuildId);
      if (!destGuild) continue;
      const destChannel = destGuild.channels.cache.get(relay.destChannelId);
      if (!destChannel || !destChannel.isTextBased()) continue;

      if (relay.relayMode === 'WEBHOOK' && mapping.webhookId) {
        const webhookClient = await getWebhookClient(destChannel as TextChannel, mapping.webhookId);
        if (webhookClient) {
          await webhookClient.deleteMessage(mapping.relayedMessageId).catch(() => null);
          webhookClient.destroy();
        }
      } else {
        const relayedMsg = await (destChannel as TextChannel).messages.fetch(mapping.relayedMessageId).catch(() => null);
        if (relayedMsg?.deletable) await relayedMsg.delete().catch(() => null);
      }

      await prisma.channelLinkMessage.delete({ where: { id: mapping.id } }).catch(() => null);
    } catch (err) {
      logger.error(TAG, `Erreur relay delete ${message.id}`, err);
    }
  }
}

// ── Reaction relay ──────────────────────────────────────────

export async function relayReactionAdd(reaction: MessageReaction, user: User, client: Client): Promise<void> {
  if (user.bot || !reaction.message.guild) return;

  const guildId = reaction.message.guild.id;
  const channelId = reaction.message.channel.id;
  const messageId = reaction.message.id;

  const links = await getLinksForChannel(guildId, channelId);
  const reactionLinks = links.filter((l) => l.relayReactions);
  if (reactionLinks.length === 0) return;

  for (const link of reactionLinks) {
    try {
      const mapping = await findRelayedMessage(link.id, messageId);
      const reverseMapping = !mapping ? await findSourceMessage(link.id, messageId, channelId) : null;

      if (!mapping && !reverseMapping) continue;

      let targetGuildId: string;
      let targetChannelId: string;
      let targetMessageId: string;

      if (mapping) {
        const relay = resolveRelay(link, guildId, channelId);
        if (!relay) continue;
        targetGuildId = relay.destGuildId;
        targetChannelId = mapping.relayedChannelId;
        targetMessageId = mapping.relayedMessageId;
      } else {
        // Reaction on a relayed (webhook) message → relay to the original message's guild
        const sourceIsOnSourceSide = reverseMapping!.sourceChannelId === link.sourceChannelId;
        targetGuildId = sourceIsOnSourceSide ? link.sourceGuildId : link.targetGuildId;
        targetChannelId = reverseMapping!.sourceChannelId;
        targetMessageId = reverseMapping!.sourceMessageId;
      }

      const destGuild = client.guilds.cache.get(targetGuildId);
      if (!destGuild) continue;
      const destChannel = destGuild.channels.cache.get(targetChannelId);
      if (!destChannel || !destChannel.isTextBased()) continue;

      const targetMsg = await (destChannel as TextChannel).messages.fetch(targetMessageId).catch(() => null);
      if (!targetMsg) continue;

      const emoji = reaction.emoji.id ? `${reaction.emoji.name}:${reaction.emoji.id}` : reaction.emoji.name;
      if (emoji) await targetMsg.react(emoji).catch(() => null);
    } catch (err) {
      logger.error(TAG, `Erreur relay reaction ${reaction.emoji.name}`, err);
    }
  }
}

// ── Typing relay ────────────────────────────────────────────

export async function relayTyping(channelId: string, guildId: string, userId: string, client: Client): Promise<void> {
  const links = await getLinksForChannel(guildId, channelId);
  if (links.length === 0) return;

  for (const link of links) {
    try {
      const relay = resolveRelay(link, guildId, channelId);
      if (!relay) continue;

      const destGuild = client.guilds.cache.get(relay.destGuildId);
      if (!destGuild) continue;
      const destChannel = destGuild.channels.cache.get(relay.destChannelId);
      if (!destChannel || !destChannel.isTextBased()) continue;

      await (destChannel as TextChannel).sendTyping().catch(() => null);
    } catch {
      // Silent
    }
  }
}

// ── Thread relay ───────────────────────────────────────────

async function findLinkedThread(linkId: string, sourceThreadId: string) {
  return prisma.channelLinkThread.findUnique({
    where: { channelLinkId_sourceThreadId: { channelLinkId: linkId, sourceThreadId } },
  });
}

async function findLinkedThreadReverse(linkId: string, relayedThreadId: string) {
  return prisma.channelLinkThread.findFirst({
    where: { channelLinkId: linkId, relayedThreadId },
  });
}

export async function relayThreadCreate(thread: ThreadChannel, client: Client): Promise<void> {
  if (!thread.parent || !thread.guild) return;

  const links = await getLinksForChannel(thread.guild.id, thread.parent.id);
  const threadLinks = links.filter((l) => l.relayThreads);
  if (threadLinks.length === 0) return;

  for (const link of threadLinks) {
    try {
      const relay = resolveRelay(link, thread.guild.id, thread.parent.id);
      if (!relay) continue;

      const existing = await findLinkedThread(link.id, thread.id);
      if (existing) continue;

      const destGuild = client.guilds.cache.get(relay.destGuildId);
      if (!destGuild) continue;
      const destChannel = destGuild.channels.cache.get(relay.destChannelId);
      if (!destChannel || !destChannel.isTextBased()) continue;

      const textChannel = destChannel as TextChannel;
      const starterMessage = await thread.fetchStarterMessage().catch(() => null);

      const newThread = await textChannel.threads.create({
        name: thread.name,
        autoArchiveDuration: thread.autoArchiveDuration ?? 1440,
        reason: `Kotbo Link: thread synchronisé depuis ${thread.guild.name}`,
      });

      if (starterMessage?.content) {
        const webhookClient = relay.webhookId ? await getWebhookClient(textChannel, relay.webhookId) : null;
        if (webhookClient) {
          await webhookClient.send({
            content: starterMessage.content,
            username: starterMessage.author.displayName || starterMessage.author.username,
            avatarURL: starterMessage.author.displayAvatarURL(),
            threadId: newThread.id,
            allowedMentions: { parse: [] },
          }).catch(() => null);
          webhookClient.destroy();
        } else {
          await newThread.send({
            embeds: [new EmbedBuilder()
              .setColor(COLORS.info)
              .setAuthor({
                name: `${starterMessage.author.displayName || starterMessage.author.username} • ${thread.guild.name}`,
                iconURL: starterMessage.author.displayAvatarURL(),
              })
              .setDescription(starterMessage.content)
              .setTimestamp(starterMessage.createdAt)],
          }).catch(() => null);
        }
      }

      await prisma.channelLinkThread.create({
        data: {
          channelLinkId: link.id,
          sourceThreadId: thread.id,
          sourceGuildId: thread.guild.id,
          relayedThreadId: newThread.id,
          relayedGuildId: relay.destGuildId,
          webhookId: relay.webhookId,
        },
      });

      logger.info(TAG, `Thread ${thread.name} synchronisé: ${thread.id} → ${newThread.id}`);
    } catch (err) {
      logger.error(TAG, `Erreur relay thread create ${thread.id}`, err);
    }
  }
}

export async function relayThreadMessage(message: Message, client: Client): Promise<void> {
  if (message.author.bot || !message.guild || !message.channel.isThread()) return;

  const thread = message.channel as ThreadChannel;
  if (!thread.parent) return;

  const links = await getLinksForChannel(message.guild.id, thread.parent.id);
  const threadLinks = links.filter((l) => l.relayThreads);
  if (threadLinks.length === 0) return;

  for (const link of threadLinks) {
    try {
      const linkedThread = await findLinkedThread(link.id, thread.id);
      const reverseLinkedThread = !linkedThread ? await findLinkedThreadReverse(link.id, thread.id) : null;

      if (!linkedThread && !reverseLinkedThread) continue;

      let destGuildId: string;
      let destThreadId: string;
      let webhookId: string | null;

      if (linkedThread) {
        destGuildId = linkedThread.relayedGuildId;
        destThreadId = linkedThread.relayedThreadId;
        webhookId = linkedThread.webhookId;
      } else {
        destGuildId = reverseLinkedThread!.sourceGuildId;
        destThreadId = reverseLinkedThread!.sourceThreadId;
        webhookId = reverseLinkedThread!.webhookId;
      }

      const destGuild = client.guilds.cache.get(destGuildId);
      if (!destGuild) continue;

      const destThread = destGuild.channels.cache.get(destThreadId) as ThreadChannel | undefined;
      if (!destThread?.isThread()) continue;

      const parentChannel = destThread.parent as TextChannel | null;

      if (webhookId && parentChannel) {
        const webhookClient = await getWebhookClient(parentChannel, webhookId);
        if (webhookClient) {
          const files = link.relayImages
            ? message.attachments.map((a) => ({ attachment: a.url, name: a.name ?? 'file' }))
            : [];

          await webhookClient.send({
            content: message.content || undefined,
            username: message.author.displayName || message.author.username,
            avatarURL: message.author.displayAvatarURL(),
            threadId: destThread.id,
            files,
            allowedMentions: { parse: [] },
          });

          webhookClient.destroy();
        }
      } else {
        const embed = new EmbedBuilder()
          .setColor(COLORS.info)
          .setAuthor({
            name: `${message.author.displayName || message.author.username} • ${message.guild.name}`,
            iconURL: message.author.displayAvatarURL(),
          })
          .setDescription(message.content || '*[vide]*')
          .setTimestamp(message.createdAt);

        const files = link.relayImages
          ? message.attachments.filter((a) => !a.contentType?.startsWith('image/')).map((a) => ({ attachment: a.url, name: a.name ?? 'file' }))
          : [];

        const img = link.relayImages ? message.attachments.find((a) => a.contentType?.startsWith('image/')) : undefined;
        if (img) embed.setImage(img.url);

        await destThread.send({ embeds: [embed], files });
      }
    } catch (err) {
      logger.error(TAG, `Erreur relay thread message ${message.id}`, err);
    }
  }
}

export async function relayThreadDelete(thread: ThreadChannel, client: Client): Promise<void> {
  if (!thread.parent || !thread.guild) return;

  const links = await getLinksForChannel(thread.guild.id, thread.parent.id);
  const threadLinks = links.filter((l) => l.relayThreads);
  if (threadLinks.length === 0) return;

  for (const link of threadLinks) {
    try {
      const linkedThread = await findLinkedThread(link.id, thread.id);
      if (!linkedThread) continue;

      const destGuild = client.guilds.cache.get(linkedThread.relayedGuildId);
      if (!destGuild) continue;
      const destThread = destGuild.channels.cache.get(linkedThread.relayedThreadId) as ThreadChannel | undefined;
      if (destThread?.isThread()) {
        await destThread.setArchived(true).catch(() => null);
      }

      await prisma.channelLinkThread.delete({ where: { id: linkedThread.id } }).catch(() => null);
      logger.info(TAG, `Thread supprimé/archivé: ${thread.id} → ${linkedThread.relayedThreadId}`);
    } catch (err) {
      logger.error(TAG, `Erreur relay thread delete ${thread.id}`, err);
    }
  }
}

// ── Poll relay ─────────────────────────────────────────────

export async function relayPollMessage(message: Message, client: Client): Promise<void> {
  if (message.author.bot || !message.guild || !message.poll) return;

  const links = await getLinksForChannel(message.guild.id, message.channel.id);
  const pollLinks = links.filter((l) => l.relayPolls);
  if (pollLinks.length === 0) return;

  for (const link of pollLinks) {
    try {
      const relay = resolveRelay(link, message.guild.id, message.channel.id);
      if (!relay) continue;

      const destGuild = client.guilds.cache.get(relay.destGuildId);
      if (!destGuild) continue;
      const destChannel = destGuild.channels.cache.get(relay.destChannelId);
      if (!destChannel || !destChannel.isTextBased()) continue;

      const poll = message.poll;
      const answers = poll.answers.map((a) => {
        const emoji = a.emoji?.name ? (a.emoji.id ? `<:${a.emoji.name}:${a.emoji.id}>` : a.emoji.name) : '';
        return `${emoji} ${a.text}`.trim();
      });

      const embed = new EmbedBuilder()
        .setColor(COLORS.info)
        .setAuthor({
          name: `${message.author.displayName || message.author.username} • ${message.guild.name}`,
          iconURL: message.author.displayAvatarURL(),
        })
        .setTitle(`📊 ${poll.question.text}`)
        .setDescription(answers.map((a, i) => `**${i + 1}.** ${a}`).join('\n'))
        .setFooter({ text: `Sondage relayé • ${poll.allowMultiselect ? 'Choix multiples' : 'Choix unique'}` })
        .setTimestamp(message.createdAt);

      if (poll.expiresAt) {
        embed.addFields({ name: 'Expire', value: `<t:${Math.floor(poll.expiresAt.getTime() / 1000)}:R>`, inline: true });
      }

      const sent = await (destChannel as TextChannel).send({ embeds: [embed] });
      await saveMessageMapping(link.id, message.id, message.channel.id, sent.id, relay.destChannelId);
    } catch (err) {
      logger.error(TAG, `Erreur relay poll ${message.id}`, err);
    }
  }
}

// ── Link management ─────────────────────────────────────────

export async function listLinksForGuild(guildId: string): Promise<ChannelLink[]> {
  return prisma.channelLink.findMany({
    where: {
      OR: [{ sourceGuildId: guildId }, { targetGuildId: guildId }],
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function removeLink(linkId: string, client?: Client): Promise<ChannelLink | null> {
  const link = await prisma.channelLink.findUnique({ where: { id: linkId } });
  if (!link) return null;

  await invalidateLinkCache(link);
  const deleted = await prisma.channelLink.delete({ where: { id: linkId } });

  if (client && deleted.updateTopic) {
    await Promise.all([
      clearChannelLinkTopic(client, deleted.sourceGuildId, deleted.sourceChannelId),
      clearChannelLinkTopic(client, deleted.targetGuildId, deleted.targetChannelId),
    ]);
  }

  return deleted;
}

export async function updateLinkConfig(
  linkId: string,
  data: Partial<Pick<ChannelLink, 'relayText' | 'relayImages' | 'relayEmbeds' | 'relayReactions' | 'relayEdits' | 'relayDeletes' | 'relayThreads' | 'relayPolls' | 'sourceRelayMode' | 'targetRelayMode' | 'direction' | 'enabled' | 'updateTopic'>>,
): Promise<ChannelLink | null> {
  const link = await prisma.channelLink.findUnique({ where: { id: linkId } });
  if (!link) return null;

  const updated = await prisma.channelLink.update({
    where: { id: linkId },
    data,
  });

  await invalidateLinkCache(updated);
  return updated;
}
