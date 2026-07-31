/** Personnalisation de la carte `/rank` : globale a l utilisateur, hors guilde. */
import type { RankCardBackgroundPreset, RankCardCustomization } from '@kotbo/shared';
import { API_BASE_URL, authorizedFetch } from './client';

const RANK_CARD_URL = `${API_BASE_URL}/api/user/rank-card`;

export type RankCardOptions = {
  customization: RankCardCustomization;
  backgrounds: RankCardBackgroundPreset[];
  emojis: string[];
  maxEmojis: number;
};

export async function fetchRankCardOptions(): Promise<RankCardOptions | null> {
  const response = await authorizedFetch(RANK_CARD_URL);
  if (!response.ok) return null;
  return response.json();
}

export async function saveRankCard(customization: RankCardCustomization): Promise<RankCardCustomization | null> {
  const response = await authorizedFetch(RANK_CARD_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(customization),
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data?.customization ?? null;
}

/**
 * L apercu est rendu par le bot avec le meme code que `/rank` : pas de canvas
 * a maintenir en double cote dashboard.
 */
export async function fetchRankCardPreview(customization: RankCardCustomization): Promise<string | null> {
  const response = await authorizedFetch(`${RANK_CARD_URL}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(customization),
  });
  if (!response.ok) return null;
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
