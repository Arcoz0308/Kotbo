<script lang="ts">
  import { portal } from '../actions/portal';
  import FormInput from './FormInput.svelte';
  import { dashboardStore } from '../stores/dashboard.svelte.ts';
  import { authStore } from '../stores/auth.svelte.ts';
  import Papicon from './Papicon.svelte';
  import Chart from './charts/Chart.svelte';
  import { router } from 'tinro';
  import { inviteDetailsModal } from '../stores/inviteDetailsModal.svelte';
  import { fetchMemberCase, fetchMemberDetailedAnalytics, updateSanctionReport, linkMemberAccount, unlinkMemberAccount, updateMemberNote } from '../api';
  import { statusLabel, toDateTimeLocal, typeLabel as formatTypeLabel } from '../sanctions/formatters';
  import { buildReportRuleOptions, getRuleIdsFromBrokenRules, getRulesFromBrokenRules, buildBrokenRulesPayload } from '../sanctions/reportRules';
  import SelectedRuleChips from './sanctions/SelectedRuleChips.svelte';
  import EvidenceInputList from './sanctions/EvidenceInputList.svelte';
  import ReportRuleSelector from './sanctions/ReportRuleSelector.svelte';
  import InteractionTree from './charts/InteractionTree.svelte';

  type MemberCaseTab = 'resume' | 'identite' | 'activite' | 'messages' | 'logs' | 'sanctions' | 'invites' | 'connexions' | 'analytics' | 'candidatures' | 'linked_accounts' | 'notes';

  type MemberAnalyticsResponse = {
    totalMessages: number;
    totalVoiceMinutes: number;
    activeDays: number;
    period: number;
    dailyTrend: Array<{ dateKey: string; messages: number; voiceMinutes: number }>;
  };

  type MemberCaseResponse = {
    profile: {
      userId: string;
      userTag: string | null;
      username: string | null;
      globalName: string | null;
      displayName: string | null;
      avatarUrl: string | null;
      bannerUrl: string | null;
      accentColor: number | null;
      locale: string | null;
      isBot: boolean;
      accountCreatedAt: string | null;
      guildJoinedAt: string | null;
      guildLeftAt: string | null;
      firstSeenAt: string | null;
      lastSeenAt: string | null;
      lastMessageAt: string | null;
      lastMessageChannelId: string | null;
      messageCount: number;
      voiceSessionCount: number;
      voiceTimeSeconds: number;
      voiceLastChannelId: string | null;
      voiceLastJoinedAt: string | null;
      voiceLastLeftAt: string | null;
      rolesSnapshot: string[];
      presenceStatus: string | null;
      pronouns: string | null;
      isTutor: boolean;
      staffGrade: string | null;
      moderatorNote: string | null;
    } | null;
    invite: {
      code: string | null;
      inviterId: string | null;
      inviterTag: string | null;
      inviterAvatarUrl: string | null;
      joinedAt: string | null;
    } | null;
    roles: Array<{ id: string; name: string; mention: string; permissions: string[]; color?: string }>;
    effectivePermissions: string[];
    sanctions: Array<{
      id: string;
      type: string;
      status: string;
      targetUserId: string;
      targetTag: string;
      moderatorUserId: string;
      moderatorTag: string;
      reason: string;
      durationSeconds: number | null;
      expiresAt: string | null;
      createdAt: string;
      resolvedAt: string | null;
      resolutionNote: string | null;
    }>;
    logs: Array<{
      id: string;
      user: string;
      action: string;
      context: string;
      module: string;
      eventType: string;
      source: 'dashboard' | 'discord';
      details: string;
      dateIso: string;
      channelId: string | null;
    }>;
    messagesByChannel: Array<{
      channelId: string;
      channelName: string;
      count: number;
      lastMessageAt: string | null;
      recentMessages: Array<{ id: string; channelId: string; channelName: string; content: string; dateIso: string; discordUrl?: string | null }>;
    }>;
    recentMessageCount: number;
    recentLogCount: number;
    connections: Array<{ name: string; type: string; visible: boolean }>;
    connectionsNote: string;
    candidatures: Array<{
      id: string;
      status: string;
      notes: string;
      createdAt: string;
      data: any;
      autoRejected: boolean;
      autoRejectReason: string | null;
      rejectionReason: string | null;
      oralResult: string | null;
      reapplyAfter: string | null;
    }>;
    sanctionReports?: Array<{
      id: string;
      sanctionId: string | null;
      staffPseudo: string;
      incidentAt: string;
      memberPseudo: string;
      memberReference: string;
      sanctionType: string;
      sanctionDurationLabel: string | null;
      brokenRules: string;
      detailedReason: string;
      evidenceLinks: string[];
      additionalNotes: string | null;
      createdByUserId: string;
      createdByTag: string | null;
      createdAt: string;
    }>;
    linkedAccounts: Array<{
      userId: string;
      userTag: string | null;
      avatarUrl: string | null;
      type: string;
      status: string;
    }>;
    isSuspectedDC: boolean;
    interactionGraph: {
      nodes: Array<{ id: string; label: string; type: 'user' | 'target'; avatar?: string | null }>;
      edges: Array<{ from: string; to: string; type: 'mention' | 'reply' | 'reaction'; count: number }>;
    };
  };

  let {
    open = false,
    userName = '',
    userId = null as string | null,
    caseData = null as MemberCaseResponse | null,
    loading = false,
    error = '',
    actionReason = $bindable(''),
    actionDuration = $bindable('30m'),
    actionBusy = false,
    actionFeedback = '',
    actionIsError = false,
    onClose = () => {},
    onAction = (_action: 'WARN' | 'KICK' | 'TIMEOUT' | 'BAN') => {},
    onSelectUser = (_userId: string) => {},
  } = $props<{
    open?: boolean;
    userName?: string;
    userId?: string | null;
    caseData?: MemberCaseResponse | null;
    loading?: boolean;
    error?: string;
    actionReason?: string;
    actionDuration?: string;
    actionBusy?: boolean;
    actionFeedback?: string;
    actionIsError?: boolean;
    onClose?: (e: MouseEvent) => void;
    onAction?: (action: 'WARN' | 'KICK' | 'TIMEOUT' | 'BAN') => void;
    onSelectUser?: (userId: string) => void;
  }>();

  let activeTab = $state<MemberCaseTab>('resume');
  let analyticsData = $state<MemberAnalyticsResponse | null>(null);
  let analyticsLoading = $state(false);
  let viewingReportSanctionId = $state<string | null>(null);
  let isEditingReport = $state(false);
  let updateReportBusy = $state(false);
  let editReportData = $state({
    incidentAt: '',
    sanctionDurationLabel: '',
    selectedRuleIds: [] as string[],
    detailedReason: '',
    evidenceLinks: [] as string[],
    additionalNotes: ''
  });

  let targetAccountId = $state('');
  let linkReason = $state('');
  let linkBusy = $state(false);
  let linkFeedback = $state('');
  let linkIsError = $state(false);

  $effect(() => {
    if (open) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    return () => {
      document.body.classList.remove('overflow-hidden');
    };
  });

  async function handleLinkAccount() {
    if (!targetAccountId.trim()) {
      linkIsError = true;
      linkFeedback = 'L\'ID du compte est requis.';
      return;
    }

    linkBusy = true;
    linkFeedback = '';
    linkIsError = false;

    try {
      const success = await linkMemberAccount(userId!, targetAccountId, linkReason);
      if (success) {
        linkIsError = false;
        linkFeedback = 'Comptes liés avec succès.';
        targetAccountId = '';
        linkReason = '';
        if (userId) {
          const updatedCase = await fetchMemberCase(userId);
          if (updatedCase) {
            caseData = updatedCase;
          }
        }
      } else {
        linkIsError = true;
        linkFeedback = 'Erreur lors de la liaison. Vérifiez l\'ID ou vos permissions.';
      }
    } catch (e: any) {
      linkIsError = true;
      linkFeedback = e.message || 'Une erreur inattendue est survenue.';
    } finally {
      linkBusy = false;
    }
  }

  let unlinkingAccountId = $state<string | null>(null);

  async function handleUnlinkAccount(targetId: string) {
    if (!confirm('Êtes-vous sûr de vouloir séparer ces comptes ?')) return;
    unlinkingAccountId = targetId;

    try {
      const success = await unlinkMemberAccount(userId!, targetId);
      if (success) {
        if (userId) {
          const updatedCase = await fetchMemberCase(userId);
          if (updatedCase) {
            caseData = updatedCase;
          }
        }
      } else {
        alert('Erreur lors de la suppression du lien.');
      }
    } catch (e: any) {
      alert(e.message || 'Erreur inattendue.');
    } finally {
      unlinkingAccountId = null;
    }
  }

  let moderatorNote = $state('');
  let noteBusy = $state(false);
  let noteFeedback = $state('');

  $effect(() => {
    if (caseData?.profile?.moderatorNote !== undefined) {
      moderatorNote = caseData?.profile?.moderatorNote ?? '';
    }
  });

  async function handleSaveNote() {
    if (!userId) return;
    noteBusy = true;
    noteFeedback = '';
    try {
      const result = await updateMemberNote(userId, moderatorNote);
      if (result?.ok) {
        noteFeedback = 'Note enregistrée.';
        if (caseData?.profile) {
          caseData.profile.moderatorNote = moderatorNote;
        }
      } else {
        noteFeedback = 'Erreur lors de l\'enregistrement.';
      }
    } catch (e) {
      noteFeedback = 'Erreur lors de l\'enregistrement.';
    } finally {
      noteBusy = false;
    }
  }

  function startEditingReport(report: any) {
    editReportData = {
      incidentAt: toDateTimeLocal(report.incidentAt),
      sanctionDurationLabel: report.sanctionDurationLabel || '',
      selectedRuleIds: getRuleIdsFromBrokenRules(report.brokenRules),
      detailedReason: report.detailedReason,
      evidenceLinks: report.evidenceLinks && report.evidenceLinks.length > 0 ? [...report.evidenceLinks] : [''],
      additionalNotes: report.additionalNotes || ''
    };
    isEditingReport = true;
  }

  async function handleUpdateReport() {
    if (!viewingReportSanctionId || !selectedReport) return;
    updateReportBusy = true;

    try {
      const success = await updateSanctionReport(selectedReport.id, {
        incidentAt: new Date(editReportData.incidentAt).toISOString(),
        sanctionDurationLabel: editReportData.sanctionDurationLabel.trim(),
        brokenRules: buildBrokenRulesPayload(editReportData.selectedRuleIds, reportRuleOptions),
        detailedReason: editReportData.detailedReason,
        evidenceLinks: editReportData.evidenceLinks.map(l => l.trim()).filter(l => /^https?:\/\//i.test(l)),
        additionalNotes: editReportData.additionalNotes.trim() || null
      });

      if (success) {
        // We rely on broadcastDashboardStateChange to refresh the data
        // But for immediate feedback, we can close the edit mode
        isEditingReport = false;
        // Optionally, update the local caseData if we want to be fast
        if (caseData?.sanctionReports) {
          const idx = caseData.sanctionReports.findIndex(r => r.id === selectedReport.id);
          if (idx !== -1) {
            caseData.sanctionReports[idx] = {
              ...caseData.sanctionReports[idx],
              incidentAt: new Date(editReportData.incidentAt).toISOString(),
              sanctionDurationLabel: editReportData.sanctionDurationLabel.trim(),
              brokenRules: buildBrokenRulesPayload(editReportData.selectedRuleIds, reportRuleOptions),
              detailedReason: editReportData.detailedReason,
              evidenceLinks: editReportData.evidenceLinks.map(l => l.trim()).filter(l => /^https?:\/\//i.test(l)),
              additionalNotes: editReportData.additionalNotes.trim() || null
            };
          }
        }
      }
    } catch (e) {
      console.error('Failed to update sanction report:', e);
    } finally {
      updateReportBusy = false;
    }
  }


  const sanctions = $derived(
    caseData?.sanctions
      ? [...caseData?.sanctions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      : []
  );

  const reportRuleOptions = $derived(buildReportRuleOptions(dashboardStore.state.regulationRules || []));
  const selectedSanctionForReport = $derived(sanctions.find(s => s.id === viewingReportSanctionId) || null);
  const selectedReport = $derived(
    viewingReportSanctionId 
      ? [...(dashboardStore.state.sanctionReports || []), ...(caseData?.sanctionReports || [])].find(r => r.sanctionId === viewingReportSanctionId) || null
      : null
  );
  const selectedReportRules = $derived(
    selectedReport ? getRulesFromBrokenRules(selectedReport.brokenRules, reportRuleOptions) : []
  );
  const editDraftRules = $derived(
    editReportData.selectedRuleIds
      .map(id => reportRuleOptions.find(r => r.id === id))
      .filter((r): r is any => !!r)
  );

  const tabs: { id: MemberCaseTab; label: string; icon: string; count?: () => number }[] = [
    { id: 'resume', label: 'Résumé', icon: 'layout' },
    { id: 'identite', label: 'Identité', icon: 'user' },
    { id: 'activite', label: 'Activité', icon: 'trending-up' },
    { id: 'analytics', label: 'Analytiques', icon: 'bar-chart-2' },
    { id: 'messages', label: 'Messages', icon: 'message-square', count: () => caseData?.recentMessageCount ?? 0 },
    { id: 'logs', label: 'Logs', icon: 'history', count: () => caseData?.recentLogCount ?? 0 },
    { id: 'sanctions', label: 'Sanctions', icon: 'hammer', count: () => sanctions.length },
    { id: 'candidatures', label: 'Candidats', icon: 'user-check', count: () => caseData?.candidatures?.length ?? 0 },
    { id: 'invites', label: 'Invitations', icon: 'mail' },
    { id: 'connexions', label: 'Connexions', icon: 'link' },
    { id: 'linked_accounts', label: 'Comptes liés', icon: 'link-2', count: () => caseData?.linkedAccounts?.length ?? 0 },
    { id: 'notes', label: 'Notes', icon: 'edit-3' },
  ];

  function formatDateTime(value: string | null | undefined) {
    if (!value) return 'Inconnu';
    return new Date(value).toLocaleString('fr-FR');
  }

  function formatDateShort(value: string | null | undefined) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatTimeShort(value: string | null | undefined) {
    if (!value) return '';
    return new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDurationFromSeconds(seconds: number | null | undefined) {
    if (!seconds || seconds <= 0) return '0s';
    const totalSeconds = Math.floor(seconds);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const parts: string[] = [];
    if (days) parts.push(`${days}j`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (parts.length === 0) parts.push(`${totalSeconds}s`);
    return parts.join(' ');
  }

  function formatRelative(value: string | null | undefined) {
    if (!value) return 'Jamais';
    const date = new Date(value);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return "À l'instant";
    if (minutes < 60) return `Il y a ${minutes}m`;
    if (hours < 24) return `Il y a ${hours}h`;
    if (days < 7) return `Il y a ${days}j`;
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }

  function getDurationSince(value: string | null | undefined) {
    if (!value) return 'Inconnu';
    const start = new Date(value);
    const now = new Date();
    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();
    
    if (months < 0) {
      years--;
      months += 12;
    }

    const parts: string[] = [];
    if (years > 0) parts.push(`${years} an${years > 1 ? 's' : ''}`);
    if (months > 0) parts.push(`${months} mois`);
    
    if (parts.length === 0) {
       const days = Math.floor((now.getTime() - start.getTime()) / 86400000);
       if (days <= 0) return "Aujourd'hui";
       return `${days} jour${days > 1 ? 's' : ''}`;
    }
    
    return parts.join(', ');
  }

  function formatChannelLabel(channelId: string | null | undefined) {
    if (!channelId) return 'Non spécifié';
    const channel = dashboardStore.state.discordChannels.find((item) => item.id === channelId);
    if (!channel) return 'Canal inconnu';
    return `#${channel.name}`;
  }

  function getHeroBackground() {
    if (caseData?.profile?.bannerUrl) {
      return `background-image: linear-gradient(to bottom, transparent 30%, var(--surface-container-lowest) 100%), url('${caseData?.profile?.bannerUrl}'); background-size: cover; background-position: center;`;
    }
    if (caseData?.profile?.accentColor) {
      const hex = '#' + caseData?.profile?.accentColor.toString(16).padStart(6, '0');
      return `background: linear-gradient(135deg, ${hex}40 0%, var(--color-primary) 50%, var(--color-secondary) 100%);`;
    }
    return `background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-container) 50%, var(--color-secondary) 100%);`;
  }

  function getPresenceColor(status: string | null | undefined) {
    if (!status) return 'bg-slate-400';
    const s = status.toLowerCase();
    if (s === 'online') return 'bg-emerald-500';
    if (s === 'idle') return 'bg-amber-500';
    if (s === 'dnd') return 'bg-red-500';
    return 'bg-slate-400';
  }

  function getPresenceLabel(status: string | null | undefined) {
    if (!status) return 'Hors ligne';
    const s = status.toLowerCase();
    if (s === 'online') return 'En ligne';
    if (s === 'idle') return 'Absent';
    if (s === 'dnd') return 'Ne pas déranger';
    return 'Hors ligne';
  }

  function sanitizeLogSnippet(value: string) {
    return value.replace(/^Contenu:\s*/i, '').replace(/^\s+|\s+$/g, '');
  }

  function getConnectionIcon(type: string) {
    const t = type.toLowerCase();
    if (t === 'youtube') return 'video';
    if (t === 'twitch') return 'tv';
    if (t === 'twitter' || t === 'x') return 'twitter';
    if (t === 'spotify') return 'music';
    if (t === 'github') return 'github';
    if (t === 'steam') return 'gamepad';
    if (t === 'reddit') return 'message-square';
    if (t === 'instagram') return 'instagram';
    if (t === 'facebook') return 'facebook';
    if (t === 'tiktok') return 'play';
    if (t === 'playstation' || t === 'xbox' || t === 'battlenet' || t === 'epicgames' || t === 'riotgames') return 'gamepad';
    return 'link';
  }

  function getSanctionBadgeClass(status: string) {
    const s = status.toUpperCase();
    if (s === 'ACTIVE') return 'badge badge-warning';
    if (s === 'RESOLVED') return 'badge badge-success';
    return 'badge badge-danger';
  }

  function getSanctionStatusLabel(status: string) {
    const s = status.toUpperCase();
    if (s === 'ACTIVE') return 'Active';
    if (s === 'RESOLVED') return 'Résolue';
    if (s === 'EXPIRED') return 'Expirée';
    return status;
  }

  async function loadMemberAnalytics() {
    if (!userId || !authStore.selectedGuildId) return;
    analyticsLoading = true;
    try {
      analyticsData = await fetchMemberDetailedAnalytics(userId, 30);
    } catch (e) {
      console.error('Failed to load member analytics:', e);
    } finally {
      analyticsLoading = false;
    }
  }

  $effect(() => {
    if (open) {
      activeTab = 'resume';
      void loadMemberAnalytics();
    }
  });
</script>

{#if open}
  <div 
    use:portal
    class="modal-backdrop" 
    role="button" 
    aria-label="Fermer le dossier"
    tabindex="0" 
    onclick={onClose}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-panel modal-panel-xl space-y-0 p-0 font-body" onclick={(e) => e.stopPropagation()}>

      <!-- ── Hero Section ──────────────────────────────────────── -->
      <div class="relative overflow-hidden rounded-t-3xl" style="min-height: 180px;">
        <div class="absolute inset-0" style={getHeroBackground()}></div>
        <div class="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-(--surface-container-lowest)"></div>

        <!-- Close button -->
        <button
          type="button"
          onclick={onClose}
          class="absolute top-4 right-4 z-50 flex h-9 w-9 items-center justify-center rounded-xl bg-black/20 text-white/80 backdrop-blur-lg transition-all hover:bg-black/40 hover:text-white hover:scale-110 active:scale-95 shadow-lg"
        >
          <Papicon icon="x" size={18} />
        </button>

        <!-- Avatar + Identity block -->
        <div class="relative z-10 flex items-end gap-5 px-8 pb-5 pt-20">
          <div class="relative shrink-0">
            <div class="absolute -inset-1.5 rounded-3xl bg-white/20 blur-lg animate-pulse"></div>
            {#if caseData?.profile?.avatarUrl}
              <img
                src={caseData?.profile?.avatarUrl}
                alt="Avatar"
                class="relative h-20 w-20 rounded-2xl border-4 border-(--surface-container-lowest) object-cover shadow-2xl"
              />
            {:else}
              <div class="relative flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-(--surface-container-lowest) bg-(--surface-container-high) text-2xl font-black text-primary shadow-2xl">
                {userName.slice(0, 1).toUpperCase()}
              </div>
            {/if}
            <!-- Presence indicator -->
            <div class="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-3 border-(--surface-container-lowest) {getPresenceColor(caseData?.profile?.presenceStatus)}" title={getPresenceLabel(caseData?.profile?.presenceStatus)}></div>
          </div>

          <div class="min-w-0 pb-1">
            <h3 id="member-case-title" class="text-2xl font-black text-on-surface tracking-tight truncate font-headline">
              {caseData?.profile?.displayName || caseData?.profile?.globalName || userName}
            </h3>
            <div class="mt-1 flex flex-wrap items-center gap-2">
              <span class="text-sm font-semibold text-on-surface-variant/80">
                @{caseData?.profile?.username || userName}
              </span>
              {#if caseData?.profile?.isBot}
                <span class="badge badge-info">Bot</span>
              {/if}
              {#if caseData?.profile?.pronouns}
                <span class="badge badge-neutral">{caseData?.profile?.pronouns}</span>
              {/if}
              <span class="badge badge-neutral">
                <span class="h-2 w-2 rounded-full {getPresenceColor(caseData?.profile?.presenceStatus)}"></span>
                {getPresenceLabel(caseData?.profile?.presenceStatus)}
              </span>
              {#if caseData?.profile?.isTutor}
                <span class="badge bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 shadow-sm animate-in zoom-in-95 duration-500">
                  <Papicon icon="shield" size={12} class="mr-1" />
                  Tuteur
                </span>
              {/if}
              {#if caseData?.profile?.staffGrade}
                <span class="badge bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 dark:border-amber-400/20 shadow-sm animate-in zoom-in-95 duration-500">
                  <Papicon icon="star" size={12} class="mr-1" />
                  {caseData?.profile?.staffGrade}
                </span>
              {/if}
              {#if userId}
                <a
                  href="/profile/{userId}"
                  class="inline-flex items-center gap-1.5 rounded-lg bg-white/15 backdrop-blur-md px-3 py-1.5 text-[10px] font-black text-white/80 uppercase tracking-widest transition-all hover:bg-white/25 hover:text-white hover:scale-[1.02] active:scale-[0.98] shadow-sm ml-auto"
                >
                  <Papicon icon="external-link" size={14} />
                  Profil
                </a>
              {/if}
            </div>
          </div>
        </div>
      </div>

      <!-- ── Tab Navigation ────────────────────────────────────── -->
      <div class="px-6 pt-4 pb-2">
        <div class="tab-group overflow-x-auto">
          {#each tabs as tab}
            <button
              type="button"
              onclick={() => activeTab = tab.id}
              class="tab-button {activeTab === tab.id ? 'active' : ''}"
            >
              <Papicon icon={tab.icon} size={16} />
              <span>{tab.label}</span>
              {#if tab.count && caseData}
                {@const c = tab.count()}
                {#if c > 0}
                  <span class="flex h-5 min-w-5 items-center justify-center rounded-full text-[9px] font-black {activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'}">
                    {c}
                  </span>
                {/if}
              {/if}
            </button>
          {/each}
        </div>
      </div>

      <!-- ── Content Area ──────────────────────────────────────── -->
      <div class="px-6 pb-6 pt-2">
        {#if !userId}
          <div class="flex flex-col items-center justify-center py-20 text-center bg-amber-500/5 rounded-[2.5rem] border-2 border-dashed border-amber-500/20">
            <div class="flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-500/10 text-amber-500 mb-6">
              <Papicon icon="alert-triangle" size={32} />
            </div>
            <h3 class="text-xl font-black text-amber-600 font-headline">Utilisateur introuvable</h3>
            <p class="mt-2 text-sm text-amber-700/60 max-w-sm">
              Impossible de relier ce log à un ID utilisateur Discord. Le dossier ne peut pas être chargé.
            </p>
          </div>
        {:else if loading}
          <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3 animate-pulse">
            <div class="h-48 bg-surface-container-high/30 rounded-4xl"></div>
            <div class="h-48 bg-surface-container-high/30 rounded-4xl"></div>
            <div class="h-48 bg-surface-container-high/30 rounded-4xl"></div>
            <div class="md:col-span-2 h-80 bg-surface-container-high/30 rounded-4xl"></div>
            <div class="h-80 bg-surface-container-high/30 rounded-4xl"></div>
          </div>
        {:else if error}
          <div class="flex flex-col items-center justify-center py-20 text-center bg-rose-500/5 rounded-[2.5rem] border-2 border-dashed border-rose-500/20">
            <div class="flex h-16 w-16 items-center justify-center rounded-3xl bg-rose-500/10 text-rose-500 mb-6">
              <Papicon icon="alert-circle" size={32} />
            </div>
            <h3 class="text-xl font-black text-rose-600 font-headline">Erreur de chargement</h3>
            <p class="mt-2 text-sm text-rose-700/60 max-w-sm">{error}</p>
          </div>
        {:else if !caseData}
          <div class="flex flex-col items-center justify-center py-20 text-center bg-surface-container-low rounded-[2.5rem] border-2 border-dashed border-outline-variant/30">
            <div class="flex h-16 w-16 items-center justify-center rounded-3xl bg-surface-container-high text-on-surface-variant/30 mb-6">
              <Papicon icon="user-x" size={32} />
            </div>
            <h3 class="text-xl font-black text-on-surface-variant font-headline">Aucune donnée</h3>
            <p class="mt-2 text-sm text-on-surface-variant/60 max-w-sm">
              Aucun dossier détaillé n'est disponible pour ce membre.
            </p>
          </div>
        {:else}
          <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            
            {#if caseData?.isSuspectedDC}
              <div class="rounded-4xl bg-rose-500/10 border-2 border-rose-500/20 p-6 flex items-center gap-6 animate-in zoom-in-95 duration-500">
                <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-500 shadow-lg shadow-rose-500/20">
                  <Papicon icon="alert-octagon" size={24} />
                </div>
                <div class="min-w-0 flex-1">
                  <h4 class="text-sm font-black text-rose-600 uppercase tracking-widest">Suspicion de Double Compte</h4>
                  <p class="text-xs font-bold text-rose-500/70 mt-1">
                    Ce compte a été identifié comme un potentiel double compte automatique lors de son arrivée.
                  </p>
                </div>
                <div class="flex gap-2">
                  <span class="badge badge-danger uppercase tracking-widest">Suspect</span>
                </div>
              </div>
            {/if}

            {#if activeTab === 'resume'}
              <!-- ── Bento Layout ────────────────── -->
              <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">

                <!-- Account Identity Card (Bento Large) -->
                <div class="md:col-span-2 rounded-[2.5rem] bg-surface-container-low/50 p-8 border border-outline-variant/10 shadow-sm transition-all hover:shadow-xl hover:bg-surface-container-low duration-500 group">
                   <div class="flex items-center justify-between mb-8">
                     <div class="flex items-center gap-3">
                       <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                         <Papicon icon="user" size={24} />
                       </div>
                       <div>
                         <p class="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Informations Compte</p>
                         <p class="text-lg font-black text-on-surface">Identité & Ancienneté</p>
                       </div>
                     </div>
                   </div>

                   <div class="grid grid-cols-2 gap-8">
                     <div class="space-y-1">
                       <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Âge du compte</p>
                       <p class="text-lg font-black text-on-surface">{getDurationSince(caseData?.profile?.accountCreatedAt)}</p>
                       <p class="text-[10px] font-bold text-on-surface-variant/60">Créé le {formatDateShort(caseData?.profile?.accountCreatedAt)}</p>
                     </div>
                     <div class="space-y-1">
                       <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Présence Serveur</p>
                       <p class="text-lg font-black text-on-surface">{getDurationSince(caseData?.profile?.guildJoinedAt)}</p>
                       <p class="text-[10px] font-bold text-on-surface-variant/60">Arrivé le {formatDateShort(caseData?.profile?.guildJoinedAt)}</p>
                     </div>
                     <div class="space-y-1">
                       <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Invité par</p>
                        {#if caseData?.invite?.inviterTag}
                          {#if caseData?.invite?.inviterId}
                            <button
                              type="button"
                              onclick={() => caseData?.invite?.inviterId && onSelectUser(caseData.invite.inviterId)}
                              class="flex items-center gap-2 text-left hover:text-primary transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-xl p-1 -ml-1 group/inviter w-full"
                              title="Ouvrir la vue modérateur de l'inviteur"
                            >
                              {#if caseData.invite.inviterAvatarUrl}
                                <img
                                  src={caseData.invite.inviterAvatarUrl}
                                  alt={caseData.invite.inviterTag}
                                  class="h-6 w-6 rounded-full object-cover border border-primary/10 group-hover/inviter:border-primary transition-all duration-300"
                                />
                              {:else}
                                <div class="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary group-hover/inviter:bg-primary group-hover/inviter:text-on-primary transition-all duration-300">
                                  {caseData.invite.inviterTag.slice(0, 1).toUpperCase()}
                                </div>
                              {/if}
                              <p class="text-sm font-black text-on-surface group-hover/inviter:text-primary truncate transition-colors">@{caseData.invite.inviterTag}</p>
                            </button>
                          {:else}
                            <div class="flex items-center gap-2">
                              {#if caseData.invite.inviterAvatarUrl}
                                <img
                                  src={caseData.invite.inviterAvatarUrl}
                                  alt={caseData.invite.inviterTag}
                                  class="h-6 w-6 rounded-full object-cover border border-primary/10"
                                />
                              {:else}
                                <div class="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                                  {caseData.invite.inviterTag.slice(0, 1).toUpperCase()}
                                </div>
                              {/if}
                              <p class="text-sm font-black text-on-surface truncate">@{caseData.invite.inviterTag}</p>
                            </div>
                          {/if}
                        {:else}
                          <p class="text-sm font-bold text-on-surface-variant/40 italic">Origine inconnue</p>
                        {/if}
                     </div>
                     <div class="space-y-1">
                       <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Code d'invitation</p>
                       {#if caseData?.invite?.code}
                         <button
                           type="button"
                           class="text-sm font-black text-primary bg-primary/10 px-3 py-1 rounded-xl hover:bg-primary/20 transition-colors"
                           onclick={() => inviteDetailsModal.show(caseData.invite.code)}
                           title="Ouvrir la vue Invitations"
                         >
                           {caseData.invite.code}
                         </button>
                       {:else}
                         <p class="text-sm font-black text-on-surface">—</p>
                       {/if}
                     </div>
                   </div>
                </div>

                <!-- Sanctions Status Card -->
                <div class="rounded-[2.5rem] {sanctions.filter(s => s.status === 'ACTIVE').length > 0 ? 'bg-rose-500/5 border-rose-500/20 shadow-rose-500/5' : 'bg-surface-container-low/50 border-outline-variant/10 shadow-sm'} p-8 border transition-all hover:shadow-xl duration-500 group">
                   <div class="flex items-center gap-3 mb-8">
                     <div class="flex h-12 w-12 items-center justify-center rounded-2xl {sanctions.filter(s => s.status === 'ACTIVE').length > 0 ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-500'} group-hover:rotate-12 transition-transform">
                       <Papicon icon="hammer" size={24} />
                     </div>
                     <div>
                       <p class="text-[10px] font-black uppercase tracking-[0.2em] {sanctions.filter(s => s.status === 'ACTIVE').length > 0 ? 'text-rose-500' : 'text-amber-500'}">Casier</p>
                       <p class="text-lg font-black text-on-surface">Sanctions</p>
                     </div>
                   </div>

                   <div class="space-y-4">
                     <div class="flex items-end justify-between">
                        <span class="text-4xl font-black text-on-surface">{sanctions.length}</span>
                        <span class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 pb-1">Total</span>
                     </div>
                     <div class="h-2 w-full rounded-full bg-on-surface/5 overflow-hidden">
                        <div class="h-full bg-rose-500 transition-all duration-1000" style="width: {sanctions.length > 0 ? (sanctions.filter(s => s.status === 'ACTIVE').length / sanctions.length) * 100 : 0}%"></div>
                     </div>
                     <p class="text-xs font-bold {sanctions.filter(s => s.status === 'ACTIVE').length > 0 ? 'text-rose-500' : 'text-on-surface-variant/60'}">
                        {sanctions.filter(s => s.status === 'ACTIVE').length} sanction(s) active(s)
                     </p>
                   </div>
                </div>

                <!-- Activity Summary Card -->
                <div class="rounded-[2.5rem] bg-surface-container-low/50 p-8 border border-outline-variant/10 shadow-sm transition-all hover:shadow-xl duration-500 group">
                   <div class="flex items-center gap-3 mb-8">
                     <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/10 text-secondary group-hover:scale-110 transition-transform">
                       <Papicon icon="activity" size={24} />
                     </div>
                     <div>
                       <p class="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">Activité</p>
                       <p class="text-lg font-black text-on-surface">Engagement</p>
                     </div>
                   </div>

                   <div class="grid grid-cols-1 gap-4">
                     <div class="flex items-center justify-between">
                       <span class="text-xs font-bold text-on-surface-variant/60">Messages</span>
                       <span class="text-sm font-black text-on-surface">{caseData?.profile?.messageCount?.toLocaleString('fr-FR') ?? 0}</span>
                     </div>
                     <div class="flex items-center justify-between">
                       <span class="text-xs font-bold text-on-surface-variant/60">Vocal</span>
                       <span class="text-sm font-black text-on-surface">{formatDurationFromSeconds(caseData?.profile?.voiceTimeSeconds)}</span>
                     </div>
                     <div class="flex items-center justify-between">
                       <span class="text-xs font-bold text-on-surface-variant/60">Dernier passage</span>
                       <span class="text-sm font-black text-on-surface">{formatRelative(caseData?.profile?.lastSeenAt)}</span>
                     </div>
                   </div>
                </div>

                <!-- Activity Chart (Bento Large) -->
                {#if analyticsData && analyticsData.dailyTrend && analyticsData.dailyTrend.length > 0}
                  <div class="md:col-span-3 rounded-[3rem] bg-surface-container-low/30 p-10 border border-outline-variant/10 shadow-sm group">
                    <div class="flex items-center justify-between mb-8">
                       <div class="flex items-center gap-4">
                         <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                           <Papicon icon="trending-up" size={28} />
                         </div>
                         <div>
                           <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Statistiques</p>
                           <h4 class="text-2xl font-black text-on-surface font-headline">Tendance d'activité (30j)</h4>
                         </div>
                       </div>
                       <div class="flex gap-2">
                         <div class="flex flex-col items-end">
                           <p class="text-2xl font-black text-primary">{analyticsData.totalMessages.toLocaleString('fr-FR')}</p>
                           <p class="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/40">Messages totaux</p>
                         </div>
                         <div class="h-8 w-px bg-outline-variant/20 mx-4"></div>
                         <div class="flex flex-col items-end">
                           <p class="text-2xl font-black text-secondary">{Math.round(analyticsData.totalVoiceMinutes)}m</p>
                           <p class="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/40">Temps vocal</p>
                         </div>
                       </div>
                    </div>
                    <div class="h-[200px] w-full">
                       <Chart 
                         data={{
                           labels: analyticsData.dailyTrend.map(d => d.dateKey.slice(5)),
                           datasets: [
                             {
                               label: 'Messages',
                               data: analyticsData.dailyTrend.map(d => d.messages),
                               borderColor: '#6366f1',
                               backgroundColor: 'rgba(99, 102, 241, 0.1)',
                               fill: true,
                               tension: 0.4,
                               pointRadius: 0,
                               gradient: {
                                 backgroundColor: {
                                   axis: 'y',
                                   colors: { 0: 'rgba(99, 102, 241, 0)', 100: 'rgba(99, 102, 241, 0.2)' }
                                 }
                               }
                             },
                             {
                               label: 'Vocal (min)',
                               data: analyticsData.dailyTrend.map(d => d.voiceMinutes || 0),
                               borderColor: '#ec4899',
                               backgroundColor: 'rgba(236, 72, 153, 0.1)',
                               fill: true,
                               tension: 0.4,
                               pointRadius: 0,
                               gradient: {
                                 backgroundColor: {
                                   axis: 'y',
                                   colors: { 0: 'rgba(236, 72, 153, 0)', 100: 'rgba(236, 72, 153, 0.2)' }
                                 }
                               }
                             }
                           ]
                         }} 
                         height={200} 
                       />
                     </div>
                  </div>
                {:else if analyticsLoading}
                  <div class="md:col-span-3 rounded-[3rem] bg-surface-container-low/30 p-10 border border-outline-variant/10 shadow-sm animate-pulse flex flex-col justify-center items-center">
                    <Papicon icon="loader" size={32} class="animate-spin text-primary/20 mb-4" />
                    <p class="text-xs font-black uppercase tracking-widest text-on-surface-variant/20">Calcul des stats...</p>
                  </div>
                {:else}
                  <div class="md:col-span-3 rounded-[3rem] bg-surface-container-low/10 p-10 border border-dashed border-outline-variant/20 flex flex-col justify-center items-center text-center">
                    <div class="h-12 w-12 rounded-2xl bg-on-surface/5 flex items-center justify-center text-on-surface-variant/20 mb-4">
                      <Papicon icon="bar-chart-2" size={24} />
                    </div>
                    <p class="text-sm font-black text-on-surface-variant/40">Statistiques indisponibles</p>
                    <p class="text-[10px] font-bold text-on-surface-variant/20 mt-1 uppercase tracking-widest">Activité insuffisante sur 30j</p>
                  </div>
                {/if}

                <!-- Role & Permissions (Bento Side) -->
                <div class="rounded-[2.5rem] bg-surface-container-low/50 p-8 border border-outline-variant/10 shadow-sm transition-all hover:shadow-xl duration-500 group overflow-hidden relative">
                   <div class="absolute -right-10 -bottom-10 opacity-[0.03] rotate-12 pointer-events-none">
                     <Papicon icon="shield" size={160} />
                   </div>
                   <div class="flex items-center gap-3 mb-8">
                     <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 group-hover:scale-110 transition-transform">
                       <Papicon icon="shield" size={24} />
                     </div>
                     <div>
                       <p class="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500">Autorisations</p>
                       <p class="text-lg font-black text-on-surface">Rôles & Accès</p>
                     </div>
                   </div>

                   <div class="space-y-6">
                     <div>
                        <p class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-3">Rôles Principaux</p>
                        <div class="flex flex-wrap gap-2">
                          {#each caseData?.roles.slice(0, 4) as role}
                            <span class="px-3 py-1.5 rounded-xl bg-surface-container-high text-[10px] font-bold text-on-surface border border-outline-variant/20 flex items-center gap-1.5">
                              {#if role.color && role.color !== '#000000'}
                                <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background-color: {role.color}"></span>
                              {/if}
                              {role.name}
                            </span>
                          {/each}
                          {#if caseData?.roles.length > 4}
                            <span class="px-3 py-1.5 rounded-xl bg-primary/5 text-[10px] font-black text-primary border border-primary/10">+{caseData?.roles.length - 4}</span>
                          {/if}
                        </div>
                     </div>
                     <div>
                        <p class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-3">Permissions Clés</p>
                        <div class="flex flex-wrap gap-1.5">
                          {#each caseData?.effectivePermissions.slice(0, 3) as perm}
                            <span class="text-[10px] font-black text-emerald-500 uppercase tracking-tighter flex items-center gap-1.5">
                              <Papicon icon="check-circle" size={10} /> {perm}
                            </span>
                          {/each}
                        </div>
                     </div>
                   </div>
                </div>

                <!-- Recent Activity Feed (Wide Footer) -->
                <div class="md:col-span-4 rounded-[3rem] bg-surface-container-low/20 p-10 border border-outline-variant/10 group">
                  <div class="flex items-center justify-between mb-10">
                    <div class="flex items-center gap-4">
                       <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-on-surface/5 text-on-surface-variant">
                         <Papicon icon="history" size={28} />
                       </div>
                       <div>
                         <p class="text-[10px] font-black uppercase tracking-[0.25em] text-on-surface-variant/40">Timeline</p>
                         <h4 class="text-2xl font-black text-on-surface font-headline">Activités récentes</h4>
                       </div>
                    </div>
                    <button onclick={() => activeTab = 'logs'} class="group/btn inline-flex items-center gap-2 rounded-2xl bg-white/5 px-6 py-3 text-xs font-black text-on-surface-variant uppercase tracking-widest transition-all hover:bg-white/10 hover:text-on-surface">
                      Voir tous les logs
                      <Papicon icon="arrow-right" size={14} class="group-hover/btn:translate-x-1 transition-transform" />
                    </button>
                  </div>

                  <div class="grid gap-6 md:grid-cols-2">
                    <div class="space-y-4">
                       <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary px-2 mb-4">Derniers Messages</p>
                       {#each caseData?.messagesByChannel.slice(0, 3).flatMap(c => c.recentMessages.slice(0, 1)) as msg}
                         <div class="rounded-3xl bg-surface-container-low/60 p-5 border border-outline-variant/5 transition-all hover:border-primary/20">
                            <div class="flex items-center justify-between mb-2">
                               <span class="text-[10px] font-bold text-primary">#{msg.channelName}</span>
                               <span class="text-[10px] font-bold text-on-surface-variant/40">{formatRelative(msg.dateIso)}</span>
                            </div>
                            <p class="text-sm text-on-surface line-clamp-2 leading-relaxed italic">"{msg.content || 'Contenu vide'}"</p>
                         </div>
                       {/each}
                       {#if caseData?.messagesByChannel.length === 0}
                         <p class="text-xs text-on-surface-variant/40 px-2">Aucun message récent détecté.</p>
                       {/if}
                    </div>

                    <div class="space-y-4">
                       <p class="text-[10px] font-black uppercase tracking-[0.25em] text-secondary px-2 mb-4">Derniers Logs</p>
                       <div class="space-y-3 relative pl-4 border-l border-outline-variant/20 ml-2">
                         {#each caseData?.logs.slice(0, 3) as log}
                           <div class="relative pb-6">
                              <div class="absolute -left-[calc(1rem+4.5px)] top-1 h-2 w-2 rounded-full bg-secondary border border-surface"></div>
                              <p class="text-xs font-black text-on-surface">{log.action}</p>
                              <p class="text-[10px] font-bold text-on-surface-variant/40 mt-0.5">{log.module} · {formatRelative(log.dateIso)}</p>
                           </div>
                         {/each}
                       </div>
                    </div>
                  </div>
                </div>

                <!-- Basic Profile Card -->
                <div class="md:col-span-4 grid gap-6 md:grid-cols-2">
                  <div class="rounded-4xl bg-surface-container-low/50 p-6 border border-outline-variant/10">
                    <p class="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-6">Profil Discord</p>
                    <dl class="space-y-4">
                      <div class="flex items-center justify-between"><dt class="text-xs font-bold text-on-surface-variant/60">Nom d'utilisateur</dt><dd class="text-sm font-black text-on-surface">@{caseData?.profile?.username ?? 'Inconnu'}</dd></div>
                      <div class="flex items-center justify-between"><dt class="text-xs font-bold text-on-surface-variant/60">Nom global</dt><dd class="text-sm font-black text-on-surface">{caseData?.profile?.globalName ?? 'Inconnu'}</dd></div>
                      <div class="flex items-center justify-between"><dt class="text-xs font-bold text-on-surface-variant/60">Affichage serveur</dt><dd class="text-sm font-black text-on-surface">{caseData?.profile?.displayName ?? 'Inconnu'}</dd></div>
                      <div class="flex items-center justify-between"><dt class="text-xs font-bold text-on-surface-variant/60">Langue</dt><dd class="text-sm font-black text-on-surface uppercase tracking-widest">{caseData?.profile?.locale ?? 'Inconnue'}</dd></div>
                      <div class="flex items-center justify-between"><dt class="text-xs font-bold text-on-surface-variant/60">Pronoms</dt><dd class="text-sm font-black text-on-surface">{caseData?.profile?.pronouns ?? 'Non spécifiés'}</dd></div>
                    </dl>
                  </div>
                  <div class="rounded-4xl bg-surface-container-low/50 p-6 border border-outline-variant/10 space-y-6">
                    <p class="text-[10px] font-black uppercase tracking-[0.2em] text-secondary mb-6">Visuels</p>
                    {#if caseData?.profile?.avatarUrl}
                      <div class="flex items-center gap-4">
                        <img src={caseData?.profile?.avatarUrl} alt="Avatar" class="h-16 w-16 rounded-2xl object-cover shadow-lg border-2 border-surface" />
                        <span class="text-xs font-bold text-on-surface-variant/60">Avatar personnalisé</span>
                      </div>
                    {/if}
                    {#if caseData?.profile?.bannerUrl}
                      <img src={caseData?.profile?.bannerUrl} alt="Bannière" class="w-full h-24 rounded-2xl object-cover border border-outline-variant/10 shadow-sm" />
                    {/if}
                    {#if caseData?.profile?.accentColor}
                      <div class="flex items-center gap-3">
                        <div class="h-8 w-8 rounded-lg shadow-inner" style="background-color: #{caseData?.profile?.accentColor.toString(16).padStart(6, '0')};"></div>
                        <span class="text-xs font-bold text-on-surface-variant/60">Couleur d'accent: #{caseData?.profile?.accentColor.toString(16).padStart(6, '0')}</span>
                      </div>
                    {/if}
                  </div>
                </div>
              </div>

            {:else if activeTab === 'identite'}
              <div class="grid gap-6 md:grid-cols-2">
                <!-- Profile details -->
                <div class="rounded-[2.5rem] bg-surface-container-low/50 p-8 border border-outline-variant/10 shadow-sm hover:bg-surface-container-low transition-all duration-500 group">
                   <div class="flex items-center gap-3 mb-8">
                     <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                       <Papicon icon="user" size={24} />
                     </div>
                     <div>
                       <p class="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Données Compte</p>
                       <p class="text-lg font-black text-on-surface">Profil Complet</p>
                     </div>
                   </div>
                   <dl class="space-y-5">
                     <div class="flex items-center justify-between border-b border-outline-variant/5 pb-2">
                       <dt class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">ID Discord</dt>
                       <dd class="text-sm font-black text-on-surface select-all">{caseData?.profile?.userId ?? userId}</dd>
                     </div>
                     <div class="flex items-center justify-between border-b border-outline-variant/5 pb-2">
                       <dt class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Nom d'utilisateur</dt>
                       <dd class="text-sm font-black text-on-surface">@{caseData?.profile?.username ?? 'Inconnu'}</dd>
                     </div>
                     <div class="flex items-center justify-between border-b border-outline-variant/5 pb-2">
                       <dt class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Nom Global</dt>
                       <dd class="text-sm font-black text-on-surface">{caseData?.profile?.globalName ?? 'Inconnu'}</dd>
                     </div>
                     <div class="flex items-center justify-between border-b border-outline-variant/5 pb-2">
                       <dt class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Surnom Serveur</dt>
                       <dd class="text-sm font-black text-on-surface">{caseData?.profile?.displayName ?? 'Inconnu'}</dd>
                     </div>
                     <div class="flex items-center justify-between border-b border-outline-variant/5 pb-2">
                       <dt class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Pronoms</dt>
                       <dd class="text-sm font-black text-on-surface">{caseData?.profile?.pronouns ?? 'Non spécifiés'}</dd>
                     </div>
                     <div class="flex items-center justify-between">
                       <dt class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Langue (Locale)</dt>
                       <dd class="text-sm font-black text-on-surface uppercase tracking-widest">{caseData?.profile?.locale ?? 'Inconnue'}</dd>
                     </div>
                   </dl>
                </div>

                {#if caseData?.profile?.staffGrade}
                  <!-- Staff Role Section -->
                  <div class="rounded-[2.5rem] bg-amber-500/5 dark:bg-amber-500/10 p-8 border border-amber-500/20 dark:border-amber-400/20 shadow-sm hover:bg-amber-500/10 dark:hover:bg-amber-500/15 transition-all duration-500 group">
                     <div class="flex items-center gap-3 mb-8">
                       <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-white group-hover:scale-110 transition-transform shadow-lg shadow-amber-500/20">
                         <Papicon icon="star" size={24} />
                       </div>
                       <div>
                         <p class="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400">Administration</p>
                         <p class="text-lg font-black text-on-surface">Statut Staff</p>
                       </div>
                     </div>
                     <dl class="space-y-5">
                       <div class="flex items-center justify-between border-b border-amber-500/15 pb-2">
                         <dt class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Grade Actuel</dt>
                         <dd class="text-sm font-black text-amber-600 dark:text-amber-400">{caseData?.profile?.staffGrade}</dd>
                       </div>
                       <div class="flex items-center justify-between">
                         <dt class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Statut Tuteur</dt>
                         <dd class="text-sm font-black text-on-surface">
                           {caseData?.profile?.isTutor ? 'Oui (Actif)' : 'Non'}
                         </dd>
                       </div>
                     </dl>
                  </div>
                {/if}

                <!-- Timeline -->
                <div class="rounded-[2.5rem] bg-surface-container-low/50 p-8 border border-outline-variant/10 shadow-sm hover:bg-surface-container-low transition-all duration-500 group">
                   <div class="flex items-center gap-3 mb-8">
                     <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/10 text-secondary group-hover:scale-110 transition-transform">
                       <Papicon icon="calendar" size={24} />
                     </div>
                     <div>
                       <p class="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">Chronologie</p>
                       <p class="text-lg font-black text-on-surface">Dates Clés</p>
                     </div>
                   </div>
                   <dl class="space-y-5">
                     <div class="flex items-center justify-between border-b border-outline-variant/5 pb-2">
                       <dt class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Création Compte</dt>
                       <dd class="text-sm font-black text-on-surface">{formatDateTime(caseData?.profile?.accountCreatedAt)}</dd>
                     </div>
                     <div class="flex items-center justify-between border-b border-outline-variant/5 pb-2">
                       <dt class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Arrivée Serveur</dt>
                       <dd class="text-sm font-black text-on-surface">{formatDateTime(caseData?.profile?.guildJoinedAt)}</dd>
                     </div>
                     {#if caseData?.profile?.guildLeftAt}
                       <div class="flex items-center justify-between border-b border-outline-variant/5 pb-2">
                         <dt class="text-[10px] font-black uppercase tracking-widest text-rose-500/60">Dernier Départ</dt>
                         <dd class="text-sm font-black text-rose-500">{formatDateTime(caseData?.profile?.guildLeftAt)}</dd>
                       </div>
                     {/if}
                     <div class="flex items-center justify-between border-b border-outline-variant/5 pb-2">
                       <dt class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Première Vue</dt>
                       <dd class="text-sm font-black text-on-surface">{formatDateTime(caseData?.profile?.firstSeenAt)}</dd>
                     </div>
                     <div class="flex items-center justify-between">
                       <dt class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Dernière Vue</dt>
                       <dd class="text-sm font-black text-on-surface">{formatDateTime(caseData?.profile?.lastSeenAt)}</dd>
                     </div>
                   </dl>
                </div>

                <!-- Roles Detailed -->
                <div class="md:col-span-2 rounded-[2.5rem] bg-surface-container-low/50 p-8 border border-outline-variant/10 shadow-sm hover:bg-surface-container-low transition-all duration-500 group">
                   <div class="flex items-center gap-3 mb-8">
                     <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 group-hover:rotate-12 transition-transform">
                       <Papicon icon="shield" size={24} />
                     </div>
                     <div>
                       <p class="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500">Autorisations</p>
                       <p class="text-lg font-black text-on-surface">Rôles ({caseData?.roles.length})</p>
                     </div>
                   </div>
                   <div class="flex flex-wrap gap-3">
                     {#each caseData?.roles as role}
                       <span class="px-5 py-2.5 rounded-2xl bg-surface-container-high text-xs font-black text-on-surface border border-outline-variant/20 shadow-sm transition-all hover:scale-105 hover:bg-surface-container-highest flex items-center gap-2">
                         {#if role.color && role.color !== '#000000'}
                           <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: {role.color}"></span>
                         {/if}
                         {role.name}
                       </span>
                     {/each}
                     {#if caseData?.roles.length === 0}
                        <div class="w-full py-10 text-center bg-surface-container-low rounded-3xl border border-dashed border-outline-variant/20">
                          <p class="text-sm font-black text-on-surface-variant/40 uppercase tracking-widest">Aucun rôle attribué</p>
                        </div>
                     {/if}
                   </div>
                </div>
              </div>

            {:else if activeTab === 'activite'}
                <div class="space-y-8">
                  <div class="grid gap-6 md:grid-cols-3">
                    <div class="rounded-4xl bg-primary/5 p-6 border border-primary/10 text-center">
                      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mx-auto mb-4">
                        <Papicon icon="message-square" size={20} />
                      </div>
                      <p class="text-2xl font-black text-on-surface">{caseData?.profile?.messageCount ?? 0}</p>
                      <p class="text-[9px] font-black uppercase tracking-widest text-primary/60 mt-1">Messages</p>
                    </div>
                    <div class="rounded-4xl bg-secondary/5 p-6 border border-secondary/10 text-center">
                      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/10 text-secondary mx-auto mb-4">
                        <Papicon icon="mic" size={20} />
                      </div>
                      <p class="text-2xl font-black text-on-surface">{formatDurationFromSeconds(caseData?.profile?.voiceTimeSeconds)}</p>
                      <p class="text-[9px] font-black uppercase tracking-widest text-secondary/60 mt-1">Temps vocal</p>
                    </div>
                    <div class="rounded-4xl bg-emerald-500/5 p-6 border border-emerald-500/10 text-center">
                      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 mx-auto mb-4">
                        <Papicon icon="eye" size={20} />
                      </div>
                      <p class="text-lg font-black text-on-surface">{formatDateShort(caseData?.profile?.lastSeenAt)}</p>
                      <p class="text-[9px] font-black uppercase tracking-widest text-emerald-500/60 mt-1">Dernière activité</p>
                    </div>
                  </div>

                  <div class="rounded-[2.5rem] bg-surface-container-low/50 p-8 border border-outline-variant/10">
                    <p class="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-8 px-2">Répartition par salon</p>
                    <div class="space-y-6">
                      {#each caseData?.messagesByChannel || [] as channel}
                        {@const max = Math.max(...(caseData?.messagesByChannel || []).map(c => c.count), 1)}
                        <div class="space-y-2">
                          <div class="flex items-center justify-between px-1">
                            <span class="text-sm font-black text-on-surface">{channel.channelName}</span>
                            <span class="text-xs font-bold text-on-surface-variant/60">{channel.count} messages</span>
                          </div>
                          <div class="h-2 w-full rounded-full bg-surface-container-high overflow-hidden">
                            <div class="h-full bg-linear-to-r from-primary to-secondary transition-all duration-1000" style="width: {(channel.count / max) * 100}%"></div>
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                </div>

              {:else if activeTab === 'analytics'}
                <div class="space-y-8">
                  {#if analyticsLoading}
                    <div class="flex flex-col items-center justify-center py-24 bg-surface-container-low/30 rounded-[3rem] border border-outline-variant/10">
                      <div class="relative mb-6">
                        <div class="absolute -inset-4 rounded-full bg-primary/10 blur-xl animate-pulse"></div>
                        <Papicon icon="loader" size={48} class="animate-spin text-primary" />
                      </div>
                      <p class="text-xs font-black uppercase tracking-[0.3em] text-on-surface-variant/60">Analyse du comportement...</p>
                    </div>
                  {:else if analyticsData && analyticsData.dailyTrend && analyticsData.dailyTrend.length > 0}
                    <div class="grid gap-6 lg:grid-cols-2">
                       <div class="rounded-[2.5rem] bg-surface-container-low/50 p-8 border border-outline-variant/10 shadow-sm group">
                         <div class="flex items-center justify-between mb-8">
                            <div>
                              <p class="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Activité</p>
                              <h4 class="text-sm font-black text-on-surface uppercase tracking-widest">Volume Messages</h4>
                            </div>
                            <span class="text-[10px] font-bold text-on-surface-variant/40 bg-surface-container-high px-3 py-1 rounded-lg">30 derniers jours</span>
                         </div>
                          <Chart 
                            data={{
                              labels: analyticsData.dailyTrend.map(d => d.dateKey.slice(5)),
                              datasets: [{
                                label: 'Messages',
                                data: analyticsData.dailyTrend.map(d => d.messages),
                                borderColor: '#6366f1',
                                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                                fill: true,
                                tension: 0.4,
                                pointRadius: 0,
                                gradient: {
                                  backgroundColor: {
                                    axis: 'y',
                                    colors: { 0: 'rgba(99, 102, 241, 0)', 100: 'rgba(99, 102, 241, 0.2)' }
                                  }
                                }
                              }]
                            }} 
                            height={180} 
                          />
                       </div>
                       <div class="rounded-[2.5rem] bg-surface-container-low/50 p-8 border border-outline-variant/10 shadow-sm group">
                         <div class="flex items-center justify-between mb-8">
                            <div>
                              <p class="text-[10px] font-black uppercase tracking-widest text-secondary mb-1">Engagement</p>
                              <h4 class="text-sm font-black text-on-surface uppercase tracking-widest">Activité Vocal</h4>
                            </div>
                            <span class="text-[10px] font-bold text-on-surface-variant/40 bg-surface-container-high px-3 py-1 rounded-lg">Minutes / jour</span>
                         </div>
                          <Chart 
                            data={{
                              labels: analyticsData.dailyTrend.map(d => d.dateKey.slice(5)),
                              datasets: [{
                                label: 'Vocal (min)',
                                data: analyticsData.dailyTrend.map(d => d.voiceMinutes),
                                borderColor: '#ec4899',
                                backgroundColor: 'rgba(236, 72, 153, 0.1)',
                                fill: true,
                                tension: 0.4,
                                pointRadius: 0,
                                gradient: {
                                  backgroundColor: {
                                    axis: 'y',
                                    colors: { 0: 'rgba(236, 72, 153, 0)', 100: 'rgba(236, 72, 153, 0.2)' }
                                  }
                                }
                              }]
                            }} 
                            height={180} 
                          />
                       </div>
                    </div>
                  {:else}
                    <div class="flex flex-col items-center justify-center py-24 text-center bg-surface-container-low/30 rounded-[3rem] border-2 border-dashed border-outline-variant/20">
                      <div class="flex h-20 w-20 items-center justify-center rounded-3xl bg-surface-container-high text-on-surface-variant/20 mb-8">
                        <Papicon icon="bar-chart-2" size={40} />
                      </div>
                      <h3 class="text-2xl font-black text-on-surface-variant font-headline">Aucune donnée analytique</h3>
                      <p class="mt-2 text-sm text-on-surface-variant/60 max-w-sm mx-auto px-6">
                        Nous n'avons pas encore assez de données d'activité pour générer des graphiques pour ce membre sur les 30 derniers jours.
                      </p>
                    </div>
                  {/if}
                </div>

              {:else if activeTab === 'messages'}
                <div class="space-y-6">
                  {#each caseData?.messagesByChannel as channel}
                    <div class="rounded-4xl bg-surface-container-low/50 p-6 border border-outline-variant/10">
                      <div class="flex items-center gap-3 mb-6 border-b border-outline-variant/10 pb-4">
                        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Papicon icon="tag" size={16} />
                        </div>
                        <a 
                          href="https://discord.com/channels/{authStore.selectedGuildId}/{channel.channelId}" 
                          target="_blank"
                          class="text-sm font-black text-on-surface hover:text-primary transition-colors flex items-center gap-1.5"
                        >
                          {channel.channelName}
                          <Papicon icon="external-link" size={12} class="opacity-30" />
                        </a>
                        <span class="ml-auto text-[10px] font-black bg-primary/5 text-primary px-3 py-1 rounded-full uppercase tracking-widest">{channel.count} msg</span>
                      </div>
                      <div class="space-y-3">
                        {#each channel.recentMessages as msg}
                          <div class="rounded-2xl bg-surface-container-high/30 p-4 border border-outline-variant/5">
                            <div class="flex items-center justify-between mb-2">
                               <span class="text-[10px] font-bold text-on-surface-variant/40">{formatDateTime(msg.dateIso)}</span>
                               {#if msg.discordUrl}
                                 <a href={msg.discordUrl} target="_blank" class="text-[9px] font-black text-primary hover:underline uppercase tracking-widest flex items-center gap-1">
                                   Voir sur Discord
                                   <Papicon icon="arrow-up-right" size={10} />
                                 </a>
                               {/if}
                            </div>
                            <p class="text-sm text-on-surface leading-relaxed">{@html msg.content || 'Contenu vide'}</p>
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/each}
                  {#if caseData?.messagesByChannel.length === 0}
                    <div class="flex flex-col items-center justify-center py-24 text-center bg-surface-container-low/30 rounded-[3rem] border-2 border-dashed border-outline-variant/20">
                      <div class="flex h-20 w-20 items-center justify-center rounded-3xl bg-surface-container-high text-on-surface-variant/20 mb-8">
                        <Papicon icon="message-square" size={40} />
                      </div>
                      <h3 class="text-2xl font-black text-on-surface-variant font-headline">Silence radio</h3>
                      <p class="mt-2 text-sm text-on-surface-variant/60 max-w-sm mx-auto px-6">
                        Aucun message récent n'a été indexé pour ce membre dans les salons surveillés.
                      </p>
                    </div>
                  {/if}
                </div>

              {:else if activeTab === 'logs'}
                <div class="rounded-[2.5rem] bg-surface-container-low/50 p-8 border border-outline-variant/10">
                  <div class="space-y-8 relative pl-6 border-l-2 border-outline-variant/20 ml-4">
                    {#each caseData?.logs as log}
                      <div class="relative">
                        <div class="absolute -left-[calc(1.5rem+5px)] top-1.5 h-3 w-3 rounded-full bg-primary border-2 border-surface shadow-sm"></div>
                        <div class="flex items-start justify-between gap-4 mb-2">
                          <div>
                            <p class="text-sm font-black text-on-surface tracking-tight">{log.action}</p>
                            <p class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 mt-1">{log.module} · {log.source}</p>
                          </div>
                          <span class="text-[10px] font-black text-on-surface-variant/30 uppercase tracking-widest">{formatDateTime(log.dateIso)}</span>
                        </div>
                        <div class="rounded-2xl bg-surface-container-high/30 p-4 text-xs text-on-surface-variant/80 italic leading-relaxed">
                          {@html sanitizeLogSnippet(log.details)}
                        </div>
                      </div>
                    {/each}
                    {#if caseData?.logs.length === 0}
                      <div class="flex flex-col items-center justify-center py-10 text-on-surface-variant/20">
                         <Papicon icon="history" size={48} />
                         <p class="mt-4 text-sm font-black uppercase tracking-widest">Aucun log disponible</p>
                      </div>
                    {/if}
                  </div>
                </div>

              {:else if activeTab === 'sanctions'}
                <div class="rounded-[2.5rem] bg-surface-container-low/50 overflow-hidden border border-outline-variant/10 shadow-sm">
                  <table class="w-full text-left border-collapse">
                    <thead>
                      <tr class="bg-surface-container-high/30">
                        <th class="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Date</th>
                        <th class="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Action</th>
                        <th class="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Statut</th>
                        <th class="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Raison</th>
                        <th class="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Rapport</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-outline-variant/10">
                      {#each sanctions as sanction}
                        {@const hasReport = [...(dashboardStore.state.sanctionReports || []), ...(caseData?.sanctionReports || [])].some(r => r.sanctionId === sanction.id)}
                        <tr class="hover:bg-surface-container-high/20 transition-colors">
                          <td class="px-6 py-4 text-xs font-bold text-on-surface-variant/60">{formatDateShort(sanction.createdAt)}</td>
                          <td class="px-6 py-4">
                            <span class="text-xs font-black text-primary uppercase tracking-widest">{formatTypeLabel(sanction.type)}</span>
                            <p class="text-[10px] font-bold text-on-surface-variant/40 mt-0.5">par @{sanction.moderatorTag}</p>
                          </td>
                          <td class="px-6 py-4">
                            <span class="px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest {sanction.status === 'ACTIVE' ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}">
                              {getSanctionStatusLabel(sanction.status)}
                            </span>
                          </td>
                          <td class="px-6 py-4 text-xs text-on-surface-variant max-w-xs truncate">{sanction.reason}</td>
                          <td class="px-6 py-4">
                            {#if hasReport}
                              <button
                                onclick={() => viewingReportSanctionId = sanction.id}
                                class="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[10px] font-black text-on-primary uppercase tracking-widest transition-all hover:bg-primary-container hover:scale-[1.02] active:scale-[0.98] shadow-xs cursor-pointer"
                              >
                                <Papicon icon="file-text" size={12} />
                                Voir plus
                              </button>
                            {:else}
                              <span class="text-[10px] font-bold text-on-surface-variant/30 italic">Aucun rapport</span>
                            {/if}
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                  {#if sanctions.length === 0}
                    <div class="flex flex-col items-center py-20 text-on-surface-variant/30">
                      <Papicon icon="check-circle" size={48} />
                      <p class="mt-4 text-sm font-black uppercase tracking-widest">Dossier vierge</p>
                    </div>
                  {/if}
                </div>

              {:else if activeTab === 'invites'}
                <div class="grid gap-6 md:grid-cols-2">
                   <div class="rounded-4xl bg-surface-container-low/50 p-6 border border-outline-variant/10">
                     <p class="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-6">Source d'invitation</p>
                     <dl class="space-y-4">
                       <div class="flex items-center justify-between">
                         <dt class="text-xs font-bold text-on-surface-variant/60">Code utilisé</dt>
                         {#if caseData?.invite?.code}
                           <button
                             type="button"
                             class="text-sm font-black text-primary bg-primary/10 px-3 py-1 rounded-xl hover:bg-primary/20 transition-colors font-mono"
                             onclick={() => inviteDetailsModal.show(caseData.invite.code)}
                             title="Ouvrir la vue Invitations"
                           >
                             {caseData.invite.code}
                           </button>
                         {:else}
                           <dd class="text-sm font-black text-on-surface font-mono">Inconnu</dd>
                         {/if}
                       </div>
                       <div class="flex items-center justify-between">
                          <dt class="text-xs font-bold text-on-surface-variant/60">Créateur</dt>
                          <dd class="text-sm font-black text-on-surface">
                            {#if caseData?.invite?.inviterTag}
                              <div class="flex items-center gap-2">
                                {#if caseData.invite.inviterAvatarUrl}
                                  <img
                                    src={caseData.invite.inviterAvatarUrl}
                                    alt={caseData.invite.inviterTag}
                                    class="h-5 w-5 rounded-full object-cover border border-primary/10"
                                  />
                                {/if}
                                {#if caseData?.invite?.inviterId}
                                  <button
                                    type="button"
                                    onclick={() => caseData?.invite?.inviterId && onSelectUser(caseData.invite.inviterId)}
                                    class="text-primary hover:underline focus:outline-none font-black text-left"
                                    title="Ouvrir la vue modérateur de l'inviteur"
                                  >
                                    @{caseData.invite.inviterTag}
                                  </button>
                                {:else}
                                  @{caseData.invite.inviterTag}
                                {/if}
                              </div>
                            {:else}
                              Inconnu
                            {/if}
                          </dd>
                        </div>
                       <div class="flex items-center justify-between"><dt class="text-xs font-bold text-on-surface-variant/60">Date d'utilisation</dt><dd class="text-sm font-black text-on-surface">{formatDateTime(caseData?.invite?.joinedAt ?? caseData?.profile?.guildJoinedAt)}</dd></div>
                     </dl>
                   </div>
                   <div class="rounded-4xl bg-surface-container-low/50 p-6 border border-outline-variant/10">
                     <p class="text-[10px] font-black uppercase tracking-[0.2em] text-secondary mb-6">Mouvements Serveur</p>
                     <dl class="space-y-4">
                       <div class="flex items-center justify-between"><dt class="text-xs font-bold text-on-surface-variant/60">Dernière arrivée</dt><dd class="text-sm font-black text-on-surface">{formatDateTime(caseData?.profile?.guildJoinedAt)}</dd></div>
                       <div class="flex items-center justify-between"><dt class="text-xs font-bold text-on-surface-variant/60">Dernier départ</dt><dd class="text-sm font-black text-on-surface">{formatDateTime(caseData?.profile?.guildLeftAt)}</dd></div>
                       <div class="flex items-center justify-between"><dt class="text-xs font-bold text-on-surface-variant/60">Première observation</dt><dd class="text-sm font-black text-on-surface">{formatDateTime(caseData?.profile?.firstSeenAt)}</dd></div>
                     </dl>
                   </div>
                </div>

              {:else if activeTab === 'connexions'}
                <div class="space-y-6">
                  <div class="flex items-center justify-between px-2">
                    <div>
                      <p class="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-1">Réseau Social</p>
                      <h4 class="text-sm font-black text-on-surface uppercase tracking-widest">Graphe d'Interactions</h4>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="text-[10px] font-bold text-on-surface-variant/40 bg-surface-container-high px-3 py-1 rounded-lg">Top 10 contacts</span>
                    </div>
                  </div>
                  
                  <div class="w-full h-[520px]">
                    <InteractionTree 
                      nodes={caseData?.interactionGraph?.nodes || []} 
                      edges={caseData?.interactionGraph?.edges || []} 
                      onSelectNode={onSelectUser}
                    />
                  </div>

                  <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {#each caseData?.connections as connection}
                      <div class="flex items-center gap-4 rounded-[1.5rem] bg-surface-container-low/50 p-4 border border-outline-variant/10 hover:border-primary/30 transition-all group">
                        <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                          <Papicon icon={getConnectionIcon(connection.type)} size={20} />
                        </div>
                        <div class="min-w-0">
                          <p class="text-sm font-black text-on-surface truncate">{connection.name}</p>
                          <p class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40 mt-0.5">{connection.type}</p>
                        </div>
                      </div>
                    {/each}
                    {#if caseData?.connections.length === 0 && (caseData?.interactionGraph?.nodes || []).length === 0}
                      <div class="md:col-span-2 lg:col-span-3 flex flex-col items-center py-20 text-on-surface-variant/30 bg-surface-container-low/30 rounded-[2.5rem]">
                        <Papicon icon="link-2" size={48} />
                        <p class="mt-4 text-sm font-black uppercase tracking-widest">Aucun lien externe</p>
                      </div>
                    {/if}
                  </div>
                </div>

              {:else if activeTab === 'candidatures'}
                <div class="space-y-6">
                  {#each (caseData?.candidatures || []) as cand}
                    <div class="rounded-[2.5rem] bg-surface-container-low/50 p-8 border border-outline-variant/10 space-y-6">
                      <div class="flex items-start justify-between">
                         <div>
                            <span class="text-[10px] font-black uppercase tracking-widest text-primary mb-2 block">{formatDateShort(cand.createdAt)}</span>
                            <span class="px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest {cand.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}">
                              {cand.status}
                            </span>
                         </div>
                         {#if cand.oralResult}
                           <div class="flex flex-col items-end">
                              <span class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-1">Résultat Oral</span>
                              <span class="text-sm font-black text-on-surface">{cand.oralResult}</span>
                           </div>
                         {/if}
                      </div>
                      {#if cand.notes}
                        <div class="rounded-2xl bg-surface-container-high/30 p-5 border-l-4 border-primary italic text-sm text-on-surface-variant leading-relaxed">
                          "{cand.notes}"
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>

              {:else if activeTab === 'linked_accounts'}
                <div class="mb-8 rounded-3xl bg-surface-container-low/50 p-6 border border-outline-variant/10">
                  <h3 class="text-sm font-black text-on-surface mb-4 flex items-center gap-2"><Papicon icon="link-2" size={16} /> Lier un compte manuellement</h3>
                  <div class="grid gap-4 md:grid-cols-2">
                    <FormInput 
                      id="targetAccountId" 
                      label="ID du compte cible" 
                      bind:value={targetAccountId} 
                      placeholder="Ex: 123456789012345678" 
                      icon="user-plus" 
                      required 
                    />
                    <FormInput 
                      id="linkReason" 
                      label="Raison (obligatoire pour le Staff)" 
                      bind:value={linkReason} 
                      placeholder="Ex: Double compte confirmé par logs" 
                      icon="file-text" 
                    />
                  </div>
                  
                  {#if linkFeedback}
                    <div class="mt-4 p-3 rounded-xl text-sm font-bold {linkIsError ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}">
                      {linkFeedback}
                    </div>
                  {/if}
                  
                  <div class="mt-4 flex justify-end">
                    <button 
                      class="px-6 py-2 rounded-xl text-sm font-black tracking-widest uppercase transition-all duration-300 {linkBusy || !targetAccountId ? 'bg-surface-container-high text-on-surface-variant/50 cursor-not-allowed' : 'bg-primary text-on-primary hover:bg-primary/90 hover:scale-[1.02] active:scale-95'}"
                      onclick={handleLinkAccount}
                      disabled={linkBusy || !targetAccountId}
                    >
                      {#if linkBusy}
                        <div class="flex items-center gap-2">
                          <div class="h-4 w-4 animate-spin rounded-full border-2 border-on-primary border-t-transparent"></div>
                          <span>Liaison...</span>
                        </div>
                      {:else}
                        Lier les comptes
                      {/if}
                    </button>
                  </div>
                </div>

                <div class="grid gap-6 md:grid-cols-2">
                  {#each caseData?.linkedAccounts || [] as link}
                    <div class="rounded-[2.5rem] bg-surface-container-low/50 p-6 border border-outline-variant/10 shadow-sm hover:bg-surface-container-low transition-all duration-500 group flex items-center gap-4">
                      {#if link.avatarUrl}
                        <img src={link.avatarUrl} alt="Avatar" class="h-16 w-16 rounded-2xl object-cover shadow-lg border-2 border-surface" />
                      {:else}
                        <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-container-high text-xl font-black text-primary">
                          {link.userTag?.slice(0, 1).toUpperCase()}
                        </div>
                      {/if}
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center justify-between">
                           <p class="text-sm font-black text-on-surface truncate">{link.userTag}</p>
                           <div class="flex items-center gap-2">
                             <span class="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest {link.status === 'VALIDATED' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}">
                               {link.status}
                             </span>
                             {#if dashboardStore.state.accessLevel === 'admin'}
                               <button 
                                 class="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
                                 title="Délier le compte"
                                 onclick={() => handleUnlinkAccount(link.userId)}
                                 disabled={unlinkingAccountId === link.userId}
                               >
                                 {#if unlinkingAccountId === link.userId}
                                   <div class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-500 border-t-transparent"></div>
                                 {:else}
                                   <Papicon icon="trash-2" size={14} />
                                 {/if}
                               </button>
                             {/if}
                           </div>
                        </div>
                        <p class="text-[10px] font-bold text-on-surface-variant/40 mt-1">ID: {link.userId}</p>
                        <p class="text-[10px] font-black text-primary uppercase tracking-widest mt-1">{link.type}</p>
                      </div>
                    </div>
                  {/each}
                  {#if (caseData?.linkedAccounts || []).length === 0}
                    <div class="md:col-span-2 flex flex-col items-center py-20 text-on-surface-variant/30 bg-surface-container-low/30 rounded-[2.5rem]">
                      <div class="flex h-16 w-16 items-center justify-center rounded-3xl bg-surface-container-high text-on-surface-variant/20 mb-6">
                        <Papicon icon="user-plus" size={32} />
                      </div>
                      <p class="mt-4 text-sm font-black uppercase tracking-widest">Aucun compte lié</p>
                    </div>
                  {/if}
                </div>
              {:else if activeTab === 'notes'}
                <div class="space-y-6">
                  <div class="rounded-[2.5rem] bg-surface-container-low/50 p-8 border border-outline-variant/10 shadow-sm">
                    <div class="flex items-center gap-3 mb-6">
                      <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Papicon icon="edit-3" size={24} />
                      </div>
                      <div>
                        <p class="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Modération</p>
                        <p class="text-lg font-black text-on-surface">Notes Modérateur</p>
                      </div>
                    </div>

                    <p class="text-sm text-on-surface-variant/70 mb-6 leading-relaxed">
                      Ces notes sont persistantes et visibles uniquement par l'équipe de modération. Utilisez cet espace pour laisser des informations importantes sur le comportement de l'utilisateur.
                    </p>

                    <div class="relative group">
                      <label for="moderator-note-textarea" class="sr-only">Notes modérateur</label>
                      <textarea
                        id="moderator-note-textarea"
                        bind:value={moderatorNote}
                        placeholder="Ajouter une note sur cet utilisateur..."
                        class="w-full min-h-[300px] rounded-3xl bg-surface-container-high/50 p-6 text-sm text-on-surface placeholder:text-on-surface-variant/30 border-2 border-transparent focus:border-primary/30 focus:bg-surface-container-high transition-all outline-hidden resize-none"
                      ></textarea>
                    </div>

                    <div class="mt-6 flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        {#if noteFeedback}
                          <span class="text-xs font-bold {noteFeedback.includes('Erreur') ? 'text-rose-400' : 'text-emerald-400'} animate-in fade-in slide-in-from-left-2">
                            {noteFeedback}
                          </span>
                        {/if}
                      </div>
                      <button
                        onclick={handleSaveNote}
                        disabled={noteBusy}
                        class="flex items-center gap-2 px-8 py-3 rounded-2xl bg-primary text-on-primary text-sm font-black uppercase tracking-widest transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
                      >
                        {#if noteBusy}
                          <div class="h-4 w-4 animate-spin rounded-full border-2 border-on-primary border-t-transparent"></div>
                          <span>Enregistrement...</span>
                        {:else}
                          <Papicon icon="save" size={18} />
                          <span>Sauvegarder</span>
                        {/if}
                      </button>
                    </div>
                  </div>
                </div>
              {/if}
          </div>
        {/if}
      </div>

    </div>

    {#if viewingReportSanctionId && selectedSanctionForReport}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div 
        class="fixed inset-0 z-[10010] flex items-center justify-center bg-surface-container-lowest/90 backdrop-blur-sm animate-in fade-in duration-300"
        onclick={(e) => e.stopPropagation()}
      >
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div 
          class="w-full max-w-2xl bg-surface-container-low rounded-[2.5rem] border border-outline-variant/10 shadow-2xl p-8 max-h-[90%] overflow-y-auto relative"
          onclick={(e) => e.stopPropagation()}
        >
          <button
            onclick={() => viewingReportSanctionId = null}
            class="absolute top-6 right-6 h-10 w-10 flex items-center justify-center rounded-xl bg-on-surface/5 text-on-surface-variant transition-all hover:bg-on-surface/10 hover:text-on-surface"
          >
            <Papicon icon="x" size={20} />
          </button>

          <div class="mb-8">
            <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary mb-1">Rapport de sanction</p>
            <h4 class="text-2xl font-black text-on-surface font-headline">{formatTypeLabel(selectedSanctionForReport.type)}</h4>
            <p class="text-xs text-on-surface-variant/60 mt-1">Appliquée le {formatDateTime(selectedSanctionForReport.createdAt)} par @{selectedSanctionForReport.moderatorTag}</p>
          </div>

          {#if selectedReport}
            {#if isEditingReport}
              <!-- Edit Form -->
               <div class="space-y-6 animate-in fade-in duration-300">
                 <div class="grid grid-cols-2 gap-4">
                   <div class="space-y-1.5">
                     <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 px-1">Date de l'incident</p>
                     <input 
                       type="datetime-local" 
                       bind:value={editReportData.incidentAt} 
                       class="w-full rounded-2xl bg-surface-container-high px-4 py-3 text-xs font-bold text-on-surface border border-outline-variant/10 focus:border-primary/50 outline-hidden transition-all"
                     />
                   </div>
                   <div class="space-y-1.5">
                     <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 px-1">Durée appliquée</p>
                     <input 
                       type="text" 
                       bind:value={editReportData.sanctionDurationLabel} 
                       placeholder="Ex: 2h, Permanent..." 
                       class="w-full rounded-2xl bg-surface-container-high px-4 py-3 text-xs font-bold text-on-surface border border-outline-variant/10 focus:border-primary/50 outline-hidden transition-all"
                     />
                   </div>
                 </div>

                 <div class="space-y-1.5">
                   <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 px-1">Règles enfreintes</p>
                   <ReportRuleSelector
                     options={reportRuleOptions}
                     selectedIds={editReportData.selectedRuleIds}
                     onToggle={(id, checked) => {
                       if (checked) {
                         editReportData.selectedRuleIds = [...new Set([...editReportData.selectedRuleIds, id])];
                       } else {
                         editReportData.selectedRuleIds = editReportData.selectedRuleIds.filter(v => v !== id);
                       }
                     }}
                   />
                   <SelectedRuleChips selectedRules={editDraftRules} />
                 </div>

                 <div class="space-y-1.5">
                   <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 px-1">Raison détaillée</p>
                   <textarea 
                     bind:value={editReportData.detailedReason} 
                     rows="4"
                     placeholder="Description précise des faits..." 
                     class="w-full rounded-2xl bg-surface-container-high px-4 py-3 text-xs font-bold text-on-surface border border-outline-variant/10 focus:border-primary/50 outline-hidden transition-all resize-none"
                   ></textarea>
                 </div>

                 <div class="space-y-1.5">
                   <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 px-1">Preuves (URLs)</p>
                   <EvidenceInputList bind:links={editReportData.evidenceLinks} />
                 </div>

                 <div class="space-y-1.5">
                   <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 px-1">Notes complémentaires</p>
                   <textarea 
                     bind:value={editReportData.additionalNotes} 
                     rows="2"
                     placeholder="Précisions facultatives..." 
                     class="w-full rounded-2xl bg-surface-container-high px-4 py-3 text-xs font-bold text-on-surface border border-outline-variant/10 focus:border-primary/50 outline-hidden transition-all resize-none"
                   ></textarea>
                 </div>

                 <div class="flex gap-3 pt-4">
                   <button
                     onclick={() => isEditingReport = false}
                     class="flex-1 py-3 rounded-xl bg-on-surface/5 text-xs font-black uppercase tracking-widest text-on-surface-variant transition-all hover:bg-on-surface/10"
                   >
                     Annuler
                   </button>
                   <button
                     onclick={handleUpdateReport}
                     disabled={updateReportBusy}
                     class="flex-1 py-3 rounded-xl bg-primary text-on-primary text-xs font-black uppercase tracking-widest transition-all hover:bg-primary-container hover:text-primary disabled:opacity-50"
                   >
                     {updateReportBusy ? 'Enregistrement...' : 'Enregistrer'}
                   </button>
                 </div>
               </div>
            {:else}
              <!-- View Mode -->
              <div class="space-y-6">
                <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-1">
                    <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Incident</p>
                    <p class="text-sm font-bold text-on-surface">{formatDateTime(selectedReport.incidentAt)}</p>
                  </div>
                  <div class="space-y-1">
                    <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Durée</p>
                    <p class="text-sm font-bold text-on-surface">{selectedReport.sanctionDurationLabel || 'N/A'}</p>
                  </div>
                </div>

                <div class="space-y-2">
                  <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Règles enfreintes</p>
                  <SelectedRuleChips selectedRules={selectedReportRules} />
                </div>

                <div class="space-y-2">
                  <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Raison détaillée</p>
                  <div class="rounded-2xl bg-surface-container-high/30 p-4 text-sm text-on-surface-variant leading-relaxed italic">
                    "{selectedReport.detailedReason}"
                  </div>
                </div>

                {#if selectedReport.evidenceLinks && selectedReport.evidenceLinks.length > 0}
                  <div class="space-y-2">
                    <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Preuves</p>
                    <div class="flex flex-wrap gap-2">
                      {#each selectedReport.evidenceLinks as link}
                        <a href={link} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 rounded-xl bg-on-surface/5 px-4 py-2 text-xs font-bold text-primary transition-all hover:bg-primary/10">
                          <Papicon icon="external-link" size={14} />
                          Lien de preuve
                        </a>
                      {/each}
                    </div>
                  </div>
                {/if}

                {#if selectedReport.additionalNotes}
                  <div class="space-y-2">
                    <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Notes complémentaires</p>
                    <p class="text-xs text-on-surface-variant/70 leading-relaxed">{selectedReport.additionalNotes}</p>
                  </div>
                {/if}

                <div class="pt-4 flex flex-col items-center gap-4 border-t border-outline-variant/10">
                  <p class="text-[10px] font-bold text-on-surface-variant/30 text-center">Rapport créé par @{selectedReport.createdByTag || selectedReport.createdByUserId}</p>
                  
                  {#if selectedReport.createdByUserId === authStore.user?.userId || authStore.isAdmin}
                    <button
                      onclick={() => startEditingReport(selectedReport)}
                      class="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[10px] font-black text-on-primary uppercase tracking-widest transition-all hover:bg-primary-container hover:scale-[1.02] active:scale-[0.98] shadow-xs cursor-pointer"
                    >
                      <Papicon icon="edit-3" size={14} />
                      Modifier le rapport
                    </button>
                  {/if}
                </div>
              </div>
            {/if}

          {:else}
            <div class="flex flex-col items-center justify-center py-10 text-center">
              <div class="h-16 w-16 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4">
                <Papicon icon="alert-triangle" size={32} />
              </div>
              <p class="text-sm font-black text-on-surface-variant">Rapport détaillé manquant</p>
              <p class="text-xs text-on-surface-variant/40 mt-1 max-w-xs">La sanction a été enregistrée mais le rapport détaillé n'a pas encore été rédigé par le modérateur.</p>
            </div>
          {/if}

          <button
            onclick={() => viewingReportSanctionId = null}
            class="w-full mt-8 py-4 rounded-2xl bg-on-surface/5 text-sm font-black uppercase tracking-widest text-on-surface-variant transition-all hover:bg-on-surface/10 hover:text-on-surface"
          >
            Fermer les détails
          </button>
        </div>
      </div>
    {/if}

  </div>
{/if}

