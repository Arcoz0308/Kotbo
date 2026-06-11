import { authStore } from './stores/auth.svelte';
import { toast } from './stores/toast.svelte';

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

async function authorizedFetch(url: string, options: RequestInit & { headers?: Record<string, string> } = {}): Promise<Response> {
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

function getGuildId(guildId?: string) {
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

async function dashboardMutation(path: string, options: {
  method?: string;
  payload?: any;
  guildId?: string;
  errorContext?: string;
} = {}): Promise<boolean> {
  const selectedGuildId = getGuildId(options.guildId);
  if (!selectedGuildId) return false;

  const method = options.method || 'PUT';
  const errorContext = options.errorContext || 'API Error';
  const hasPayload = options.payload !== undefined;

  try {
    const response = await authorizedFetch(`${BASE_URL}/guilds/${selectedGuildId}${path}`, {
      method,
      headers: hasPayload ? JSON_HEADERS : undefined,
      body: hasPayload ? JSON.stringify(options.payload) : undefined
    });

    if (response.ok) {
      if (method !== 'GET') {
        toast.success('Opération réussie');
      }
    } else {
      let message = 'Erreur lors de l\'opération';
      try {
        const data = await response.json();
        message = data.error || data.message || message;
      } catch { }
      toast.error(message);
    }

    return response.ok;
  } catch (error) {
    console.error(errorContext, error);
    toast.error('Erreur réseau ou serveur');
    return false;
  }
}

async function dashboardRequest(path: string, options: {
  method?: string;
  payload?: any;
  guildId?: string;
  errorContext?: string;
  silent?: boolean;
} = {}): Promise<any> {
  const selectedGuildId = getGuildId(options.guildId);
  if (!selectedGuildId) return null;

  const method = options.method || 'GET';
  const errorContext = options.errorContext || 'API Error';
  const hasPayload = options.payload !== undefined;

  try {
    const response = await authorizedFetch(`${BASE_URL}/guilds/${selectedGuildId}${path}`, {
      method,
      headers: hasPayload ? JSON_HEADERS : undefined,
      body: hasPayload ? JSON.stringify(options.payload) : undefined
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
      (error as any).status = response.status;
      throw error;
    }

    if (method !== 'GET' && response.ok) {
      toast.success('Opération réussie');
    }

    return await response.json();
  } catch (error) {
    if (!options.silent) {
      console.error(errorContext, error);
      toast.error(error.message || 'Erreur réseau ou serveur');
    }
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
      (error as any).status = response.status;
      try {
        const body = await response.clone().json();
        if (body?.needsActivation) {
          (error as any).needsActivation = true;
        }
        if (body?.hint) {
          (error as any).hint = body.hint;
          console.error('API hint:', body.hint);
        }
      } catch { }
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

export async function applyGuildPreset(presetKey, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/presets', {
    method: 'POST',
    payload: { presetKey },
    guildId,
    errorContext: 'API Error (Presets):'
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

export async function updateSidebarFavorites(sidebarFavorites: string[], guildId = authStore.selectedGuildId) {
  const selectedGuildId = getGuildId(guildId);
  if (!selectedGuildId) return false;

  try {
    const response = await authorizedFetch(`${BASE_URL}/guilds/${selectedGuildId}/settings`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({ sidebarFavorites })
    });

    if (!response.ok) {
      let message = 'Erreur lors de la sauvegarde des favoris';
      try {
        const data = await response.json();
        message = data.error || data.message || message;
      } catch {
        // Ignore JSON parsing errors.
      }
      toast.error(message);
      return false;
    }

    return true;
  } catch (error) {
    console.error('API Error (Sidebar Favorites):', error);
    toast.error('Erreur réseau ou serveur');
    return false;
  }
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

export async function updateSanctionReport(reportId, report, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/sanctions/reports/${reportId}`, {
    method: 'PATCH',
    payload: report,
    guildId,
    errorContext: 'API Error (Update Sanction Report):'
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

export async function runMemberCaseAction(userId: string, action: string, { reason, durationMs }: { reason?: string; durationMs?: number } = {}, guildId = authStore.selectedGuildId) {
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

export async function linkMemberAccount(userId, targetAccountId, reason = '', guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/members/${userId}/link`, {
    method: 'POST',
    payload: { targetAccountId, reason },
    guildId,
    errorContext: 'API Error (Link Member Account):'
  });
}

export async function unlinkMemberAccount(userId, targetAccountId, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/members/${userId}/link/${targetAccountId}`, {
    method: 'DELETE',
    guildId,
    errorContext: 'API Error (Unlink Member Account):'
  });
}

export async function updateMemberNote(userId, note, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/members/${userId}/note`, {
    method: 'PATCH',
    payload: { note },
    guildId,
    errorContext: 'API Error (Update Member Note):'
  });
}

export async function fetchLinkedAccounts(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/linked-accounts', {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Fetch Linked Accounts):'
  });
}

export async function updateLinkedAccountStatus(id: string, status: 'VALIDATED' | 'REJECTED', guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/linked-accounts/${id}`, {
    method: 'PATCH',
    payload: { status },
    guildId,
    errorContext: 'API Error (Update Linked Account):'
  });
}

export async function deleteLinkedAccount(id: string, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/linked-accounts/${id}`, {
    method: 'DELETE',
    guildId,
    errorContext: 'API Error (Delete Linked Account):'
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
  return dashboardRequest('/regulation/publish', {
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

export async function deleteDailyAlgoProblem(problemId, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/daily-algo-problems/${problemId}`, {
    method: 'DELETE',
    guildId,
    errorContext: 'API Error (Delete Daily Algo Problem):'
  });
}

export async function fetchDailyAlgoSchedule(daysBack = 7, daysForward = 21, guildId = authStore.selectedGuildId) {
  const safeDaysBack = Math.max(0, Math.trunc(daysBack || 0));
  const safeDaysForward = Math.max(0, Math.trunc(daysForward || 0));
  return dashboardRequest(`/daily-algo-runs/schedule?daysBack=${safeDaysBack}&daysForward=${safeDaysForward}`, {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Fetch Daily Algo Schedule):'
  });
}

export async function ensureDailyAlgoSchedule(daysForward = 21, guildId = authStore.selectedGuildId) {
  const safeDaysForward = Math.max(1, Math.trunc(daysForward || 1));
  return dashboardRequest('/daily-algo-runs/schedule/ensure', {
    method: 'POST',
    payload: { daysForward: safeDaysForward },
    guildId,
    errorContext: 'API Error (Ensure Daily Algo Schedule):'
  });
}

export async function swapTodayDailyAlgoProblem(problemId, guildId = authStore.selectedGuildId) {
  return dashboardRequest('/daily-algo-runs/today/problem', {
    method: 'PATCH',
    payload: { problemId },
    guildId,
    errorContext: 'API Error (Swap Today Daily Algo Problem):'
  });
}

export async function fetchMyApiKeys(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/api-keys', {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Fetch API Keys):'
  });
}

export async function createOrResetDailyAlgoApiKey(name = 'Kotbo Daily Algo', guildId = authStore.selectedGuildId) {
  return dashboardRequest('/api-keys', {
    method: 'POST',
    payload: {
      name,
      permissions: [
        'daily_algo:read_exercise',
        'daily_algo:create_exercise',
        'daily_algo:update_exercise',
        'daily_algo:manage_exercises'
      ]
    },
    guildId,
    errorContext: 'API Error (Create or Reset API Key):'
  });
}

export async function deleteMyApiKey(keyId, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/api-keys/${keyId}`, {
    method: 'DELETE',
    guildId,
    errorContext: 'API Error (Delete API Key):'
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

export async function fetchDailyAlgoSubmission(submissionId, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/daily-algo-submissions/${submissionId}`, {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Fetch Daily Algo Submission):'
  });
}

// ==========================================
// STAFF LEADERSHIP / HR APIs
// ==========================================

export async function fetchStaffMetrics(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/leadership', { method: 'GET', guildId });
}

export async function fetchStaffMembers(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/staff/members', { method: 'GET', guildId });
}

export async function fetchStaffWarnings(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/staff/warnings', { method: 'GET', guildId });
}

export async function fetchStaffRoles(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/staff/roles', {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Fetch Staff Roles):'
  });
}

export async function deleteStaffRole(roleId, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/staff/roles/${roleId}`, {
    method: 'DELETE',
    guildId,
    errorContext: 'API Error (Delete Staff Role):'
  });
}

export async function updateStaffRole(roleId, data, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/staff/roles/${roleId}`, {
    method: 'PATCH',
    payload: data,
    guildId,
    errorContext: 'API Error (Update Staff Role):'
  });
}

export async function fetchStaffConfig(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/staff/config', {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Fetch Staff Config):'
  });
}

export async function updateStaffConfig(config, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/staff/config', {
    method: 'PATCH',
    payload: config,
    guildId,
    errorContext: 'API Error (Update Staff Config):'
  });
}

export async function fetchDiscordChannels(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/channels', {
    method: 'GET',
    guildId,
    silent: true,
    errorContext: 'API Error (Fetch Discord Channels):'
  });
}

export async function fetchAbsences(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/absences', { method: 'GET', guildId });
}

export async function fetchStaffCalendarData(start: Date, end: Date, staffIds?: string[], guildId = authStore.selectedGuildId) {
  let path = `/absences/calendar-data?start=${start.toISOString()}&end=${end.toISOString()}`;
  if (staffIds && staffIds.length > 0) {
    path += `&staffIds=${staffIds.join(',')}`;
  }
  return dashboardRequest(path, { method: 'GET', guildId });
}

export async function fetchAbsenceConfig(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/absences/config', { method: 'GET', guildId });
}

export async function updateAbsenceConfig(
  config: {
    managerRoleLevels: number[];
    webhookUrl?: string | null;
    channelId?: string | null;
    notificationRoleId?: string | null;
    notifyViaDiscordChannel?: boolean;
  },
  guildId = authStore.selectedGuildId
) {
  return dashboardRequest('/absences/config', { method: 'POST', payload: config, guildId });
}

export async function updateAbsenceStatus(absenceId, status, note, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/absences/${absenceId}`, { method: 'PATCH', payload: { status, note }, guildId });
}

export async function deleteAbsence(absenceId, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/absences/${absenceId}`, { method: 'DELETE', guildId });
}

export async function fetchMeetings(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/meetings', { method: 'GET', guildId });
}

export async function createMeeting(title, description, scheduledAt, endedAt?, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/meetings', { method: 'POST', payload: { title, description, scheduledAt, endedAt }, guildId });
}

export async function deleteMeeting(meetingId, options = { deleteEvent: true, deleteMessage: false, deleteNotifications: false }, guildId = authStore.selectedGuildId) {
  const params = new URLSearchParams();
  if (options.deleteEvent) params.append('deleteEvent', 'true');
  if (options.deleteMessage) params.append('deleteMessage', 'true');
  if (options.deleteNotifications) params.append('deleteNotifications', 'true');

  const queryString = params.toString();
  const path = `/meetings/${meetingId}${queryString ? '?' + queryString : ''}`;

  return dashboardMutation(path, { method: 'DELETE', guildId });
}

export async function updateMeeting(meetingId, data, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/meetings/${meetingId}`, { method: 'PATCH', payload: data, guildId });
}

export async function createAbsence(data, guildId = authStore.selectedGuildId) {
  return dashboardRequest('/absences', { method: 'POST', payload: data, guildId });
}

export async function fetchPolls(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/staff/polls', { method: 'GET', guildId });
}

export async function createPoll(title, description, options, closesAt, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/staff/polls', { method: 'POST', payload: { title, description, options, closesAt }, guildId });
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

export async function toggleTutorStatus(userId, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/staff/members/${userId}/tutor`, { method: 'POST', guildId });
}

export async function fetchAnalytics(options: { period?: number, startDate?: string, endDate?: string, granularity?: string } = {}, guildId = authStore.selectedGuildId) {
  const params = new URLSearchParams();
  if (options.period) params.append('period', options.period.toString());
  if (options.startDate) params.append('startDate', options.startDate);
  if (options.endDate) params.append('endDate', options.endDate);
  if (options.granularity) params.append('granularity', options.granularity);

  return dashboardRequest(`/analytics?${params.toString()}`, {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Analytics):'
  });
}

export async function fetchInviteAnalytics(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/analytics/invites', {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Invite Analytics):'
  });
}

export async function fetchMemberDetailedAnalytics(userId, period = 30, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/analytics/members?userId=${userId}&period=${period}`, {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Member Detailed Analytics):'
  });
}

export async function fetchPublicProfile(userId: string) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authStore.token) {
    headers.Authorization = `Bearer ${authStore.token}`;
  }

  const response = await fetch(`${API_BASE_URL}/api/public/profile/${userId}`, { headers });
  if (!response.ok) {
    const error = new Error(`Server error: ${response.status}`);
    (error as any).status = response.status;
    throw error;
  }

  return response.json();
}

export async function updatePublicProfile(userId: string, payload: { bio?: string | null; isProfilePrivate?: boolean }) {
  if (!authStore.token) {
    throw new Error('No auth token available');
  }

  const response = await fetch(`${API_BASE_URL}/api/public/profile/${userId}`, {
    method: 'PATCH',
    headers: {
      ...JSON_HEADERS,
      Authorization: `Bearer ${authStore.token}`,
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = new Error(`Server error: ${response.status}`);
    (error as any).status = response.status;
    throw error;
  }

  return response.json();
}

export async function fetchStaffProfile(userId: string, guildId = authStore.selectedGuildId) {
  const selectedGuildId = getGuildId(guildId);
  if (!selectedGuildId) return null;

  if (!authStore.token) {
    throw new Error('No auth token available');
  }

  const response = await fetch(`${API_BASE_URL}/api/dashboard/users/${userId}/profile?guildId=${selectedGuildId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${authStore.token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const error = new Error(`Server error: ${response.status}`);
    (error as any).status = response.status;
    throw error;
  }

  return response.json();
}

export async function fetchHourlyHeatmap(options: { days?: number, startDate?: string, endDate?: string } = {}, guildId = authStore.selectedGuildId) {
  const params = new URLSearchParams();
  if (options.days) params.append('days', options.days.toString());
  if (options.startDate) params.append('startDate', options.startDate);
  if (options.endDate) params.append('endDate', options.endDate);

  return dashboardRequest(`/analytics/heatmap?${params.toString()}`, {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Hourly Heatmap):'
  });
}

export async function fetchWeeklyComparison(options: { offset?: number, mode?: 'week' | 'month' } = {}, guildId = authStore.selectedGuildId) {
  const params = new URLSearchParams();
  if (options.offset) params.append('offset', options.offset.toString());
  if (options.mode) params.append('mode', options.mode);
  return dashboardRequest(`/analytics/weekly-comparison?${params.toString()}`, {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Weekly Comparison):'
  });
}

export async function fetchGrowthAndRetention(options: { days?: number, startDate?: string, endDate?: string } = {}, guildId = authStore.selectedGuildId) {
  const params = new URLSearchParams();
  if (options.days) params.append('days', options.days.toString());
  if (options.startDate) params.append('startDate', options.startDate);
  if (options.endDate) params.append('endDate', options.endDate);

  return dashboardRequest(`/analytics/growth-retention?${params.toString()}`, {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Growth & Retention):'
  });
}

export async function fetchDailyAlgoAnalytics(options: { days?: number, startDate?: string, endDate?: string } = {}, guildId = authStore.selectedGuildId) {
  const params = new URLSearchParams();
  if (options.days) params.append('days', options.days.toString());
  if (options.startDate) params.append('startDate', options.startDate);
  if (options.endDate) params.append('endDate', options.endDate);

  return dashboardRequest(`/analytics/daily-algo?${params.toString()}`, {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Daily Algo Analytics):'
  });
}

export async function fetchGlobalInteractions(options: { period?: number, startDate?: string, endDate?: string } = {}, guildId = authStore.selectedGuildId) {
  const params = new URLSearchParams();
  if (options.period) params.append('period', options.period.toString());
  if (options.startDate) params.append('startDate', options.startDate);
  if (options.endDate) params.append('endDate', options.endDate);

  return dashboardRequest(`/analytics/interactions?${params.toString()}`, {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Global Interactions Graph):'
  });
}

// Tutoring
export async function fetchTutoringConfig(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/tutoring/config', { method: 'GET', guildId });
}

export async function updateTutoringConfig(config, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/tutoring/config', { method: 'PATCH', payload: config, guildId });
}

export async function fetchTutoringItems(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/tutoring/items', { method: 'GET', guildId });
}

export async function upsertTutoringItem(item, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/tutoring/items', { method: 'POST', payload: item, guildId });
}

export async function deleteTutoringItem(itemId, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/tutoring/items/${itemId}`, { method: 'DELETE', guildId });
}

export async function fetchTutorDashboard(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/tutoring/tutor-dashboard', { method: 'GET', guildId });
}

export async function fetchApprenticeProgress(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/tutoring/apprentice-progress', { method: 'GET', guildId });
}

export async function updateTutoringChecklist(testingPeriodId, itemId, state, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/tutoring/checklist', { method: 'PATCH', payload: { testingPeriodId, itemId, state }, guildId });
}

export async function addTutoringLog(testingPeriodId, content, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/tutoring/logs', { method: 'POST', payload: { testingPeriodId, content }, guildId });
}

export async function deleteTestingPeriod(periodId, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/tutoring/periods/${periodId}`, { method: 'DELETE', guildId });
}

export async function createTestingPeriod(payload, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/tutoring/periods', { method: 'POST', payload, guildId });
}

export async function addMentorReport(testingPeriodId, type, content, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/mentor-reports', { method: 'POST', payload: { testingPeriodId, type, content }, guildId });
}

export async function endTestingPeriod(periodId, status, notes = '', force = false, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/testing-periods/${periodId}`, { method: 'PATCH', payload: { status, notes, force }, guildId });
}

// ==========================================
// MANAGEMENT CENTER / CENTRALIZED CONFIG APIs
// ==========================================

export async function fetchFeatureConfigurations(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/notifications/features', {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Fetch Feature Configurations):'
  });
}

export async function fetchSuspectedDetections(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/detections', {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Fetch Suspected Detections):'
  });
}

