<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { deleteFeed, updateFeed, updateYouTubeSettings, updateModuleStatus, fetchDailyAlgoProblems, createDailyAlgoProblem } from '../lib/api';
  import { router } from 'tinro';
  import { getModuleMeta } from '../lib/moduleMeta';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import ColumnSortFilter, { type ColumnFilterOption } from '../lib/components/sanctions/ColumnSortFilter.svelte';

  let { moduleId } = $props();

  const module = $derived(dashboardStore.state.modules.find(m => m.id === moduleId) || { 
    name: 'Chargement...', 
    description: 'Veuillez patienter...', 
    status: 'inactive' 
  });
  const moduleMeta = $derived(getModuleMeta(moduleId));
  const canManageSettings = $derived(!!dashboardStore.state.access?.canManageSettings);

  let youtubeReferenceChannelId = $state('');
  let desiredModuleStatus = $state('inactive');
  let deleteFeedModalOpen = $state(false);
  let pendingFeedDeletion = $state<{ id: string; name: string } | null>(null);
  const formAction = createAsyncActionState();

  // Daily Algo state
  let dailyAlgoProblems = $state<any[]>([]);
  let isFetchingAlgo = $state(false);
  let algoDraft = $state({
    title: '',
    description: '',
    solution: '',
    difficulty: 'moyen',
    language: 'fr'
  });

  onMount(async () => {
    await dashboardStore.refresh();
    if (moduleId === 'youtube') {
      youtubeReferenceChannelId = dashboardStore.state.youtubeReferenceChannelId || '';
    } else if (moduleId === 'dailyalgo') {
      await loadDailyAlgoProblems();
    }
  });

  async function loadDailyAlgoProblems() {
    isFetchingAlgo = true;
    try {
      dailyAlgoProblems = await fetchDailyAlgoProblems();
    } catch (err) {
      console.error(err);
      formAction.setError('Erreur lors du chargement des algorithmes.');
    } finally {
      isFetchingAlgo = false;
    }
  }

  async function submitDailyAlgoProblem() {
    if (!canManageSettings) {
      formAction.setError('Seuls les administrateurs peuvent ajouter un algo.');
      return;
    }

    if (!algoDraft.title.trim() || !algoDraft.description.trim() || !algoDraft.solution.trim()) {
      formAction.setError('Tous les champs requis doivent être remplis.');
      return;
    }

    await formAction.run(
      async () => {
        const ok = await createDailyAlgoProblem({ ...algoDraft });
        if (!ok) return false;
        
        algoDraft = { title: '', description: '', solution: '', difficulty: 'moyen', language: 'fr' };
        await loadDailyAlgoProblems();
        return true;
      },
      {
        successMessage: 'Exercice algorithmique ajouté avec succès.',
        failureMessage: 'Erreur lors de l’ajout de l’exercice.'
      }
    );
  }

  $effect(() => {
    desiredModuleStatus = module.status === 'active' ? 'active' : 'inactive';
  });

  function openDeleteFeedModal(feed: { id: string; name: string }) {
    if (!canManageSettings) {
      formAction.setError('Seuls les administrateurs peuvent modifier ce module.');
      return;
    }

    pendingFeedDeletion = { id: feed.id, name: feed.name };
    deleteFeedModalOpen = true;
  }

  function closeDeleteFeedModal() {
    deleteFeedModalOpen = false;
    pendingFeedDeletion = null;
  }

  async function confirmDeleteFeed() {
    if (!pendingFeedDeletion) return;

    const feedId = pendingFeedDeletion.id;
    closeDeleteFeedModal();

    await formAction.run(
      async () => {
        const success = await deleteFeed(feedId);
        if (!success) return false;
        await dashboardStore.refresh();
        return true;
      },
      {
        successMessage: 'Flux RSS supprimé.',
        failureMessage: 'Impossible de supprimer ce flux.'
      }
    );
  }

  async function handleSave() {
    formAction.clearFeedback();

    if (!canManageSettings) {
      formAction.setError('Seuls les administrateurs peuvent modifier ce module.');
      return;
    }

    if (moduleId === 'youtube') {
      await formAction.run(
        async () => {
          const success = await updateYouTubeSettings(youtubeReferenceChannelId.trim());
          if (!success) return false;
          await dashboardStore.refresh();
          return true;
        },
        {
          successMessage: 'Canal YouTube de référence enregistré avec succès.',
          failureMessage: 'Impossible d\'enregistrer le canal YouTube de référence.'
        }
      );
      return;
    }

    if (moduleId === 'rss') {
      formAction.setMessage('Les flux RSS se configurent directement dans la liste ci-dessous.');
      return;
    }

    await formAction.run(
      async () => {
        const success = await updateModuleStatus(moduleId, desiredModuleStatus);
        if (!success) return false;
        await dashboardStore.refresh();
        return true;
      },
      {
        successMessage: 'Configuration du module enregistrée avec succès.',
        failureMessage: 'Impossible de sauvegarder la configuration du module.'
      }
    );
  }

  const activeFeeds = $derived(dashboardStore.state.feeds);

  type FeedSortField = 'name' | 'category' | 'lastCheck' | 'status';
  let feedSearchQuery = $state('');
  let feedFilters = $state({
    statuses: [] as string[],
    categories: [] as string[],
  });
  let feedSortField = $state<FeedSortField>('lastCheck');
  let feedSortDirection = $state<'asc' | 'desc'>('desc');

  const feedStatusOptions = $derived<ColumnFilterOption[]>([
    { value: 'ok', label: 'Synchronisé' },
    { value: 'warning', label: 'Avertissement' },
    { value: 'error', label: 'Échec' },
  ]);
  const feedCategoryOptions = $derived<ColumnFilterOption[]>(
    [...new Set(activeFeeds.map((feed) => feed.category || 'Général'))]
      .sort((a, b) => a.localeCompare(b, 'fr'))
      .map((category) => ({ value: category, label: category }))
  );

  const hasActiveFeedFiltersOrSort = $derived(
    feedSearchQuery.trim().length > 0
      || feedFilters.statuses.length > 0
      || feedFilters.categories.length > 0
      || feedSortField !== 'lastCheck'
      || feedSortDirection !== 'desc'
  );

  const filteredFeeds = $derived.by(() => {
    const query = feedSearchQuery.trim().toLowerCase();
    return [...activeFeeds]
      .filter((feed) => {
        const category = feed.category || 'Général';
        const matchesQuery = !query
          || (feed.name || '').toLowerCase().includes(query)
          || (feed.url || '').toLowerCase().includes(query)
          || category.toLowerCase().includes(query);
        const matchesStatus = feedFilters.statuses.length === 0 || feedFilters.statuses.includes(feed.lastStatus);
        const matchesCategory = feedFilters.categories.length === 0 || feedFilters.categories.includes(category);
        return matchesQuery && matchesStatus && matchesCategory;
      })
      .sort((left, right) => {
        let result = 0;
        switch (feedSortField) {
          case 'name':
            result = (left.name || '').localeCompare((right.name || ''), 'fr');
            break;
          case 'category':
            result = (left.category || 'Général').localeCompare((right.category || 'Général'), 'fr');
            break;
          case 'lastCheck': {
            const leftDate = left.lastCheck ? new Date(left.lastCheck).getTime() : 0;
            const rightDate = right.lastCheck ? new Date(right.lastCheck).getTime() : 0;
            result = leftDate - rightDate;
            break;
          }
          case 'status':
            result = (left.lastStatus || '').localeCompare((right.lastStatus || ''), 'fr');
            break;
        }
        return feedSortDirection === 'asc' ? result : -result;
      });
  });

  function toggleFeedFilter(filterType: keyof typeof feedFilters, value: string) {
    const list = feedFilters[filterType];
    if (list.includes(value)) {
      feedFilters[filterType] = list.filter((entry) => entry !== value);
      return;
    }
    feedFilters[filterType] = [...list, value];
  }

  function toggleFeedSort(field: FeedSortField) {
    if (feedSortField === field) {
      feedSortDirection = feedSortDirection === 'asc' ? 'desc' : 'asc';
      return;
    }
    feedSortField = field;
    feedSortDirection = 'asc';
  }

  function feedSortDirectionFor(field: FeedSortField) {
    return feedSortField === field ? feedSortDirection : null;
  }

  function resetFeedFiltersAndSort() {
    feedSearchQuery = '';
    feedFilters = {
      statuses: [],
      categories: [],
    };
    feedSortField = 'lastCheck';
    feedSortDirection = 'desc';
  }

  let editingFeedId = $state(null);
  let feedDraft = $state({
    name: '',
    url: '',
    category: 'Général',
    includeKeywords: '',
    excludeKeywords: '',
    enabled: true,
    scanMinutes: 10
  });

  const rssStats = $derived.by(() => {
    const feeds = dashboardStore.state.feeds;
    const total = feeds.length;
    const active = feeds.filter((f) => f.enabled).length;
    const inError = feeds.filter((f) => f.lastStatus === 'error').length;
    const inWarning = feeds.filter((f) => f.lastStatus === 'warning').length;

    return { total, active, inError, inWarning };
  });

  function formatDate(isoDate) {
    if (!isoDate) return 'Jamais';
    return new Date(isoDate).toLocaleString('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  }

  function startEditFeed(feed) {
    if (!canManageSettings) {
      formAction.setError('Seuls les administrateurs peuvent modifier les flux RSS.');
      return;
    }

    editingFeedId = feed.id;
    feedDraft = {
      name: feed.name,
      url: feed.url,
      category: feed.category || 'Général',
      includeKeywords: (feed.includeKeywords || []).join(', '),
      excludeKeywords: (feed.excludeKeywords || []).join(', '),
      enabled: !!feed.enabled,
      scanMinutes: feed.scanMinutes || 10
    };
  }

  function cancelEditFeed() {
    editingFeedId = null;
  }

  function splitKeywords(value) {
    if (!value) return [];
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  function buildFeedPayload(feed, overrides: Record<string, any> = {}) {
    return {
      name: (overrides.name ?? feed.name ?? '').trim(),
      url: (overrides.url ?? feed.url ?? '').trim(),
      category: (overrides.category ?? feed.category ?? 'Général').trim() || 'Général',
      enabled: overrides.enabled ?? !!feed.enabled,
      scanMinutes: Number(overrides.scanMinutes ?? feed.scanMinutes ?? 10) || 10,
      includeKeywords: overrides.includeKeywords ?? feed.includeKeywords ?? [],
      excludeKeywords: overrides.excludeKeywords ?? feed.excludeKeywords ?? []
    };
  }

  async function saveFeed(feedId) {
    if (!canManageSettings) {
      formAction.setError('Seuls les administrateurs peuvent modifier les flux RSS.');
      return;
    }

    const payload = buildFeedPayload(feedDraft, {
      includeKeywords: splitKeywords(feedDraft.includeKeywords),
      excludeKeywords: splitKeywords(feedDraft.excludeKeywords)
    });

    if (!payload.name || !payload.url) {
      formAction.setError('Le nom et l\'URL du flux sont requis.');
      return;
    }

    await formAction.run(
      async () => {
        const success = await updateFeed(feedId, payload);
        if (!success) return false;
        editingFeedId = null;
        await dashboardStore.refresh();
        return true;
      },
      {
        successMessage: 'Flux RSS mis à jour.',
        failureMessage: 'Impossible de mettre à jour ce flux.'
      }
    );
  }

  async function toggleFeedEnabled(feed) {
    if (!canManageSettings) {
      formAction.setError('Seuls les administrateurs peuvent modifier les flux RSS.');
      return;
    }

    await formAction.run(
      async () => {
        const success = await updateFeed(feed.id, buildFeedPayload(feed, { enabled: !feed.enabled }));
        if (!success) return false;
        await dashboardStore.refresh();
        return true;
      },
      {
        successMessage: `Flux ${feed.enabled ? 'désactivé' : 'activé'} avec succès.`,
        failureMessage: 'Impossible de changer l\'état du flux.'
      }
    );
  }
</script>

<div class="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
  
  <div class="flex items-center gap-3 px-2">
    <a href="/modules" class="text-[10px] font-black text-on-surface-variant/40 hover:text-primary uppercase tracking-[0.25em] transition-colors">Catalogue</a>
    <span class="material-symbols-outlined text-sm text-slate-400 opacity-30">chevron_right</span>
    <span class="text-[10px] font-black text-primary uppercase tracking-[0.25em]">{module.name}</span>
  </div>

  
  <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 pb-8 border-b border-outline-variant/20">
    <div class="flex items-center gap-6">
      <div class="w-16 h-16 rounded-[1.75rem] {moduleMeta.headerToneClasses} flex items-center justify-center shadow-inner border group hover:rotate-6 transition-transform">
        <span class="material-symbols-outlined text-3xl">{moduleMeta.icon}</span>
      </div>
      <div>
        <h2 class="text-3xl font-black font-headline tracking-tighter leading-tight">{module.name}</h2>
        <div class="flex items-center gap-3 mt-1.5 px-3 py-1 bg-emerald-500/5 rounded-full border border-emerald-500/10 w-fit">
          <span class="w-1.5 h-1.5 rounded-full {module.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}"></span>
          <span class="text-[9px] font-black {module.status === 'active' ? 'text-emerald-600' : 'text-slate-500'} uppercase tracking-widest whitespace-nowrap">
            {module.status === 'active' ? 'Actif' : 'Inactif'}
          </span>
        </div>
      </div>
    </div>
    
    <div class="flex items-center gap-4">
      <RefreshButton
        onClick={() => dashboardStore.refresh()}
        loading={dashboardStore.state.loading}
        label="Rafraîchir"
        className="px-6 py-3.5 text-xs font-black uppercase tracking-widest rounded-2xl bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/30 text-on-surface-variant/60 hover:text-on-surface shadow-none"
        iconClass="text-base"
      />
      <button 
        onclick={handleSave}
        disabled={formAction.state.loading || !canManageSettings}
        class="px-10 py-3.5 bg-primary text-on-primary text-xs font-black rounded-2xl shadow-2xl shadow-primary/30 hover:scale-105 active:scale-95 transition-all uppercase tracking-widest"
      >
        {formAction.state.loading ? 'Enregistrement...' : 'Enregistrer'}
      </button>
    </div>
  </div>

  <InlineFeedback message={formAction.state.message} error={formAction.state.error} />

  {#if !canManageSettings}
    <div class="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs font-bold text-amber-700">
      Accès modérateur: cette page est en lecture seule.
    </div>
  {/if}

  <div class="grid grid-cols-12 gap-12">
    
    <div class="col-span-12 space-y-12 pb-24">
      
      <section class="space-y-8">
        <h3 class="text-xl font-black tracking-tight flex items-center gap-4">
          <div class="w-1.5 h-8 bg-primary rounded-full"></div>
          Configuration Générale
        </h3>
        <div class="premium-card p-10 rounded-[3rem] space-y-10 group">
          <div class="space-y-4">
            <label class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.25em] ml-2 block" for="name">Description du module</label>
            <p class="px-6 py-4 bg-surface-container-low border border-outline-variant/5 rounded-2xl text-sm italic opacity-70">
              {module.description}
            </p>
          </div>
          
          {#if moduleId === 'rss'}
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div class="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-5">
                <p class="text-[10px] uppercase tracking-[0.2em] font-black text-emerald-700/80">Flux actifs</p>
                <p class="text-3xl font-black text-emerald-700 mt-2">{rssStats.active}</p>
              </div>
              <div class="rounded-2xl bg-slate-500/10 border border-slate-500/20 p-5">
                <p class="text-[10px] uppercase tracking-[0.2em] font-black text-slate-700/80">Total flux</p>
                <p class="text-3xl font-black text-slate-700 mt-2">{rssStats.total}</p>
              </div>
              <div class="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-5">
                <p class="text-[10px] uppercase tracking-[0.2em] font-black text-amber-700/80">Avertissements</p>
                <p class="text-3xl font-black text-amber-700 mt-2">{rssStats.inWarning}</p>
              </div>
              <div class="rounded-2xl bg-red-500/10 border border-red-500/20 p-5">
                <p class="text-[10px] uppercase tracking-[0.2em] font-black text-red-700/80">Erreurs</p>
                <p class="text-3xl font-black text-red-700 mt-2">{rssStats.inError}</p>
              </div>
            </div>
          {/if}
        </div>
      </section>

      {#if moduleId === 'rss'}
        
        <section class="space-y-8">
          <div class="flex items-center justify-between px-2">
            <h3 class="text-xl font-black tracking-tight flex items-center gap-4">
              <div class="w-1.5 h-8 bg-primary rounded-full"></div>
              Flux RSS Connectés
            </h3>
          </div>

          <div class="rounded-3xl border border-outline-variant/15 bg-surface-container/60 p-4 md:p-5">
            <div class="flex flex-col gap-4">
              <div class="flex flex-col md:flex-row md:items-center gap-3 justify-between">
                <label class="relative w-full md:max-w-xl">
                  <span class="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/40 text-lg">search</span>
                  <FormInput
                    bind:value={feedSearchQuery}
                    type="search"
                    placeholder="Rechercher un flux, une URL, une catégorie..."
                    className="w-full rounded-full border border-outline-variant/20 bg-surface-container-low px-11 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/40 outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
                  />
                </label>

                <div class="flex items-center gap-3">
                  <span class="text-xs font-bold text-on-surface-variant">{filteredFeeds.length} / {activeFeeds.length} flux</span>
                  {#if hasActiveFeedFiltersOrSort}
                    <button
                      type="button"
                      onclick={resetFeedFiltersAndSort}
                      class="text-xs font-bold text-primary hover:text-primary/80 transition"
                    >
                      Réinitialiser
                    </button>
                  {/if}
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-3">
                <ColumnSortFilter
                  label="Nom"
                  sortDirection={feedSortDirectionFor('name')}
                  onToggleSort={() => toggleFeedSort('name')}
                />
                <ColumnSortFilter
                  label="Catégorie"
                  sortDirection={feedSortDirectionFor('category')}
                  onToggleSort={() => toggleFeedSort('category')}
                  options={feedCategoryOptions}
                  selectedValues={feedFilters.categories}
                  onToggleValue={(value) => toggleFeedFilter('categories', value)}
                />
                <ColumnSortFilter
                  label="Dernier check"
                  sortDirection={feedSortDirectionFor('lastCheck')}
                  onToggleSort={() => toggleFeedSort('lastCheck')}
                />
                <ColumnSortFilter
                  label="État"
                  sortDirection={feedSortDirectionFor('status')}
                  onToggleSort={() => toggleFeedSort('status')}
                  options={feedStatusOptions}
                  selectedValues={feedFilters.statuses}
                  onToggleValue={(value) => toggleFeedFilter('statuses', value)}
                />
              </div>
            </div>
          </div>

          <div class="space-y-4">
            {#each filteredFeeds as feed}
              <div class="premium-card p-6 rounded-3xl space-y-6 hover:border-primary/40 transition-all">
                <div class="flex flex-wrap items-start justify-between gap-4">
                  <div class="flex items-center gap-5 min-w-0">
                    <div class="w-12 h-12 {feed.enabled ? 'bg-orange-500/10 text-orange-600' : 'bg-slate-500/10 text-slate-400'} rounded-2xl flex items-center justify-center border border-current opacity-20">
                      <span class="material-symbols-outlined text-2xl">rss_feed</span>
                    </div>
                    <div class="min-w-0">
                      <p class="font-black text-on-surface tracking-tight leading-none mb-1.5">{feed.name}</p>
                      <p class="text-[10px] text-on-surface-variant/40 font-bold font-mono truncate">{feed.url}</p>
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    <button
                      onclick={() => toggleFeedEnabled(feed)}
                      disabled={!canManageSettings}
                      class="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] border transition-all {feed.enabled
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500 hover:text-white'
                        : 'bg-slate-500/10 text-slate-600 border-slate-500/20 hover:bg-slate-700 hover:text-white'}"
                    >
                      {feed.enabled ? 'Actif' : 'Inactif'}
                    </button>
                    <button
                      onclick={() => startEditFeed(feed)}
                      disabled={!canManageSettings}
                      class="p-3 text-on-surface-variant/40 hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                      title="Modifier le flux"
                    >
                      <span class="material-symbols-outlined">edit</span>
                    </button>
                    <button 
                      onclick={() => openDeleteFeedModal(feed)}
                      disabled={!canManageSettings}
                      class="p-3 text-on-surface-variant/20 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                      title="Supprimer le flux"
                    >
                      <span class="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div class="rounded-2xl bg-surface-container-low p-4 border border-outline-variant/10">
                    <p class="text-[9px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em] mb-1">Dernier état</p>
                    <div class="flex items-center gap-2">
                      <span class="w-2 h-2 rounded-full {feed.lastStatus === 'ok' ? 'bg-emerald-500' : feed.lastStatus === 'warning' ? 'bg-amber-500' : 'bg-red-500'}"></span>
                      <span class="text-xs font-black {feed.lastStatus === 'ok' ? 'text-emerald-600' : feed.lastStatus === 'warning' ? 'text-amber-600' : 'text-red-600'} uppercase tracking-[0.08em]">
                        {feed.lastStatus === 'ok' ? 'Synchronisé' : feed.lastStatus === 'warning' ? 'Avertissement' : 'Échec'}
                      </span>
                    </div>
                  </div>

                  <div class="rounded-2xl bg-surface-container-low p-4 border border-outline-variant/10">
                    <p class="text-[9px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em] mb-1">Dernière vérification</p>
                    <p class="text-xs font-bold text-on-surface">{formatDate(feed.lastCheck)}</p>
                  </div>

                  <div class="rounded-2xl bg-surface-container-low p-4 border border-outline-variant/10">
                    <p class="text-[9px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em] mb-1">Catégorie</p>
                    <p class="text-xs font-bold text-on-surface">{feed.category || 'Général'}</p>
                  </div>
                </div>

                <div class="flex flex-wrap gap-2">
                  <span class="text-[9px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em] self-center">Inclusions</span>
                  {#if feed.includeKeywords?.length}
                    {#each feed.includeKeywords as keyword}
                      <span class="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-700">{keyword}</span>
                    {/each}
                  {:else}
                    <span class="text-[10px] font-medium text-on-surface-variant/60">Aucun mot-clé</span>
                  {/if}
                </div>

                <div class="flex flex-wrap gap-2">
                  <span class="text-[9px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em] self-center">Exclusions</span>
                  {#if feed.excludeKeywords?.length}
                    {#each feed.excludeKeywords as keyword}
                      <span class="px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-[10px] font-bold text-red-700">{keyword}</span>
                    {/each}
                  {:else}
                    <span class="text-[10px] font-medium text-on-surface-variant/60">Aucun mot-clé</span>
                  {/if}
                </div>

                {#if editingFeedId === feed.id}
                  <div class="border-t border-outline-variant/15 pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-2">
                      <label for="feed-name" class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Nom du flux</label>
                      <FormInput
                        id="feed-name"
                        bind:value={feedDraft.name}
                        disabled={!canManageSettings}
                        className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/10 rounded-xl text-sm font-semibold outline-none focus:border-primary/40"
                        placeholder="Nom lisible"
                      />
                    </div>

                    <div class="space-y-2">
                      <label for="feed-category" class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Catégorie</label>
                      <FormInput
                        id="feed-category"
                        bind:value={feedDraft.category}
                        disabled={!canManageSettings}
                        className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/10 rounded-xl text-sm font-semibold outline-none focus:border-primary/40"
                        placeholder="Catégorie"
                      />
                    </div>

                    <div class="space-y-2 md:col-span-2">
                      <label for="feed-url" class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">URL du flux</label>
                      <FormInput
                        id="feed-url"
                        bind:value={feedDraft.url}
                        disabled={!canManageSettings}
                        className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/10 rounded-xl text-sm font-semibold outline-none focus:border-primary/40"
                        placeholder="https://..."
                      />
                    </div>

                    <div class="space-y-2">
                      <label for="feed-include-keywords" class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Mots-clés inclus (séparés par virgule)</label>
                      <FormInput
                        id="feed-include-keywords"
                        bind:value={feedDraft.includeKeywords}
                        disabled={!canManageSettings}
                        className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/10 rounded-xl text-sm font-semibold outline-none focus:border-primary/40"
                        placeholder="ia, open-source, release"
                      />
                    </div>

                    <div class="space-y-2">
                      <label for="feed-exclude-keywords" class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Mots-clés exclus (séparés par virgule)</label>
                      <FormInput
                        id="feed-exclude-keywords"
                        bind:value={feedDraft.excludeKeywords}
                        disabled={!canManageSettings}
                        className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/10 rounded-xl text-sm font-semibold outline-none focus:border-primary/40"
                        placeholder="sponsorisé, promo"
                      />
                    </div>

                    <div class="md:col-span-2 flex items-center justify-end gap-3 pt-2">
                      <button
                        onclick={cancelEditFeed}
                        class="px-5 py-2.5 rounded-xl border border-outline-variant/30 text-xs font-black uppercase tracking-[0.12em] text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container-low"
                      >
                        Annuler
                      </button>
                      <button
                        onclick={() => saveFeed(feed.id)}
                        disabled={!canManageSettings}
                        class="px-6 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-black uppercase tracking-[0.12em] shadow-lg shadow-primary/20 hover:scale-[1.01] transition-transform"
                      >
                        Enregistrer le flux
                      </button>
                    </div>
                  </div>
                {/if}
              </div>
            {/each}

            {#if activeFeeds.length === 0}
              <div class="p-20 text-center premium-card rounded-[3rem] border-dashed border-2 opacity-30 flex flex-col items-center">
                <span class="material-symbols-outlined text-6xl mb-6">rss_feed</span>
                <p class="text-[10px] font-black uppercase tracking-[0.3em]">Aucun flux n'est encore lié à cette instance</p>
              </div>
            {:else if filteredFeeds.length === 0}
              <div class="p-14 text-center premium-card rounded-[3rem] border-dashed border-2 opacity-55 flex flex-col items-center">
                <span class="material-symbols-outlined text-5xl mb-4">filter_alt_off</span>
                <p class="text-[10px] font-black uppercase tracking-[0.3em]">Aucun flux ne correspond aux filtres</p>
              </div>
            {/if}
          </div>
        </section>
      {:else if moduleId === 'youtube'}
        <section class="space-y-8">
          <h3 class="text-xl font-black tracking-tight flex items-center gap-4">
            <div class="w-1.5 h-8 bg-red-500 rounded-full"></div>
            Configuration YouTube
          </h3>
          <div class="premium-card p-10 rounded-[3rem] space-y-10 group">
             <div class="space-y-4">
                <label class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.25em] ml-2 block" for="yt-id">ID de la chaîne de référence</label>
                <FormInput
                  id="yt-id"
                  type="text"
                  bind:value={youtubeReferenceChannelId}
                  disabled={!canManageSettings}
                  className="w-full px-6 py-4 bg-surface-container-low border border-outline-variant/10 focus:border-red-500/30 focus:shadow-xl focus:shadow-red-500/5 transition-all rounded-2xl text-sm font-bold outline-none"
                  placeholder="UCxxxxxxxxxxxxxxxxx"
                />
                <p class="text-[10px] text-slate-400 ml-2">L'ID de la chaîne YouTube dont les nouvelles vidéos seront automatiquement publiées.</p>
             </div>
          </div>
        </section>
      {:else if moduleId === 'dailyalgo'}
        <section class="space-y-8">
          <h3 class="text-xl font-black tracking-tight flex items-center gap-4">
            <div class="w-1.5 h-8 bg-emerald-500 rounded-full"></div>
            Exercices Algorithmiques
          </h3>

          {#if canManageSettings}
            <div class="premium-card p-8 rounded-[2.5rem] space-y-6">
              <h4 class="text-lg font-black text-on-surface">Ajouter un exercice</h4>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-2">
                  <label for="dailyalgo-title" class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Titre</label>
                  <FormInput
                    id="dailyalgo-title"
                    bind:value={algoDraft.title}
                    className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/10 rounded-xl text-sm font-semibold outline-none focus:border-emerald-500/40"
                    placeholder="Titre de l'exercice"
                  />
                </div>
                <div class="space-y-2">
                  <label for="dailyalgo-difficulty" class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Difficulté</label>
                  <select
                    id="dailyalgo-difficulty"
                    bind:value={algoDraft.difficulty}
                    class="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/10 rounded-xl text-sm font-semibold outline-none focus:border-emerald-500/40 text-on-surface appearance-none"
                  >
                    <option value="facile">Facile</option>
                    <option value="moyen">Moyen</option>
                    <option value="difficile">Difficile</option>
                  </select>
                </div>
                <div class="space-y-2 md:col-span-2">
                  <label for="dailyalgo-description" class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Description (Markdown autorisé)</label>
                  <textarea
                    id="dailyalgo-description"
                    bind:value={algoDraft.description}
                    class="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/10 rounded-xl text-sm font-mono outline-none focus:border-emerald-500/40 min-h-[120px]"
                    placeholder="Description du problème..."
                  ></textarea>
                </div>
                <div class="space-y-2 md:col-span-2">
                  <label for="dailyalgo-solution" class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Solution attendue</label>
                  <textarea
                    id="dailyalgo-solution"
                    bind:value={algoDraft.solution}
                    class="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/10 rounded-xl text-sm font-mono outline-none focus:border-emerald-500/40 min-h-[120px]"
                    placeholder="Code de la solution optimale..."
                  ></textarea>
                </div>
                <div class="md:col-span-2 flex justify-end">
                  <button
                    onclick={submitDailyAlgoProblem}
                    disabled={formAction.state.loading}
                    class="px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-[0.12em] shadow-lg shadow-emerald-500/20 hover:scale-[1.01] transition-transform"
                  >
                    Ajouter l'exercice
                  </button>
                </div>
              </div>
            </div>
          {/if}

          <div class="space-y-4">
            {#if isFetchingAlgo}
              <div class="p-8 text-center text-sm font-bold text-on-surface-variant/50 animate-pulse">
                Chargement des exercices...
              </div>
            {:else if dailyAlgoProblems.length === 0}
              <div class="p-14 text-center premium-card rounded-[3rem] border-dashed border-2 opacity-55 flex flex-col items-center">
                <span class="material-symbols-outlined text-5xl mb-4">terminal</span>
                <p class="text-[10px] font-black uppercase tracking-[0.3em]">Aucun exercice disponible dans la base</p>
              </div>
            {:else}
              {#each dailyAlgoProblems as problem}
                <div class="premium-card p-6 rounded-3xl space-y-4 transition-all {problem.usedAt ? 'opacity-50 grayscale hover:grayscale-0 focus-within:grayscale-0' : 'hover:border-emerald-500/40'}">
                  <div class="flex items-start justify-between gap-4">
                    <div class="flex items-center gap-4">
                      <div class="w-10 h-10 rounded-xl flex items-center justify-center border {problem.difficulty === 'facile' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : problem.difficulty === 'moyen' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' : 'bg-red-500/10 text-red-600 border-red-500/20'}">
                        <span class="material-symbols-outlined text-xl">code</span>
                      </div>
                      <div>
                        <h4 class="font-black text-on-surface tracking-tight">{problem.title}</h4>
                        <div class="flex items-center gap-2 mt-1">
                          <span class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/60">{problem.difficulty}</span>
                          {#if problem.usedAt}
                            <span class="px-2 py-0.5 rounded border border-outline-variant/20 bg-surface-container text-[9px] font-bold text-on-surface-variant">Déjà utilisé</span>
                          {/if}
                        </div>
                      </div>
                    </div>
                  </div>
                  <p class="text-xs text-on-surface-variant/80 font-mono line-clamp-3 bg-surface-container-low p-3 rounded-xl">
                    {problem.description}
                  </p>
                </div>
              {/each}
            {/if}
          </div>
        </section>
      {:else}
        <section class="space-y-8">
            <h3 class="text-xl font-black tracking-tight flex items-center gap-4">
              <div class="w-1.5 h-8 bg-primary rounded-full"></div>
              Paramètres du module
            </h3>
            <div class="premium-card p-10 rounded-[3rem] space-y-8">
              <div class="flex items-center justify-between gap-6 p-6 rounded-2xl bg-surface-container-low border border-outline-variant/20">
                <div>
                  <p class="text-sm font-black text-on-surface">Activation du module</p>
                  <p class="text-xs text-on-surface-variant/70 mt-1">Définissez l'état opérationnel de ce module et appliquez via "Enregistrer".</p>
                </div>
                <ToggleSwitch
                  checked={desiredModuleStatus === 'active'}
                  disabled={!canManageSettings}
                  onToggle={() => (desiredModuleStatus = desiredModuleStatus === 'active' ? 'inactive' : 'active')}
                />
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onclick={() => router.goto('/settings')}
                  disabled={!canManageSettings}
                  class="px-5 py-4 rounded-2xl border border-outline-variant/30 bg-surface-container-low text-sm font-black uppercase tracking-wider text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all"
                >
                  Ouvrir les paramètres globaux
                </button>
                <button
                  onclick={() => router.goto('/activity')}
                  class="px-5 py-4 rounded-2xl border border-outline-variant/30 bg-surface-container-low text-sm font-black uppercase tracking-wider text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all"
                >
                  Consulter les actions récentes
                </button>
              </div>
            </div>
        </section>
      {/if}
    </div>
  </div>
</div>

{#if deleteFeedModalOpen && pendingFeedDeletion}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-feed-title" tabindex="-1" onclick={closeDeleteFeedModal}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-panel max-w-md space-y-4" onclick={(e) => e.stopPropagation()}>
      <div>
        <p class="text-[10px] font-black uppercase tracking-[0.2em] text-red-500">Confirmation</p>
        <h3 id="delete-feed-title" class="mt-1 text-lg font-black text-on-surface">Supprimer ce flux RSS ?</h3>
        <p class="mt-2 text-sm text-on-surface-variant">
          Le flux <span class="font-bold text-on-surface">{pendingFeedDeletion.name}</span> sera supprimé de cette instance.
        </p>
      </div>
      <div class="flex items-center justify-end gap-2">
        <button
          onclick={closeDeleteFeedModal}
          class="px-4 py-2 rounded-xl border border-outline-variant/30 text-xs font-black uppercase tracking-[0.12em] text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
        >
          Annuler
        </button>
        <button
          onclick={confirmDeleteFeed}
          class="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-black uppercase tracking-[0.12em] hover:bg-red-700 transition-colors"
        >
          Supprimer
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
</style>
