<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { API_BASE_URL } from '../lib/api';
  import { themeStore } from '../lib/stores/theme.svelte';

  let candidatures = $state<any[]>([]);
  let tutors = $state<any[]>([]);
  let state = $state<any>(null); // from global state if needed, or fetched config
  
  let loading = $state(true);
  let error = $state('');

  let filter = $state('ALL'); // ALL, PENDING, ORAL, APPROVED, REJECTED, AUTO_REJECTED
  
  let configVisible = $state(false);
  
  let recruitmentCategoryId = $state('');
  let recruitmentLogChannelId = $state('');
  
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
        state = await resState.json();
        recruitmentCategoryId = state.recruitmentCategoryId || '';
        recruitmentLogChannelId = state.recruitmentLogChannelId || '';
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
      
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchInitialData();
  });

  async function updateConfig() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/recruitment/config`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${authStore.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ recruitmentCategoryId, recruitmentLogChannelId })
      });
      if (!res.ok) throw new Error('Erreur configuration.');
      configVisible = false;
    } catch (err: any) {
      alert(err.message);
    }
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
  
  function openValidateModal(c) {
    validateModalTarget = c;
    validationDiscordId = c.discordId || '';
  }
  
  function openRejectModal(c) {
    rejectModalTarget = c;
    rejectReason = '';
  }
  
  function openOralPassModal(c) {
    oralPassModalTarget = c;
    tutorSelected = '';
    oralPassNotes = '';
  }
  
  function openOralFailModal(c) {
    oralFailModalTarget = c;
    oralFailReason = '';
  }
</script>

<div class="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000 pb-20">
  
  <!-- Header -->
  <div class="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
    <div>
      <h2 class="text-4xl font-black text-on-surface tracking-tighter font-headline flex items-center gap-4">
        Gestion du Recrutement
        <button onclick={() => configVisible = true} class="w-10 h-10 rounded-full bg-surface-container hover:bg-surface-container-high border-outline-variant/20 border flex items-center justify-center transition-colors">
          <span class="material-symbols-outlined text-lg text-on-surface-variant">settings</span>
        </button>
      </h2>
      <p class="text-sm text-on-surface-variant/60 font-medium mt-1">Suivi des candidatures et intégration du personnel</p>
    </div>

    <!-- Stats summary -->
    <div class="flex flex-wrap gap-4">
      <div class="px-6 py-4 rounded-[2rem] bg-surface-container-low/50 border border-outline-variant/10 flex items-center gap-4 hover:shadow-2xl hover:shadow-primary/5 transition-all">
        <div class="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <span class="material-symbols-outlined text-lg">pending_actions</span>
        </div>
        <div class="text-xs">
            <p class="text-2xl font-black text-on-surface leading-none">{stats.pending}</p>
            <p class="text-[9px] uppercase tracking-widest text-on-surface-variant/40 font-bold mt-1">En attente</p>
        </div>
      </div>
      <div class="px-6 py-4 rounded-[2rem] bg-surface-container-low/50 border border-outline-variant/10 flex items-center gap-4 hover:shadow-2xl hover:shadow-primary/5 transition-all">
        <div class="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <span class="material-symbols-outlined text-lg">forum</span>
        </div>
        <div class="text-xs">
            <p class="text-2xl font-black text-on-surface leading-none">{stats.oral}</p>
            <p class="text-[9px] uppercase tracking-widest text-on-surface-variant/40 font-bold mt-1">Oraux</p>
        </div>
      </div>
      <div class="px-6 py-4 rounded-[2rem] bg-rose-500/10 border border-rose-500/20 flex items-center gap-4 hover:shadow-2xl hover:shadow-rose-500/20 transition-all">
        <div class="w-10 h-10 rounded-2xl bg-background text-rose-500 flex items-center justify-center shadow-lg shadow-rose-500/20">
            <span class="material-symbols-outlined text-lg">block</span>
        </div>
        <div class="text-xs text-rose-500">
            <p class="text-2xl font-black leading-none">{stats.autoRejected}</p>
            <p class="text-[9px] uppercase tracking-widest font-bold mt-1 opacity-70">Auto-Refus</p>
        </div>
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
      <span class="material-symbols-outlined text-5xl text-rose-500 mb-4">error</span>
      <p class="text-xl font-bold text-rose-700">{error}</p>
    </div>
  {:else if candidatures.length === 0}
    <div class="flex flex-col items-center justify-center py-32 text-on-surface-variant/30 border-2 border-dashed border-outline-variant/10 rounded-[4rem] bg-surface-container-low/20">
      <div class="w-24 h-24 rounded-[3rem] bg-surface-container flex items-center justify-center mb-6 shadow-inner">
        <span class="material-symbols-outlined text-5xl">person_add_disabled</span>
      </div>
      <h3 class="text-2xl font-black tracking-tight text-on-surface/50">Aucune candidature</h3>
      <p class="mt-3 text-sm max-w-sm text-center opacity-60 leading-relaxed px-10">
        Reliez votre formulaire externe (Google Forms) via le Webhook Kotbo pour voir les candidatures apparaître ici.
      </p>
    </div>
  {:else}
    <div class="grid grid-cols-1 gap-6">
      {#each filteredCandidatures as candidature (candidature.id)}
         <div class="relative group bg-surface-container-low/40 border border-outline-variant/10 rounded-[3rem] p-8 hover:bg-surface-container-low transition-all duration-500 {candidature.status === 'AUTO_REJECTED' ? 'opacity-80 grayscale-[30%]' : ''}">
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
                                    <span class="text-xs font-bold text-on-surface-variant/60">{new Date(candidature.createdAt).toLocaleDateString()}</span>
                                    <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border {getStatusColor(candidature.status)}">
                                        {getStatusLabel(candidature.status)}
                                    </span>
                                    {#if candidature.discordId}
                                       <span class="text-[10px] font-mono text-on-surface-variant/40">ID: {candidature.discordId}</span>
                                    {/if}
                                </div>
                            </div>
                        </div>
                        <button 
                            onclick={() => deleteCandidature(candidature.id)}
                            class="w-10 h-10 rounded-full bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                            title="Supprimer la candidature"
                        >
                            <span class="material-symbols-outlined text-sm">delete</span>
                        </button>
                    </div>
                    
                    {#if candidature.autoRejected && candidature.autoRejectReason}
                        <div class="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex gap-4 text-rose-400">
                           <span class="material-symbols-outlined shrink-0 text-xl">robot_2</span>
                           <p class="text-sm font-medium">{candidature.autoRejectReason}</p>
                        </div>
                    {/if}

                    <!-- Details from Form -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {#each Object.entries(candidature.data) as [key, value]}
                           {#if typeof value !== 'object' || Array.isArray(value)}
                            <div class="space-y-1">
                                <p class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40 leading-tight">{key}</p>
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
                           class="w-full h-32 bg-surface-container/50 border border-outline-variant/20 rounded-2xl p-4 text-xs text-on-surface placeholder:text-on-surface-variant/30 focus:outline-hidden focus:border-primary/50 transition-all resize-none"></textarea>
                    </div>
                    
                    {#if candidature.status === 'ORAL' && candidature.ticketChannelId}
                       <div class="flex items-center gap-2 p-3 rounded-xl bg-surface-container-low text-xs font-medium text-on-surface-variant">
                          <span class="material-symbols-outlined text-base">forum</span> Ticket créé
                       </div>
                    {/if}

                    <div class="grid grid-cols-2 gap-3">
                         {#if candidature.status === 'PENDING'}
                            <button 
                               onclick={() => openValidateModal(candidature)}
                               class="col-span-2 py-3 rounded-2xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-600/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2">
                                <span class="material-symbols-outlined text-sm">check_circle</span> Passer Oral
                            </button>
                            <button 
                               onclick={() => openRejectModal(candidature)}
                               class="col-span-2 py-3 rounded-2xl bg-surface-container hover:bg-rose-500/10 hover:text-rose-500 text-on-surface-variant text-xs font-black uppercase tracking-widest transition-all">
                                Refuser
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
</div>

<!-- ============================================== -->
<!-- MODALS -->
<!-- ============================================== -->

<!-- Config Modal -->
{#if configVisible}
<div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
    <div class="bg-surface border border-outline-variant/30 rounded-[3rem] w-full max-w-lg shadow-2xl p-10 animate-in zoom-in-95 duration-300">
        <h3 class="text-2xl font-black mb-2">Configuration Recrutement</h3>
        <p class="text-sm text-on-surface-variant/80 mb-6">Personnalisez les dossiers Discord utilisés par le bot.</p>
        
        <div class="space-y-4">
             <div>
                <label class="text-xs font-bold uppercase tracking-widest text-primary mb-2 block">ID Catégorie Tickets (Optionnel)</label>
                <input type="text" bind:value={recruitmentCategoryId} class="w-full bg-surface-container rounded-2xl px-5 py-4 focus:outline-hidden border-2 border-transparent focus:border-primary/50 text-sm font-medium" placeholder="Ex: 123456789012345678">
                <p class="text-[10px] opacity-50 mt-1">L'ID de la catégorie où les tickets d'entretiens oraux seront créés.</p>
             </div>
        </div>
        
        <div class="flex gap-4 mt-8 pt-6 border-t border-outline-variant/20">
            <button onclick={() => configVisible = false} class="flex-1 py-4 rounded-xl font-bold bg-surface-container hover:bg-surface-container-high transition-colors">Annuler</button>
            <button onclick={updateConfig} class="flex-1 py-4 rounded-xl font-bold bg-primary text-white hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-primary/30">Sauvegarder</button>
        </div>
    </div>
</div>
{/if}

<!-- Validate Modal -->
{#if validateModalTarget}
<div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
    <div class="bg-surface border border-outline-variant/30 rounded-[3rem] w-full max-w-lg shadow-2xl p-10 animate-in zoom-in-95 duration-300">
        <div class="flex items-center gap-4 mb-2 text-blue-500">
           <span class="material-symbols-outlined text-4xl">check_circle</span>
           <h3 class="text-2xl font-black">Valider la candidature</h3>
        </div>
        <p class="text-sm text-on-surface-variant/80 mb-6">Cette action créera un salon ticket et enverra un message privé au candidat.</p>
        
        <div>
            <label class="text-xs font-bold uppercase tracking-widest text-primary mb-2 block">ID Discord du Candidat</label>
            <input type="text" bind:value={validationDiscordId} class="w-full bg-surface-container rounded-2xl px-5 py-4 focus:outline-hidden border-2 border-transparent focus:border-primary/50 text-sm font-medium font-mono" placeholder="Ex: 123456789012345678">
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
<div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
    <div class="bg-surface border border-outline-variant/30 rounded-[3rem] w-full max-w-lg shadow-2xl p-10 animate-in zoom-in-95 duration-300">
        <div class="flex items-center gap-4 mb-2 text-rose-500">
           <span class="material-symbols-outlined text-4xl">cancel</span>
           <h3 class="text-2xl font-black">Refuser la candidature</h3>
        </div>
        <p class="text-sm text-on-surface-variant/80 mb-6">Cette action clôturera la candidature.</p>
        
        <div>
            <label class="text-xs font-bold uppercase tracking-widest text-primary mb-2 block">Raison (Envoyée en MP) — Optionnel</label>
            <textarea bind:value={rejectReason} class="w-full h-32 bg-surface-container rounded-2xl p-4 focus:outline-hidden border-2 border-transparent focus:border-primary/50 text-sm" placeholder="Raison spécifique du refus..."></textarea>
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
<div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
    <div class="bg-surface border border-outline-variant/30 rounded-[3rem] w-full max-w-lg shadow-2xl p-10 animate-in zoom-in-95 duration-300">
        <div class="flex items-center gap-4 mb-2 text-emerald-500">
           <span class="material-symbols-outlined text-4xl">how_to_reg</span>
           <h3 class="text-2xl font-black">Oral Concluant</h3>
        </div>
        <p class="text-sm text-on-surface-variant/80 mb-6">Crée automatiquement le profil Staff Helper Test et assigne le tuteur de suivi.</p>
        
        <div class="space-y-4">
             <div>
                <label class="text-xs font-bold uppercase tracking-widest text-primary mb-2 block">Assigner un tuteur</label>
                <select bind:value={tutorSelected} class="w-full bg-surface-container rounded-2xl px-5 py-4 focus:outline-hidden text-sm font-medium border-r-8 border-transparent appearance-none">
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
                <label class="text-xs font-bold uppercase tracking-widest text-primary mb-2 block">Notes d'entretien</label>
                <textarea bind:value={oralPassNotes} class="w-full h-24 bg-surface-container rounded-2xl p-4 focus:outline-hidden text-sm" placeholder="Observation sur l'entretien..."></textarea>
             </div>
        </div>
        
        <div class="flex gap-4 mt-8 pt-6 border-t border-outline-variant/20">
            <button onclick={() => oralPassModalTarget = null} class="flex-1 py-4 rounded-xl font-bold bg-surface-container hover:bg-surface-container-high transition-colors">Annuler</button>
            <button 
               onclick={async () => {
                  await doAction(oralPassModalTarget.id, 'oral_pass', { reason: oralPassNotes });
                  if (tutorSelected) await doAction(oralPassModalTarget.id, 'assign_tutor', { tutorUserId: tutorSelected });
                  oralPassModalTarget = null;
               }} 
               class="flex-1 py-4 rounded-xl font-bold bg-emerald-600 text-white hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-emerald-500/30">
               Valider & Intégrer
            </button>
        </div>
    </div>
</div>
{/if}

<!-- Oral Fail Modal -->
{#if oralFailModalTarget}
<div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
    <div class="bg-surface border border-outline-variant/30 rounded-[3rem] w-full max-w-lg shadow-2xl p-10 animate-in zoom-in-95 duration-300">
        <div class="flex items-center gap-4 mb-2 text-rose-500">
           <span class="material-symbols-outlined text-4xl">thumb_down</span>
           <h3 class="text-2xl font-black">Oral Échoué</h3>
        </div>
        <p class="text-sm text-on-surface-variant/80 mb-6">Le profil est rejeté et une attente d'1 mois est appliquée avant de pouvoir re-candidater.</p>
        
        <div>
            <label class="text-xs font-bold uppercase tracking-widest text-primary mb-2 block">Raison (Envoyée en MP) — Optionnel</label>
            <textarea bind:value={oralFailReason} class="w-full h-32 bg-surface-container rounded-2xl p-4 focus:outline-hidden text-sm" placeholder="Raison de l'échec..."></textarea>
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
