<script lang="ts">
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { refreshDashboardOnMount } from '../lib/dashboardLifecycle';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import FormSelect from '../lib/components/FormSelect.svelte';

  refreshDashboardOnMount();

  let searchQuery = $state('');
  let categoryFilter = $state('Toutes les catégories');
  let severityFilter = $state('Tous les types');

  const filteredLogs = $derived(
    dashboardStore.state.auditTrail.filter(log => {
      const matchesSearch = searchQuery === '' || 
        log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.module.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.user.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = categoryFilter === 'Toutes les catégories' || 
        log.module === categoryFilter;

      const matchesType = severityFilter === 'Tous les types' ||
        log.eventType === severityFilter;

      return matchesSearch && matchesCategory && matchesType;
    })
  );

  const stats = $derived([
    { label: 'Actions (Total)', val: dashboardStore.state.auditTrail.length, sub: 'Log complet', subClass: 'text-primary' },
    { label: 'Automatique', val: dashboardStore.state.auditTrail.filter(l => l.eventType === 'Automatique').length, sub: 'Système', subClass: 'text-blue-500' },
    { label: 'Manuel', val: dashboardStore.state.auditTrail.filter(l => l.eventType === 'Manuel').length, sub: 'Utilisateur', subClass: 'text-amber-600' },
    { label: 'Modules', val: new Set(dashboardStore.state.auditTrail.map(l => l.module)).size, sub: 'Sources', subClass: 'text-green-600' }
  ]);
</script>


<div class="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 font-inter">
  <div>
    <h2 class="text-3xl font-extrabold text-primary tracking-tight font-headline">Journal d'Activité</h2>
    <p class="text-on-surface-variant mt-1 leading-relaxed">Historique complet des actions système et de modération pour {dashboardStore.state.guildName}.</p>
  </div>
  <div class="flex items-center gap-3">
    <RefreshButton
      onClick={() => dashboardStore.refresh()}
      loading={dashboardStore.state.loading}
      label="Actualiser"
      className="px-5 py-2.5 font-bold shadow-lg shadow-primary/10"
      iconClass="text-lg"
    />
  </div>
</div>


<div class="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 mb-8 font-inter">
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <div class="space-y-2">
      <label class="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest ml-1" for="search">Recherche</label>
      <div class="relative">
        <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
        <FormInput
          id="search"
          type="text"
          bind:value={searchQuery}
          placeholder="Action, Détails, Module, Utilisateur..."
          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-primary/20 transition-all"
        />
      </div>
    </div>
    <div class="space-y-2">
      <label class="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest ml-1" for="category">Module</label>
      <FormSelect
        id="category"
        bind:value={categoryFilter}
        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-primary/20 transition-all"
      >
        <option>Toutes les catégories</option>
        {#each [...new Set(dashboardStore.state.auditTrail.map(l => l.module))] as mod}
          <option value={mod}>{mod}</option>
        {/each}
      </FormSelect>
    </div>
    <div class="space-y-2">
      <label class="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest ml-1" for="severity">Type</label>
      <FormSelect id="severity" bind:value={severityFilter} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-primary/20 transition-all">
        <option>Tous les types</option>
        <option>Automatique</option>
        <option>Manuel</option>
      </FormSelect>
    </div>
  </div>
</div>


<div class="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden font-inter">
  <div class="overflow-x-auto">
    <table class="w-full text-left border-collapse">
      <thead>
        <tr class="bg-slate-50 dark:bg-white/5">
          <th class="px-6 py-5 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Horodatage</th>
          <th class="px-6 py-5 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Utilisateur</th>
          <th class="px-6 py-5 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Module / Source</th>
          <th class="px-6 py-5 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Action</th>
          <th class="px-6 py-5 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Détails</th>
          <th class="px-6 py-5 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest text-center">Type</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-50 dark:divide-slate-800">
        {#each filteredLogs as entry}
          <tr class="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
            <td class="px-6 py-6">
              <div class="text-xs">
                <p class="font-bold text-slate-800 dark:text-slate-200">{new Date(entry.dateIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
                <p class="text-[10px] text-slate-400 font-medium">{new Date(entry.dateIso).toLocaleDateString()}</p>
              </div>
            </td>
            <td class="px-6 py-6">
              <span class="inline-flex max-w-40 truncate rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {entry.user}
              </span>
            </td>
            <td class="px-6 py-6 font-bold text-sm text-primary">
              {entry.module}
            </td>
            <td class="px-6 py-6 font-medium text-sm text-slate-600 dark:text-slate-200">
              {entry.action}
            </td>
            <td class="px-6 py-6 max-w-xs">
              <p class="text-xs text-on-surface-variant line-clamp-2 leading-relaxed">
                {entry.details}
              </p>
            </td>
            <td class="px-6 py-6 text-center">
              <span class="inline-flex items-center justify-center w-24 px-3 py-1 rounded-full text-[10px] font-bold 
                {entry.eventType === 'Automatique' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}">
                {entry.eventType}
              </span>
            </td>
          </tr>
        {/each}

        {#if filteredLogs.length === 0}
          <tr>
            <td colspan="6" class="px-6 py-20 text-center text-on-surface-variant opacity-50">
              <span class="material-symbols-outlined text-4xl mb-2">history</span>
              <p class="text-sm font-medium">Aucun événement ne correspond à votre recherche</p>
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>


<div class="grid grid-cols-1 md:grid-cols-4 gap-6 mt-12 font-inter">
  {#each stats as kpi}
    <div class="bg-surface-container-low p-6 rounded-2xl border border-outline-variant/10">
      <p class="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{kpi.label}</p>
      <div class="flex items-end justify-between mt-2">
        <p class="text-3xl font-extrabold text-on-surface">{kpi.val}</p>
        <span class="text-[10px] font-bold {kpi.subClass}">{kpi.sub}</span>
      </div>
    </div>
  {/each}
</div>

