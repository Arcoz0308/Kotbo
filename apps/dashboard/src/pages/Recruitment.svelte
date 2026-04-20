<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { API_BASE_URL } from '../lib/api';
  import { themeStore } from '../lib/stores/theme.svelte';

  let candidatures = $state<any[]>([]);
  let loading = $state(true);
  let error = $state('');

  let filter = $state('ALL'); // ALL, PENDING, ORAL, APPROVED, REJECTED
  
  const filteredCandidatures = $derived(
     filter === 'ALL' ? candidatures : candidatures.filter(c => c.status === filter)
  );

  const stats = $derived({
    total: candidatures.length,
    pending: candidatures.filter(c => c.status === 'PENDING').length,
    oral: candidatures.filter(c => c.status === 'ORAL').length,
    approved: candidatures.filter(c => c.status === 'APPROVED').length,
  });

  async function fetchCandidatures() {
    if (!authStore.selectedGuildId) return;
    loading = true;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/recruitment/candidatures`, {
        headers: {
          'Authorization': `Bearer ${authStore.token}`
        }
      });
      if (!res.ok) throw new Error('Impossible de charger les candidatures');
      const data = await res.json();
      candidatures = data.candidatures || [];
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function updateStatus(id: string, status: string) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/recruitment/candidatures/${id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${authStore.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error('Erreur lors de la mise à jour');
      await fetchCandidatures();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function updateNotes(id: string, notes: string) {
    try {
      await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/recruitment/candidatures/${id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${authStore.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: candidatures.find(c => c.id === id).status, notes })
      });
    } catch (err: any) {
      console.error(err.message);
    }
  }

  onMount(() => {
    fetchCandidatures();
  });

  function getStatusLabel(status: string) {
    switch (status) {
      case 'PENDING': return 'En attente';
      case 'ORAL': return 'Entretien Oral';
      case 'APPROVED': return 'Validé';
      case 'REJECTED': return 'Refusé';
      default: return status;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'PENDING': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'ORAL': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'APPROVED': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'REJECTED': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      default: return 'bg-outline-variant/10 text-on-surface-variant border-outline-variant/20';
    }
  }

  function formatValue(val: any) {
    if (Array.isArray(val)) return val.join(', ');
    return String(val);
  }
</script>

<div class="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000 pb-20">
  
  <!-- Header -->
  <div class="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
    <div>
      <h2 class="text-4xl font-black text-on-surface tracking-tighter font-headline">Gestion du Recrutement</h2>
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
    </div>
  </div>

  <!-- Filters -->
  <div class="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
      {#each ['ALL', 'PENDING', 'ORAL', 'APPROVED', 'REJECTED'] as f}
        <button 
           onclick={() => filter = f}
           class="px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all {filter === f ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-105' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}">
           {f === 'ALL' ? 'Tout' : getStatusLabel(f)}
        </button>
      {/each}
  </div>

  <!-- Content -->
  {#if loading && candidatures.length === 0}
    <div class="flex flex-col items-center justify-center py-32 text-on-surface-variant/20">
      <span class="material-symbols-outlined text-7xl animate-spin">progress_activity</span>
      <p class="mt-4 text-xs font-black uppercase tracking-[0.3em]">Synchonisation du vivier</p>
    </div>
  {:else if error}
    <div class="rounded-3xl border border-rose-500/20 bg-rose-500/10 px-8 py-6 text-center">
      <span class="material-symbols-outlined text-4xl text-rose-500">error</span>
      <p class="mt-3 text-lg font-bold text-rose-700">{error}</p>
    </div>
  {:else if candidatures.length === 0}
    <div class="flex flex-col items-center justify-center py-32 text-on-surface-variant/30 border-2 border-dashed border-outline-variant/10 rounded-[4rem] bg-surface-container-low/20">
      <div class="w-24 h-24 rounded-4xl bg-surface-container flex items-center justify-center mb-6 shadow-inner">
        <span class="material-symbols-outlined text-5xl">person_add_disabled</span>
      </div>
      <h3 class="text-2xl font-black tracking-tight text-on-surface/50">Aucune candidature</h3>
      <p class="mt-3 text-sm max-w-sm text-center opacity-60 leading-relaxed px-10">
        Reliez votre formulaire externe (Google Forms) via le Webhook Kotbo pour voir les candidatures apparaître ici.
      </p>
      
      <div class="mt-12 w-full max-w-2xl px-6">
        <div class="bg-surface-container-low/80 border border-outline-variant/20 rounded-[2.5rem] p-8 space-y-6">
            <div class="flex items-center gap-4">
               <div class="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  <span class="material-symbols-outlined">link</span>
               </div>
               <div>
                  <h4 class="text-sm font-black text-on-surface uppercase tracking-widest">Webhook URL</h4>
                  <p class="text-xs text-on-surface-variant/60 font-mono mt-1 select-all">{API_BASE_URL}/api/webhooks/recruitment/{authStore.selectedGuildId}</p>
               </div>
            </div>
            
            <div class="pt-6 border-t border-outline-variant/20">
                <p class="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-2 text-center">Intégration Google Forms (Apps Script)</p>
                <p class="text-[10px] text-on-surface-variant/40 text-center mb-4 leading-relaxed">
                  Kotbo identifiera automatiquement le champ <strong>"Quel est votre nom d'utilisateur Discord complet ?"</strong>.<br/>
                  Utilisez le script ci-dessous dans l'Editeur de scripts de votre formulaire.
                </p>
                <div class="bg-black/95 p-6 rounded-3xl overflow-hidden relative group border border-primary/20 shadow-2xl shadow-primary/5">
                    <pre class="text-[10px] text-emerald-400/90 font-mono overflow-x-auto leading-relaxed"><code>
function onFormSubmit(e) &#123;
  // URL de ton webhook Kotbo
  var url = "{API_BASE_URL}/api/webhooks/recruitment/{authStore.selectedGuildId}";
  
  // Récupération des réponses (format simple pour le dash)
  var responses = e.namedValues;
  var payload = JSON.stringify(responses);
  
  try &#123;
    UrlFetchApp.fetch(url, &#123;
      method: "post",
      contentType: "application/json",
      payload: payload,
      muteHttpExceptions: true
    &#125;);
    Logger.log("Candidature envoyée avec succès !");
  &#125; catch (err) &#123;
    Logger.log("Erreur lors de l'envoi : " + err.toString());
  &#125;
&#125;
                    </code></pre>
                </div>
            </div>
        </div>
      </div>
    </div>
  {:else}
    <div class="grid grid-cols-1 gap-6">
      {#each filteredCandidatures as candidature (candidature.id)}
         <div class="relative group bg-surface-container-low/40 border border-outline-variant/10 rounded-[3rem] p-8 hover:bg-surface-container-low transition-all duration-500">
            <!-- Background glow -->
            <div class="absolute -inset-1 bg-linear-to-r from-primary/10 to-secondary/10 rounded-[3.1rem] blur-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>

            <div class="relative flex flex-col xl:flex-row gap-8">
                <!-- Main Info -->
                <div class="flex-1 space-y-6">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-4">
                            <div class="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center text-primary font-black text-xl shadow-lg">
                                {candidature.username?.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <h3 class="text-xl font-black text-on-surface font-headline tracking-tight">{candidature.username}</h3>
                                <div class="flex flex-wrap items-center gap-3 mt-1">
                                    <span class="text-xs font-bold text-on-surface-variant/60">{new Date(candidature.createdAt).toLocaleDateString()}</span>
                                    <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border {getStatusColor(candidature.status)}">
                                        {getStatusLabel(candidature.status)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Details from Form -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {#each Object.entries(candidature.data) as [key, value]}
                           {#if typeof value !== 'object' || Array.isArray(value)}
                            <div class="space-y-1">
                                <p class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40">{key}</p>
                                <p class="text-sm font-medium text-on-surface/80 bg-surface-container/30 rounded-xl px-4 py-2 border border-outline-variant/5">{formatValue(value)}</p>
                            </div>
                           {/if}
                        {/each}
                    </div>
                </div>

                <!-- Actions Side -->
                <div class="xl:w-80 space-y-6 lg:border-l border-outline-variant/20 lg:pl-8">
                    <div>
                        <p class="text-[10px] font-black uppercase tracking-widest text-primary mb-3">Notes de gestion</p>
                        <textarea 
                           bind:value={candidature.notes}
                           onblur={() => updateNotes(candidature.id, candidature.notes)}
                           placeholder="Ajouter une observation..."
                           class="w-full h-32 bg-surface-container/50 border border-outline-variant/20 rounded-2xl p-4 text-xs text-on-surface placeholder:text-on-surface-variant/30 focus:outline-hidden focus:border-primary/50 transition-all resize-none"></textarea>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                         {#if candidature.status === 'PENDING'}
                            <button 
                               onclick={() => updateStatus(candidature.id, 'ORAL')}
                               class="col-span-2 py-3 rounded-2xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-600/20 hover:scale-105 active:scale-95 transition-all">
                                Passer Oral
                            </button>
                         {/if}
                         {#if candidature.status === 'ORAL' || candidature.status === 'PENDING'}
                            <button 
                               onclick={() => updateStatus(candidature.id, 'APPROVED')}
                               class="py-3 rounded-2xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-600/20 hover:scale-105 active:scale-95 transition-all">
                                Valider
                            </button>
                            <button 
                               onclick={() => updateStatus(candidature.id, 'REJECTED')}
                               class="py-3 rounded-2xl bg-rose-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-rose-600/20 hover:scale-105 active:scale-95 transition-all">
                                Refuser
                            </button>
                         {/if}
                    </div>
                </div>
            </div>
         </div>
      {/each}
    </div>
  {/if}
</div>

<style>
    .scrollbar-hide::-webkit-scrollbar { display: none; }
    .premium-card {
        background: radial-gradient(circle at top left, var(--surface-container-low), var(--surface-container-lowest));
        transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    }
</style>