export async function scanSuspectedDetections(thresholdDays?: number, guildId = authStore.selectedGuildId) {
  return dashboardRequest('/detections/scan', {
    method: 'POST',
    payload: thresholdDays !== undefined ? { thresholdDays } : undefined,
    guildId,
    errorContext: 'API Error (Scan Suspected Detections):'
  });
}

export async function updateFeatureConfiguration(featureKey, config, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/notifications/features/${featureKey}`, {
    method: 'PATCH',
    payload: config,
    guildId,
    errorContext: 'API Error (Update Feature Configuration):'
  });
}

export async function updateRoleAccess(featureKey, roleAccessConfigs, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/management/features/${featureKey}/role-access`, {
    method: 'PUT',
    payload: { roleAccessConfigs },
    guildId,
    errorContext: 'API Error (Update Role Access):'
  });
}

export async function updateNotificationTargets(featureKey, notificationTargets, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/management/features/${featureKey}/notification-targets`, {
    method: 'PUT',
    payload: { notificationTargets },
    guildId,
    errorContext: 'API Error (Update Notification Targets):'
  });
}




export async function fetchAdminStats() {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/stats`);
  if (!response.ok) throw new Error('Erreur lors du chargement des statistiques admin');
  return response.json();
}

export async function fetchAdminModuleStats(options?: {
  guildId?: string;
  moduleName?: string;
  startDate?: string;
  endDate?: string;
  periodDays?: number;
  summary?: boolean;
}) {
  const params = new URLSearchParams();
  if (options?.guildId) params.set('guildId', options.guildId);
  if (options?.moduleName) params.set('moduleName', options.moduleName);
  if (options?.startDate) params.set('startDate', options.startDate);
  if (options?.endDate) params.set('endDate', options.endDate);
  if (options?.periodDays) params.set('period', options.periodDays.toString());
  if (options?.summary) params.set('summary', 'true');

  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/stats/modules?${params.toString()}`);
  if (!response.ok) throw new Error('Erreur lors du chargement des statistiques de modules');
  return response.json();
}

export async function fetchAdminGuilds() {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/guilds`);
  if (!response.ok) throw new Error('Erreur lors du chargement des serveurs');
  return response.json();
}

