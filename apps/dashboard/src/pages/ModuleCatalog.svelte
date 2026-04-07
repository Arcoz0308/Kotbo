<script lang="ts">
  import { router } from 'tinro';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { updateModuleStatus } from '../lib/api';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import FilterChips from '../lib/components/FilterChips.svelte';
  import { getModuleIcon } from '../lib/moduleMeta';
  import { refreshDashboardOnMount } from '../lib/dashboardLifecycle';

  refreshDashboardOnMount();

  async function toggleModule(moduleId, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const success = await updateModuleStatus(moduleId, newStatus);
    if (success) {
      dashboardStore.refresh();
    }
  }

  let filter = $state('Tous');
  const filteredModules = $derived(
    dashboardStore.state.modules.filter(m => {
      if (filter === 'Tous') return true;
      if (filter === 'Actifs') return m.status === 'active';
      if (filter === 'Inactifs') return m.status === 'inactive';
      if (filter === 'Erreurs') return m.status === 'error';
      return true;
    })
  );

  const activeCount = $derived(dashboardStore.state.modules.filter(m => m.status === 'active').length);
  const errorCount = $derived(dashboardStore.state.modules.filter(m => m.status === 'error').length);
  const inactiveCount = $derived(dashboardStore.state.modules.filter(m => m.status === 'inactive').length);
</script>


<section class="mb-10 font-inter">
  <div class="flex flex-col md:flex-row md:items-end justify-between gap-6">
    <div>
      <h2 class="text-3xl font-extrabold tracking-tight text-primary font-headline">Catalogue de modules</h2>
      <p class="text-on-surface-variant mt-1">Gérez et configurez les extensions actives de votre instance éditoriale ({dashboardStore.state.guildName}).</p>
    </div>
    <FilterChips
      options={['Tous', 'Actifs', 'Inactifs', 'Erreurs']}
      selected={filter}
      onSelect={(value) => (filter = value)}
      getCount={() => 0}
    />
  </div>
</section>


<section class="pb-12 font-inter">
  {#if dashboardStore.state.loading && dashboardStore.state.modules.length === 0}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each Array(6) as _}
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-6 h-64 animate-pulse border border-slate-100 dark:border-slate-800"></div>
      {/each}
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each filteredModules as module}
        <div class="group bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all border border-slate-100 dark:border-slate-800 hover:border-primary/20">
          <div class="flex justify-between items-start mb-4">
            <div class="p-3 rounded-xl {module.status === 'active' ? 'bg-primary/10 text-primary' : module.status === 'error' ? 'bg-error-container/20 text-error' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}">
              <span class="material-symbols-outlined">
                {getModuleIcon(module.id)}
              </span>
            </div>
            <ToggleSwitch
              checked={module.status === 'active'}
              onToggle={() => toggleModule(module.id, module.status)}
            />
          </div>
          <h3 class="text-lg font-bold text-slate-800 dark:text-white font-headline">{module.name}</h3>
          <p class="text-sm text-on-surface-variant mt-1 line-clamp-2 leading-relaxed">{module.description}</p>
          
          <div class="mt-6 flex flex-wrap gap-3 items-center">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider 
              {module.status === 'active' ? 'bg-green-100 text-green-700' : module.status === 'error' ? 'bg-error-container text-on-error-container' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}">
              {module.status === 'active' ? 'Actif' : module.status === 'error' ? 'Erreur' : 'Inactif'}
            </span>
            <span class="inline-flex items-center gap-1.5 text-xs font-bold {module.status === 'error' ? 'text-red-500' : module.status === 'active' ? 'text-green-500' : 'text-slate-400'}">
              <span class="w-2 h-2 rounded-full {module.status === 'error' ? 'bg-red-500' : module.status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}"></span>
              {module.status === 'active' ? 'Opérationnel' : module.status === 'error' ? (module.errorMessage || 'Erreur critique') : 'En veille'}
            </span>
          </div>
          
          <div class="mt-6 pt-6 border-t border-slate-50 dark:border-slate-800 flex items-center justify-between">
            <div class="text-[11px] text-on-surface-variant">
              <span class="block font-medium uppercase opacity-60">Interactions</span>
              <span class="text-on-surface font-bold">{module.interactions}</span>
            </div>
            <a href="/module-settings/{module.id}" class="px-4 py-2 text-xs font-bold text-primary bg-primary/5 hover:bg-primary/10 rounded-lg transition-colors">Détails</a>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>


<section class="grid grid-cols-1 md:grid-cols-4 gap-6 font-inter">
  <div class="md:col-span-2 bg-slate-900 rounded-3xl p-8 text-white flex flex-col justify-between shadow-xl relative overflow-hidden">
    <div class="absolute top-0 right-0 p-8 opacity-10">
      <span class="material-symbols-outlined text-8xl">hub</span>
    </div>
    <div>
      <h4 class="text-xs font-bold uppercase tracking-[0.2em] opacity-60 mb-2">État Global</h4>
      <p class="text-3xl font-extrabold font-headline leading-tight">Instance {dashboardStore.state.loading ? '...' : (errorCount > 0 ? 'partiellement dégradée' : 'opérationnelle')}</p>
    </div>
    <div class="mt-8 flex items-center gap-4">
      <div class="flex -space-x-2">
        <div class="w-10 h-10 rounded-full border-4 border-slate-900 bg-green-500 flex items-center justify-center text-[11px] font-bold">{activeCount}</div>
        <div class="w-10 h-10 rounded-full border-4 border-slate-900 bg-amber-500 flex items-center justify-center text-[11px] font-bold">{inactiveCount}</div>
        <div class="w-10 h-10 rounded-full border-4 border-slate-900 bg-red-500 flex items-center justify-center text-[11px] font-bold">{errorCount}</div>
      </div>
      <p class="text-xs font-medium opacity-70">Modules actifs / inactifs / erreur</p>
    </div>
  </div>
  
  <div class="bg-primary/5 dark:bg-primary/10 rounded-3xl p-8 flex flex-col justify-between border border-primary/10">
    <span class="material-symbols-outlined text-primary text-3xl">bolt</span>
    <div>
      <p class="text-3xl font-extrabold text-primary font-headline">{dashboardStore.state.contentItems.length}</p>
      <p class="text-xs font-bold text-primary/70 uppercase tracking-widest mt-1">Interactions Totales</p>
    </div>
  </div>
  
  <div class="bg-slate-50 dark:bg-slate-800 rounded-3xl p-8 flex flex-col justify-between border border-slate-100 dark:border-slate-700">
    <span class="material-symbols-outlined text-slate-400 text-3xl">api</span>
    <div>
      <p class="text-3xl font-extrabold text-slate-800 dark:text-white font-headline">Synchro</p>
      <p class="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Statut API {dashboardStore.state.error ? 'OFF' : 'ON'}</p>
    </div>
  </div>
</section>

