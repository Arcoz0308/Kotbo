/** Reglement interne. */
import { authStore } from '../stores/auth.svelte';
import { dashboardMutation, dashboardRequest } from './client';

export async function createRegulationArticle(article, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/regulation/articles', {
    method: 'POST',
    payload: article,
    guildId,
    errorContext: 'API Error (Create Regulation Article):'
  });
}

export async function updateRegulationArticle(articleId, article, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/regulation/articles/${articleId}`, {
    method: 'PATCH',
    payload: article,
    guildId,
    errorContext: 'API Error (Update Regulation Article):'
  });
}

export async function reorderRegulationArticles(articleIds, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/regulation/articles/reorder', {
    method: 'PATCH',
    payload: { articleIds },
    guildId,
    errorContext: 'API Error (Reorder Regulation Articles):'
  });
}

export async function deleteRegulationArticle(articleId, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/regulation/articles/${articleId}`, {
    method: 'DELETE',
    guildId,
    errorContext: 'API Error (Delete Regulation Article):'
  });
}

export async function publishRegulation(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/regulation/publish', {
    method: 'POST',
    guildId,
    errorContext: 'API Error (Publish Regulation):'
  });
}

export async function updateRegulationSettings(payload: any, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/settings', {
    method: 'PATCH',
    payload,
    guildId,
    errorContext: 'API Error (Regulation Settings):'
  });
}
