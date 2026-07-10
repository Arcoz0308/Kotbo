/**
 * dc/voiceTracking.ts
 *
 * Enregistre la timeline vocale (DcVoiceSession) pour la détection d'alternance
 * de présence entre alts. Alimenté par les events du bus (voice:join/leave/move).
 * Écritures best-effort : ne jamais casser le flux vocal si la DB échoue.
 */

import prisma from '../../../utils/db.js';

const RETENTION_DAYS = 60;

/** Nettoyage opportuniste (rare) des vieilles sessions pour borner la table. */
async function maybePrune(guildId: string): Promise<void> {
  if (Math.random() > 0.02) return; // ~2% des joins
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.dcVoiceSession.deleteMany({ where: { guildId, joinedAt: { lt: cutoff } } }).catch(() => null);
}

export async function recordVoiceJoin(
  guildId: string,
  userId: string,
  channelId: string,
  joinedAt: Date,
): Promise<void> {
  await prisma.dcVoiceSession.create({ data: { guildId, userId, channelId, joinedAt } }).catch(() => null);
  void maybePrune(guildId);
}

export async function recordVoiceLeave(
  guildId: string,
  userId: string,
  channelId: string,
  joinedAt: Date,
  leftAt: Date,
): Promise<void> {
  const open = await prisma.dcVoiceSession
    .findFirst({
      where: { guildId, userId, channelId, leftAt: null },
      orderBy: { joinedAt: 'desc' },
      select: { id: true },
    })
    .catch(() => null);

  if (open) {
    await prisma.dcVoiceSession.update({ where: { id: open.id }, data: { leftAt } }).catch(() => null);
  } else {
    // Pas de session ouverte connue → enregistre une session complète.
    await prisma.dcVoiceSession.create({ data: { guildId, userId, channelId, joinedAt, leftAt } }).catch(() => null);
  }
}
