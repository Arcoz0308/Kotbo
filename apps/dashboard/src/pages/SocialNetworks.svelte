<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import FormSelect from '../lib/components/FormSelect.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';
  import {
    fetchSocialFollows,
    addYoutubeFollow,
    deleteYoutubeFollow,
    addTwitchFollow,
    deleteTwitchFollow,
  } from '../lib/api';

  const actionState = createAsyncActionState();
  let loading = $state(false);
  let activeTab = $state<'youtube' | 'twitch'>('youtube');
  let showDevNotice = $state(true);

  // Cast type to prevent 'never' compiler errors
  const availableChannels = $derived((dashboardStore.state.discordChannels || []) as Array<{ id: string; name: string }>);

  // Form states
  let ytForm = $state({
    query: '',
    liveChannelId: '',
    shortChannelId: '',
    videoChannelId: '',
  });

  let twitchForm = $state({
    query: '',
    liveChannelId: '',
    otherChannelId: '',
  });

  // Followed channels states
  let youtubeFollows = $state<any[]>([]);
  let twitchFollows = $state<any[]>([]);

  // Permissions gate with any casting
  const canManage = $derived(
    !!(dashboardStore.state.featureAccess as any)?.social_networks?.canConfigure ||
    !!dashboardStore.state.access?.canManageSettings
  );

  async function loadData() {
    loading = true;
    try {
      await dashboardStore.refresh();
      const res = await fetchSocialFollows();
      if (res) {
        youtubeFollows = res.youtube || [];
        twitchFollows = res.twitch || [];
      }
    } catch (e) {
      console.error('Failed to load social follows:', e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadData();
  });

  async function handleAddYoutube() {
    if (!ytForm.query.trim()) {
      actionState.setError('Veuillez renseigner le lien ou le nom de la chaîne YouTube.');
      return;
    }

    await actionState.run(async () => {
      // In the backend, we use query as channelId and resolve it on the fly
      const payload = {
        channelId: ytForm.query.trim(),
        channelName: 'Résolution en cours...', // Resolved automatically by backend
        liveChannelId: ytForm.liveChannelId || null,
        shortChannelId: ytForm.shortChannelId || null,
        videoChannelId: ytForm.videoChannelId || null,
      };

      const res = await addYoutubeFollow(payload);
      if (!res) throw new Error('Erreur API');

      // Reset form
      ytForm = {
        query: '',
        liveChannelId: '',
        shortChannelId: '',
        videoChannelId: '',
      };

      // Reload
      const updated = await fetchSocialFollows();
      if (updated) youtubeFollows = updated.youtube || [];
      return true;
    }, { successMessage: 'Chaîne YouTube ajoutée avec succès !' });
  }

  async function handleUpdateYoutube(follow: any) {
    await actionState.run(async () => {
      const payload = {
        channelId: follow.channelId,
        channelName: follow.channelName,
        liveChannelId: follow.liveChannelId || null,
        shortChannelId: follow.shortChannelId || null,
        videoChannelId: follow.videoChannelId || null,
      };
      const res = await addYoutubeFollow(payload);
      if (!res) throw new Error('Erreur API');
      return true;
    }, { successMessage: 'Configuration YouTube mise à jour.' });
  }

  async function handleDeleteYoutube(id: string) {
    if (!confirm('Voulez-vous vraiment ne plus suivre cette chaîne YouTube ?')) return;

    await actionState.run(async () => {
      const ok = await deleteYoutubeFollow(id);
      if (!ok) throw new Error('Erreur API');

      youtubeFollows = youtubeFollows.filter(f => f.id !== id);
      return true;
    }, { successMessage: 'Chaîne YouTube supprimée du suivi.' });
  }

  async function handleAddTwitch() {
    if (!twitchForm.query.trim()) {
      actionState.setError('Veuillez renseigner le pseudo ou le lien Twitch.');
      return;
    }

    await actionState.run(async () => {
      // In the backend, getTwitchUserId extracts username from URL or uses the username raw
      const payload = {
        streamerName: twitchForm.query.trim(),
        liveChannelId: twitchForm.liveChannelId || null,
        otherChannelId: twitchForm.otherChannelId || null,
      };

      const res = await addTwitchFollow(payload);
      if (!res) throw new Error('Erreur API');

      // Reset form
      twitchForm = {
        query: '',
        liveChannelId: '',
        otherChannelId: '',
      };

      // Reload
      const updated = await fetchSocialFollows();
      if (updated) twitchFollows = updated.twitch || [];
      return true;
    }, { successMessage: 'Streamer Twitch ajouté avec succès !' });
  }

  async function handleUpdateTwitch(follow: any) {
    await actionState.run(async () => {
      const payload = {
        streamerName: follow.streamerName,
        liveChannelId: follow.liveChannelId || null,
        otherChannelId: follow.otherChannelId || null,
      };
      const res = await addTwitchFollow(payload);
      if (!res) throw new Error('Erreur API');
      return true;
    }, { successMessage: 'Configuration Twitch mise à jour.' });
  }

  async function handleDeleteTwitch(id: string) {
    if (!confirm('Voulez-vous vraiment ne plus suivre ce streamer Twitch ?')) return;

    await actionState.run(async () => {
      const ok = await deleteTwitchFollow(id);
      if (!ok) throw new Error('Erreur API');

      twitchFollows = twitchFollows.filter(f => f.id !== id);
      return true;
    }, { successMessage: 'Streamer Twitch supprimé du suivi.' });
  }
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  {#if showDevNotice}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm px-4">
      <div class="w-full max-w-lg rounded-4xl border border-outline-variant/15 bg-surface-container-low p-8 shadow-2xl shadow-black/30 text-center space-y-5">
        <div class="mx-auto w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
          <Papicon icon="Sparkle" size={30} />
        </div>
        <div class="space-y-2">
          <h2 class="text-2xl font-black tracking-tight text-on-surface">En cours de développement</h2>
          <p class="text-sm text-on-surface-variant/70">Le module Réseaux Sociaux est grisé temporairement pendant sa mise en place.</p>
        </div>
        <button
          onclick={() => showDevNotice = false}
          class="mx-auto inline-flex items-center justify-center rounded-2xl bg-primary px-5 py-3 text-[10px] font-black uppercase tracking-widest text-on-primary transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          Compris
        </button>
      </div>
    </div>
  {/if}

  <div class={showDevNotice ? 'opacity-45 grayscale pointer-events-none select-none' : ''}>
  <!-- Header Card -->
  <header class="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-surface-container-low/40 backdrop-blur-3xl p-8 rounded-4xl border border-outline-variant/30 relative overflow-hidden group">
    <div class="absolute -top-24 -right-24 w-64 h-64 bg-primary/10 rounded-full blur-[80px] group-hover:bg-primary/20 transition-all duration-700"></div>
    
    <div class="flex items-center gap-6 relative">
      <div class="w-16 h-16 bg-linear-to-br from-primary to-primary-container rounded-2xl flex items-center justify-center text-primary shadow-inner">
        <Papicon icon="Share" size={32} />
      </div>
      <div>
        <h1 class="text-3xl font-black tracking-tight leading-tight">Réseaux Sociaux</h1>
        <p class="text-on-surface-variant/80 font-medium font-headline">Abonnez-vous à des chaînes YouTube et Twitch et configurez leurs alertes Discord.</p>
      </div>
    </div>

    <div class="flex items-center gap-3 px-4 py-2 rounded-2xl border border-outline-variant/10 bg-surface-container-high/35 text-xs font-black uppercase tracking-widest text-on-surface-variant/70">
      <span class="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
      <span>En cours de développement</span>
    </div>

    <!-- Active State & Tab Switcher Info -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 relative">
      <!-- Tab switcher -->
      <div class="flex bg-surface-container-high/40 p-1.5 rounded-2xl border border-outline-variant/20">
        <button
          onclick={() => activeTab = 'youtube'}
          class="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 flex items-center gap-2 {activeTab === 'youtube' ? 'bg-red-600 text-white shadow-lg shadow-red-600/20 scale-[1.03]' : 'text-on-surface-variant/70 hover:text-on-surface'}"
        >
          <!-- YouTube Logo SVG -->
          <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.518 3.545 12 3.545 12 3.545s-7.518 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.87.508 9.388.508 9.388.508s7.518 0 9.388-.508a3.002 3.002 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
          <span>YouTube</span>
        </button>
        <button
          onclick={() => activeTab = 'twitch'}
          class="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 flex items-center gap-2 {activeTab === 'twitch' ? 'bg-[#9146FF] text-white shadow-lg shadow-[#9146FF]/20 scale-[1.03]' : 'text-on-surface-variant/70 hover:text-on-surface'}"
        >
          <!-- Twitch Logo SVG -->
          <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
          </svg>
          <span>Twitch</span>
        </button>
      </div>
    </div>
  </header>

  <!-- Module Enable/Disable Notice & Quick toggle -->
  <div class="bg-surface-container-low/40 p-6 rounded-3xl border border-outline-variant/20 flex flex-col md:flex-row md:items-center justify-between gap-6">
    <div class="space-y-1">
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
        <h4 class="font-bold text-sm">Statut des modules</h4>
      </div>
      <p class="text-xs text-on-surface-variant/80">YouTube & Twitch sont gérés par les tâches de fond. Veillez à ce que les modules correspondants soient activés dans le <a href="/modules" class="text-primary hover:underline font-bold">Catalogue Système</a>.</p>
    </div>
    <div class="flex items-center gap-4 bg-surface-container-high/40 px-5 py-3 rounded-2xl border border-outline-variant/10">
      <span class="text-[10px] font-black uppercase tracking-widest text-primary">Modules Actifs</span>
      <span class="px-2.5 py-1 bg-emerald-500/10 text-emerald-500 rounded-lg text-[10px] font-black uppercase">En ligne</span>
    </div>
  </div>

  <!-- Global actions status / Feedback -->
  <InlineFeedback message={actionState.state.message} error={actionState.state.error} />

  {#if loading}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div class="lg:col-span-1 p-8 bg-surface-container-low/30 border border-outline-variant/10 rounded-[2.5rem] space-y-6">
        <Skeleton width="60%" height="24px" />
        <Skeleton width="100%" height="180px" />
      </div>
      <div class="lg:col-span-2 p-8 bg-surface-container-low/30 border border-outline-variant/10 rounded-[2.5rem] space-y-6">
        <Skeleton width="40%" height="24px" />
        <Skeleton width="100%" height="80px" />
        <Skeleton width="100%" height="80px" />
      </div>
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      <!-- ADD FORM COLUMN -->
      <div class="lg:col-span-1">
        {#if activeTab === 'youtube'}
          <div class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-6 sticky top-8 shadow-sm">
            <h3 class="text-lg font-black flex items-center gap-2.5 text-red-500">
              <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.518 3.545 12 3.545 12 3.545s-7.518 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.87.508 9.388.508 9.388.508s7.518 0 9.388-.508a3.002 3.002 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              Suivre une chaîne YouTube
            </h3>
            
            <div class="space-y-4">
              <!-- Search query input -->
              <div class="space-y-1.5">
                <label for="yt-query" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">URL, Handle ou Nom de chaîne</label>
                <input
                  id="yt-query"
                  type="text"
                  placeholder="ex: https://youtube.com/@cyprien ou Cyprien"
                  bind:value={ytForm.query}
                  class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30 transition-all text-on-surface"
                />
              </div>

              <!-- Default Lives channel -->
              <div class="space-y-1.5">
                <label for="yt-live-chan" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Salon des Lives (En direct)</label>
                <FormSelect id="yt-live-chan" bind:value={ytForm.liveChannelId} className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-600/30 transition-all">
                  <option value="">— Par défaut (Salon Public) —</option>
                  {#each availableChannels as c}<option value={c.id}>#{c.name}</option>{/each}
                </FormSelect>
              </div>

              <!-- Default Shorts channel -->
              <div class="space-y-1.5">
                <label for="yt-short-chan" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Salon des Shorts</label>
                <FormSelect id="yt-short-chan" bind:value={ytForm.shortChannelId} className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-600/30 transition-all">
                  <option value="">— Par défaut (Même que vidéos) —</option>
                  {#each availableChannels as c}<option value={c.id}>#{c.name}</option>{/each}
                </FormSelect>
              </div>

              <!-- Default Videos channel -->
              <div class="space-y-1.5">
                <label for="yt-video-chan" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Salon des Vidéos</label>
                <FormSelect id="yt-video-chan" bind:value={ytForm.videoChannelId} className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-600/30 transition-all">
                  <option value="">— Par défaut (Salon Public) —</option>
                  {#each availableChannels as c}<option value={c.id}>#{c.name}</option>{/each}
                </FormSelect>
              </div>

              <!-- Submit button -->
              <button
                onclick={handleAddYoutube}
                disabled={!canManage}
                class="w-full mt-4 py-3.5 bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-lg shadow-red-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
              >
                Ajouter la chaîne
              </button>
            </div>
          </div>
        {:else}
          <div class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-6 sticky top-8 shadow-sm">
            <h3 class="text-lg font-black flex items-center gap-2.5 text-[#9146FF]">
              <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
              </svg>
              Suivre un streamer Twitch
            </h3>
            
            <div class="space-y-4">
              <!-- Streamer query input -->
              <div class="space-y-1.5">
                <label for="twitch-query" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Pseudo ou Lien Twitch</label>
                <input
                  id="twitch-query"
                  type="text"
                  placeholder="ex: xqc ou https://twitch.tv/xqc"
                  bind:value={twitchForm.query}
                  class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#9146FF]/30 transition-all text-on-surface"
                />
              </div>

              <!-- Live Channel Dropdown -->
              <div class="space-y-1.5">
                <label for="twitch-live-chan" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Salon des Lives (En direct)</label>
                <FormSelect id="twitch-live-chan" bind:value={twitchForm.liveChannelId} className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#9146FF]/30 transition-all">
                  <option value="">— Par défaut (Salon Public) —</option>
                  {#each availableChannels as c}<option value={c.id}>#{c.name}</option>{/each}
                </FormSelect>
              </div>

              <!-- Other Event Channel Dropdown -->
              <div class="space-y-1.5">
                <label for="twitch-other-chan" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Salon des Fins de Stream (Optionnel)</label>
                <FormSelect id="twitch-other-chan" bind:value={twitchForm.otherChannelId} className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#9146FF]/30 transition-all">
                  <option value="">— Aucun —</option>
                  {#each availableChannels as c}<option value={c.id}>#{c.name}</option>{/each}
                </FormSelect>
              </div>

              <!-- Submit button -->
              <button
                onclick={handleAddTwitch}
                disabled={!canManage}
                class="w-full mt-4 py-3.5 bg-[#9146FF] hover:bg-[#772ce8] text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-lg shadow-[#9146FF]/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
              >
                Suivre le streamer
              </button>
            </div>
          </div>
        {/if}
      </div>

      <!-- LIST COLUMN -->
      <div class="lg:col-span-2 space-y-6">
        <div class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-6 min-h-[400px]">
          
          {#if activeTab === 'youtube'}
            <div class="flex items-center justify-between border-b border-outline-variant/20 pb-4">
              <h3 class="text-xl font-black flex items-center gap-2">
                <svg class="w-5 h-5 fill-red-600" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.518 3.545 12 3.545 12 3.545s-7.518 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.87.508 9.388.508 9.388.508s7.518 0 9.388-.508a3.002 3.002 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
                Chaînes suivies ({youtubeFollows.length})
              </h3>
            </div>

            {#if youtubeFollows.length === 0}
              <div class="flex flex-col items-center justify-center py-20 text-center text-on-surface-variant/50">
                <Papicon icon="Info" size={48} class="mb-4 text-on-surface-variant/30" />
                <p class="font-bold">Aucune chaîne YouTube suivie pour le moment.</p>
                <p class="text-xs">Remplissez le formulaire à gauche pour commencer.</p>
              </div>
            {:else}
              <div class="divide-y divide-outline-variant/10 space-y-6 divide-none">
                {#each youtubeFollows as follow (follow.id)}
                  <div class="p-6 rounded-3xl bg-surface-container-high/15 border border-outline-variant/5 hover:border-outline-variant/10 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div class="space-y-1">
                      <h4 class="font-bold text-base flex items-center gap-2">
                        <span class="w-2.5 h-2.5 bg-red-600 rounded-full"></span>
                        {follow.channelName}
                      </h4>
                      <p class="text-xs text-on-surface-variant/40 font-mono">ID: {follow.channelId}</p>
                    </div>

                    <!-- Config channels inline -->
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 max-w-xl">
                      <div class="space-y-1">
                        <span class="text-[9px] font-bold text-on-surface-variant/50 uppercase">Lives</span>
                        <FormSelect bind:value={follow.liveChannelId} className="w-full bg-surface-container/60 border border-outline-variant/10 rounded-xl px-3 py-2 text-xs">
                          <option value="">— Par défaut —</option>
                          {#each availableChannels as c}<option value={c.id}>#{c.name}</option>{/each}
                        </FormSelect>
                      </div>

                      <div class="space-y-1">
                        <span class="text-[9px] font-bold text-on-surface-variant/50 uppercase">Shorts</span>
                        <FormSelect bind:value={follow.shortChannelId} className="w-full bg-surface-container/60 border border-outline-variant/10 rounded-xl px-3 py-2 text-xs">
                          <option value="">— Par défaut —</option>
                          {#each availableChannels as c}<option value={c.id}>#{c.name}</option>{/each}
                        </FormSelect>
                      </div>

                      <div class="space-y-1">
                        <span class="text-[9px] font-bold text-on-surface-variant/50 uppercase">Vidéos</span>
                        <FormSelect bind:value={follow.videoChannelId} className="w-full bg-surface-container/60 border border-outline-variant/10 rounded-xl px-3 py-2 text-xs">
                          <option value="">— Par défaut —</option>
                          {#each availableChannels as c}<option value={c.id}>#{c.name}</option>{/each}
                        </FormSelect>
                      </div>
                    </div>

                    <!-- Actions buttons -->
                    <div class="flex items-center gap-2 self-end md:self-center">
                      <button
                        onclick={() => handleUpdateYoutube(follow)}
                        disabled={!canManage}
                        title="Sauvegarder la configuration"
                        class="p-3 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl transition-all"
                      >
                        <Papicon icon="Gear" size={16} />
                      </button>
                      <button
                        onclick={() => handleDeleteYoutube(follow.id)}
                        disabled={!canManage}
                        title="Ne plus suivre"
                        class="p-3 bg-red-600/10 hover:bg-red-600/20 text-red-600 rounded-xl transition-all"
                      >
                        <Papicon icon="Trash" size={16} />
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          {:else}
            <!-- TWITCH LIST -->
            <div class="flex items-center justify-between border-b border-outline-variant/20 pb-4">
              <h3 class="text-xl font-black flex items-center gap-2">
                <svg class="w-5 h-5 fill-[#9146FF]" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
                </svg>
                Streamers suivis ({twitchFollows.length})
              </h3>
            </div>

            {#if twitchFollows.length === 0}
              <div class="flex flex-col items-center justify-center py-20 text-center text-on-surface-variant/50">
                <Papicon icon="Info" size={48} class="mb-4 text-on-surface-variant/30" />
                <p class="font-bold">Aucun streamer Twitch suivi pour le moment.</p>
                <p class="text-xs">Remplissez le formulaire à gauche pour commencer.</p>
              </div>
            {:else}
              <div class="divide-y divide-outline-variant/10 space-y-6 divide-none">
                {#each twitchFollows as follow (follow.id)}
                  <div class="p-6 rounded-3xl bg-surface-container-high/15 border border-outline-variant/5 hover:border-outline-variant/10 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div class="space-y-1">
                      <h4 class="font-bold text-base flex items-center gap-2">
                        {#if follow.isLive}
                          <span class="relative flex h-3 w-3">
                            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                            <span class="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
                          </span>
                        {:else}
                          <span class="w-3 h-3 bg-zinc-600 rounded-full"></span>
                        {/if}
                        {follow.streamerName}
                      </h4>
                      <p class="text-[10px] uppercase font-bold text-on-surface-variant/40">
                        {follow.isLive ? '🔴 En Live' : '⚫ Hors ligne'}
                      </p>
                    </div>

                    <!-- Config channels inline -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 max-w-md">
                      <div class="space-y-1">
                        <span class="text-[9px] font-bold text-on-surface-variant/50 uppercase">Salon Lives</span>
                        <FormSelect bind:value={follow.liveChannelId} className="w-full bg-surface-container/60 border border-outline-variant/10 rounded-xl px-3 py-2 text-xs">
                          <option value="">— Par défaut —</option>
                          {#each availableChannels as c}<option value={c.id}>#{c.name}</option>{/each}
                        </FormSelect>
                      </div>

                      <div class="space-y-1">
                        <span class="text-[9px] font-bold text-on-surface-variant/50 uppercase">Salon Fin de Stream</span>
                        <FormSelect bind:value={follow.otherChannelId} className="w-full bg-surface-container/60 border border-outline-variant/10 rounded-xl px-3 py-2 text-xs">
                          <option value="">— Aucun —</option>
                          {#each availableChannels as c}<option value={c.id}>#{c.name}</option>{/each}
                        </FormSelect>
                      </div>
                    </div>

                    <!-- Actions buttons -->
                    <div class="flex items-center gap-2 self-end md:self-center">
                      <button
                        onclick={() => handleUpdateTwitch(follow)}
                        disabled={!canManage}
                        title="Sauvegarder la configuration"
                        class="p-3 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl transition-all"
                      >
                        <Papicon icon="Gear" size={16} />
                      </button>
                      <button
                        onclick={() => handleDeleteTwitch(follow.id)}
                        disabled={!canManage}
                        title="Ne plus suivre"
                        class="p-3 bg-red-600/10 hover:bg-red-600/20 text-red-600 rounded-xl transition-all"
                      >
                        <Papicon icon="Trash" size={16} />
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
        </div>
      </div>
    </div>
  {/if}
  </div>
</div>
