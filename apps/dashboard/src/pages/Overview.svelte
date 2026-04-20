<script lang="ts">
  import { authStore } from '../lib/stores/auth.svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { refreshDashboardOnMount } from '../lib/dashboardLifecycle';
  import RefreshButton from '../lib/components/RefreshButton.svelte';

  refreshDashboardOnMount();

  
  $effect(() => {
    if (authStore.selectedGuildId) {
      dashboardStore.refresh();
    }
  });

  
  const activeModulesCount = $derived(dashboardStore.state.modules.filter(m => m.status === 'active').length);
  const totalModulesCount = $derived(dashboardStore.state.modules.length);
  const errorModulesCount = $derived(dashboardStore.state.modules.filter(m => m.status === 'error').length);
  
  
  const jobSuccessRate = "98.5%";

  const LOGO_URL_SERVEUR = "/favicon.svg";
</script>

<div class="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
  
  <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
    <div class="flex items-center gap-6">
      <img src={LOGO_URL_SERVEUR} alt="Bot Logo" class="w-20 h-20 rounded-3xl shadow-2xl shadow-primary/10 overflow-hidden shrink-0"/>
      <div>
        <h2 class="text-4xl font-black tracking-tighter text-on-surface font-headline leading-tight">
          {#if dashboardStore.state.guildName}
            {dashboardStore.state.guildName}
          {:else}
            <div class="h-10 w-64 bg-surface-variant/50 rounded-lg animate-pulse inline-block align-middle"></div>
          {/if}
        </h2>
        <p class="text-on-surface-variant/70 mt-1 font-medium italic">Gérez et surveillez les performances de votre architecture bot.</p>
      </div>
    </div>
    
    <div class="flex gap-3">
      <RefreshButton
        onClick={() => dashboardStore.refresh()}
        loading={dashboardStore.state.loading}
        iconOnly={true}
        ariaLabel="Rafraîchir les données"
        iconClass=""
      />
      <div class="bg-emerald-500/10 px-5 py-2.5 rounded-2xl border border-emerald-500/20 flex items-center gap-3">
        <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
        <span class="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">{dashboardStore.state.loading ? 'Synchronisation...' : 'Système Actif'}</span>
      </div>
    </div>
  </div>

  {#if dashboardStore.state.error}
    <div class="bg-error-container/10 border border-error/20 p-5 rounded-4xl text-error text-sm font-bold flex items-center gap-4 animate-in slide-in-from-top-2">
      <span class="material-symbols-outlined text-2xl">report_problem</span>
      <span class="tracking-tight">{dashboardStore.state.error}</span>
    </div>
  {/if}

  
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
    
    <div class="premium-card p-8 rounded-[2.5rem] flex flex-col justify-between group">
      <div class="flex items-start justify-between mb-6">
        <div class="w-12 h-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
          <span class="material-symbols-outlined text-2xl">extension</span>
        </div>
        <span class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Modules</span>
      </div>
      <div>
        <div class="flex items-baseline gap-1">
          <span class="text-5xl font-black text-on-surface tracking-tighter">{activeModulesCount}</span>
          <span class="text-xl text-on-surface-variant/40 font-bold">/{totalModulesCount}</span>
        </div>
        <div class="mt-6 w-full bg-surface-container-highest rounded-full h-2 overflow-hidden">
          <div class="bg-primary h-full rounded-full transition-all duration-1000" style="width: {(activeModulesCount / totalModulesCount) * 100 || 0}%"></div>
        </div>
      </div>
    </div>

    
    <div class="premium-card p-8 rounded-[2.5rem] flex flex-col justify-between group">
      <div class="flex items-start justify-between mb-6">
        <div class="w-12 h-12 rounded-2xl bg-error/5 flex items-center justify-center text-error group-hover:scale-110 transition-transform">
          <span class="material-symbols-outlined text-2xl">report</span>
        </div>
        <span class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Alertes</span>
      </div>
      <div>
        <div class="text-5xl font-black text-on-surface tracking-tighter">{errorModulesCount}</div>
        <p class="text-[11px] font-bold mt-4 flex items-center gap-2">
          {#if errorModulesCount === 0}
            <span class="text-emerald-500 flex items-center gap-1.5 uppercase tracking-wider">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Santé Parfaite
            </span>
          {:else}
            <span class="text-error flex items-center gap-1.5 uppercase tracking-wider animate-pulse">
              <span class="w-1.5 h-1.5 rounded-full bg-error"></span>
              Action Requise
            </span>
          {/if}
        </p>
      </div>
    </div>

    
    <div class="premium-card p-8 rounded-[2.5rem] flex flex-col justify-between group">
      <div class="flex items-start justify-between mb-6">
        <div class="w-12 h-12 rounded-2xl bg-secondary/5 flex items-center justify-center text-secondary group-hover:scale-110 transition-transform">
          <span class="material-symbols-outlined text-2xl">database</span>
        </div>
        <span class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Contenu</span>
      </div>
      <div>
        <div class="text-5xl font-black text-on-surface tracking-tighter">{dashboardStore.state.contentItems.length}</div>
        <p class="text-[11px] font-bold text-on-surface-variant/60 mt-4 uppercase tracking-widest">Articles indexés</p>
      </div>
    </div>

    
    <div class="premium-card p-8 rounded-[2.5rem] flex flex-col justify-between group">
      <div class="flex items-start justify-between mb-6">
        <div class="w-12 h-12 rounded-2xl bg-tertiary/5 flex items-center justify-center text-tertiary group-hover:scale-110 transition-transform">
          <span class="material-symbols-outlined text-2xl">bolt</span>
        </div>
        <span class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Uptime</span>
      </div>
      <div>
        <div class="text-5xl font-black text-on-surface tracking-tighter">{jobSuccessRate}</div>
        <div class="mt-6 flex gap-1.5">
          {#each Array(5) as _, i}
            <div class="h-1.5 flex-1 {i < 4 ? 'bg-emerald-500' : 'bg-emerald-500/20'} rounded-full"></div>
          {/each}
        </div>
      </div>
    </div>
  </div>

  
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-10">
    <div class="lg:col-span-1 space-y-8">
      <div class="bg-surface-container-low/50 backdrop-blur-xl rounded-[2.5rem] p-8 border border-outline-variant/30">
        <h3 class="text-xl font-black mb-8 flex items-center gap-3">
          <span class="material-symbols-outlined text-primary">dynamic_feed</span>
          Flux Récents
        </h3>
        <div class="space-y-4">
          {#each dashboardStore.state.auditTrail.slice(0, 3) as entry}
             <div class="p-4 rounded-2xl bg-white/50 dark:bg-slate-900/50 border border-outline-variant/20 group hover:border-primary/30 transition-colors">
               <div class="flex items-center gap-3 mb-2">
                 <div class="w-2 h-2 rounded-full {entry.eventType === 'Automatique' ? 'bg-primary' : 'bg-secondary'}"></div>
                 <span class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-widest">{entry.module}</span>
               </div>
               <p class="text-sm font-bold text-on-surface leading-tight">{entry.action}</p>
             </div>
          {/each}
        </div>
        <a href="/activity" class="mt-8 block text-center py-3 rounded-2xl bg-primary/5 text-primary text-xs font-black uppercase tracking-widest hover:bg-primary hover:text-on-primary transition-all">Consulter les logs</a>
      </div>
    </div>

    <div class="lg:col-span-2">
      <div class="premium-card rounded-[3rem] p-10 h-full relative overflow-hidden">
        <div class="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-[100px] -mr-32 -mt-32"></div>
        <div class="relative z-10">
          <div class="flex justify-between items-center mb-10">
            <h3 class="text-2xl font-black tracking-tight">Performances Modules</h3>
            <span class="material-symbols-outlined text-on-surface-variant/40">query_stats</span>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
            {#each dashboardStore.state.modules as module}
              <div class="space-y-3 group">
                <div class="flex justify-between items-end">
                  <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-primary/60 text-xl group-hover:scale-110 transition-transform">
                       {module.id === 'rss' ? 'rss_feed' : module.id === 'youtube' ? 'video_library' : 'extension'}
                    </span>
                    <span class="text-sm font-bold">{module.name}</span>
                  </div>
                  <span class="text-[10px] font-black text-primary uppercase tracking-widest">{module.uptime}% Stable</span>
                </div>
                <div class="w-full bg-surface-container-highest rounded-full h-2.5 overflow-hidden p-0.5 border border-outline-variant/30">
                  <div class="bg-linear-to-r from-primary to-secondary h-full rounded-full transition-all duration-1000" style="width: {module.uptime}%"></div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
