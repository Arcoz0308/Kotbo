const EMBED_AVATAR = (index = 0) =>
  `https://cdn.discordapp.com/embed/avatars/${Math.abs(index) % 5}.png`;

/** URL sûre pour un avatar (évite les chemins relatifs type "0.png"). */
export function resolveAvatarSrc(
  url: string | null | undefined,
  fallbackIndex = 0
): string {
  const fallback = EMBED_AVATAR(fallbackIndex);
  if (!url || typeof url !== 'string') return fallback;
  const trimmed = url.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) return trimmed;
  return fallback;
}

/** Icône de serveur Discord (hash ou URL complète). */
export function resolveGuildIconSrc(
  guildId: string,
  icon: string | null | undefined
): string | null {
  if (!icon || typeof icon !== 'string') return null;
  const trimmed = icon.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) return trimmed;
  const ext = trimmed.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/icons/${guildId}/${trimmed}.${ext}`;
}

/** Avatar utilisateur Discord à partir de l'id + hash. */
export function resolveUserAvatarSrc(
  userId: string | null | undefined,
  avatarHash: string | null | undefined
): string {
  if (!userId || !avatarHash) return EMBED_AVATAR(0);
  const hash = avatarHash.trim();
  if (!hash) return EMBED_AVATAR(0);
  if (hash.startsWith('https://') || hash.startsWith('http://')) return hash;
  const ext = hash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${userId}/${hash}.${ext}`;
}
