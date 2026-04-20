import { fetchGuildState } from '../api';

class DashboardStore {
  state = $state({
    guildName: 'Kotbo',
    configChannelId: '',
    logChannelId: '',
    regulationChannelId: '',
    regulationMessageId: null,
    discordChannels: [],
    discordRoles: [],
    moderatorRoleId: '',
    commandRestrictions: [],
    commandCatalog: [],
    access: {
      level: 'moderator',
      canModerateContent: false,
      canManageSettings: false
    },
    modules: [],
    feeds: [],
    contentItems: [],
    youtubeReferenceChannelId: '',
    notifications: {
      discordChannel: '#alertes-redaction',
      email: '',
      emailEnabled: false,
      cloudBackup: true,
      debugLog: false,
      killSwitchEnabled: false,
      severityByModule: []
    },
    auditTrail: [],
    sanctions: [],
    sanctionReports: [],
    regulationRules: [],
    messageTemplate: '',
    analytics: {
      activityTrend: [0, 0, 0, 0, 0, 0, 0],
      totalAutomations: 0,
      contentStatusDistribution: [],
      translationCount: 0,
      healthStatus: 100
    },
    loading: true,
    error: null
  });

  private isRefreshing = false;

  private mergeAuditTrail(existing: any[], incoming: any[]): any[] {
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return existing;
    }
    
    const allEntries = new Map();
    
    // Add existing
    for (const e of existing) {
      const key = e.id || `${e.dateIso}-${e.user}-${e.action}-${e.module}`;
      allEntries.set(key, e);
    }
    
    // Add incoming (deduplicates within incoming too if they lack IDs)
    for (const e of incoming) {
      const key = e.id || `${e.dateIso}-${e.user}-${e.action}-${e.module}`;
      allEntries.set(key, e);
    }
    
    // Convert back and sort by date descending
    return Array.from(allEntries.values())
      .sort((a, b) => new Date(b.dateIso).getTime() - new Date(a.dateIso).getTime())
      .slice(0, 1000); // Keep reasonable history
  }

  async refresh() {
    if (this.isRefreshing) return;
    this.isRefreshing = true;
    this.state.loading = true;

    try {
      const data = await fetchGuildState();
      
      if (data) {
        this.state.guildName = data.guildName;
        this.state.configChannelId = data.configChannelId || '';
        this.state.logChannelId = data.logChannelId || '';
        this.state.regulationChannelId = data.regulationChannelId || '';
        this.state.regulationMessageId = data.regulationMessageId || null;
        this.state.discordChannels = data.discordChannels || [];
        this.state.discordRoles = data.discordRoles || [];
        this.state.moderatorRoleId = data.moderatorRoleId || '';
        this.state.commandRestrictions = data.commandRestrictions || [];
        this.state.commandCatalog = data.commandCatalog || [];
        this.state.access = data.access || {
          level: 'moderator',
          canModerateContent: false,
          canManageSettings: false
        };
        this.state.modules = data.modules;
        this.state.feeds = data.feeds;
        this.state.contentItems = data.contentItems;
        this.state.youtubeReferenceChannelId = data.youtubeReferenceChannelId || '';
        this.state.notifications = data.notifications;
        this.state.auditTrail = this.mergeAuditTrail(this.state.auditTrail, data.auditTrail);
        this.state.sanctions = data.sanctions || [];
        this.state.sanctionReports = data.sanctionReports || [];
        this.state.regulationRules = data.regulationRules || [];
        this.state.messageTemplate = data.messageTemplate;
        this.state.analytics = data.analytics;
        this.state.error = null;
      }
    } catch (err) {
      if (err?.status === 404) {
        this.state.error = "Le bot n'est pas présent sur ce serveur. Invitez-le pour accéder au tableau de bord.";
      } else if (err?.status === 403) {
        this.state.error = "Vous n'avez pas accès à ce serveur dans le tableau de bord.";
      } else if (err?.status === 500) {
        this.state.error = "L'API du bot a rencontré une erreur interne.";
      } else {
        console.error('DashboardStore sync error:', err);
        this.state.error = "Impossible de joindre l'API du bot. Vérifiez que le service est bien démarré.";
      }
    } finally {
      this.state.loading = false;
      this.isRefreshing = false;
    }
  }
}

export const dashboardStore = new DashboardStore();
