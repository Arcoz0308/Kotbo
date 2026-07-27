/** Quetes. */
import { authStore } from '../stores/auth.svelte';
import { dashboardMutation, dashboardRequest } from './client';

// ============================================================================
// QUESTS
// ============================================================================

export async function fetchQuestsData(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/quests', { method: 'GET', guildId, errorContext: 'API Error (Quests):' });
}

export async function createQuest(data: { name: string; description: string; type: string; frequency: string; target: number; rewardCoins: number; rewardXp: number }, guildId = authStore.selectedGuildId) {
  return dashboardRequest('/quests', { method: 'POST', payload: data, guildId, errorContext: 'API Error (Create Quest):' });
}

export async function updateQuest(questId: string, data: Record<string, any>, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/quests/${questId}`, { method: 'PATCH', payload: data, guildId, errorContext: 'API Error (Update Quest):' });
}

export async function deleteQuest(questId: string, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/quests/${questId}`, { method: 'DELETE', guildId, errorContext: 'API Error (Delete Quest):' });
}
