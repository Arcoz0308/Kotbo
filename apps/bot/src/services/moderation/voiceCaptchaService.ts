import { type Client, type Guild, type GuildMember, type VoiceBasedChannel, type VoiceState, PermissionFlagsBits } from 'discord.js';
import { createReadStream, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';
import type { RaidProtectionConfig } from '@prisma/client';
import { getRaidProtectionConfig } from './raidProtectionService.js';

/**
 * Alphabet réduit aux symboles phonétiquement distincts en français. À l'oral,
 * B/C/D/G/P/T/V se confondent tous ("bé", "cé", "dé"…), de même que M et N.
 * Un code vocal ne peut donc pas réutiliser l'alphabet du captcha image sans
 * générer des échecs sur des membres parfaitement humains.
 * Doit rester synchronisé avec la table SYMBOLS de scripts/generate-captcha-voice.sh.
 */
export const VOICE_ALPHABET = 'AHKLMQRSUXZ23456789';
export const VOICE_CODE_LENGTH = 5;

const PACK_DIR = fileURLToPath(new URL('../../../assets/captcha-voice/', import.meta.url));

// Temps d'antenne : la diffusion audio est sérielle, chaque milliseconde ici
// est payée par tous les membres en file derrière.
const CLIP_GAP_MIN_MS = 180;
const CLIP_GAP_MAX_MS = 420;
const TURN_SETTLE_MS = 800; // Laisse le temps au démute d'être appliqué côté client
const BETWEEN_MEMBERS_MS = 500; // Respiration entre deux tours (rate limits)
const CONNECTION_READY_TIMEOUT_MS = 20_000;
const IDLE_DISCONNECT_MS = 30_000;

export function generateVoiceCode(): string {
  let code = '';
  for (let i = 0; i < VOICE_CODE_LENGTH; i++) {
    code += VOICE_ALPHABET[crypto.randomInt(VOICE_ALPHABET.length)];
  }
  return code;
}

// ── Pack audio ────────────────────────────────────────────────────────────────

let packCache: Map<string, string[]> | null = null;

/** Scanne le dossier une fois : symbole -> chemins des variantes disponibles. */
function loadPack(): Map<string, string[]> {
  if (packCache) return packCache;

  const pack = new Map<string, string[]>();
  try {
    for (const file of readdirSync(PACK_DIR)) {
      if (!file.endsWith('.ogg')) continue;
      const symbol = file.split('-')[0]?.toUpperCase();
      if (!symbol || !VOICE_ALPHABET.includes(symbol)) continue;
      const variants = pack.get(symbol) ?? [];
      variants.push(path.join(PACK_DIR, file));
      pack.set(symbol, variants);
    }
  } catch (err) {
    logger.warn('VoiceCaptcha', `Pack audio illisible dans ${PACK_DIR}`, err);
  }

  packCache = pack;
  return pack;
}

/**
 * Le mode vocal n'est utilisable que si chaque symbole de l'alphabet dispose
 * d'au moins un clip : un pack incomplet produirait des codes inénonçables.
 */
export function isVoicePackAvailable(): boolean {
  const pack = loadPack();
  return [...VOICE_ALPHABET].every((symbol) => (pack.get(symbol)?.length ?? 0) > 0);
}

function clipFor(symbol: string): string | null {
  const variants = loadPack().get(symbol.toUpperCase());
  if (!variants?.length) return null;
  return variants[crypto.randomInt(variants.length)];
}

// ── File d'attente (une par serveur) ──────────────────────────────────────────

type QueueEntry = {
  userId: string;
  sessionId: string | null; // null = simple répétition, la session existe déjà
  code: string;
  enqueuedAt: number;
};

const queues = new Map<string, QueueEntry[]>();
const runningGuilds = new Set<string>();

export function getQueueLength(guildId: string): number {
  return queues.get(guildId)?.length ?? 0;
}

export function getQueuePosition(guildId: string, userId: string): number {
  const queue = queues.get(guildId) ?? [];
  return queue.findIndex((entry) => entry.userId === userId) + 1;
}

/** Durée d'antenne d'un code, utilisée pour estimer l'attente annoncée. */
export function estimateTurnMs(): number {
  const averageGap = (CLIP_GAP_MIN_MS + CLIP_GAP_MAX_MS) / 2;
  return TURN_SETTLE_MS + VOICE_CODE_LENGTH * (700 + averageGap) + BETWEEN_MEMBERS_MS;
}

function removeFromQueue(guildId: string, userId: string): void {
  const queue = queues.get(guildId);
  if (!queue) return;
  const index = queue.findIndex((entry) => entry.userId === userId);
  if (index !== -1) queue.splice(index, 1);
}

// ── Permissions ───────────────────────────────────────────────────────────────

export type VoiceReadiness =
  | { ok: true; channel: VoiceBasedChannel }
  | { ok: false; reason: string };

/**
 * Vérifie que le mode vocal est réellement praticable sur ce serveur. Tout
 * échec doit renvoyer vers le captcha image plutôt que bloquer le membre.
 */
export async function checkVoiceReadiness(guild: Guild, config: RaidProtectionConfig): Promise<VoiceReadiness> {
  if (!config.captchaVoiceChannelId) return { ok: false, reason: 'aucun salon vocal configuré' };
  if (!isVoicePackAvailable()) return { ok: false, reason: 'pack audio absent ou incomplet' };

  const channel = await guild.channels.fetch(config.captchaVoiceChannelId).catch(() => null);
  if (!channel?.isVoiceBased()) return { ok: false, reason: 'salon vocal introuvable' };

  const me = guild.members.me;
  if (!me) return { ok: false, reason: 'membre bot indisponible' };

  const permissions = channel.permissionsFor(me);
  const required: Array<[bigint, string]> = [
    [PermissionFlagsBits.Connect, 'Se connecter'],
    [PermissionFlagsBits.Speak, 'Parler'],
    [PermissionFlagsBits.DeafenMembers, 'Rendre sourd'],
    // Sert à éjecter le membre du salon une fois son code énoncé, pour qu'il
    // n'entende pas celui du suivant.
    [PermissionFlagsBits.MoveMembers, 'Déplacer les membres'],
  ];
  const missing = required.filter(([flag]) => !permissions?.has(flag)).map(([, label]) => label);

  if (missing.length) return { ok: false, reason: `permissions manquantes : ${missing.join(', ')}` };

  return { ok: true, channel };
}

// ── Entrée dans la file ───────────────────────────────────────────────────────

/**
 * Le membre vient de rejoindre le salon vocal de vérification : on le rend
 * sourd le temps de son attente (sinon il entendrait le code des autres, ce
 * qui suffirait à un attaquant multi-comptes) puis on le met en file.
 */
export async function enqueueMember(member: GuildMember, config: RaidProtectionConfig): Promise<void> {
  const guildId = member.guild.id;
  const queue = queues.get(guildId) ?? [];
  if (queue.some((entry) => entry.userId === member.id)) return;

  const session = await prisma.captchaSession.findFirst({
    where: { guildId, userId: member.id, status: 'PENDING', mode: 'VOICE' },
    orderBy: { createdAt: 'desc' },
  });
  if (!session) return;

  await setDeaf(member, true, 'Captcha vocal : attente du tour');

  queue.push({ userId: member.id, sessionId: session.id, code: session.code, enqueuedAt: Date.now() });
  queues.set(guildId, queue);

  void runQueue(member.guild, config);
}

export async function dequeueMember(guildId: string, member: GuildMember): Promise<void> {
  removeFromQueue(guildId, member.id);
  await setDeaf(member, false, 'Captcha vocal : sortie de la file');
}

async function setDeaf(member: GuildMember, deaf: boolean, reason: string): Promise<void> {
  if (!member.voice.channelId) return;
  if (member.voice.serverDeaf === deaf) return;
  await member.voice.setDeaf(deaf, reason).catch((err) => {
    logger.warn('VoiceCaptcha', `Démute/mute impossible sur ${member.id}`, err);
  });
}

// ── Boucle de diffusion ───────────────────────────────────────────────────────

async function runQueue(guild: Guild, config: RaidProtectionConfig): Promise<void> {
  if (runningGuilds.has(guild.id)) return;
  runningGuilds.add(guild.id);

  let connection: import('@discordjs/voice').VoiceConnection | null = null;

  try {
    const readiness = await checkVoiceReadiness(guild, config);
    if (!readiness.ok) {
      logger.warn('VoiceCaptcha', `File abandonnée sur ${guild.id} : ${readiness.reason}`);
      await drainQueueToImage(guild, config);
      return;
    }

    const voice = await importVoice();
    if (!voice) {
      await drainQueueToImage(guild, config);
      return;
    }

    connection = voice.joinVoiceChannel({
      channelId: readiness.channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });

    await voice.entersState(connection, voice.VoiceConnectionStatus.Ready, CONNECTION_READY_TIMEOUT_MS);

    const player = voice.createAudioPlayer({
      behaviors: { noSubscriber: voice.NoSubscriberBehavior.Play },
    });
    connection.subscribe(player);

    // On garde la connexion ouverte un moment après le dernier tour : pendant
    // une vague d'arrivées, se reconnecter à chaque membre coûterait plus cher
    // que d'attendre. La boucle scrute la file plutôt que de dormir d'un bloc,
    // sinon un arrivant patienterait tout le délai d'inactivité pour rien.
    let idleSince = Date.now();
    for (;;) {
      const entry = (queues.get(guild.id) ?? [])[0];

      if (!entry) {
        if (Date.now() - idleSince >= IDLE_DISCONNECT_MS) break;
        await waitFor(500);
        continue;
      }
      idleSince = Date.now();

      const member = await guild.members.fetch(entry.userId).catch(() => null);

      // Le membre a quitté le vocal (ou le serveur) entre-temps : on passe.
      if (!member?.voice.channelId || member.voice.channelId !== readiness.channel.id) {
        removeFromQueue(guild.id, entry.userId);
        continue;
      }

      await announceTurn(entry, member, config, voice, player);
    }
  } catch (err) {
    logger.error('VoiceCaptcha', `Erreur de la file vocale sur ${guild.id}`, err);
  } finally {
    connection?.destroy();
    runningGuilds.delete(guild.id);

    // Une nouvelle arrivée pendant la fermeture aurait été ignorée : on relance.
    if ((queues.get(guild.id)?.length ?? 0) > 0) {
      void runQueue(guild, config);
    }
  }
}

async function announceTurn(
  entry: QueueEntry,
  member: GuildMember,
  config: RaidProtectionConfig,
  voice: VoiceModule,
  player: import('@discordjs/voice').AudioPlayer
): Promise<void> {
  const guildId = member.guild.id;

  try {
    await setDeaf(member, false, 'Captcha vocal : énonciation du code');
    await waitFor(TURN_SETTLE_MS);

    if (entry.sessionId) {
      // Le chrono ne démarre qu'ici : le temps passé en file n'est pas imputable
      // au membre, et le cron d'expiration expulserait sinon des légitimes.
      await prisma.captchaSession.update({
        where: { id: entry.sessionId },
        data: {
          awaitingTurn: false,
          expiresAt: new Date(Date.now() + config.captchaTimeoutMinutes * 60 * 1000),
        },
      }).catch(() => null);
    }

    await speakCode(entry.code, voice, player);
  } finally {
    removeFromQueue(guildId, entry.userId);

    // Sortie du salon ET levée de la surdité dans un seul appel REST. Laisser
    // le membre sur place lui ferait entendre le code du suivant, ce qui suffit
    // à un attaquant multi-comptes ; et séparer les deux appels ouvrirait une
    // fenêtre où un crash le laisserait sourd de façon permanente, un état que
    // Discord refuse de corriger tant qu'il n'est pas connecté au vocal.
    await member.edit({ deaf: false, channel: null }).catch((err) => {
      logger.warn('VoiceCaptcha', `Sortie de vocal impossible pour ${member.id}`, err);
    });

    await waitFor(BETWEEN_MEMBERS_MS);
  }
}

/** Diffuse le code caractère par caractère dans la connexion vocale active. */
async function speakCode(
  code: string,
  voice: VoiceModule,
  player: import('@discordjs/voice').AudioPlayer
): Promise<void> {
  for (const symbol of code) {
    const clip = clipFor(symbol);
    if (!clip) continue;

    const resource = voice.createAudioResource(createReadStream(clip), {
      inputType: voice.StreamType.OggOpus,
    });
    player.play(resource);

    await voice.entersState(player, voice.AudioPlayerStatus.Playing, 5_000).catch(() => null);
    await voice.entersState(player, voice.AudioPlayerStatus.Idle, 15_000).catch(() => null);

    // Silence de longueur variable : un enregistrement du flux ne se découpe
    // pas mécaniquement en segments de durée fixe.
    await waitFor(crypto.randomInt(CLIP_GAP_MIN_MS, CLIP_GAP_MAX_MS));
  }

  player.stop();
}

/** Rejoue le code d'un membre déjà passé (bouton « Répéter »). */
export async function replayCode(member: GuildMember, code: string): Promise<boolean> {
  const config = await getRaidProtectionConfig(member.guild.id);
  if (!config) return false;

  const readiness = await checkVoiceReadiness(member.guild, config);
  if (!readiness.ok) return false;
  if (member.voice.channelId !== readiness.channel.id) return false;

  const queue = queues.get(member.guild.id) ?? [];
  queue.push({ userId: member.id, sessionId: null, code, enqueuedAt: Date.now() });
  queues.set(member.guild.id, queue);

  // La répétition repasse par la file : elle consomme du temps d'antenne comme
  // n'importe quel tour, et ne doit pas couper la parole au membre en cours.
  void runQueue(member.guild, config);
  return true;
}

// ── Repli et nettoyage ────────────────────────────────────────────────────────

/** Bascule tous les membres encore en file vers le captcha image. */
async function drainQueueToImage(guild: Guild, config: RaidProtectionConfig): Promise<void> {
  const queue = queues.get(guild.id) ?? [];
  queues.delete(guild.id);

  const { deliverImageCaptcha } = await import('./captchaService.js');
  for (const entry of queue) {
    const member = await guild.members.fetch(entry.userId).catch(() => null);
    if (!member) continue;
    await setDeaf(member, false, 'Captcha vocal indisponible');
    await deliverImageCaptcha(member, config, entry.sessionId).catch(() => null);
  }
}

/**
 * Au démarrage : un crash pendant un tour laisse des membres sourds côté
 * serveur, état qui persiste même après changement de salon. On rend l'ouïe à
 * tous ceux qui traînent dans les salons de vérification.
 */
export async function sweepStaleDeafen(client: Client): Promise<void> {
  const configs = await prisma.raidProtectionConfig.findMany({
    where: { captchaEnabled: true, captchaMode: 'VOICE', captchaVoiceChannelId: { not: null } },
    select: { guildId: true, captchaVoiceChannelId: true },
  });

  for (const { guildId, captchaVoiceChannelId } of configs) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild || !captchaVoiceChannelId) continue;

    const channel = await guild.channels.fetch(captchaVoiceChannelId).catch(() => null);
    if (!channel?.isVoiceBased()) continue;

    for (const member of channel.members.values()) {
      if (!member.voice.serverDeaf) continue;
      await member.voice.setDeaf(false, 'Captcha vocal : nettoyage au démarrage').catch(() => null);
    }
  }
}

