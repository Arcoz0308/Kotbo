<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { 
    API_BASE_URL, 
    updateGlobalSettings,
    fetchFeatureConfigurations,
    updateFeatureConfiguration,
    updateRecruitmentConfig,
    fetchStaffHierarchies
  } from '../lib/api';
  import { themeStore } from '../lib/stores/theme.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import FormSelect from '../lib/components/FormSelect.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import RolePermissionSettings from '../lib/components/RolePermissionSettings.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';

  let candidatures = $state<any[]>([]);
  let tutors = $state<any[]>([]);
  let guildState = $state<any>(null); // from global state if needed, or fetched config
  
  let loading = $state(true);
  
  let hierarchies = $state<any[]>([]);
  let selectedHierarchyId = $state('');
  let selectedHierarchyGrade = $state('');

  $effect(() => {
    if (selectedHierarchyId) {
      const h = hierarchies.find(x => x.id === selectedHierarchyId);
      if (h && h.roles && h.roles.length > 0) {
        const sorted = [...h.roles].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        selectedHierarchyGrade = sorted[0]?.name || '';
      } else {
        selectedHierarchyGrade = '';
      }
    } else {
      selectedHierarchyGrade = '';
    }
  });
  let error = $state('');

  let filter = $state('PENDING'); // ALL, PENDING, ORAL, APPROVED, REJECTED, AUTO_REJECTED
  
  let configVisible = $state(false);
  
  const saveAction = createAsyncActionState();

  let recruitmentCategoryId = $state('');
  let recruitmentLogChannelId = $state('');
  let recruitmentAutoRejectEnabled = $state<boolean>(true);

  $effect(() => {
    if (!guildState) return;
    if (recruitmentCategoryId === '') {
      recruitmentCategoryId = guildState.recruitmentCategoryId ?? '';
    }
    if (recruitmentLogChannelId === '') {
      recruitmentLogChannelId = guildState.recruitmentLogChannelId ?? '';
    }
  });

  const availableChannels = $derived((dashboardStore.state.discordChannels as any[]) || []);
  const availableCategories = $derived((dashboardStore.state.discordCategories as any[]) || []);

  let featureConfig = $state<any>(null);
  let loadingConfig = $state(false);

  async function loadFeatureConfig() {
    loadingConfig = true;
    try {
      const configs = await fetchFeatureConfigurations();
      featureConfig = configs?.features?.find((c: any) => c.featureKey === 'recruitment') || null;
      if (featureConfig) {
        recruitmentCategoryId = featureConfig.secondaryChannelId || ''; // categoryId is stored in secondaryChannelId for recruitment usually
        recruitmentLogChannelId = featureConfig.channelId || '';
        recruitmentAutoRejectEnabled = featureConfig.enabled;
      }
    } catch (err) {
      console.error('Error fetching recruitment config:', err);
    } finally {
      loadingConfig = false;
    }
  }

  async function toggleConfig(key: string, value: boolean) {
    if (!featureConfig) return;
    
    await saveAction.run(async () => {
      const ok = await updateFeatureConfiguration('recruitment', { [key]: value });
      if (!ok) throw new Error('Erreur API');
      featureConfig[key] = value;
      return true;
    }, { successMessage: 'Configuration mise à jour.' });
  }
  const canView = $derived(
    !!(dashboardStore.state.featureAccess as any)?.recruitment?.canView
      || !!dashboardStore.state.access?.canManageSettings
  );
  const canModerate = $derived(
    !!(dashboardStore.state.featureAccess as any)?.recruitment?.canModerate
      || !!dashboardStore.state.access?.canManageSettings
  );
  const canManageSettings = $derived(
    !!(dashboardStore.state.featureAccess as any)?.recruitment?.canConfigure
      || !!dashboardStore.state.access?.canManageSettings
  );
  
  // Modals state
  let validateModalTarget = $state<any>(null);
  let validationDiscordId = $state('');
  
  let rejectModalTarget = $state<any>(null);
  let rejectReason = $state('');
  
  let oralPassModalTarget = $state<any>(null);
  let tutorSelected = $state('');
  let oralPassNotes = $state('');
  
  let oralFailModalTarget = $state<any>(null);
  let oralFailReason = $state('');

  const filteredCandidatures = $derived(
     filter === 'ALL' ? candidatures : candidatures.filter(c => c.status === filter)
  );

  const stats = $derived({
    total: candidatures.length,
    pending: candidatures.filter(c => c.status === 'PENDING').length,
    oral: candidatures.filter(c => c.status === 'ORAL').length,
    approved: candidatures.filter(c => c.status === 'APPROVED').length,
    autoRejected: candidatures.filter(c => c.status === 'AUTO_REJECTED').length,
  });

  async function fetchInitialData() {
    if (!authStore.selectedGuildId) return;
    loading = true;
    try {
      // Fetch state for config
      const resState = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/state`, {
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      });
      if (resState.ok) {
        guildState = await resState.json();
        recruitmentCategoryId = guildState.recruitmentCategoryId || '';
        recruitmentLogChannelId = guildState.recruitmentLogChannelId || '';
        recruitmentAutoRejectEnabled = guildState.recruitmentAutoRejectEnabled !== false;
      }
      
      const [resCand, resTutors] = await Promise.all([
        fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/recruitment/candidatures`, {
          headers: { 'Authorization': `Bearer ${authStore.token}` }
        }),
        fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/recruitment/tutors`, {
          headers: { 'Authorization': `Bearer ${authStore.token}` }
        })
      ]);

      if (!resCand.ok) throw new Error('Impossible de charger les candidatures');
      const dataCand = await resCand.json();
      candidatures = dataCand.candidatures || [];
      
      if (resTutors.ok) {
        const dataTutors = await resTutors.json();
        tutors = dataTutors.tutors || [];
      }
      
      try {
        const dataH = await fetchStaffHierarchies();
        hierarchies = dataH?.hierarchies || [];
      } catch (err) {
        console.error('Error fetching hierarchies in recruitment page:', err);
      }
      
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    if (!canView) return;
    await Promise.all([
      fetchInitialData(),
      loadFeatureConfig()
    ]);
  });

  async function updateConfig(payload: any) {
    await saveAction.run(async () => {
      const ok = await updateRecruitmentConfig(payload);
      if (!ok) throw new Error('Erreur API');

      await dashboardStore.refresh();
      configVisible = false;
      return true;
    }, { successMessage: 'Configuration enregistrée.' });
  }

  async function doAction(candidatureId: string, action: string, data: any = {}) {
    loading = true;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/recruitment/candidatures/${candidatureId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${authStore.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, ...data })
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Action a échoué');
      }
      await fetchInitialData();
    } catch (err: any) {
      alert(err.message);
      loading = false;
    }
  }

  async function deleteCandidature(candidatureId: string) {
    if (!confirm('Voulez-vous vraiment supprimer cette candidature définitivement ?')) return;
    loading = true;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/recruitment/candidatures/${candidatureId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authStore.token}`,
        }
      });
      if (!res.ok) {
        throw new Error('Impossible de supprimer');
      }
      await fetchInitialData();
    } catch (err: any) {
      alert(err.message);
      loading = false;
    }
  }

  function getStatusLabel(status: string) {
    switch (status) {
      case 'PENDING': return 'En attente';
      case 'ORAL': return 'Entretien Oral';
      case 'APPROVED': return 'Validé';
      case 'REJECTED': return 'Refusé';
      case 'AUTO_REJECTED': return 'Auto-Refusé';
      default: return status;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'PENDING': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'ORAL': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'APPROVED': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'REJECTED': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      case 'AUTO_REJECTED': return 'bg-rose-900/20 text-rose-400 border-rose-900/30';
      default: return 'bg-outline-variant/10 text-on-surface-variant border-outline-variant/20';
    }
  }

  function formatValue(val: any) {
    if (Array.isArray(val)) return val.join(', ');
    return String(val);
  }
  
  function openValidateModal(c: any) {
    validateModalTarget = c;
    validationDiscordId = c.discordId || '';
  }
  
  function openRejectModal(c: any) {
    rejectModalTarget = c;
    rejectReason = '';
  }
  
  function openOralPassModal(c: any) {
    oralPassModalTarget = c;
    tutorSelected = '';
    oralPassNotes = '';
    selectedHierarchyId = '';
    selectedHierarchyGrade = '';
  }
  
  function openOralFailModal(c: any) {
    oralFailModalTarget = c;
    oralFailReason = '';
  }

  import ModulePage from '../lib/components/ModulePage.svelte';
