<script lang="ts">
  import { channelDisplayName } from '../lib/channelUtils';
  import { onMount, onDestroy, untrack } from 'svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import { unsavedChanges } from '../lib/stores/unsavedChanges.svelte';
  import { confirmDialog } from '../lib/stores/confirmDialog.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import SearchableSelect from '../lib/components/SearchableSelect.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';
  import LoadingHint from '../lib/components/LoadingHint.svelte';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import {
    fetchRaidProtection,
    updateRaidProtection,
    setRaidMode,
    setJoinLock,
    setDmLock,
    setInviteEmergency,
    fetchMemberReports,
    decideMemberReport,
    fetchInviteRequests,
    decideInviteRequest,
    fetchScamImages,
    deleteScamImage
  } from '../lib/api';

  const PAGE_LABEL = 'Protection anti-raid';
  const actionState = createAsyncActionState();
  let loading = $state(false);

  const canManageSettings = $derived(!!dashboardStore.state.access?.canManageSettings);
  const availableChannels = $derived(dashboardStore.state.discordChannels || []);
  const availableRoles = $derived(dashboardStore.state.discordRoles || []);

  const channelOptions = $derived(availableChannels.map((c: any) => ({ id: c.id, name: channelDisplayName(c) })));
  const roleOptions = $derived(availableRoles.map((r: any) => ({ id: r.id, name: `@${r.name}` })));

  const DEFAULT_CONFIG = {
    // Captcha
    captchaEnabled: false,
    captchaChannelId: null as string | null,
    captchaUnverifiedRoleId: null as string | null,
    captchaTimeoutMinutes: 10,
    captchaMaxAttempts: 3,
    captchaFailAction: 'KICK',
    captchaLogChannelId: null as string | null,
    // Anti-raid
    antiRaidEnabled: false,
    antiRaidJoinThreshold: 10,
    antiRaidJoinWindowSec: 60,
    antiRaidAction: 'LOCK',
    antiRaidAlertChannelId: null as string | null,
    antiRaidAutoDisableMinutes: 30,
    // Locks (états lus séparément)
    joinLockKick: true,
    joinLockMessage: '',
    // Reports
    reportsEnabled: false,
    reportsChannelId: null as string | null,
    reportsCooldownSec: 60,
    reportsAnonymous: false,
    // Tag role
    tagRoleEnabled: false,
    tagRoleId: null as string | null,
    // Scam
    scamFilterEnabled: false,
    scamFilterAction: 'DELETE_AND_TIMEOUT',
    scamFilterTimeoutMin: 60,
    scamFilterCustomDomains: [] as string[],
    scamFilterWhitelist: [] as string[],
    scamFilterAlertChannelId: null as string | null,
    scamImageFilterEnabled: false,
    // Invite guard
    inviteGuardEnabled: false,
    inviteRequireUnitary: false,
    inviteValidationEnabled: false,
    inviteSpamThreshold: 5,
    inviteSpamWindowSec: 60,
    inviteAlertChannelId: null as string | null,
    inviteBypassRoleIds: [] as string[]
  };

  let config = $state({ ...DEFAULT_CONFIG });
  let savedConfig = $state({ ...DEFAULT_CONFIG });

  // États "live" (pilotés par boutons dédiés, pas par la sauvegarde)
  let liveState = $state({
    raidModeActive: false,
    raidModeManual: false,
    joinLockEnabled: false,
    dmLockEnabled: false,
    inviteEmergencyEnabled: false
  });

  let reportStats = $state({ pending: 0, resolved: 0, dismissed: 0 });
  let scamImageCount = $state(0);
  let pendingReports = $state<any[]>([]);
  let pendingInviteRequests = $state<any[]>([]);
  let scamImages = $state<any[]>([]);
  let showScamImages = $state(false);

  let customDomainsText = $state('');
  let whitelistText = $state('');

  function applyLoaded(cfg: any) {
    const loaded: typeof DEFAULT_CONFIG = { ...DEFAULT_CONFIG };
    for (const key of Object.keys(DEFAULT_CONFIG) as (keyof typeof DEFAULT_CONFIG)[]) {
      if (cfg && cfg[key] !== undefined && cfg[key] !== null) (loaded as any)[key] = cfg[key];
      else if (cfg && key.endsWith('ChannelId')) (loaded as any)[key] = cfg[key] ?? null;
    }
    config = loaded;
    savedConfig = { ...loaded, scamFilterCustomDomains: [...loaded.scamFilterCustomDomains], scamFilterWhitelist: [...loaded.scamFilterWhitelist], inviteBypassRoleIds: [...loaded.inviteBypassRoleIds] };
    customDomainsText = loaded.scamFilterCustomDomains.join('\n');
    whitelistText = loaded.scamFilterWhitelist.join('\n');
    liveState = {
      raidModeActive: cfg?.raidModeActive ?? false,
      raidModeManual: cfg?.raidModeManual ?? false,
      joinLockEnabled: cfg?.joinLockEnabled ?? false,
      dmLockEnabled: cfg?.dmLockEnabled ?? false,
      inviteEmergencyEnabled: cfg?.inviteEmergencyEnabled ?? false
    };
  }

  $effect(() => {
    const dirty = JSON.stringify(config) !== JSON.stringify(savedConfig);
    if (dirty && canManageSettings) {
      untrack(() => {
        unsavedChanges.register({
          label: PAGE_LABEL,
          onSave: () => handleSave(),
          onReset: () => {
            config = JSON.parse(JSON.stringify(savedConfig));
            customDomainsText = savedConfig.scamFilterCustomDomains.join('\n');
            whitelistText = savedConfig.scamFilterWhitelist.join('\n');
          }
        });
      });
    } else if (!dirty) {
      untrack(() => {
        if (unsavedChanges.isDirty && unsavedChanges.pageLabel === PAGE_LABEL) unsavedChanges.clear();
      });
    }
  });

  onDestroy(() => {
    if (unsavedChanges.pageLabel === PAGE_LABEL) unsavedChanges.clear();
  });

  async function reload() {
    const res = await fetchRaidProtection();
    if (res) {
      applyLoaded(res.config);
      reportStats = res.reportStats ?? { pending: 0, resolved: 0, dismissed: 0 };
      scamImageCount = res.scamImageCount ?? 0;
    }
    const [reportsRes, invitesRes] = await Promise.all([
      fetchMemberReports('PENDING').catch(() => null),
      fetchInviteRequests().catch(() => null)
    ]);
    pendingReports = reportsRes?.reports ?? [];
    pendingInviteRequests = (invitesRes?.requests ?? []).filter((r: any) => r.status === 'PENDING');
  }

  onMount(async () => {
    loading = true;
    try {
      await dashboardStore.refresh();
      await reload();
    } catch (err) {
      console.error(err);
    } finally {
      loading = false;
    }
  });

  async function handleSave(): Promise<boolean> {
    if (!canManageSettings) return false;
    let success = false;
    await actionState.run(async () => {
      config.scamFilterCustomDomains = customDomainsText.split('\n').map((d) => d.trim().toLowerCase()).filter(Boolean);
      config.scamFilterWhitelist = whitelistText.split('\n').map((d) => d.trim().toLowerCase()).filter(Boolean);
      const res = await updateRaidProtection(config);
      if (!res?.config) throw new Error('Erreur de sauvegarde');
      applyLoaded(res.config);
      success = true;
      return true;
    }, { successMessage: 'Configuration de protection enregistrée !' });
    return success;
  }

  async function toggleRaidMode() {
    if (!canManageSettings) return;
    const activating = !liveState.raidModeActive;
    if (activating && !(await confirmDialog.ask({
      title: 'Activer le mode raid ?',
      description: 'L\'action configurée (lock/captcha/kick) sera appliquée immédiatement à toutes les nouvelles arrivées.',
      confirmLabel: 'Activer',
      variant: 'warning'
    }))) return;
    await actionState.run(async () => {
      const res = await setRaidMode(activating);
      if (res?.config) applyLoaded(res.config);
      return true;
    }, { successMessage: activating ? 'Mode raid activé !' : 'Mode raid désactivé.' });
  }

  async function toggleJoinLock() {
    if (!canManageSettings) return;
    await actionState.run(async () => {
      const res = await setJoinLock(!liveState.joinLockEnabled);
      if (res?.config) applyLoaded(res.config);
      return true;
    }, { successMessage: liveState.joinLockEnabled ? 'Join lock activé — arrivées bloquées.' : 'Join lock désactivé.' });
  }

  async function toggleDmLock() {
    if (!canManageSettings) return;
    await actionState.run(async () => {
      const res = await setDmLock(!liveState.dmLockEnabled);
      if (res?.config) applyLoaded(res.config);
      return true;
    }, { successMessage: liveState.dmLockEnabled ? 'DM lock activé — MP bloqués.' : 'DM lock désactivé.' });
  }

  async function toggleInviteEmergency() {
    if (!canManageSettings) return;
    const activating = !liveState.inviteEmergencyEnabled;
    if (activating && !(await confirmDialog.ask({
      title: 'Mode urgence invitations ?',
      description: 'TOUTES les invitations existantes seront supprimées, et toute nouvelle invitation sera supprimée automatiquement.',
      confirmLabel: 'Tout supprimer',
      variant: 'danger'
    }))) return;
    await actionState.run(async () => {
      const res = await setInviteEmergency(activating);
      if (res?.config) applyLoaded(res.config);
      return true;
    }, { successMessage: activating ? 'Mode urgence activé — invitations supprimées.' : 'Mode urgence désactivé.' });
  }

  async function handleReportDecision(reportId: string, resolved: boolean) {
    await actionState.run(async () => {
      await decideMemberReport(reportId, resolved);
      pendingReports = pendingReports.filter((r) => r.id !== reportId);
      reportStats.pending = Math.max(0, reportStats.pending - 1);
      if (resolved) reportStats.resolved++;
      else reportStats.dismissed++;
      return true;
    }, { successMessage: resolved ? 'Signalement traité.' : 'Signalement rejeté.' });
  }

  async function handleInviteDecision(requestId: string, approved: boolean) {
    await actionState.run(async () => {
      await decideInviteRequest(requestId, approved);
      pendingInviteRequests = pendingInviteRequests.filter((r) => r.id !== requestId);
      return true;
    }, { successMessage: approved ? 'Invitation approuvée et recréée.' : 'Invitation rejetée.' });
  }

  async function loadScamImages() {
    showScamImages = !showScamImages;
    if (showScamImages && scamImages.length === 0) {
      const res = await fetchScamImages().catch(() => null);
      scamImages = res?.images ?? [];
    }
  }

  async function handleDeleteScamImage(imageId: string) {
    if (!(await confirmDialog.ask({ title: 'Supprimer ce hash d\'image ?', confirmLabel: 'Supprimer', variant: 'danger' }))) return;
    await actionState.run(async () => {
      await deleteScamImage(imageId);
      scamImages = scamImages.filter((i) => i.id !== imageId);
      scamImageCount = Math.max(0, scamImageCount - 1);
      return true;
    }, { successMessage: 'Hash supprimé.' });
  }

  const sectionClass = 'bg-surface-container-low/40 border border-outline-variant/30 p-8 rounded-xl space-y-5 hover:bg-surface-container-low/60 transition-all duration-300';
  const labelClass = 'text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest';
  const inputClass = 'w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all';
  const toggleTrack = 'relative w-11 h-6 rounded-full transition-colors duration-200';
  const toggleThumb = 'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200';