export async function fetchAdminShards() {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/shards`);
  if (!response.ok) throw new Error('Erreur lors du chargement des shards');
  return response.json();
}

export async function restartAdminShard(shardId: number) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/shards/${shardId}/restart`, { method: 'POST' });
  if (!response.ok) throw new Error('Erreur lors du redémarrage du shard');
  return response.json();
}

export async function restartAllAdminShards() {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/shards/restart-all`, { method: 'POST' });
  if (!response.ok) throw new Error('Erreur lors du redémarrage global');
  return response.json();
}

export async function reconfigureAdminShards(payload: { mode: 'auto' | 'fixed'; shardCount?: number | null }) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/shards/reconfigure`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('Erreur lors de la reconfiguration des shards');
  return response.json();
}

export async function fetchGlobalDailyAlgoLeaderboard() {
  const guildId = getGuildId();
  if (!guildId) return null;
  const response = await authorizedFetch(`${BASE_URL}/guilds/${guildId}/daily-algo-submissions/global-leaderboard`);
  if (!response.ok) return null;
  return response.json();
}

export async function fetchAdminGuildInvite(guildId: string) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/guilds/${guildId}/invite`, { method: 'POST' });
  if (!response.ok) throw new Error('Erreur lors de la création de l\'invitation');
  return response.json();
}

export async function leaveAdminGuild(guildId: string) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/guilds/${guildId}/leave`, { method: 'POST' });
  if (!response.ok) throw new Error('Erreur lors du départ du serveur');
  return response.json();
}

