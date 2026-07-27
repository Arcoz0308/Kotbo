/** Protection anti-raid. */
import { authStore } from '../stores/auth.svelte';
import { dashboardMutation, dashboardRequest } from './client';

// ─────────────────────────────────────────────────────────────
// Raid Protection (captcha, anti-raid, locks, reports, invites, scam)
// ─────────────────────────────────────────────────────────────

export async function fetchRaidProtection(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/raid-protection', {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Raid Protection):'
  });
}

export async function updateRaidProtection(payload: Record<string, unknown>, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/raid-protection', {
    method: 'PATCH',
    payload,
    guildId,
    errorContext: 'API Error (Update Raid Protection):'
  });
}

export async function setRaidMode(active: boolean, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/raid-protection/raidmode', {
    method: 'POST',
    payload: { active },
    guildId,
    errorContext: 'API Error (Raid Mode):'
  });
}

export async function setJoinLock(active: boolean, hours?: number, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/raid-protection/joinlock', {
    method: 'POST',
    payload: { active, hours },
    guildId,
    errorContext: 'API Error (Join Lock):'
  });
}

export async function setDmLock(active: boolean, hours?: number, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/raid-protection/dmlock', {
    method: 'POST',
    payload: { active, hours },
    guildId,
    errorContext: 'API Error (DM Lock):'
  });
}

export async function setInviteEmergency(active: boolean, guildId = authStore.selectedGuildId) {
  return dashboardMutation('/raid-protection/invite-emergency', {
    method: 'POST',
    payload: { active },
    guildId,
    errorContext: 'API Error (Invite Emergency):'
  });
}

export async function fetchMemberReports(status?: string, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/raid-protection/reports${status ? `?status=${status}` : ''}`, {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Member Reports):'
  });
}

export async function decideMemberReport(reportId: string, resolved: boolean, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/raid-protection/reports/${reportId}/decision`, {
    method: 'POST',
    payload: { resolved },
    guildId,
    errorContext: 'API Error (Report Decision):'
  });
}

export async function fetchInviteRequests(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/raid-protection/invite-requests', {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Invite Requests):'
  });
}

export async function decideInviteRequest(requestId: string, approved: boolean, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/raid-protection/invite-requests/${requestId}/decision`, {
    method: 'POST',
    payload: { approved },
    guildId,
    errorContext: 'API Error (Invite Decision):'
  });
}

export async function fetchScamImages(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/raid-protection/scam-images', {
    method: 'GET',
    guildId,
    errorContext: 'API Error (Scam Images):'
  });
}

export async function deleteScamImage(imageId: string, guildId = authStore.selectedGuildId) {
  return dashboardMutation(`/raid-protection/scam-images/${imageId}`, {
    method: 'DELETE',
    guildId,
    errorContext: 'API Error (Delete Scam Image):'
  });
}
