/**
 * dc/voiceSignals.ts
 *
 * Signal d'alternance vocale (voice_alternation) : deux comptes qui utilisent
 * les mêmes salons vocaux mais ne sont JAMAIS en vocal en même temps, avec des
 * passages de relais (l'un quitte, l'autre rejoint le même salon quelques
 * secondes plus tard). Un humain ne peut pas être en vocal avec ses deux comptes.
 */

import prisma from '../../../utils/db.js';
import type { DcSignal } from './types.js';

type Session = { channelId: string; joinedAt: Date; leftAt: Date | null };

const LOOKBACK_DAYS = 45;
const HANDOFF_WINDOW_MS = 120 * 1000; // 2 min entre le départ de l'un et l'arrivée de l'autre
const MIN_SESSIONS = 3;

function intervalsOverlap(a: Session, b: Session): boolean {
  const aEnd = (a.leftAt ?? new Date()).getTime();
  const bEnd = (b.leftAt ?? new Date()).getTime();
  return a.joinedAt.getTime() < bEnd && b.joinedAt.getTime() < aEnd;
}

async function fetchSessions(guildId: string, userId: string): Promise<Session[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  return prisma.dcVoiceSession
    .findMany({
      where: { guildId, userId, joinedAt: { gte: since } },
      select: { channelId: true, joinedAt: true, leftAt: true },
      orderBy: { joinedAt: 'asc' },
      take: 500,
    })
    .catch(() => [] as Session[]);
}

export async function computeVoiceSignals(
  guildId: string,
  userId: string,
  altIds: string[],
): Promise<DcSignal[]> {
  const mine = await fetchSessions(guildId, userId);
  if (mine.length < MIN_SESSIONS) return [];

  const signals: DcSignal[] = [];

  for (const altId of altIds) {
    const theirs = await fetchSessions(guildId, altId);
    if (theirs.length < MIN_SESSIONS) continue;

    // Salons vocaux partagés ?
    const myChannels = new Set(mine.map((s) => s.channelId));
    const sharedChannels = new Set(theirs.filter((s) => myChannels.has(s.channelId)).map((s) => s.channelId));
    if (sharedChannels.size === 0) continue;

    // Chevauchement temporel : sont-ils déjà en vocal en même temps ?
    let overlaps = 0;
    for (const a of mine) {
      for (const b of theirs) {
        if (intervalsOverlap(a, b)) {
          overlaps++;
          break;
        }
      }
      if (overlaps > 0) break;
    }
    if (overlaps > 0) continue; // Ils ont déjà été en vocal ensemble → pas des alts (ou pas ce signal)

    // Passages de relais : l'un quitte un salon, l'autre le rejoint peu après.
    let handoffs = 0;
    for (const a of mine) {
      if (!a.leftAt) continue;
      const leftMs = a.leftAt.getTime();
      for (const b of theirs) {
        if (b.channelId !== a.channelId) continue;
        const joinMs = b.joinedAt.getTime();
        if (joinMs >= leftMs - 30_000 && joinMs <= leftMs + HANDOFF_WINDOW_MS) {
          handoffs++;
          break;
        }
      }
    }

    // Alternance stricte (jamais ensemble) + salons partagés = signal fort ;
    // renforcé par des passages de relais.
    const score = Math.min(50, 30 + handoffs * 8);
    signals.push({
      type: 'voice_alternation',
      score,
      label: `Alternance vocale avec <@${altId}> (jamais en vocal en même temps${handoffs > 0 ? `, ${handoffs} relais` : ''})`,
      matchedUserId: altId,
      detail: `Salons vocaux partagés : ${sharedChannels.size}. Aucun chevauchement de présence sur ${LOOKBACK_DAYS} jours${handoffs > 0 ? ` et ${handoffs} passage(s) de relais détecté(s)` : ''}. Un humain ne peut pas être en vocal avec ses deux comptes.`,
    });
  }

  return signals;
}
