<script lang="ts">
  import { channelDisplayName } from '../lib/channelUtils';
  import { onMount } from 'svelte';
  import { router } from 'tinro';
  import { resolveTabFromUrl, gotoTab } from '../lib/tabRouting';
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
    fetchStaffRoles,
    searchDiscordMembers
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

  // Calendar binding
  let calendarView = $state<string>('week');
  let calendarCurrentDate = $state(new Date());

  // Filtering
  let selectedStaffIds = $state<string[]>([]);
  let visibleTypes = $state<string[]>(['meeting', 'absence', 'call', 'task']);

  // Panels
  let showTaskPanel = $state(true);
  let sidebarCollapsed = $state(false);

  // Modals
  let creationModalOpen = $state(false);
  let detailModalOpen = $state(false);
  const planningTabs = ['meeting', 'absence', 'call', 'task'] as const;
  let currentTab = $state<'meeting' | 'absence' | 'call' | 'task'>('meeting');

  $effect(() => {
    const _path = $router.path;
    currentTab = resolveTabFromUrl('/planning', planningTabs, 'meeting') as typeof currentTab;
  });

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
  let formChannelMode = $state('CREATE_NEW');
  let formChannelType = $state('VOICE');
  let formDiscordChannelId = $state('');
  let formIsTempChannel = $state(true);
  let formInviteeUserIds = $state<string[]>([]);

  let formError = $state('');
  let saving = $state(false);

  // Member search for call invitees
  let memberSearchQuery = $state('');
  let memberSearchResults = $state<any[]>([]);
  let memberSearchLoading = $state(false);
  let memberSearchTimeout: ReturnType<typeof setTimeout> | null = null;
  let formInviteeMemberIds = $state<string[]>([]);
  let selectedMembers = $state<Map<string, any>>(new Map());

  async function searchMembers(query: string) {
    if (!query.trim()) {
      memberSearchResults = [];
      return;
    }
    memberSearchLoading = true;
    try {
      const data = await searchDiscordMembers(query, 15);
      memberSearchResults = (data?.members || []).filter(
        (m: any) => !activeStaff.some(s => s.userId === m.id) && m.id !== (authStore.user as any)?.id
      );
    } catch (e) {
      console.error('Member search error:', e);
      memberSearchResults = [];
    } finally {
      memberSearchLoading = false;
    }
  }

  function handleMemberSearchInput(value: string) {
    memberSearchQuery = value;
    if (memberSearchTimeout) clearTimeout(memberSearchTimeout);
    memberSearchTimeout = setTimeout(() => searchMembers(value), 300);
  }

  function toggleMemberInvitee(member: any) {
    if (formInviteeMemberIds.includes(member.id)) {
      formInviteeMemberIds = formInviteeMemberIds.filter(id => id !== member.id);
      const next = new Map(selectedMembers);
      next.delete(member.id);
      selectedMembers = next;
    } else {
      formInviteeMemberIds = [...formInviteeMemberIds, member.id];
      const next = new Map(selectedMembers);
      next.set(member.id, member);
      selectedMembers = next;
    }
  }

  // Time boundaries
  let currentRangeStart = new Date();
  let currentRangeEnd = new Date();

  // Mini calendar
  let miniCalDate = $state(new Date());

  // Derived
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

  // Events for calendar (no type prefix — Outlook uses color, not text labels)
  const calendarEvents = $derived.by(() => {
    const events: any[] = [];

    if (visibleTypes.includes('meeting') && calendarData.meetings) {
      calendarData.meetings.forEach((m: any) => {
        events.push({
          id: m.id,
          title: m.title,
          start: new Date(m.scheduledAt),
          end: m.endedAt ? new Date(m.endedAt) : new Date(new Date(m.scheduledAt).getTime() + 3600000),
          type: 'meeting',
          isAllDay: false,
          details: m.description,
          raw: m
        });
      });
    }

    if (visibleTypes.includes('absence') && calendarData.absences) {
      calendarData.absences.forEach((abs: any) => {
        const start = new Date(abs.startDate);
        const end = abs.endDate ? new Date(abs.endDate) : (abs.isIndefinite ? new Date(start.getTime() + 86400000 * 30) : start);
        const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        events.push({
          id: abs.id,
          title: abs.reason,
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

    if (visibleTypes.includes('call') && calendarData.calls) {
      calendarData.calls.forEach((call: any) => {
        events.push({
          id: call.id,
          title: call.title,
          start: new Date(call.scheduledAt),
          end: call.endedAt ? new Date(call.endedAt) : new Date(new Date(call.scheduledAt).getTime() + 1800000),
          type: 'call',
          isAllDay: false,
          details: call.description,
          raw: call
        });
      });
    }

    if (visibleTypes.includes('task') && calendarData.tasks) {
      calendarData.tasks.forEach((task: any) => {
        if (task.dueDate) {
          events.push({
            id: task.id,
            title: task.title,
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

  // Mini calendar helpers
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  function isToday(date: Date) {
    const t = new Date();
    return date.getDate() === t.getDate() && date.getMonth() === t.getMonth() && date.getFullYear() === t.getFullYear();
  }

  function isSameDay(a: Date, b: Date) {
    return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  }

  const miniCalDays = $derived.by(() => {
    const year = miniCalDate.getFullYear();
    const month = miniCalDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = firstDay === 0 ? 6 : firstDay - 1;

    const days: { date: Date; isCurrentMonth: boolean }[] = [];
    const prevDays = new Date(year, month, 0).getDate();
    for (let i = offset - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month - 1, prevDays - i), isCurrentMonth: false });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    while (days.length % 7 !== 0) {
      const nextDay = days.length - offset - daysInMonth + 1;
      days.push({ date: new Date(year, month + 1, nextDay), isCurrentMonth: false });
    }
    return days;
  });

  function navigateToDate(date: Date) {
    calendarCurrentDate = new Date(date);
  }

  function miniCalPrev() {
    miniCalDate = new Date(miniCalDate.getFullYear(), miniCalDate.getMonth() - 1, 1);
  }

  function miniCalNext() {
    miniCalDate = new Date(miniCalDate.getFullYear(), miniCalDate.getMonth() + 1, 1);
  }

  // Format helper
  const formatLocal = (date: Date) => {
    const tzOffset = date.getTimezoneOffset() * 60000;
    const local = new Date(date.getTime() - tzOffset);
    return local.toISOString().slice(0, 16);
  };

  // Data loading
  async function loadData() {
    loading = true;
    try {
      const [membersData, rolesData] = await Promise.all([
        fetchStaffMembers(),
        fetchStaffRoles()
      ]);
      allStaff = membersData?.members || [];
      allRoles = rolesData?.roles || [];

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
    formInviteeMemberIds = [];
    selectedMembers = new Map();
    memberSearchQuery = '';
    memberSearchResults = [];
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
      } else if (currentTab === 'absence') {
        if (!myStaffRecord) { formError = "Votre compte n'est pas enregistré comme membre du staff."; saving = false; return; }
        if (!formDescription.trim()) { formError = "Le motif de l'absence est obligatoire."; saving = false; return; }
        if (!formSuperiorId) { formError = 'Veuillez sélectionner un supérieur à notifier.'; saving = false; return; }
        if (selectedEndDate && selectedEndDate < selectedStartDate) { formError = 'La date de fin doit être postérieure ou égale à la date de début.'; saving = false; return; }
        await createAbsence({
          staffUserId: myStaffRecord.userId,
          startDate: selectedStartDate.toISOString(),
          endDate: selectedEndDate ? selectedEndDate.toISOString() : undefined,
          reason: formDescription.trim(),
          type: formAbsenceType,
          superiorUserId: formSuperiorId,
          confirmIndefinite: !selectedEndDate
        });
      } else if (currentTab === 'call') {
        await createCall({
          title: formTitle,
          description: formDescription,
          scheduledAt: selectedStartDate.toISOString(),
          channelMode: formChannelMode,
          channelType: formChannelMode === 'CREATE_NEW' ? formChannelType : null,
          discordChannelId: formChannelMode === 'EXISTING' ? formDiscordChannelId : null,
          isTempChannel: formIsTempChannel,
          inviteeUserIds: [...formInviteeUserIds, ...formInviteeMemberIds]
        });
      } else if (currentTab === 'task') {
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
    } catch (e) { console.error(e); }
  }

  async function handleDeleteDetail() {
    if (!currentItemDetail) return;
    const { id, type } = currentItemDetail;
    if (!confirm('Voulez-vous vraiment supprimer cet élément ?')) return;
    try {
      if (type === 'meeting') await deleteMeeting(id);
      else if (type === 'absence') await deleteAbsence(id);
      else if (type === 'call') await deleteCall(id);
      else if (type === 'task') await deleteTask(id);
      detailModalOpen = false;
      await Promise.all([refreshCalendar(), refreshTasks()]);
    } catch (e) { console.error(e); }
  }

  function toggleType(type: string) {
    visibleTypes = visibleTypes.includes(type) ? visibleTypes.filter(t => t !== type) : [...visibleTypes, type];
  }

  function toggleStaff(staffId: string) {
    selectedStaffIds = selectedStaffIds.includes(staffId) ? selectedStaffIds.filter(id => id !== staffId) : [...selectedStaffIds, staffId];
    refreshCalendar();
  }

  function toggleEveryone() {
    selectedStaffIds = selectedStaffIds.length === activeStaff.length ? [] : activeStaff.map(s => s.id);
    refreshCalendar();
  }

  function getTypeLabel(type: string) {
    switch (type) {
      case 'meeting': return 'Réunion';
      case 'call': return 'Appel';
      case 'absence': return 'Absence';
      case 'task': return 'Tâche';
      default: return type;
    }
  }

  function getTypeColor(type: string) {
    switch (type) {
      case 'meeting': return 'emerald';
      case 'call': return 'green';
      case 'absence': return 'amber';
      case 'task': return 'purple';
      default: return 'slate';
    }
  }

  // Pending task count
  const pendingTaskCount = $derived(userTasks.filter(t => t.status !== 'COMPLETED').length);

  onMount(() => {
    const handleDashboardRefresh = () => loadData();
    window.addEventListener('kotbo-dashboard-refresh-request', handleDashboardRefresh);
    loadData();
    return () => window.removeEventListener('kotbo-dashboard-refresh-request', handleDashboardRefresh);
  });
</script>

<ModulePage
  title="Planning & Agenda"
  description="Gérez et visualisez l'emploi du temps de votre équipe."
  icon="calendar"
  featureKey="absences"
>
  {#snippet actions()}
    <RefreshButton onClick={async () => { await Promise.all([refreshCalendar(), refreshTasks()]); }} loading={loading} label="Actualiser" />

    <!-- Task panel toggle (Outlook "My Day") -->
    <button
      onclick={() => showTaskPanel = !showTaskPanel}
      class="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all border {showTaskPanel ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' : 'bg-surface-container border-outline-variant/20 text-on-surface-variant hover:text-on-surface'}"
    >
      <Papicon icon="check-square" size={14} />
      Ma journée
      {#if pendingTaskCount > 0}
        <span class="w-5 h-5 rounded-full bg-purple-500 text-white text-[10px] font-bold flex items-center justify-center">{pendingTaskCount}</span>
      {/if}
    </button>

    <ActionButton
      onClick={() => openCreateModal(new Date())}
      variant="primary"
      icon="plus"
      label="Nouvel événement"
    />
  {/snippet}

  {#if loading && allStaff.length === 0}
    <div class="flex flex-col items-center justify-center py-20 bg-surface-container-lowest rounded-xl border border-outline-variant/30">
      <div class="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      <p class="mt-4 text-on-surface-variant font-medium">Chargement de l'agenda...</p>
      <LoadingHint context="data" />
    </div>
  {:else}
    <div class="flex flex-col xl:flex-row gap-5">

      <!-- ===== LEFT SIDEBAR (Outlook-style: mini calendar + filters) ===== -->
      <aside class="w-full xl:w-60 flex flex-col gap-4 shrink-0 {sidebarCollapsed ? 'xl:w-12' : ''}">

        {#if !sidebarCollapsed}
          <!-- Mini Month Calendar -->
          <div class="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30 shadow-sm">
            <div class="flex items-center justify-between mb-3">
              <button onclick={miniCalPrev} class="w-6 h-6 flex items-center justify-center rounded hover:bg-surface-hover transition-colors">
                <Papicon icon="chevron-left" size={14} class="text-on-surface-variant" />
              </button>
              <span class="text-[11px] font-semibold text-on-surface capitalize">
                {capitalize(miniCalDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }))}
              </span>
              <button onclick={miniCalNext} class="w-6 h-6 flex items-center justify-center rounded hover:bg-surface-hover transition-colors">
                <Papicon icon="chevron-right" size={14} class="text-on-surface-variant" />
              </button>
            </div>

            <div class="grid grid-cols-7 gap-0">
              {#each ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as day}
                <div class="text-center text-[9px] font-semibold text-on-surface-variant/50 py-1">{day}</div>
              {/each}
              {#each miniCalDays as { date, isCurrentMonth }}
                <button
                  onclick={() => navigateToDate(date)}
                  class="text-center text-[10px] w-full aspect-square rounded-full flex items-center justify-center transition-all
                    {isCurrentMonth ? 'text-on-surface hover:bg-primary/15' : 'text-on-surface-variant/25'}
                    {isToday(date) ? 'bg-primary text-white font-bold hover:bg-primary/90' : ''}
                    {isSameDay(date, calendarCurrentDate) && !isToday(date) ? 'ring-1.5 ring-primary/50 text-primary font-semibold' : ''}"
                >
                  {date.getDate()}
                </button>
              {/each}
            </div>
          </div>

          <!-- Calendars / Type Filters -->
          <div class="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30 shadow-sm">
            <h3 class="text-[10px] font-semibold text-on-surface-variant/60 uppercase tracking-widest mb-3">Mes calendriers</h3>
            <div class="flex flex-col gap-1">
              {#each [
                { key: 'meeting', label: 'Réunions', color: 'emerald' },
                { key: 'call', label: 'Appels Discord', color: 'green' },
                { key: 'absence', label: 'Absences', color: 'amber' },
                { key: 'task', label: 'Tâches', color: 'purple' }
              ] as { key, label, color }}
                <button
                  onclick={() => toggleType(key)}
                  class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-all text-left group {visibleTypes.includes(key) ? 'hover:bg-surface-hover' : 'opacity-40 hover:opacity-60'}"
                >
                  <div class="w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors
                    {color === 'emerald' ? (visibleTypes.includes(key) ? 'bg-emerald-500 border-emerald-600' : 'border-emerald-500/40') : ''}
                    {color === 'green' ? (visibleTypes.includes(key) ? 'bg-green-500 border-green-600' : 'border-green-500/40') : ''}
                    {color === 'amber' ? (visibleTypes.includes(key) ? 'bg-amber-500 border-amber-600' : 'border-amber-500/40') : ''}
                    {color === 'purple' ? (visibleTypes.includes(key) ? 'bg-purple-500 border-purple-600' : 'border-purple-500/40') : ''}"
                  >
                    {#if visibleTypes.includes(key)}
                      <Papicon icon="check" size={10} class="text-white" />
                    {/if}
                  </div>
                  <span class="text-[11px] font-semibold text-on-surface">{label}</span>
                </button>
              {/each}
            </div>
          </div>

          <!-- Staff Members -->
          <div class="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30 shadow-sm">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-[10px] font-semibold text-on-surface-variant/60 uppercase tracking-widest">Personnes</h3>
              <button
                onclick={toggleEveryone}
                class="text-[9px] font-semibold uppercase px-2 py-0.5 rounded transition-all {selectedStaffIds.length === activeStaff.length ? 'bg-primary/20 text-primary' : 'text-on-surface-variant/50 hover:text-on-surface-variant'}"
              >
                {selectedStaffIds.length === activeStaff.length ? 'Aucun' : 'Tous'}
              </button>
            </div>

            <div class="flex flex-col gap-0.5 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
              {#each activeStaff as staff}
                <button
                  onclick={() => toggleStaff(staff.id)}
                  class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all hover:bg-surface-hover group {selectedStaffIds.includes(staff.id) ? '' : 'opacity-40'}"
                >
                  <div class="relative shrink-0">
                    <img src={staff.avatarUrl || `https://ui-avatars.com/api/?name=${staff.username}`} alt="" class="w-6 h-6 rounded-full" />
                    {#if selectedStaffIds.includes(staff.id)}
                      <div class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-primary rounded-full border-2 border-surface-container-low"></div>
                    {/if}
                  </div>
                  <div class="flex-1 text-left min-w-0">
                    <div class="text-[11px] font-semibold text-on-surface truncate">{staff.displayName || staff.username}</div>
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Sidebar collapse toggle -->
        <button
          onclick={() => sidebarCollapsed = !sidebarCollapsed}
          class="hidden xl:flex items-center justify-center w-full py-1.5 text-on-surface-variant/40 hover:text-on-surface-variant transition-colors rounded-lg hover:bg-surface-hover"
        >
          <Papicon icon={sidebarCollapsed ? 'chevrons-right' : 'chevrons-left'} size={14} />
        </button>
      </aside>

      <!-- ===== MAIN CALENDAR ===== -->
      <main class="flex-1 min-w-0">
        <Calendar
          bind:view={calendarView}
          bind:currentDate={calendarCurrentDate}
          events={calendarEvents}
          onRangeChange={handleRangeChange}
          onEventClick={handleEventClick}
          onDateClick={(start: any, end: any) => openCreateModal(start, end)}
        />
      </main>

      <!-- ===== RIGHT PANEL: Tasks / "Ma Journée" (Outlook-style) ===== -->
      {#if showTaskPanel}
        <aside class="w-full xl:w-72 flex flex-col gap-0 shrink-0">
          <div class="bg-surface-container-low rounded-xl border border-outline-variant/30 shadow-sm flex flex-col overflow-hidden" style="height: 75vh; min-height: 600px;">
            <!-- Panel Header -->
            <div class="px-5 py-3.5 border-b border-outline-variant/20 flex items-center justify-between shrink-0">
              <div class="flex items-center gap-2.5">
                <div class="w-7 h-7 bg-purple-500/15 rounded-lg flex items-center justify-center">
                  <Papicon icon="sun" size={14} class="text-purple-400" />
                </div>
                <div>
                  <h3 class="text-xs font-bold text-on-surface leading-tight">Ma journée</h3>
                  <p class="text-[9px] text-on-surface-variant/60 font-medium">
                    {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                </div>
              </div>
              <button
                onclick={() => showTaskPanel = false}
                class="w-6 h-6 rounded flex items-center justify-center hover:bg-surface-hover transition-colors"
              >
                <Papicon icon="x" size={14} class="text-on-surface-variant/50" />
              </button>
            </div>

            <!-- Tasks List -->
            <div class="flex-1 overflow-y-auto custom-scrollbar px-3 py-3">
              {#if userTasks.length === 0}
                <div class="flex flex-col items-center justify-center h-full text-center p-6 text-on-surface-variant/30">
                  <Papicon icon="check-circle" size={40} class="mb-3" />
                  <p class="text-xs font-semibold">Aucune tâche en cours</p>
                  <p class="text-[10px] mt-1">Votre journée est libre !</p>
                </div>
              {:else}
                <div class="flex flex-col gap-1.5">
                  {#each userTasks as task}
                    <div class="group flex items-start gap-2.5 p-2.5 rounded-lg transition-all hover:bg-surface-hover/50 {task.status === 'COMPLETED' ? 'opacity-50' : ''}">
                      <button
                        onclick={() => toggleTaskCompletion(task)}
                        class="mt-0.5 w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
                          {task.status === 'COMPLETED' ? 'border-purple-500 bg-purple-500' : 'border-on-surface-variant/30 hover:border-purple-500'}"
                      >
                        {#if task.status === 'COMPLETED'}
                          <Papicon icon="check" size={10} class="text-white" />
                        {/if}
                      </button>
                      <div class="flex-1 min-w-0">
                        <p class="text-[11px] font-semibold text-on-surface leading-tight {task.status === 'COMPLETED' ? 'line-through text-on-surface-variant' : ''}">{task.title}</p>
                        {#if task.description}
                          <p class="text-[10px] text-on-surface-variant/60 line-clamp-1 mt-0.5">{task.description}</p>
                        {/if}
                        <div class="flex items-center gap-2 mt-1.5">
                          {#if task.priority === 'HIGH'}
                            <span class="text-[9px] font-bold uppercase tracking-wider text-red-400 flex items-center gap-0.5">
                              <Papicon icon="alert-triangle" size={9} /> Important
                            </span>
                          {/if}
                          {#if task.dueDate}
                            <span class="text-[9px] text-on-surface-variant/50 flex items-center gap-0.5 font-medium">
                              <Papicon icon="calendar" size={9} />
                              {new Date(task.dueDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                            </span>
                          {/if}
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

            <!-- Add Task -->
            <div class="px-3 py-3 border-t border-outline-variant/15 shrink-0">
              <button
                onclick={() => { gotoTab('/planning', 'task', 'meeting'); openCreateModal(new Date()); }}
                class="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-[11px] font-semibold text-purple-400 hover:bg-purple-500/10 transition-colors"
              >
                <Papicon icon="plus" size={14} />
                Ajouter une tâche
              </button>
            </div>
          </div>
        </aside>
      {/if}
    </div>
  {/if}

  <!-- ===== CREATION MODAL ===== -->
  {#if creationModalOpen}
    <div class="fixed inset-0 z-100 flex items-center justify-center p-4">
      <button type="button" class="absolute inset-0 bg-black/50 border-none cursor-default" onclick={() => creationModalOpen = false} aria-label="Fermer"></button>

      <div class="relative w-full max-w-xl bg-surface-container-lowest rounded-xl shadow-2xl overflow-hidden border border-outline-variant/30 animate-in fade-in duration-200">

        <!-- Header -->
        <div class="px-6 py-4 border-b border-outline-variant/15 bg-surface-container-low flex justify-between items-center">
          <h3 class="text-sm font-bold text-on-surface">Nouvel événement</h3>
          <button onclick={() => creationModalOpen = false} class="w-7 h-7 rounded-md hover:bg-surface-hover flex items-center justify-center transition-colors">
            <Papicon icon="x" size={16} />
          </button>
        </div>

        <!-- Type Tabs (Outlook segment control) -->
        <div class="px-6 pt-4 pb-0">
          <div class="flex bg-surface-container/50 p-0.5 rounded-lg border border-outline-variant/15 gap-0.5">
            {#each [
              { key: 'meeting', label: 'Réunion', icon: 'calendar', color: 'emerald' },
              { key: 'call', label: 'Appel', icon: 'phone', color: 'green' },
              { key: 'absence', label: 'Absence', icon: 'sun', color: 'amber' },
              { key: 'task', label: 'Tâche', icon: 'check-square', color: 'purple' }
            ] as { key, label, icon, color }}
              <button
                onclick={() => gotoTab('/planning', key, 'meeting')}
                class="flex-1 py-2 text-[11px] font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 whitespace-nowrap
                  {currentTab === key
                    ? (color === 'emerald' ? 'bg-emerald-500 text-white shadow-sm' :
                       color === 'green' ? 'bg-green-600 text-white shadow-sm' :
                       color === 'amber' ? 'bg-amber-500 text-white shadow-sm' :
                       'bg-purple-600 text-white shadow-sm')
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-hover'}"
              >
                <Papicon icon={icon} size={12} />
                {label}
              </button>
            {/each}
          </div>
        </div>

        <div class="px-6 py-5 space-y-4 max-h-[55vh] overflow-y-auto custom-scrollbar">
          <!-- Title -->
          {#if currentTab !== 'absence'}
            <div>
              <FormInput bind:value={formTitle} placeholder="Ajouter un titre" className="w-full text-sm font-semibold border-0! border-b! border-outline-variant/20! rounded-none! px-0! py-2! focus:border-primary! bg-transparent!" />
            </div>
          {/if}

          <!-- Dates -->
          <div class="flex items-center gap-3">
            <Papicon icon="clock" size={16} class="text-on-surface-variant/50 shrink-0" />
            <div class="flex-1 flex flex-wrap items-center gap-2">
              <input
                type="datetime-local"
                value={formatLocal(selectedStartDate)}
                onchange={(e) => selectedStartDate = new Date((e.target as HTMLInputElement).value)}
                class="bg-transparent text-xs font-medium px-2 py-1.5 rounded-md border border-outline-variant/20 focus:border-primary outline-none transition-all"
              />
              {#if currentTab !== 'task'}
                <span class="text-on-surface-variant/40 text-xs">–</span>
                <input
                  type="datetime-local"
                  value={formatLocal(selectedEndDate)}
                  onchange={(e) => selectedEndDate = new Date((e.target as HTMLInputElement).value)}
                  class="bg-transparent text-xs font-medium px-2 py-1.5 rounded-md border border-outline-variant/20 focus:border-primary outline-none transition-all"
                />
              {/if}
            </div>
          </div>

          <!-- Description -->
          <div class="flex items-start gap-3">
            <Papicon icon="align-left" size={16} class="text-on-surface-variant/50 shrink-0 mt-2" />
            <FormTextarea bind:value={formDescription} placeholder={currentTab === 'absence' ? "Motif de l'absence *" : 'Ajouter une description...'} rows={2} className="w-full resize-none text-xs!" />
          </div>

          <!-- Absence-specific fields -->
          {#if currentTab === 'absence'}
            <div class="flex items-center gap-3">
              <Papicon icon="tag" size={16} class="text-on-surface-variant/50 shrink-0" />
              <div class="flex-1 grid grid-cols-2 gap-3">
                <FormSelect bind:value={formAbsenceType} className="w-full text-xs! py-1.5!">
                  <option value="Vacances">Vacances / Congés</option>
                  <option value="Maladie">Maladie / Médical</option>
                  <option value="Examens">Examens / Études</option>
                  <option value="Autre">Autre motif</option>
                </FormSelect>
                <SearchableSelect
                  bind:value={formSuperiorId}
                  options={eligibleSuperiors.map(s => ({ id: s.userId, name: s.displayName || s.username }))}
                  placeholder="Supérieur à notifier"
                  className="w-full text-xs!"
                />
              </div>
            </div>
          {/if}

          <!-- Call-specific fields -->
          {#if currentTab === 'call'}
            <div class="border border-outline-variant/15 rounded-lg p-4 bg-surface-container/30 space-y-3">
              <div class="flex items-center gap-2 text-[10px] font-semibold text-on-surface-variant/60 uppercase tracking-widest">
                <Papicon icon="headphones" size={12} />
                Configuration Discord
              </div>

              <div class="grid grid-cols-2 gap-3">
                <FormSelect bind:value={formChannelMode} className="w-full text-xs! py-1.5!">
                  <option value="CREATE_NEW">Salon temporaire</option>
                  <option value="EXISTING">Salon existant</option>
                </FormSelect>
                {#if formChannelMode === 'CREATE_NEW'}
                  <FormSelect bind:value={formChannelType} className="w-full text-xs! py-1.5!">
                    <option value="VOICE">Vocal</option>
                    <option value="STAGE">Conférence</option>
                  </FormSelect>
                {:else}
                  <SearchableSelect
                    bind:value={formDiscordChannelId}
                    options={[
                      ...dashboardStore.state.discordVoiceChannels.map(c => ({ id: c.id, name: `🔊 ${c.name}` })),
                      ...dashboardStore.state.discordChannels.map(c => ({ id: c.id, name: channelDisplayName(c) }))
                    ]}
                    placeholder="Sélectionner"
                    className="w-full text-xs!"
                  />
                {/if}
              </div>

              {#if formChannelMode === 'CREATE_NEW'}
                <div class="flex items-center justify-between py-2 px-3 rounded-md bg-surface-container-high/30">
                  <span class="text-[10px] font-medium text-on-surface-variant">Supprimer auto. quand vide</span>
                  <ToggleSwitch checked={formIsTempChannel} onToggle={(v: boolean) => formIsTempChannel = v} />
                </div>
              {/if}

              <div>
                <span class="block text-[10px] font-semibold text-on-surface-variant/60 uppercase tracking-widest mb-2">Invités — Staff</span>
                <div class="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                  {#each activeStaff.filter(s => s.id !== myStaffRecord?.id) as staff}
                    <label class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-container-high/30 rounded-md cursor-pointer hover:bg-surface-container-high/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={formInviteeUserIds.includes(staff.id)}
                        onchange={(e) => {
                          if ((e.target as HTMLInputElement).checked) formInviteeUserIds = [...formInviteeUserIds, staff.id];
                          else formInviteeUserIds = formInviteeUserIds.filter(id => id !== staff.id);
                        }}
                        class="rounded border-outline-variant text-primary focus:ring-primary w-3 h-3"
                      />
                      <span class="text-[10px] font-semibold text-on-surface">{staff.displayName || staff.username}</span>
                    </label>
                  {/each}
                </div>
              </div>

              <!-- Members search section -->
              <div>
                <span class="block text-[10px] font-semibold text-on-surface-variant/60 uppercase tracking-widest mb-2">Invités — Membres du serveur</span>

                <!-- Selected members chips -->
                {#if formInviteeMemberIds.length > 0}
                  <div class="flex flex-wrap gap-1.5 mb-2">
                    {#each formInviteeMemberIds as memberId}
                      {@const member = selectedMembers.get(memberId)}
                      {#if member}
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-cyan-500/15 border border-cyan-500/25 rounded-md text-[10px] font-semibold text-cyan-300">
                          <img src={member.avatarUrl || `https://ui-avatars.com/api/?name=${member.displayName || member.username}&size=16`} alt="" class="w-3.5 h-3.5 rounded-full" />
                          {member.displayName || member.username}
                          <button
                            onclick={() => toggleMemberInvitee(member)}
                            class="ml-0.5 w-3.5 h-3.5 rounded-full hover:bg-cyan-500/30 flex items-center justify-center transition-colors"
                          >
                            <Papicon icon="x" size={8} />
                          </button>
                        </span>
                      {/if}
                    {/each}
                  </div>
                {/if}

                <!-- Search input -->
                <div class="relative">
                  <div class="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                    {#if memberSearchLoading}
                      <div class="w-3.5 h-3.5 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                    {:else}
                      <Papicon icon="search" size={12} class="text-on-surface-variant/40" />
                    {/if}
                  </div>
                  <input
                    type="text"
                    value={memberSearchQuery}
                    oninput={(e) => handleMemberSearchInput((e.target as HTMLInputElement).value)}
                    placeholder="Rechercher un membre..."
                    class="w-full pl-8 pr-3 py-2 bg-surface-container-high/30 rounded-md border border-outline-variant/15 text-[11px] font-medium text-on-surface placeholder:text-on-surface-variant/40 outline-none focus:border-primary/50 transition-colors"
                  />
                </div>

                <!-- Search results -->
                {#if memberSearchResults.length > 0}
                  <div class="mt-2 max-h-32 overflow-y-auto custom-scrollbar rounded-md border border-outline-variant/15 bg-surface-container/50">
                    {#each memberSearchResults as member}
                      <button
                        onclick={() => toggleMemberInvitee(member)}
                        class="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all hover:bg-surface-hover/50 {formInviteeMemberIds.includes(member.id) ? 'bg-cyan-500/10' : ''}"
                      >
                        <img src={member.avatarUrl || `https://ui-avatars.com/api/?name=${member.displayName || member.username}&size=24`} alt="" class="w-5 h-5 rounded-full shrink-0" />
                        <div class="flex-1 min-w-0">
                          <span class="text-[11px] font-semibold text-on-surface truncate block">{member.displayName || member.username}</span>
                          {#if member.username !== member.displayName}
                            <span class="text-[9px] text-on-surface-variant/50">@{member.username}</span>
                          {/if}
                        </div>
                        {#if formInviteeMemberIds.includes(member.id)}
                          <div class="w-4 h-4 rounded bg-cyan-500 flex items-center justify-center shrink-0">
                            <Papicon icon="check" size={10} class="text-white" />
                          </div>
                        {:else}
                          <div class="w-4 h-4 rounded border border-outline-variant/30 shrink-0"></div>
                        {/if}
                      </button>
                    {/each}
                  </div>
                {:else if memberSearchQuery.trim() && !memberSearchLoading}
                  <p class="mt-2 text-[10px] text-on-surface-variant/40 text-center py-2">Aucun membre trouvé</p>
                {/if}
              </div>
            </div>
          {/if}

          <!-- Task-specific fields -->
          {#if currentTab === 'task'}
            <div class="flex items-center gap-3">
              <Papicon icon="flag" size={16} class="text-on-surface-variant/50 shrink-0" />
              <div class="flex-1 grid grid-cols-2 gap-3">
                <FormSelect bind:value={formPriority} className="w-full text-xs! py-1.5!">
                  <option value="LOW">Priorité basse</option>
                  <option value="MEDIUM">Priorité moyenne</option>
                  <option value="HIGH">Priorité haute</option>
                </FormSelect>
                <SearchableSelect
                  bind:value={formAssigneeId}
                  options={activeStaff.map(s => ({ id: s.id, name: s.displayName || s.username }))}
                  placeholder="Assigner à..."
                  className="w-full text-xs!"
                />
              </div>
            </div>
          {/if}

          {#if formError}
            <div class="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-[11px] font-semibold">
              <Papicon icon="alert-circle" size={14} />
              {formError}
            </div>
          {/if}
        </div>

        <!-- Footer -->
        <div class="px-6 py-3.5 border-t border-outline-variant/15 bg-surface-container-low flex justify-end gap-2">
          <button onclick={() => creationModalOpen = false} class="px-4 py-2 rounded-lg text-[11px] font-semibold text-on-surface-variant hover:bg-surface-hover transition-colors">
            Annuler
          </button>
          <button
            onclick={handleCreateItem}
            disabled={saving}
            class="px-5 py-2 rounded-lg text-[11px] font-semibold text-white bg-primary hover:bg-primary-hover disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-md"
          >
            {#if saving}
              <div class="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            {/if}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- ===== DETAIL MODAL ===== -->
  {#if detailModalOpen && currentItemDetail}
    {@const raw = currentItemDetail.raw}
    {@const typeColor = getTypeColor(currentItemDetail.type)}
    <div class="fixed inset-0 z-100 flex items-center justify-center p-4">
      <button type="button" class="absolute inset-0 bg-black/50 border-none cursor-default" onclick={() => detailModalOpen = false} aria-label="Fermer"></button>

      <div class="relative w-full max-w-md bg-surface-container-lowest rounded-xl shadow-2xl overflow-hidden border border-outline-variant/30 animate-in fade-in duration-200 text-on-surface">

        <!-- Colored top bar (Outlook-style) -->
        <div class="h-1 {typeColor === 'emerald' ? 'bg-emerald-500' : typeColor === 'green' ? 'bg-green-500' : typeColor === 'amber' ? 'bg-amber-500' : 'bg-purple-500'}"></div>

        <div class="p-5">
          <!-- Header -->
          <div class="flex justify-between items-start mb-4">
            <div class="flex-1 min-w-0">
              <span class="text-[9px] font-bold uppercase tracking-wider
                {typeColor === 'emerald' ? 'text-emerald-400' : typeColor === 'green' ? 'text-green-400' : typeColor === 'amber' ? 'text-amber-400' : 'text-purple-400'}">
                {getTypeLabel(currentItemDetail.type)}
              </span>
              <h3 class="text-base font-bold mt-0.5 leading-tight">{currentItemDetail.title}</h3>
            </div>
            <button onclick={() => detailModalOpen = false} class="w-7 h-7 rounded-md hover:bg-surface-hover flex items-center justify-center transition-colors shrink-0 ml-2">
              <Papicon icon="x" size={16} />
            </button>
          </div>

          <!-- Time -->
          <div class="flex items-center gap-2.5 text-xs text-on-surface-variant mb-4">
            <Papicon icon="clock" size={14} class="shrink-0" />
            <span class="font-medium">
              {new Date(currentItemDetail.start).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              {#if currentItemDetail.end}
                <span class="text-on-surface-variant/40 mx-1">–</span>
                {new Date(currentItemDetail.end).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              {/if}
            </span>
          </div>

          <!-- Description -->
          {#if raw.description || raw.reason}
            <div class="p-3 bg-surface-container/50 rounded-lg text-xs text-on-surface-variant leading-relaxed mb-4">
              {raw.description || raw.reason}
            </div>
          {/if}

          <!-- Type-specific details -->
          {#if currentItemDetail.type === 'call'}
            <div class="space-y-2 text-xs mb-4">
              <div class="flex items-center gap-2 text-on-surface-variant">
                <Papicon icon="headphones" size={12} />
                <span class="font-medium">{raw.channelMode === 'CREATE_NEW' ? 'Salon temporaire' : 'Salon existant'}</span>
              </div>
              {#if raw.invitees && raw.invitees.length > 0}
                <div class="flex items-start gap-2">
                  <Papicon icon="users" size={12} class="mt-0.5 text-on-surface-variant" />
                  <div class="flex flex-wrap gap-1">
                    {#each raw.invitees as invitee}
                      <span class="px-2 py-0.5 rounded bg-surface-container-high text-[10px] font-semibold">
                        {invitee.staffMember?.displayName || invitee.staffMember?.username || 'Membre'}
                      </span>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          {#if currentItemDetail.type === 'task'}
            <div class="flex items-center gap-4 text-xs mb-4">
              <div class="flex items-center gap-1.5">
                <Papicon icon="flag" size={12} class="text-on-surface-variant" />
                <span class="font-semibold {raw.priority === 'HIGH' ? 'text-red-400' : raw.priority === 'MEDIUM' ? 'text-amber-400' : 'text-blue-400'}">{raw.priority}</span>
              </div>
              <div class="flex items-center gap-1.5">
                <Papicon icon="activity" size={12} class="text-on-surface-variant" />
                <span class="font-semibold text-purple-400">{raw.status}</span>
              </div>
              {#if raw.assignee}
                <div class="flex items-center gap-1.5">
                  <Papicon icon="user" size={12} class="text-on-surface-variant" />
                  <span class="font-medium">{raw.assignee.displayName || raw.assignee.username}</span>
                </div>
              {/if}
            </div>
          {/if}

          {#if currentItemDetail.type === 'absence'}
            <div class="flex items-center gap-4 text-xs mb-4">
              <div class="flex items-center gap-1.5">
                <Papicon icon="tag" size={12} class="text-on-surface-variant" />
                <span class="font-semibold text-amber-400">{raw.type || 'Autre'}</span>
              </div>
              <div class="flex items-center gap-1.5">
                <Papicon icon="info" size={12} class="text-on-surface-variant" />
                <span class="font-semibold {raw.status === 'APPROVED' ? 'text-emerald-400' : 'text-amber-400'}">
                  {raw.status === 'APPROVED' ? 'Approuvé' : raw.status === 'PENDING' ? 'En attente' : raw.status}
                </span>
              </div>
            </div>
          {/if}
        </div>

        <!-- Footer actions -->
        <div class="px-5 py-3 border-t border-outline-variant/15 bg-surface-container-low/50 flex justify-between">
          <button onclick={handleDeleteDetail} class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold text-red-400 hover:bg-red-500/10 transition-colors">
            <Papicon icon="trash-2" size={12} />
            Supprimer
          </button>
          <button onclick={() => detailModalOpen = false} class="px-4 py-1.5 rounded-md text-[11px] font-semibold text-on-surface-variant hover:bg-surface-hover transition-colors">
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
    background: rgba(255, 255, 255, 0.06);
    border-radius: 10px;
  }
</style>
