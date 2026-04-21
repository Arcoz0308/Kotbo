<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { fetchMeetings, createMeeting, deleteMeeting, updateMeeting } from '../lib/api';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import ActionButton from '../lib/components/ActionButton.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import FormTextarea from '../lib/components/FormTextarea.svelte';

  let meetings = $state<any[]>([]);
  let loading = $state(true);
  let modalOpen = $state(false);
  let detailModalOpen = $state(false);
  let editMode = $state(false);
  let saving = $state(false);

  let meetingTitle = $state('');
  let meetingDesc = $state('');
  let meetingDate = $state(new Date().toISOString().slice(0, 16));
  let currentMeetingId = $state<string | null>(null);
  let selectedMeeting = $state<any>(null);

  const isAdmin = $derived(authStore.guilds.find(g => g.id === authStore.selectedGuildId)?.accessLevel === 'admin');

  async function loadMeetings() {
    loading = true;
    try {
      const data = await fetchMeetings();
      meetings = data.meetings || [];
      // Sort by date desc
      meetings.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
    } catch (e) {
      console.error('Failed to fetch meetings:', e);
    } finally {
      loading = false;
    }
  }

  function getAttendanceStats(meeting: any) {
    const presences = meeting.presences || [];
    return {
      present: presences.filter(p => p.status === 'PRESENT').length,
      excused: presences.filter(p => p.status === 'EXCUSED' || p.status === 'ABSENT_CHECKED').length,
      absent: presences.filter(p => p.status === 'ABSENT').length
    };
  }

  onMount(loadMeetings);

  function openCreate() {
    if (!isAdmin) return;
    editMode = false;
    meetingTitle = '';
    meetingDesc = '';
    meetingDate = new Date(Date.now() + 3600000).toISOString().slice(0, 16); // +1h
    modalOpen = true;
  }

  function openEdit(meeting: any) {
    if (!isAdmin) return;
    editMode = true;
    currentMeetingId = meeting.id;
    meetingTitle = meeting.title;
    meetingDesc = meeting.description || '';
    meetingDate = new Date(meeting.scheduledAt).toISOString().slice(0, 16);
    modalOpen = true;
  }

  async function save() {
    if (!meetingTitle || !meetingDate) return;
    saving = true;
    try {
      const payload = {
        title: meetingTitle,
        description: meetingDesc,
        scheduledAt: new Date(meetingDate).toISOString()
      };

      if (editMode && currentMeetingId) {
        await updateMeeting(currentMeetingId, payload);
      } else {
        await createMeeting(meetingTitle, meetingDesc, payload.scheduledAt);
      }
      modalOpen = false;
      await loadMeetings();
    } catch (e) {
      console.error('Failed to save meeting:', e);
    } finally {
      saving = false;
    }
  }

  async function remove(id: string) {
    if (!isAdmin) return;
    if (confirm('Êtes-vous sûr de vouloir supprimer cette réunion ? Cette action est irréversible.')) {
      try {
        await deleteMeeting(id);
        await loadMeetings();
      } catch (e) {
        console.error('Failed to delete meeting:', e);
      }
    }
  }

  async function updateStatus(id: string, status: string) {
    if (!isAdmin) return;
    try {
      await updateMeeting(id, { status });
      await loadMeetings();
    } catch (e) {
      console.error('Failed to update status:', e);
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'SCHEDULED': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
      case 'IN_PROGRESS': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 animate-pulse';
      case 'COMPLETED': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
      case 'CANCELLED': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400';
    }
  }

  function formatStatus(status: string) {
    switch (status) {
      case 'SCHEDULED': return 'Planifiée';
      case 'IN_PROGRESS': return 'En cours';
      case 'COMPLETED': return 'Terminée';
      case 'CANCELLED': return 'Annulée';
      default: return status;
    }
  }

  function openDetails(meeting: any) {
    selectedMeeting = meeting;
    detailModalOpen = true;
  }
</script>

