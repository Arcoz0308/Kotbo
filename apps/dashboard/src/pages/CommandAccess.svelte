<script lang="ts">
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { updateCommandAccessSettings } from '../lib/api';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import AccessEntitySelector from '../lib/components/AccessEntitySelector.svelte';
  import { refreshDashboardOnMount } from '../lib/dashboardLifecycle';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import Papicon from '../lib/components/Papicon.svelte';


  const availableChannels = $derived(dashboardStore.state.discordChannels || []);
  const availableRoles = $derived(dashboardStore.state.discordRoles || []);
  const commandCatalog = $derived(dashboardStore.state.commandCatalog || []);
  const canManageSettings = $derived(!!dashboardStore.state.access?.canManageSettings);
  const activeRestrictionCount = $derived(dashboardStore.state.commandRestrictions.length);

  const saveAction = createAsyncActionState();

  type RestrictionMode = 'neutral' | 'allowedOnly' | 'blockedOnly';

  let commandSearch = $state('');
  let catalogFilter = $state<'all' | 'active' | 'no-rules' | 'administration' | 'modération' | 'public'>('all');
  let channelMode = $state<RestrictionMode>('neutral');
  let roleMode = $state<RestrictionMode>('neutral');
  let selectedCommandName = $state('');
  let commandDraft = $state({
    commandName: '',
    allowedChannelIds: [],
    blockedChannelIds: [],
    allowedRoleIds: [],
    blockedRoleIds: [],
  });

  const emptyDraft = () => ({
    commandName: '',
    allowedChannelIds: [],
    blockedChannelIds: [],
    allowedRoleIds: [],
    blockedRoleIds: [],
  });

  const uniqueIds = (ids: string[]) => [...new Set(ids)];

  const normalizeSearchText = (value: string) => value.trim().toLowerCase();

  const channelOptions = $derived(availableChannels.map((channel) => ({
    id: channel.id,
    name: channel.name,
    prefix: '#',
  })));

  const roleOptions = $derived(availableRoles.map((role) => ({
    id: role.id,
    name: role.name,
    prefix: '@',
  })));

  const channelConflicts = $derived(commandDraft.allowedChannelIds.filter((id) => commandDraft.blockedChannelIds.includes(id)));
  const roleConflicts = $derived(commandDraft.allowedRoleIds.filter((id) => commandDraft.blockedRoleIds.includes(id)));
  const hasConflicts = $derived(channelConflicts.length > 0 || roleConflicts.length > 0);

  function inferMode(allowedIds: string[], blockedIds: string[]): RestrictionMode {
    if (allowedIds.length > 0 && blockedIds.length === 0) return 'allowedOnly';
    if (blockedIds.length > 0 && allowedIds.length === 0) return 'blockedOnly';
    return 'neutral';
  }

  const selectedChannelIds = $derived(channelMode === 'allowedOnly' ? commandDraft.allowedChannelIds : commandDraft.blockedChannelIds);
  const selectedRoleIds = $derived(roleMode === 'allowedOnly' ? commandDraft.allowedRoleIds : commandDraft.blockedRoleIds);

  const channelSelectionDisabled = $derived(channelMode === 'neutral' || !canManageSettings || !selectedCommandName);
  const roleSelectionDisabled = $derived(roleMode === 'neutral' || !canManageSettings || !selectedCommandName);

  function loadCommandDraft(commandName: string) {
    const rule = dashboardStore.state.commandRestrictions.find((entry) => entry.commandName === commandName);
    const nextDraft = rule ? {
      commandName: rule.commandName,
      allowedChannelIds: [...rule.allowedChannelIds],
      blockedChannelIds: [...rule.blockedChannelIds],
      allowedRoleIds: [...rule.allowedRoleIds],
      blockedRoleIds: [...rule.blockedRoleIds],
    } : {
      ...emptyDraft(),
      commandName,
    };

    commandDraft = nextDraft;

    channelMode = inferMode(nextDraft.allowedChannelIds, nextDraft.blockedChannelIds);
    roleMode = inferMode(nextDraft.allowedRoleIds, nextDraft.blockedRoleIds);
  }

  function selectCommand(commandName: string) {
    selectedCommandName = commandName;
    loadCommandDraft(commandName);
    saveAction.clearFeedback();
  }

  function defaultAccessLabel(access: string) {
    if (access === 'administration') return 'Admin';
    if (access === 'modération') return 'Modération';
    return 'Ouvert';
  }

  function defaultAccessClasses(access: string) {
    if (access === 'administration') return 'bg-rose-500/10 text-rose-700 dark:text-rose-300';
    if (access === 'modération') return 'bg-amber-500/10 text-amber-700 dark:text-amber-300';
    return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  }

  function hasRestriction(commandName: string) {
    return dashboardStore.state.commandRestrictions.some((entry) => entry.commandName === commandName);
  }

  function resolveDraftConflicts() {
    const allowedChannels = new Set(commandDraft.allowedChannelIds);
    const allowedRoles = new Set(commandDraft.allowedRoleIds);
    commandDraft = {
      ...commandDraft,
      blockedChannelIds: commandDraft.blockedChannelIds.filter((id) => !allowedChannels.has(id)),
      blockedRoleIds: commandDraft.blockedRoleIds.filter((id) => !allowedRoles.has(id)),
    };
    channelMode = inferMode(commandDraft.allowedChannelIds, commandDraft.blockedChannelIds);
    roleMode = inferMode(commandDraft.allowedRoleIds, commandDraft.blockedRoleIds);
  }

  function setChannelMode(mode: RestrictionMode) {
    channelMode = mode;
    if (mode === 'neutral') {
      commandDraft = {
        ...commandDraft,
        allowedChannelIds: [],
        blockedChannelIds: [],
      };
      return;
    }

    if (mode === 'allowedOnly') {
      const nextAllowed = commandDraft.allowedChannelIds.length > 0
        ? commandDraft.allowedChannelIds
        : commandDraft.blockedChannelIds;
      commandDraft = {
        ...commandDraft,
        allowedChannelIds: uniqueIds(nextAllowed),
        blockedChannelIds: [],
      };
      return;
    }

    const nextBlocked = commandDraft.blockedChannelIds.length > 0
      ? commandDraft.blockedChannelIds
      : commandDraft.allowedChannelIds;
    commandDraft = {
      ...commandDraft,
      allowedChannelIds: [],
      blockedChannelIds: uniqueIds(nextBlocked),
    };
  }

  function setRoleMode(mode: RestrictionMode) {
    roleMode = mode;
    if (mode === 'neutral') {
      commandDraft = {
        ...commandDraft,
        allowedRoleIds: [],
        blockedRoleIds: [],
      };
      return;
    }

    if (mode === 'allowedOnly') {
      const nextAllowed = commandDraft.allowedRoleIds.length > 0
        ? commandDraft.allowedRoleIds
        : commandDraft.blockedRoleIds;
      commandDraft = {
        ...commandDraft,
        allowedRoleIds: uniqueIds(nextAllowed),
        blockedRoleIds: [],
      };
      return;
    }

    const nextBlocked = commandDraft.blockedRoleIds.length > 0
      ? commandDraft.blockedRoleIds
      : commandDraft.allowedRoleIds;
    commandDraft = {
      ...commandDraft,
      allowedRoleIds: [],
      blockedRoleIds: uniqueIds(nextBlocked),
    };
  }

  function toggleChannelSelection(channelId: string, checked: boolean) {
    if (channelMode === 'neutral') return;
    if (channelMode === 'allowedOnly') {
      const next = checked
        ? [...new Set([...commandDraft.allowedChannelIds, channelId])]
        : commandDraft.allowedChannelIds.filter((entry) => entry !== channelId);
      commandDraft = { ...commandDraft, allowedChannelIds: next };
      return;
    }

    const next = checked
      ? [...new Set([...commandDraft.blockedChannelIds, channelId])]
      : commandDraft.blockedChannelIds.filter((entry) => entry !== channelId);
    commandDraft = { ...commandDraft, blockedChannelIds: next };
  }

  function toggleRoleSelection(roleId: string, checked: boolean) {
    if (roleMode === 'neutral') return;
    if (roleMode === 'allowedOnly') {
      const next = checked
        ? [...new Set([...commandDraft.allowedRoleIds, roleId])]
        : commandDraft.allowedRoleIds.filter((entry) => entry !== roleId);
      commandDraft = { ...commandDraft, allowedRoleIds: next };
      return;
    }

    const next = checked
      ? [...new Set([...commandDraft.blockedRoleIds, roleId])]
      : commandDraft.blockedRoleIds.filter((entry) => entry !== roleId);
    commandDraft = { ...commandDraft, blockedRoleIds: next };
  }

  function clearChannels() {
    channelMode = 'neutral';
    commandDraft = {
      ...commandDraft,
      allowedChannelIds: [],
      blockedChannelIds: [],
    };
  }

  function clearRoles() {
    roleMode = 'neutral';
    commandDraft = {
      ...commandDraft,
      allowedRoleIds: [],
      blockedRoleIds: [],
    };
  }

  function clearAllRules() {
    channelMode = 'neutral';
    roleMode = 'neutral';
    commandDraft = {
      ...commandDraft,
      ...emptyDraft(),
      commandName: selectedCommandName,
    };
  }

  $effect(() => {
    if (!selectedCommandName && commandCatalog.length > 0) {
      selectedCommandName = commandCatalog[0].name;
      return;
    }
    if (selectedCommandName) {
      loadCommandDraft(selectedCommandName);
    }
  });

  function upsertCommandDraft() {
    if (!selectedCommandName) return;
    const nextRule = {
      commandName: selectedCommandName,
      allowedChannelIds: uniqueIds(commandDraft.allowedChannelIds),
      blockedChannelIds: uniqueIds(commandDraft.blockedChannelIds),
      allowedRoleIds: uniqueIds(commandDraft.allowedRoleIds),
      blockedRoleIds: uniqueIds(commandDraft.blockedRoleIds),
    };

    const nextRules = dashboardStore.state.commandRestrictions.filter((entry) => entry.commandName !== selectedCommandName);
    const hasAnyRestriction = nextRule.allowedChannelIds.length > 0
      || nextRule.blockedChannelIds.length > 0
      || nextRule.allowedRoleIds.length > 0
      || nextRule.blockedRoleIds.length > 0;

    dashboardStore.state.commandRestrictions = hasAnyRestriction ? [...nextRules, nextRule] : nextRules;
    commandDraft = { ...nextRule };
  }

  async function saveCommandAccess() {
    if (!canManageSettings) {
      saveAction.setError('Seuls les administrateurs peuvent modifier ces paramètres.');
      return;
    }

    upsertCommandDraft();

    await saveAction.run(
      async () => {
        const saved = await updateCommandAccessSettings(dashboardStore.state.commandRestrictions);
        if (!saved) return false;

        await dashboardStore.refresh();
        return true;
      },
      {
        successMessage: 'Restrictions de commande enregistrées.',
        failureMessage: 'Impossible d’enregistrer les restrictions pour le moment.'
      }
    );
  }

  function resetCommandDraft() {
    loadCommandDraft(selectedCommandName);
    saveAction.clearFeedback();
  }

  const selectedCatalogEntry = $derived(commandCatalog.find((entry) => entry.name === selectedCommandName));
  const selectedRestrictionSummary = $derived(
    dashboardStore.state.commandRestrictions.find((entry) => entry.commandName === selectedCommandName)
  );
  const hasSelectedRestriction = $derived(!!selectedRestrictionSummary);

  const filteredCommandCatalog = $derived.by(() => {
    const search = normalizeSearchText(commandSearch);
    const commands = [...commandCatalog];

    const matchesFilter = (command: { name: string; label: string; defaultAccess: string }) => {
      if (catalogFilter === 'active') return hasRestriction(command.name);
      if (catalogFilter === 'no-rules') return !hasRestriction(command.name);
      if (catalogFilter === 'administration') return command.defaultAccess === 'administration';
      if (catalogFilter === 'modération') return command.defaultAccess === 'modération';
      if (catalogFilter === 'public') return command.defaultAccess !== 'administration' && command.defaultAccess !== 'modération';
      return true;
    };

    return commands
      .filter((command) => {
        if (!matchesFilter(command)) return false;
        if (!search) return true;
        return command.name.toLowerCase().includes(search)
          || (command.label || '').toLowerCase().includes(search)
          || (command.description || '').toLowerCase().includes(search);
      })
      .sort((a, b) => {
        const aActive = hasRestriction(a.name) ? 1 : 0;
        const bActive = hasRestriction(b.name) ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        return a.name.localeCompare(b.name, 'fr');
      });
  });