</script>

<ModulePage 
  title="Recrutement" 
  description="Suivi des candidatures et intégration du personnel." 
  icon="person-add"
  featureKey="recruitment"
>
  {#snippet actions()}
    <div class="flex items-center gap-3">
      <RefreshButton onClick={fetchInitialData} loading={loading} label="Actualiser" />
      {#if canManageSettings}
        <button 
          onclick={() => configVisible = true}
          class="p-3 rounded-xl bg-surface-container-high hover:bg-primary/10 hover:text-primary transition-all text-on-surface-variant/70"
          title="Paramètres du module"
        >
          <Papicon icon="settings" size={20} />
        </button>
      {/if}
    </div>
  {/snippet}

  <div class="space-y-10">
    <div class="flex flex-wrap gap-4 mb-8">
      <div class="px-6 py-4 rounded-4xl bg-surface-container-low/50 border border-outline-variant/10 flex items-center gap-4 hover:shadow-2xl hover:shadow-primary/5 transition-all">
        <div class="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Papicon icon="pending_actions" size={18} />
        </div>
        <div class="text-xs">
            <p class="text-2xl font-black text-on-surface leading-none">{stats.pending}</p>
            <p class="text-[9px] uppercase tracking-widest text-on-surface-variant/70 font-bold mt-1">En attente</p>
        </div>
      </div>
      <div class="px-6 py-4 rounded-4xl bg-surface-container-low/50 border border-outline-variant/10 flex items-center gap-4 hover:shadow-2xl hover:shadow-primary/5 transition-all">
        <div class="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <Papicon icon="forum" size={18} />
        </div>
        <div class="text-xs">
            <p class="text-2xl font-black text-on-surface leading-none">{stats.oral}</p>
            <p class="text-[9px] uppercase tracking-widest text-on-surface-variant/70 font-bold mt-1">Oraux</p>
        </div>
      </div>
      <div class="px-6 py-4 rounded-4xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-4 hover:shadow-2xl hover:shadow-rose-500/20 transition-all">
        <div class="w-10 h-10 rounded-2xl bg-background text-rose-500 flex items-center justify-center shadow-lg shadow-rose-500/20">
            <Papicon icon="block" size={18} />
        </div>
        <div class="text-xs text-rose-500">
            <p class="text-2xl font-black leading-none">{stats.autoRejected}</p>
            <p class="text-[9px] uppercase tracking-widest font-bold mt-1 opacity-70">Auto-Refus</p>
        </div>
      </div>
    </div>

  <!-- Filters -->
  <div class="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
      {#each ['ALL', 'PENDING', 'ORAL', 'APPROVED', 'REJECTED', 'AUTO_REJECTED'] as f}
        <button 
           onclick={() => filter = f}
           class="px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all {filter === f ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-105' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}">
           {f === 'ALL' ? 'Tout' : getStatusLabel(f)}
        </button>
      {/each}
  </div>

  <!-- Content -->
  {#if loading && candidatures.length === 0}
    <div class="grid grid-cols-1 gap-6">
      {#each Array(3) as _}
        <div class="bg-surface-container-low/40 border border-outline-variant/10 rounded-[3rem] p-8 animate-pulse flex flex-col xl:flex-row gap-8">
            <div class="flex-1 space-y-6">
                <div class="flex gap-4">
                    <div class="w-14 h-14 rounded-2xl bg-surface-container"></div>
                    <div class="space-y-2 py-2 flex-1"><div class="h-5 bg-surface-container rounded-md w-1/3"></div><div class="h-4 bg-surface-container rounded-md w-1/4"></div></div>
                </div>
                <div class="grid grid-cols-2 gap-4"><div class="h-16 bg-surface-container rounded-xl"></div><div class="h-16 bg-surface-container rounded-xl"></div></div>
            </div>
        </div>
      {/each}
    </div>
  {:else if error}
    <div class="rounded-[3rem] border border-rose-500/20 bg-rose-500/10 px-8 py-10 text-center flex flex-col items-center">
      <Papicon icon="error" size={48} class="text-rose-500 mb-4" />
      <p class="text-xl font-bold text-rose-700">{error}</p>
    </div>
  {:else if candidatures.length === 0}
    <div class="flex flex-col items-center justify-center py-32 text-on-surface-variant/30 border-2 border-dashed border-outline-variant/10 rounded-[4rem] bg-surface-container-low/20">
      <div class="w-24 h-24 rounded-[3rem] bg-surface-container flex items-center justify-center mb-6 shadow-inner">
        <Papicon icon="person_add_disabled" size={48} />
      </div>
      <h3 class="text-2xl font-black tracking-tight text-on-surface/50">Aucune candidature</h3>
      <p class="mt-3 text-sm max-w-sm text-center opacity-60 leading-relaxed px-10">
        Reliez votre formulaire externe (Google Forms) via le Webhook Kotbo pour voir les candidatures apparaître ici.
      </p>
    </div>
  {:else}
    {#if filteredCandidatures.length === 0}
      <div class="flex flex-col items-center justify-center py-24 text-on-surface-variant/30 border-2 border-dashed border-outline-variant/10 rounded-[4rem] bg-surface-container-low/20">
        <div class="w-20 h-20 rounded-[2.5rem] bg-surface-container flex items-center justify-center mb-6 shadow-inner opacity-50">
          <Papicon icon={filter === 'PENDING' ? 'inbox' : 'filter_list_off'} size={32} />
        </div>
        <h3 class="text-xl font-black tracking-tight text-on-surface/40">
          {filter === 'PENDING' ? 'Pas de nouvelle candidature pour l\'instant' : `Aucune candidature "${getStatusLabel(filter)}"`}
        </h3>
        <p class="mt-2 text-xs opacity-50">Revenez plus tard ou changez de filtre.</p>
      </div>
    {:else}
      <div class="grid grid-cols-1 gap-6">
        {#each filteredCandidatures as candidature (candidature.id)}
          <div class="relative group bg-surface-container-low/40 border border-outline-variant/10 rounded-[3rem] p-8 hover:bg-surface-container-low transition-all duration-500 {candidature.status === 'AUTO_REJECTED' ? 'opacity-80 grayscale-30' : ''}">
            <div class="absolute -inset-1 bg-linear-to-r from-primary/10 to-secondary/10 rounded-[3.1rem] blur-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>

              <div class="relative flex flex-col xl:flex-row gap-8">
                  <!-- Main Info -->
                  <div class="flex-1 space-y-6">
                      <div class="flex items-center justify-between">
                          <div class="flex items-center gap-4">
                              <div class="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center text-primary font-black text-xl shadow-lg">
                                  {candidature.username?.charAt(0).toUpperCase() || '?'}
                              </div>
                              <div>
                                  <h3 class="text-xl font-black text-on-surface font-headline tracking-tight">{candidature.username || 'Anonyme'}</h3>
                                  <div class="flex flex-wrap items-center gap-3 mt-1">
                                      <span class="text-xs font-bold text-on-surface-variant/75">{new Date(candidature.createdAt).toLocaleDateString()}</span>
                                      <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border {getStatusColor(candidature.status)}">
                                          {getStatusLabel(candidature.status)}
                                      </span>
                                      {#if candidature.discordId}
                                         <span class="text-[10px] font-mono text-on-surface-variant/70">ID: {candidature.discordId}</span>
                                      {/if}
                                  </div>
                              </div>
                          </div>
                              {#if canModerate}
                                <button 
                                    onclick={() => deleteCandidature(candidature.id)}
                                    class="w-10 h-10 rounded-full bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                                    title="Supprimer la candidature"
                                >
                                    <Papicon icon="delete" size={14} />
                                </button>
                              {/if}
                      </div>
                      
                      {#if candidature.autoRejected && candidature.autoRejectReason}
                          <div class="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex gap-4 text-rose-400">
                             <Papicon icon="robot_2" size={20} class="shrink-0" />
                             <p class="text-sm font-medium">{candidature.autoRejectReason}</p>
                          </div>
                      {/if}

                      <!-- Details from Form -->
                      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {#each Object.entries(candidature.data) as [key, value]}
                             {#if typeof value !== 'object' || Array.isArray(value)}
                              <div class="space-y-1">
                                  <p class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/70 leading-tight">{key}</p>
                                  <div class="text-sm font-medium text-on-surface/80 bg-surface-container/30 rounded-xl px-4 py-2 border border-outline-variant/5">
                                     <div class="max-h-32 overflow-y-auto scrollbar-hide whitespace-pre-wrap">{formatValue(value)}</div>
                                  </div>
                              </div>
                             {/if}
                          {/each}
                      </div>
                  </div>

                  <!-- Actions Side -->
                  <div class="xl:w-80 space-y-6 xl:border-l border-outline-variant/20 xl:pl-8">
                      <div>
                          <p class="text-[10px] font-black uppercase tracking-widest text-primary mb-3">Notes de gestion</p>
                          <textarea 
                             bind:value={candidature.notes}
                             onblur={() => doAction(candidature.id, 'status_update', { status: candidature.status, notes: candidature.notes })}
                             placeholder="Ajouter une observation interne..."
                             class="w-full h-32 bg-surface-container/50 border border-outline-variant/20 rounded-2xl p-4 text-xs text-on-surface placeholder:text-on-surface-variant/60 focus:outline-hidden focus:border-primary/50 transition-all resize-none"></textarea>
                      </div>
                      
                      {#if candidature.status === 'ORAL' && candidature.ticketChannelId}
                         <div class="flex items-center gap-2 p-3 rounded-xl bg-surface-container-low text-xs font-medium text-on-surface-variant">
                            <Papicon icon="forum" size={16} /> Ticket créé
                         </div>
                      {/if}

                      {#if canModerate}
                        <div class="grid grid-cols-2 gap-3">
                             {#if candidature.status === 'PENDING'}
                                <button 
                                   onclick={() => openValidateModal(candidature)}
                                   class="col-span-2 py-3 rounded-2xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-600/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2">
                                    <Papicon icon="check_circle" size={14} /> Passer Oral
                                </button>
                                <button 
                                   onclick={() => openRejectModal(candidature)}
                                   class="col-span-2 py-3 rounded-2xl bg-surface-container hover:bg-rose-500/10 hover:text-rose-500 text-on-surface-variant text-xs font-black uppercase tracking-widest transition-all">
                                    Refuser
                                </button>
                             {/if}
                             {#if candidature.status === 'AUTO_REJECTED'}
                               <button 
                                 onclick={() => openValidateModal(candidature)}
                                 class="col-span-2 py-3 rounded-2xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-600/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2">
                                  <Papicon icon="verified" size={14} /> Accepter quand même
                               </button>
                             {/if}
                             {#if candidature.status === 'ORAL'}
                                <button 
                                   onclick={() => openOralPassModal(candidature)}
                                   class="py-3 rounded-2xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-600/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center">
                                    Concluant
                                </button>
                                <button 
                                   onclick={() => openOralFailModal(candidature)}
                                   class="py-3 rounded-2xl bg-rose-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-rose-600/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center">
                                    Échoué
                                </button>
                             {/if}
                        </div>
                      {/if}
                      
                      {#if candidature.reapplyAfter && new Date(candidature.reapplyAfter) > new Date()}
                         <div class="text-[10px] uppercase font-bold tracking-widest text-on-surface-variant/50 text-center mt-2">
                           Recandidature : {new Date(candidature.reapplyAfter).toLocaleDateString()}
                         </div>
                      {/if}
                  </div>
              </div>
           </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<!-- ============================================== -->
<!-- MODALS -->
<!-- ============================================== -->

<!-- Config Modal -->
{#if configVisible}
  <div class="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
    <div class="bg-surface border border-outline-variant/30 rounded-[3rem] w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 font-inter">
        <div class="p-8 border-b border-outline-variant/20 flex items-center justify-between bg-primary/5">
          <div>
            <h3 class="text-2xl font-black text-on-surface">Configuration Recrutement</h3>
            <p class="text-on-surface-variant text-sm">Gérez les paramètres de l'équipe et des tickets.</p>
          </div>
          <button onclick={() => configVisible = false} class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-hover transition-colors">
            <Papicon icon="x" size={24} />
          </button>
        </div>
        
        <div class="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
             <div class="space-y-4">
                <label class="block">
                  <span class="text-xs font-black uppercase tracking-widest text-on-surface-variant/60 ml-1 mb-2 block">Salon de logs recrutement</span>
                  <FormSelect
                     bind:value={recruitmentLogChannelId}
                     className="w-full"
                  >
                    <option value="">Sélectionner un salon</option>
                    {#each (dashboardStore.state.discordChannels as any[]) as c}
                      <option value={c.id}>#{c.name}</option>
                    {/each}
                  </FormSelect>
                </label>

               <label class="block">
                 <span class="text-xs font-black uppercase tracking-widest text-on-surface-variant/60 ml-1 mb-2 block">ID Catégorie Tickets</span>
                 <FormInput 
                   type="text" 
                   bind:value={recruitmentCategoryId} 
                   placeholder="Ex: 123456789012345678"
                   className="w-full"
                 />
               </label>

               </div>

               {#if featureConfig}
               <div class="pt-6 border-t border-outline-variant/10">
                 <RolePermissionSettings 
                   featureKey="recruitment" 
                   roleAccess={featureConfig.roleAccessByRole} 
                 />
               </div>
               {/if}
             </div>
        
        <div class="p-8 bg-surface-container-low border-t border-outline-variant/20 flex gap-4">
            <button onclick={() => configVisible = false} class="flex-1 py-4 rounded-xl font-bold bg-surface hover:bg-surface-hover transition-colors">Annuler</button>
            <button 
              onclick={updateConfig} 
              disabled={saveAction.state.loading}
              class="flex-1 py-4 rounded-xl font-black bg-primary text-on-primary hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
            >
              {saveAction.state.loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
        </div>
    </div>
</div>
{/if}

<!-- Validate Modal -->
{#if validateModalTarget}
  <div class="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
    <div class="bg-surface border border-outline-variant/30 rounded-[3rem] w-full max-w-lg shadow-2xl p-10 animate-in zoom-in-95 duration-300">
        <div class="flex items-center gap-4 mb-2 text-blue-500">
           <Papicon icon="check_circle" size={36} />
           <h3 class="text-2xl font-black">Valider la candidature</h3>
        </div>
        <p class="text-sm text-on-surface-variant/80 mb-6">Cette action créera un salon ticket et enverra un message privé au candidat.</p>
        
        <div>
          <label for="validate-discord-id" class="text-xs font-bold uppercase tracking-widest text-primary mb-2 block">ID Discord du Candidat</label>
          <input id="validate-discord-id" type="text" bind:value={validationDiscordId} class="w-full bg-surface-container rounded-2xl px-5 py-4 focus:outline-hidden border-2 border-transparent focus:border-primary/50 text-sm font-medium font-mono" placeholder="Ex: 123456789012345678">
            <p class="text-[10px] text-on-surface-variant/60 mt-2">Ce champ doit être pré-rempli si le candidat a fourni un ID valide. Le bot s'en servira pour l'assigner au ticket.</p>
        </div>
        
        <div class="flex gap-4 mt-8 pt-6 border-t border-outline-variant/20">
            <button onclick={() => validateModalTarget = null} class="flex-1 py-4 rounded-xl font-bold bg-surface-container hover:bg-surface-container-high transition-colors">Annuler</button>
            <button 
               onclick={() => doAction(validateModalTarget.id, 'approve', { discordUserId: validationDiscordId }).then(() => validateModalTarget = null)} 
               disabled={!validationDiscordId}
               class="flex-1 py-4 rounded-xl font-bold bg-blue-600 text-white disabled:opacity-50 hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-blue-600/30">
               Créer le ticket
            </button>
        </div>
    </div>
</div>
{/if}

<!-- Reject Modal -->
{#if rejectModalTarget}
  <div class="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
    <div class="bg-surface border border-outline-variant/30 rounded-[3rem] w-full max-w-lg shadow-2xl p-10 animate-in zoom-in-95 duration-300">
        <div class="flex items-center gap-4 mb-2 text-rose-500">
           <Papicon icon="cancel" size={36} />
           <h3 class="text-2xl font-black">Refuser la candidature</h3>
        </div>
        <p class="text-sm text-on-surface-variant/80 mb-6">Cette action clôturera la candidature.</p>
        
        <div>
          <label for="reject-reason" class="text-xs font-bold uppercase tracking-widest text-primary mb-2 block">Raison (Envoyée en MP) — Optionnel</label>
          <textarea id="reject-reason" bind:value={rejectReason} class="w-full h-32 bg-surface-container rounded-2xl p-4 focus:outline-hidden border-2 border-transparent focus:border-primary/50 text-sm" placeholder="Raison spécifique du refus..."></textarea>
        </div>
        
        <div class="flex gap-4 mt-8 pt-6 border-t border-outline-variant/20">
            <button onclick={() => rejectModalTarget = null} class="flex-1 py-4 rounded-xl font-bold bg-surface-container hover:bg-surface-container-high transition-colors">Annuler</button>
            <button 
               onclick={() => doAction(rejectModalTarget.id, 'reject', { reason: rejectReason }).then(() => rejectModalTarget = null)} 
               class="flex-1 py-4 rounded-xl font-bold bg-rose-600 text-white hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-rose-600/30">
               Confirmer le refus
            </button>
        </div>
    </div>
</div>
{/if}

<!-- Oral Pass Modal -->
{#if oralPassModalTarget}
  <div class="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
    <div class="bg-surface border border-outline-variant/30 rounded-[3rem] w-full max-w-lg shadow-2xl p-10 animate-in zoom-in-95 duration-300">
        <div class="flex items-center gap-4 mb-2 text-emerald-500">
           <Papicon icon="how_to_reg" size={36} />
           <h3 class="text-2xl font-black">Oral Concluant</h3>
        </div>
        <p class="text-sm text-on-surface-variant/80 mb-6">Crée automatiquement le profil Staff Helper Test et assigne le tuteur de suivi.</p>
        
        <div class="space-y-4 font-inter">
             <div>
               <label for="oral-pass-tutor" class="text-xs font-bold uppercase tracking-widest text-primary mb-2 block">Assigner un tuteur</label>
               <select id="oral-pass-tutor" bind:value={tutorSelected} class="w-full bg-surface-container rounded-2xl px-5 py-4 focus:outline-hidden text-sm font-medium border-r-8 border-transparent appearance-none">
                    <option value="" disabled>Sélectionner un tuteur...</option>
                    {#each tutors as tutor}
                       <option value={tutor.userId}>{tutor.displayName || tutor.username} ({tutor.grade})</option>
                    {/each}
                </select>
                {#if tutors.length === 0}
                   <p class="text-rose-400 text-xs mt-1">Aucun tuteur de niveau ≥ 2 n'a été trouvé.</p>
                {/if}
             </div>

             <div>
               <label for="oral-pass-hierarchy" class="text-xs font-bold uppercase tracking-widest text-primary mb-2 block">Hiérarchie d'intégration (Optionnel)</label>
               <select id="oral-pass-hierarchy" bind:value={selectedHierarchyId} class="w-full bg-surface-container rounded-2xl px-5 py-4 focus:outline-hidden text-sm font-medium border-r-8 border-transparent appearance-none">
                    <option value="">-- Aucune --</option>
                    {#each hierarchies as h}
                       <option value={h.id}>{h.name}</option>
                    {/each}
                </select>
             </div>

             {#if selectedHierarchyId}
               {@const hRoles = selectedHierarchyId ? hierarchies.find(h => h.id === selectedHierarchyId)?.roles || [] : []}
               <div>
                 <label for="oral-pass-hierarchy-grade" class="text-xs font-bold uppercase tracking-widest text-primary mb-2 block">Grade hiérarchique de départ</label>
                 <select id="oral-pass-hierarchy-grade" bind:value={selectedHierarchyGrade} class="w-full bg-surface-container rounded-2xl px-5 py-4 focus:outline-hidden text-sm font-medium border-r-8 border-transparent appearance-none">
                      <option value="">-- Choisir un grade --</option>
                      {#each hRoles as r}
                         <option value={r.name}>{r.name}</option>
                      {/each}
                  </select>
               </div>
             {/if}

             <div>
               <label for="oral-pass-notes" class="text-xs font-bold uppercase tracking-widest text-primary mb-2 block">Notes d'entretien</label>
               <textarea id="oral-pass-notes" bind:value={oralPassNotes} class="w-full h-24 bg-surface-container rounded-2xl p-4 focus:outline-hidden text-sm" placeholder="Observation sur l'entretien..."></textarea>
             </div>
        </div>
        
        <div class="flex gap-4 mt-8 pt-6 border-t border-outline-variant/20">
            <button onclick={() => oralPassModalTarget = null} class="flex-1 py-4 rounded-xl font-bold bg-surface-container hover:bg-surface-container-high transition-colors font-inter">Annuler</button>
            <button 
               onclick={async () => {
                  await doAction(oralPassModalTarget.id, 'oral_pass', { 
                     reason: oralPassNotes,
                     hierarchyId: selectedHierarchyId || undefined,
                     hierarchyGrade: selectedHierarchyGrade || undefined
                  });
                  if (tutorSelected) await doAction(oralPassModalTarget.id, 'assign_tutor', { tutorUserId: tutorSelected });
                  oralPassModalTarget = null;
               }} 
               class="flex-1 py-4 rounded-xl font-bold bg-emerald-600 text-white hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-emerald-500/30 font-inter">
               Valider & Intégrer
            </button>
        </div>
    </div>
</div>
{/if}

<!-- Oral Fail Modal -->
{#if oralFailModalTarget}
  <div class="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
    <div class="bg-surface border border-outline-variant/30 rounded-[3rem] w-full max-w-lg shadow-2xl p-10 animate-in zoom-in-95 duration-300">
        <div class="flex items-center gap-4 mb-2 text-rose-500">
           <Papicon icon="thumb_down" size={36} />
           <h3 class="text-2xl font-black">Oral Échoué</h3>
        </div>
        <p class="text-sm text-on-surface-variant/80 mb-6">Le profil est rejeté et une attente d'1 mois est appliquée avant de pouvoir re-candidater.</p>
        
        <div>
          <label for="oral-fail-reason" class="text-xs font-bold uppercase tracking-widest text-primary mb-2 block">Raison (Envoyée en MP) — Optionnel</label>
          <textarea id="oral-fail-reason" bind:value={oralFailReason} class="w-full h-32 bg-surface-container rounded-2xl p-4 focus:outline-hidden text-sm" placeholder="Raison de l'échec..."></textarea>
        </div>
        
        <div class="flex gap-4 mt-8 pt-6 border-t border-outline-variant/20">
            <button onclick={() => oralFailModalTarget = null} class="flex-1 py-4 rounded-xl font-bold bg-surface-container hover:bg-surface-container-high transition-colors">Annuler</button>
            <button 
               onclick={() => doAction(oralFailModalTarget.id, 'oral_fail', { reason: oralFailReason }).then(() => oralFailModalTarget = null)} 
               class="flex-1 py-4 rounded-xl font-bold bg-rose-600 text-white hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-rose-600/30">
               Rejeter (Délai 1 mois)
            </button>
        </div>
    </div>
</div>
{/if}

<style>
    .scrollbar-hide::-webkit-scrollbar { display: none; }
</style>

</ModulePage>
 
 