import { describe, expect, test } from 'bun:test';
import { isShopItemAvailable } from '../../services/features/economyPolicy.js';

describe('economy shop item availability', () => {
  test('accepts purchasable global and same-guild items', () => {
    expect(isShopItemAvailable({ purchasable: true, guildId: null }, 'guild-a')).toBe(true);
    expect(isShopItemAvailable({ purchasable: true, guildId: 'guild-a' }, 'guild-a')).toBe(true);
  });

  test('rejects non-purchasable items', () => {
    expect(isShopItemAvailable({ purchasable: false, guildId: null }, 'guild-a')).toBe(false);
    expect(isShopItemAvailable({ purchasable: false, guildId: 'guild-a' }, 'guild-a')).toBe(false);
  });

  test('rejects items owned by another guild', () => {
    expect(isShopItemAvailable({ purchasable: true, guildId: 'guild-b' }, 'guild-a')).toBe(false);
  });

  test('rejects a missing item', () => {
    expect(isShopItemAvailable(null, 'guild-a')).toBe(false);
  });
});
