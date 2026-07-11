import type { Guild } from 'discord.js';

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convertit les "@NomDeRôle" et "#nom-de-salon" écrits en texte brut (ex: saisis
 * dans un textarea du dashboard) en mentions Discord réelles (<@&id> / <#id>).
 *
 * Utilisé pour les descriptions d'embed : dans un embed, une mention rendue ainsi
 * s'affiche et est cliquable mais ne notifie jamais personne (Discord ne déclenche
 * les notifications que pour les mentions présentes dans `content`, jamais dans un embed).
 */
export function resolveTextMentions(guild: Guild | null | undefined, text: string | null | undefined): string {
  if (!text) return '';
  if (!guild) return text;

  let result = text;

  const channels = [...guild.channels.cache.values()]
    .filter((c): c is typeof c & { name: string } => typeof (c as { name?: unknown }).name === 'string')
    .sort((a, b) => b.name.length - a.name.length);

  for (const channel of channels) {
    const pattern = new RegExp(`#${escapeRegExp(channel.name)}\\b`, 'gi');
    result = result.replace(pattern, `<#${channel.id}>`);
  }

  const roles = [...guild.roles.cache.values()]
    .filter((r) => r.name !== '@everyone')
    .sort((a, b) => b.name.length - a.name.length);

  for (const role of roles) {
    const pattern = new RegExp(`@${escapeRegExp(role.name)}\\b`, 'gi');
    result = result.replace(pattern, `<@&${role.id}>`);
  }

  return result;
}