</script>

<div class="relative overflow-hidden rounded-4xl border border-primary/10 bg-linear-to-br from-primary/10 via-white to-sky-100/70 dark:from-primary/20 dark:via-slate-900 dark:to-slate-800 p-8 mb-8 font-inter">
  <div class="absolute -right-14 -top-14 h-48 w-48 rounded-full bg-primary/10 blur-3xl"></div>
  <div class="absolute -left-20 -bottom-20 h-52 w-52 rounded-full bg-cyan-500/10 blur-3xl"></div>
  <div class="relative z-10 flex flex-wrap items-end justify-between gap-6">
    <div>
      <p class="text-[11px] font-black uppercase tracking-[0.22em] text-primary/70">Centre de permissions</p>
      <h2 class="mt-2 text-4xl font-extrabold text-primary tracking-tight font-headline">Gestion des commandes</h2>
      <p class="text-on-surface-variant mt-2 text-base md:text-lg max-w-3xl">Configurez précisément qui peut exécuter chaque commande, où et avec quels rôles, dans une interface rapide inspirée des dashboards de modération modernes.</p>
    </div>
    <div class="flex flex-wrap gap-3">
      <div class="rounded-2xl border border-primary/20 bg-white/80 dark:bg-slate-900/80 px-4 py-3 min-w-42.5">
        <p class="text-[10px] font-black uppercase tracking-[0.18em] text-on-surface-variant">Commandes totales</p>
        <p class="mt-1 text-2xl font-black text-on-surface">{commandCatalog.length}</p>
      </div>
      <div class="rounded-2xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 min-w-42.5">
        <p class="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">Règles actives</p>
        <p class="mt-1 text-2xl font-black text-emerald-800 dark:text-emerald-200">{activeRestrictionCount}</p>
      </div>
    </div>
  </div>