export async function fetchGlobalAdmins() {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/admins`, { method: 'GET' });
  if (!response.ok) throw new Error('Erreur lors du chargement des admins globaux');
  return response.json();
}

export async function addGlobalAdmin(userId: string) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/admins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Erreur lors de l\'ajout de l\'admin global');
  }
  return response.json();
}

export async function removeGlobalAdmin(userId: string) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/admins/${userId}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Erreur lors de la suppression de l\'admin global');
  return response.json();
}

export async function fetchGlobalBlacklist() {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/blacklist`, { method: 'GET' });
  if (!response.ok) throw new Error('Erreur chargement blacklist');
  return response.json();
}

export async function addGlobalBlacklist(userId: string, reason: string) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/blacklist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, reason })
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Erreur d\'ajout blacklist');
  }
  return response.json();
}

export async function removeGlobalBlacklist(userId: string) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/blacklist/${userId}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Erreur suppression blacklist');
  return response.json();
}

export async function fetchMaintenanceConfig() {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/config`, { method: 'GET' });
  if (!response.ok) throw new Error('Erreur chargement config');
  return response.json();
}

export async function updateMaintenanceConfig(maintenance: boolean) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ maintenance })
  });
  if (!response.ok) throw new Error('Erreur maj maintenance');
  return response.json();
}

export async function fetchBotErrors() {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/errors`, { method: 'GET' });
  if (!response.ok) throw new Error('Erreur chargement erreurs');
  return response.json();
}