// ── Utilitaires ───────────────────────────────────────────────────────────────

type VoiceModule = typeof import('@discordjs/voice');
let voiceModule: VoiceModule | null | undefined;

/**
 * Import paresseux : @discordjs/voice est une dépendance lourde et optionnelle.
 * Si elle manque, le bot doit continuer de tourner et le captcha se replier sur
 * l'image, pas refuser de démarrer.
 */
async function importVoice(): Promise<VoiceModule | null> {
  if (voiceModule !== undefined) return voiceModule;
  try {
    voiceModule = await import('@discordjs/voice');
  } catch (err) {
    logger.warn('VoiceCaptcha', '@discordjs/voice absent : captcha vocal désactivé', err);
    voiceModule = null;
  }
  return voiceModule;
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Événements vocaux ─────────────────────────────────────────────────────────

export async function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
  const guild = newState.guild ?? oldState.guild;
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;

  const config = await getRaidProtectionConfig(guild.id);
  if (!config?.captchaEnabled || config.captchaMode !== 'VOICE' || !config.captchaVoiceChannelId) return;

  if (oldState.channelId === newState.channelId) return;

  if (newState.channelId === config.captchaVoiceChannelId) {
    await enqueueMember(member, config);
    return;
  }

  if (oldState.channelId === config.captchaVoiceChannelId) {
    await dequeueMember(guild.id, member);
  }

  // Filet de sécurité : quitter la file en plein tour laisse le membre sourd,
  // et Discord refuse de lever cet état tant qu'il n'est pas reconnecté au
  // vocal. On saisit donc sa prochaine connexion, quel que soit le salon.
  if (newState.channelId && member.voice.serverDeaf) {
    const pending = await prisma.captchaSession.count({
      where: { guildId: guild.id, userId: member.id, status: 'PENDING', mode: 'VOICE' },
    });
    if (pending === 0) {
      await member.voice.setDeaf(false, 'Captcha vocal : surdité résiduelle').catch(() => null);
    }
  }
}
