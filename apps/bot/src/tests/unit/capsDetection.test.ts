import { describe, expect, test } from 'bun:test';
import { getUppercasePercentage } from '../../services/moderation/capsDetection.js';

describe('getUppercasePercentage', () => {
  test('ignore le nom en majuscules des emojis Discord', () => {
    expect(getUppercasePercentage('<:EMOJI_EN_MAJUSCULES:123456789012345678>', 10)).toBeNull();
    expect(getUppercasePercentage('<a:GIF_EN_MAJUSCULES:123456789012345678>', 10)).toBeNull();
  });

  test('ne pénalise pas un message normal accompagné d’un emoji au nom en majuscules', () => {
    expect(
      getUppercasePercentage('voici un emoji vraiment sympa <:SUPER_EMOJI:123456789012345678>', 10)
    ).toBe(0);
  });

  test('continue de détecter les majuscules réellement écrites', () => {
    expect(getUppercasePercentage('CE MESSAGE EST EN MAJUSCULES <:emoji:123456789012345678>', 10)).toBe(100);
  });

  test('respecte le nombre minimal de lettres après retrait des emojis', () => {
    expect(getUppercasePercentage('OK <:TRES_LONG_NOM_EMOJI:123456789012345678>', 10)).toBeNull();
  });
});
