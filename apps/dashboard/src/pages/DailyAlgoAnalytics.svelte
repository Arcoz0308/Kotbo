<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { refreshDashboardOnMount } from '../lib/dashboardLifecycle';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import DailyAlgoAnalyticsCard from '../lib/components/analytics/DailyAlgoAnalyticsCard.svelte';
  import { fetchDailyAlgoAnalytics } from '../lib/api';


  let data: any = $state(null);
  let loading = $state(true);
  let error = $state('');
  let period = $state(30);

  async function loadData() {
    loading = true;
    error = '';
    
    try {
      const result = await fetchDailyAlgoAnalytics(period);
      data = result;
    } catch (e) {
      error = 'Erreur lors du chargement des données';
      console.error(e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadData();
  });
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 max-w-7xl mx-auto px-4 md:px-8">
  <!-- Header -->
  <div class="relative overflow-hidden bg-surface-container-low/30 p-8 md:p-12 rounded-[3rem] border border-outline-variant/10 group">
    <div class="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors duration-1000"></div>
    <div class="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/4 w-64 h-64 bg-secondary/5 rounded-full blur-2xl group-hover:bg-secondary/10 transition-colors duration-1000"></div>
    
    <div class="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
      <div class="space-y-2">
        <div class="flex items-center gap-3">
          <div class="bg-primary/10 p-2 rounded-xl text-primary">
            <Papicon icon="Code" size={20} />
          </div>
          <span class="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Daily Algo</span>
        </div>
        <h1 class="text-4xl md:text-5xl font-black text-on-surface tracking-tight">Analytics Challenges</h1>
        <p class="text-sm text-on-surface-variant/70">Performances, participations et tendances</p>
      </div>
      <RefreshButton onclick={loadData} />
    </div>
  </div>

  <!-- Period Controls -->
  <div class="flex gap-4 flex-wrap">
    {#each [7, 30, 90] as p}
      <button
        onclick={() => {
          period = p;
          loadData();
        }}
        class="px-4 py-2 rounded-lg text-sm font-bold transition-all {period === p
          ? 'bg-primary text-primary-on'
          : 'bg-surface-container-high/40 text-on-surface-variant hover:bg-surface-container-high'}"
      >
        {p} jours
      </button>
    {/each}
  </div>

  {#if error}
    <div class="p-4 rounded-2xl bg-error/10 border border-error/20 text-error flex items-center gap-2">
      <Papicon icon="alert-octagon" size={20} />{error}
    </div>
  {:else if loading}
    <div class="flex flex-col items-center justify-center py-24">
      <div class="relative mb-6">
        <div class="absolute -inset-4 rounded-full bg-primary/10 blur-xl animate-pulse"></div>
        <Papicon icon="loader" size={48} class="animate-spin text-primary" />
      </div>
      <p class="text-xs font-black uppercase tracking-[0.3em] text-on-surface-variant/60">Analyse des challenges...</p>
    </div>
  {:else if data}
    <DailyAlgoAnalyticsCard {data} />
  {/if}
</div>
