import * as m from '../lib/paraglide/messages.js';

export function getLocale(interaction: { locale?: string; guildLocale?: string }): 'fr' | 'en' {
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
