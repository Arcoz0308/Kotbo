<script lang="ts">
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { refreshDashboardOnMount } from '../lib/dashboardLifecycle';
  import MetricCard from '../lib/components/MetricCard.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';

  refreshDashboardOnMount();

  const kpis = $derived([
    { label: 'Modules Actifs', val: dashboardStore.state.modules.filter(m => m.status === 'active').length, sub: `Sur ${dashboardStore.state.modules.length} au total`, icon: 'extension', toneClass: 'bg-primary/10 text-primary' },
    { label: 'Flux RSS', val: dashboardStore.state.feeds.length, sub: `${dashboardStore.state.feeds.filter(f => f.lastStatus === 'ok').length} opérationnels`, icon: 'rss_feed', toneClass: 'bg-orange-500/10 text-orange-600' },
    { label: 'Traductions', val: dashboardStore.state.analytics.translationCount, sub: 'Contenus traduits', icon: 'translate', toneClass: 'bg-blue-500/10 text-blue-600' },
    { label: 'Automatisations', val: dashboardStore.state.analytics.totalAutomations, sub: 'Total exécuté', icon: 'bolt', toneClass: 'bg-green-600/10 text-green-700' }
  ]);

  const trendMax = $derived(Math.max(...dashboardStore.state.analytics.activityTrend, 10));
  const trendLabels = $derived(Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toLocaleDateString('fr-FR', { weekday: 'short' }).toUpperCase().replace('.', '');
  }));
</script>


<div class="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
  <div>
    <p class="text-[10px] font-semibold uppercase tracking-[0.2em] text-on-surface-variant mb-2">Tableau de Bord</p>
    <h2 class="text-4xl font-extrabold text-primary tracking-tight font-headline">Analyse des Performances</h2>
  </div>
  <div class="flex items-center gap-3 font-inter">
    <RefreshButton
      onClick={() => dashboardStore.refresh()}
      loading={dashboardStore.state.loading}
      label="Actualiser"
    />
  </div>
</div>


<div class="grid grid-cols-12 gap-6 mb-8 font-inter">
  
  <div class="col-span-12 lg:col-span-8 section-card p-8">
    <div class="flex justify-between items-start mb-8">
      <div>
        <h3 class="text-xl font-bold text-slate-800 dark:text-white mb-1 font-headline">Intelligence Opérationnelle</h3>
        <p class="text-sm text-on-surface-variant">Activité cumulée pour {dashboardStore.state.guildName}</p>
      </div>
    </div>
    
    
    <div class="h-64 flex items-end justify-between gap-4 px-2 relative">
      <div class="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-50">
        <div class="w-full border-t border-slate-100 dark:border-slate-800"></div>
        <div class="w-full border-t border-slate-100 dark:border-slate-800"></div>
        <div class="w-full border-t border-slate-100 dark:border-slate-800"></div>
        <div class="w-full border-t border-slate-100 dark:border-slate-800"></div>
      </div>
      
      {#each dashboardStore.state.analytics.activityTrend as count, i}
        {@const h = (count / trendMax) * 70}
        <div class="relative group flex-1 h-full flex flex-col justify-end gap-1 items-center">
          <div class="absolute -top-6 bg-slate-800 text-white text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            {count} actions
          </div>
          <div class="w-full bg-primary/10 rounded-t-lg transition-all group-hover:bg-primary/20" style="height: {h + 15}%"></div>
          <div class="w-full bg-primary rounded-t-lg transition-all" style="height: {h}%"></div>
          <span class="text-[10px] font-semibold text-slate-400 mt-2">{trendLabels[i]}</span>
        </div>
      {/each}
    </div>
  </div>

  
  <div class="col-span-12 lg:col-span-4 section-card p-8">
    <h3 class="text-xl font-bold text-slate-800 dark:text-white mb-1 font-headline">Sources de Données</h3>
    <p class="text-sm text-on-surface-variant mb-8">Répartition des flux par statut</p>
    
    <div class="space-y-6">
      {#each dashboardStore.state.analytics.contentStatusDistribution as item}
        <div class="flex items-center gap-4">
          <span class="text-[10px] font-bold w-16 text-on-surface-variant leading-tight">{item.label}</span>
          <div class="flex-1 h-2 bg-surface-container rounded-full overflow-hidden">
            <div class="h-full bg-primary rounded-full transition-all duration-1000" style="width: {item.value}%"></div>
          </div>
          <span class="text-xs font-bold text-slate-700 dark:text-slate-300">{Math.round(item.value)}%</span>
        </div>
      {/each}
      <div class="pt-4 mt-4 border-t border-slate-50 dark:border-slate-800">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold text-on-surface-variant">Score de Santé Global</span>
          <span class="text-xs font-bold text-primary">{dashboardStore.state.analytics.healthStatus}%</span>
        </div>
        <div class="h-3 bg-surface-container rounded-full overflow-hidden">
          <div class="h-full bg-green-500 rounded-full transition-all duration-1000" style="width: {dashboardStore.state.analytics.healthStatus}%"></div>
        </div>
      </div>
    </div>
  </div>

  
  <div class="col-span-12 section-card p-8">
    <div class="flex justify-between items-center mb-6">
      <h3 class="text-xl font-bold text-slate-800 dark:text-white font-headline">État des Modules en Temps Réel</h3>
    </div>
    
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="border-b border-slate-50 dark:border-slate-800">
            <th class="pb-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Module</th>
            <th class="pb-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">État</th>
            <th class="pb-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Dernière Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-50 dark:divide-slate-800">
          {#each dashboardStore.state.modules as module}
            <tr class="group hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
              <td class="py-4">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-primary">
                    <span class="material-symbols-outlined text-lg">extension</span>
                  </div>
                  <span class="font-bold text-sm text-slate-800 dark:text-slate-200">{module.name}</span>
                </div>
              </td>
              <td class="py-4">
                <span class="px-3 py-1 rounded-full text-[10px] font-bold 
                  {module.status === 'active' ? 'bg-green-100 text-green-700' : 
                   module.status === 'error' ? 'bg-red-100 text-red-700' : 
                   'bg-slate-100 text-slate-700'}">
                  {module.status === 'active' ? 'Actif' : 
                   module.status === 'error' ? 'Erreur' : 'Inactif'}
                </span>
              </td>
              <td class="py-4 text-xs font-medium text-slate-600 dark:text-slate-400">
                {dashboardStore.state.auditTrail.find(a => a.module === module.name)?.action || 'Aucune action récente'}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>


<div class="grid grid-cols-1 md:grid-cols-4 gap-6 font-inter">
  {#each kpis as widget}
    <MetricCard
      label={widget.label}
      value={widget.val}
      note={widget.sub}
      icon={widget.icon}
      toneClass={widget.toneClass}
    />
  {/each}
</div>

