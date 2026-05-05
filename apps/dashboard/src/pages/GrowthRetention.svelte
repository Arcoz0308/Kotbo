<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { refreshDashboardOnMount } from '../lib/dashboardLifecycle';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import GrowthAndRetention from '../lib/components/analytics/GrowthAndRetention.svelte';
  import HourlyHeatmap from '../lib/components/analytics/HourlyHeatmap.svelte';
  import WeeklyComparison from '../lib/components/analytics/WeeklyComparison.svelte';
  import { fetchGrowthAndRetention, fetchHourlyHeatmap, fetchWeeklyComparison } from '../lib/api';


  let growthData: any = $state(null);
  let heatmapData: any = $state(null);
  let weeklyData: any = $state(null);
  let loading = $state(true);
  let error = $state('');
  let period = $state(90);
  let heatmapDays = $state(30);
  let activeTab = $state('growth');

  async function loadData() {
    loading = true;
    error = '';
    
    try {
      const [growth, heatmap, weekly] = await Promise.all([
        fetchGrowthAndRetention(period),
        fetchHourlyHeatmap(heatmapDays),
        fetchWeeklyComparison()
      ]);

      growthData = growth;
      heatmapData = heatmap;
      weeklyData = weekly;
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
            <Papicon icon="TrendingUp" size={20} />
          </div>
          <span class="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Croissance & Rétention</span>
        </div>
        <h1 class="text-4xl md:text-5xl font-black text-on-surface tracking-tight">Analyse de Communauté</h1>
        <p class="text-sm text-on-surface-variant/70">Suivi de la croissance, rétention et engagement</p>
      </div>
      <RefreshButton onclick={loadData} />
    </div>
  </div>

  <!-- Tabs -->
  <div class="flex gap-2 flex-wrap">
    {#each ['growth', 'heatmap', 'weekly'] as tab}
      <button
        onclick={() => activeTab = tab}
        class="px-4 py-2 rounded-xl font-bold text-xs transition-all {activeTab === tab 
          ? 'bg-primary text-primary-on' 
          : 'bg-surface-container-high/40 text-on-surface-variant hover:bg-surface-container-high'}"
      >
        {#if tab === 'growth'}
          <Papicon icon="TrendingUp" size={14} class="inline mr-2" />
          Croissance
        {:else if tab === 'heatmap'}
          <Papicon icon="Fire" size={14} class="inline mr-2" />
          Heatmap Horaire
        {:else}
          <Papicon icon="Calendar" size={14} class="inline mr-2" />
          Comparaison
        {/if}
      </button>
    {/each}
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
          ? 'bg-secondary text-secondary-on'
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
      <p class="text-xs font-black uppercase tracking-[0.3em] text-on-surface-variant/60">Chargement des données...</p>
    </div>
  {:else if growthData && heatmapData && weeklyData}
    {#if activeTab === 'growth'}
      <GrowthAndRetention data={growthData} />
    {:else if activeTab === 'heatmap'}
      <HourlyHeatmap data={heatmapData} />
    {:else if activeTab === 'weekly'}
      <WeeklyComparison data={weeklyData} />
    {/if}
  {/if}
</div>
