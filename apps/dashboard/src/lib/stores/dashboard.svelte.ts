import { fetchGuildState, API_BASE_URL, fetchApprenticeProgress } from '../api';
import { authStore } from './auth.svelte';

class DashboardStore {
  state = $state({
    guildName: 'Kotbo',
    configChannelId: '',
    logChannelId: '',
    regulationChannelId: '',
    regulationMessageId: null,
    meetingAnnouncementChannelId: '',
    meetingVoiceChannelId: '',
    publicChannelId: '',
    dailyAlgoChannelId: '',
    baseStaffRoleId: '',
    testStaffRoleId: '',
    discordChannels: [],
    discordVoiceChannels: [],
    discordCategories: [],
    discordRoles: [],
    moderatorRoleId: '',
    propagateSanctions: false,
    translationEnabled: false,
    codePoliceEnabled: false,
    dailyAlgoEnabled: false,
    githubReleasesEnabled: false,
    digestEnabled: false,
    youtubeEnabled: false,
    commandRestrictions: [],
    commandCatalog: [],
    access: {
      level: 'moderator',
      canModerateContent: false,
      canModerateDailyAlgo: false,
      canManageSettings: false
    },
    featureAccess: {},
    modules: [],
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
    statusCheckChannelId: '',
    regulationRules: [],
    messageTemplate: '',
    analytics: {
      activityTrend: [0, 0, 0, 0, 0, 0, 0],
      messagesTrend: [0, 0, 0, 0, 0, 0, 0],
      voiceTrend: [0, 0, 0, 0, 0, 0, 0],
      joinsTrend: [0, 0, 0, 0, 0, 0, 0],
      leavesTrend: [0, 0, 0, 0, 0, 0, 0],
      sanctionsTrend: [0, 0, 0, 0, 0, 0, 0],
      totalAutomations: 0,
      healthStatus: 100
    },
    apprenticeProgress: null,
    isTutor: false,
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
      const [data, apprenticeData] = await Promise.all([
        fetchGuildState(),
        fetchApprenticeProgress().catch(() => ({ progress: null }))
      ]);
      
      if (data) {
        this.state.guildName = data.guildName;
        this.state.configChannelId = data.configChannelId || '';
        this.state.logChannelId = data.logChannelId || '';
        this.state.regulationChannelId = data.regulationChannelId || '';
        this.state.regulationMessageId = data.regulationMessageId || null;
        this.state.meetingAnnouncementChannelId = data.meetingAnnouncementChannelId || '';
        this.state.meetingVoiceChannelId = data.meetingVoiceChannelId || '';
        this.state.publicChannelId = data.publicChannelId || '';
        this.state.dailyAlgoChannelId = data.dailyAlgoChannelId || '';
        this.state.baseStaffRoleId = data.baseStaffRoleId || '';
        this.state.testStaffRoleId = data.testStaffRoleId || '';
        this.state.discordChannels = data.discordChannels || [];
        this.state.discordVoiceChannels = data.discordVoiceChannels || [];
        this.state.discordCategories = data.discordCategories || [];
        this.state.discordRoles = data.discordRoles || [];
        this.state.moderatorRoleId = data.moderatorRoleId || '';
        this.state.propagateSanctions = data.propagateSanctions || false;
        this.state.translationEnabled = data.translationEnabled || false;
        this.state.codePoliceEnabled = data.codePoliceEnabled || false;
        this.state.dailyAlgoEnabled = data.dailyAlgoEnabled || false;
        this.state.githubReleasesEnabled = data.githubReleasesEnabled || false;
        this.state.digestEnabled = data.digestEnabled || false;
        this.state.youtubeEnabled = data.youtubeEnabled || false;
        this.state.commandRestrictions = data.commandRestrictions || [];
        this.state.commandCatalog = data.commandCatalog || [];
        this.state.access = data.access || {
          level: 'moderator',
          canModerateContent: false,
          canModerateDailyAlgo: false,
          canManageSettings: false
        };
        this.state.featureAccess = data.featureAccess || {};
        this.state.modules = data.modules;
        this.state.notifications = data.notifications;
        this.state.auditTrail = this.mergeAuditTrail(this.state.auditTrail, data.auditTrail);
        this.state.sanctions = data.sanctions || [];
        this.state.sanctionReports = data.sanctionReports || [];
        this.state.regulationRules = data.regulationRules || [];
        this.state.messageTemplate = data.messageTemplate;
        this.state.analytics = data.analytics;
        this.state.apprenticeProgress = apprenticeData?.progress;
        this.state.isTutor = !!data.member?.isTutor;
        authStore.member = data.member;
        this.state.error = null;
      }
    } catch (err) {
      if (err?.status === 404) {
        this.state.error = "Le bot n'est pas présent sur ce serveur. Invitez-le pour accéder au tableau de bord.";
      } else if (err?.status === 403) {
        if ((err as any).needsActivation) {
          this.state.error = "activation_requise";
        } else {
          this.state.error = "Vous n'avez pas accès à ce serveur dans le tableau de bord.";
        }
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
