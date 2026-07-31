import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  normalizeRankCardCustomization,
  rankCardEmojiCodePoint,
  rankCardEmojiImageUrl,
  getRankCardBackground,
  DEFAULT_RANK_CARD_CUSTOMIZATION,
  RANK_CARD_BACKGROUNDS,
  RANK_CARD_EMOJIS,
  RANK_CARD_MAX_EMOJIS,
} from '@kotbo/shared';

describe('normalizeRankCardCustomization', () => {
  test('retombe sur le defaut pour toute entree non exploitable', () => {
    for (const raw of [null, undefined, 42, 'default', [], true]) {
      expect(normalizeRankCardCustomization(raw)).toEqual(DEFAULT_RANK_CARD_CUSTOMIZATION);
    }
  });

  test('conserve un fond du catalogue', () => {
    const preset = RANK_CARD_BACKGROUNDS[RANK_CARD_BACKGROUNDS.length - 1];
    expect(normalizeRankCardCustomization({ backgroundId: preset.id }).backgroundId).toBe(preset.id);
  });

  test('remplace un fond hors catalogue par le defaut', () => {
    const result = normalizeRankCardCustomization({ backgroundId: 'nimportequoi' });
    expect(result.backgroundId).toBe(DEFAULT_RANK_CARD_CUSTOMIZATION.backgroundId);
  });

  test('ecarte les emojis hors catalogue sans rejeter les autres', () => {
    const result = normalizeRankCardCustomization({ emojis: ['🔥', '🍕', '⭐'] });
    expect(result.emojis).toEqual(['🔥', '⭐']);
  });

  test('preserve l ordre choisi', () => {
    expect(normalizeRankCardCustomization({ emojis: ['⭐', '🔥'] }).emojis).toEqual(['⭐', '🔥']);
  });

  test('deduplique', () => {
    expect(normalizeRankCardCustomization({ emojis: ['🔥', '🔥', '⭐'] }).emojis).toEqual(['🔥', '⭐']);
  });

  test('plafonne au maximum autorise', () => {
    const tous = RANK_CARD_EMOJIS.map((emoji) => emoji.value);
    expect(tous.length).toBeGreaterThan(RANK_CARD_MAX_EMOJIS);
    expect(normalizeRankCardCustomization({ emojis: tous }).emojis).toHaveLength(RANK_CARD_MAX_EMOJIS);
  });

  test('ignore les entrees non textuelles de la liste', () => {
    const result = normalizeRankCardCustomization({ emojis: [null, 7, {}, '🔥'] });
    expect(result.emojis).toEqual(['🔥']);
  });

  test('vide la liste quand `emojis` n est pas un tableau', () => {
    expect(normalizeRankCardCustomization({ emojis: '🔥' }).emojis).toEqual([]);
  });

  test('ne recopie pas les cles inconnues du corps de requete', () => {
    const result = normalizeRankCardCustomization({ backgroundId: 'midnight', injecte: 'oui' });
    expect(Object.keys(result).sort()).toEqual(['backgroundId', 'emojis']);
  });
});

describe('catalogue de la carte de rang', () => {
  test('le fond par defaut existe', () => {
    expect(RANK_CARD_BACKGROUNDS.some((p) => p.id === DEFAULT_RANK_CARD_CUSTOMIZATION.backgroundId)).toBe(true);
  });

  test('les identifiants de fond sont uniques', () => {
    const ids = RANK_CARD_BACKGROUNDS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('chaque fond fournit au moins deux teintes d accent', () => {
    // `renderRankCard` lit accentBar[0] et le dernier arret pour l anneau, la
    // barre d XP et les libelles : une seule teinte donnerait un degrade plat.
    for (const preset of RANK_CARD_BACKGROUNDS) {
      expect(preset.accentBar.length).toBeGreaterThanOrEqual(2);
    }
  });

  test('getRankCardBackground retombe sur le defaut hors catalogue', () => {
    expect(getRankCardBackground('inconnu').id).toBe(DEFAULT_RANK_CARD_CUSTOMIZATION.backgroundId);
    expect(getRankCardBackground(null).id).toBe(DEFAULT_RANK_CARD_CUSTOMIZATION.backgroundId);
  });

  test('les points de code emoji sont uniques', () => {
    const points = RANK_CARD_EMOJIS.map((emoji) => emoji.codePoint);
    expect(new Set(points).size).toBe(points.length);
  });

  test('resout le point de code et l asset des emojis du catalogue', () => {
    for (const emoji of RANK_CARD_EMOJIS) {
      expect(rankCardEmojiCodePoint(emoji.value)).toBe(emoji.codePoint);
      expect(rankCardEmojiImageUrl(emoji.value)).toBe(`/rank-emojis/${emoji.codePoint}.png`);
    }
  });

  test('ne resout rien hors catalogue', () => {
    expect(rankCardEmojiCodePoint('🍕')).toBeNull();
    expect(rankCardEmojiImageUrl('🍕')).toBeNull();
  });

  test('chaque emoji du catalogue a son asset sur disque', () => {
    // Le rendu ignore silencieusement un asset manquant : sans ce test, ajouter
    // une entree au catalogue sans deposer le PNG passerait inapercu.
    const dir = fileURLToPath(new URL('../../../assets/rank-emojis/', import.meta.url));
    const manquants = RANK_CARD_EMOJIS
      .map((emoji) => `${emoji.codePoint}.png`)
      .filter((fichier) => !existsSync(`${dir}${fichier}`));
    expect(manquants).toEqual([]);
  });
});