<div class="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 font-inter">
  <div>
    <h2 class="text-3xl font-extrabold text-primary tracking-tight font-headline">Réunions Staff</h2>
    <p class="text-on-surface-variant mt-1 leading-relaxed">Planification, présence automatisée et comptes-rendus des réunions d'équipe.</p>
  </div>
  <div class="flex items-center gap-3">
    <RefreshButton onClick={loadMeetings} loading={loading} label="Actualiser" />
    {#if isAdmin}
      <ActionButton onClick={openCreate} variant="primary" icon="add" label="Nouvelle Réunion" />
    {/if}
  </div>
</div>

<div class="grid grid-cols-1 gap-6">
  {#if loading && meetings.length === 0}
    <div class="flex flex-col items-center justify-center py-20 bg-surface-container-lowest rounded-3xl border border-outline-variant/30">
      <div class="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      <p class="mt-4 text-on-surface-variant font-medium">Chargement des réunions...</p>
    </div>
  {:else if meetings.length === 0}
    <div class="flex flex-col items-center justify-center py-20 bg-surface-container-lowest rounded-3xl border border-outline-variant/30">
      <span class="material-symbols-outlined text-6xl text-on-surface-variant/20 mb-4">event_busy</span>
      <h3 class="text-xl font-bold text-on-surface">Aucune réunion prévue</h3>
      <p class="text-on-surface-variant mt-1">Planifiez votre première réunion pour commencer le suivi.</p>
      {#if isAdmin}
        <button onclick={openCreate} class="mt-6 px-6 py-2.5 bg-primary text-on-primary rounded-xl font-bold hover:bg-primary-hover transition-colors">
          Créer une réunion
        </button>
      {/if}
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {#each meetings as meeting}
        {@const stats = getAttendanceStats(meeting)}
        <div class="bg-surface-container-lowest rounded-3xl border border-outline-variant/30 overflow-hidden hover:shadow-xl hover:shadow-primary/5 transition-all group">
          <div class="p-6">
            <div class="flex justify-between items-start gap-4 mb-4">
              <div>
                <span class="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider mb-2 {getStatusColor(meeting.status)}">
                  {formatStatus(meeting.status)}
                </span>
                <h4 class="text-xl font-bold text-on-surface leading-tight">{meeting.title}</h4>
                <div class="flex items-center gap-2 mt-1 text-on-surface-variant text-sm font-medium">
                  <span class="material-symbols-outlined text-lg">calendar_today</span>
                  {new Date(meeting.scheduledAt).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}
                </div>
              </div>
              {#if isAdmin}
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onclick={() => openEdit(meeting)} class="p-2 hover:bg-surface-hover rounded-full transition-colors text-on-surface-variant hover:text-primary" title="Modifier">
                    <span class="material-symbols-outlined text-lg">edit</span>
                  </button>
                  <button onclick={() => remove(meeting.id)} class="p-2 hover:bg-red-500/10 rounded-full transition-colors text-on-surface-variant hover:text-red-500" title="Supprimer">
                    <span class="material-symbols-outlined text-lg">delete</span>
                  </button>
                </div>
              {/if}
            </div>

            <p class="text-on-surface-variant text-sm line-clamp-3 mb-6 min-h-[3rem]">
              {meeting.description || 'Aucune description fournie.'}
            </p>

            <div class="grid grid-cols-3 gap-2 p-3 bg-surface-container-low rounded-2xl">
              <div class="text-center">
                <p class="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Présents</p>
                <p class="text-xl font-bold text-emerald-500">{stats.present}</p>
              </div>
              <div class="text-center border-x border-outline-variant/30">
                <p class="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Excusés</p>
                <p class="text-xl font-bold text-amber-500">{stats.excused}</p>
              </div>
              <div class="text-center">
                <p class="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Absents</p>
                <p class="text-xl font-bold text-red-500">{stats.absent}</p>
              </div>
            </div>
          </div>

          <div class="px-6 py-4 bg-surface-container-low/50 border-t border-outline-variant/30 flex items-center justify-between">
            <div class="flex -space-x-2">
              {#each meeting.presences.filter(p => p.status === 'PRESENT').slice(0, 5) as p}
                <div class="w-8 h-8 rounded-full border-2 border-surface-container-lowest bg-primary/10 flex items-center justify-center overflow-hidden" title={p.staffMember?.displayName || p.staffUserId || "U"}>
                   <span class="text-[10px] font-bold text-primary">{(p.staffMember?.displayName || p.staffUserId || "").slice(-2)}</span>
                </div>
              {/each}
              {#if stats.present > 5}
                <div class="w-8 h-8 rounded-full border-2 border-surface-container-lowest bg-surface-hover flex items-center justify-center text-[10px] font-bold text-on-surface-variant">
                  +{stats.present - 5}
                </div>
              {/if}
            </div>

            <div class="flex items-center gap-2">
              {#if isAdmin}
                 {#if meeting.status === 'SCHEDULED'}
                    <button onclick={() => updateStatus(meeting.id, 'IN_PROGRESS')} class="text-xs font-bold text-primary px-3 py-1.5 hover:bg-primary/10 rounded-lg transition-colors">
                      Démarrer
                    </button>
                 {:else if meeting.status === 'IN_PROGRESS'}
                    <button onclick={() => updateStatus(meeting.id, 'COMPLETED')} class="text-xs font-bold text-emerald-500 px-3 py-1.5 hover:bg-emerald-500/10 rounded-lg transition-colors">
                      Terminer
                    </button>
                 {/if}
              {/if}
              <button onclick={() => openDetails(meeting)} class="text-xs font-bold text-on-surface-variant px-3 py-1.5 hover:bg-surface-hover rounded-lg transition-colors">
                Détails
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if modalOpen}
  <div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => modalOpen = false}></div>
    
    <div class="relative w-full max-w-xl bg-surface-container-lowest rounded-3xl shadow-2xl overflow-hidden border border-outline-variant/30 font-inter">
      <div class="p-8 border-b border-outline-variant/30 flex items-center justify-between bg-primary/5">
        <div>
          <h3 class="text-2xl font-black text-on-surface">{editMode ? 'Modifier' : 'Planifier'} une Réunion</h3>
          <p class="text-on-surface-variant text-sm">Remplissez les détails pour l'organisation.</p>
        </div>
        <button onclick={() => modalOpen = false} class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-hover transition-colors">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <div class="p-8 space-y-6">
        <div>
          <label class="block text-xs font-black text-on-surface-variant uppercase tracking-[0.2em] mb-2">Titre de la réunion</label>
          <FormInput 
            bind:value={meetingTitle}
            placeholder="Ex: Réunion de coordination hebdomadaire"
            className="w-full text-lg font-bold"
          />
        </div>

        <div>
          <label class="block text-xs font-black text-on-surface-variant uppercase tracking-[0.2em] mb-2">Date et Heure prévue</label>
          <FormInput 
            type="datetime-local"
            bind:value={meetingDate}
            className="w-full"
          />
        </div>

        <div>
          <label class="block text-xs font-black text-on-surface-variant uppercase tracking-[0.2em] mb-2">Ordre du jour / Description</label>
          <FormTextarea 
            bind:value={meetingDesc}
            placeholder="Détails de la réunion, points à aborder..."
            rows={5}
            className="w-full resize-none"
          />
        </div>

        {#if !editMode}
          <div class="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 flex gap-3">
             <span class="material-symbols-outlined text-blue-500">info</span>
             <p class="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
               La création d'une réunion annoncera automatiquement l'événement dans le salon dédié sur Discord et activera les boutons de RSVP.
             </p>
          </div>
        {/if}

        <div class="flex items-center justify-end gap-4 pt-4 mt-6 border-t border-outline-variant/30">
          <button onclick={() => modalOpen = false} class="px-6 py-2.5 font-bold text-on-surface-variant hover:bg-surface-hover rounded-xl transition-colors">
            Annuler
          </button>
          <button 
            onclick={save}
            disabled={saving || !meetingTitle || !meetingDate}
            class="px-8 py-2.5 bg-primary text-on-primary rounded-xl font-black shadow-lg shadow-primary/20 hover:shadow-primary/40 disabled:opacity-50 disabled:grayscale transition-all flex items-center gap-2"
          >
            {#if saving}
              <div class="w-4 h-4 border-2 border-on-primary/20 border-t-on-primary rounded-full animate-spin"></div>
            {/if}
            {editMode ? 'Mettre à jour' : 'Planifier la réunion'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if detailModalOpen && selectedMeeting}
  <div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => detailModalOpen = false}></div>
    
    <div class="relative w-full max-w-2xl bg-surface-container-lowest rounded-3xl shadow-2xl overflow-hidden border border-outline-variant/30 font-inter">
      <div class="p-8 border-b border-outline-variant/30 bg-primary/5 flex items-center justify-between">
        <div>
          <h3 class="text-2xl font-black text-on-surface">{selectedMeeting.title}</h3>
          <p class="text-on-surface-variant text-sm flex items-center gap-1">
             <span class="material-symbols-outlined text-xs">calendar_today</span>
             {new Date(selectedMeeting.scheduledAt).toLocaleString('fr-FR')}
          </p>
        </div>
        <button onclick={() => detailModalOpen = false} class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-hover transition-colors">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <div class="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
        {#if selectedMeeting.description}
           <div class="p-4 bg-surface-container-low rounded-2xl border border-outline-variant/30">
              <p class="text-sm text-on-surface whitespace-pre-wrap">{selectedMeeting.description}</p>
           </div>
        {/if}

        <div class="space-y-4">
           <h4 class="text-xs font-black text-on-surface-variant uppercase tracking-widest px-1">Liste des présences</h4>
           <div class="grid grid-cols-1 gap-2">
              {#each selectedMeeting.presences as presence}
                 <div class="flex items-center justify-between p-4 bg-surface-container-low/50 rounded-2xl border border-outline-variant/10 hover:bg-surface-container-low transition-colors">
                    <div class="flex items-center gap-3">
                       <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-xs font-black text-primary">
                          {presence.staffMember?.displayName?.slice(0, 2).toUpperCase() || (presence.staffUserId || "").slice(-2)}
                       </div>
                       <div>
                          <p class="text-sm font-bold text-on-surface">{presence.staffMember?.displayName || presence.staffUserId}</p>
                          {#if presence.note}
                             <p class="text-[11px] text-on-surface-variant leading-tight mt-0.5">{presence.note}</p>
                          {/if}
                       </div>
                    </div>
                    <div>
                       <span class="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider {getStatusColor(presence.status)}">
                          {formatStatus(presence.status)}
                       </span>
                    </div>
                 </div>
              {/each}
           </div>
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
