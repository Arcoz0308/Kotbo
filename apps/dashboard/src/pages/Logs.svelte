<script lang="ts">
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { refreshDashboardOnMount } from '../lib/dashboardLifecycle';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import MemberCaseModal from '../lib/components/MemberCaseModal.svelte';
  import ColumnSortFilter, { type ColumnFilterOption } from '../lib/components/sanctions/ColumnSortFilter.svelte';
  import { fetchMemberCase, runMemberCaseAction, updateGlobalSettings, updateModuleStatus, fetchFeatureConfigurations, updateFeatureConfiguration } from '../lib/api';
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import FormSelect from '../lib/components/FormSelect.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import RolePermissionSettings from '../lib/components/RolePermissionSettings.svelte';


  type LogsSortField = 'date' | 'user' | 'module' | 'action' | 'type';


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
      isSuspectedDC: boolean;
    } | null;
    invite: {
      code: string | null;
      inviterId: string | null;
      inviterTag: string | null;
      joinedAt: string | null;
    } | null;
    roles: Array<{ id: string; name: string; mention: string; permissions: string[] }>;
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
      recentMessages: Array<{ id: string; channelId: string; channelName: string; content: string; dateIso: string }>;
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
  };

  let searchQuery = $state('');
  let filters = $state({
    users: [] as string[],
    modules: [] as string[],
    actions: [] as string[],
    types: [] as string[],
    channels: [] as string[],
  });
  let caseModalOpen = $state(false);
  let selectedCaseUser = $state<{ name: string; id: string | null } | null>(null);

  let selectedCaseData = $state<MemberCaseResponse | null>(null);
  let selectedCaseLoading = $state(false);
  let selectedCaseError = $state('');
  let memberActionReason = $state('Action lancée depuis le profil membre.');
  let memberActionDuration = $state('30m');
  let memberActionBusy = $state(false);
  let memberActionFeedback = $state('');
  let memberActionIsError = $state(false);
  let sortField = $state<LogsSortField>('date');
  let sortDirection = $state<'asc' | 'desc'>('desc');

  const saveAction = createAsyncActionState();
  const canManageSettings = $derived(
    !!dashboardStore.state.featureAccess?.logs?.canConfigure
      || !!dashboardStore.state.featureAccess?.settings?.canConfigure
      || !!dashboardStore.state.access?.canManageSettings
  );

  let selectedLogChannelId = $state('');

  $effect(() => {
    selectedLogChannelId = dashboardStore.state.logChannelId || '';
  });

  let logsConfig = $state<any>(null);
  let loadingConfig = $state(false);

  onMount(async () => {
    loadingConfig = true;
    try {
      const configs = await fetchFeatureConfigurations();
      logsConfig = configs?.features?.find((c: any) => c.featureKey === 'logs') || null;
    } catch (err) {
      console.error('Error fetching logs config:', err);
    } finally {
      loadingConfig = false;
    }
  });

  async function toggleConfig(key: string, value: boolean) {
    if (!logsConfig) return;
    
    await saveAction.run(async () => {
      const ok = await updateFeatureConfiguration('logs', { [key]: value });
      if (!ok) throw new Error('Erreur API');
      logsConfig[key] = value;
      return true;
    }, { successMessage: 'Configuration mise à jour.' });
  }

  async function handleLogChannelChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const channelId = target.value || '';
    
    await saveAction.run(async () => {
      const ok = await updateGlobalSettings({ logChannelId: channelId });
      if (!ok) throw new Error('Erreur API');
      
      // Also update the feature config channelId if logsConfig exists
      if (logsConfig) {
        await updateFeatureConfiguration('logs', { channelId });
        logsConfig.channelId = channelId;
      }

      await dashboardStore.refresh();
      return true;
    }, { successMessage: 'Salon de logs mis à jour.' });
  }

  // Filter to only Discord logs
  const discordLogs = $derived(dashboardStore.state.auditTrail.filter(entry => entry.source === 'discord'));

  function extractUserIdFromText(value: string | null | undefined) {
    if (!value) return null;

    const mentionMatch = value.match(/<@!?(\d{15,25})>/);
    if (mentionMatch?.[1]) return mentionMatch[1];

    const parenthesizedIdMatch = value.match(/\((\d{15,25})\)/);
    if (parenthesizedIdMatch?.[1]) return parenthesizedIdMatch[1];

    return null;
  }

  function hideUserIds(value: string) {
    return value
      .replace(/\(<@!?\d{15,25}>\)/g, '')
      .replace(/<@!?\d{15,25}>/g, '@utilisateur')
      .replace(/\((\d{15,25})\)/g, '');
  }

  function replaceEntityMentions(value: string) {
    return value
      .replace(/<#(\d{15,25})>/g, (_, channelId: string) => {
        const channel = dashboardStore.state.discordChannels.find((entry) => entry.id === channelId);
        const name = channel ? channel.name : 'salon-inconnu';
        return `<a href="https://discord.com/channels/${authStore.selectedGuildId}/${channelId}" target="_blank" class="mention-link">#${name}</a>`;
      })
      .replace(/<@&(\d{15,25})>/g, (_, roleId: string) => {
        const role = dashboardStore.state.discordRoles.find((entry) => entry.id === roleId);
        const name = role ? role.name : 'role-inconnu';
        return `<span class="mention">@${name}</span>`;
      });
  }

  function parseDetailsMetadata(details: string, user?: string) {
    const userMatch = details.match(/^([^|]+?\(<@!?\d{15,25}>\))/);
    const userIdMatch = extractUserIdFromText(details) ?? extractUserIdFromText(user);
    const channelMatch = details.match(/Salon:\s*<#(\d+)>/i);

    let cleanDetails = details;
    if (userMatch) {
      cleanDetails = cleanDetails.replace(userMatch[0], '').trim();
    }
    // Remove salon info from details once it is displayed in its own column.
    cleanDetails = cleanDetails.replace(/\|?\s*Salon:\s*<#\d+>\s*/gi, '');
    cleanDetails = cleanDetails.replace(/^\|\s*/, '').trim();
    cleanDetails = cleanDetails.replace(/\s*\|\s*/g, ' | ').trim();

    return {
      extractedUser: userMatch?.[1]?.trim() ?? null,
      extractedUserId: userIdMatch,
      extractedChannelId: channelMatch?.[1] ?? null,
      cleanDetails: replaceEntityMentions(hideUserIds(cleanDetails)),
    };
  }

  function getLogChannelId(entry: { details: string; channelId: string | null }) {
    return parseDetailsMetadata(entry.details, '').extractedChannelId ?? entry.channelId;
  }

  function displayUser(entry: { user: string; details: string }) {
    const parsed = parseDetailsMetadata(entry.details, entry.user);
    if (!parsed.extractedUser) {
      return hideUserIds(entry.user).trim() || entry.user;
    }
    const normalized = parsed.extractedUser.replace(/\s*\(<@!?\d{15,25}>\)\s*$/, '').trim();
    return normalized || hideUserIds(entry.user).trim() || entry.user;
  }

  const uniqueUsers = $derived([...new Set(discordLogs.map((entry) => displayUser(entry)))].sort((a, b) => a.localeCompare(b, 'fr')));
  const uniqueModules = $derived([...new Set(discordLogs.map((entry) => entry.module))].sort((a, b) => a.localeCompare(b, 'fr')));
  const uniqueActions = $derived([...new Set(discordLogs.map((entry) => entry.action))].sort((a, b) => a.localeCompare(b, 'fr')));
  const uniqueTypes = $derived([...new Set(discordLogs.map((entry) => entry.eventType))].sort((a, b) => a.localeCompare(b, 'fr')));
  const uniqueChannels = $derived(
    [...new Set(discordLogs.map((entry) => getLogChannelId(entry)).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'fr'))
  );

  const userFilterOptions = $derived<ColumnFilterOption[]>(
    uniqueUsers.map((user) => ({ value: user, label: user }))
  );
  const moduleFilterOptions = $derived<ColumnFilterOption[]>(
    uniqueModules.map((moduleName) => ({ value: moduleName, label: moduleName }))
  );
  const actionFilterOptions = $derived<ColumnFilterOption[]>(
    uniqueActions.map((actionName) => ({ value: actionName, label: actionName }))
  );
  const typeFilterOptions = $derived<ColumnFilterOption[]>(
    uniqueTypes.map((eventType) => ({ value: eventType, label: eventType }))
  );
  const channelFilterOptions = $derived<ColumnFilterOption[]>(
    uniqueChannels.map((channelId) => ({ value: channelId, label: formatChannelLabel(channelId) }))
  );

  const hasActiveFiltersOrSort = $derived(
    filters.users.length > 0
      || filters.modules.length > 0
      || filters.actions.length > 0
      || filters.types.length > 0
      || filters.channels.length > 0
      || sortField !== 'date'
      || sortDirection !== 'desc'
  );

  function toggleFilter(filterType: 'users' | 'modules' | 'actions' | 'types' | 'channels', value: string) {
    const list = filters[filterType];
    if (list.includes(value)) {
      filters[filterType] = list.filter((entry) => entry !== value);
      return;
    }
    filters[filterType] = [...list, value];
  }

  function toggleSort(field: LogsSortField) {
    if (sortField === field) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      return;
    }
    sortField = field;
    sortDirection = 'asc';
  }

  function sortDirectionFor(field: LogsSortField) {
    return sortField === field ? sortDirection : null;
  }

  function resetFiltersAndSort() {
    filters = {
      users: [],
      modules: [],
      actions: [],
      types: [],
      channels: [],
    };
    sortField = 'date';
    sortDirection = 'desc';
  }

  function formatChannelLabel(channelId: string | null | undefined) {
    if (!channelId) return 'Non spécifié';
    const channel = dashboardStore.state.discordChannels.find((item) => item.id === channelId);
    if (!channel) return 'Canal inconnu';
    return `#${channel.name}`;
  }

  function formatDateTime(value: string | null | undefined) {
    if (!value) return 'Inconnu';
    return new Date(value).toLocaleString('fr-FR');
  }

  function formatDurationFromSeconds(seconds: number | null | undefined) {
    if (!seconds || seconds <= 0) return '0 seconde';
    const totalSeconds = Math.floor(seconds);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const parts: string[] = [];
    if (days) parts.push(`${days} jour${days > 1 ? 's' : ''}`);
    if (hours) parts.push(`${hours} heure${hours > 1 ? 's' : ''}`);
    if (minutes) parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
    if (parts.length === 0) parts.push(`${totalSeconds} seconde${totalSeconds > 1 ? 's' : ''}`);
    return parts.join(' ');
  }

  function parseDurationToMs(input: string) {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) return null;
    const match = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(s|sec|secs|seconde|secondes|m|min|mins|minute|minutes|h|heure|heures|d|j|jour|jours|w|semaine|semaines)$/i);
    if (!match) return null;
    const value = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return null;
    const unit = match[2].toLowerCase();
    const unitMs: Record<string, number> = {
      s: 1000,
      sec: 1000,
      secs: 1000,
      seconde: 1000,
      secondes: 1000,
      m: 60 * 1000,
      min: 60 * 1000,
      mins: 60 * 1000,
      minute: 60 * 1000,
      minutes: 60 * 1000,
      h: 60 * 60 * 1000,
      heure: 60 * 60 * 1000,
      heures: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
      j: 24 * 60 * 60 * 1000,
      jour: 24 * 60 * 60 * 1000,
      jours: 24 * 60 * 60 * 1000,
      w: 7 * 24 * 60 * 60 * 1000,
      semaine: 7 * 24 * 60 * 60 * 1000,
      semaines: 7 * 24 * 60 * 60 * 1000,
    };
    return Math.round(value * (unitMs[unit] ?? 0)) || null;
  }

  function sanitizeLogSnippet(value: string) {
    return value.replace(/^Contenu:\s*/i, '').replace(/^\s+|\s+$/g, '');
  }

  async function loadMemberCase(userId: string) {
    selectedCaseLoading = true;
    selectedCaseError = '';
    try {
      selectedCaseData = await fetchMemberCase(userId);
    } catch (error) {
      selectedCaseError = error instanceof Error ? error.message : 'Impossible de charger le profil membre.';
      selectedCaseData = null;
    } finally {
      selectedCaseLoading = false;
    }
  }

  async function executeMemberAction(action: 'WARN' | 'KICK' | 'TIMEOUT' | 'BAN') {
    if (!selectedCaseUser?.id) return;

    const reason = memberActionReason.trim() || 'Action lancée depuis le profil membre.';
    const durationMs = action === 'TIMEOUT' ? parseDurationToMs(memberActionDuration) : null;

    if (action === 'TIMEOUT' && !durationMs) {
      memberActionFeedback = 'La durée du timeout est invalide.';
      memberActionIsError = true;
      return;
    }

    memberActionBusy = true;
    memberActionFeedback = '';
    memberActionIsError = false;

    try {
      await runMemberCaseAction(selectedCaseUser.id, action, { reason, durationMs: durationMs ?? undefined });
      memberActionFeedback = 'Action appliquée avec succès.';
      await loadMemberCase(selectedCaseUser.id);
    } catch (error) {
      memberActionIsError = true;
      memberActionFeedback = error instanceof Error ? error.message : 'L’action de modération a échoué.';
    } finally {
      memberActionBusy = false;
    }
  }

  function openCaseModal(entry: { user: string; details: string; action: string }) {
    const parsed = parseDetailsMetadata(entry.details, entry.user);
    selectedCaseUser = {
      name: displayUser(entry),
      id: parsed.extractedUserId,
    };
    selectedCaseData = null;
    selectedCaseError = '';
    memberActionReason = `Action liée au log: ${entry.action}`;
    memberActionDuration = '30m';
    memberActionFeedback = '';
    memberActionIsError = false;
    caseModalOpen = true;

    if (parsed.extractedUserId) {
      void loadMemberCase(parsed.extractedUserId);
    }
  }

  function closeCaseModal() {
    caseModalOpen = false;
    selectedCaseUser = null;
    selectedCaseData = null;
    selectedCaseError = '';
  }

  const sanctions = $derived(dashboardStore.state.sanctions || []);
  const selectedCaseSanctions = $derived.by(() => {
    if (selectedCaseData?.sanctions) {
      return [...selectedCaseData.sanctions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    if (!selectedCaseUser?.id) return [];
    return sanctions
      .filter((entry) => entry.targetUserId === selectedCaseUser.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });

  const filteredLogs = $derived(
    [...discordLogs]
    .filter(log => {
      const matchesSearch = searchQuery === '' || 
        log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.module.toLowerCase().includes(searchQuery.toLowerCase()) ||
        displayUser(log).toLowerCase().includes(searchQuery.toLowerCase());
      const matchesModule = filters.modules.length === 0 || filters.modules.includes(log.module);
      const matchesAction = filters.actions.length === 0 || filters.actions.includes(log.action);
      const matchesType = filters.types.length === 0 || filters.types.includes(log.eventType);
      const matchesUser = filters.users.length === 0 || filters.users.includes(displayUser(log));
      const matchesChannel = filters.channels.length === 0 || filters.channels.includes(getLogChannelId(log) ?? '');
      return matchesSearch && matchesModule && matchesAction && matchesType && matchesUser && matchesChannel;
    })
    .sort((left, right) => {
      let result = 0;
      switch (sortField) {
        case 'date':
          result = new Date(left.dateIso).getTime() - new Date(right.dateIso).getTime();
          break;
        case 'user':
          result = displayUser(left).localeCompare(displayUser(right), 'fr');
          break;
        case 'module':
          result = left.module.localeCompare(right.module, 'fr');
          break;
        case 'action':
          result = left.action.localeCompare(right.action, 'fr');
          break;
        case 'type':
          result = left.eventType.localeCompare(right.eventType, 'fr');
          break;
      }
      return sortDirection === 'asc' ? result : -result;
    })
  );

  const stats = $derived([
    { label: 'Événements Discord', val: discordLogs.length, sub: 'Total', subClass: 'text-blue-500' },
    { label: 'Modules', val: new Set(discordLogs.map(l => l.module)).size, sub: 'Sources', subClass: 'text-green-600' },
    { label: 'Utilisateurs', val: new Set(discordLogs.map(l => l.user)).size, sub: 'Unique', subClass: 'text-purple-600' }
  ]);
</script>


<ModulePage 
  title="Logs Discord" 
  description="Tous les événements serveur pour {dashboardStore.state.guildName}." 
  icon="List"
  featureKey="logs"
>
  {#snippet actions()}
    <RefreshButton
      onClick={() => dashboardStore.refresh()}
      loading={dashboardStore.state.loading}
      label="Actualiser"
      className="px-5 py-2.5 font-bold shadow-lg shadow-primary/10"
      iconClass="text-lg"
    />
  {/snippet}

{#if canManageSettings}
<div class="bg-surface-container-low/30 p-8 rounded-[2.5rem] border border-outline-variant/10 mb-10 space-y-6 animate-in fade-in duration-500">
  <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
    <div class="flex items-center gap-4">
      <div class="bg-primary/10 p-3 rounded-2xl text-primary">
        <Papicon icon="Settings" size={24} />
      </div>
      <div>
        <h3 class="text-sm font-black uppercase tracking-widest text-on-surface">Configuration des Logs</h3>
        <p class="text-xs text-on-surface-variant/70 mt-1">Définissez le salon Discord où le bot enverra les logs d'activité.</p>
      </div>
    </div>
    <div class="w-full md:w-72">
      <FormSelect
        bind:value={selectedLogChannelId}
        onchange={handleLogChannelChange}
        className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all"
      >
        <option value="">Sélectionner un salon</option>
        {#each dashboardStore.state.discordChannels as c}
          <option value={c.id}>#{c.name}</option>
        {/each}
      </FormSelect>
    </div>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-6 border-t border-outline-variant/10">
    <div class="flex items-center justify-between p-4 rounded-2xl bg-surface-container-low/50 border border-outline-variant/10">
      <div>
        <p class="text-[10px] font-black uppercase tracking-widest text-on-surface">Journalisation</p>
        <p class="text-[9px] text-on-surface-variant/60 mt-0.5">Activer l'audit global</p>
      </div>
      <ToggleSwitch 
        checked={logsConfig?.loggingEnabled ?? true} 
        disabled={loadingConfig}
        onToggle={() => toggleConfig('loggingEnabled', !(logsConfig?.loggingEnabled ?? true))} 
      />
    </div>

    <div class="flex items-center justify-between p-4 rounded-2xl bg-surface-container-low/50 border border-outline-variant/10">
      <div>
        <p class="text-[10px] font-black uppercase tracking-widest text-on-surface">Suivi d'activité</p>
        <p class="text-[9px] text-on-surface-variant/60 mt-0.5">Tracking des actions</p>
      </div>
      <ToggleSwitch 
        checked={logsConfig?.userActivityTracking ?? true} 
        disabled={loadingConfig}
        onToggle={() => toggleConfig('userActivityTracking', !(logsConfig?.userActivityTracking ?? true))} 
      />
    </div>

    <div class="flex items-center justify-between p-4 rounded-2xl bg-surface-container-low/50 border border-outline-variant/10">
      <div>
        <p class="text-[10px] font-black uppercase tracking-widest text-on-surface">Notifs Salon</p>
        <p class="text-[9px] text-on-surface-variant/60 mt-0.5">Alertes dans le salon logs</p>
      </div>
      <ToggleSwitch 
        checked={logsConfig?.notifyViaDiscordChannel ?? true} 
        disabled={loadingConfig}
        onToggle={() => toggleConfig('notifyViaDiscordChannel', !(logsConfig?.notifyViaDiscordChannel ?? true))} 
      />
    </div>

    <div class="flex items-center justify-between p-4 rounded-2xl bg-surface-container-low/50 border border-outline-variant/10">
      <div>
        <p class="text-[10px] font-black uppercase tracking-widest text-on-surface">Notifs MP</p>
        <p class="text-[9px] text-on-surface-variant/60 mt-0.5">Alertes staff par MP</p>
      </div>
      <ToggleSwitch 
        checked={logsConfig?.notifyViaDM ?? false} 
        disabled={loadingConfig}
        onToggle={() => toggleConfig('notifyViaDM', !(logsConfig?.notifyViaDM ?? false))} 
      />
    </div>
  </div>
  
  {#if logsConfig}
  <div class="pt-8 border-t border-outline-variant/10">
    <RolePermissionSettings 
      featureKey="logs" 
      roleAccess={logsConfig.roleAccessByRole} 
    />
  </div>
  {/if}

  {#if saveAction.state.message}
    <p class="text-xs font-bold text-emerald-600 ml-1">{saveAction.state.message}</p>
  {/if}
</div>
{/if}


<div class="section-card p-6 mb-8 font-inter">
  <div class="flex flex-col md:flex-row md:items-center gap-4 justify-between">
    <div class="space-y-2 w-full md:max-w-2xl">
      <label class="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest ml-1" for="search">Recherche</label>
      <div class="relative">
        <Papicon icon="search" size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <FormInput
          id="search"
          type="text"
          bind:value={searchQuery}
          placeholder="Action, détails, module, utilisateur..."
          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-primary/20 transition-all"
        />
      </div>
    </div>

    <div class="flex items-center gap-3">
      <span class="text-xs font-bold text-on-surface-variant">{filteredLogs.length} / {discordLogs.length} événement(s)</span>
      {#if hasActiveFiltersOrSort}
        <button
          type="button"
          onclick={resetFiltersAndSort}
          class="text-xs font-bold text-primary hover:text-primary/80 transition"
        >
          Réinitialiser filtres et tri
        </button>
      {/if}
    </div>
  </div>
</div>


<div class="section-card-flush font-inter">
  <div class="overflow-x-auto">
    <table class="w-full text-left border-collapse">
      <thead>
        <tr class="bg-slate-50 dark:bg-white/5">
          <th class="px-6 py-5">
            <ColumnSortFilter
              label="Horodatage"
              sortDirection={sortDirectionFor('date')}
              onToggleSort={() => toggleSort('date')}
            />
          </th>
          <th class="px-6 py-5">
            <ColumnSortFilter
              label="Utilisateur"
              sortDirection={sortDirectionFor('user')}
              onToggleSort={() => toggleSort('user')}
              options={userFilterOptions}
              selectedValues={filters.users}
              onToggleValue={(value) => toggleFilter('users', value)}
              searchable={true}
            />
          </th>
          <th class="px-6 py-5">
            <ColumnSortFilter
              label="Salon"
              options={channelFilterOptions}
              selectedValues={filters.channels}
              onToggleValue={(value) => toggleFilter('channels', value)}
              searchable={true}
            />
          </th>
          <th class="px-6 py-5">
            <ColumnSortFilter
              label="Module / Source"
              sortDirection={sortDirectionFor('module')}
              onToggleSort={() => toggleSort('module')}
              options={moduleFilterOptions}
              selectedValues={filters.modules}
              onToggleValue={(value) => toggleFilter('modules', value)}
            />
          </th>
          <th class="px-6 py-5">
            <ColumnSortFilter
              label="Action"
              sortDirection={sortDirectionFor('action')}
              onToggleSort={() => toggleSort('action')}
              options={actionFilterOptions}
              selectedValues={filters.actions}
              onToggleValue={(value) => toggleFilter('actions', value)}
              searchable={true}
            />
          </th>
          <th class="px-6 py-5 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Détails</th>
          <th class="px-6 py-5">
            <div class="flex justify-center">
              <ColumnSortFilter
                label="Type"
                sortDirection={sortDirectionFor('type')}
                onToggleSort={() => toggleSort('type')}
                options={typeFilterOptions}
                selectedValues={filters.types}
                onToggleValue={(value) => toggleFilter('types', value)}
              />
            </div>
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-50 dark:divide-slate-800">
        {#each filteredLogs as entry}
          <tr class="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
            <td class="px-6 py-6">
              <div class="text-xs">
                <p class="font-bold text-slate-800 dark:text-slate-200">{new Date(entry.dateIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
                <p class="text-[10px] text-slate-400 font-medium">{new Date(entry.dateIso).toLocaleDateString()}</p>
              </div>
            </td>
            <td class="px-6 py-6">
              <button
                type="button"
                onclick={() => openCaseModal(entry)}
                class="inline-flex max-w-40 truncate rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-700 hover:border-primary/50 hover:text-primary transition dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                title="Ouvrir le casier"
              >
                {displayUser(entry)}
              </button>
            </td>
            <td class="px-6 py-6 max-w-xs">
              <span class="text-xs text-slate-600 dark:text-slate-300">
                {formatChannelLabel(getLogChannelId(entry))}
              </span>
            </td>
            <td class="px-6 py-6 font-bold text-sm text-primary">
              {entry.module}
            </td>
            <td class="px-6 py-6 font-medium text-sm text-slate-600 dark:text-slate-200">
              {entry.action}
            </td>
            <td class="px-6 py-6 max-w-xs">
              <p class="text-xs text-on-surface-variant line-clamp-2 leading-relaxed">
                {@html parseDetailsMetadata(entry.details, entry.user).cleanDetails}
              </p>
            </td>
            <td class="px-6 py-6 text-center">
              <span class="inline-flex items-center justify-center w-24 px-3 py-1 rounded-full text-[10px] font-bold 
                {entry.eventType === 'Automatique' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}">
                {entry.eventType}
              </span>
            </td>
          </tr>
        {/each}

        {#if filteredLogs.length === 0}
          <tr>
            <td colspan="7" class="px-6 py-20 text-center text-on-surface-variant opacity-50">
              <Papicon icon="history" size={40} class="mb-2 mx-auto" />
              <p class="text-sm font-medium">Aucun événement Discord ne correspond à votre recherche</p>
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>


<div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 font-inter">
  {#each stats as kpi}
    <div class="bg-surface-container-low p-6 rounded-2xl border border-outline-variant/10">
      <p class="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{kpi.label}</p>
      <div class="flex items-end justify-between mt-2">
        <p class="text-3xl font-extrabold text-on-surface">{kpi.val}</p>
        <span class="text-[10px] font-bold {kpi.subClass}">{kpi.sub}</span>
      </div>
    </div>
  {/each}
</div>

{#if caseModalOpen && selectedCaseUser}
  <MemberCaseModal
    open={caseModalOpen}
    userName={selectedCaseUser.name}
    userId={selectedCaseUser.id}
    caseData={selectedCaseData}
    loading={selectedCaseLoading}
    error={selectedCaseError}
    bind:actionReason={memberActionReason}
    bind:actionDuration={memberActionDuration}
    actionBusy={memberActionBusy}
    actionFeedback={memberActionFeedback}
    actionIsError={memberActionIsError}
    onClose={closeCaseModal}
    onAction={(action) => executeMemberAction(action)}
  />
{/if}

</ModulePage>

