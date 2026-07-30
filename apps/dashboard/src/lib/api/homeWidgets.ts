/** Agrégats alimentant les widgets de la page d'accueil. */
import { authStore } from '../stores/auth.svelte';
import { dashboardRequest } from './client';

export type HomeWidgetSection =
  | 'leveling'
  | 'invites'
  | 'economy'
  | 'tickets'
  | 'events'
  | 'polls'
  | 'serverInfo'
  | 'quickGuide'
  | 'hosting';

export interface HomeWidgetsData {
  windowDays: number;
  leveling?: {
    enabled: boolean;
    rankedMembers: number;
    averageLevel: number | null;
    topLevel: number | null;
    activeMembers: number;
  };
  invites?: {
    activeCodes: number;
    totalJoined: number;
    totalLeft: number;
    joinedRecently: number;
    retentionPercent: number | null;
  };
  economy?: {
    enabled: boolean;
    currencyName: string | null;
    currencyEmoji: string | null;
    totalBalance: number;
    players: number;
    activePlayers: number;
  };
  tickets?: {
    open: number;
    claimed: number;
    closedRecently: number;
  };
  events?: {
    total: number;
    upcoming: Array<{
      id: string;
      title: string;
      type: string;
      status: string;
      startsAt: string | null;
    }>;
  };
  polls?: {
    openCount: number;
    open: Array<{ id: string; title: string; closesAt: string | null; voteCount: number }>;
  };
  serverInfo?: {
    name: string | null;
    memberCount: number | null;
    boostLevel: number | null;
    boostCount: number | null;
    ownerTag: string | null;
    createdAt: string | null;
  };
  quickGuide?: {
    botInvited: boolean;
    logsConfigured: boolean;
    ticketsConfigured: boolean;
    staffRolesConfigured: boolean;
  };
  hosting?: {
    cpuPercent: number | null;
    memoryUsedMb: number;
    memoryTotalMb: number;
    latencyMs: number;
    uptimeSeconds: number;
  };
}

export async function fetchHomeWidgets(
  sections: HomeWidgetSection[],
  guildId = authStore.selectedGuildId,
): Promise<HomeWidgetsData | null> {
  const query = sections.length > 0 ? `?sections=${sections.join(',')}` : '';
  return dashboardRequest(`/home-widgets${query}`, {
    guildId,
    errorContext: 'API Error (Home Widgets):',
    silent: true,
  });
}
