import * as m from '../lib/paraglide/messages.js';

// `guildLocale` vaut `null` hors serveur cote discord.js (et `locale` est un
// enum Locale, compatible string) : le type doit accepter les deux.
export function getLocale(interaction: { locale?: string | null; guildLocale?: string | null }): 'fr' | 'en' {
  const code = interaction.locale ?? interaction.guildLocale ?? 'fr';
  return code.startsWith('fr') ? 'fr' : 'en';
}

export function getCommandMetadata(keyPrefix: string) {
  const enName = (m as any)[`${keyPrefix}_name`]?.({}, { locale: 'en' }) || keyPrefix;
  const frName = (m as any)[`${keyPrefix}_name`]?.({}, { locale: 'fr' }) || keyPrefix;
  const enDesc = (m as any)[`${keyPrefix}_description`]?.({}, { locale: 'en' }) || 'No description';
  const frDesc = (m as any)[`${keyPrefix}_description`]?.({}, { locale: 'fr' }) || 'Pas de description';

  return {
    name: enName,
    nameLocalizations: {
      fr: frName,
    },
    description: enDesc,
    descriptionLocalizations: {
      fr: frDesc,
    },
  };
}
