/** Centre de gestion et configuration centralisee. */
import { authStore } from '../stores/auth.svelte';
import { dashboardMutation, dashboardRequest } from './client';

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

export async function linkDetectedAccount(userId: string, altUserId: string, reason?: string, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/detections/${userId}/link`, {
    method: 'POST',
    payload: { altUserId, reason },
    guildId,
    errorContext: 'API Error (Link Detected Account):'
  });
}

export async function dismissDetection(userId: string, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/detections/${userId}/dismiss`, {
    method: 'POST',
    guildId,
    errorContext: 'API Error (Dismiss Detection):',
    silent: true
  });
}

export async function restoreDetection(userId: string, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/detections/${userId}/restore`, {
    method: 'POST',
    guildId,
    errorContext: 'API Error (Restore Detection):',
    silent: true
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