export async function clearBotErrors() {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/errors`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Erreur suppression erreurs');
  return response.json();
}

export async function sendGlobalBroadcast(message: string) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/broadcast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Erreur broadcast');
  }
  return response.json();
}

export async function updateRecruitmentConfig(payload: any, guildId: string = authStore.selectedGuildId) {
  return dashboardMutation('/recruitment/config', {
    method: 'PATCH',
    payload,
    guildId,
    errorContext: 'API Error (Update Recruitment Config):'
  });
}

export async function fetchActivationCodes() {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/activation-codes`, { method: 'GET' });
  if (!response.ok) throw new Error('Erreur lors du chargement des codes d\'activation');
  return response.json();
}

export async function createActivationCode() {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/activation-codes`, { method: 'POST' });
  if (!response.ok) throw new Error('Erreur lors de la génération du code d\'activation');
  return response.json();
}

export async function deleteActivationCode(id: string) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/activation-codes/${id}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Erreur lors de la suppression du code d\'activation');
  return response.json();
}

export async function deactivateAdminGuild(guildId: string) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/guilds/${guildId}/deactivate`, { method: 'POST' });
  if (!response.ok) throw new Error('Erreur lors de la désactivation du serveur');
  return response.json();
}

export async function activateAdminGuildAuto(guildId: string) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/guilds/${guildId}/activate-auto`, { method: 'POST' });
  if (!response.ok) throw new Error('Erreur lors de l\'activation automatique du serveur');
  return response.json();
}

export async function rescanAdminGuildStats(guildId: string, force = false) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/guilds/${guildId}/rescan-stats`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ force })
  });
  if (!response.ok) throw new Error('Erreur lors du lancement du rescan des statistiques');
  return response.json();
}

export async function activateGuildWithCode(code: string, guildId = authStore.selectedGuildId) {
  const token = authStore.token;
  if (!token) {
    throw new Error('No auth token available');
  }
  const response = await fetch(`${BASE_URL}/guilds/${guildId}/activate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ code })
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Erreur lors de l\'activation du serveur');
  }
  return response.json();
}

export async function fetchInvitations(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/invitations', { guildId });
}

export async function fetchInvitationDetails(code: string, options: { days?: number } = {}, guildId = authStore.selectedGuildId) {
  const params = new URLSearchParams();
  if (options.days) params.append('days', options.days.toString());
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return dashboardRequest(`/invitations/${code}${suffix}`, { guildId });
}

export async function toggleInvitationSuspension(code: string, suspended: boolean, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/invitations/${code}/suspend`, {
    method: 'PUT',
    payload: { suspended },
    guildId,
    errorContext: 'Error toggling invite suspension'
  });
}

export async function deleteInvitation(code: string, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/invitations/${code}`, {
    method: 'DELETE',
    guildId,
    errorContext: 'Error deleting invitation'
  });
}

export async function purgeInvitationMembers(code: string, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/invitations/${code}/purge`, {
    method: 'POST',
    guildId,
    errorContext: 'Error purging invitation members'
  });
}

export async function suspendInviter(
  userId: string,
  userTag: string,
  reason: string,
  options: { cascade?: boolean } = {},
  guildId = authStore.selectedGuildId
) {
  return dashboardRequest('/invitations/suspended-inviters', {
    method: 'POST',
    payload: { userId, userTag, reason, cascade: options.cascade ?? false },
    guildId,
    errorContext: 'Error suspending inviter'
  });
}

export async function removeSuspendedInviter(userId: string, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/invitations/suspended-inviters/${userId}`, {
    method: 'DELETE',
    guildId,
    errorContext: 'Error removing suspended inviter'
  });
}

export async function purgeInviterMembers(userId: string, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/invitations/inviters/${userId}/purge`, {
    method: 'POST',
    guildId,
    errorContext: 'Error purging inviter members'
  });
}

export async function reportDashboardError(errorData: {
  error: string;
  stack?: string;
  url: string;
  userAgent: string;
  guildId?: string | null;
}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  if (authStore.token) {
    headers.Authorization = `Bearer ${authStore.token}`;
  }

  const response = await fetch(`${API_BASE_URL}/api/report-error`, {
    method: 'POST',
    headers,
    body: JSON.stringify(errorData)
  });

  if (!response.ok) {
    throw new Error(`Server error: ${response.status}`);
  }

  return response.json();
}

