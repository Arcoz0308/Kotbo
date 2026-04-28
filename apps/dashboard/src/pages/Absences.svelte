<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { fetchAbsences, createAbsence, updateAbsenceStatus, fetchStaffMembers, fetchStaffRoles } from '../lib/api';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import ActionButton from '../lib/components/ActionButton.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import FormSelect from '../lib/components/FormSelect.svelte';
  import FormTextarea from '../lib/components/FormTextarea.svelte';
  import Papicon from '../lib/components/Papicon.svelte';

  let absences = $state<any[]>([]);
  let allStaff = $state<any[]>([]);
  let allRoles = $state<any[]>([]);
  let loading = $state(true);
  let modalOpen = $state(false);
  let saving = $state(false);
  let errorMsg = $state('');
  
  // Decision Modal State
  let decisionModalOpen = $state(false);
  let selectedAbsenceForDecision = $state<any>(null);
  let decisionStatus = $state<'APPROVED' | 'REJECTED'>('APPROVED');
  let decisionNote = $state('');
  let decisionSaving = $state(false);

  let startDate = $state(new Date().toISOString().slice(0, 10));
  let endDate = $state(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  let reason = $state('');
  let superiorUserId = $state('');

  const myStaffRecord = $derived(allStaff.find(s => s.userId === authStore.user?.id));
  
  const eligibleSuperiors = $derived(() => {
    if (!myStaffRecord || allRoles.length === 0) return [];
    
    const myRole = allRoles.find(r => r.name === myStaffRecord.grade);
    if (!myRole) return allStaff; 
    
    return allStaff.filter(s => {
      if (s.userId === authStore.user?.id) return false;
      
      const sRole = allRoles.find(r => r.name === s.grade);
      if (!sRole) return false;
      
      return (sRole.sortOrder ?? 0) >= (myRole.sortOrder ?? 0);
    }).sort((a, b) => {
       const roleA = allRoles.find(r => r.name === a.grade);
       const roleB = allRoles.find(r => r.name === b.grade);
       return (roleB?.sortOrder ?? 0) - (roleA?.sortOrder ?? 0);
    });
  });

  const isAdmin = $derived(authStore.guilds.find(g => g.id === authStore.selectedGuildId)?.accessLevel === 'admin');

  async function loadData() {
    loading = true;
    try {
      const [absData, membersData, rolesData] = await Promise.all([
        fetchAbsences(),
        fetchStaffMembers(),
        fetchStaffRoles()
      ]);
      
      absences = absData.absences || [];
      allStaff = membersData.members || [];
      allRoles = rolesData.roles || [];

      // Sort: My absences first, then by date desc
      absences.sort((a, b) => {
        const isMineA = a.staffMember?.userId === authStore.user?.id;
        const isMineB = b.staffMember?.userId === authStore.user?.id;
        if (isMineA && !isMineB) return -1;
        if (!isMineA && isMineB) return 1;
        return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
      });
    } catch (e) {
      console.error('Failed to fetch data:', e);
    } finally {
      loading = false;
    }
  }

  onMount(loadData);

  function openCreate() {
    startDate = new Date().toISOString().slice(0, 10);
    endDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    reason = '';
    superiorUserId = '';
    errorMsg = '';
    modalOpen = true;
  }

  async function save() {
    let targetSuperiorId = superiorUserId;
    
    if (isAdmin && !targetSuperiorId) {
      targetSuperiorId = authStore.user?.id || '';
    }

    if (!startDate || !endDate || !reason || !targetSuperiorId) {
      errorMsg = 'Veuillez remplir tous les champs, y compris votre référent.';
      return;
    }
    
    saving = true;
    errorMsg = '';
    
    try {
      const success = await createAbsence({ 
        staffUserId: authStore.user?.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason,
        type: 'ABSENCE',
        superiorUserId: targetSuperiorId
      });
      
      if (success) {
        modalOpen = false;
        await loadData();
      } else {
        errorMsg = "Erreur lors de l'envoi de la déclaration. Vérifiez les informations.";
      }
    } catch (e: any) {
      console.error('Failed to create absence:', e);
      errorMsg = e.message || "Une erreur inattendue est survenue.";
    } finally {
      saving = false;
    }
  }

  async function setStatus(id: string, status: string, note: string = '') {
    if (!isAdmin) return;
    try {
      await updateAbsenceStatus(id, status, note);
      await loadData();
    } catch (e) {
      console.error('Failed to update status:', e);
    }
  }

  function openDecision(absence: any, status: 'APPROVED' | 'REJECTED') {
    selectedAbsenceForDecision = absence;
    decisionStatus = status;
    decisionNote = absence.note || '';
    decisionModalOpen = true;
  }

  async function confirmDecision() {
    if (!selectedAbsenceForDecision) return;
    decisionSaving = true;
    try {
      await setStatus(selectedAbsenceForDecision.id, decisionStatus, decisionNote);
      decisionModalOpen = false;
    } finally {
      decisionSaving = false;
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

  const myAbsences = $derived(absences.filter(a => a.staffMember?.userId === authStore.user?.id));
  const otherAbsences = $derived(absences.filter(a => a.staffMember?.userId !== authStore.user?.id));

</script>

<div class="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 font-inter">
  <div>
    <h2 class="text-3xl font-extrabold text-primary tracking-tight font-headline">Absences Staff</h2>
    <p class="text-on-surface-variant mt-1 leading-relaxed">Déclarez vos congés ou absences pour être automatiquement excusé des réunions.</p>
  </div>
  <div class="flex items-center gap-3">
    <RefreshButton onClick={loadData} loading={loading} label="Actualiser" />
    <ActionButton onClick={openCreate} variant="primary" icon="calendar" label="Déclarer une Absence" />
  </div>
</div>

<div class="space-y-12 font-inter">
  <!-- My Absences Section -->
  <section class="section-card-flush bg-surface-container-low/30 overflow-hidden rounded-3xl border border-outline-variant/30">
    <div class="px-8 py-5 border-b border-outline-variant/30 flex items-center justify-between">
      <h3 class="text-lg font-black text-on-surface flex items-center gap-3">
        <Papicon icon="user" class="text-primary" size={20} />
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
                   {#if absence.note}
                      <div title={absence.note} class="group/note relative flex items-center justify-center">
                        <Papicon 
                          icon="message-square" 
                          class={absence.status === 'REJECTED' ? 'text-red-500' : 'text-primary'} 
                          size={16} 
                        />
                        <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-surface-container-high rounded-lg shadow-xl border border-outline-variant/30 text-[10px] text-on-surface font-medium opacity-0 pointer-events-none group-hover/note:opacity-100 transition-opacity z-10">
                          {absence.note}
                        </div>
                      </div>
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
          <Papicon icon="shield" class="text-amber-500" size={20} />
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
                    <div class="flex items-center justify-end gap-3">
                      {#if absence.note}
                         <div title={absence.note} class="group/note relative">
                           <Papicon icon="message-square" class="text-on-surface-variant/40 hover:text-primary transition-colors" size={16} />
                           <div class="absolute bottom-full right-0 mb-2 w-48 p-2 bg-surface-container-high rounded-lg shadow-xl border border-outline-variant/30 text-[10px] text-on-surface font-medium opacity-0 pointer-events-none group-hover/note:opacity-100 transition-opacity z-10">
                             {absence.note}
                           </div>
                         </div>
                      {/if}

                      {#if absence.status === 'PENDING'}
                        <div class="flex items-center gap-2">
                          <button onclick={() => openDecision(absence, 'APPROVED')} class="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg hover:bg-emerald-500 hover:text-white transition-all shadow-sm" title="Approuver">
                            <Papicon icon="check" size={18} />
                          </button>
                          <button onclick={() => openDecision(absence, 'REJECTED')} class="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all shadow-sm" title="Refuser">
                            <Papicon icon="x" size={18} />
                          </button>
                        </div>
                      {:else}
                         <button onclick={() => setStatus(absence.id, 'PENDING')} class="text-[10px] font-bold text-on-surface-variant hover:text-primary transition-colors">
                           Réinitialiser
                         </button>
                      {/if}
                    </div>
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
    <div 
      class="absolute inset-0 bg-black/60 backdrop-blur-sm" 
      onclick={() => modalOpen = false}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (modalOpen = false)}
      role="button"
      tabindex="-1"
      aria-label="Fermer le modal"
    ></div>
    
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
            <label for="absence-start-date" class="block text-xs font-black text-on-surface-variant uppercase tracking-[0.2em] mb-2">Début</label>
              <FormInput id="absence-start-date" type="date" bind:value={startDate} className="w-full" />
          </div>
          <div>
              <label for="absence-end-date" class="block text-xs font-black text-on-surface-variant uppercase tracking-[0.2em] mb-2">Fin (Inclus)</label>
              <FormInput id="absence-end-date" type="date" bind:value={endDate} className="w-full" />
          </div>
        </div>

        <div>
            <label for="absence-reason" class="block text-xs font-black text-on-surface-variant uppercase tracking-[0.2em] mb-2">Raison de l'absence</label>
          <FormTextarea 
              id="absence-reason"
            bind:value={reason}
            placeholder="Ex: Vacances, Personnel, Travail..."
            rows={4}
            className="w-full resize-none"
          />
        </div>

        <div>
          <label for="absence-superior" class="block text-xs font-black text-on-surface-variant uppercase tracking-[0.2em] mb-2">
            Référent / Supérieur (à qui notifier)
            {#if isAdmin}
              <span class="ml-1 normal-case font-medium text-primary/60 text-[10px]">(Optionnel pour Admin)</span>
            {/if}
          </label>
          <FormSelect id="absence-superior" bind:value={superiorUserId} className="w-full">
            <option value="" disabled={!isAdmin}>{isAdmin ? 'Aucun (Auto-notifié)' : 'Sélectionner un supérieur...'}</option>
            {#each eligibleSuperiors() as superior}
              <option value={superior.userId}>
                {superior.displayName || superior.username} ({superior.grade})
              </option>
            {/each}
          </FormSelect>
          {#if !isAdmin && eligibleSuperiors().length === 0}
            <p class="text-[10px] text-red-500 mt-1">Aucun référent éligible trouvé. Vous devez être enregistré dans le staff.</p>
          {/if}
        </div>

        {#if errorMsg}
          <div class="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex gap-3 animate-shake">
            <Papicon icon="alert-circle" class="text-red-500" size={16} />
            <p class="text-xs text-red-700 dark:text-red-300 font-bold">{errorMsg}</p>
          </div>
        {/if}

        <div class="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 flex gap-3">
           <Papicon icon="help-circle" class="text-amber-500" size={20} />
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
            disabled={saving || !startDate || !endDate || !reason || !superiorUserId}
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

{#if decisionModalOpen}
  <div class="fixed inset-0 z-[110] flex items-center justify-center p-4">
    <div 
      class="absolute inset-0 bg-black/60 backdrop-blur-sm" 
      onclick={() => decisionModalOpen = false}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (decisionModalOpen = false)}
      role="button"
      tabindex="-1"
      aria-label="Fermer le modal"
    ></div>
    
    <div class="relative w-full max-w-md bg-surface-container-lowest rounded-3xl shadow-2xl overflow-hidden border border-outline-variant/30 font-inter">
      <div class="p-6 border-b border-outline-variant/30 flex items-center justify-between {decisionStatus === 'APPROVED' ? 'bg-emerald-500/5' : 'bg-red-500/5'}">
        <div>
          <h3 class="text-xl font-black text-on-surface">
            {decisionStatus === 'APPROVED' ? 'Approuver' : 'Refuser'} l'absence
          </h3>
          <p class="text-on-surface-variant text-xs mt-1">
            Ajoutez un commentaire pour justifier votre décision.
          </p>
        </div>
        <button onclick={() => decisionModalOpen = false} class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-hover transition-colors">
          <Papicon icon="x" size={20} />
        </button>
      </div>

      <div class="p-6 space-y-4">
        <div class="p-4 bg-surface-container-low rounded-2xl border border-outline-variant/10 text-xs">
          <p class="text-on-surface-variant font-bold mb-1 uppercase tracking-widest text-[9px]">Raison originale :</p>
          <p class="text-on-surface italic">"{selectedAbsenceForDecision?.reason}"</p>
        </div>

        <div>
          <label for="decision-note" class="block text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] mb-2">Commentaire / Note</label>
          <FormTextarea 
            id="decision-note"
            bind:value={decisionNote}
            placeholder={decisionStatus === 'APPROVED' ? "Ex: Bonnes vacances !" : "Ex: Manque de justificatif..."}
            rows={3}
            className="w-full resize-none"
          />
        </div>

        <div class="flex items-center justify-end gap-3 pt-2">
          <button onclick={() => decisionModalOpen = false} class="px-4 py-2 text-xs font-bold text-on-surface-variant hover:bg-surface-hover rounded-xl transition-colors">
            Annuler
          </button>
          <button 
            onclick={confirmDecision}
            disabled={decisionSaving}
            class="px-6 py-2 {decisionStatus === 'APPROVED' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'} text-white rounded-xl text-xs font-black shadow-lg transition-all flex items-center gap-2"
          >
            {#if decisionSaving}
              <div class="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            {/if}
            Confirmer le {decisionStatus === 'APPROVED' ? 'choix' : 'refus'}
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
