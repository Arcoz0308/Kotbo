<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { 
    fetchStaffMembers, 
    fetchStaffCalendarData, 
    createCall, 
    updateCall, 
    deleteCall,
    fetchTasks, 
    createTask, 
    updateTask, 
    deleteTask,
    createAbsence,
    createMeeting,
    deleteMeeting,
    updateMeeting,
    updateAbsenceStatus,
    deleteAbsence,
    fetchStaffRoles
  } from '../lib/api';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import ActionButton from '../lib/components/ActionButton.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import Calendar from '../lib/components/Calendar.svelte';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import FormTextarea from '../lib/components/FormTextarea.svelte';
  import FormSelect from '../lib/components/FormSelect.svelte';
  import SearchableSelect from '../lib/components/SearchableSelect.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import LoadingHint from '../lib/components/LoadingHint.svelte';

  // State
  let loading = $state(true);
  let allStaff = $state<any[]>([]);
  let allRoles = $state<any[]>([]);
  type CalendarData = { absences: any[], voiceSessions: any[], meetings: any[], calls: any[], tasks: any[] };
  const emptyCalendarData = (): CalendarData => ({ absences: [], voiceSessions: [], meetings: [], calls: [], tasks: [] });
  let calendarData = $state<CalendarData>(emptyCalendarData());
  let userTasks = $state<any[]>([]);

  // Filtering
  let selectedStaffIds = $state<string[]>([]);
  let visibleTypes = $state<string[]>(['meeting', 'absence', 'call', 'task']);

  // Modals
  let creationModalOpen = $state(false);
  let detailModalOpen = $state(false);
  let currentTab = $state<'meeting' | 'absence' | 'call' | 'task'>('meeting');
  
  // Selection dates
  let selectedStartDate = $state(new Date());
  let selectedEndDate = $state(new Date(Date.now() + 3600000));
  let currentItemDetail = $state<any>(null);

  // Forms Fields
  let formTitle = $state('');
  let formDescription = $state('');
  let formPriority = $state<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  let formAssigneeId = $state('');
  let formSuperiorId = $state('');
  let formAbsenceType = $state('Autre');
  let formChannelMode = $state('CREATE_NEW'); // CREATE_NEW, EXISTING
  let formChannelType = $state('VOICE'); // VOICE, STAGE, THREAD
  let formDiscordChannelId = $state('');
  let formIsTempChannel = $state(true);
  let formInviteeUserIds = $state<string[]>([]);

  let formError = $state('');
  let saving = $state(false);

  // Time boundaries helper
  let currentRangeStart = new Date();
  let currentRangeEnd = new Date();

  // Derived properties
  const isAdmin = $derived(authStore.guilds.find(g => g.id === authStore.selectedGuildId)?.accessLevel === 'admin');
  const myStaffRecord = $derived(allStaff.find(s => s.userId === (authStore.user as any)?.id));
  const activeStaff = $derived(allStaff.filter(s => !s.blacklistEntries || s.blacklistEntries.length === 0));

  const eligibleSuperiors = $derived.by(() => {
    if (!myStaffRecord || allRoles.length === 0) return [];
    const myRole = allRoles.find(r => r.name === myStaffRecord.grade);
    if (!myRole) return activeStaff;
    
    return activeStaff.filter(s => {
      if (s.userId === (authStore.user as any)?.id) return false;
      if (s.testingPeriods && s.testingPeriods.length > 0) return false;
      const sRole = allRoles.find(r => r.name === s.grade);
      if (!sRole) return false;
      return (sRole.sortOrder ?? 0) >= (myRole.sortOrder ?? 0);
    });
  });

  const calendarEvents = $derived.by(() => {
    const events: any[] = [];

    // Meetings
    if (visibleTypes.includes('meeting') && calendarData.meetings) {
      calendarData.meetings.forEach((m: any) => {
        events.push({
          id: m.id,
          title: `Réunion: ${m.title}`,
          start: new Date(m.scheduledAt),
          end: m.endedAt ? new Date(m.endedAt) : new Date(new Date(m.scheduledAt).getTime() + 3600000),
          type: 'meeting',
          isAllDay: false,
          details: m.description,
          raw: m
        });
      });
    }

    // Absences
    if (visibleTypes.includes('absence') && calendarData.absences) {
      calendarData.absences.forEach((abs: any) => {
        const start = new Date(abs.startDate);
        const end = abs.endDate ? new Date(abs.endDate) : (abs.isIndefinite ? new Date(start.getTime() + 86400000 * 30) : start);
        const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

        events.push({
          id: abs.id,
          title: `${abs.type}: ${abs.reason}`,
          start,
          end,
          type: 'absence',
          isAllDay: abs.isIndefinite || durationHours >= 12,
          staffName: abs.staffMember?.displayName || abs.staffMember?.username,
          avatarUrl: abs.staffMember?.avatarUrl,
          raw: abs
        });
      });
    }

    // Calls
    if (visibleTypes.includes('call') && calendarData.calls) {
      calendarData.calls.forEach((call: any) => {
        events.push({
          id: call.id,
          title: `Appel: ${call.title}`,
          start: new Date(call.scheduledAt),
          end: call.endedAt ? new Date(call.endedAt) : new Date(new Date(call.scheduledAt).getTime() + 1800000), // Default 30min
          type: 'call',
          isAllDay: false,
          details: call.description,
          raw: call
        });
      });
    }

    // Tasks
    if (visibleTypes.includes('task') && calendarData.tasks) {
      calendarData.tasks.forEach((task: any) => {
        if (task.dueDate) {
          events.push({
            id: task.id,
            title: `Tâche: ${task.title} [${task.priority}]`,
            start: new Date(task.dueDate),
            end: new Date(new Date(task.dueDate).getTime() + 1800000),
            type: 'task',
            isAllDay: false,
            details: task.description,
            raw: task
          });
        }
      });
    }

    return events;
  });

  // Helpers
  const formatLocal = (date: Date) => {
    const tzOffset = date.getTimezoneOffset() * 60000;
    const local = new Date(date.getTime() - tzOffset);
    return local.toISOString().slice(0, 16);
  };

  async function loadData() {
    loading = true;
    try {
      const [membersData, rolesData] = await Promise.all([
        fetchStaffMembers(),
        fetchStaffRoles()
      ]);
      allStaff = membersData?.members || [];
      allRoles = rolesData?.roles || [];

      // Default filter selection: just current user
      if (myStaffRecord) {
        selectedStaffIds = [myStaffRecord.id];
      } else if (allStaff.length > 0) {
        selectedStaffIds = [allStaff[0].id];
      }

      await Promise.all([refreshCalendar(), refreshTasks()]);
    } catch (e) {
      console.error('Failed to load initial data:', e);
    } finally {
      loading = false;
    }
  }

  async function refreshCalendar() {
    try {
      const data = await fetchStaffCalendarData(currentRangeStart, currentRangeEnd, selectedStaffIds);
      calendarData = {
        absences: data?.absences || [],
        voiceSessions: data?.voiceSessions || [],
        meetings: data?.meetings || [],
        calls: data?.calls || [],
        tasks: data?.tasks || []
      };
    } catch (e) {
      console.error('Failed to load calendar data:', e);
    }
  }

  async function refreshTasks() {
    try {
      if (myStaffRecord) {
        const data = await fetchTasks(myStaffRecord.id);
        userTasks = data.tasks || [];
      }
    } catch (e) {
      console.error('Failed to load tasks:', e);
    }
  }

  async function handleRangeChange(start: Date, end: Date) {
    currentRangeStart = start;
    currentRangeEnd = end;
    await refreshCalendar();
  }

  function handleEventClick(event: any) {
    currentItemDetail = event;
    detailModalOpen = true;
  }

  function openCreateModal(start: Date, end?: Date) {
    selectedStartDate = start;
    selectedEndDate = end || new Date(start.getTime() + 3600000);
    
    // Reset form fields
    formTitle = '';
    formDescription = '';
    formPriority = 'MEDIUM';
    formAssigneeId = myStaffRecord?.id || '';
    formSuperiorId = eligibleSuperiors[0]?.userId || '';
    formAbsenceType = 'Autre';
    formChannelMode = 'CREATE_NEW';
    formChannelType = 'VOICE';
    formDiscordChannelId = '';
    formIsTempChannel = true;
    formInviteeUserIds = [];
    formError = '';

    creationModalOpen = true;
  }

  async function handleCreateItem() {
    if (!formTitle && currentTab !== 'absence') {
      formError = 'Le titre est obligatoire.';
      return;
    }

    saving = true;
    formError = '';

    try {
      if (currentTab === 'meeting') {
        const ok = await createMeeting(formTitle, formDescription, selectedStartDate.toISOString(), selectedEndDate.toISOString());
        if (!ok) throw new Error("Erreur de création de la réunion.");
      } 
      
      else if (currentTab === 'absence') {
        if (!myStaffRecord) {
          formError = "Votre compte n'est pas enregistré comme membre du staff.";
          saving = false;
          return;
        }
        if (!formDescription.trim()) {
          formError = "Le motif de l'absence est obligatoire.";
          saving = false;
          return;
        }
        if (!formSuperiorId) {
          formError = 'Veuillez sélectionner un supérieur à notifier.';
          saving = false;
          return;
        }
        if (selectedEndDate && selectedEndDate < selectedStartDate) {
          formError = 'La date de fin doit être postérieure ou égale à la date de début.';
          saving = false;
          return;
        }
        await createAbsence({
          staffUserId: myStaffRecord.userId,
          startDate: selectedStartDate.toISOString(),
          endDate: selectedEndDate ? selectedEndDate.toISOString() : undefined,
          reason: formDescription.trim(),
          type: formAbsenceType,
          superiorUserId: formSuperiorId,
          confirmIndefinite: !selectedEndDate
        });
      } 
      
      else if (currentTab === 'call') {
        await createCall({
          title: formTitle,
          description: formDescription,
          scheduledAt: selectedStartDate.toISOString(),
          channelMode: formChannelMode,
          channelType: formChannelMode === 'CREATE_NEW' ? formChannelType : null,
          discordChannelId: formChannelMode === 'EXISTING' ? formDiscordChannelId : null,
          isTempChannel: formIsTempChannel,
          inviteeUserIds: formInviteeUserIds
        });
      } 
      
      else if (currentTab === 'task') {
        await createTask({
          title: formTitle,
          description: formDescription,
          priority: formPriority,
          dueDate: selectedStartDate ? selectedStartDate.toISOString() : null,
          assigneeId: formAssigneeId
        });
      }

      creationModalOpen = false;
      await Promise.all([refreshCalendar(), refreshTasks()]);
    } catch (err: any) {
      console.error(err);
      formError = err.message || 'Une erreur est survenue lors de la création.';
    } finally {
      saving = false;
    }
  }

  async function toggleTaskCompletion(task: any) {
    const nextStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    try {
      await updateTask(task.id, { status: nextStatus });
      await Promise.all([refreshCalendar(), refreshTasks()]);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleDeleteDetail() {
    if (!currentItemDetail) return;
    const { id, type } = currentItemDetail;

    if (!confirm('Voulez-vous vraiment supprimer cet élément ?')) return;

    try {
      if (type === 'meeting') {
        await deleteMeeting(id);
      } else if (type === 'absence') {
        await deleteAbsence(id);
      } else if (type === 'call') {
        await deleteCall(id);
      } else if (type === 'task') {
        await deleteTask(id);
      }
      detailModalOpen = false;
      await Promise.all([refreshCalendar(), refreshTasks()]);
    } catch (e) {
      console.error(e);
    }
  }

  function toggleType(type: string) {
    if (visibleTypes.includes(type)) {
      visibleTypes = visibleTypes.filter(t => t !== type);
    } else {
      visibleTypes = [...visibleTypes, type];
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
    if (selectedStaffIds.length === activeStaff.length) {
      selectedStaffIds = [];
    } else {
      selectedStaffIds = activeStaff.map(s => s.id);
    }
    refreshCalendar();
  }

  onMount(() => {
    const handleDashboardRefresh = () => loadData();
    window.addEventListener('kotbo-dashboard-refresh-request', handleDashboardRefresh);
    loadData();

    return () => window.removeEventListener('kotbo-dashboard-refresh-request', handleDashboardRefresh);
  });
</script>

<ModulePage 
  title="Planning & Agenda" 
  description="Gérez et visualisez l'emploi du temps de votre équipe (Réunions, Appels, Absences et Tâches)." 
  icon="calendar"
  featureKey="absences"
>
  {#snippet actions()}
    <RefreshButton onClick={async () => { await Promise.all([refreshCalendar(), refreshTasks()]); }} loading={loading} label="Actualiser" />
    <ActionButton 
      onClick={() => openCreateModal(new Date())} 
      variant="primary" 
      icon="plus" 
      label="Planifier un événement" 
    />
  {/snippet}

  {#if loading && allStaff.length === 0}
    <div class="flex flex-col items-center justify-center py-20 bg-surface-container-lowest rounded-xl border border-outline-variant/30">
      <div class="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      <p class="mt-4 text-on-surface-variant font-medium">Chargement de l'agenda...</p>
      <LoadingHint context="data" />
    </div>
  {:else}
    <div class="flex flex-col xl:flex-row gap-8">
      
      <!-- LEFT SIDEBAR: FILTERS -->
      <aside class="w-full xl:w-72 flex flex-col gap-6 shrink-0">
        <!-- Types Filter -->
        <div class="bg-surface-container-low p-6 rounded-xl border border-outline-variant/30 flex flex-col gap-4 shadow-sm">
          <div class="flex items-center gap-3 mb-1">
            <div class="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
              <Papicon icon="filter" size={18} class="text-primary" />
            </div>
            <span class="text-xs font-semibold text-on-surface uppercase tracking-widest">Affichage</span>
          </div>

          <div class="flex flex-col gap-2">
            <button 
              onclick={() => toggleType('meeting')}
              class="flex items-center justify-between p-2 rounded-xl transition-all hover:bg-surface-hover {visibleTypes.includes('meeting') ? 'bg-emerald-500/5 border border-emerald-500/20' : 'opacity-50'}"
            >
              <div class="flex items-center gap-3">
                <div class="w-3 h-3 rounded bg-emerald-500 border border-emerald-600/30"></div>
                <span class="text-[11px] font-bold text-on-surface">Réunions staff</span>
              </div>
              <Papicon icon={visibleTypes.includes('meeting') ? 'eye' : 'eye-off'} size={14} class="text-on-surface-variant/50" />
            </button>

            <button 
              onclick={() => toggleType('call')}
              class="flex items-center justify-between p-2 rounded-xl transition-all hover:bg-surface-hover {visibleTypes.includes('call') ? 'bg-green-500/5 border border-green-500/20' : 'opacity-50'}"
            >
              <div class="flex items-center gap-3">
                <div class="w-3 h-3 rounded bg-green-500 border border-green-600/30"></div>
                <span class="text-[11px] font-bold text-on-surface">Appels Discord</span>
              </div>
              <Papicon icon={visibleTypes.includes('call') ? 'eye' : 'eye-off'} size={14} class="text-on-surface-variant/50" />
            </button>

            <button 
              onclick={() => toggleType('absence')}
              class="flex items-center justify-between p-2 rounded-xl transition-all hover:bg-surface-hover {visibleTypes.includes('absence') ? 'bg-amber-500/5 border border-amber-500/20' : 'opacity-50'}"
            >
              <div class="flex items-center gap-3">
                <div class="w-3 h-3 rounded bg-amber-500 border border-amber-600/30"></div>
                <span class="text-[11px] font-bold text-on-surface">Absences / Congés</span>
              </div>
              <Papicon icon={visibleTypes.includes('absence') ? 'eye' : 'eye-off'} size={14} class="text-on-surface-variant/50" />
            </button>

            <button 
              onclick={() => toggleType('task')}
              class="flex items-center justify-between p-2 rounded-xl transition-all hover:bg-surface-hover {visibleTypes.includes('task') ? 'bg-purple-500/5 border border-purple-500/20' : 'opacity-50'}"
            >
              <div class="flex items-center gap-3">
                <div class="w-3 h-3 rounded bg-purple-500 border border-purple-600/30"></div>
                <span class="text-[11px] font-bold text-on-surface">Tâches assignées</span>
              </div>
              <Papicon icon={visibleTypes.includes('task') ? 'eye' : 'eye-off'} size={14} class="text-on-surface-variant/50" />
            </button>
          </div>
        </div>

        <!-- Team Filter -->
        <div class="bg-surface-container-low p-6 rounded-xl border border-outline-variant/30 flex flex-col gap-4 shadow-sm">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-xs font-semibold uppercase tracking-widest text-on-surface">Membres</h3>
            <button 
              onclick={toggleEveryone}
              class="text-[11px] font-semibold uppercase px-2 py-1 rounded-md transition-all {selectedStaffIds.length === activeStaff.length ? 'bg-primary text-white shadow-sm' : 'bg-surface-container-high text-on-surface-variant'}"
            >
              {selectedStaffIds.length === activeStaff.length ? 'Tous déselectionner' : 'Tous sélectionner'}
            </button>
          </div>
          
          <div class="flex flex-col gap-1 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
            {#each activeStaff as staff}
              <button 
                onclick={() => toggleStaff(staff.id)}
                class="flex items-center gap-3 p-2 rounded-xl transition-all hover:bg-surface-hover group {selectedStaffIds.includes(staff.id) ? 'bg-primary/5' : ''}"
              >
                <div class="relative">
                  <img src={staff.avatarUrl || `https://ui-avatars.com/api/?name=${staff.username}`} alt="" class="w-8 h-8 rounded-full border border-outline-variant/20" />
                  {#if selectedStaffIds.includes(staff.id)}
                    <div class="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full border border-surface-container-low flex items-center justify-center">
                      <div class="w-1 h-1 bg-white rounded-full"></div>
                    </div>
                  {/if}
                </div>
                <div class="flex-1 text-left">
                  <div class="text-xs font-bold text-on-surface line-clamp-1">{staff.displayName || staff.username}</div>
                  <div class="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">{staff.grade}</div>
                </div>
              </button>
            {/each}
          </div>
        </div>
      </aside>

      <!-- MAIN AREA: CALENDAR -->
      <main class="flex-1 min-w-0">
        <Calendar 
          events={calendarEvents} 
          onRangeChange={handleRangeChange}
          onEventClick={handleEventClick}
          onDateClick={(start: any, end: any) => {
            openCreateModal(start, end);
          }}
        />
      </main>

      <!-- RIGHT SIDEBAR: TO-DO / TASKS LIST -->
      <aside class="w-full xl:w-80 flex flex-col gap-6 shrink-0">
        <div class="bg-surface-container-low p-6 rounded-xl border border-outline-variant/30 flex flex-col gap-4 shadow-sm min-h-[500px]">
          <div class="flex items-center gap-3 mb-2">
            <div class="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center">
              <Papicon icon="check-square" size={18} class="text-purple-600" />
            </div>
            <span class="text-xs font-semibold text-on-surface uppercase tracking-widest">Mes Tâches (To-Do)</span>
          </div>

          <div class="flex-1 flex flex-col gap-3 overflow-y-auto max-h-[400px] pr-1 custom-scrollbar">
            {#if userTasks.length === 0}
              <div class="flex-1 flex flex-col items-center justify-center text-center p-6 text-on-surface-variant/40">
                <Papicon icon="list" size={32} class="mb-2" />
                <p class="text-xs font-medium">Aucune tâche en cours.</p>
              </div>
            {:else}
              {#each userTasks as task}
                <div class="p-3 bg-surface-container-lowest rounded-lg border border-outline-variant/20 flex gap-3 items-start hover:shadow-md hover:border-purple-500/25 transition-all {task.status === 'COMPLETED' ? 'opacity-60' : ''}">
                  <button 
                    onclick={() => toggleTaskCompletion(task)}
                    class="mt-0.5 w-5 h-5 rounded border border-outline-variant hover:border-purple-500 flex items-center justify-center text-purple-600 transition-colors shrink-0"
                  >
                    {#if task.status === 'COMPLETED'}
                      <Papicon icon="check" size={14} />
                    {/if}
                  </button>
                  <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold text-on-surface truncate {task.status === 'COMPLETED' ? 'line-through' : ''}">
                      {task.title}
                    </p>
                    {#if task.description}
                      <p class="text-[10px] text-on-surface-variant line-clamp-2 mt-0.5 leading-tight">
                        {task.description}
                      </p>
                    {/if}
                    <div class="flex items-center gap-2 mt-2">
                      <span class="text-[11px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded {task.priority === 'HIGH' ? 'bg-red-500/10 text-red-600' : (task.priority === 'MEDIUM' ? 'bg-amber-500/10 text-amber-600' : 'bg-blue-500/10 text-blue-600')}">
                        {task.priority}
                      </span>
                      {#if task.dueDate}
                        <span class="text-[11px] text-on-surface-variant flex items-center gap-1 font-medium">
                          <Papicon icon="calendar" size={10} />
                          {new Date(task.dueDate).toLocaleDateString('fr-FR')}
                        </span>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            {/if}
          </div>

          <div class="pt-4 border-t border-outline-variant/20 flex flex-col gap-2">
            <button 
              onclick={() => { currentTab = 'task'; openCreateModal(new Date()); }}
              class="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              <Papicon icon="plus" size={14} />
              Ajouter une tâche
            </button>
          </div>
        </div>
      </aside>

    </div>
  {/if}

  <!-- CREATION MODAL -->
  {#if creationModalOpen}
    <div class="fixed inset-0 z-100 flex items-center justify-center p-4">
      <button type="button" class="absolute inset-0 bg-black/40 border-none cursor-default" onclick={() => creationModalOpen = false} aria-label="Fermer"></button>
      
      <div class="relative w-full max-w-2xl bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden border border-outline-variant/30 animate-in fade-in duration-200">
        
        <!-- Header & Tabs -->
        <div class="p-6 border-b border-outline-variant/20 bg-surface-container-low flex flex-col gap-4">
          <div class="flex justify-between items-center">
            <h3 class="text-xl font-semibold text-on-surface">Planifier un événement</h3>
            <button onclick={() => creationModalOpen = false} class="w-8 h-8 rounded-full hover:bg-surface-hover flex items-center justify-center transition-colors">
              <Papicon icon="x" size={20} />
            </button>
          </div>

          <!-- Outlook/Teams inspired tabs -->
          <div class="flex bg-surface-container p-1 rounded-lg border border-outline-variant/20 gap-1">
            <button 
              onclick={() => currentTab = 'meeting'}
              class="flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 {currentTab === 'meeting' ? 'bg-emerald-500 text-white shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}"
            >
              <Papicon icon="calendar" size={14} />
              Réunion Staff
            </button>
            <button 
              onclick={() => currentTab = 'call'}
              class="flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 {currentTab === 'call' ? 'bg-green-600 text-white shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}"
            >
              <Papicon icon="phone" size={14} />
              Appel/Call
            </button>
            <button 
              onclick={() => currentTab = 'absence'}
              class="flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 {currentTab === 'absence' ? 'bg-amber-500 text-white shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}"
            >
              <Papicon icon="sun" size={14} />
              Absence
            </button>
            <button 
              onclick={() => currentTab = 'task'}
              class="flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 {currentTab === 'task' ? 'bg-purple-600 text-white shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}"
            >
              <Papicon icon="check" size={14} />
              Tâche
            </button>
          </div>
        </div>

        <div class="p-6 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {#if currentTab !== 'absence'}
            <div>
              <label for="form-title" class="block text-[10px] font-semibold text-on-surface uppercase tracking-widest mb-1.5">Titre</label>
              <FormInput id="form-title" bind:value={formTitle} placeholder="Ex: Réunion de coordination ou Synchro Hebdo" className="w-full font-bold" />
            </div>
          {/if}

          <!-- Date fields -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="form-start-date" class="block text-[10px] font-semibold text-on-surface uppercase tracking-widest mb-1.5">Date de début</label>
              <input 
                id="form-start-date"
                type="datetime-local" 
                value={formatLocal(selectedStartDate)}
                onchange={(e) => selectedStartDate = new Date((e.target as HTMLInputElement).value)}
                class="w-full bg-surface-container text-sm px-4 py-2.5 rounded-xl border border-outline-variant/20 focus:border-primary outline-none transition-all"
              />
            </div>
            {#if currentTab !== 'task'}
              <div>
                <label for="form-end-date" class="block text-[10px] font-semibold text-on-surface uppercase tracking-widest mb-1.5">Date de fin</label>
                <input 
                  id="form-end-date"
                  type="datetime-local" 
                  value={formatLocal(selectedEndDate)}
                  onchange={(e) => selectedEndDate = new Date((e.target as HTMLInputElement).value)}
                  class="w-full bg-surface-container text-sm px-4 py-2.5 rounded-xl border border-outline-variant/20 focus:border-primary outline-none transition-all"
                />
              </div>
            {/if}
          </div>

          <!-- Meeting/Call/Event details -->
          <div>
            <label for="form-desc" class="block text-[10px] font-semibold text-on-surface uppercase tracking-widest mb-1.5">
              {currentTab === 'absence' ? "Motif de l'absence *" : 'Description / Ordre du jour'}
            </label>
            <FormTextarea id="form-desc" bind:value={formDescription} placeholder="Détails, points à aborder..." rows={3} className="w-full resize-none" />
          </div>

          <!-- Tab Specific fields -->
          {#if currentTab === 'absence'}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label for="form-absence-type" class="block text-[10px] font-semibold text-on-surface uppercase tracking-widest mb-1.5">Type d'absence</label>
                <FormSelect 
                  id="form-absence-type"
                  bind:value={formAbsenceType}
                  className="w-full bg-surface-container text-sm pl-4 pr-10 py-2.5 rounded-xl border border-outline-variant/20 focus:border-primary outline-none transition-all"
                >
                  <option value="Vacances">Vacances / Congés</option>
                  <option value="Maladie">Maladie / Médical</option>
                  <option value="Examens">Examens / Études</option>
                  <option value="Autre">Autre motif</option>
                </FormSelect>
              </div>
              <div>
                <label for="form-superior" class="block text-[10px] font-semibold text-on-surface uppercase tracking-widest mb-1.5">Supérieur à notifier</label>
                <SearchableSelect 
                  id="form-superior" 
                  bind:value={formSuperiorId} 
                  options={eligibleSuperiors.map(s => ({ id: s.userId, name: s.displayName || s.username }))} 
                  placeholder="Sélectionner un supérieur" 
                  className="w-full" 
                />
              </div>
            </div>
          {/if}

          {#if currentTab === 'call'}
            <div class="border border-outline-variant/20 rounded-xl p-4 bg-surface-container-low space-y-4">
              <h4 class="text-xs font-semibold uppercase tracking-widest text-on-surface">Configuration Salon Discord</h4>
              
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label for="form-channel-mode" class="block text-[10px] font-semibold text-on-surface-variant uppercase tracking-widest mb-1.5">Mode de salon</label>
                  <FormSelect 
                    id="form-channel-mode"
                    bind:value={formChannelMode}
                    className="w-full bg-surface-container text-sm pl-4 pr-10 py-2.5 rounded-xl border border-outline-variant/20 focus:border-primary outline-none transition-all"
                  >
                    <option value="CREATE_NEW">Créer un salon temporaire</option>
                    <option value="EXISTING">Lier à un salon existant</option>
                  </FormSelect>
                </div>
                {#if formChannelMode === 'CREATE_NEW'}
                  <div>
                    <label for="form-channel-type" class="block text-[10px] font-semibold text-on-surface-variant uppercase tracking-widest mb-1.5">Type de salon</label>
                    <FormSelect 
                      id="form-channel-type"
                      bind:value={formChannelType}
                      className="w-full bg-surface-container text-sm pl-4 pr-10 py-2.5 rounded-xl border border-outline-variant/20 focus:border-primary outline-none transition-all"
                    >
                      <option value="VOICE">Vocal Classique</option>
                      <option value="STAGE">Salon Conférence / Stage</option>
                    </FormSelect>
                  </div>
                {:else}
                  <div>
                    <label for="form-discord-chan" class="block text-[10px] font-semibold text-on-surface-variant uppercase tracking-widest mb-1.5">Salon existant</label>
                    <SearchableSelect 
                      id="form-discord-chan" 
                      bind:value={formDiscordChannelId} 
                      options={[
                        ...dashboardStore.state.discordVoiceChannels.map(c => ({ id: c.id, name: `🔊 ${c.name}` })),
                        ...dashboardStore.state.discordChannels.map(c => ({ id: c.id, name: `# ${c.name}` }))
                      ]} 
                      placeholder="Sélectionner un salon" 
                      className="w-full" 
                    />
                  </div>
                {/if}
              </div>

              {#if formChannelMode === 'CREATE_NEW'}
                <div class="flex items-center justify-between p-3 rounded-lg bg-surface-container-high/50 border border-outline-variant/10">
                  <div>
                    <p class="text-xs font-bold">Suppression automatique</p>
                    <p class="text-[10px] text-on-surface-variant">Supprime le salon dès que le dernier membre s'en va.</p>
                  </div>
                  <ToggleSwitch checked={formIsTempChannel} onToggle={(v: boolean) => formIsTempChannel = v} />
                </div>
              {/if}

              <div>
                <span class="block text-[10px] font-semibold text-on-surface-variant uppercase tracking-widest mb-1.5">Inviter des membres du staff</span>
                <div class="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                  {#each activeStaff.filter(s => s.id !== myStaffRecord?.id) as staff}
                    <label class="flex items-center gap-2 p-2 bg-surface-container-high/40 rounded-xl cursor-pointer hover:bg-surface-container-high transition-colors">
                      <input 
                        type="checkbox" 
                        checked={formInviteeUserIds.includes(staff.id)}
                        onchange={(e) => {
                          if ((e.target as HTMLInputElement).checked) {
                            formInviteeUserIds = [...formInviteeUserIds, staff.id];
                          } else {
                            formInviteeUserIds = formInviteeUserIds.filter(id => id !== staff.id);
                          }
                        }}
                        class="rounded border-outline-variant text-primary focus:ring-primary w-4 h-4" 
                      />
                      <span class="text-xs font-semibold text-on-surface">{staff.displayName || staff.username}</span>
                    </label>
                  {/each}
                </div>
              </div>
            </div>
          {/if}

          {#if currentTab === 'task'}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label for="form-priority" class="block text-[10px] font-semibold text-on-surface uppercase tracking-widest mb-1.5">Priorité</label>
                <FormSelect 
                  id="form-priority"
                  bind:value={formPriority}
                  className="w-full bg-surface-container text-sm pl-4 pr-10 py-2.5 rounded-xl border border-outline-variant/20 focus:border-primary outline-none transition-all"
                >
                  <option value="LOW">Basse</option>
                  <option value="MEDIUM">Moyenne</option>
                  <option value="HIGH">Haute</option>
                </FormSelect>
              </div>
              <div>
                <label for="form-assignee" class="block text-[10px] font-semibold text-on-surface uppercase tracking-widest mb-1.5">Assigner à</label>
                <SearchableSelect 
                  id="form-assignee" 
                  bind:value={formAssigneeId} 
                  options={activeStaff.map(s => ({ id: s.id, name: s.displayName || s.username }))} 
                  placeholder="Moi-même (Par défaut)" 
                  className="w-full" 
                />
              </div>
            </div>
          {/if}

          {#if formError}
            <div class="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-600 text-xs font-semibold">
              {formError}
            </div>
          {/if}
        </div>

        <div class="p-6 border-t border-outline-variant/20 bg-surface-container-low flex justify-end gap-3">
          <button onclick={() => creationModalOpen = false} class="px-5 py-2.5 rounded-xl text-xs font-bold text-on-surface hover:bg-surface-hover transition-colors">
            Annuler
          </button>
          <button 
            onclick={handleCreateItem} 
            disabled={saving}
            class="px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-primary hover:bg-primary-hover disabled:opacity-50 transition-colors flex items-center gap-2 shadow-md"
          >
            {#if saving}
              <div class="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            {/if}
            Créer l'élément
          </button>
        </div>

      </div>
    </div>
  {/if}

  <!-- DETAILS / EDIT MODAL -->
  {#if detailModalOpen && currentItemDetail}
    {@const raw = currentItemDetail.raw}
    <div class="fixed inset-0 z-100 flex items-center justify-center p-4">
      <button type="button" class="absolute inset-0 bg-black/40 border-none cursor-default" onclick={() => detailModalOpen = false} aria-label="Fermer"></button>
      
      <div class="relative w-full max-w-lg bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden border border-outline-variant/30 animate-in fade-in duration-200 text-on-surface">
        
        <div class="p-6 border-b border-outline-variant/20 bg-surface-container-low flex justify-between items-center">
          <div>
            <span class="px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider {currentItemDetail.type === 'meeting' ? 'bg-emerald-500/10 text-emerald-600' : (currentItemDetail.type === 'call' ? 'bg-green-600/10 text-green-600' : (currentItemDetail.type === 'absence' ? 'bg-amber-500/10 text-amber-600' : 'bg-purple-600/10 text-purple-600'))}">
              {currentItemDetail.type}
            </span>
            <h3 class="text-lg font-semibold mt-1 leading-tight">{currentItemDetail.title}</h3>
          </div>
          <button onclick={() => detailModalOpen = false} class="w-8 h-8 rounded-full hover:bg-surface-hover flex items-center justify-center transition-colors">
            <Papicon icon="x" size={20} />
          </button>
        </div>

        <div class="p-6 space-y-4">
          {#if raw.description || raw.reason}
            <div class="p-4 bg-surface-container-low rounded-lg border border-outline-variant/10 text-xs italic">
              {raw.description || raw.reason}
            </div>
          {/if}

          <div class="space-y-2 text-xs">
            <div class="flex justify-between py-1.5 border-b border-outline-variant/10">
              <span class="font-bold">Début :</span>
              <span>{new Date(currentItemDetail.start).toLocaleString('fr-FR')}</span>
            </div>
            {#if currentItemDetail.end}
              <div class="flex justify-between py-1.5 border-b border-outline-variant/10">
                <span class="font-bold">Fin :</span>
                <span>{new Date(currentItemDetail.end).toLocaleString('fr-FR')}</span>
              </div>
            {/if}

            {#if currentItemDetail.type === 'call'}
              <div class="flex justify-between py-1.5 border-b border-outline-variant/10">
                <span class="font-bold">Mode Salon :</span>
                <span>{raw.channelMode === 'CREATE_NEW' ? 'Salon temporaire créé' : 'Salon Discord existant'}</span>
              </div>
              {#if raw.discordChannelId}
                <div class="flex justify-between py-1.5 border-b border-outline-variant/10">
                  <span class="font-bold">ID Salon Discord :</span>
                  <span class="font-mono">{raw.discordChannelId}</span>
                </div>
              {/if}
              {#if raw.invitees && raw.invitees.length > 0}
                <div class="py-2">
                  <span class="font-bold block mb-1">Invités :</span>
                  <div class="flex flex-wrap gap-1.5">
                    {#each raw.invitees as invitee}
                      <span class="px-2 py-1 rounded bg-surface-container-high text-[10px] font-semibold">
                        {invitee.staffMember?.displayName || invitee.staffMember?.username || 'Membre'}
                      </span>
                    {/each}
                  </div>
                </div>
              {/if}
            {/if}

            {#if currentItemDetail.type === 'task'}
              <div class="flex justify-between py-1.5 border-b border-outline-variant/10">
                <span class="font-bold">Statut :</span>
                <span class="font-semibold uppercase tracking-wider text-purple-600">{raw.status}</span>
              </div>
              <div class="flex justify-between py-1.5 border-b border-outline-variant/10">
                <span class="font-bold">Priorité :</span>
                <span class="font-semibold uppercase tracking-wider text-amber-500">{raw.priority}</span>
              </div>
              <div class="flex justify-between py-1.5 border-b border-outline-variant/10">
                <span class="font-bold">Assigné à :</span>
                <span>{raw.assignee?.displayName || raw.assignee?.username}</span>
              </div>
            {/if}
          </div>
        </div>

        <div class="p-6 border-t border-outline-variant/20 bg-surface-container-low flex justify-between gap-3">
          <button onclick={handleDeleteDetail} class="px-5 py-2.5 rounded-xl text-xs font-bold text-red-600 hover:bg-red-500/10 transition-colors flex items-center gap-1.5">
            <Papicon icon="trash-2" size={14} />
            Supprimer
          </button>
          <button onclick={() => detailModalOpen = false} class="px-6 py-2.5 rounded-xl text-xs font-bold text-on-surface bg-surface-container hover:bg-surface-hover transition-colors">
            Fermer
          </button>
        </div>

      </div>
    </div>
  {/if}

</ModulePage>

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