</div>

<div class="grid grid-cols-12 gap-8 font-inter">
  <div class="col-span-12 xl:col-span-4 space-y-6">
    <div class="section-card p-6">
      <div class="flex items-center justify-between gap-3 mb-4">
        <h3 class="text-xl font-bold font-headline flex items-center gap-3">
          <Papicon icon="segment" size={20} class="text-primary" />
          Catalogue des commandes
        </h3>
        <span class="text-[10px] font-black uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-on-surface-variant">{filteredCommandCatalog.length}</span>
      </div>

      <div class="mb-4">
        <label class="sr-only" for="command-search">Rechercher une commande</label>
        <div class="relative">
          <Papicon icon="search" size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            id="command-search"
            type="text"
            bind:value={commandSearch}
            placeholder="Rechercher : nom, label ou description"
            class="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/25"
          />
        </div>
      </div>

      <div class="mb-5 flex flex-wrap gap-2">
        <button type="button" onclick={() => { catalogFilter = 'all'; }} class="px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-[0.15em] border transition-colors {catalogFilter === 'all' ? 'bg-primary text-white border-primary' : 'border-slate-200 dark:border-slate-700 text-on-surface-variant hover:bg-slate-100 dark:hover:bg-slate-800'}">Toutes</button>
        <button type="button" onclick={() => { catalogFilter = 'active'; }} class="px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-[0.15em] border transition-colors {catalogFilter === 'active' ? 'bg-primary text-white border-primary' : 'border-slate-200 dark:border-slate-700 text-on-surface-variant hover:bg-slate-100 dark:hover:bg-slate-800'}">Règles actives</button>
        <button type="button" onclick={() => { catalogFilter = 'no-rules'; }} class="px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-[0.15em] border transition-colors {catalogFilter === 'no-rules' ? 'bg-primary text-white border-primary' : 'border-slate-200 dark:border-slate-700 text-on-surface-variant hover:bg-slate-100 dark:hover:bg-slate-800'}">Sans règle</button>
        <button type="button" onclick={() => { catalogFilter = 'administration'; }} class="px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-[0.15em] border transition-colors {catalogFilter === 'administration' ? 'bg-primary text-white border-primary' : 'border-slate-200 dark:border-slate-700 text-on-surface-variant hover:bg-slate-100 dark:hover:bg-slate-800'}">Admin</button>
        <button type="button" onclick={() => { catalogFilter = 'modération'; }} class="px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-[0.15em] border transition-colors {catalogFilter === 'modération' ? 'bg-primary text-white border-primary' : 'border-slate-200 dark:border-slate-700 text-on-surface-variant hover:bg-slate-100 dark:hover:bg-slate-800'}">Modération</button>
        <button type="button" onclick={() => { catalogFilter = 'public'; }} class="px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-[0.15em] border transition-colors {catalogFilter === 'public' ? 'bg-primary text-white border-primary' : 'border-slate-200 dark:border-slate-700 text-on-surface-variant hover:bg-slate-100 dark:hover:bg-slate-800'}">Ouvertes</button>
      </div>

      <div class="space-y-2 max-h-[66vh] overflow-y-auto pr-1">
        {#if filteredCommandCatalog.length === 0}
          <div class="p-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-sm text-on-surface-variant">
            Aucune commande ne correspond à votre recherche.
          </div>
        {:else}
          {#each filteredCommandCatalog as command}
            <button
              type="button"
              onclick={() => selectCommand(command.name)}
              class="w-full text-left p-4 rounded-2xl border transition-all duration-200 {selectedCommandName === command.name ? 'border-primary bg-primary/5 shadow-sm' : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-white/5'}"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-black text-slate-800 dark:text-slate-100">/{command.name}</p>
                  <p class="text-xs text-on-surface-variant mt-1">{command.label}</p>
                </div>
                <div class="flex items-center gap-2">
                  {#if hasRestriction(command.name)}
                    <span class="text-[10px] font-black uppercase tracking-[0.15em] px-2 py-1 rounded-full bg-primary/10 text-primary">Actif</span>
                  {/if}
                  <span class="text-[10px] font-black uppercase tracking-[0.18em] px-2 py-1 rounded-full {defaultAccessClasses(command.defaultAccess)}">
                    {defaultAccessLabel(command.defaultAccess)}
                  </span>
                </div>
              </div>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </div>

  <div class="col-span-12 xl:col-span-8 space-y-8">
    <div class="section-card p-8">
      <div class="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div>
          <h3 class="text-2xl font-black font-headline">{selectedCatalogEntry ? `/${selectedCatalogEntry.name}` : 'Sélectionnez une commande'}</h3>
          <p class="text-on-surface-variant mt-1">{selectedCatalogEntry?.description || 'Choisissez une commande dans la colonne de gauche.'}</p>
        </div>
        <div class="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-on-surface-variant">
          <span class="px-3 py-1 rounded-full {hasSelectedRestriction ? 'bg-primary/10 text-primary' : 'bg-slate-100 dark:bg-slate-800'}">{hasSelectedRestriction ? 'Règles actives' : 'Aucune règle'}</span>
          {#if selectedCatalogEntry}
            <span class="px-3 py-1 rounded-full {defaultAccessClasses(selectedCatalogEntry.defaultAccess)}">{defaultAccessLabel(selectedCatalogEntry.defaultAccess)}</span>
          {/if}
        </div>
      </div>

      <div class="mb-6 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div class="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-800/80">
          <p class="text-[10px] font-black uppercase tracking-[0.17em] text-on-surface-variant">Salons autorisés</p>
          <p class="mt-1 text-xl font-black">{commandDraft.allowedChannelIds.length}</p>
        </div>
        <div class="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-800/80">
          <p class="text-[10px] font-black uppercase tracking-[0.17em] text-on-surface-variant">Salons interdits</p>
          <p class="mt-1 text-xl font-black">{commandDraft.blockedChannelIds.length}</p>
        </div>
        <div class="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-800/80">
          <p class="text-[10px] font-black uppercase tracking-[0.17em] text-on-surface-variant">Rôles autorisés</p>
          <p class="mt-1 text-xl font-black">{commandDraft.allowedRoleIds.length}</p>
        </div>
        <div class="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-800/80">
          <p class="text-[10px] font-black uppercase tracking-[0.17em] text-on-surface-variant">Rôles interdits</p>
          <p class="mt-1 text-xl font-black">{commandDraft.blockedRoleIds.length}</p>
        </div>
      </div>

      {#if hasConflicts}
        <div class="mb-6 rounded-2xl border border-amber-300/70 bg-amber-500/10 p-4 text-sm">
          <p class="font-bold text-amber-800 dark:text-amber-200">Conflit détecté</p>
          <p class="text-amber-700 dark:text-amber-300 mt-1">Des éléments sont à la fois autorisés et interdits ({channelConflicts.length} salon(s), {roleConflicts.length} rôle(s)).</p>
          <button
            type="button"
            onclick={resolveDraftConflicts}
            disabled={!canManageSettings || !selectedCommandName}
            class="mt-3 px-3 py-1.5 rounded-xl bg-amber-600 text-white text-[11px] font-black uppercase tracking-[0.14em] disabled:opacity-50"
          >
            Résoudre automatiquement
          </button>
        </div>
      {/if}

      <div class="mb-5 flex flex-wrap items-center gap-2 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 bg-slate-50 dark:bg-slate-800/60">
        <span class="text-[10px] font-black uppercase tracking-[0.17em] text-on-surface-variant mr-2">Actions rapides</span>
        <button
          type="button"
          onclick={clearChannels}
          disabled={!canManageSettings || !selectedCommandName}
          class="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 text-[11px] font-black uppercase tracking-[0.14em] hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
        >
          Vider les salons
        </button>
        <button
          type="button"
          onclick={clearRoles}
          disabled={!canManageSettings || !selectedCommandName}
          class="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 text-[11px] font-black uppercase tracking-[0.14em] hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
        >
          Vider les rôles
        </button>
        <button
          type="button"
          onclick={clearAllRules}
          disabled={!canManageSettings || !selectedCommandName}
          class="px-3 py-1.5 rounded-xl border border-rose-300/70 text-rose-700 dark:text-rose-300 text-[11px] font-black uppercase tracking-[0.14em] hover:bg-rose-500/10 disabled:opacity-50"
        >
          Supprimer toutes les règles
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="space-y-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-4">
          <div class="flex items-center justify-between gap-3">
            <p class="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Mode salons</p>
            <div class="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1">
              <button type="button" onclick={() => setChannelMode('neutral')} disabled={!canManageSettings || !selectedCommandName} class="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-[0.12em] transition-colors {channelMode === 'neutral' ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-on-surface-variant hover:bg-slate-100 dark:hover:bg-slate-800'}">Vide</button>
              <button type="button" onclick={() => setChannelMode('allowedOnly')} disabled={!canManageSettings || !selectedCommandName} class="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-[0.12em] transition-colors {channelMode === 'allowedOnly' ? 'bg-emerald-600 text-white' : 'text-on-surface-variant hover:bg-slate-100 dark:hover:bg-slate-800'}">Autorisé</button>
              <button type="button" onclick={() => setChannelMode('blockedOnly')} disabled={!canManageSettings || !selectedCommandName} class="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-[0.12em] transition-colors {channelMode === 'blockedOnly' ? 'bg-rose-600 text-white' : 'text-on-surface-variant hover:bg-slate-100 dark:hover:bg-slate-800'}">Interdit</button>
            </div>
          </div>

          <AccessEntitySelector
            id="channels-selector"
            options={channelOptions}
            selectedIds={selectedChannelIds}
            disabled={channelSelectionDisabled}
            placeholder={channelMode === 'neutral' ? 'Mode vide: commande autorisée dans tous les salons' : channelMode === 'allowedOnly' ? 'Sélectionner les salons autorisés' : 'Sélectionner les salons interdits'}
            onToggle={toggleChannelSelection}
          />

          <p class="text-xs text-on-surface-variant">
            {#if channelMode === 'neutral'}
              Aucun filtrage de salon: la commande reste disponible partout.
            {:else if channelMode === 'allowedOnly'}
              Seuls les salons sélectionnés peuvent exécuter cette commande.
            {:else}
              Les salons sélectionnés sont bloqués pour cette commande.
            {/if}
          </p>
        </div>

        <div class="space-y-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-4">
          <div class="flex items-center justify-between gap-3">
            <p class="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Mode rôles</p>
            <div class="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1">
              <button type="button" onclick={() => setRoleMode('neutral')} disabled={!canManageSettings || !selectedCommandName} class="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-[0.12em] transition-colors {roleMode === 'neutral' ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-on-surface-variant hover:bg-slate-100 dark:hover:bg-slate-800'}">Vide</button>
              <button type="button" onclick={() => setRoleMode('allowedOnly')} disabled={!canManageSettings || !selectedCommandName} class="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-[0.12em] transition-colors {roleMode === 'allowedOnly' ? 'bg-emerald-600 text-white' : 'text-on-surface-variant hover:bg-slate-100 dark:hover:bg-slate-800'}">Autorisé</button>
              <button type="button" onclick={() => setRoleMode('blockedOnly')} disabled={!canManageSettings || !selectedCommandName} class="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-[0.12em] transition-colors {roleMode === 'blockedOnly' ? 'bg-rose-600 text-white' : 'text-on-surface-variant hover:bg-slate-100 dark:hover:bg-slate-800'}">Interdit</button>
            </div>
          </div>

          <AccessEntitySelector
            id="roles-selector"
            options={roleOptions}
            selectedIds={selectedRoleIds}
            disabled={roleSelectionDisabled}
            placeholder={roleMode === 'neutral' ? 'Mode vide: commande autorisée pour tous les rôles' : roleMode === 'allowedOnly' ? 'Sélectionner les rôles autorisés' : 'Sélectionner les rôles interdits'}
            onToggle={toggleRoleSelection}
          />

          <p class="text-xs text-on-surface-variant">
            {#if roleMode === 'neutral'}
              Aucun filtrage de rôle: la commande n’est pas restreinte par rôle.
            {:else if roleMode === 'allowedOnly'}
              Un des rôles sélectionnés doit être présent pour exécuter la commande.
            {:else}
              Les rôles sélectionnés ne peuvent pas exécuter la commande.
            {/if}
          </p>
        </div>
      </div>

      <div class="mt-8 p-4 rounded-3xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-sm text-on-surface-variant">
        <p class="font-bold text-on-surface mb-2">Résumé de la règle en cours</p>
        <p>Salons autorisés : {commandDraft.allowedChannelIds.length || 'aucun'} · Salons interdits : {commandDraft.blockedChannelIds.length || 'aucun'} · Rôles autorisés : {commandDraft.allowedRoleIds.length || 'aucun'} · Rôles interdits : {commandDraft.blockedRoleIds.length || 'aucun'}</p>
      </div>

      <div class="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-6">
        <InlineFeedback
          message={saveAction.state.message}
          error={saveAction.state.error}
          idleText="Les modifications ne sont appliquées qu’après enregistrement."
        />
        <div class="flex items-center gap-3">
          <button
            type="button"
            onclick={resetCommandDraft}
            disabled={!canManageSettings || !selectedCommandName}
            class="px-4 py-2.5 rounded-xl border border-outline-variant/30 text-xs font-black uppercase tracking-wider text-on-surface-variant hover:bg-surface-container-low"
          >
            Réinitialiser
          </button>
          <button
            type="button"
            onclick={saveCommandAccess}
            disabled={saveAction.state.loading || !canManageSettings || !selectedCommandName}
            class="px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-primary/10 hover:opacity-90 disabled:opacity-50"
          >
            {saveAction.state.loading ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  </div>
</div>