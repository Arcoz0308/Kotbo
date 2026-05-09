<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { 
    fetchAbsences, 
    createAbsence, 
    updateAbsenceStatus, 
    fetchStaffMembers, 
    fetchStaffRoles,
    fetchStaffCalendarData,
    fetchAbsenceConfig
  } from '../lib/api';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import ActionButton from '../lib/components/ActionButton.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import Calendar from '../lib/components/Calendar.svelte';
  import AbsenceModal from '../lib/components/AbsenceModal.svelte';
  import CalendarEventModal from '../lib/components/CalendarEventModal.svelte';

  let absences = $state<any[]>([]);
  let allStaff = $state<any[]>([]);
  let allRoles = $state<any[]>([]);
  let calendarData = $state<{ absences: any[], voiceSessions: any[] }>({ absences: [], voiceSessions: [] });
  let absenceConfig = $state<any>(null);
  let loading = $state(true);
  
  // Selection states
  let selectedStaffIds = $state<string[]>([]);

  // Modal states
  let modalOpen = $state(false);
  let selectedDate = $state(new Date());
  let selectedEndDate = $state<Date | null>(null);

  // Decision Modal State
  let decisionModalOpen = $state(false);
  let selectedAbsenceForDecision = $state<any>(null);
  let decisionStatus = $state<'APPROVED' | 'REJECTED'>('APPROVED');
  let decisionNote = $state('');
  let decisionSaving = $state(false);

  // Detail Modal State
  let detailModalOpen = $state(false);
  let selectedEvent = $state<any>(null);

  const isAdmin = $derived(authStore.guilds.find(g => g.id === authStore.selectedGuildId)?.accessLevel === 'admin');
  const isManager = $derived(isAdmin || (absenceConfig?.roleAccess?.some((ra: any) => ra.canModerate) ?? false));

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

  async function loadInitialData() {
    loading = true;
    try {
      const [membersData, rolesData, configData] = await Promise.all([
        fetchStaffMembers(),
        fetchStaffRoles(),
        fetchAbsenceConfig().catch(() => ({ config: null }))
      ]);
      
      allStaff = membersData.members || [];
      allRoles = rolesData.roles || [];
      absenceConfig = configData.config;

      // Default selection: just me
      if (myStaffRecord) {
        selectedStaffIds = [myStaffRecord.id];
      }

      await refreshCalendar();
    } catch (e) {
      console.error('Failed to fetch initial data:', e);
    } finally {
      loading = false;
    }
  }

  let currentRangeStart = new Date();
  let currentRangeEnd = new Date();

  async function refreshCalendar() {
    try {
      const data = await fetchStaffCalendarData(currentRangeStart, currentRangeEnd, selectedStaffIds);
      calendarData = data;
    } catch (e) {
      console.error('Failed to fetch calendar data:', e);
    }
  }

  async function handleRangeChange(start: Date, end: Date) {
    currentRangeStart = start;
    currentRangeEnd = end;
    await refreshCalendar();
  }

  onMount(loadInitialData);

  const calendarEvents = $derived.by(() => {
    const events: any[] = [];

    // Map absences
    calendarData.absences.forEach(abs => {
      const start = new Date(abs.startDate);
      const end = abs.endDate ? new Date(abs.endDate) : (abs.isIndefinite ? new Date(2100, 0, 1) : start);
      const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      
      events.push({
        id: abs.id,
        title: `${abs.type}: ${abs.reason}`,
        start,
        end,
        type: 'absence',
        // If it's indefinite or longer than 12h, consider it all-day
        isAllDay: abs.isIndefinite || durationHours >= 12,
        staffName: abs.staffMember?.username || abs.staffMember?.displayName,
        avatarUrl: abs.staffMember?.avatarUrl,
        status: abs.status,
        originalData: abs,
        raw: abs
      });
    });

    // Map voice sessions
    calendarData.voiceSessions.forEach(vs => {
      events.push({
        id: vs.id,
        title: `Vocal: ${vs.channelName || 'Salon inconnu'}`,
        start: new Date(vs.joinedAt),
        end: vs.leftAt ? new Date(vs.leftAt) : new Date(),
        type: 'vocal',
        staffName: vs.staffMember?.username || vs.staffMember?.displayName,
        avatarUrl: vs.staffMember?.avatarUrl,
        details: `${Math.floor((vs.durationSeconds || 0) / 60)} min`,
        raw: vs
      });
    });

    // Map meetings
    if (calendarData.meetings) {
      calendarData.meetings.forEach(m => {
        events.push({
          id: m.id,
          title: `Réunion: ${m.title}`,
          start: new Date(m.scheduledAt),
          end: new Date(new Date(m.scheduledAt).getTime() + 3600000), // Default 1h
          type: 'meeting',
          isAllDay: false,
          details: m.description,
          raw: m
        });
      });
    }

    return events;
  });

  async function handleSaveAbsence(data: any) {
    if (!myStaffRecord) {
      throw new Error("Vous n'êtes pas enregistré comme membre du staff.");
    }

    try {
      if (data.type === 'RÉUNION') {
        if (!isAdmin) throw new Error("Seuls les admins peuvent créer des réunions.");
        const start = new Date(data.startDate + 'T' + data.startTime).toISOString();
        const end = data.endDate ? new Date(data.endDate + 'T' + data.endTime).toISOString() : undefined;
        await createMeeting(data.reason, '', start, end);
      } else {
        await createStaffAbsence({
          ...data,
          staffMemberId: data.staffUserId || myStaffRecord.id,
          startDate: new Date(data.startDate + 'T' + data.startTime),
          endDate: data.endDate ? new Date(data.endDate + 'T' + data.endTime) : undefined,
        });
      }
      modalOpen = false;
      await refreshCalendar();
    } catch (e) {
      console.error('Failed to save:', e);
      throw e;
    }
  }

  function handleEventClick(event: any) {
    selectedEvent = event;
    detailModalOpen = true;
  }

  async function confirmDecision() {
    if (!selectedAbsenceForDecision) return;
    decisionSaving = true;
    try {
      await updateAbsenceStatus(selectedAbsenceForDecision.id, decisionStatus, decisionNote);
      decisionModalOpen = false;
      await refreshCalendar();
    } catch (e) {
      console.error('Failed to update status:', e);
    } finally {
      decisionSaving = false;
    }
  }

  function toggleStaff(staffId: string) {
    if (selectedStaffIds.includes(staffId)) {
      selectedStaffIds = selectedStaffIds.filter(id => id !== staffId);
    } else {
      selectedStaffIds = [...selectedStaffIds, staffId];
    }
    refreshCalendar();
  }

  function toggleEveryone() {
    if (selectedStaffIds.length === allStaff.length) {
      selectedStaffIds = [];
    } else {
      selectedStaffIds = allStaff.map(s => s.id);
    }
    refreshCalendar();
  }

