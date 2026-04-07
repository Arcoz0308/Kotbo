<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { deleteFeed, updateFeed, updateYouTubeSettings, updateModuleStatus } from '../lib/api';
  import { router } from 'tinro';
  import { getModuleMeta } from '../lib/moduleMeta';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';

  let { moduleId } = $props();

  const module = $derived(dashboardStore.state.modules.find(m => m.id === moduleId) || { 
    name: 'Chargement...', 
    description: 'Veuillez patienter...', 
    status: 'inactive' 
  });
  const moduleMeta = $derived(getModuleMeta(moduleId));

  let youtubeReferenceChannelId = $state('');
  let desiredModuleStatus = $state('inactive');
  const formAction = createAsyncActionState();

  onMount(async () => {
    await dashboardStore.refresh();
    if (moduleId === 'youtube') {
      youtubeReferenceChannelId = dashboardStore.state.youtubeReferenceChannelId || '';
    }
  });

  $effect(() => {
    desiredModuleStatus = module.status === 'active' ? 'active' : 'inactive';
  });

  async function handleDeleteFeed(feedId) {
    if (confirm('Voulez-vous vraiment supprimer ce flux ?')) {
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
  }

  async function handleSave() {
    formAction.clearFeedback();

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

  function buildFeedPayload(feed, overrides = {}) {
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
        disabled={formAction.state.loading}
        class="px-10 py-3.5 bg-primary text-on-primary text-xs font-black rounded-2xl shadow-2xl shadow-primary/30 hover:scale-105 active:scale-95 transition-all uppercase tracking-widest"
      >
        {formAction.state.loading ? 'Enregistrement...' : 'Enregistrer'}
      </button>
    </div>
  </div>

  <InlineFeedback message={formAction.state.message} error={formAction.state.error} />

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
          <div class="space-y-4">
            {#each activeFeeds as feed}
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
                      class="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] border transition-all {feed.enabled
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500 hover:text-white'
                        : 'bg-slate-500/10 text-slate-600 border-slate-500/20 hover:bg-slate-700 hover:text-white'}"
                    >
                      {feed.enabled ? 'Actif' : 'Inactif'}
                    </button>
                    <button
                      onclick={() => startEditFeed(feed)}
                      class="p-3 text-on-surface-variant/40 hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                      title="Modifier le flux"
                    >
                      <span class="material-symbols-outlined">edit</span>
                    </button>
                    <button 
                      onclick={() => handleDeleteFeed(feed.id)}
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
                      <input
                        id="feed-name"
                        bind:value={feedDraft.name}
                        class="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/10 rounded-xl text-sm font-semibold outline-none focus:border-primary/40"
                        placeholder="Nom lisible"
                      />
                    </div>

                    <div class="space-y-2">
                      <label for="feed-category" class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Catégorie</label>
                      <input
                        id="feed-category"
                        bind:value={feedDraft.category}
                        class="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/10 rounded-xl text-sm font-semibold outline-none focus:border-primary/40"
                        placeholder="Catégorie"
                      />
                    </div>

                    <div class="space-y-2 md:col-span-2">
                      <label for="feed-url" class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">URL du flux</label>
                      <input
                        id="feed-url"
                        bind:value={feedDraft.url}
                        class="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/10 rounded-xl text-sm font-semibold outline-none focus:border-primary/40"
                        placeholder="https://..."
                      />
                    </div>

                    <div class="space-y-2">
                      <label for="feed-include-keywords" class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Mots-clés inclus (séparés par virgule)</label>
                      <input
                        id="feed-include-keywords"
                        bind:value={feedDraft.includeKeywords}
                        class="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/10 rounded-xl text-sm font-semibold outline-none focus:border-primary/40"
                        placeholder="ia, open-source, release"
                      />
                    </div>

                    <div class="space-y-2">
                      <label for="feed-exclude-keywords" class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Mots-clés exclus (séparés par virgule)</label>
                      <input
                        id="feed-exclude-keywords"
                        bind:value={feedDraft.excludeKeywords}
                        class="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/10 rounded-xl text-sm font-semibold outline-none focus:border-primary/40"
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
                <input 
                  id="yt-id" 
                  type="text" 
                  bind:value={youtubeReferenceChannelId}
                  class="w-full px-6 py-4 bg-surface-container-low border border-outline-variant/10 focus:border-red-500/30 focus:shadow-xl focus:shadow-red-500/5 transition-all rounded-2xl text-sm font-bold outline-none" 
                  placeholder="UCxxxxxxxxxxxxxxxxx"
                />
                <p class="text-[10px] text-slate-400 ml-2">L'ID de la chaîne YouTube dont les nouvelles vidéos seront automatiquement publiées.</p>
             </div>
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
                <label class="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={desiredModuleStatus === 'active'}
                    onchange={() => (desiredModuleStatus = desiredModuleStatus === 'active' ? 'inactive' : 'active')}
                    class="sr-only peer"
                  />
                  <div class="w-14 h-7 bg-slate-200 dark:bg-slate-700 rounded-full peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onclick={() => router.goto('/settings')}
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

<style>
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
</style>
