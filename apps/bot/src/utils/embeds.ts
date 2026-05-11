import {
  EmbedBuilder,
  type ColorResolvable,
  type APIEmbedField,
} from 'discord.js';

export const COLORS = {
  primary: 0x5865f2 as ColorResolvable,
  success: 0x57f287 as ColorResolvable,
  danger: 0xed4245 as ColorResolvable,
  warning: 0xfee75c as ColorResolvable,
  info: 0x5865f2 as ColorResolvable,
  dark: 0x2b2d31 as ColorResolvable,
};

export function baseEmbed(color: ColorResolvable = COLORS.primary) {
  return new EmbedBuilder()
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: 'Kotbo' });
}

export function successEmbed(title: string, description?: string) {
  return baseEmbed(COLORS.success).setTitle(`✅ ${title}`).setDescription(description ?? null);
}

export function errorEmbed(title: string, description?: string) {
  return baseEmbed(COLORS.danger).setTitle(`❌ ${title}`).setDescription(description ?? null);
}

export function infoEmbed(title: string, description?: string, fields?: APIEmbedField[]) {
  const e = baseEmbed(COLORS.info).setTitle(`ℹ️ ${title}`);
  if (description) e.setDescription(description);
  if (fields?.length) e.addFields(fields);
  return e;
}

export function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}