</script>

{#snippet toggle(checked: boolean, onchange: () => void, disabled = false)}
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onclick={onchange}
    {disabled}
    class="{toggleTrack} {checked ? 'bg-primary' : 'bg-surface-container-highest'} disabled:opacity-40"
  >
    <span class="{toggleThumb} {checked ? 'translate-x-5' : ''}"></span>
  </button>
{/snippet}

{#snippet cardHeader(icon: string, color: string, title: string, subtitle: string)}
  <div class="flex items-center gap-3 pb-3 border-b border-outline-variant/15">
    <div class="w-10 h-10 rounded-xl {color} flex items-center justify-center">
      <Papicon {icon} size={20} />
    </div>
    <div class="flex-1">
      <h3 class="text-lg font-semibold tracking-tight text-on-surface">{title}</h3>
      <p class="text-[10px] text-on-surface-variant/55 uppercase font-bold tracking-wider">{subtitle}</p>
    </div>
  </div>
{/snippet}

<ModulePage
  title="Protection anti-raid"
  description="Captcha, détection de raids, verrous d'urgence, signalements, contrôle des invitations et filtre anti-scam."
  icon="ShieldAlert"
  featureKey="automod"
>
  <InlineFeedback state={actionState} />

  {#if loading}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <Skeleton height="280px" radius="2.5rem" />
      <Skeleton height="280px" radius="2.5rem" />
      <Skeleton height="280px" radius="2.5rem" />
      <Skeleton height="280px" radius="2.5rem" />
    </div>
    <div class="flex justify-center mt-4">
      <LoadingHint context="config" />
    </div>
  {:else}
    <!-- ── Panneau d'urgence ─────────────────────────────────────────── -->
    <section class="bg-red-500/5 border border-red-500/20 p-8 rounded-xl space-y-5 mb-8">
      {@render cardHeader('Siren', 'bg-red-500/10 text-red-500', 'Panneau d\'urgence', 'Actions immédiates')}
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div class="p-4 rounded-lg bg-surface-container-high/30 border border-outline-variant/10 flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-on-surface">Mode raid</p>
            <p class="text-[11px] text-on-surface-variant/60">{liveState.raidModeActive ? `🟠 Actif (${liveState.raidModeManual ? 'manuel' : 'auto'})` : 'Inactif'}</p>
          </div>
          {@render toggle(liveState.raidModeActive, toggleRaidMode, !canManageSettings || actionState.state.loading)}
        </div>
        <div class="p-4 rounded-lg bg-surface-container-high/30 border border-outline-variant/10 flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-on-surface">Join lock</p>
            <p class="text-[11px] text-on-surface-variant/60">Bloque les nouvelles arrivées</p>
          </div>
          {@render toggle(liveState.joinLockEnabled, toggleJoinLock, !canManageSettings || actionState.state.loading)}
        </div>
        <div class="p-4 rounded-lg bg-surface-container-high/30 border border-outline-variant/10 flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-on-surface">DM lock</p>
            <p class="text-[11px] text-on-surface-variant/60">Bloque les MP du serveur (permanent)</p>
          </div>
          {@render toggle(liveState.dmLockEnabled, toggleDmLock, !canManageSettings || actionState.state.loading)}
        </div>
        <div class="p-4 rounded-lg bg-surface-container-high/30 border border-outline-variant/10 flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-on-surface">Urgence invitations</p>
            <p class="text-[11px] text-on-surface-variant/60">Supprime toutes les invitations</p>
          </div>
          {@render toggle(liveState.inviteEmergencyEnabled, toggleInviteEmergency, !canManageSettings || actionState.state.loading)}
        </div>
      </div>
    </section>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- ── Captcha ──────────────────────────────────────────────────── -->
      <section class={sectionClass}>
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            {@render cardHeader('ScanFace', 'bg-blue-500/10 text-blue-500', 'Captcha', 'Vérification des nouveaux membres')}
          </div>
          {@render toggle(config.captchaEnabled, () => (config.captchaEnabled = !config.captchaEnabled), !canManageSettings)}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-1.5">
            <span class={labelClass}>Salon de vérification</span>
            <SearchableSelect bind:value={config.captchaChannelId} options={channelOptions} placeholder="Choisir un salon" className={inputClass} disabled={!canManageSettings} />
          </div>
          <div class="space-y-1.5">
            <span class={labelClass}>Rôle non-vérifié</span>
            <SearchableSelect bind:value={config.captchaUnverifiedRoleId} options={roleOptions} placeholder="Choisir un rôle" className={inputClass} disabled={!canManageSettings} />
          </div>
          <div class="space-y-1.5">
            <span class={labelClass}>Délai (minutes)</span>
            <input type="number" min="2" max="60" bind:value={config.captchaTimeoutMinutes} class={inputClass} disabled={!canManageSettings} />
          </div>
          <div class="space-y-1.5">
            <span class={labelClass}>Tentatives max</span>
            <input type="number" min="1" max="10" bind:value={config.captchaMaxAttempts} class={inputClass} disabled={!canManageSettings} />
          </div>
          <div class="space-y-1.5">
            <span class={labelClass}>Sanction en cas d'échec</span>
            <select bind:value={config.captchaFailAction} class={inputClass} disabled={!canManageSettings}>
              <option value="KICK">Expulsion (kick)</option>
              <option value="BAN">Bannissement</option>
            </select>
          </div>
          <div class="space-y-1.5">
            <span class={labelClass}>Salon de logs</span>
            <SearchableSelect bind:value={config.captchaLogChannelId} options={channelOptions} placeholder="Optionnel" className={inputClass} disabled={!canManageSettings} />
          </div>
        </div>
      </section>

      <!-- ── Anti-raid ────────────────────────────────────────────────── -->
      <section class={sectionClass}>
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            {@render cardHeader('ShieldAlert', 'bg-orange-500/10 text-orange-500', 'Anti-raid', 'Détection des vagues d\'arrivées')}
          </div>
          {@render toggle(config.antiRaidEnabled, () => (config.antiRaidEnabled = !config.antiRaidEnabled), !canManageSettings)}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-1.5">
            <span class={labelClass}>Seuil (arrivées)</span>
            <input type="number" min="3" max="100" bind:value={config.antiRaidJoinThreshold} class={inputClass} disabled={!canManageSettings} />
          </div>
          <div class="space-y-1.5">
            <span class={labelClass}>Fenêtre (secondes)</span>
            <input type="number" min="10" max="600" bind:value={config.antiRaidJoinWindowSec} class={inputClass} disabled={!canManageSettings} />
          </div>
          <div class="space-y-1.5">
            <span class={labelClass}>Action automatique</span>
            <select bind:value={config.antiRaidAction} class={inputClass} disabled={!canManageSettings}>
              <option value="LOCK">Bloquer les arrivées (join lock)</option>
              <option value="CAPTCHA">Captcha forcé</option>
              <option value="KICK">Expulsion automatique</option>
            </select>
          </div>
          <div class="space-y-1.5">
            <span class={labelClass}>Auto-désactivation (min)</span>
            <input type="number" min="5" max="1440" bind:value={config.antiRaidAutoDisableMinutes} class={inputClass} disabled={!canManageSettings} />
          </div>
          <div class="space-y-1.5 md:col-span-2">
            <span class={labelClass}>Salon des alertes</span>
            <SearchableSelect bind:value={config.antiRaidAlertChannelId} options={channelOptions} placeholder="Choisir un salon" className={inputClass} disabled={!canManageSettings} />
          </div>
        </div>
      </section>

      <!-- ── Contrôle des invitations ─────────────────────────────────── -->
      <section class={sectionClass}>
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            {@render cardHeader('Link', 'bg-cyan-500/10 text-cyan-500', 'Contrôle des invitations', 'Règle unitaire · validation · anti-spam')}
          </div>
          {@render toggle(config.inviteGuardEnabled, () => (config.inviteGuardEnabled = !config.inviteGuardEnabled), !canManageSettings)}
        </div>
        <div class="space-y-3">
          <div class="p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium text-on-surface">Invitations unitaires uniquement</p>
              <p class="text-[11px] text-on-surface-variant/60">Supprime toute invitation ≠ 1 usage (pas de ∞)</p>
            </div>
            {@render toggle(config.inviteRequireUnitary, () => (config.inviteRequireUnitary = !config.inviteRequireUnitary), !canManageSettings)}
          </div>
          <div class="p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium text-on-surface">Validation par le staff</p>
              <p class="text-[11px] text-on-surface-variant/60">Chaque invitation doit être approuvée avant d'être active</p>
            </div>
            {@render toggle(config.inviteValidationEnabled, () => (config.inviteValidationEnabled = !config.inviteValidationEnabled), !canManageSettings)}
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <span class={labelClass}>Seuil anti-spam (créations)</span>
              <input type="number" min="2" max="50" bind:value={config.inviteSpamThreshold} class={inputClass} disabled={!canManageSettings} />
            </div>
            <div class="space-y-1.5">
              <span class={labelClass}>Fenêtre anti-spam (sec)</span>
              <input type="number" min="10" max="3600" bind:value={config.inviteSpamWindowSec} class={inputClass} disabled={!canManageSettings} />
            </div>
            <div class="space-y-1.5 md:col-span-2">
              <span class={labelClass}>Salon alertes & validations</span>
              <SearchableSelect bind:value={config.inviteAlertChannelId} options={channelOptions} placeholder="Choisir un salon" className={inputClass} disabled={!canManageSettings} />
            </div>
          </div>
        </div>
        {#if pendingInviteRequests.length > 0}
          <div class="space-y-2 pt-2 border-t border-outline-variant/15">
            <p class="text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest">Demandes en attente ({pendingInviteRequests.length})</p>
            {#each pendingInviteRequests as request (request.id)}
              <div class="p-3 rounded-lg bg-surface-container-high/30 border border-outline-variant/10 flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm text-on-surface truncate">Créateur : <span class="font-mono">{request.creatorId}</span></p>
                  <p class="text-[11px] text-on-surface-variant/60">Usages : {request.maxUses === 0 ? '∞' : request.maxUses} · Expire : {request.maxAgeSec === 0 ? 'jamais' : `${Math.round(request.maxAgeSec / 3600)}h`}</p>
                </div>
                <div class="flex gap-2 shrink-0">
                  <button type="button" class="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 rounded-lg text-xs font-medium" onclick={() => handleInviteDecision(request.id, true)} disabled={!canManageSettings}>Approuver</button>
                  <button type="button" class="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 rounded-lg text-xs font-medium" onclick={() => handleInviteDecision(request.id, false)} disabled={!canManageSettings}>Rejeter</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <!-- ── Anti-scam ────────────────────────────────────────────────── -->
      <section class={sectionClass}>
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            {@render cardHeader('Fish', 'bg-purple-500/10 text-purple-500', 'Filtre anti-scam', 'Faux Nitro · phishing · images connues')}
          </div>
          {@render toggle(config.scamFilterEnabled, () => (config.scamFilterEnabled = !config.scamFilterEnabled), !canManageSettings)}
        </div>
        <div class="space-y-3">
          <div class="p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium text-on-surface">Bloquer les images scam connues</p>
              <p class="text-[11px] text-on-surface-variant/60">Base alimentée par le honeypot — {scamImageCount} hash enregistrés</p>
            </div>
            {@render toggle(config.scamImageFilterEnabled, () => (config.scamImageFilterEnabled = !config.scamImageFilterEnabled), !canManageSettings)}
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <span class={labelClass}>Action</span>
              <select bind:value={config.scamFilterAction} class={inputClass} disabled={!canManageSettings}>
                <option value="DELETE">Supprimer uniquement</option>
                <option value="DELETE_AND_WARN">Supprimer + avertir</option>
                <option value="DELETE_AND_TIMEOUT">Supprimer + timeout</option>
                <option value="DELETE_AND_BAN">Supprimer + bannir</option>
              </select>
            </div>
            <div class="space-y-1.5">
              <span class={labelClass}>Salon des alertes</span>
              <SearchableSelect bind:value={config.scamFilterAlertChannelId} options={channelOptions} placeholder="Optionnel" className={inputClass} disabled={!canManageSettings} />
            </div>
            <div class="space-y-1.5">
              <span class={labelClass}>Domaines bloqués (1/ligne)</span>
              <textarea rows="3" bind:value={customDomainsText} class={inputClass} placeholder="evil-site.com" disabled={!canManageSettings}></textarea>
            </div>
            <div class="space-y-1.5">
              <span class={labelClass}>Domaines exemptés (1/ligne)</span>
              <textarea rows="3" bind:value={whitelistText} class={inputClass} placeholder="mon-site.fr" disabled={!canManageSettings}></textarea>
            </div>
          </div>
          <button type="button" class="w-full py-2.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 rounded-lg text-[13px] font-medium transition-all" onclick={loadScamImages}>
            {showScamImages ? 'Masquer' : 'Voir'} la base d'images scam ({scamImageCount})
          </button>
          {#if showScamImages}
            <div class="space-y-2 max-h-64 overflow-y-auto">
              {#each scamImages as image (image.id)}
                <div class="p-3 rounded-lg bg-surface-container-high/30 border border-outline-variant/10 flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-xs font-mono text-on-surface truncate">{image.hash.slice(0, 24)}…</p>
                    <p class="text-[11px] text-on-surface-variant/60">{image.filename ?? 'sans nom'} · {image.source}{image.guildId ? '' : ' · 🌐 global'}</p>
                  </div>
                  {#if image.guildId}
                    <button type="button" class="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 rounded-lg text-xs font-medium shrink-0" onclick={() => handleDeleteScamImage(image.id)} disabled={!canManageSettings}>Supprimer</button>
                  {/if}
                </div>
              {:else}
                <p class="text-xs text-on-surface-variant/50 text-center py-3">Aucune image enregistrée pour le moment.</p>
              {/each}
            </div>
          {/if}
        </div>
      </section>

      <!-- ── Signalements ─────────────────────────────────────────────── -->
      <section class={sectionClass}>
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            {@render cardHeader('Flag', 'bg-amber-500/10 text-amber-500', 'Signalements', `${reportStats.pending} en attente · ${reportStats.resolved} traités`)}
          </div>
          {@render toggle(config.reportsEnabled, () => (config.reportsEnabled = !config.reportsEnabled), !canManageSettings)}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-1.5 md:col-span-2">
            <span class={labelClass}>Salon staff des signalements</span>
            <SearchableSelect bind:value={config.reportsChannelId} options={channelOptions} placeholder="Choisir un salon" className={inputClass} disabled={!canManageSettings} />
          </div>
          <div class="space-y-1.5">
            <span class={labelClass}>Cooldown par membre (sec)</span>
            <input type="number" min="0" max="3600" bind:value={config.reportsCooldownSec} class={inputClass} disabled={!canManageSettings} />
          </div>
          <div class="p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 flex items-center justify-between gap-3">
            <p class="text-sm font-medium text-on-surface">Signalements anonymes</p>
            {@render toggle(config.reportsAnonymous, () => (config.reportsAnonymous = !config.reportsAnonymous), !canManageSettings)}
          </div>
        </div>
        {#if pendingReports.length > 0}
          <div class="space-y-2 pt-2 border-t border-outline-variant/15 max-h-72 overflow-y-auto">
            {#each pendingReports as report (report.id)}
              <div class="p-3 rounded-lg bg-surface-container-high/30 border border-outline-variant/10 space-y-2">
                <div class="flex items-center justify-between gap-3">
                  <p class="text-sm text-on-surface">Cible : <span class="font-mono">{report.targetId}</span></p>
                  <div class="flex gap-2 shrink-0">
                    <button type="button" class="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 rounded-lg text-xs font-medium" onclick={() => handleReportDecision(report.id, true)} disabled={!canManageSettings}>Traité</button>
                    <button type="button" class="px-3 py-1.5 bg-surface-container-highest hover:bg-surface-container-high text-on-surface-variant rounded-lg text-xs font-medium" onclick={() => handleReportDecision(report.id, false)} disabled={!canManageSettings}>Rejeter</button>
                  </div>
                </div>
                <p class="text-xs text-on-surface-variant/70">{report.reason}</p>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <!-- ── Tag role ─────────────────────────────────────────────────── -->
      <section class={sectionClass}>
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            {@render cardHeader('Tag', 'bg-emerald-500/10 text-emerald-500', 'Tag role', 'Rôle auto pour le tag du serveur')}
          </div>
          {@render toggle(config.tagRoleEnabled, () => (config.tagRoleEnabled = !config.tagRoleEnabled), !canManageSettings)}
        </div>
        <div class="space-y-1.5">
          <span class={labelClass}>Rôle attribué</span>
          <SearchableSelect bind:value={config.tagRoleId} options={roleOptions} placeholder="Choisir un rôle" className={inputClass} disabled={!canManageSettings} />
        </div>
        <p class="text-[11px] text-on-surface-variant/50 italic">Les membres qui affichent le tag du serveur sur leur profil Discord reçoivent automatiquement ce rôle (et le perdent s'ils le retirent).</p>
      </section>

      <!-- ── Join lock — options ──────────────────────────────────────── -->
      <section class={sectionClass}>
        {@render cardHeader('Lock', 'bg-slate-500/10 text-slate-400', 'Options du join lock', 'Comportement pendant un verrouillage')}
        <div class="p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-medium text-on-surface">Expulser les arrivées pendant le lock</p>
            <p class="text-[11px] text-on-surface-variant/60">Filet de sécurité au-delà de la pause des invitations Discord</p>
          </div>
          {@render toggle(config.joinLockKick, () => (config.joinLockKick = !config.joinLockKick), !canManageSettings)}
        </div>
        <div class="space-y-1.5">
          <span class={labelClass}>Message envoyé en MP aux membres expulsés</span>
          <textarea rows="2" bind:value={config.joinLockMessage} class={inputClass} disabled={!canManageSettings}></textarea>
        </div>
      </section>
    </div>

    <div class="flex justify-end mt-8">
      <button
        type="button"
        onclick={handleSave}
        disabled={!canManageSettings || actionState.state.loading}
        class="px-8 py-3.5 bg-primary text-on-primary rounded-lg text-sm font-semibold transition-all duration-200 active:scale-95 disabled:opacity-40 flex items-center gap-2"
      >
        <Papicon icon="Save" size={16} />
        Enregistrer la configuration
      </button>
    </div>
  {/if}
</ModulePage>
