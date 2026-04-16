import { authStore } from './stores/auth.svelte';

const envApiUrl = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/$/, '');

function getBrowserOrigin() {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}

export const API_BASE_URL = envApiUrl;
const wsBaseUrl = API_BASE_URL
  ? API_BASE_URL.replace(/^http/i, 'ws')
  : getBrowserOrigin().replace(/^http/i, 'ws');
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
  if (guildId) {
    return guildId;
  }

  const requestedGuildId = authStore.selectedGuildId;
  if (!requestedGuildId) return null;

  if (authStore.guilds.length === 0) {
    return requestedGuildId;
  }

  const accessibleGuild = authStore.guilds.find((guild) => guild.id === requestedGuildId);
  if (accessibleGuild) {
    return requestedGuildId;
  }

  return authStore.guilds[0]?.id ?? null;
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

async function dashboardRequest(path, {
  method = 'GET',
  payload,
  guildId,
  errorContext = 'API Error'
} = {}) {
  const selectedGuildId = getGuildId(guildId);
  if (!selectedGuildId) return null;

  const hasPayload = payload !== undefined;

  try {
    const response = await authorizedFetch(`${BASE_URL}/guilds/${selectedGuildId}${path}`, {
      method,
      headers: hasPayload ? JSON_HEADERS : undefined,
      body: hasPayload ? JSON.stringify(payload) : undefined
    });

    if (!response.ok) {
      let message = `Server error: ${response.status}`;
      try {
        const data = await response.json();
        if (data && typeof data.error === 'string' && data.error.trim()) {
          message = data.error.trim();
        } else if (data && typeof data.message === 'string' && data.message.trim()) {
          message = data.message.trim();
        }
      } catch {
        // ignore JSON parsing errors and keep fallback message
      }
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  } catch (error) {
    console.error(errorContext, error);
    throw error;
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

export async function updateCommandAccessSettings(commandRestrictions, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/command-access', {
    method: 'PUT',
    payload: { commandRestrictions },
    guildId,
    errorContext: 'API Error (Command Access):'
  });
}

export async function createSanctionReport(report, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/sanctions/reports', {
    method: 'POST',
    payload: report,
    guildId,
    errorContext: 'API Error (Sanction Report):'
  });
}

export async function deleteSanction(sanctionId, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/sanctions/${sanctionId}`, {
    method: 'DELETE',
    guildId,
    errorContext: 'API Error (Delete Sanction):'
  });
}

export async function fetchMemberCase(userId, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/members/${userId}`, {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Member Case):'
  });
}

export async function runMemberCaseAction(userId, action, { reason, durationMs } = {}, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/members/${userId}/actions`, {
    method: 'POST',
    payload: {
      type: action,
      reason,
      durationMs,
    },
    guildId,
    errorContext: 'API Error (Member Case Action):'
  });
}

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
  return dashboardMutation('/regulation/publish', {
    method: 'POST',
    guildId,
    errorContext: 'API Error (Publish Regulation):'
  });
}

export async function updateRegulationSettings(regulationChannelId, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/settings', {
    method: 'PATCH',
    payload: { regulationChannelId },
    guildId,
    errorContext: 'API Error (Regulation Settings):'
  });
}

export async function fetchDailyAlgoProblems(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/daily-algo-problems', {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Fetch Daily Algo Problems):'
  });
}

export async function createDailyAlgoProblem(problem, guildId = authStore.selectedGuildId) {
  return dashboardRequest('/daily-algo-problems', {
    method: 'POST',
    payload: problem,
    guildId,
    errorContext: 'API Error (Create Daily Algo Problem):'
  });
}

export async function updateDailyAlgoProblem(problemId, problem, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/daily-algo-problems/${problemId}`, {
    method: 'PATCH',
    payload: problem,
    guildId,
    errorContext: 'API Error (Update Daily Algo Problem):'
  });
}

export async function fetchTodayDailyAlgoSubmissions(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/daily-algo-submissions/today', {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Fetch Daily Algo Submissions):'
  });
}

export async function fetchDailyAlgoSubmissionHistory(limit = 7, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/daily-algo-submissions/history?limit=${Math.max(1, Math.trunc(limit || 1))}`, {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Fetch Daily Algo Submission History):'
  });
}

export async function reviewDailyAlgoSubmission(submissionId, review, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/daily-algo-submissions/${submissionId}`, {
    method: 'PATCH',
    payload: review,
    guildId,
    errorContext: 'API Error (Review Daily Algo Submission):'
  });
}

// ==========================================
// STAFF LEADERSHIP / HR APIs
// ==========================================

export async function fetchStaffMetrics(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/leadership', { method: 'GET', guildId });
}

export async function fetchAbsences(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/absences', { method: 'GET', guildId });
}

export async function updateAbsenceStatus(absenceId, status, note, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/absences/${absenceId}`, { method: 'PATCH', payload: { status, note }, guildId });
}

export async function fetchMeetings(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/meetings', { method: 'GET', guildId });
}

export async function createMeeting(title, description, scheduledAt, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/meetings', { method: 'POST', payload: { title, description, scheduledAt }, guildId });
}

export async function fetchPolls(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/polls', { method: 'GET', guildId });
}

export async function createPoll(title, description, options, closesAt, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/polls', { method: 'POST', payload: { title, description, options, closesAt }, guildId });
}

export async function fetchProcedures(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/procedures', { method: 'GET', guildId });
}

export async function upsertProcedure(procedureId, title, content, sortOrder, guildId = authStore.selectedGuildId) {
  if (procedureId) {
    return dashboardMutation(`/procedures/${procedureId}`, { method: 'PATCH', payload: { title, content, sortOrder }, guildId });
  }
  return dashboardMutation('/procedures', { method: 'POST', payload: { title, content, sortOrder }, guildId });
}

export async function deleteProcedure(procedureId, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/procedures/${procedureId}`, { method: 'DELETE', guildId });
}

export async function markProcedureRead(procedureId, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/procedures/read`, { method: 'POST', payload: { procedureId }, guildId });
}


export async function fetchManagerNotes(staffUserId, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/staff/${staffUserId}/notes`, { method: 'GET', guildId });
}

export async function addManagerNote(staffUserId, content, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/staff/${staffUserId}/notes`, { method: 'POST', payload: { content }, guildId });
}

export async function deleteManagerNote(staffUserId, noteId, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/staff/${staffUserId}/notes/${noteId}`, { method: 'DELETE', guildId });
}