export async function reportFeedback(feedbackData: {
  type: 'retour' | 'bloquage' | 'suggestion' | 'autre';
  message: string;
  url: string;
  guildId?: string | null;
}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  if (authStore.token) {
    headers.Authorization = `Bearer ${authStore.token}`;
  }

  const response = await fetch(`${API_BASE_URL}/api/report-feedback`, {
    method: 'POST',
    headers,
    body: JSON.stringify(feedbackData)
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Server error: ${response.status}`);
  }

  return response.json();
}


// ==========================================
// MODÉRATION DES PSEUDOS
// ==========================================
export async function fetchNicknameModerationConfig(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/nickname-moderation', {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Fetch Nickname Moderation Config):',
    silent: true,
  });
}

export async function updateNicknameModerationConfig(
  payload: {
    enabled?: boolean;
    whitelist?: string[];
    bypass?: string[];
    onJoin?: boolean;
    onUpdate?: boolean;
    checkInvisible?: boolean;
    checkGlobal?: boolean;
    checkCustom?: boolean;
  },
  guildId = authStore.selectedGuildId
) {
  return dashboardMutation('/nickname-moderation', {
    method: 'PATCH',
    payload,
    guildId,
    errorContext: 'API Error (Update Nickname Moderation Config):'
  });
}

// ==========================================
// AUTO-THREAD & CHANNELS MANAGEMENT
// ==========================================
export async function fetchAutoThreadConfig(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/auto-thread', {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Fetch Auto Thread Config):',
    silent: true,
  });
}

export async function updateAutoThreadConfig(
  payload: { enabled: boolean; channels: string[]; botsEnabled?: boolean },
  guildId = authStore.selectedGuildId
) {
  return dashboardMutation('/auto-thread', {
    method: 'PATCH',
    payload,
    guildId,
    errorContext: 'API Error (Update Auto Thread Config):'
  });
}

export async function fetchChannelsManagementConfig(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/channels-management', {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Fetch Channels Management Config):',
    silent: true,
  });
}

export async function updateChannelsManagementConfig(
  payload: {
    autoThreadEnabled?: boolean;
    autoThreadChannels?: string[];
    statsEnabled?: boolean;
    statsConfig?: any;
    tempVoiceEnabled?: boolean;
    tempVoiceChannelId?: string | null;
    tempVoiceCategoryId?: string | null;
    tempVoiceNameTemplate?: string;
    honeypotEnabled?: boolean;
    honeypotChannelId?: string | null;
    honeypotSanction?: string;
    honeypotReinvite?: boolean;
  },
  guildId = authStore.selectedGuildId
) {
  return dashboardRequest('/channels-management', {
    method: 'PATCH',
    payload,
    guildId,
    errorContext: 'API Error (Update Channels Management Config):'
  });
}

export async function rescanChannelsManagementStats(payload: { force: boolean }, guildId = authStore.selectedGuildId) {
  return dashboardRequest('/channels-management/rescan-stats', {
    method: 'POST',
    payload,
    guildId,
    errorContext: 'API Error (Rescan Stats):'
  });
}

// ==========================================
// MOTS BANNIS (service générique partagé)
// ==========================================

/** Retourne { global: BannedWord[], custom: BannedWord[] } */
export async function fetchBannedWords(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/banned-words', {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Fetch Banned Words):',
    silent: true,
  });
}

/** Ajoute un mot personnalisé pour le serveur */
export async function addBannedWord(
  word: string,
  category = 'custom',
  guildId = authStore.selectedGuildId
) {
  return dashboardRequest('/banned-words', {
    method: 'POST',
    payload: { word, category },
    guildId,
    errorContext: 'API Error (Add Banned Word):'
  });
}

/** Active ou désactive un mot personnalisé */
export async function toggleBannedWord(
  id: string,
  enabled: boolean,
  guildId = authStore.selectedGuildId
) {
  return dashboardMutation(`/banned-words/${id}`, {
    method: 'PATCH',
    payload: { enabled },
    guildId,
    errorContext: 'API Error (Toggle Banned Word):'
  });
}

/** Supprime un mot personnalisé */
export async function deleteBannedWord(id: string, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/banned-words/${id}`, {
    method: 'DELETE',
    guildId,
    errorContext: 'API Error (Delete Banned Word):'
  });
}

// ==========================================
// MOTS BANNIS GLOBAUX (admin bot)
// ==========================================

export async function fetchGlobalBannedWords() {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/banned-words`, { method: 'GET' });
  if (!response.ok) throw new Error('Erreur lors du chargement des mots globaux');
  return response.json();
}

export async function saveGlobalBannedWords(
  words: Array<{ word: string; category?: string; enabled?: boolean }>
) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/banned-words`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ words })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Erreur lors de l\'enregistrement des mots globaux');
  }

  return response.json();
}

export async function cleanupGlobalBannedWords() {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/banned-words/cleanup`, {
    method: 'POST',
    headers: JSON_HEADERS,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Erreur lors du nettoyage des mots globaux');
  }

  return response.json();
}

export async function updateGlobalBannedWord(
  id: string,
  payload: { word?: string; category?: string; enabled?: boolean }
) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/banned-words/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Erreur lors de la mise à jour du mot global');
  }

  return response.json();
}

export async function toggleGlobalBannedWord(id: string, enabled: boolean) {
  return updateGlobalBannedWord(id, { enabled });
}

export async function deleteGlobalBannedWord(id: string) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/admin/banned-words/${id}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Erreur lors de la suppression du mot global');
  return response.json();
}

export async function fetchNews(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/news', {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Fetch News):'
  });
}

export async function fetchPublicNews(guildId: string) {
  const response = await fetch(`${API_BASE_URL}/api/public/guilds/${guildId}/news`, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Erreur lors du chargement des actualités publiques');
  }

  return response.json();
}

export async function fetchPublicLeveling(guildId: string) {
  const response = await fetch(`${API_BASE_URL}/api/public/guilds/${guildId}/leveling`, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Erreur lors du chargement du classement de leveling');
  }

  return response.json();
}

export async function createNews(payload: { title: string; content: string; summary?: string; imageUrl?: string; category?: string; subcategory?: string; published?: boolean; publishMode?: 'summary' | 'full_embed' }, guildId = authStore.selectedGuildId) {
  return dashboardRequest('/news', {
    method: 'POST',
    payload,
    guildId,
    errorContext: 'API Error (Create News):'
  });
}

export async function updateNews(articleId: string, payload: { title?: string; content?: string; summary?: string; imageUrl?: string; category?: string; subcategory?: string; published?: boolean; publishMode?: 'summary' | 'full_embed' }, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/news/${articleId}`, {
    method: 'PATCH',
    payload,
    guildId,
    errorContext: 'API Error (Update News):'
  });
}

