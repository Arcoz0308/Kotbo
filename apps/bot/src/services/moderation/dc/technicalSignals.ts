/**
 * dc/technicalSignals.ts
 *
 * Signaux techniques issus des vérifications OAuth (SecurityVerification) :
 *  - device_fingerprint : même appareil/navigateur (hash de deviceInfo)
 *  - shared_ip          : même adresse IP exacte
 *  - ip_subnet          : même sous-réseau (/24 IPv4, /64 IPv6) sans IP exacte
 *  - oauth_connections  : comptes tiers liés en commun (Steam, Spotify, etc.)
 */

import prisma from '../../../utils/db.js';
import type { DcSignal } from './types.js';

type VerifRow = {
  userId: string;
  ipAddress: string | null;
  deviceInfo: unknown;
  connections: unknown;
  createdAt: Date;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** Empreinte device : hash stable de deviceInfo (ignore les champs volatils). */
function deviceFingerprint(deviceInfo: unknown): string | null {
  if (!deviceInfo || typeof deviceInfo !== 'object') return null;
  const src = deviceInfo as Record<string, unknown>;
  // Ne garde que les champs stables et discriminants s'ils existent.
  const stableKeys = ['userAgent', 'platform', 'timezone', 'language', 'screen', 'canvas', 'webgl', 'fingerprint'];
  const picked: Record<string, unknown> = {};
  for (const k of stableKeys) if (k in src) picked[k] = src[k];
  const basis = Object.keys(picked).length > 0 ? picked : src;
  const str = stableStringify(basis);
  if (str === '{}' || str === 'null') return null;
  // Hash déterministe simple (djb2).
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(16);
}

function ipSubnet(ip: string | null): string | null {
  if (!ip) return null;
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return `${parts.slice(0, 4).join(':')}::/64`;
  }
  return null;
}

function connectionKeys(connections: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(connections)) return out;
  for (const c of connections) {
    if (c && typeof c === 'object') {
      const conn = c as Record<string, unknown>;
      const type = conn.type ?? conn.provider;
      const id = conn.id ?? conn.accountId ?? conn.name;
      if (type && id) out.add(`${String(type)}:${String(id)}`);
    }
  }
  return out;
}

/** Récupère la dernière vérif par utilisateur pour un ensemble d'IDs. */
async function latestVerifications(guildId: string, userIds: string[]): Promise<Map<string, VerifRow>> {
  const rows = await prisma.securityVerification
    .findMany({
      where: { guildId, userId: { in: userIds } },
      select: { userId: true, ipAddress: true, deviceInfo: true, connections: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
    .catch(() => [] as VerifRow[]);

  const map = new Map<string, VerifRow>();
  for (const r of rows) {
    if (!map.has(r.userId)) map.set(r.userId, r as VerifRow);
  }
  return map;
}

/**
 * Produit les signaux techniques entre `userId` et chaque alt suspecté.
 */
export async function computeTechnicalSignals(
  guildId: string,
  userId: string,
  altIds: string[],
): Promise<DcSignal[]> {
  const ids = [userId, ...altIds];
  const verifs = await latestVerifications(guildId, ids);
  const me = verifs.get(userId);
  if (!me) return [];

  const myFp = deviceFingerprint(me.deviceInfo);
  const mySubnet = ipSubnet(me.ipAddress);
  const myConns = connectionKeys(me.connections);

  const signals: DcSignal[] = [];

  for (const altId of altIds) {
    const alt = verifs.get(altId);
    if (!alt) continue;

    const altFp = deviceFingerprint(alt.deviceInfo);
    if (myFp && altFp && myFp === altFp) {
      signals.push({
        type: 'device_fingerprint',
        score: 55,
        label: `Même empreinte d'appareil/navigateur que <@${altId}>`,
        matchedUserId: altId,
        detail: `Les deux comptes ont vérifié depuis le même device (userAgent/écran/timezone identiques). Preuve très forte.`,
      });
    }

    if (me.ipAddress && alt.ipAddress && me.ipAddress === alt.ipAddress) {
      signals.push({
        type: 'shared_ip',
        score: 45,
        label: `Même adresse IP que <@${altId}>`,
        matchedUserId: altId,
        detail: `IP exacte partagée lors de la vérification OAuth.`,
      });
    } else if (mySubnet && ipSubnet(alt.ipAddress) === mySubnet) {
      signals.push({
        type: 'ip_subnet',
        score: 18,
        label: `Même sous-réseau IP que <@${altId}> (${mySubnet})`,
        matchedUserId: altId,
        detail: `IP proche (même /24 ou /64). Signal faible seul (peut être une famille/réseau partagé).`,
      });
    }

    const altConns = connectionKeys(alt.connections);
    let shared = 0;
    for (const c of myConns) if (altConns.has(c)) shared++;
    if (shared > 0) {
      signals.push({
        type: 'oauth_connections',
        score: Math.min(50, 25 + shared * 15),
        label: `${shared} compte(s) tiers lié(s) en commun avec <@${altId}>`,
        matchedUserId: altId,
        detail: `Comptes externes (Steam, Spotify, etc.) identiques dans les connexions Discord. Preuve forte.`,
      });
    }
  }

  return signals;
}
