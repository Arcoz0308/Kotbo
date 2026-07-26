/** Taches planifiees. */
import { authStore } from '../stores/auth.svelte';
import { dashboardMutation, dashboardRequest } from './client';

// Schedules API functions
export async function fetchSchedules(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/schedules', { method: 'GET', guildId, errorContext: 'API Error (Fetch Schedules):' });
}

export async function createSchedule(payload: {
  name: string;
  type: string;
  cron: string;
  targetId?: string | null;
  enabled?: boolean;
}, guildId = authStore.selectedGuildId) {
  return dashboardRequest('/schedules', { method: 'POST', payload, guildId, errorContext: 'API Error (Create Schedule):' });
}

export async function updateSchedule(scheduleId: string, payload: {
  name?: string;
  type?: string;
  cron?: string;
  targetId?: string | null;
  enabled?: boolean;
}, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/schedules/${scheduleId}`, { method: 'PATCH', payload, guildId, errorContext: 'API Error (Update Schedule):' });
}

export async function deleteSchedule(scheduleId: string, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/schedules/${scheduleId}`, { method: 'DELETE', guildId, errorContext: 'API Error (Delete Schedule):' });
}

export async function runScheduleNow(scheduleId: string, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/schedules/${scheduleId}/run`, { method: 'POST', guildId, errorContext: 'API Error (Run Schedule Now):' });
}