export async function deleteNews(articleId: string, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/news/${articleId}`, {
    method: 'DELETE',
    guildId,
    errorContext: 'API Error (Delete News):'
  });
}

export async function fetchNewsCategoryConfigs(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/news/category-configs', {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Fetch News Category Configs):'
  });
}

export async function createNewsCategoryConfig(payload: { category: string; subcategory?: string; channelId: string }, guildId = authStore.selectedGuildId) {
  return dashboardRequest('/news/category-configs', {
    method: 'POST',
    payload,
    guildId,
    errorContext: 'API Error (Create News Category Config):'
  });
}

export async function deleteNewsCategoryConfig(configId: string, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/news/category-configs/${configId}`, {
    method: 'DELETE',
    guildId,
    errorContext: 'API Error (Delete News Category Config):'
  });
}

export async function fetchLogEventConfigs(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/logs/event-configs', {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Fetch Log Event Configs):'
  });
}

export async function updateLogEventConfigs(configs: Array<{ eventType: string; enabled: boolean; channelId: string | null }>, guildId = authStore.selectedGuildId) {
  return dashboardRequest('/logs/event-configs', {
    method: 'PUT',
    payload: { configs },
    guildId,
    errorContext: 'API Error (Update Log Event Configs):'
  });
}

export async function fetchSocialFollows(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/social-follows', {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Fetch Social Follows):'
  });
}

export async function addYoutubeFollow(payload: { query: string; channelId?: string; channelName?: string; liveChannelId?: string | null; shortChannelId?: string | null; videoChannelId?: string | null }, guildId = authStore.selectedGuildId) {
  // If editing an existing follow, we can pass query as channelId
  const body = {
    query: payload.query || payload.channelId || '',
    liveChannelId: payload.liveChannelId,
    shortChannelId: payload.shortChannelId,
    videoChannelId: payload.videoChannelId
  };
  return dashboardRequest('/social-follows/youtube', {
    method: 'POST',
    payload: body,
    guildId,
    errorContext: 'API Error (Add Youtube Follow):'
  });
}

export async function deleteYoutubeFollow(id: string, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/social-follows/youtube/${id}`, {
    method: 'DELETE',
    guildId,
    errorContext: 'API Error (Delete Youtube Follow):'
  });
}

export async function addTwitchFollow(payload: { streamerName: string; liveChannelId?: string | null; otherChannelId?: string | null }, guildId = authStore.selectedGuildId) {
  return dashboardRequest('/social-follows/twitch', {
    method: 'POST',
    payload,
    guildId,
    errorContext: 'API Error (Add Twitch Follow):'
  });
}

export async function deleteTwitchFollow(id: string, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/social-follows/twitch/${id}`, {
    method: 'DELETE',
    guildId,
    errorContext: 'API Error (Delete Twitch Follow):'
  });
}

// Hierarchies API
export async function fetchStaffHierarchies(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/staff/hierarchies', {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Fetch Staff Hierarchies):'
  });
}

export async function createStaffHierarchy(data, guildId = authStore.selectedGuildId) {
  return dashboardRequest('/staff/hierarchies', {
    method: 'POST',
    payload: data,
    guildId,
    errorContext: 'API Error (Create Staff Hierarchy):'
  });
}

export async function updateStaffHierarchy(hierarchyId, data, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/staff/hierarchies/${hierarchyId}`, {
    method: 'PATCH',
    payload: data,
    guildId,
    errorContext: 'API Error (Update Staff Hierarchy):'
  });
}

export async function deleteStaffHierarchy(hierarchyId, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/staff/hierarchies/${hierarchyId}`, {
    method: 'DELETE',
    guildId,
    errorContext: 'API Error (Delete Staff Hierarchy):'
  });
}

export async function fetchHierarchySchema(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/staff/hierarchies/schema', {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Fetch Hierarchy Schema):'
  });
}

export async function importHierarchyRoleMembers(hierarchyId, discordRoleId, grade, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/staff/hierarchies/${hierarchyId}/import-roles`, {
    method: 'POST',
    payload: { discordRoleId, grade },
    guildId,
    errorContext: 'API Error (Import Hierarchy Role Members):'
  });
}

export async function addMemberHierarchyGrade(userId, hierarchyId, grade, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/staff/members/${userId}/hierarchy-grade`, {
    method: 'POST',
    payload: { hierarchyId, grade },
    guildId,
    errorContext: 'API Error (Add Member Hierarchy Grade):'
  });
}

export async function removeMemberHierarchyGrade(userId, hierarchyId, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/staff/members/${userId}/hierarchy-grade/${hierarchyId}`, {
    method: 'DELETE',
    guildId,
    errorContext: 'API Error (Remove Member Hierarchy Grade):'
  });
}

// ==========================================
// GENERALIST MODULES APIs
// ==========================================

export async function fetchLevelingData(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/leveling', { method: 'GET', guildId, errorContext: 'API Error (Fetch Leveling):' });
}

export async function updateLevelingConfig(config, guildId = authStore.selectedGuildId) {
  return dashboardRequest('/leveling', { method: 'PATCH', payload: config, guildId, errorContext: 'API Error (Update Leveling):' });
}

export async function addLevelingReward(level: number, roleId: string, guildId = authStore.selectedGuildId) {
  return dashboardRequest('/leveling/rewards', { method: 'POST', payload: { level, roleId }, guildId, errorContext: 'API Error (Add Leveling Reward):' });
}

export async function deleteLevelingReward(rewardId: string, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/leveling/rewards/${rewardId}`, { method: 'DELETE', guildId, errorContext: 'API Error (Delete Leveling Reward):' });
}

export async function fetchGiveaways(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/giveaways', { method: 'GET', guildId, errorContext: 'API Error (Fetch Giveaways):' });
}

export async function createGiveaway(payload: { prize: string; winnerCount: number; durationMinutes: number; description?: string; channelId: string }, guildId = authStore.selectedGuildId) {
  return dashboardRequest('/giveaways', { method: 'POST', payload, guildId, errorContext: 'API Error (Create Giveaway):' });
}

