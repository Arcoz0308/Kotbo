type ShopItemAvailability = {
  purchasable: boolean;
  guildId: string | null;
};

export function isShopItemAvailable<T extends ShopItemAvailability>(
  item: T | null,
  guildId: string,
): item is T {
  return Boolean(item?.purchasable && (item.guildId === null || item.guildId === guildId));
}
