/** Cles et journaux MCP. */
import { authStore } from '../stores/auth.svelte';
import { dashboardRequest } from './client';

export async function fetchMcpKeys(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/mcp-keys', { method: 'GET', guildId, errorContext: 'API Error (Fetch MCP Keys):' });
}

export async function createMcpKey(payload: { name: string; permissions: string[] }, guildId = authStore.selectedGuildId) {
  return dashboardRequest('/mcp-keys', { method: 'POST', payload, guildId, errorContext: 'API Error (Create MCP Key):' });
}

export async function deleteMcpKey(keyId: string, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/mcp-keys/${keyId}`, { method: 'DELETE', guildId, errorContext: 'API Error (Delete MCP Key):' });
}

export async function fetchMcpDirectUrl(keyId: string, guildId = authStore.selectedGuildId) {
  return dashboardRequest(`/mcp-keys/${keyId}/direct-url`, { method: 'GET', guildId, errorContext: 'API Error (Fetch MCP Direct URL):' });
}

export async function fetchMcpLogs(guildId = authStore.selectedGuildId) {
  return dashboardRequest('/mcp-logs', { method: 'GET', guildId, errorContext: 'API Error (Fetch MCP Logs):' });
}