</script>

<div class="flex flex-col gap-8">
  {#if loading}
    <div class="space-y-8 animate-in fade-in duration-500">
      <!-- Header Skeleton -->
      <div class="h-32 w-full bg-surface-container-low/40 backdrop-blur-3xl rounded-[2rem] border border-outline-variant/20 animate-pulse flex items-center px-8 gap-6">
        <div class="w-16 h-16 bg-outline-variant/20 rounded-2xl"></div>
        <div class="space-y-3">
          <div class="h-8 w-64 bg-outline-variant/20 rounded-lg"></div>
          <div class="h-4 w-48 bg-outline-variant/10 rounded-md"></div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <!-- Sidebar Skeleton -->
        <div class="lg:col-span-1 h-[700px] bg-surface-container-low/40 backdrop-blur-3xl rounded-[2rem] border border-outline-variant/20 animate-pulse p-6 space-y-6">
          <div class="h-6 w-3/4 bg-outline-variant/20 rounded-md"></div>
          <div class="space-y-3">
            {#each Array(8) as _}
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-outline-variant/10"></div>
                <div class="h-4 flex-1 bg-outline-variant/10 rounded-md"></div>
              </div>
            {/each}
          </div>
        </div>

        <!-- Calendar Skeleton -->
        <div class="lg:col-span-3 h-[700px] bg-surface-container-low/40 backdrop-blur-3xl rounded-[2.5rem] border border-outline-variant/20 animate-pulse flex flex-col p-8 space-y-6">
          <div class="flex justify-between items-center">
            <div class="h-10 w-48 bg-outline-variant/20 rounded-xl"></div>
            <div class="flex gap-2">
              <div class="h-10 w-24 bg-outline-variant/10 rounded-xl"></div>
              <div class="h-10 w-24 bg-outline-variant/10 rounded-xl"></div>
            </div>
          </div>
          <div class="flex-1 grid grid-cols-7 gap-4">
            {#each Array(7) as _}
              <div class="h-full bg-outline-variant/5 rounded-2xl"></div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  {:else}
    <div class="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <!-- Header -->
  <header class="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-surface-container-low/40 backdrop-blur-3xl p-8 rounded-[2rem] border border-outline-variant/30 relative overflow-hidden group">
    <div class="absolute -top-24 -right-24 w-64 h-64 bg-primary/10 rounded-full blur-[80px] group-hover:bg-primary/20 transition-all duration-700"></div>
    
    <div class="flex items-center gap-6 relative">
      <div class="w-16 h-16 bg-gradient-to-br from-primary to-primary-container rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
        <Papicon icon="calendar" size={32} class="text-white" />
      </div>
      <div>
        <h1 class="text-3xl font-black tracking-tight text-on-surface font-headline leading-tight">Absences & Planning</h1>
        <p class="text-on-surface-variant/80 font-medium tracking-wide">Gérez vos congés et visualisez l'activité de l'équipe.</p>
      </div>
    </div>

    <div class="flex items-center gap-3 relative">
      <RefreshButton onClick={refreshCalendar} loading={loading} label="Actualiser" />
      <ActionButton onClick={() => modalOpen = true} variant="primary" icon="plus" label="Déclarer une Absence" />
    </div>
  </header>

  <div class="flex flex-col lg:flex-row gap-8">
    <!-- Sidebar: Team Filtering (Managers only) -->
    {#if isManager}
      <aside class="w-full lg:w-72 flex flex-col gap-6">
        <div class="bg-surface-container-low p-6 rounded-[2rem] border border-outline-variant/30 flex flex-col gap-4">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-black uppercase tracking-widest text-on-surface-variant">Équipe</h3>
            <button 
              onclick={toggleEveryone}
              class="text-[10px] font-black uppercase px-2 py-1 rounded-md transition-all {selectedStaffIds.length === allStaff.length ? 'bg-primary text-white' : 'bg-surface-container-high text-on-surface-variant'}"
            >
              {selectedStaffIds.length === allStaff.length ? 'Tout décocher' : 'Tout cocher'}
            </button>
          </div>
          
          <div class="flex flex-col gap-1 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {#each allStaff as staff}
              <button 
                onclick={() => toggleStaff(staff.id)}
                class="flex items-center gap-3 p-2 rounded-xl transition-all hover:bg-surface-hover group {selectedStaffIds.includes(staff.id) ? 'bg-primary/5' : ''}"
              >
                <div class="relative">
                  <img src={staff.avatarUrl || `https://ui-avatars.com/api/?name=${staff.username}`} alt="" class="w-8 h-8 rounded-full border border-outline-variant/20" />
                  {#if selectedStaffIds.includes(staff.id)}
                    <div class="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full border-2 border-surface-container-low flex items-center justify-center">
                      <div class="w-1 h-1 bg-white rounded-full"></div>
                    </div>
                  {/if}
                </div>
                <div class="flex-1 text-left">
                  <div class="text-xs font-bold text-on-surface line-clamp-1">{staff.displayName || staff.username}</div>
                  <div class="text-[10px] text-on-surface-variant uppercase tracking-wider font-medium">{staff.grade}</div>
                </div>
              </button>
            {/each}
          </div>
        </div>

        <div class="bg-amber-500/5 p-6 rounded-[2rem] border border-amber-500/20">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center">
              <Papicon icon="info" size={18} class="text-amber-600" />
            </div>
            <span class="text-xs font-black text-amber-700 uppercase">Légende</span>
          </div>
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded bg-amber-500/20 border border-amber-500/30"></div>
              <span class="text-[10px] font-bold text-on-surface-variant">Absence / Congé</span>
            </div>
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded bg-primary/20 border border-primary/30"></div>
              <span class="text-[10px] font-bold text-on-surface-variant">Activité Vocale</span>
            </div>
          </div>
        </div>
      </aside>
    {/if}

    <!-- Main Content: Calendar -->
    <main class="flex-1">
      <Calendar 
        events={calendarEvents} 
        onRangeChange={handleRangeChange}
        onEventClick={handleEventClick}
        onDateClick={(start, end) => {
          selectedDate = start;
          selectedEndDate = end || new Date(start.getTime() + 3600000);
          modalOpen = true;
        }}
      />

      <!-- Modals -->
      <AbsenceModal 
        show={modalOpen} 
        onClose={() => modalOpen = false} 
        onSave={handleSaveAbsence}
        staffMembers={allStaff}
        eligibleSuperiors={eligibleSuperiors}
        isAdmin={isAdmin}
        initialDate={selectedDate}
        initialEndDate={selectedEndDate}
      />

      <CalendarEventModal
        show={detailModalOpen}
        event={selectedEvent}
        onClose={() => detailModalOpen = false}
        extraActions={modalActions}
      />

      {#snippet modalActions()}
        {#if selectedEvent?.type === 'absence' && isManager && selectedEvent.status === 'PENDING'}
          <ActionButton 
            variant="primary" 
            onClick={() => {
              selectedAbsenceForDecision = selectedEvent.originalData;
              decisionStatus = 'APPROVED';
              decisionNote = '';
              decisionModalOpen = true;
              detailModalOpen = false;
            }} 
            label="Prendre une décision" 
            icon="check-circle"
          />
        {/if}
      {/snippet}
      </main>
    </div> <!-- Closes Div (flex-row) -->
  </div> <!-- Closes Div (content wrapper) -->
{/if} <!-- Closes If (loading) -->

  <!-- Decision Modal (kept for complexity) -->
  {#if decisionModalOpen}
    <div class="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div 
        class="absolute inset-0 bg-black/60 backdrop-blur-sm" 
        onclick={() => decisionModalOpen = false}
        onkeydown={(e) => e.key === 'Escape' && (decisionModalOpen = false)}
        role="button"
        tabindex="-1"
      ></div>
      
      <div class="relative w-full max-w-md bg-surface-container-lowest rounded-3xl shadow-2xl overflow-hidden border border-outline-variant/30 font-inter text-on-surface">
        <div class="p-6 border-b border-outline-variant/30 flex items-center justify-between {decisionStatus === 'APPROVED' ? 'bg-emerald-500/5' : 'bg-red-500/5'}">
          <div>
            <h3 class="text-xl font-black text-on-surface">
              {decisionStatus === 'APPROVED' ? 'Approuver' : 'Refuser'} l'absence
            </h3>
            <p class="text-on-surface-variant text-xs mt-1">Gérez la demande de <strong>{selectedAbsenceForDecision?.staffMember?.username}</strong>.</p>
          </div>
        </div>

        <div class="p-6 space-y-4">
          <div class="p-4 bg-surface-container-low rounded-2xl border border-outline-variant/10">
            <p class="text-[10px] font-black uppercase text-on-surface-variant mb-1">Motif :</p>
            <p class="text-sm font-medium text-on-surface italic">"{selectedAbsenceForDecision?.reason}"</p>
          </div>

          <div class="flex gap-2 p-1 bg-surface-container rounded-2xl border border-outline-variant/20">
            <button 
              onclick={() => decisionStatus = 'APPROVED'}
              class="flex-1 py-2 rounded-xl text-xs font-black transition-all {decisionStatus === 'APPROVED' ? 'bg-emerald-500 text-white shadow-lg' : 'text-on-surface-variant hover:bg-surface-hover'}"
            >
              Approuver
            </button>
            <button 
              onclick={() => decisionStatus = 'REJECTED'}
              class="flex-1 py-2 rounded-xl text-xs font-black transition-all {decisionStatus === 'REJECTED' ? 'bg-red-500 text-white shadow-lg' : 'text-on-surface-variant hover:bg-surface-hover'}"
            >
              Refuser
            </button>
          </div>

          <textarea 
            placeholder="Note optionnelle..." 
            bind:value={decisionNote}
            class="w-full bg-surface-container px-4 py-3 rounded-2xl border border-outline-variant/30 focus:border-primary outline-none transition-all text-sm"
            rows="3"
          ></textarea>

          <div class="flex gap-3">
            <button onclick={() => decisionModalOpen = false} class="flex-1 py-3 text-sm font-bold text-on-surface-variant hover:bg-surface-hover rounded-xl transition-all">
              Annuler
            </button>
            <button 
              onclick={confirmDecision}
              disabled={decisionSaving}
              class="flex-1 py-3 {decisionStatus === 'APPROVED' ? 'bg-emerald-500' : 'bg-red-500'} text-white rounded-xl text-sm font-black shadow-lg shadow-primary/20 disabled:opacity-50 transition-all"
            >
              Confirmer
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div> <!-- Closes Div 1 -->

<style>
  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(var(--color-outline-variant), 0.2);
    border-radius: 10px;
  }
</style>
