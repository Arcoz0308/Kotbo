/**
 * Helpers partages autour des "preuves" (evidence) attachees aux sanctions.
 *
 * Ces fonctions etaient dupliquees a l'identique entre `api/mcp/mcpTools.ts`,
 * `api/routes/dashboard/modules.ts` et `api/shared.ts`. Elles vivent desormais
 * ici, seule source de verite.
 */
import {
  ChannelType,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type Message,
  type TextChannel,
} from 'discord.js';
import { resolveMentionsToText, embedToApiShape } from '../services/features/transcriptService.js';

/** Nombre maximum de messages retenus comme preuve pour une sanction. */
export const MAX_EVIDENCE_MESSAGES = 200;
/** Plafond de messages parcourus lors de la recherche, pour borner le cout API. */
export const MAX_SCAN_MESSAGES = 400;
/** Nombre de salons scannes en parallele. */
export const EVIDENCE_CHANNEL_CONCURRENCY = 5;

export interface FetchedEvidenceChannel {
  channelId: string;
  channelName: string;
  rawMessages: Message[];
  truncated: boolean;
}

/** Ne conserve que les entrees qui sont des URLs http(s) valides. */
export function parseEvidenceLinks(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => /^https?:\/\//i.test(entry));
}

/**
 * Resout un salon exploitable comme source de preuves : il doit exister, etre
 * textuel, et le bot doit pouvoir y lire l'historique.
 */
export async function resolveEvidenceChannel(
  client: Client,
  guildId: string,
  channelId: string,
): Promise<{ channel: TextChannel } | { error: string }> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    return { error: 'Serveur Discord introuvable.' };
  }

  let channel = guild.channels.cache.get(channelId) ?? null;
  if (!channel) {
    channel = await guild.channels.fetch(channelId).catch(() => null);
  }
  if (!channel) {
    return { error: 'Salon introuvable sur ce serveur.' };
  }

  if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
    return { error: 'Ce type de salon n’est pas encore pris en charge.' };
  }

  const textChannel = channel as TextChannel;
  const me = guild.members.me;
  if (!me || !textChannel.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory])) {
    return { error: "Le bot n'a pas accès à ce salon." };
  }

  return { channel: textChannel };
}

/**
 * Remonte les messages d'un auteur dans un salon, du plus ancien au plus recent.
 * `truncated` signale que le plafond de scan a ete atteint avant d'avoir reuni
 * `limit` messages : il peut donc en rester d'autres plus haut dans l'historique.
 */
export async function fetchUserMessagesInChannel(
  channel: TextChannel,
  authorId: string,
  limit = MAX_EVIDENCE_MESSAGES,
): Promise<{ messages: Message[]; truncated: boolean }> {
  const matched: Message[] = [];
  let scanned = 0;
  let cursor: string | undefined;
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), MAX_EVIDENCE_MESSAGES);

  while (matched.length < safeLimit && scanned < MAX_SCAN_MESSAGES) {
    const batch = await channel.messages.fetch({ limit: 100, before: cursor });
    if (batch.size === 0) break;

    for (const msg of batch.values()) {
      scanned++;
      if (msg.author.id === authorId) {
        matched.push(msg);
        if (matched.length >= safeLimit) break;
      }
    }

    cursor = batch.last()?.id;
    if (batch.size < 100) break;
  }

  return {
    messages: matched.sort((a, b) => a.createdTimestamp - b.createdTimestamp),
    truncated: matched.length < safeLimit && scanned >= MAX_SCAN_MESSAGES,
  };
}

function attachmentKind(contentType: string | null): 'image' | 'video' | 'file' {
  if (contentType?.startsWith('image/')) return 'image';
  if (contentType?.startsWith('video/')) return 'video';
  return 'file';
}

/** Serialise un message Discord vers la forme JSON exposee aux clients. */
export function serializeEvidenceMessage(msg: Message, guild?: Guild) {
  return {
    id: msg.id,
    content: msg.content ? resolveMentionsToText(msg.content, guild) : '',
    createdAt: msg.createdAt.toISOString(),
    attachments: [...msg.attachments.values()].map((attachment) => ({
      url: attachment.url,
      name: attachment.name,
      contentType: attachment.contentType,
      kind: attachmentKind(attachment.contentType),
      size: attachment.size,
    })),
    stickers: [...msg.stickers.values()].map((sticker) => ({
      id: sticker.id,
      name: sticker.name,
      url: sticker.url,
    })),
    embeds: msg.embeds.map((embed) => embedToApiShape(embed, guild)),
  };
}
