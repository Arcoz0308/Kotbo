import type { Client, GuildMember } from 'discord.js';
import prisma from '../../utils/db.js';
import { logger } from '../../utils/logger.js';

/**
 * Complète l'identité des profils membres créés sans pseudo ni avatar.
 *
 * Plusieurs écritures créent un `MemberProfile` à partir du seul identifiant
 * (détection de doubles comptes, note de modération, adhésion à un clan) : ces
 * lignes s'affichaient en « Utilisateur inconnu » dans la liste des membres,
 * alors que la fiche détaillée, elle, interroge Discord et affichait le bon
 * compte. On récupère donc l'identité manquante côté Discord, puis on la
 * réécrit en base pour que la correction soit durable.
 */

export type MemberIdentity = {
  username: string;
  displayName: string;
  avatarUrl: string;
};

/**
 * Identité à poser sur un `MemberProfile` créé alors qu'un membre Discord est
 * déjà en main : à utiliser dans la branche `create` d'un upsert pour ne plus
 * produire de profil anonyme.
 */
export function memberProfileIdentity(member: GuildMember) {
  return {
    userTag: member.user.tag,
    username: member.user.username,
    globalName: member.user.globalName ?? null,
    displayName: member.displayName ?? member.user.globalName ?? member.user.username,
    avatarUrl: member.user.displayAvatarURL({ size: 256 }),
    isBot: member.user.bot,
    accountCreatedAt: member.user.createdAt,
    guildJoinedAt: member.joinedAt ?? null,
  };
}

/** Une requête Discord lente ne doit pas retenir une réponse du dashboard. */
const DISCORD_LOOKUP_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>): Promise<T | null> {
  return Promise.race([
    promise.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), DISCORD_LOOKUP_TIMEOUT_MS)),
  ]);
}

/**
 * Résout l'identité Discord des membres cités, en privilégiant le cache.
 *
 * La réécriture en base est volontairement restreinte aux lignes dont le pseudo
 * est absent : une identité déjà connue n'est jamais écrasée.
 */
export async function resolveMissingMemberIdentities(
  client: Client,
  guildId: string,
  userIds: string[],
): Promise<Map<string, MemberIdentity>> {
  const identities = new Map<string, MemberIdentity>();
  if (userIds.length === 0) return identities;

  const guild = client.guilds.cache.get(guildId);

  if (guild) {
    const uncached = userIds.filter((userId) => !guild.members.cache.has(userId));
    if (uncached.length > 0) {
      // Une seule requête de chunk pour tous les membres manquants encore présents.
      await withTimeout(guild.members.fetch({ user: uncached.slice(0, 100) }));
    }

    for (const userId of userIds) {
      const member = guild.members.cache.get(userId);
      if (!member) continue;
      identities.set(userId, {
        username: member.user.username,
        displayName: member.displayName ?? member.user.globalName ?? member.user.username,
        avatarUrl: member.user.displayAvatarURL({ size: 256 }),
      });
    }
  }

  // Membres partis du serveur : seule l'API utilisateur peut encore les nommer.
  const stillMissing = userIds.filter((userId) => !identities.has(userId));
  if (stillMissing.length > 0) {
    const fetched = await Promise.all(
      stillMissing.map((userId) => withTimeout(client.users.fetch(userId))),
    );
    for (const user of fetched) {
      if (!user) continue;
      identities.set(user.id, {
        username: user.username,
        displayName: user.globalName ?? user.username,
        avatarUrl: user.displayAvatarURL({ size: 256 }),
      });
    }
  }

  if (identities.size > 0) {
    void persistMemberIdentities(guildId, identities);
  }

  return identities;
}

async function persistMemberIdentities(
  guildId: string,
  identities: Map<string, MemberIdentity>,
): Promise<void> {
  for (const [userId, identity] of identities) {
    await prisma.memberProfile
      .updateMany({
        where: { guildId, userId, username: null },
        data: {
          username: identity.username,
          displayName: identity.displayName,
          avatarUrl: identity.avatarUrl,
        },
      })
      .catch((error) => {
        logger.warn('MemberIdentity', `Impossible de compléter l'identité de ${userId} sur ${guildId}:`, error);
      });
  }
}
