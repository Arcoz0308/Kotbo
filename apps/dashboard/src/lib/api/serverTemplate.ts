/** Mise en place guidee du serveur. */
import { authStore } from '../stores/auth.svelte';
import { dashboardRequest } from './client';

export type ServerTemplateSection = 'staff' | 'tickets' | 'text' | 'bots' | 'voice';
export type ServerTemplateWiring = 'staff' | 'logs' | 'tickets' | 'leveling' | 'rpg' | 'tempvoice' | null;

export type ServerTemplatePlanItem = {
  key: string;
  section: ServerTemplateSection;
  kind: 'role' | 'category' | 'text' | 'voice';
  parent: string | null;
  name: string;
  wiring: ServerTemplateWiring;
  restricted: boolean;
  required: boolean;
};

export type ServerTemplateState = {
  locale: 'fr' | 'en';
  plan: ServerTemplatePlanItem[];
  defaultSelection: string[];
  missingPermissions: string[];
  canCreateChannels: boolean;
  isAdministrator: boolean;
  applied: { at: string; by: string | null; selection: string[] } | null;
};

export type ServerTemplateApplyResult = {
  success: boolean;
  items: { key: string; id: string; name: string; created: boolean }[];
  panelSent: boolean;
};

export async function fetchServerTemplate(guildId = authStore.selectedGuildId): Promise<ServerTemplateState> {
  return dashboardRequest('/server-template', { method: 'GET', guildId, errorContext: 'API Error (Server Template):' });
}

export async function applyServerTemplate(selection: string[], guildId = authStore.selectedGuildId): Promise<ServerTemplateApplyResult> {
  return dashboardRequest('/server-template/apply', {
    method: 'POST',
    payload: { selection },
    guildId,
    errorContext: 'API Error (Server Template Apply):',
  });
}
