<script lang="ts">
  import { channelDisplayName } from '../lib/channelUtils';
  import { onMount, onDestroy, untrack } from 'svelte';
  import { router } from 'tinro';
  import { resolveTabFromUrl, gotoTab } from '../lib/tabRouting';
  import { unsavedChanges } from '../lib/stores/unsavedChanges.svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { fetchLinkedAccounts, updateLinkedAccountStatus, deleteLinkedAccount, fetchMemberCase, fetchFeatureConfigurations, updateFeatureConfiguration, scanSuspectedDetections, fetchSuspectedDetections, fetchChannelsManagementConfig, updateChannelsManagementConfig, linkDetectedAccount, dismissDetection } from '../lib/api';
  import { toast } from '../lib/stores/toast.svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import MemberCaseModal from '../lib/components/MemberCaseModal.svelte';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import RolePermissionSettings from '../lib/components/RolePermissionSettings.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import SearchableSelect from '../lib/components/SearchableSelect.svelte';
  import LoadingHint from '../lib/components/LoadingHint.svelte';

  // ── Tabs ──
  type Tab = 'links' | 'detections' | 'verification' | 'config';
  const daTabs = ['links', 'detections', 'verification', 'config'] as const;
  let activeTab = $state<Tab>('links');

  $effect(() => {
    const _path = $router.path;
    activeTab = resolveTabFromUrl('/double-accounts', daTabs, 'links') as Tab;
  });

  // ── Scanning ──
  let scanning = $state(false);
  let thresholdDays = $state(3);

  async function triggerRescan() {
    if (!authStore.selectedGuildId) return;
    scanning = true;
    try {
      const res = await scanSuspectedDetections(thresholdDays, authStore.selectedGuildId);
      if (res?.success) {
        toast.success(`Scan terminé : ${res.scannedCount} analysés, ${res.flaggedCount} suspectés.`);
      }
      await Promise.all([loadData(), loadDetections()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible de lancer le scan');
    } finally {
      scanning = false;
    }
  }

  // ── Linked Accounts ──
  let linkedAccounts = $state<any[]>([]);
  let loading = $state(true);
  let error = $state('');
  let filterStatus = $state<'ALL' | 'PENDING' | 'VALIDATED' | 'REJECTED'>('ALL');

  const filteredAccounts = $derived(
    Array.isArray(linkedAccounts)
      ? filterStatus === 'ALL' ? linkedAccounts : linkedAccounts.filter(a => a.status === filterStatus)
      : []
  );

  async function loadData() {
    loading = true;
    error = '';
    try { linkedAccounts = await fetchLinkedAccounts(); }
    catch (err: any) { error = err.message || 'Erreur chargement'; }
    finally { loading = false; }
  }

  // ── Detections ──
  type DetectionReason = { type: string; label: string; score: number; matchedUserId?: string; detail?: string };
  type SuspectedAlt = { userId: string; username: string | null; avatarUrl: string | null };
  type DetectionItem = {
    id: string; username: string | null; displayName: string | null; avatarUrl: string | null;
    isBot: boolean; accountCreatedAt: string | null; guildJoinedAt: string | null;
    guildLeftAt: string | null; lastSeenAt: string | null; messageCount: number;
    isOnServer: boolean; presenceStatus: string | null; accountAgeMs: number | null; accountAgeLabel: string;
    suspectedAlts: SuspectedAlt[];
    evidence: { reasons: DetectionReason[]; totalScore: number } | null;
  };

  let detections = $state<DetectionItem[]>([]);
  let loadingDetections = $state(true);
  let reportModalDetection = $state<DetectionItem | null>(null);

  const detectionStats = $derived({
    total: detections.length,
    onServer: detections.filter(d => d.isOnServer).length,
    left: detections.filter(d => !d.isOnServer).length,
  });

  function scoreColor(score: number): string {
    if (score >= 60) return 'text-rose-500';
    if (score >= 30) return 'text-amber-500';
    return 'text-yellow-500';
  }

  function scoreBg(score: number): string {
    if (score >= 60) return 'bg-rose-500/10 border-rose-500/20';
    if (score >= 30) return 'bg-amber-500/10 border-amber-500/20';
    return 'bg-yellow-500/10 border-yellow-500/20';
  }

  async function handleLinkDetection(detection: DetectionItem, altUserId: string) {
    await saveAction.run(async () => {
      const ok = await linkDetectedAccount(detection.id, altUserId);
      if (!ok) throw new Error('Erreur');
      await Promise.all([loadData(), loadDetections()]);
      return true;
    }, { successMessage: 'Comptes liés avec succès.' });
  }

  async function handleDismissDetection(detection: DetectionItem) {
    await saveAction.run(async () => {
      const ok = await dismissDetection(detection.id);
      if (!ok) throw new Error('Erreur');
      await loadDetections();
      return true;
    }, { successMessage: 'Détection ignorée.' });
  }

  async function loadDetections() {
    if (!authStore.selectedGuildId) return;
    loadingDetections = true;
    try {
      const res = await fetchSuspectedDetections(authStore.selectedGuildId);
      detections = res?.detections ?? [];
    } catch { detections = []; }
    finally { loadingDetections = false; }
  }

  function formatRelative(value: string | null) {
    if (!value) return 'Inconnue';
    const diffMs = Date.now() - new Date(value).getTime();
    if (Number.isNaN(diffMs)) return 'Inconnue';
    const minutes = Math.max(1, Math.floor(diffMs / 60000));
    if (minutes < 60) return `il y a ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `il y a ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `il y a ${days}j`;
    return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // ── Modal ──
  let modalOpen = $state(false);
  let selectedUserId = $state<string | null>(null);
  let selectedUserName = $state('');
  let caseData = $state<any>(null);
  let loadingCase = $state(false);
  let caseError = $state('');

  async function openMemberCase(userId: string, userName?: string) {
    selectedUserId = userId;
    selectedUserName = userName || 'Membre';
    modalOpen = true;
    loadingCase = true;
    caseData = null;
    caseError = '';
    try { caseData = await fetchMemberCase(userId); }
    catch (err: any) { caseError = err.message || 'Erreur chargement dossier'; }
    finally { loadingCase = false; }
  }

  // ── Config ──
  let doubleAccountsConfig = $state<any>(null);
  let workflowDraft = $state({ validationRoleId: '', sanctionRoleId: '', dsRoleId: '', autoDetectionEnabled: true });
  let savedConfig = $state({ enabled: false, validationRoleId: '', sanctionRoleId: '', dsRoleId: '', autoDetectionEnabled: true });
  const saveAction = createAsyncActionState();

  $effect(() => {
    if (!doubleAccountsConfig) return;
    const current = JSON.stringify({ enabled: doubleAccountsConfig.enabled, ...workflowDraft });
    const saved = JSON.stringify(savedConfig);
    if (current !== saved) {
      untrack(() => {
        unsavedChanges.register({
          label: 'Doubles Comptes',
          onSave: () => saveConfig(),
          onReset: () => {
            doubleAccountsConfig.enabled = savedConfig.enabled;
            workflowDraft = { validationRoleId: savedConfig.validationRoleId, sanctionRoleId: savedConfig.sanctionRoleId, dsRoleId: savedConfig.dsRoleId, autoDetectionEnabled: savedConfig.autoDetectionEnabled };
          }
        });
      });
    } else {
      untrack(() => { if (unsavedChanges.isDirty && unsavedChanges.pageLabel === 'Doubles Comptes') unsavedChanges.clear(); });
    }
  });

  onDestroy(() => { if (unsavedChanges.pageLabel === 'Doubles Comptes') unsavedChanges.clear(); });

  async function loadConfig() {
    try {
      const configs = await fetchFeatureConfigurations();
      doubleAccountsConfig = configs?.features?.find((c: any) => c.featureKey === 'double_accounts') || null;
      if (doubleAccountsConfig) {
        const m = doubleAccountsConfig.metadata || {};
        workflowDraft = { validationRoleId: m.validationRoleId || '', sanctionRoleId: m.sanctionRoleId || '', dsRoleId: m.dsRoleId || '', autoDetectionEnabled: m.autoDetectionEnabled ?? true };
        savedConfig = { enabled: doubleAccountsConfig.enabled, ...workflowDraft };
      }
    } catch {}
  }

  async function saveConfig(): Promise<boolean> {
    if (!doubleAccountsConfig) return false;
    let success = false;
    await saveAction.run(async () => {
      const ok = await updateFeatureConfiguration('double_accounts', {
        enabled: doubleAccountsConfig.enabled, channelId: doubleAccountsConfig.channelId, secondaryChannelId: doubleAccountsConfig.secondaryChannelId,
        requiredRoleId: doubleAccountsConfig.requiredRoleId, notificationRoleId: doubleAccountsConfig.notificationRoleId,
        notifyViaDiscordChannel: doubleAccountsConfig.notifyViaDiscordChannel, notifyViaDM: doubleAccountsConfig.notifyViaDM,
        loggingEnabled: doubleAccountsConfig.loggingEnabled, userActivityTracking: doubleAccountsConfig.userActivityTracking, metadata: workflowDraft,
      });
      if (!ok) throw new Error('Erreur API');
      await loadConfig();
      success = true;
      return true;
    }, { successMessage: 'Configuration mise à jour.' });
    return success;
  }

  async function handleUpdateStatus(id: string, status: 'VALIDATED' | 'REJECTED') {
    await saveAction.run(async () => {
      const updated = await updateLinkedAccountStatus(id, status);
      if (!updated) return false;
      await loadData();
      return true;
    }, { successMessage: 'Statut mis à jour.' });
  }

  async function handleDelete(id: string) {
    if (!confirm('Voulez-vous vraiment supprimer cette liaison ?')) return;
    await saveAction.run(async () => {
      const ok = await deleteLinkedAccount(id);
      if (!ok) return false;
      linkedAccounts = linkedAccounts.filter(a => a.id !== id);
      return true;
    }, { successMessage: 'Liaison supprimée.' });
  }

  // ── Verification Config ──
  let verifConfig = $state<{
    verificationEnabled: boolean; verificationMode: string; verificationAction: string;
    verificationChannelId: string | null; verificationRoleId: string | null; verificationLogChannelId: string | null;
    verificationEmbedTitle: string; verificationEmbedDesc: string; verificationEmbedColor: string; verificationOnJoin: boolean;
  } | null>(null);
  let deployingEmbed = $state(false);

  async function loadVerifConfig() {
    try {
      const data = await fetchChannelsManagementConfig();
      if (data) {
        verifConfig = {
          verificationEnabled: data.verificationEnabled ?? false, verificationMode: data.verificationMode ?? 'EMBED',
          verificationAction: data.verificationAction ?? 'NOTIFY_STAFF', verificationChannelId: data.verificationChannelId ?? null,
          verificationRoleId: data.verificationRoleId ?? null, verificationLogChannelId: data.verificationLogChannelId ?? null,
          verificationEmbedTitle: data.verificationEmbedTitle ?? 'Vérification de sécurité', verificationEmbedDesc: data.verificationEmbedDesc ?? '',
          verificationEmbedColor: data.verificationEmbedColor ?? '#5865F2', verificationOnJoin: data.verificationOnJoin ?? true,
        };
      }
    } catch {}
  }

  async function saveVerifConfig() {
    if (!verifConfig) return;
    await saveAction.run(async () => {
      const ok = await updateChannelsManagementConfig(verifConfig!);
      if (!ok) throw new Error('Erreur API');
      return true;
    }, { successMessage: 'Vérification mise à jour.' });
  }

  async function deployVerifEmbed() {
    if (!verifConfig?.verificationChannelId || !authStore.selectedGuildId) return;
    deployingEmbed = true;
    try {
      const res = await fetch(`${(import.meta.env.VITE_API_URL ?? '').trim().replace(/\/$/, '')}/api/verify/${authStore.selectedGuildId}/deploy`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authStore.token}` },
        body: JSON.stringify({ channelId: verifConfig.verificationChannelId }),
      });
      const data = await res.json();
      if (res.ok) toast.success('Embed de vérification envoyé.');
      else toast.error(data.error || 'Erreur lors de l\'envoi.');
    } catch { toast.error('Impossible de déployer l\'embed.'); }
    finally { deployingEmbed = false; }
  }

  onMount(() => {
    loadData(); loadDetections(); loadConfig(); loadVerifConfig();
  });
</script>

<ModulePage
  title="Doubles Comptes & Sécurité"
  description="Détections, liaisons de comptes et vérification de sécurité."
  icon="shield"
  featureKey="double_accounts"
>
  {#snippet actions()}
    <div class="flex items-center gap-2">
      <button
        onclick={triggerRescan}
        disabled={scanning || loading}
        class="flex items-center gap-1.5 bg-primary text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-all disabled:opacity-50"
      >
        {#if scanning}
          <div class="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
        {:else}
          <Papicon icon="ShieldAlert" size={13} />
        {/if}
        <span class="hidden sm:inline">Rescanner</span>
      </button>
      <RefreshButton onClick={() => { loadData(); loadDetections(); }} loading={loading} label="Actualiser" />
    </div>
  {/snippet}

  <!-- Tab Navigation -->
  <div class="flex gap-1 rounded-lg border border-outline-variant/10 bg-surface-container-low/70 p-1 mb-6 overflow-x-auto">
    {#each [
      { key: 'links', label: 'Liaisons', icon: 'Link2' },
      { key: 'detections', label: 'Détections', icon: 'ShieldAlert', count: detections.length },
      { key: 'verification', label: 'Vérification', icon: 'ShieldCheck' },
      { key: 'config', label: 'Configuration', icon: 'Settings' },
    ] as tab (tab.key)}
      <button
        onclick={() => gotoTab('/double-accounts', tab.key, 'links')}
        class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all whitespace-nowrap {activeTab === tab.key ? 'bg-surface text-primary shadow-sm' : 'text-on-surface-variant/50 hover:text-on-surface'}"
      >
        <Papicon icon={tab.icon} size={14} />
        <span>{tab.label}</span>
        {#if tab.count}
          <span class="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold {activeTab === tab.key ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-on-surface-variant/40'}">{tab.count}</span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- ═══ TAB: Liaisons ═══ -->
  {#if activeTab === 'links'}
    <div class="flex flex-wrap items-center gap-2 mb-6">
      {#each [
        { key: 'ALL', label: 'Tous', color: 'text-primary' },
        { key: 'PENDING', label: 'En attente', color: 'text-amber-500' },
        { key: 'VALIDATED', label: 'Validés', color: 'text-emerald-500' },
        { key: 'REJECTED', label: 'Rejetés', color: 'text-rose-500' },
      ] as f (f.key)}
        <button
          onclick={() => filterStatus = f.key as any}
          class="rounded-lg px-3 py-1.5 text-xs font-bold transition-all {filterStatus === f.key ? `bg-surface ${f.color} shadow-sm` : 'text-on-surface-variant/50 hover:text-on-surface'}"
        >
          {f.label}
        </button>
      {/each}
    </div>

    {#if loading}
      <div class="flex flex-col items-center py-20 gap-3">
        <div class="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent"></div>
        <p class="text-xs text-on-surface-variant/50">Chargement...</p>
        <LoadingHint context="data" />
      </div>
    {:else if error}
      <div class="rounded-lg border border-rose-500/20 bg-rose-500/5 p-6 text-center">
        <p class="text-rose-500 font-bold text-sm">{error}</p>
        <button onclick={loadData} class="mt-3 text-xs font-semibold text-primary">Réessayer</button>
      </div>
    {:else if filteredAccounts.length === 0}
      <div class="flex flex-col items-center py-20 text-center">
        <div class="h-14 w-14 rounded-xl bg-surface-container-low flex items-center justify-center text-on-surface-variant/20">
          <Papicon icon="link-2-off" size={28} />
        </div>
        <h3 class="mt-5 text-base font-bold text-on-surface">Aucune liaison</h3>
        <p class="mt-1 text-xs text-on-surface-variant/50 max-w-xs">
          {filterStatus === 'ALL' ? 'Aucun compte lié sur ce serveur.' : `Aucune liaison "${filterStatus}".`}
        </p>
      </div>
    {:else}
      <div class="space-y-3">
        {#each filteredAccounts as link (link.id)}
          <div class="rounded-xl border border-outline-variant/10 bg-surface-container-low/40 p-4 transition-all hover:border-primary/20">
            <!-- Header: status + date -->
            <div class="flex items-center justify-between mb-3">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider
                {link.status === 'VALIDATED' ? 'bg-emerald-500/10 text-emerald-500' : link.status === 'PENDING' ? 'bg-amber-500/10 text-amber-500' : 'bg-rose-500/10 text-rose-500'}">
                {link.status === 'VALIDATED' ? 'Validé' : link.status === 'PENDING' ? 'En attente' : 'Rejeté'}
              </span>
              <span class="text-[10px] text-on-surface-variant/30">{new Date(link.createdAt).toLocaleDateString('fr-FR')}</span>
            </div>

            <!-- Users link -->
            <div class="flex items-center gap-2 bg-surface-container-low/50 rounded-lg p-3 mb-3">
              <button onclick={() => openMemberCase(link.user1Id, link.user1.tag)} class="flex items-center gap-1.5 flex-1 min-w-0 text-sm font-semibold text-on-surface hover:text-primary transition-colors">
                {#if link.user1.avatar}<img src={link.user1.avatar} alt="" class="w-5 h-5 rounded-full shrink-0" />{/if}
                <span class="truncate">@{link.user1.tag}</span>
              </button>
              <Papicon icon="ArrowLeftRight" size={14} class="text-on-surface-variant/20 shrink-0" />
              <button onclick={() => openMemberCase(link.user2Id, link.user2.tag)} class="flex items-center justify-end gap-1.5 flex-1 min-w-0 text-sm font-semibold text-on-surface hover:text-primary transition-colors">
                <span class="truncate">@{link.user2.tag}</span>
                {#if link.user2.avatar}<img src={link.user2.avatar} alt="" class="w-5 h-5 rounded-full shrink-0" />{/if}
              </button>
            </div>

            {#if link.reason}
              <p class="text-[11px] text-on-surface-variant/60 italic mb-3 px-1">"{link.reason}"</p>
            {/if}

            <!-- Actions -->
            <div class="flex items-center gap-2 pt-3 border-t border-outline-variant/5">
              {#if link.status === 'PENDING'}
                <button onclick={() => handleUpdateStatus(link.id, 'VALIDATED')} disabled={saveAction.state.loading}
                  class="flex-1 py-2 rounded-lg bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center gap-1.5 disabled:opacity-50">
                  <Papicon icon="Check" size={12} /> Valider
                </button>
                <button onclick={() => handleUpdateStatus(link.id, 'REJECTED')} disabled={saveAction.state.loading}
                  class="flex-1 py-2 rounded-lg bg-rose-500/10 text-rose-500 text-[10px] font-bold uppercase tracking-wider hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-1.5 disabled:opacity-50">
                  <Papicon icon="X" size={12} /> Rejeter
                </button>
              {:else}
                <span class="flex-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/20">{link.type}</span>
                <button onclick={() => handleDelete(link.id)} disabled={saveAction.state.loading}
                  class="p-2 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors disabled:opacity-50" title="Supprimer">
                  <Papicon icon="Trash2" size={14} />
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}

  <!-- ═══ TAB: Détections ═══ -->
  {:else if activeTab === 'detections'}
    <!-- Stats -->
    <div class="grid grid-cols-3 gap-3 mb-6">
      <div class="rounded-lg border border-outline-variant/10 bg-surface-container-low/40 p-4 text-center">
        <p class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40">Suspects</p>
        <p class="mt-1 text-xl font-bold text-on-surface">{detectionStats.total}</p>
      </div>
      <div class="rounded-lg border border-outline-variant/10 bg-surface-container-low/40 p-4 text-center">
        <p class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40">Présents</p>
        <p class="mt-1 text-xl font-bold text-emerald-500">{detectionStats.onServer}</p>
      </div>
      <div class="rounded-lg border border-outline-variant/10 bg-surface-container-low/40 p-4 text-center">
        <p class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40">Partis</p>
        <p class="mt-1 text-xl font-bold text-amber-500">{detectionStats.left}</p>
      </div>
    </div>

    <!-- Scan controls -->
    <div class="flex flex-wrap items-center gap-3 mb-6 p-4 rounded-lg border border-outline-variant/10 bg-surface-container-low/30">
      <div class="flex items-center gap-2">
        <Papicon icon="SlidersHorizontal" size={14} class="text-on-surface-variant/40" />
        <label for="threshold" class="text-xs font-bold text-on-surface-variant/50">Seuil :</label>
        <select id="threshold" bind:value={thresholdDays} class="bg-transparent border-none text-xs font-bold text-on-surface focus:outline-none cursor-pointer">
          {#each Array.from({ length: 30 }, (_, i) => i + 1) as day}
            <option value={day} class="bg-surface">{day} {day > 1 ? 'jours' : 'jour'}</option>
          {/each}
        </select>
      </div>
      <button onclick={triggerRescan} disabled={scanning}
        class="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-lg text-xs font-bold hover:opacity-90 transition-all disabled:opacity-50">
        {#if scanning}
          <div class="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
          Scan...
        {:else}
          <Papicon icon="ShieldAlert" size={13} /> Rescanner
        {/if}
      </button>
    </div>

    {#if loadingDetections}
      <div class="flex flex-col items-center py-20 gap-3">
        <div class="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent"></div>
        <p class="text-xs text-on-surface-variant/50">Chargement...</p>
        <LoadingHint context="data" />
      </div>
    {:else if detections.length === 0}
      <div class="flex flex-col items-center py-20 text-center rounded-lg border border-outline-variant/10 bg-surface-container-low/30">
        <div class="h-14 w-14 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
          <Papicon icon="ShieldCheck" size={28} />
        </div>
        <h3 class="mt-5 text-base font-bold text-on-surface">Aucune détection</h3>
        <p class="mt-1 text-xs text-on-surface-variant/50 max-w-sm">Aucun membre suspect sur ce serveur.</p>
      </div>
    {:else}
      <div class="space-y-3">
        {#each detections as d (d.id)}
          <article class="rounded-xl border border-outline-variant/10 bg-surface-container-low/40 p-4 transition-all hover:border-primary/20">
            <div class="flex items-start gap-3">
              {#if d.avatarUrl}
                <img src={d.avatarUrl} alt="" class="h-10 w-10 rounded-lg object-cover shrink-0" />
              {:else}
                <div class="h-10 w-10 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant/30 shrink-0">
                  <Papicon icon="User" size={18} />
                </div>
              {/if}
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-1.5">
                  <h4 class="text-sm font-bold text-on-surface truncate">{d.displayName || d.username || d.id}</h4>
                  {#if d.evidence}
                    <span class="px-1.5 py-0.5 rounded text-[9px] font-bold border {scoreBg(d.evidence.totalScore)} {scoreColor(d.evidence.totalScore)}">
                      {d.evidence.totalScore}/100
                    </span>
                  {/if}
                  <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase {d.isOnServer ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-500/10 text-zinc-400'}">
                    {d.isOnServer ? 'Présent' : 'Parti'}
                  </span>
                </div>
                <p class="text-[11px] text-on-surface-variant/50 mt-0.5">@{d.username || 'inconnu'} · {d.id}</p>
                <p class="text-xs text-amber-500 font-bold mt-1.5">{d.accountAgeLabel}</p>

                <!-- Suspected alts inline -->
                {#if d.suspectedAlts && d.suspectedAlts.length > 0}
                  <div class="flex flex-wrap items-center gap-1.5 mt-2">
                    <Papicon icon="Link2" size={11} class="text-on-surface-variant/30" />
                    <span class="text-[10px] font-bold text-on-surface-variant/40">Alt(s) :</span>
                    {#each d.suspectedAlts as alt}
                      <button onclick={() => openMemberCase(alt.userId, alt.username || alt.userId)}
                        class="flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-container-high/50 text-[10px] font-bold text-on-surface hover:text-primary transition-colors">
                        {#if alt.avatarUrl}<img src={alt.avatarUrl} alt="" class="w-3.5 h-3.5 rounded-full" />{/if}
                        @{alt.username || alt.userId}
                      </button>
                    {/each}
                  </div>
                {/if}

                <!-- Top reasons preview -->
                {#if d.evidence && d.evidence.reasons.length > 0}
                  <div class="mt-2 space-y-0.5">
                    {#each d.evidence.reasons.slice(0, 2) as r}
                      <p class="text-[10px] text-on-surface-variant/50"><span class="font-mono {scoreColor(r.score)}">{r.score}pts</span> {r.label.replace(/<@\d+>/g, (m) => { const alt = d.suspectedAlts?.find(a => m.includes(a.userId)); return alt?.username ? `@${alt.username}` : m; })}</p>
                    {/each}
                    {#if d.evidence.reasons.length > 2}
                      <p class="text-[10px] text-on-surface-variant/30">+{d.evidence.reasons.length - 2} signal(aux)...</p>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>

            <!-- Actions -->
            <div class="flex flex-wrap gap-2 mt-3 pt-3 border-t border-outline-variant/5">
              {#if d.suspectedAlts && d.suspectedAlts.length > 0}
                <button onclick={() => { const alt = d.suspectedAlts?.[0]; if (alt) handleLinkDetection(d, alt.userId); }}
                  disabled={saveAction.state.loading}
                  class="flex-1 py-2 rounded-lg bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 min-w-25">
                  <Papicon icon="Link2" size={12} /> Lier
                </button>
              {/if}
              <button onclick={() => reportModalDetection = d}
                class="flex-1 py-2 rounded-lg bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider hover:bg-primary hover:text-white transition-all flex items-center justify-center gap-1.5 min-w-25">
                <Papicon icon="FileSearch" size={12} /> Rapport
              </button>
              <button onclick={() => handleDismissDetection(d)}
                disabled={saveAction.state.loading}
                class="py-2 px-3 rounded-lg border border-outline-variant/10 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40 hover:text-on-surface hover:border-primary/20 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50">
                <Papicon icon="X" size={12} /> Ignorer
              </button>
            </div>
          </article>
        {/each}
      </div>
    {/if}

  <!-- ═══ TAB: Vérification ═══ -->
  {:else if activeTab === 'verification'}
    {#if verifConfig}
      <div class="space-y-6">
        <!-- Enable toggle -->
        <div class="flex items-center justify-between gap-4 p-4 rounded-xl border border-outline-variant/10 bg-surface-container-low/30">
          <div class="flex items-center gap-3">
            <div class="h-9 w-9 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0">
              <Papicon icon="ShieldCheck" size={18} />
            </div>
            <div>
              <p class="font-bold text-on-surface text-sm">Vérification de sécurité</p>
              <p class="text-xs text-on-surface-variant/50">Vérifie l'identité via Discord OAuth</p>
            </div>
          </div>
          <ToggleSwitch
            checked={verifConfig.verificationEnabled}
            onToggle={(v) => { verifConfig!.verificationEnabled = v; }}
            activeClass="bg-indigo-500"
          />
        </div>

        {#if verifConfig.verificationEnabled}
          <!-- Mode & Action -->
          <div class="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <label class="space-y-1.5">
              <span class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40">Mode d'envoi</span>
              <select bind:value={verifConfig.verificationMode} class="w-full rounded-lg border border-outline-variant/10 bg-surface-container-high/40 px-3 py-2.5 text-sm">
                <option value="DM">MP automatique</option>
                <option value="EMBED">Bouton embed</option>
              </select>
            </label>
            <label class="space-y-1.5">
              <span class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40">Action si DC détecté</span>
              <select bind:value={verifConfig.verificationAction} class="w-full rounded-lg border border-outline-variant/10 bg-surface-container-high/40 px-3 py-2.5 text-sm">
                <option value="NOTIFY_STAFF">Notifier le staff</option>
                <option value="AUTO_LINK">Lier automatiquement</option>
              </select>
            </label>
          </div>

          <!-- Channels & Roles -->
          <div class="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <label class="space-y-1.5">
              <span class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40">Salon de vérification</span>
              <SearchableSelect bind:value={verifConfig.verificationChannelId} options={dashboardStore.state.discordChannels.map(c => ({ id: c.id, name: channelDisplayName(c) }))} placeholder="Aucun salon" className="w-full rounded-lg border border-outline-variant/10 bg-surface-container-high/40 px-3 py-2.5 text-sm" />
            </label>
            <label class="space-y-1.5">
              <span class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40">Rôle vérifié</span>
              <SearchableSelect bind:value={verifConfig.verificationRoleId} options={dashboardStore.state.discordRoles.map(r => ({ id: r.id, name: `@${r.name}` }))} placeholder="Aucun rôle" className="w-full rounded-lg border border-outline-variant/10 bg-surface-container-high/40 px-3 py-2.5 text-sm" />
            </label>
            <label class="space-y-1.5">
              <span class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40">Salon de logs</span>
              <SearchableSelect bind:value={verifConfig.verificationLogChannelId} options={dashboardStore.state.discordChannels.map(c => ({ id: c.id, name: channelDisplayName(c) }))} placeholder="Par défaut" className="w-full rounded-lg border border-outline-variant/10 bg-surface-container-high/40 px-3 py-2.5 text-sm" />
            </label>
          </div>

          <!-- Embed customization -->
          <div class="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <label class="space-y-1.5">
              <span class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40">Titre de l'embed</span>
              <input type="text" bind:value={verifConfig.verificationEmbedTitle} maxlength="256" class="w-full rounded-lg border border-outline-variant/10 bg-surface-container-high/40 px-3 py-2.5 text-sm" />
            </label>
            <label class="space-y-1.5">
              <span class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40">Couleur</span>
              <div class="flex items-center gap-2">
                <input type="color" bind:value={verifConfig.verificationEmbedColor} class="h-9.5 w-9.5 rounded-lg border border-outline-variant/10 bg-transparent cursor-pointer shrink-0" />
                <input type="text" bind:value={verifConfig.verificationEmbedColor} maxlength="7" class="flex-1 rounded-lg border border-outline-variant/10 bg-surface-container-high/40 px-3 py-2.5 text-sm font-mono" />
              </div>
            </label>
          </div>

          <label class="space-y-1.5">
            <span class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40">Description</span>
            <textarea bind:value={verifConfig.verificationEmbedDesc} rows="3" maxlength="2048" class="w-full rounded-lg border border-outline-variant/10 bg-surface-container-high/40 px-3 py-2.5 text-sm resize-y"></textarea>
          </label>

          <!-- Auto on join -->
          <div class="flex items-center justify-between gap-4 p-4 rounded-lg border border-outline-variant/10 bg-surface-container-high/30">
            <div>
              <p class="font-bold text-on-surface text-sm">Vérification auto à l'arrivée</p>
              <p class="text-xs text-on-surface-variant/50">Envoie la vérification quand un membre rejoint.</p>
            </div>
            <ToggleSwitch
              checked={verifConfig.verificationOnJoin}
              onToggle={(v) => { verifConfig!.verificationOnJoin = v; }}
              activeClass="bg-indigo-500"
            />
          </div>

          <!-- Actions -->
          <div class="flex flex-wrap gap-2">
            <button onclick={saveVerifConfig}
              class="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-indigo-500 transition-all flex items-center gap-1.5">
              <Papicon icon="Save" size={13} /> Sauvegarder
            </button>
            {#if verifConfig.verificationMode === 'EMBED' && verifConfig.verificationChannelId}
              <button onclick={deployVerifEmbed} disabled={deployingEmbed}
                class="px-5 py-2.5 border border-indigo-500/20 text-indigo-400 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-indigo-500 hover:text-white transition-all disabled:opacity-50 flex items-center gap-1.5">
                {#if deployingEmbed}
                  <div class="h-3 w-3 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent"></div>
                  Envoi...
                {:else}
                  <Papicon icon="Send" size={13} /> Déployer l'embed
                {/if}
              </button>
            {/if}
          </div>
        {/if}
      </div>
    {:else}
      <div class="flex flex-col items-center py-20 gap-3">
        <div class="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent"></div>
        <p class="text-xs text-on-surface-variant/50">Chargement...</p>
      </div>
    {/if}

  <!-- ═══ TAB: Configuration ═══ -->
  {:else if activeTab === 'config'}
    {#if doubleAccountsConfig}
      <div class="space-y-6">
        <!-- Module toggle -->
        <div class="flex items-center justify-between gap-4 p-4 rounded-xl border border-outline-variant/10 bg-surface-container-low/30">
          <div class="flex items-center gap-3">
            <div class="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
              <Papicon icon="Users" size={18} />
            </div>
            <div>
              <p class="font-bold text-on-surface text-sm">Module Doubles Comptes</p>
              <p class="text-xs text-on-surface-variant/50">Active la détection et gestion des DC</p>
            </div>
          </div>
          <ToggleSwitch
            checked={doubleAccountsConfig.enabled}
            onToggle={(v) => (doubleAccountsConfig.enabled = v)}
            activeClass="bg-emerald-500"
          />
        </div>

        <!-- Roles -->
        <div class="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <label class="space-y-1.5">
            <span class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40">Rôle validation</span>
            <SearchableSelect bind:value={workflowDraft.validationRoleId} options={dashboardStore.state.discordRoles.map(r => ({ id: r.id, name: `@${r.name}` }))} placeholder="Aucun rôle" className="w-full rounded-lg border border-outline-variant/10 bg-surface-container-high/40 px-3 py-2.5 text-sm" />
          </label>
          <label class="space-y-1.5">
            <span class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40">Rôle sanction</span>
            <SearchableSelect bind:value={workflowDraft.sanctionRoleId} options={dashboardStore.state.discordRoles.map(r => ({ id: r.id, name: `@${r.name}` }))} placeholder="Aucun rôle" className="w-full rounded-lg border border-outline-variant/10 bg-surface-container-high/40 px-3 py-2.5 text-sm" />
          </label>
          <label class="space-y-1.5">
            <span class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40">Rôle DS</span>
            <SearchableSelect bind:value={workflowDraft.dsRoleId} options={dashboardStore.state.discordRoles.map(r => ({ id: r.id, name: `@${r.name}` }))} placeholder="Aucun rôle" className="w-full rounded-lg border border-outline-variant/10 bg-surface-container-high/40 px-3 py-2.5 text-sm" />
          </label>
        </div>

        <!-- Auto detection toggle -->
        <div class="flex items-center justify-between gap-4 p-4 rounded-lg border border-outline-variant/10 bg-surface-container-high/30">
          <div>
            <p class="font-bold text-on-surface text-sm">Détection automatique</p>
            <p class="text-xs text-on-surface-variant/50">Signale les comptes récents à l'arrivée.</p>
          </div>
          <ToggleSwitch
            checked={workflowDraft.autoDetectionEnabled}
            onToggle={(v) => (workflowDraft.autoDetectionEnabled = v)}
          />
        </div>

        <!-- Role permissions -->
        <div class="rounded-xl border border-outline-variant/10 bg-surface-container-low/30 p-5">
          <RolePermissionSettings
            featureKey="double_accounts"
            roleAccess={doubleAccountsConfig.roleAccessByRole}
          />
        </div>
      </div>
    {:else}
      <div class="flex flex-col items-center py-20 gap-3">
        <div class="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent"></div>
        <p class="text-xs text-on-surface-variant/50">Chargement...</p>
      </div>
    {/if}
  {/if}
</ModulePage>

<!-- Detection Report Modal -->
{#if reportModalDetection}
  {@const det = reportModalDetection}
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60" onclick={(e) => { if (e.target === e.currentTarget) reportModalDetection = null; }}>
    <div class="bg-surface border border-outline-variant/20 rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-xl animate-in slide-in-from-bottom-4 duration-300">
      <!-- Header -->
      <div class="sticky top-0 bg-surface border-b border-outline-variant/10 px-5 py-4 flex items-center justify-between z-10">
        <div class="flex items-center gap-3">
          {#if det.avatarUrl}
            <img src={det.avatarUrl} alt="" class="h-8 w-8 rounded-lg" />
          {:else}
            <div class="h-8 w-8 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant/30">
              <Papicon icon="User" size={16} />
            </div>
          {/if}
          <div>
            <h3 class="text-sm font-bold text-on-surface">Rapport de détection</h3>
            <p class="text-[11px] text-on-surface-variant/50">@{det.username || det.id}</p>
          </div>
        </div>
        <button onclick={() => reportModalDetection = null} class="p-1.5 rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant/40">
          <Papicon icon="X" size={16} />
        </button>
      </div>

      <div class="p-5 space-y-5">
        <!-- Score -->
        {#if det.evidence}
          <div class="flex items-center gap-3 p-4 rounded-xl border {scoreBg(det.evidence.totalScore)}">
            <div class="text-2xl font-black {scoreColor(det.evidence.totalScore)}">{det.evidence.totalScore}</div>
            <div>
              <p class="text-xs font-bold text-on-surface">Score de confiance</p>
              <p class="text-[10px] text-on-surface-variant/50">{det.evidence.totalScore >= 60 ? 'Risque élevé' : det.evidence.totalScore >= 30 ? 'Risque moyen' : 'Risque faible'} — {det.evidence.reasons.length} signal{det.evidence.reasons.length > 1 ? 'aux' : ''}</p>
            </div>
          </div>
        {/if}

        <!-- Suspected alts -->
        {#if det.suspectedAlts && det.suspectedAlts.length > 0}
          <div>
            <h4 class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40 mb-2">Comptes suspects associés</h4>
            <div class="space-y-2">
              {#each det.suspectedAlts as alt}
                <div class="flex items-center justify-between gap-2 p-3 rounded-lg bg-surface-container-low/50 border border-outline-variant/5">
                  <button onclick={() => { reportModalDetection = null; openMemberCase(alt.userId, alt.username || alt.userId); }}
                    class="flex items-center gap-2 text-sm font-semibold text-on-surface hover:text-primary transition-colors min-w-0">
                    {#if alt.avatarUrl}<img src={alt.avatarUrl} alt="" class="w-6 h-6 rounded-full shrink-0" />{/if}
                    <span class="truncate">@{alt.username || alt.userId}</span>
                  </button>
                  <button onclick={() => { handleLinkDetection(det, alt.userId); reportModalDetection = null; }}
                    disabled={saveAction.state.loading}
                    class="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-500 hover:text-white transition-all disabled:opacity-50 flex items-center gap-1">
                    <Papicon icon="Link2" size={11} /> Lier
                  </button>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Heuristics detail -->
        {#if det.evidence && det.evidence.reasons.length > 0}
          <div>
            <h4 class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40 mb-2">Détail des heuristiques</h4>
            <div class="space-y-1.5">
              {#each det.evidence.reasons.sort((a, b) => b.score - a.score) as reason}
                <div class="p-3 rounded-lg bg-surface-container-low/40 border border-outline-variant/5">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 flex-1">
                      <p class="text-xs font-bold text-on-surface">{reason.label.replace(/<@\d+>/g, (m) => { const alt = det.suspectedAlts?.find(a => m.includes(a.userId)); return alt?.username ? `@${alt.username}` : m; })}</p>
                      {#if reason.detail}
                        <p class="text-[10px] text-on-surface-variant/40 mt-0.5">{reason.detail}</p>
                      {/if}
                    </div>
                    <span class="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold {scoreColor(reason.score)} {scoreBg(reason.score)}">{reason.score}pts</span>
                  </div>
                  <div class="mt-1.5">
                    <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-surface-container-high text-on-surface-variant/30">{reason.type.replace(/_/g, ' ')}</span>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Member info -->
        <div>
          <h4 class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40 mb-2">Informations</h4>
          <div class="grid grid-cols-2 gap-2 text-[11px]">
            <div class="p-2.5 rounded-lg bg-surface-container-low/40">
              <span class="text-on-surface-variant/40">Créé</span>
              <p class="font-bold text-on-surface">{formatRelative(det.accountCreatedAt)}</p>
            </div>
            <div class="p-2.5 rounded-lg bg-surface-container-low/40">
              <span class="text-on-surface-variant/40">Arrivé</span>
              <p class="font-bold text-on-surface">{formatRelative(det.guildJoinedAt)}</p>
            </div>
            <div class="p-2.5 rounded-lg bg-surface-container-low/40">
              <span class="text-on-surface-variant/40">Age compte</span>
              <p class="font-bold text-amber-500">{det.accountAgeLabel}</p>
            </div>
            <div class="p-2.5 rounded-lg bg-surface-container-low/40">
              <span class="text-on-surface-variant/40">Messages</span>
              <p class="font-bold text-on-surface">{det.messageCount}</p>
            </div>
          </div>
        </div>

        <!-- Bottom actions -->
        <div class="flex flex-wrap gap-2 pt-2">
          <button onclick={() => { reportModalDetection = null; openMemberCase(det.id, det.displayName || det.username || 'Membre'); }}
            class="flex-1 py-2.5 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary hover:text-white transition-all flex items-center justify-center gap-1.5">
            <Papicon icon="FileText" size={13} /> Ouvrir le dossier
          </button>
          <button onclick={() => { handleDismissDetection(det); reportModalDetection = null; }}
            disabled={saveAction.state.loading}
            class="py-2.5 px-4 rounded-lg border border-outline-variant/10 text-xs font-bold text-on-surface-variant/50 hover:text-on-surface transition-all flex items-center justify-center gap-1.5 disabled:opacity-50">
            <Papicon icon="X" size={13} /> Faux positif
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<MemberCaseModal
  open={modalOpen}
  userId={selectedUserId}
  userName={selectedUserName}
  {caseData}
  loading={loadingCase}
  error={caseError}
  onClose={() => modalOpen = false}
  onSelectUser={(newUserId) => {
    const foundNode = caseData?.interactionGraph?.nodes?.find((n: any) => n.id === newUserId);
    openMemberCase(newUserId, foundNode?.label || 'Membre');
  }}
/>
