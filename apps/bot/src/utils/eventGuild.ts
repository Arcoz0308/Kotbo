/**
 * Résolution de l'identifiant de serveur porté par les arguments d'un événement
 * discord.js, utilisée par la garde d'activation centrale (`client.emit`).
 *
 * Les événements transportent des objets hétérogènes : certains exposent
 * `guild`/`guildId`, d'autres reçoivent la guilde dans un argument suivant.
 * `GuildAuditLogEntryCreate` émet ainsi `(entry, guild)` où l'entrée d'audit ne
 * référence pas son serveur : sans reconnaissance de la guilde en second
 * argument, l'événement franchissait la garde et déclenchait des écritures
 * (config AutoMod, etc.) sur des serveurs non activés, donc absents en base.
 */

// On ne lit ici que les propriétés permettant de remonter à un identifiant de
// serveur, sans dépendre des classes concrètes de discord.js.
type GuildBearing = {
  guild?: { id?: unknown } | null;
  guildId?: unknown;
  id?: unknown;
  name?: unknown;
  roles?: unknown;
};

/**
 * Reconnaît une instance de `Guild` sans l'importer : le nom de constructeur
 * suffit en production, la paire `name`/`roles` couvre les objets simulés.
 */
function readGuildOwnId(candidate: GuildBearing): string | null {
  if (typeof candidate.id !== 'string') return null;
  const isGuild = candidate.constructor?.name === 'Guild' || (!!candidate.name && !!candidate.roles);
  return isGuild ? candidate.id : null;
}

function readGuildId(candidate: unknown): string | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const bearing = candidate as GuildBearing;

  if (bearing.guild && typeof bearing.guild.id === 'string') return bearing.guild.id;
  if (typeof bearing.guildId === 'string') return bearing.guildId;
  return readGuildOwnId(bearing);
}

/**
 * Retourne le premier identifiant de serveur trouvé dans les arguments d'un
 * événement, ou `null` si aucun argument n'en porte.
 */
export function resolveEventGuildId(args: unknown[]): string | null {
  for (const arg of args) {
    const guildId = readGuildId(arg);
    if (guildId) return guildId;
  }
  return null;
}