export async function endGiveaway(giveawayId: string, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/giveaways/${giveawayId}/end`, { method: 'POST', guildId, errorContext: 'API Error (End Giveaway):' });
}

export async function rerollGiveaway(giveawayId: string, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/giveaways/${giveawayId}/reroll`, { method: 'POST', guildId, errorContext: 'API Error (Reroll Giveaway):' });
}

export async function deleteGiveaway(giveawayId: string, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/giveaways/${giveawayId}`, { method: 'DELETE', guildId, errorContext: 'API Error (Delete Giveaway):' });
}

export async function fetchWelcomeConfig(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/welcome', { method: 'GET', guildId, errorContext: 'API Error (Fetch Welcome Config):' });
}

export async function updateWelcomeConfig(config, guildId = authStore.selectedGuildId) {
  return dashboardRequest('/welcome', { method: 'PATCH', payload: config, guildId, errorContext: 'API Error (Update Welcome Config):' });
}

export async function fetchReactionRoleMenus(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/reaction-roles', { method: 'GET', guildId, errorContext: 'API Error (Fetch Reaction Roles):' });
}

export async function createReactionRoleMenu(payload: { title: string; channelId: string; options: Array<{ emoji?: string; label: string; roleId: string }> }, guildId = authStore.selectedGuildId) {
  return dashboardRequest('/reaction-roles', { method: 'POST', payload, guildId, errorContext: 'API Error (Create Reaction Role Menu):' });
}

export async function deleteReactionRoleMenu(menuId: string, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/reaction-roles/${menuId}`, { method: 'DELETE', guildId, errorContext: 'API Error (Delete Reaction Role Menu):' });
}

export async function fetchAutoResponses(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/triggers', { method: 'GET', guildId, errorContext: 'API Error (Fetch Auto Responses):' });
}

export async function createAutoResponse(payload: { trigger: string; response: string | null; matchType: string; enabled?: boolean; roleIdToAdd?: string | null; roleIdToRemove?: string | null; deleteTrigger?: boolean }, guildId = authStore.selectedGuildId) {
  return dashboardRequest('/triggers', { method: 'POST', payload, guildId, errorContext: 'API Error (Create Auto Response):' });
}

export async function updateAutoResponse(id: string, payload: { trigger?: string; response?: string | null; matchType?: string; enabled?: boolean; roleIdToAdd?: string | null; roleIdToRemove?: string | null; deleteTrigger?: boolean }, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/triggers/${id}`, { method: 'PATCH', payload, guildId, errorContext: 'API Error (Update Auto Response):' });
}

export async function deleteAutoResponse(id: string, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/triggers/${id}`, { method: 'DELETE', guildId, errorContext: 'API Error (Delete Auto Response):' });
}

export async function fetchAutoModConfig(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/automod', { method: 'GET', guildId, errorContext: 'API Error (Fetch AutoMod):' });
}

export async function updateAutoModConfig(config, guildId = authStore.selectedGuildId) {
  return dashboardRequest('/automod', { method: 'PATCH', payload: config, guildId, errorContext: 'API Error (Update AutoMod):' });
}

export async function fetchSuggestions(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/suggestions', { method: 'GET', guildId, errorContext: 'API Error (Fetch Suggestions):' });
}

export async function fetchSuggestionsConfig(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/suggestions/config', { method: 'GET', guildId, errorContext: 'API Error (Fetch Suggestions Config):' });
}

export async function updateSuggestionsConfig(
  config: { enabled?: boolean; channelId?: string | null },
  guildId = authStore.selectedGuildId
) {
  return dashboardRequest('/suggestions/config', { method: 'PATCH', payload: config, guildId, errorContext: 'API Error (Update Suggestions Config):' });
}

export async function resolveSuggestion(suggestionId: string, payload: { status: 'APPROVED' | 'REJECTED' | 'IMPLEMENTED'; responseText: string }, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/suggestions/${suggestionId}/resolve`, { method: 'POST', payload, guildId, errorContext: 'API Error (Resolve Suggestion):' });
}

export async function sendOrUpdateEmbed(payload: { channelId: string; messageId?: string | null; embed: any }, guildId = authStore.selectedGuildId) {
  return dashboardRequest('/embed-builder', { method: 'POST', payload, guildId, errorContext: 'API Error (Send Embed):' });
}

// Backup API functions
export async function fetchBackups(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/backups', { method: 'GET', guildId, errorContext: 'API Error (Fetch Backups):' });
}

export async function createBackup(payload: {
  name?: string;
  description?: string;
  includeMessages?: boolean;
  includeMembers?: boolean;
  includeRoles?: boolean;
  includeChannels?: boolean;
  includeEmojis?: boolean;
  includeStickers?: boolean;
}, guildId = authStore.selectedGuildId) {
  return dashboardRequest('/backups', { method: 'POST', payload, guildId, errorContext: 'API Error (Create Backup):' });
}

export async function deleteBackup(backupId: string, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/backups/${backupId}`, { method: 'DELETE', guildId, errorContext: 'API Error (Delete Backup):' });
}

export async function exportBackup(backupId: string, guildId = authStore.selectedGuildId) {
  const selectedGuildId = getGuildId(guildId);
  if (!selectedGuildId) return null;

  try {
    const response = await authorizedFetch(`${BASE_URL}/guilds/${selectedGuildId}/backups/${backupId}/export`);
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    return response;
  } catch (error) {
    console.error('API Error (Export Backup):', error);
    throw error;
  }
}

export async function importBackup(fileContent: string, name?: string, guildId = authStore.selectedGuildId) {
  return dashboardRequest('/backups/import', {
    method: 'POST',
    payload: { file: fileContent, name },
    guildId,
    errorContext: 'API Error (Import Backup):'
  });
}

export async function restoreBackup(backupId: string, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/backups/${backupId}/restore`, {
    method: 'POST',
    guildId,
    errorContext: 'API Error (Restore Backup):'
  });
}
