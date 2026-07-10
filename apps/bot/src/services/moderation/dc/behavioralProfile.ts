/**
 * dc/behavioralProfile.ts
 *
 * Construit un profil comportemental d'un membre à partir des MessageLog :
 * stylométrie (mots-outils, ponctuation, emojis), heatmap d'activité 7×24,
 * cadence de messages, n-grammes de caractères, graphe de mentions.
 *
 * Ces profils sont coûteux → mis en cache en mémoire (TTL court). Ils ne sont
 * calculés que si le logging de messages est activé et qu'il y a assez de data.
 */

import prisma from '../../../utils/db.js';
import { type BehavioralProfile, MIN_MESSAGES_FOR_BEHAVIORAL } from './types.js';

// Mots-outils / tics de langage français fréquents et discriminants.
const FUNCTION_WORDS = [
  'le', 'la', 'les', 'de', 'des', 'un', 'une', 'et', 'ou', 'mais', 'donc', 'car',
  'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'ca', 'pas', 'plus',
  'trop', 'vraiment', 'franchement', 'wsh', 'mdr', 'mdrr', 'ptdr', 'jsp', 'jpp',
  'bref', 'coup', 'genre', 'grave', 'ouais', 'ok', 'nan', 'oui', 'non', 'bcp',
  'tkt', 'askip', 'perso', 'enfin', 'aussi', 'meme', 'juste',
];

const TOP_TRIGRAMS = 40;
const MAX_MESSAGES = 600;
const LOOKBACK_DAYS = 45;

const emojiRegex = /(\p{Extended_Pictographic}|<a?:\w+:\d+>)/gu;
const mentionRegex = /<@!?(\d{15,25})>/g;

// ─── Cache mémoire ──────────────────────────────────────────────────────────────
type CacheEntry = { profile: BehavioralProfile | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;

function cacheKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function pruneCache(): void {
  if (cache.size <= CACHE_MAX) return;
  const now = Date.now();
  for (const [k, v] of cache) {
    if (v.expiresAt < now) cache.delete(k);
  }
  // Si toujours trop plein, vire les plus anciens (ordre d'insertion Map).
  while (cache.size > CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey === undefined) break;
    cache.delete(firstKey);
  }
}

// ─── Tokenisation ────────────────────────────────────────────────────────────────
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // enlève les accents pour normaliser
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

function extractTrigrams(text: string): string[] {
  const clean = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const out: string[] = [];
  for (let i = 0; i < clean.length - 2; i++) {
    out.push(clean.slice(i, i + 3));
  }
  return out;
}

/**
 * Calcule (ou récupère du cache) le profil comportemental d'un membre.
 * Retourne null si le logging est off, ou trop peu de messages exploitables.
 */
export async function getBehavioralProfile(
  guildId: string,
  userId: string,
): Promise<BehavioralProfile | null> {
  const key = cacheKey(guildId, userId);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.profile;

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const messages = await prisma.messageLog
    .findMany({
      where: { guildId, authorId: userId, isBot: false, createdAt: { gte: since } },
      select: { content: true, createdAt: true, channelId: true },
      orderBy: { createdAt: 'asc' },
      take: MAX_MESSAGES,
    })
    .catch(() => [] as { content: string; createdAt: Date; channelId: string }[]);

  if (messages.length < MIN_MESSAGES_FOR_BEHAVIORAL) {
    cache.set(key, { profile: null, expiresAt: Date.now() + CACHE_TTL_MS });
    pruneCache();
    return null;
  }

  const heatmap = new Array<number>(168).fill(0);
  const activeMinutes = new Set<number>();
  const wordCounts: Record<string, number> = {};
  const trigramCounts = new Map<string, number>();
  const mentions = new Set<string>();
  const channels = new Set<string>();
  const timestamps: number[] = [];

  let totalTokens = 0;
  let totalChars = 0;
  let totalWords = 0;
  let totalEmojis = 0;
  let totalCaps = 0;
  let totalLetters = 0;
  let totalPunct = 0;
  let textMessageCount = 0;

  for (const msg of messages) {
    const ts = msg.createdAt.getTime();
    timestamps.push(ts);
    channels.add(msg.channelId);

    const d = msg.createdAt;
    const slot = d.getUTCDay() * 24 + d.getUTCHours();
    heatmap[slot] += 1;
    activeMinutes.add(Math.floor(ts / 60000));

    const content = msg.content || '';
    for (const m of content.matchAll(mentionRegex)) {
      if (m[1] && m[1] !== userId) mentions.add(m[1]);
    }
    if (content.trim().length === 0) continue;
    textMessageCount++;

    totalChars += content.length;
    const emojis = content.match(emojiRegex);
    if (emojis) totalEmojis += emojis.length;

    for (const ch of content) {
      if (/[A-Za-zÀ-ÿ]/.test(ch)) {
        totalLetters++;
        if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) totalCaps++;
      } else if (/[!?.,;:]/.test(ch)) {
        totalPunct++;
      }
    }

    const tokens = tokenize(content);
    totalWords += tokens.length;
    for (const tok of tokens) {
      totalTokens++;
      if (FUNCTION_WORDS.includes(tok)) wordCounts[tok] = (wordCounts[tok] || 0) + 1;
    }

    for (const tri of extractTrigrams(content)) {
      trigramCounts.set(tri, (trigramCounts.get(tri) || 0) + 1);
    }
  }

  // Vecteur stylométrique normalisé (fréquence des mots-outils).
  const styleVector: Record<string, number> = {};
  for (const fw of FUNCTION_WORDS) {
    styleVector[`fw:${fw}`] = totalTokens > 0 ? (wordCounts[fw] || 0) / totalTokens : 0;
  }

  // Top trigrammes.
  const trigrams = new Set<string>(
    [...trigramCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_TRIGRAMS)
      .map(([tri]) => tri),
  );

  // Cadence : intervalle médian entre messages consécutifs.
  const gaps: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    const gap = (timestamps[i] - timestamps[i - 1]) / 1000;
    if (gap > 0 && gap < 3600) gaps.push(gap); // ignore les longues pauses
  }
  gaps.sort((a, b) => a - b);
  const medianGapSeconds = gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)] : 0;

  // Normalise la heatmap (somme = 1).
  const heatSum = heatmap.reduce((s, v) => s + v, 0) || 1;
  const normHeatmap = heatmap.map((v) => v / heatSum);

  const denomText = Math.max(1, textMessageCount);
  const profile: BehavioralProfile = {
    userId,
    messageCount: messages.length,
    heatmap: normHeatmap,
    activeMinutes,
    styleVector,
    trigrams,
    cadence: {
      avgLength: totalChars / denomText,
      avgWords: totalWords / denomText,
      emojiRate: totalEmojis / denomText,
      capsRate: totalLetters > 0 ? totalCaps / totalLetters : 0,
      punctuationRate: totalChars > 0 ? totalPunct / totalChars : 0,
      medianGapSeconds,
    },
    mentions,
    channels,
    firstMessageAt: timestamps[0] ?? 0,
    lastMessageAt: timestamps[timestamps.length - 1] ?? 0,
  };

  cache.set(key, { profile, expiresAt: Date.now() + CACHE_TTL_MS });
  pruneCache();
  return profile;
}

/** Invalide le cache d'un membre (ex. après recalcul). */
export function invalidateBehavioralProfile(guildId: string, userId: string): void {
  cache.delete(cacheKey(guildId, userId));
}
