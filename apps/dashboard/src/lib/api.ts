import { authStore } from './stores/auth.svelte';

const envApiUrl = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/$/, '');

function getFallbackApiBaseUrl() {
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${window.location.hostname}:8787`;
  }
  return '';
}

export const API_BASE_URL = envApiUrl || getFallbackApiBaseUrl();
const wsBaseUrl = API_BASE_URL ? API_BASE_URL.replace(/^http/i, 'ws') : getFallbackApiBaseUrl().replace(/^http/i, 'ws');
export const DASHBOARD_WS_URL = `${wsBaseUrl}/api/dashboard/ws`;
const BASE_URL = `${API_BASE_URL}/api/dashboard`;
const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function authorizedFetch(url, options = {}) {
  const token = authStore.token;
  if (!token) {
    throw new Error('No auth token available');
  }

  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json'
  };

  const response = await fetch(url, { ...options, headers });
  
  if (response.status === 401) {
    authStore.logout();
    throw new Error('Session expired');
  }

  return response;
}

function getGuildId(guildId) {
  return guildId || authStore.selectedGuildId;
}

async function dashboardMutation(path, {
  method = 'PUT',
  payload,
  guildId,
  errorContext = 'API Error'
} = {}) {
  const selectedGuildId = getGuildId(guildId);
  if (!selectedGuildId) return false;

  const hasPayload = payload !== undefined;

  try {
    const response = await authorizedFetch(`${BASE_URL}/guilds/${selectedGuildId}${path}`, {
      method,
      headers: hasPayload ? JSON_HEADERS : undefined,
      body: hasPayload ? JSON.stringify(payload) : undefined
    });
    return response.ok;
  } catch (error) {
    console.error(errorContext, error);
    return false;
  }
}

export async function fetchGuildState(guildId = authStore.selectedGuildId) {
  const selectedGuildId = getGuildId(guildId);
  if (!selectedGuildId) {
    console.warn('API: Attempted to fetch guild state without a selected guild.');
    return null;
  }

  try {
    const response = await authorizedFetch(`${BASE_URL}/guilds/${selectedGuildId}`);
    if (!response.ok) {
        const error = new Error(`Server error: ${response.status}`);
        (error).status = response.status;
        throw error;
    }
    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

export async function updateModuleStatus(moduleId, status, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/modules/${moduleId}`, {
    method: 'PUT',
    payload: { status },
    guildId
  });
}

export async function updateFeed(feedId, feedData, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/feeds/${feedId}`, {
    method: 'PUT',
    payload: feedData,
    guildId
  });
}

export async function updateYouTubeSettings(youtubeReferenceChannelId, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/youtube', {
    method: 'PUT',
    payload: { youtubeReferenceChannelId },
    guildId,
    errorContext: 'API Error (YouTube Settings):'
  });
}

export async function deleteFeed(feedId, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/feeds/${feedId}`, {
    method: 'DELETE',
    guildId
  });
}

export async function forceSendContent(contentId, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/content/${contentId}/force-send`, {
    method: 'POST',
    guildId
  });
}

export async function markContentError(contentId, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/content/${contentId}/mark-error`, {
    method: 'POST',
    guildId
  });
}

export async function translateContent(contentId, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/content/${contentId}/translate`, {
    method: 'POST',
    guildId,
    errorContext: 'API Error (Traduction contenu):'
  });
}

export async function translateContentTitle(contentId, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/content/${contentId}/translate-title`, {
    method: 'POST',
    guildId,
    errorContext: 'API Error (Traduction du titre):'
  });
}

export async function translateContentDescription(contentId, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/content/${contentId}/translate-description`, {
    method: 'POST',
    guildId,
    errorContext: 'API Error (Traduction de la description):'
  });
}

export async function translateText(text, targetLang = 'fr') {
  try {
    const response = await authorizedFetch(`${BASE_URL}/translate`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ text, targetLang })
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.translatedText;
  } catch (error) {
    console.error('API Error (Translation):', error);
    return null;
  }
}

export async function updateGlobalSettings(settings, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/settings', {
    method: 'PATCH',
    payload: settings,
    guildId,
    errorContext: 'API Error (Global Settings):'
  });
}

export async function updateNotificationsSettings(notifications, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/notifications', {
    method: 'PUT',
    payload: notifications,
    guildId,
    errorContext: 'API Error (Notifications):'
  });
}
