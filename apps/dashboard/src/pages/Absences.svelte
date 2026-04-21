<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { fetchAbsences, createAbsence, updateAbsenceStatus } from '../lib/api';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import ActionButton from '../lib/components/ActionButton.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import FormTextarea from '../lib/components/FormTextarea.svelte';

  let absences = $state<any[]>([]);
  let loading = $state(true);
  let modalOpen = $state(false);
  let saving = $state(false);

  let startDate = $state(new Date().toISOString().slice(0, 10));
  let endDate = $state(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  let reason = $state('');

  const isAdmin = $derived(authStore.guilds.find(g => g.id === authStore.selectedGuildId)?.accessLevel === 'admin');

  async function loadAbsences() {
    loading = true;
    try {
      const data = await fetchAbsences();
      absences = data.absences || [];
      // Sort: My absences first, then by date desc
      absences.sort((a, b) => {
        const isMineA = a.staffUserId === authStore.user?.id;
        const isMineB = b.staffUserId === authStore.user?.id;
        if (isMineA && !isMineB) return -1;
        if (!isMineA && isMineB) return 1;
        return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
      });
    } catch (e) {
      console.error('Failed to fetch absences:', e);
    } finally {
      loading = false;
    }
  }

  onMount(loadAbsences);

  function openCreate() {
    startDate = new Date().toISOString().slice(0, 10);
    endDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    reason = '';
    modalOpen = true;
  }

  async function save() {
    if (!startDate || !endDate || !reason) return;
    saving = true;
    try {
      // Pour une déclaration personnelle, on utilise l'ID de l'utilisateur actuel
      // Et on peut laisser le backend choisir un supérieur par défaut ou demander à l'utilisateur
      // Dans notre cas, pour simplifier, on va chercher le premier admin disponible comme "supérieur" par défaut
      // ou laisser le backend le gérer si on modifie l'API.
      // Mais l'API demande explicitement superiorUserId. 
      // On va donc envoyer les infos nécessaires.
      await createAbsence({ 
        staffUserId: authStore.user?.id,
        startDate: new Date(startDate).toISOString(), 
        endDate: new Date(endDate).toISOString(), 
        reason,
        type: 'Congé', // Type par défaut
        superiorUserId: 'system' // Le backend devra gérer ou on peut demander à l'utilisateur
      });
      modalOpen = false;
      await loadAbsences();
    } catch (e) {
      console.error('Failed to create absence:', e);
    } finally {
      saving = false;
    }
  }

  async function setStatus(id: string, status: string) {
    if (!isAdmin) return;
    try {
      await updateAbsenceStatus(id, status, '');
      await loadAbsences();
    } catch (e) {
      console.error('Failed to update status:', e);
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'PENDING': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
      case 'APPROVED': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
      case 'REJECTED': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400';
    }
  }

  function formatStatus(status: string) {
    switch (status) {
      case 'PENDING': return 'En attente';
      case 'APPROVED': return 'Approuvée';
      case 'REJECTED': return 'Refusée';
      default: return status;
    }
  }

  const myAbsences = $derived(absences.filter(a => a.staffUserId === authStore.user?.id));
  const otherAbsences = $derived(absences.filter(a => a.staffUserId !== authStore.user?.id));

</script>

<div class="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 font-inter">
  <div>
    <h2 class="text-3xl font-extrabold text-primary tracking-tight font-headline">Absences Staff</h2>
    <p class="text-on-surface-variant mt-1 leading-relaxed">Déclarez vos congés ou absences pour être automatiquement excusé des réunions.</p>
  </div>
  <div class="flex items-center gap-3">
    <RefreshButton onClick={loadAbsences} loading={loading} label="Actualiser" />
    <ActionButton onClick={openCreate} variant="primary" icon="event_note" label="Déclarer une Absence" />
  </div>
</div>

<div class="space-y-12 font-inter">
  <!-- My Absences Section -->
  <section class="section-card-flush bg-surface-container-low/30 overflow-hidden rounded-3xl border border-outline-variant/30">
    <div class="px-8 py-5 border-b border-outline-variant/30 flex items-center justify-between">
      <h3 class="text-lg font-black text-on-surface flex items-center gap-3">
        <span class="material-symbols-outlined text-primary">person</span>
        Mes Absences
      </h3>
    </div>
    
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse">
        <thead class="bg-surface-container-low">
          <tr>
            <th class="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Période</th>
            <th class="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Raison</th>
            <th class="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Statut</th>
            <th class="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Info</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-outline-variant/10">
          {#if loading && myAbsences.length === 0}
             {#each Array(2) as _}
               <tr class="animate-pulse">
                 <td class="px-8 py-4"><div class="h-4 w-32 bg-surface-container-high rounded-full"></div></td>
                 <td class="px-8 py-4"><div class="h-4 w-48 bg-surface-container-high rounded-full"></div></td>
                 <td class="px-8 py-4"><div class="h-6 w-20 bg-surface-container-high rounded-full"></div></td>
                 <td class="px-8 py-4"><div class="h-4 w-12 bg-surface-container-high rounded-full"></div></td>
               </tr>
             {/each}
          {:else if myAbsences.length === 0}
            <tr>
              <td colspan="4" class="px-8 py-10 text-center text-on-surface-variant">Vous n'avez aucune absence déclarée.</td>
            </tr>
          {:else}
            {#each myAbsences as absence}
              <tr class="hover:bg-primary/5 transition-colors group">
                <td class="px-8 py-5">
                   <div class="text-sm font-bold text-on-surface">Du {new Date(absence.startDate).toLocaleDateString('fr-FR')}</div>
                   <div class="text-[11px] text-on-surface-variant font-medium">Au {new Date(absence.endDate).toLocaleDateString('fr-FR')}</div>
                </td>
                <td class="px-8 py-5 text-sm font-medium text-on-surface-variant max-w-xs truncate">
                  {absence.reason}
                </td>
                <td class="px-8 py-5">
                  <span class="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider {getStatusColor(absence.status)}">
                    {formatStatus(absence.status)}
                  </span>
                </td>
                <td class="px-8 py-5">
                   {#if absence.status === 'REJECTED' && absence.note}
                      <span class="material-symbols-outlined text-red-500 cursor-help" title={absence.note}>info</span>
                   {:else}
                      <span class="text-on-surface-variant/20">–</span>
                   {/if}
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </section>

  <!-- Admin View: All Absences -->
  {#if isAdmin}
    <section class="section-card-flush bg-surface-container-low/10 overflow-hidden rounded-3xl border border-outline-variant/30">
      <div class="px-8 py-5 border-b border-outline-variant/30 flex items-center justify-between">
        <h3 class="text-lg font-black text-on-surface flex items-center gap-3">
          <span class="material-symbols-outlined text-amber-500">admin_panel_settings</span>
          Gestion des Absences (Admin)
        </h3>
      </div>
      
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead class="bg-surface-container-low">
            <tr>
              <th class="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant text-center">Utilisateur</th>
              <th class="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Période</th>
              <th class="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Raison</th>
              <th class="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Statut</th>
              <th class="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-on-surface-variant text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline-variant/10">
            {#if otherAbsences.length === 0}
              <tr>
                <td colspan="5" class="px-8 py-10 text-center text-on-surface-variant">Aucune autre absence à gérer.</td>
              </tr>
            {:else}
              {#each otherAbsences as absence}
                <tr class="hover:bg-surface-hover transition-colors">
                  <td class="px-8 py-5">
                    <div class="flex flex-col items-center">
                       <div class="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-[10px] font-black text-on-surface-variant">{(absence.staffUserId || "").slice(-2)}</div>
                       <div class="text-[10px] font-bold mt-1 text-on-surface-variant">{absence.staffMember?.userId || absence.staffUserId}</div>
                    </div>
                  </td>
                  <td class="px-8 py-5">
                    <div class="text-sm font-bold text-on-surface">{new Date(absence.startDate).toLocaleDateString('fr-FR')}</div>
                    <div class="text-[11px] text-on-surface-variant font-medium">Au {new Date(absence.endDate).toLocaleDateString('fr-FR')}</div>
                  </td>
                  <td class="px-8 py-5 text-sm font-medium text-on-surface-variant">
                    {absence.reason}
                  </td>
                  <td class="px-8 py-5">
                    <span class="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider {getStatusColor(absence.status)}">
                      {formatStatus(absence.status)}
                    </span>
                  </td>
                  <td class="px-8 py-5 text-right">
                    {#if absence.status === 'PENDING'}
                      <div class="flex items-center justify-end gap-2">
                        <button onclick={() => setStatus(absence.id, 'APPROVED')} class="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg hover:bg-emerald-500 hover:text-white transition-all shadow-sm" title="Approuver">
                          <span class="material-symbols-outlined text-lg">check</span>
                        </button>
                        <button onclick={() => setStatus(absence.id, 'REJECTED')} class="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all shadow-sm" title="Refuser">
                          <span class="material-symbols-outlined text-lg">close</span>
                        </button>
                      </div>
                    {:else}
                       <button onclick={() => setStatus(absence.id, 'PENDING')} class="text-[10px] font-bold text-on-surface-variant hover:text-primary transition-colors">
                         Réinitialiser
                       </button>
                    {/if}
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
</div>

{#if modalOpen}
  <div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => modalOpen = false}></div>
    
    <div class="relative w-full max-w-lg bg-surface-container-lowest rounded-3xl shadow-2xl overflow-hidden border border-outline-variant/30 font-inter">
      <div class="p-8 border-b border-outline-variant/30 flex items-center justify-between bg-primary/5">
        <div>
          <h3 class="text-2xl font-black text-on-surface">Déclarer une Absence</h3>
          <p class="text-on-surface-variant text-sm">Informez l'équipe de votre indisponibilité.</p>
        </div>
      </div>

      <div class="p-8 space-y-6">
        <div class="grid grid-cols-2 gap-4">
           <div>
            <label class="block text-xs font-black text-on-surface-variant uppercase tracking-[0.2em] mb-2">Début</label>
            <FormInput type="date" bind:value={startDate} className="w-full" />
          </div>
          <div>
            <label class="block text-xs font-black text-on-surface-variant uppercase tracking-[0.2em] mb-2">Fin (Inclus)</label>
            <FormInput type="date" bind:value={endDate} className="w-full" />
          </div>
        </div>

        <div>
          <label class="block text-xs font-black text-on-surface-variant uppercase tracking-[0.2em] mb-2">Raison de l'absence</label>
          <FormTextarea 
            bind:value={reason}
            placeholder="Ex: Vacances, Personnel, Travail..."
            rows={4}
            className="w-full resize-none"
          />
        </div>

        <div class="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 flex gap-3">
           <span class="material-symbols-outlined text-amber-500">lightbulb</span>
           <p class="text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed font-medium">
             Une absence approuvée vous marquera automatiquement comme <strong>Excusé</strong> lors de la création d'une réunion tombant pendant cette période.
           </p>
        </div>

        <div class="flex items-center justify-end gap-4 pt-4 mt-6 border-t border-outline-variant/30">
          <button onclick={() => modalOpen = false} class="px-6 py-2.5 font-bold text-on-surface-variant hover:bg-surface-hover rounded-xl transition-colors">
            Annuler
          </button>
          <button 
            onclick={save}
            disabled={saving || !startDate || !endDate || !reason}
            class="px-8 py-2.5 bg-primary text-on-primary rounded-xl font-black shadow-lg shadow-primary/20 hover:shadow-primary/40 disabled:opacity-50 transition-all flex items-center gap-2"
          >
            {#if saving}
              <div class="w-4 h-4 border-2 border-on-primary/20 border-t-on-primary rounded-full animate-spin"></div>
            {/if}
            Envoyer la déclaration
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(.font-headline) {
    font-family: 'Outfit', 'Inter', sans-serif;
  }
</style>
