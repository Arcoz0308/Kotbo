import { fetchGuildState } from '../api';

class DashboardStore {
  state = $state({
    guildName: 'Kotbo',
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

  async refresh() {
    this.state.loading = true;
    try {
      const data = await fetchGuildState();
      
      if (data) {
        this.state.guildName = data.guildName;
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
        this.state.auditTrail = data.auditTrail;
        this.state.sanctions = data.sanctions || [];
        this.state.sanctionReports = data.sanctionReports || [];
        this.state.messageTemplate = data.messageTemplate;
        this.state.analytics = data.analytics;
        this.state.error = null;
      } else {
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
    }
  }
}

export const dashboardStore = new DashboardStore();
