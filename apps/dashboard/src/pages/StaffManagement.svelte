<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { API_BASE_URL, fetchGuildState, fetchPolls } from '../lib/api';
  import DiscordMemberLookup from '../lib/components/DiscordMemberLookup.svelte';
  import MetricCard from '../lib/components/MetricCard.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import type { StaffMember, StaffRole, TestingPeriod } from '../lib/types';

  let guildId = $state<string | null>(null);
  let accessLevel = $state('none');
  let loading = $state(true);
  let error = $state('');

  // Onglets
  let activeTab = $state<'members' | 'roles' | 'testing' | 'warnings' | 'blacklist' | 'polls' | 'leadership' | 'absences' | 'meetings'>('members');

  // Data
  let staffMembers = $state<StaffMember[]>([]);
  let staffRoles = $state<StaffRole[]>([]);
  let testingPeriods = $state<TestingPeriod[]>([]);
  let polls = $state<any[]>([]);
  let leadershipMetrics = $state<any[]>([]);
  let absences = $state<any[]>([]);
  let meetings = $state<any[]>([]);
  let availableDiscordRoles = $state<Array<{ id: string; name: string }>>([]);

  // Forms
  let showAddMemberForm = $state(false);
  let addMemberLookupQuery = $state('');
  let newMemberUserId = $state('');
  let newMemberGrade = $state('');
  let newMemberUsername = $state('');
  let newMemberAvatarUrl = $state('');

  let showAddRoleForm = $state(false);
  let newRoleName = $state('');
  let roleSearchQuery = $state('');
  let selectedDiscordRoleId = $state('');
  let roleSuggestionsOpen = $state(false);
  let isSavingRoleOrder = $state(false);
  let draggedRoleId = $state<string | null>(null);
  let roleDropTargetId = $state<string | null>(null);

  let showAddReportDialog = $state(false);
  let showCreateTestDialog = $state(false);
  let showHistory = $state(false);
  let selectedPeriod = $state<any>(null);
  let reportContent = $state('');
  let reportType = $state('NEUTRAL'); // POSITIVE, NEGATIVE, NEUTRAL
  let testDuration = $state(14);
  let testTargetGrade = $state('');

  let showWarnForm = $state(false);
  let warnLookupQuery = $state('');
  let warnTargetUserId = $state('');
  let warnReason = $state('');
  let warnExpiresAt = $state('');

  let showBlacklistForm = $state(false);
  let blacklistLookupQuery = $state('');
  let blacklistTargetUserId = $state('');
  let blacklistReason = $state('');
  let blacklistEndDate = $state('');

  // Absences
  let showAbsenceDecision = $state<string | null>(null);
  let absenceDecisionNote = $state('');

  // Meetings
  let showMeetingForm = $state(false);
  let newMeetingTitle = $state('');
  let newMeetingDescription = $state('');
  let newMeetingScheduledAt = $state('');
  let isSavingMeeting = $state(false);

  // Testing Periods
  let showTestingForm = $state(false);
  let testSubjectUserId = $state('');
  let testMentorUserId = $state('');
  
  let showReportFormId = $state<string | null>(null);
  let showEndTestFormId = $state<string | null>(null);
  let endTestStatus = $state<'PASSED'|'FAILED'>('PASSED');
  let endTestNotes = $state('');

  // Polls
  let showPollForm = $state(false);
  let newPollTitle = $state('');
  let newPollDescription = $state('');
  let newPollOptions = $state<string[]>(['', '']);
  let newPollClosesAt = $state('');
  let isSavingPoll = $state(false);
  
  let baseStaffRoleId = $state<string | null>(null);
  let testStaffRoleId = $state<string | null>(null);
  let isSavingConfig = $state(false);

  $effect(() => {
    if (!newMemberGrade && orderedStaffRoles.length > 0) {
      newMemberGrade = orderedStaffRoles[0].name;
    }
  });
  function normalizeText(value: string): string {
    return value.trim().toLowerCase();
  }

  function getOrderedStaffRoles() {
    return [...staffRoles].sort((left, right) => {
      const sortDelta = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
      if (sortDelta !== 0) return sortDelta;

      const levelDelta = (left.level ?? 0) - (right.level ?? 0);
      if (levelDelta !== 0) return levelDelta;

      return new Date(left.createdAt ?? 0).getTime() - new Date(right.createdAt ?? 0).getTime();
    });
  }

  const orderedStaffRoles = $derived(getOrderedStaffRoles());

  const roleSuggestions = $derived(
    (() => {
      const query = normalizeText(roleSearchQuery);
      if (!query) {
        return availableDiscordRoles.slice(0, 8);
      }

      return availableDiscordRoles
        .filter((role) => normalizeText(role.name).includes(query) || role.id.includes(query))
        .slice(0, 8);
    })()
  );

  function findDiscordRoleByQuery(query: string) {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) {
      return null;
    }

    return availableDiscordRoles.find((role) => role.id === query.trim() || normalizeText(role.name) === normalizedQuery) || null;
  }

  function handleRoleSearchInput(value: string): void {
    roleSearchQuery = value;
    const matchedRole = findDiscordRoleByQuery(value);
    selectedDiscordRoleId = matchedRole?.id ?? '';
    roleSuggestionsOpen = true;
  }

  function selectRoleSuggestion(role: { id: string; name: string }): void {
    roleSearchQuery = role.name;
    selectedDiscordRoleId = role.id;
    roleSuggestionsOpen = false;
  }

  function startRoleDrag(roleId: string): void {
    draggedRoleId = roleId;
    roleDropTargetId = roleId;
  }

  function clearRoleDragState(): void {
    draggedRoleId = null;
    roleDropTargetId = null;
  }

  function moveRoleInList(sourceRoleId: string, targetRoleId: string): void {
    if (sourceRoleId === targetRoleId) return;

    const nextRoles = getOrderedStaffRoles();
    const sourceIndex = nextRoles.findIndex((role) => role.id === sourceRoleId);
    const targetIndex = nextRoles.findIndex((role) => role.id === targetRoleId);

    if (sourceIndex < 0 || targetIndex < 0) return;

    const [movedRole] = nextRoles.splice(sourceIndex, 1);
    nextRoles.splice(targetIndex, 0, movedRole);
    staffRoles = nextRoles.map((role, index) => ({ ...role, sortOrder: index }));
    void saveStaffRoleOrder(nextRoles.map((role) => role.id));
  }

  async function saveStaffRoleOrder(orderedRoleIds: string[]) {
    if (!guildId || !authStore.token) return;

    isSavingRoleOrder = true;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/staff/roles/order`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`
        },
        body: JSON.stringify({ orderedRoleIds })
      });

      if (!res.ok) throw new Error('Erreur lors du réordonnancement');

      await loadStaffRoles();
    } catch (err) {
      console.error('Erreur réordonnancement rôles staff:', err);
      alert('Erreur lors de la mise à jour de l\'ordre des rôles');
      await loadStaffRoles();
    } finally {
      isSavingRoleOrder = false;
      clearRoleDragState();
    }
  }

  function openAddMemberForm(): void {
    showAddMemberForm = !showAddMemberForm;
    if (!showAddMemberForm) {
      addMemberLookupQuery = '';
      newMemberUserId = '';
      newMemberUsername = '';
      newMemberAvatarUrl = '';
    }
  }

  function openWarnForm(): void {
    showWarnForm = !showWarnForm;
    if (!showWarnForm) {
      warnLookupQuery = '';
      warnTargetUserId = '';
    }
  }

  function openBlacklistForm(): void {
    showBlacklistForm = !showBlacklistForm;
    if (!showBlacklistForm) {
      blacklistLookupQuery = '';
      blacklistTargetUserId = '';
    }
  }

  function openReportDialog(period: any) {
    selectedPeriod = period;
    showAddReportDialog = true;
  }

  function openTestingForm(): void {
    showTestingForm = !showTestingForm;
    if (!showTestingForm) {
      testSubjectUserId = '';
      testMentorUserId = '';
    }
  }

  async function createTestingPeriod() {
    if (!guildId || !authStore.token || !testSubjectUserId) return;
    try {
      const body = {
         staffUserId: testSubjectUserId,
         mentorId: testMentorUserId || undefined,
         plannedDurationDays: testDuration,
         targetGrade: testTargetGrade || undefined
       };

       const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/testing-periods`, {
         method: 'POST',
         headers: { 
           'Content-Type': 'application/json',
           Authorization: `Bearer ${authStore.token}` 
         },
         body: JSON.stringify(body)
       });
      if (!res.ok) throw new Error('Erreur création testing period');
      
      openTestingForm();
      await loadTestingPeriods();
    } catch (err) {
      alert('Erreur lors de la création de la période de test');
    }
  }

  async function addMentorReport() {
    if (!guildId || !authStore.token || !reportContent.trim() || !selectedPeriod) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/mentor-reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`
        },
        body: JSON.stringify({
          testingPeriodId: selectedPeriod.id,
          type: reportType,
          content: reportContent
        })
      });
      if (!res.ok) throw new Error('Erreur ajout rapport tuteur');
      
      showAddReportDialog = false;
      reportContent = '';
      reportType = 'NEUTRAL';
      await loadTestingPeriods();
    } catch (err) {
      alert('Erreur lors de l\'ajout du rapport');
    }
  }

  async function endTesting(period: any, status: 'PASSED' | 'FAILED') {
    if (!guildId || !authStore.token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/testing-periods/${period.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`
        },
        body: JSON.stringify({
          status: status,
          notes: 'Clôture via dashboard'
        })
      });
      if (!res.ok) throw new Error('Erreur fin testing period');
      
      await loadTestingPeriods();
    } catch (err) {
      alert('Erreur lors de la clôture de la période');
    }
  }

  onMount(async () => {
    if (!authStore.token) {
      error = 'Non authentifié';
      loading = false;
      return;
    }

    try {
      // Récupérer les serveurs accessibles au dashboard
      const guildsRes = await fetch(`${API_BASE_URL}/api/dashboard/guilds`, {
        headers: { Authorization: `Bearer ${authStore.token}` }
      });
      const guildsData = await guildsRes.json();

      const adminGuild = Array.isArray(guildsData.guilds)
        ? guildsData.guilds.find((guild: { accessLevel?: string }) => guild.accessLevel === 'admin')
        : null;

      if (adminGuild) {
        guildId = adminGuild.id;
        accessLevel = adminGuild.accessLevel;
      }

      if (accessLevel !== 'admin') {
        error = 'Accès admin requis pour cette page';
        loading = false;
        return;
      }

        const dashboardState = await fetchGuildState(guildId);
        availableDiscordRoles = dashboardState?.discordRoles || [];

      // Charger les données
      await loadStaffMembers();
      await loadStaffRoles();
      await loadTestingPeriods();
      await loadStaffConfig();
      await loadPolls();
      await loadLeadershipMetrics();
      await loadAbsences();
      await loadMeetings();

      loading = false;
    } catch (err) {
      console.error('Erreur:', err);
      error = 'Erreur lors du chargement';
      loading = false;
    }
  });

  async function loadStaffMembers() {
    if (!guildId || !authStore.token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/staff/members`, {
        headers: { Authorization: `Bearer ${authStore.token}` }
      });
      if (!res.ok) throw new Error(`Erreur API staff members (${res.status})`);
      const data = await res.json();
      staffMembers = data.members || [];
    } catch (err) {
      console.error('Erreur loading staff members:', err);
    }
  }

  async function loadStaffRoles() {
    if (!guildId || !authStore.token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/staff/roles`, {
        headers: { Authorization: `Bearer ${authStore.token}` }
      });
      if (!res.ok) throw new Error(`Erreur API staff roles (${res.status})`);
      const data = await res.json();
      staffRoles = data.roles || [];
    } catch (err) {
      console.error('Erreur loading staff roles:', err);
    }
  }

  async function loadStaffConfig() {
    if (!guildId || !authStore.token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/staff/config`, {
        headers: { Authorization: `Bearer ${authStore.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        baseStaffRoleId = data.config?.baseStaffRoleId ?? null;
        testStaffRoleId = data.config?.testStaffRoleId ?? null;
      }
    } catch (err) {
      console.error('Erreur loading staff config:', err);
    }
  }

  async function saveStaffConfig() {
    if (!guildId || !authStore.token) return;
    isSavingConfig = true;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/staff/config`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`
        },
        body: JSON.stringify({ baseStaffRoleId, testStaffRoleId })
      });
      if (!res.ok) throw new Error('Erreur');
    } catch (err) {
      alert('Erreur lors de la sauvegarde de la configuration globale');
    } finally {
      isSavingConfig = false;
    }
  }

  async function loadTestingPeriods() {
    if (!guildId || !authStore.token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/testing-periods`, {
        headers: { Authorization: `Bearer ${authStore.token}` }
      });
      if (!res.ok) throw new Error(`Erreur API testing periods (${res.status})`);
      const data = await res.json();
      testingPeriods = data.periods || [];
    } catch (err) {
      console.error('Erreur loading testing periods:', err);
    }
  }

  async function loadLeadershipMetrics() {
    if (!guildId || !authStore.token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/leadership`, {
        headers: { Authorization: `Bearer ${authStore.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        leadershipMetrics = data.metrics || [];
      }
    } catch (err) {
      console.error('Erreur loading metrics:', err);
    }
  }

  async function loadAbsences() {
    if (!guildId || !authStore.token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/absences`, {
        headers: { Authorization: `Bearer ${authStore.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        absences = data.absences || [];
      }
    } catch (err) {
      console.error('Erreur loading absences:', err);
    }
  }

  async function loadMeetings() {
    if (!guildId || !authStore.token) return;
    try {
       const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/meetings`, {
        headers: { Authorization: `Bearer ${authStore.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        meetings = data.meetings || [];
      }
    } catch (err) {
      console.error('Erreur loading meetings:', err);
    }
  }

  async function loadPolls() {
    if (!guildId || !authStore.token) return;
    try {
      const data = await fetchPolls(guildId);
      polls = data.polls || [];
    } catch (err) {
      console.error('Erreur loading polls:', err);
    }
  }

  async function updateAbsence(absenceId: string, status: 'APPROVED' | 'REJECTED') {
    if (!guildId || !authStore.token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/absences/${absenceId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`
        },
        body: JSON.stringify({ status, note: absenceDecisionNote })
      });
      if (!res.ok) throw new Error('Erreur');
      showAbsenceDecision = null;
      absenceDecisionNote = '';
      await loadAbsences();
    } catch (err) {
      alert('Erreur lors de la mise à jour de l\'absence');
    }
  }

  async function createMeeting() {
    if (!guildId || !authStore.token || !newMeetingTitle || !newMeetingScheduledAt) return;
    isSavingMeeting = true;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/meetings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`
        },
        body: JSON.stringify({
          title: newMeetingTitle,
          description: newMeetingDescription,
          scheduledAt: new Date(newMeetingScheduledAt).toISOString()
        })
      });
      if (!res.ok) throw new Error('Erreur');
      showMeetingForm = false;
      newMeetingTitle = '';
      newMeetingDescription = '';
      newMeetingScheduledAt = '';
      await loadMeetings();
    } catch (err) {
      alert('Erreur lors de la création de la réunion');
    } finally {
      isSavingMeeting = false;
    }
  }

  function addPollOptionInput() {
    newPollOptions = [...newPollOptions, ''];
  }

  function removePollOptionInput(index: number) {
    if (newPollOptions.length <= 2) return;
    newPollOptions = newPollOptions.filter((_, i) => i !== index);
  }

  async function createPoll() {
    if (!guildId || !authStore.token || !newPollTitle.trim()) return;
    const filteredOptions = newPollOptions.filter(o => o.trim() !== '');
    if (filteredOptions.length < 2) {
      alert('Il faut au moins 2 options valides');
      return;
    }
    isSavingPoll = true;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/staff/polls`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`
        },
        body: JSON.stringify({
          title: newPollTitle,
          description: newPollDescription,
          options: filteredOptions,
          closesAt: newPollClosesAt || undefined
        })
      });
      if (!res.ok) throw new Error('Erreur creation');
      showPollForm = false;
      newPollTitle = '';
      newPollDescription = '';
      newPollOptions = ['', ''];
      newPollClosesAt = '';
      await loadPolls();
    } catch (err) {
      alert('Erreur lors de la création du sondage');
    } finally {
      isSavingPoll = false;
    }
  }

  async function castVote(pollId: string, optionId: string) {
    if (!guildId || !authStore.token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/staff/polls/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`
        },
        body: JSON.stringify({ pollId, optionId })
      });
      if (!res.ok) throw new Error('Erreur vote');
      await loadPolls();
    } catch (err) {
      alert('Erreur lors du vote');
    }
  }

  async function closePoll(pollId: string) {
    if (!guildId || !authStore.token || !confirm('Voulez-vous clôturer ce sondage prématurément ?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/staff/polls/${pollId}/close`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${authStore.token}` }
      });
      if (!res.ok) throw new Error('Erreur clôture');
      await loadPolls();
    } catch (err) {
      alert('Erreur lors de la clôture');
    }
  }

  async function addStaffMember() {
    if (!guildId || !authStore.token || !newMemberGrade) return;

    if (!newMemberUserId.trim()) {
      alert('Sélectionne un membre Discord ou saisis un ID valide.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/staff/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`
        },
        body: JSON.stringify({
          userId: newMemberUserId.trim(),
          grade: newMemberGrade,
          username: newMemberUsername,
          avatarUrl: newMemberAvatarUrl
        })
      });

      if (!res.ok) throw new Error('Erreur lors de l\'ajout');

      showAddMemberForm = false;
      addMemberLookupQuery = '';
      newMemberUserId = '';
      newMemberGrade = 'HELPER';
      newMemberUsername = '';
      newMemberAvatarUrl = '';
      await loadStaffMembers();
    } catch (err) {
      console.error('Erreur:', err);
      alert('Erreur lors de l\'ajout du membre');
    }
  }

  async function promoteStaff(userId: string) {
    if (!guildId || !authStore.token) return;

    const currentGrade = staffMembers.find(m => m.userId === userId)?.grade;
    const currentIdx = getOrderedStaffRoles().findIndex(r => r.name === currentGrade);
    
    if (currentIdx === -1) {
      alert('Grade introuvable dans la hiérarchie actuelle.');
      return;
    }
    
    if (currentIdx >= getOrderedStaffRoles().length - 1) {
      alert('Grade maximum atteint');
      return;
    }

    const newGrade = getOrderedStaffRoles()[currentIdx + 1].name;

    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/staff/members/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`
        },
        body: JSON.stringify({ grade: newGrade })
      });

      if (!res.ok) throw new Error('Erreur');
      await loadStaffMembers();
    } catch (err) {
      alert('Erreur lors de la promotion');
    }
  }

  async function demoteStaff(userId: string) {
    if (!guildId || !authStore.token) return;

    const currentGrade = staffMembers.find(m => m.userId === userId)?.grade;
    const currentIdx = getOrderedStaffRoles().findIndex(r => r.name === currentGrade);
    
    if (currentIdx === -1) {
      alert('Grade introuvable dans la hiérarchie actuelle.');
      return;
    }
    
    if (currentIdx <= 0) {
      alert('Grade minimum atteint');
      return;
    }

    const newGrade = getOrderedStaffRoles()[currentIdx - 1].name;

    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/staff/members/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`
        },
        body: JSON.stringify({ grade: newGrade })
      });

      if (!res.ok) throw new Error('Erreur');
      await loadStaffMembers();
    } catch (err) {
      alert('Erreur lors de la démotion');
    }
  }

  async function removeStaff(userId: string) {
    if (!guildId || !authStore.token || !confirm('Confirmer le retrait du staff?')) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/staff/members/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`
        },
        body: JSON.stringify({ action: 'remove' })
      });

      if (!res.ok) throw new Error('Erreur');
      await loadStaffMembers();
    } catch (err) {
      alert('Erreur lors du retrait');
    }
  }

  async function createStaffRole() {
    if (!guildId || !authStore.token) return;

    const nextRoleName = roleSearchQuery.trim();
    if (!nextRoleName) return;

    const existingRole = getOrderedStaffRoles().find((role) => normalizeText(role.name) === normalizeText(nextRoleName));
    if (existingRole) {
      roleSearchQuery = existingRole.name;
      selectedDiscordRoleId = existingRole.discordRoleId || '';
      showAddRoleForm = false;
      return;
    }

    const matchedDiscordRole = selectedDiscordRoleId
      ? availableDiscordRoles.find((role) => role.id === selectedDiscordRoleId)
      : findDiscordRoleByQuery(nextRoleName);

    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/staff/roles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`
        },
        body: JSON.stringify({
          name: matchedDiscordRole?.name || nextRoleName,
          level: getOrderedStaffRoles().length,
          discordRoleId: matchedDiscordRole?.id
        })
      });

      if (!res.ok) throw new Error('Erreur');

      showAddRoleForm = false;
      newRoleName = '';
      roleSearchQuery = '';
      selectedDiscordRoleId = '';
      roleSuggestionsOpen = false;
      await loadStaffRoles();
    } catch (err) {
      alert('Erreur lors de la création du rôle');
    }
  }

  async function issueWarning() {
    if (!guildId || !authStore.token || !warnTargetUserId || !warnReason) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/staff/warnings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`
        },
        body: JSON.stringify({
          staffUserId: warnTargetUserId,
          reason: warnReason,
          expiresAt: warnExpiresAt ? new Date(warnExpiresAt).toISOString() : null
        })
      });

      if (!res.ok) throw new Error('Erreur');

      showWarnForm = false;
      warnTargetUserId = '';
      warnReason = '';
      warnExpiresAt = '';
      await loadStaffMembers();
    } catch (err) {
      alert('Erreur lors de l\'avertissement');
    }
  }

  async function blacklistStaff() {
    if (!guildId || !authStore.token || !blacklistTargetUserId || !blacklistReason) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/staff/blacklist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`
        },
        body: JSON.stringify({
          staffUserId: blacklistTargetUserId,
          reason: blacklistReason,
          endDate: blacklistEndDate ? new Date(blacklistEndDate).toISOString() : null
        })
      });

      if (!res.ok) throw new Error('Erreur');

      showBlacklistForm = false;
      blacklistTargetUserId = '';
      blacklistReason = '';
      blacklistEndDate = '';
      await loadStaffMembers();
    } catch (err) {
      alert('Erreur lors de la blacklist');
    }
  }

  const stats = $derived([
    {
      label: "Membres",
      value: staffMembers.length.toString(),
      note: "dans l'équipe",
      icon: "groups",
      color: "bg-primary/10 text-primary",
    },
    {
      label: "Rôles Staff",
      value: staffRoles.length.toString(),
      note: "niveaux configurés",
      icon: "admin_panel_settings",
      color: "bg-emerald-500/10 text-emerald-700",
    },
    {
      label: "Avertissements",
      value: staffMembers.reduce((acc, member) => acc + (member.warnings?.length || 0), 0).toString(),
      note: "actifs actuellement",
      icon: "warning",
      color: "bg-amber-500/10 text-amber-700",
    },
    {
      label: "Périodes de Test",
      value: testingPeriods.length.toString(),
      note: "en cours d'évaluation",
      icon: "pending_actions",
      color: "bg-slate-500/10 text-slate-600",
    },
  ]);
</script>

<div class="space-y-16 animate-in fade-in slide-in-from-bottom-6 duration-1000">
  {#if loading}
    <div class="space-y-8 p-8 md:p-10 animate-pulse w-full">
      <div class="h-14 w-1/3 min-w-[250px] bg-surface-variant/50 rounded-2xl"></div>
      <div class="flex flex-col md:flex-row gap-6">
        <div class="h-32 flex-1 bg-surface-variant/30 rounded-3xl"></div>
        <div class="h-32 flex-1 bg-surface-variant/30 rounded-3xl"></div>
        <div class="h-32 flex-1 bg-surface-variant/30 rounded-3xl"></div>
        <div class="h-32 flex-1 bg-surface-variant/30 rounded-3xl"></div>
      </div>
      <div class="h-[60vh] w-full bg-surface-variant/30 rounded-[3rem]"></div>
    </div>
  {:else if error}
    <div class="mt-6 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-700 text-center max-w-2xl mx-auto">
      {error}
    </div>
  {:else if guildId}
    <div
      class="rounded-[3rem] border border-outline-variant/20 bg-linear-to-br from-surface-container/90 via-surface-container-low/80 to-surface-container/50 p-8 md:p-10 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl"
    >
      <div class="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
        <div class="max-w-3xl space-y-4">
          <div class="inline-flex items-center gap-2 rounded-full border border-outline-variant/20 bg-white/60 px-4 py-2 text-[10px] font-black uppercase tracking-[0.25em] text-on-surface-variant/60">
            <span class="material-symbols-outlined text-base text-primary">manage_accounts</span>
            Administration
          </div>
          <h2 class="text-4xl font-black text-on-surface tracking-tighter font-headline leading-tight md:text-5xl">
            Gestion du Personnel
          </h2>
          <p class="max-w-2xl text-base leading-relaxed text-on-surface-variant/75 md:text-lg">
            Supervisez votre équipe de modération, attribuez des permissions, gérez les périodes de test et consultez l'historique des avertissements.
          </p>
        </div>
      </div>
    </div>

    <!-- STATS -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {#each stats as stat}
        <MetricCard
          label={stat.label}
          value={stat.value}
          note={stat.note}
          icon={stat.icon}
          toneClass={stat.color}
        />
      {/each}
    </div>

    <!-- TABS -->
    <div class="flex flex-wrap items-center gap-3">
      {#each [
        { id: 'members', label: 'Membres', icon: 'groups' },
        { id: 'roles', label: 'Rôles Staff', icon: 'badge' },
        { id: 'testing', label: 'Début Test', icon: 'timelapse' },
        { id: 'warnings', label: 'Avertir', icon: 'warning' },
        { id: 'blacklist', label: 'Blacklist', icon: 'block' },
        { id: 'polls', label: 'Sondages', icon: 'how_to_vote' },
        { id: 'leadership', label: 'Leadership', icon: 'leaderboard' },
        { id: 'absences', label: 'Absences', icon: 'event_busy' },
        { id: 'meetings', label: 'Réunions', icon: 'groups' }
      ] as tab}
        <button
          onclick={() => (activeTab = tab.id as typeof activeTab)}
          class="inline-flex items-center gap-2 rounded-full px-5 py-3 text-xs font-black uppercase tracking-[0.18em] transition-all {activeTab === tab.id
            ? 'bg-primary text-white shadow-xl shadow-primary/20 scale-[1.02]'
            : 'border border-outline-variant/20 bg-surface-container-low/50 text-on-surface-variant/70 hover:bg-surface-container-low hover:text-on-surface'}"
        >
          <span class="material-symbols-outlined text-base shrink-0">{tab.icon}</span>
          {tab.label}
        </button>
      {/each}
    </div>

    <!-- SECTIONS -->
    <div class="premium-card rounded-[3rem] overflow-hidden">
      {#if activeTab === 'members'}
        <div class="p-6 md:p-8 flex items-center justify-between border-b border-outline-variant/10 bg-surface-container-low/30 backdrop-blur-sm">
          <div>
            <h3 class="text-2xl font-black tracking-tighter text-on-surface">Membres du Personnel</h3>
            <p class="text-sm font-medium text-on-surface-variant/60 mt-1">Gérez l'équipe et leurs grades actuels.</p>
          </div>
          <button
            onclick={openAddMemberForm}
            class="inline-flex items-center gap-2 whitespace-nowrap rounded-2xl border border-primary/20 bg-primary/8 px-6 py-3 text-xs font-black uppercase tracking-[0.18em] text-primary transition-colors hover:bg-primary hover:text-white"
          >
            <span class="material-symbols-outlined text-sm">{showAddMemberForm ? 'close' : 'add'}</span>
            {showAddMemberForm ? 'Annuler' : 'Ajouter un membre'}
          </button>
        </div>

        {#if showAddMemberForm}
          <div class="p-6 md:p-8 border-b border-primary/10 bg-primary/5 animate-in slide-in-from-top-4 fade-in duration-300">
            <div class="flex flex-col gap-4 md:flex-row md:items-end">
              <div class="flex-1">
                <label>
                  <span class="block text-xs font-bold uppercase tracking-[0.1em] text-on-surface-variant/70 mb-2">Utilisateur Discord</span>
                  <div class="min-w-0">
                    <DiscordMemberLookup
                      {guildId}
                      bind:query={addMemberLookupQuery}
                      bind:selectedId={newMemberUserId}
                      bind:selectedUsername={newMemberUsername}
                      bind:selectedAvatarUrl={newMemberAvatarUrl}
                      placeholder="@mention, pseudo ou ID Discord"
                      selectedIdPlaceholder="ID Discord (auto-rempli)"
                    />
                  </div>
                </label>
              </div>
              <div class="md:w-64 shrink-0">
                <label>
                  <span class="block text-xs font-bold uppercase tracking-[0.1em] text-on-surface-variant/70 mb-2">Grade</span>
                  <select bind:value={newMemberGrade} class="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10">
                    {#each orderedStaffRoles as role}
                      <option value={role.name}>{role.name}</option>
                    {/each}
                  </select>
                </label>
              </div>
              <button onclick={addStaffMember} class="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-primary px-8 py-3 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
                Ajouter
              </button>
            </div>
          </div>
        {/if}

        {#if staffMembers.length > 0}
          <div class="divide-y divide-outline-variant/10">
            {#each staffMembers as member (member.id)}
              <article class="group bg-transparent px-6 py-6 md:px-8 transition-all hover:bg-primary/4">
                <div class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                  <div class="flex items-center gap-4 flex-1">
                    <div class="h-12 w-12 shrink-0 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant/40 border border-outline-variant/20 shadow-sm overflow-hidden">
                      {#if member.avatarUrl}
                        <img src={member.avatarUrl} alt="" class="h-full w-full object-cover" />
                      {:else}
                        <span class="material-symbols-outlined text-2xl">person</span>
                      {/if}
                    </div>
                    <div>
                      <h4 class="text-lg font-black text-on-surface leading-tight hover:text-primary transition-colors cursor-pointer">
                        <a href="/profile/{member.userId}">{member.displayName || member.username || 'Utilisateur inconnu'}</a>
                      </h4>
                      <div class="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span class="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                          {member.grade}
                        </span>
                        <span class="text-[11px] font-medium text-on-surface-variant/50">
                          Membre depuis {new Date(member.joinedStaffAt).toLocaleDateString()}
                        </span>
                        {#if (member.warnings?.length || 0) > 0}
                          <span class="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.15em] text-amber-700">
                            <span class="material-symbols-outlined text-[12px]">warning</span>
                            {member.warnings.length} avert.{member.warnings.length > 1 ? 's' : ''}
                          </span>
                        {/if}
                      </div>

                      {#if member.stats}
                        <div class="flex items-center gap-3 mt-2 text-xs text-on-surface-variant/60">
                           <div class="flex items-center gap-1">
                             <span class="material-symbols-outlined text-sm">chat</span>
                             <span>{member.stats.totalMessages} msg</span>
                           </div>
                           <div class="flex items-center gap-1">
                             <span class="material-symbols-outlined text-sm">mic</span>
                             <span>{member.stats.totalVoiceMinutes} min</span>
                           </div>
                           <div class="flex items-center gap-1">
                             <span class="material-symbols-outlined text-sm">gavel</span>
                             <span>{member.stats.sanctionsIssued} sanctions</span>
                           </div>
                        </div>
                      {/if}
                    </div>
                  </div>

                  <div class="flex items-center gap-2 shrink-0 flex-wrap">
                    <button
                      onclick={() => promoteStaff(member.userId)}
                      disabled={(() => {
                        const idx = orderedStaffRoles.findIndex((r) => r.name === member.grade);
                        return idx === -1 || idx >= orderedStaffRoles.length - 1;
                      })()}
                      class="inline-flex items-center justify-center rounded-xl p-2.5 transition-colors disabled:opacity-40 {(orderedStaffRoles.findIndex((r) => r.name === member.grade) >= orderedStaffRoles.length - 1) ? 'text-on-surface-variant/30' : 'text-emerald-600 hover:bg-emerald-500/15 border border-emerald-500/20 bg-emerald-500/5'}"
                      title="Promouvoir"
                    >
                      <span class="material-symbols-outlined text-xl">stat_2</span>
                    </button>
                    <button
                      onclick={() => demoteStaff(member.userId)}
                      disabled={(() => {
                        const idx = orderedStaffRoles.findIndex((r) => r.name === member.grade);
                        return idx <= 0;
                      })()}
                      class="inline-flex items-center justify-center rounded-xl p-2.5 transition-colors disabled:opacity-40 {(orderedStaffRoles.findIndex((r) => r.name === member.grade) <= 0) ? 'text-on-surface-variant/30' : 'text-amber-600 hover:bg-amber-500/15 border border-amber-500/20 bg-amber-500/5'}"
                      title="Rétrograder"
                    >
                      <span class="material-symbols-outlined text-xl">stat_minus_2</span>
                    </button>
                    <div class="w-px h-6 bg-outline-variant/20 mx-1"></div>
                    <button
                      onclick={() => removeStaff(member.userId)}
                      class="inline-flex items-center justify-center rounded-xl p-2.5 text-rose-600 transition-colors hover:bg-rose-500/15 border border-rose-500/20 bg-rose-500/5"
                      title="Démettre"
                    >
                      <span class="material-symbols-outlined text-xl">person_remove</span>
                    </button>
                  </div>
                </div>
              </article>
            {/each}
          </div>
        {:else}
          <div class="flex flex-col items-center justify-center p-16 text-center">
            <div class="w-20 h-20 rounded-4xl bg-primary/8 text-primary flex items-center justify-center shadow-inner">
              <span class="material-symbols-outlined text-4xl">groups</span>
            </div>
            <h3 class="mt-6 text-2xl font-black tracking-tighter text-on-surface">
              Aucun membre dans le staff
            </h3>
            <p class="mt-3 max-w-xl text-sm leading-relaxed text-on-surface-variant/65">
              L'équipe staft semble vide. Cliquez sur "Ajouter un membre" pour commencer l'administration.
            </p>
          </div>
        {/if}

      {:else if activeTab === 'roles'}
        <div class="p-6 md:p-8 flex items-center justify-between border-b border-outline-variant/10 bg-surface-container-low/30 backdrop-blur-sm">
          <div>
            <h3 class="text-2xl font-black tracking-tighter text-on-surface">Hiérarchie des Rôles</h3>
            <p class="text-sm font-medium text-on-surface-variant/60 mt-1">Associez un rôle Discord à un grade staff, et réordonnez la hiérarchie.</p>
          </div>
          <button
            onclick={() => showAddRoleForm = !showAddRoleForm}
            class="inline-flex items-center gap-2 whitespace-nowrap rounded-2xl border border-primary/20 bg-primary/8 px-6 py-3 text-xs font-black uppercase tracking-[0.18em] text-primary transition-colors hover:bg-primary hover:text-white"
          >
            <span class="material-symbols-outlined text-sm">{showAddRoleForm ? 'close' : 'add'}</span>
            {showAddRoleForm ? 'Fermer' : 'Nouveau Rôle'}
          </button>
        </div>

        <div class="p-6 md:p-8 border-b border-outline-variant/20 bg-surface-container-lowest/50">
          <div class="flex items-center justify-between mb-4">
            <h4 class="text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant/50">Configuration Globale</h4>
            {#if isSavingConfig}
              <span class="text-[10px] font-bold uppercase text-primary animate-pulse">Sauvegarde...</span>
            {/if}
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label>
                <span class="block text-xs font-bold text-on-surface uppercase tracking-wider mb-2">Rôle Staff de base <span class="text-on-surface-variant/50 normal-case tracking-normal">(Optionnel)</span></span>
                <select bind:value={baseStaffRoleId} onchange={saveStaffConfig} class="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10">
                  <option value={null}>-- Aucun --</option>
                  {#each availableDiscordRoles as dr}
                    <option value={dr.id}>{dr.name}</option>
                  {/each}
                </select>
              </label>
            </div>
            <div>
              <label>
                <span class="block text-xs font-bold text-on-surface uppercase tracking-wider mb-2">Rôle Staff en Test <span class="text-on-surface-variant/50 normal-case tracking-normal">(Optionnel)</span></span>
                <select bind:value={testStaffRoleId} onchange={saveStaffConfig} class="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10">
                  <option value={null}>-- Aucun --</option>
                  {#each availableDiscordRoles as dr}
                    <option value={dr.id}>{dr.name}</option>
                  {/each}
                </select>
              </label>
            </div>
          </div>
        </div>

        {#if showAddRoleForm}
          <div class="p-6 md:p-8 border-b border-primary/10 bg-primary/5 animate-in slide-in-from-top-4 fade-in duration-300">
            <div class="flex flex-col gap-4 md:flex-row md:items-end">
              <div class="flex-1 relative">
                <label class="block text-xs font-bold uppercase tracking-[0.1em] text-on-surface-variant/70 mb-2">Rechercher un rôle Discord</label>
                <div class="relative">
                  <span class="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/40 text-xl">search</span>
                  <input
                    type="text"
                    placeholder="Saisissez un nom de rôle..."
                    value={roleSearchQuery}
                    oninput={(event) => {
                      const value = (event.currentTarget as HTMLInputElement).value;
                      newRoleName = value;
                      handleRoleSearchInput(value);
                    }}
                    onfocus={() => roleSuggestionsOpen = true}
                    onblur={() => setTimeout(() => { roleSuggestionsOpen = false; }, 120)}
                    class="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low pl-12 pr-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
                  />
                </div>
                {#if roleSuggestionsOpen && roleSuggestions.length > 0}
                  <div class="absolute left-0 right-0 top-full mt-2 z-10 rounded-2xl border border-outline-variant/20 bg-surface-container-high p-2 shadow-2xl">
                    {#each roleSuggestions as role (role.id)}
                      <button
                        type="button"
                        class="w-full flex items-center justify-between rounded-xl px-4 py-2 hover:bg-surface-container-low transition-colors text-left"
                        onclick={() => selectRoleSuggestion(role)}
                      >
                        <span class="font-bold text-sm text-on-surface">{role.name}</span>
                        <span class="text-xs text-on-surface-variant/40">@{role.id}</span>
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
              <button onclick={createStaffRole} class="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-primary px-8 py-3 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
                Créer l'association
              </button>
            </div>
          </div>
        {/if}

        {#if isSavingRoleOrder}
          <div class="bg-blue-500/10 border-b border-blue-500/20 px-6 py-2.5 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-blue-700">
             <span class="material-symbols-outlined text-sm animate-spin">refresh</span>
             Sauvegarde de l'ordre...
          </div>
        {/if}

        {#if orderedStaffRoles.length > 0}
          <div class="p-6 md:p-8" role="list" aria-label="Liste des rôles staff">
            <div class="flex flex-col gap-3">
              {#each orderedStaffRoles as role (role.id)}
                <div
                  class="group flex items-center justify-between gap-4 rounded-3xl border border-outline-variant/20 bg-surface-container px-6 py-4 transition-all {roleDropTargetId === role.id ? 'border-primary shadow-lg shadow-primary/10 scale-[1.02] bg-primary/5' : 'hover:border-primary/40 hover:bg-surface-container-high'}"
                  role="listitem"
                  ondragover={(event) => {
                    event.preventDefault();
                    roleDropTargetId = role.id;
                  }}
                  ondrop={(event) => {
                    event.preventDefault();
                    if (draggedRoleId) {
                      moveRoleInList(draggedRoleId, role.id);
                    }
                  }}
                >
                  <div class="flex items-center gap-4 min-w-0">
                    <button
                      type="button"
                      class="flex shrink-0 cursor-grab items-center justify-center rounded-xl p-2.5 text-on-surface-variant/30 hover:bg-primary/10 hover:text-primary active:cursor-grabbing"
                      draggable="true"
                      ondragstart={() => startRoleDrag(role.id)}
                      ondragend={clearRoleDragState}
                      aria-label={`Déplacer ${role.name}`}
                    >
                      <span class="material-symbols-outlined">drag_indicator</span>
                    </button>
                    <div class="min-w-0 flex-1">
                      <h4 class="text-base font-black text-on-surface flex items-center gap-2">
                        {role.name}
                        <span class="inline-flex items-center rounded-full bg-outline-variant/20 px-2 py-0.5 text-[10px] font-bold text-on-surface-variant">
                          Niveau {orderedStaffRoles.indexOf(role) + 1}
                        </span>
                      </h4>
                      <p class="mt-0.5 truncate text-sm font-medium text-on-surface-variant/60">
                        {#if role.discordRoleId}
                          Rôle Discord lié: <span class="font-bold text-on-surface-variant">@{availableDiscordRoles.find((entry) => entry.id === role.discordRoleId)?.name || role.discordRoleId}</span>
                        {:else}
                          Rôle personnalisé (aucune liaison Discord)
                        {/if}
                      </p>
                    </div>
                  </div>
                  
                  <div class="flex items-center shrink-0">
                    <span class="material-symbols-outlined text-on-surface-variant/20 opacity-0 group-hover:opacity-100 transition-opacity">
                      swap_vert
                    </span>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {:else}
          <div class="flex flex-col items-center justify-center p-16 text-center">
            <div class="w-20 h-20 rounded-4xl bg-primary/8 text-primary flex items-center justify-center shadow-inner">
              <span class="material-symbols-outlined text-4xl">badge</span>
            </div>
            <h3 class="mt-6 text-2xl font-black tracking-tighter text-on-surface">
              Aucun rôle staff configuré
            </h3>
            <p class="mt-3 max-w-xl text-sm leading-relaxed text-on-surface-variant/65">
              Associez des rôles Discord à la hiérarchie Staff pour accorder facilement les permissions.
            </p>
          </div>
        {/if}

      {:else if activeTab === 'testing'}
              <div class="space-y-4 p-6 md:p-8">
                <!-- Header with Action -->
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <h2 class="text-3xl font-black text-on-surface tracking-tight">Espace Tutorat</h2>
                    <p class="text-sm font-medium text-on-surface-variant/60">Gérez le suivi et l'évaluation des futurs membres du staff.</p>
                  </div>
                  <button 
                    onclick={() => (showCreateTestDialog = true)}
                    class="flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-xs font-black uppercase tracking-widest text-on-primary shadow-lg shadow-primary/20 transition hover:bg-primary/90 focus:ring-4 focus:ring-primary/20 active:scale-95"
                  >
                    <span class="material-symbols-rounded text-lg">add_circle</span>
                    Lancer un test
                  </button>
                </div>

                <!-- Testing Grid -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {#each testingPeriods.filter(p => p.status === 'ONGOING') as period}
                    {@const activity = period.staffMember?.activities || []}
                    {@const totalMessages = activity.reduce((sum, a) => sum + (a.messageCount || 0), 0)}
                    {@const totalVoice = activity.reduce((sum, a) => sum + (a.voiceMinutes || 0), 0)}
                    {@const startDate = new Date(period.startDate)}
                    {@const daysElapsed = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24))}
                    {@const progress = Math.min(100, Math.max(5, (daysElapsed / (period.plannedDurationDays || 14)) * 100))}
                    {@const pos = period.reports?.filter(r => r.type === 'POSITIVE').length || 0}
                    {@const neg = period.reports?.filter(r => r.type === 'NEGATIVE').length || 0}
                    
                    <div class="group relative flex flex-col rounded-[32px] border border-outline-variant/30 bg-surface-container-low p-6 shadow-sm transition-all hover:shadow-2xl hover:-translate-y-1">
                      <!-- Badge Rank -->
                      <div class="absolute -top-3 -right-2 z-10 px-3 py-1 rounded-full bg-surface-container-highest border border-outline-variant/50 shadow-sm">
                        <span class="text-[9px] font-black uppercase tracking-widest text-primary">
                          {period.staffMember?.grade || 'Staff'}
                        </span>
                      </div>

                      <!-- Profile Header -->
                      <div class="flex items-start gap-4 mb-6">
                        <div class="relative">
                          <img 
                            src={period.staffMember?.avatarUrl || `https://ui-avatars.com/api/?name=${period.staffMember?.username}&background=random`} 
                            alt="" 
                            class="h-16 w-16 rounded-[20px] object-cover ring-4 ring-primary/5"
                          />
                          <div class="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-4 border-surface-container-low bg-green-500 shadow-sm"></div>
                        </div>
                        <div class="flex-1 min-w-0">
                          <h3 class="truncate text-xl font-black text-on-surface leading-tight tracking-tight">
                            {period.staffMember?.displayName || period.staffMember?.username}
                          </h3>
                          <p class="text-[11px] font-bold text-on-surface-variant/60 flex items-center gap-1.5 mt-1">
                            <span class="material-symbols-rounded text-[14px] text-primary">calendar_today</span>
                            Depuis le {new Date(period.startDate).toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                      </div>

                      <!-- Progress Section -->
                      <div class="mb-6 rounded-2xl bg-surface-container/40 p-4 border border-outline-variant/10">
                        <div class="flex justify-between items-end mb-3">
                          <span class="text-[9px] font-black uppercase text-on-surface-variant/50 tracking-widest">Évolution du Test</span>
                          <span class="text-xs font-black text-primary">{daysElapsed} / {period.plannedDurationDays || 14} jours</span>
                        </div>
                        <div class="h-2.5 w-full overflow-hidden rounded-full bg-surface-container-highest/50">
                          <div 
                            class="h-full rounded-full bg-gradient-to-r from-primary/40 to-primary transition-all duration-1000 shadow-[0_0_12px_rgba(var(--color-primary-rgb),0.3)]" 
                            style="width: {progress}%"
                          ></div>
                        </div>
                      </div>

                      <!-- Stats Cards -->
                      <div class="grid grid-cols-2 gap-3 mb-6">
                        <div class="rounded-2xl bg-surface-container p-3 flex flex-col gap-1.5 border border-outline-variant/10">
                          <span class="text-[9px] font-black uppercase text-on-surface-variant/40 tracking-wider">Activité (14j)</span>
                          <div class="flex items-baseline gap-1.5">
                            <span class="text-lg font-black text-on-surface tracking-tighter">{totalMessages}</span>
                            <span class="text-[9px] font-bold text-primary/60 uppercase">msgs</span>
                          </div>
                        </div>
                        <div class="rounded-2xl bg-surface-container p-3 flex flex-col gap-1.5 border border-outline-variant/10">
                          <span class="text-[9px] font-black uppercase text-on-surface-variant/40 tracking-wider">Vocal (14j)</span>
                          <div class="flex items-baseline gap-1.5">
                            <span class="text-lg font-black text-on-surface tracking-tighter">{Math.round(totalVoice / 60)}h</span>
                            <span class="text-[9px] font-bold text-primary/60 uppercase">{totalVoice % 60}m</span>
                          </div>
                        </div>
                      </div>

                      <!-- Reports List -->
                      <div class="mb-6 flex-1">
                        <div class="flex items-center justify-between mb-3">
                          <span class="text-[9px] font-black uppercase text-on-surface-variant/50 tracking-widest">Derniers Rapports</span>
                          <div class="flex gap-1.5">
                            <span class="text-[10px] font-black px-2 py-0.5 rounded-lg bg-green-500/10 text-green-500 border border-green-500/20">{pos}</span>
                            <span class="text-[10px] font-black px-2 py-0.5 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20">{neg}</span>
                          </div>
                        </div>
                        <div class="space-y-2.5">
                          {#if !period.reports || period.reports.length === 0}
                            <div class="py-4 text-center">
                              <span class="text-[10px] font-bold italic text-on-surface-variant/30 uppercase tracking-widest leading-relaxed">Aucun rapport publié</span>
                            </div>
                          {:else}
                            {#each period.reports.slice(0, 2) as report}
                              <div class="p-3 rounded-[18px] bg-surface-container/30 border border-outline-variant/5 relative overflow-hidden group/report">
                                <div class="absolute left-0 top-0 bottom-0 w-1 {report.type === 'POSITIVE' ? 'bg-green-500' : report.type === 'NEGATIVE' ? 'bg-red-500' : 'bg-primary/50'}"></div>
                                <p class="text-[11px] font-medium line-clamp-2 text-on-surface leading-relaxed italic">"{report.content}"</p>
                                <div class="mt-2 text-[9px] font-black uppercase tracking-tight text-on-surface-variant/40">Par {report.author?.displayName || 'Système'}</div>
                              </div>
                            {/each}
                          {/if}
                        </div>
                      </div>

                      <!-- Footer -->
                      <div class="pt-6 border-t border-outline-variant/15 mt-auto">
                        <div class="flex items-center justify-between mb-6">
                          <div class="flex items-center gap-2.5">
                            <img 
                              src={period.mentor?.avatarUrl || `https://ui-avatars.com/api/?name=${period.mentor?.username}&background=random`} 
                              alt="" 
                              class="h-7 w-7 rounded-full ring-2 ring-primary/10"
                            />
                            <div class="min-w-0">
                              <span class="block font-black text-on-surface text-[10px] leading-none truncate">{period.mentor?.displayName || period.mentor?.username || 'Tuteur auto'}</span>
                              <span class="text-[9px] font-bold text-on-surface-variant/50 uppercase tracking-tighter">Tuteur assigné</span>
                            </div>
                          </div>
                          <button 
                            onclick={() => openReportDialog(period)}
                            class="h-9 w-9 flex items-center justify-center rounded-xl bg-primary/10 text-primary transition hover:bg-primary/20 active:scale-90"
                            title="Ajouter un rapport"
                          >
                            <span class="material-symbols-rounded text-lg">add_comment</span>
                          </button>
                        </div>

                        <div class="grid grid-cols-2 gap-3">
                          <button 
                            onclick={() => endTesting(period, 'PASSED')}
                            class="group/btn w-full flex items-center justify-center gap-1.5 rounded-2xl bg-green-500/10 py-3 text-[10px] font-black uppercase tracking-widest text-green-600 transition hover:bg-green-500 hover:text-white"
                          >
                            <span class="material-symbols-rounded text-sm group-hover/btn:rotate-12 transition-transform">verified</span>
                            Valider
                          </button>
                          <button 
                            onclick={() => endTesting(period, 'FAILED')}
                            class="group/btn w-full flex items-center justify-center gap-1.5 rounded-2xl bg-red-500/10 py-3 text-[10px] font-black uppercase tracking-widest text-red-600 transition hover:bg-red-500 hover:text-white"
                          >
                            <span class="material-symbols-rounded text-sm group-hover/btn:-rotate-12 transition-transform">close</span>
                            Échouer
                          </button>
                        </div>
                      </div>
                    </div>
                  {:else}
                    <div class="col-span-full py-20 flex flex-col items-center justify-center rounded-[40px] border-4 border-dashed border-outline-variant/10 bg-surface-container-low/20">
                      <div class="h-24 w-24 rounded-[32px] bg-surface-container-high flex items-center justify-center mb-6 text-on-surface-variant/20 shadow-inner">
                        <span class="material-symbols-rounded text-5xl">person_search</span>
                      </div>
                      <h4 class="text-xl font-black text-on-surface tracking-tight">Aucun test en cours</h4>
                      <p class="text-sm font-medium text-on-surface-variant/50 mt-2">Prêt à évaluer de nouveaux talents ?</p>
                      <button onclick={() => (showCreateTestDialog = true)} class="mt-8 px-8 py-3.5 rounded-2xl bg-primary/10 text-primary text-xs font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all">
                        Démarrer une évaluation
                      </button>
                    </div>
                  {/each}
                </div>

                <!-- History Toggle -->
                {#if testingPeriods.some(p => p.status !== 'ONGOING')}
                  <div class="mt-12">
                    <button 
                      onclick={() => (showHistory = !showHistory)}
                      class="flex items-center gap-3 px-6 py-3 rounded-2xl bg-surface-container/50 border border-outline-variant/10 text-xs font-black uppercase tracking-widest text-on-surface-variant hover:text-primary hover:border-primary/20 transition group"
                    >
                      <span class="material-symbols-rounded transition-transform duration-300 {showHistory ? 'rotate-90' : ''} group-hover:scale-110">chevron_right</span>
                      Historique des Tests ({testingPeriods.filter(p => p.status !== 'ONGOING').length})
                    </button>
                    
                    {#if showHistory}
                      <div class="mt-6 overflow-hidden rounded-[32px] border border-outline-variant/20 bg-surface-container-lowest shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
                        <table class="w-full text-left border-collapse">
                          <thead>
                            <tr class="bg-surface-container text-[10px] font-black uppercase text-on-surface-variant/60 tracking-widest">
                              <th class="px-8 py-5">Membre</th>
                              <th class="px-8 py-5">Période</th>
                              <th class="px-8 py-5">Tuteur</th>
                              <th class="px-8 py-5">Verdict</th>
                              <th class="px-8 py-5 text-right">Détails</th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-outline-variant/5 text-sm">
                            {#each testingPeriods.filter(p => p.status !== 'ONGOING') as period}
                              <tr class="hover:bg-surface-container-low transition-colors">
                                <td class="px-8 py-5">
                                  <div class="flex items-center gap-4">
                                    <img 
                                      src={period.staffMember?.avatarUrl || `https://ui-avatars.com/api/?name=${period.staffMember?.username}&background=random`} 
                                      alt="" 
                                      class="h-10 w-10 rounded-xl bg-surface-container-highest border border-outline-variant/10" 
                                    />
                                    <div>
                                      <span class="block font-black text-on-surface leading-tight tracking-tight">{period.staffMember?.displayName || period.staffMember?.username}</span>
                                      <span class="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-tighter">{period.staffMember?.grade || 'Staff'}</span>
                                    </div>
                                  </div>
                                </td>
                                <td class="px-8 py-5 text-[11px] font-bold text-on-surface-variant/70">
                                  {new Date(period.startDate).toLocaleDateString('fr-FR')} 
                                  <span class="mx-2 text-primary/30">→</span>
                                  {period.endDate ? new Date(period.endDate).toLocaleDateString('fr-FR') : '-'}
                                </td>
                                <td class="px-8 py-5">
                                  <div class="flex items-center gap-2">
                                    <span class="text-xs font-black text-on-surface/80">{period.mentor?.displayName || period.mentor?.username || 'Auto'}</span>
                                  </div>
                                </td>
                                <td class="px-8 py-5">
                                  <span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest {period.status === 'PASSED' ? 'bg-green-500/10 text-green-600 border border-green-500/20' : 'bg-red-500/10 text-red-600 border border-red-500/20'}">
                                    <span class="h-1.5 w-1.5 rounded-full {period.status === 'PASSED' ? 'bg-green-500' : 'bg-red-500'}"></span>
                                    {period.status === 'PASSED' ? 'VALIDÉ' : 'ÉCHOUÉ'}
                                  </span>
                                </td>
                                <td class="px-8 py-5 text-right">
                                  <button class="p-2.5 rounded-xl text-on-surface-variant hover:bg-primary/10 hover:text-primary transition">
                                    <span class="material-symbols-rounded text-xl">description</span>
                                  </button>
                                </td>
                              </tr>
                            {/each}
                          </tbody>
                        </table>
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>


      {:else if activeTab === 'warnings'}
        <div class="p-6 md:p-8 flex items-center justify-between border-b border-outline-variant/10 bg-surface-container-low/30 backdrop-blur-sm">
          <div>
            <h3 class="text-2xl font-black tracking-tighter text-on-surface">Avertissements Internes</h3>
            <p class="text-sm font-medium text-on-surface-variant/60 mt-1">Imposez un avertissement au staff en cas de manquement aux règles.</p>
          </div>
          <button
            onclick={openWarnForm}
            class="inline-flex items-center gap-2 whitespace-nowrap rounded-2xl border border-primary/20 bg-primary/8 px-6 py-3 text-xs font-black uppercase tracking-[0.18em] text-primary transition-colors hover:bg-primary hover:text-white"
          >
            <span class="material-symbols-outlined text-sm">{showWarnForm ? 'close' : 'add'}</span>
            {showWarnForm ? 'Annuler' : 'Nouvel Avertisss.'}
          </button>
        </div>

        {#if showWarnForm}
          <div class="p-6 md:p-8 border-b border-primary/10 bg-primary/5 animate-in slide-in-from-top-4 fade-in duration-300">
            <div class="grid gap-6 md:grid-cols-2">
              <div class="space-y-4 md:col-span-2">
                <label class="block text-xs font-bold uppercase tracking-[0.1em] text-on-surface-variant/70 mb-2">
                  Membre visé
                  <DiscordMemberLookup
                    {guildId}
                    bind:query={warnLookupQuery}
                    bind:selectedId={warnTargetUserId}
                    placeholder="@mention, pseudo ou ID Discord"
                    selectedIdPlaceholder="ID Discord du staff (auto-rempli)"
                  />
                </label>
              </div>

              <div class="space-y-4">
                <label>
                  <span class="block text-xs font-bold uppercase tracking-[0.1em] text-on-surface-variant/70 mb-2">Raison de l'avertissement</span>
                  <textarea
                    bind:value={warnReason}
                    placeholder="Décrivez précisément le manquement constaté..."
                    rows="3"
                    class="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10 resize-none"
                  ></textarea>
                </label>
              </div>

              <div class="space-y-4 flex flex-col justify-between">
                <div>
                   <label class="block text-xs font-bold uppercase tracking-[0.1em] text-on-surface-variant/70 mb-2">Expire le (Optionnel)</label>
                   <input
                     type="datetime-local"
                     bind:value={warnExpiresAt}
                     class="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
                   />
                </div>
                <div class="flex justify-end mt-4">
                  <button onclick={issueWarning} class="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-8 py-3 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.02] hover:bg-amber-600 active:scale-[0.98]">
                    <span class="material-symbols-outlined text-sm">gavel</span>
                    Sanctionner
                  </button>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <div class="p-16 flex flex-col items-center justify-center text-center">
            <div class="w-20 h-20 rounded-4xl bg-amber-500/10 text-amber-500 flex items-center justify-center shadow-inner">
              <span class="material-symbols-outlined text-4xl">warning</span>
            </div>
            <h3 class="mt-6 text-2xl font-black tracking-tighter text-on-surface">
              Aperçu des avertissements
            </h3>
            <p class="mt-3 max-w-xl text-sm leading-relaxed text-on-surface-variant/65">
              Les avertissements sont directement liés aux profils des membres. Vous pouvez les voir en listant les membres.
            </p>
        </div>

      {:else if activeTab === 'blacklist'}
         <div class="p-6 md:p-8 flex items-center justify-between border-b border-outline-variant/10 bg-surface-container-low/30 backdrop-blur-sm">
          <div>
            <h3 class="text-2xl font-black tracking-tighter text-on-surface">Blacklist du Staff</h3>
            <p class="text-sm font-medium text-on-surface-variant/60 mt-1">Stoppez net tout accès d'un utilisateur à l'équipe Staff.</p>
          </div>
          <button
            onclick={openBlacklistForm}
            class="inline-flex items-center gap-2 whitespace-nowrap rounded-2xl border border-rose-500/20 bg-rose-500/10 px-6 py-3 text-xs font-black uppercase tracking-[0.18em] text-rose-700 transition-colors hover:bg-rose-500 hover:text-white"
          >
            <span class="material-symbols-outlined text-sm">{showBlacklistForm ? 'close' : 'block'}</span>
            {showBlacklistForm ? 'Annuler' : 'Blacklister'}
          </button>
        </div>

        {#if showBlacklistForm}
          <div class="p-6 md:p-8 border-b border-rose-500/10 bg-rose-500/5 animate-in slide-in-from-top-4 fade-in duration-300">
            <div class="grid gap-6 md:grid-cols-2">
              <div class="space-y-4 md:col-span-2">
                <label>
                  <span class="block text-xs font-bold uppercase tracking-[0.1em] text-rose-700/80 mb-2">Membre à blacklister</span>
                  <DiscordMemberLookup
                    {guildId}
                    bind:query={blacklistLookupQuery}
                    bind:selectedId={blacklistTargetUserId}
                    placeholder="@mention, pseudo ou ID Discord"
                    selectedIdPlaceholder="ID Discord du staff (auto-rempli)"
                  />
                </label>
              </div>

              <div class="space-y-4">
                <label>
                  <span class="block text-xs font-bold uppercase tracking-[0.1em] text-rose-700/80 mb-2">Raison de l'exclusion</span>
                  <textarea
                    bind:value={blacklistReason}
                    placeholder="Décrivez précisément ce qui a mené à cette blacklist..."
                    rows="3"
                    class="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none transition focus:border-rose-500/40 focus:ring-4 focus:ring-rose-500/10 resize-none"
                  ></textarea>
                </label>
              </div>

              <div class="space-y-4 flex flex-col justify-between">
                <div>
                   <label class="block text-xs font-bold uppercase tracking-[0.1em] text-rose-700/80 mb-2">Fin de blacklist (vide = permanent)</label>
                   <input
                     type="date"
                     bind:value={blacklistEndDate}
                     class="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none transition focus:border-rose-500/40 focus:ring-4 focus:ring-rose-500/10"
                   />
                </div>
                <div class="flex justify-end mt-4">
                  <button onclick={blacklistStaff} class="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-8 py-3 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-rose-500/20 transition-all hover:scale-[1.02] hover:bg-rose-700 active:scale-[0.98]">
                    <span class="material-symbols-outlined text-sm">block</span>
                    Appliquer Blacklist
                  </button>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <div class="p-16 flex flex-col items-center justify-center text-center">
            <div class="w-20 h-20 rounded-4xl bg-rose-500/10 text-rose-500 flex items-center justify-center shadow-inner">
              <span class="material-symbols-outlined text-4xl">remove_moderator</span>
            </div>
            <h3 class="mt-6 text-2xl font-black tracking-tighter text-on-surface">
              Section Blacklist
            </h3>
            <p class="mt-3 max-w-xl text-sm leading-relaxed text-on-surface-variant/65">
               Les membres inscrits ici ne pourront plus jamais intégrer l'équipe de modération du serveur.
            </p>
        </div>


      {:else if activeTab === 'polls'}
        <div class="p-6 md:p-8 flex items-center justify-between border-b border-outline-variant/10 bg-surface-container-low/30 backdrop-blur-sm">
          <div>
            <h3 class="text-2xl font-black tracking-tighter text-on-surface">Sondages & Gouvernance</h3>
            <p class="text-sm font-medium text-on-surface-variant/60 mt-1">Prenez des décisions collectives avec des votes pondérés par grade.</p>
          </div>
          <button
            onclick={() => showPollForm = !showPollForm}
            class="inline-flex items-center gap-2 whitespace-nowrap rounded-2xl border border-primary/20 bg-primary/10 px-6 py-3 text-xs font-black uppercase tracking-[0.18em] text-primary transition-colors hover:bg-primary hover:text-white"
          >
            <span class="material-symbols-outlined text-sm">{showPollForm ? 'close' : 'add'}</span>
            {showPollForm ? 'Annuler' : 'Nouveau Sondage'}
          </button>
        </div>

        {#if showPollForm}
          <div class="p-6 md:p-8 border-b border-primary/10 bg-primary/5 animate-in slide-in-from-top-4 fade-in duration-300">
            <div class="grid gap-6 lg:grid-cols-2">
              <div class="space-y-4">
                <FormInput label="Titre du sondage" bind:value={newPollTitle} placeholder="Ex: Nouveau règlement du salon général" />
                <div>
                  <label for="poll-description" class="block text-xs font-bold uppercase tracking-[0.1em] text-on-surface-variant/70 mb-2">Description</label>
                  <textarea id="poll-description" bind:value={newPollDescription} class="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10 h-32 resize-none" placeholder="Détaillez le sujet du vote..."></textarea>
                </div>
                <div>
                  <label for="poll-closes-at" class="block text-xs font-bold uppercase tracking-[0.1em] text-on-surface-variant/70 mb-2">Date de clôture automatique (optionnelle)</label>
                  <input id="poll-closes-at" type="datetime-local" bind:value={newPollClosesAt} class="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10" />
                </div>
              </div>
              <div class="space-y-4">
                <div class="block text-xs font-bold uppercase tracking-[0.1em] text-on-surface-variant/70 mb-2">Options de réponse</div>
                <div class="space-y-3">
                  {#each newPollOptions as option, i}
                    <div class="flex items-center gap-2">
                      <input bind:value={newPollOptions[i]} class="flex-1 rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10" placeholder="Option {i+1}" />
                      {#if newPollOptions.length > 2}
                        <button onclick={() => removePollOptionInput(i)} class="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-colors">
                          <span class="material-symbols-outlined text-xl">delete</span>
                        </button>
                      {/if}
                    </div>
                  {/each}
                </div>
                <button onclick={addPollOptionInput} class="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary/70 hover:text-primary transition-colors mt-2">
                  <span class="material-symbols-outlined text-lg">add_circle</span>
                  Ajouter une option
                </button>
                <div class="pt-6 border-t border-outline-variant/10">
                   <button onclick={createPoll} disabled={isSavingPoll} class="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-8 py-4 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50">
                    <span class="material-symbols-outlined text-sm">{isSavingPoll ? 'sync' : 'how_to_vote'}</span>
                    Publier le sondage
                  </button>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <div class="p-6 md:p-8 space-y-6">
          {#if polls.length === 0}
            <div class="p-16 flex flex-col items-center justify-center text-center opacity-40">
              <span class="material-symbols-outlined text-6xl">ballot</span>
              <p class="mt-4 text-sm font-bold uppercase tracking-widest">Aucun sondage actif</p>
            </div>
          {:else}
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {#each polls as poll (poll.id)}
                {@const isClosed = poll.closesAt && new Date(poll.closesAt) < new Date()}
                {@const totalWeight = poll.options.reduce((sum, opt) => {
                  const optVotes = poll.votes?.filter(v => v.optionId === opt.id) || [];
                  return sum + optVotes.reduce((s, v) => s + (v.weight || 1), 0);
                }, 0)}
                {@const userVote = poll.votes?.find(v => v.staffUserId === authStore.user?.userId)}
                <div class="bg-surface-container px-6 py-6 rounded-3xl border border-outline-variant/10 group transition-all hover:border-primary/20">
                  <div class="flex items-start justify-between gap-4">
                    <div class="space-y-1">
                      <div class="flex items-center gap-2">
                        {#if isClosed}
                          <span class="inline-flex items-center rounded-full bg-surface-container-high px-2 py-0.5 text-[9px] font-black uppercase text-on-surface-variant/60">Clôturé</span>
                        {:else}
                          <span class="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-600 animate-pulse">En cours</span>
                        {/if}
                        <span class="text-[10px] font-medium text-on-surface-variant/40">Par {poll.author?.displayName || poll.author?.username}</span>
                      </div>
                      <h4 class="text-lg font-black text-on-surface tracking-tight leading-tight">{poll.title}</h4>
                    </div>
                    {#if !isClosed && accessLevel === 'admin'}
                       <button onclick={() => closePoll(poll.id)} class="p-2 text-on-surface-variant/40 hover:text-rose-500 transition-colors" title="Clôturer maintenant">
                         <span class="material-symbols-outlined text-xl">close</span>
                       </button>
                    {/if}
                  </div>
                  
                  {#if poll.description}
                    <p class="mt-3 text-xs text-on-surface-variant/70 leading-relaxed line-clamp-2">{poll.description}</p>
                  {/if}

                  <div class="mt-6 space-y-3">
                    {#each poll.options as option}
                      {@const optVotes = poll.votes?.filter(v => v.optionId === option.id) || []}
                      {@const optWeight = optVotes.reduce((s, v) => s + (v.weight || 1), 0)}
                      {@const percent = totalWeight > 0 ? (optWeight / totalWeight) * 100 : 0}
                      {@const isSelected = userVote?.optionId === option.id}
                      
                      <div class="space-y-1.5">
                        <button 
                          onclick={() => castVote(poll.id, option.id)}
                          disabled={isClosed || !!userVote}
                          class="w-full relative overflow-hidden rounded-xl border p-3 flex items-center justify-between transition-all {isSelected ? 'border-primary bg-primary/5' : 'border-outline-variant/10 bg-surface-container-low hover:border-primary/30'} group/opt"
                        >
                          <span class="relative z-10 text-xs font-black {isSelected ? 'text-primary' : 'text-on-surface-variant group-hover/opt:text-on-surface'}">{option.text}</span>
                          {#if isSelected}
                             <span class="material-symbols-outlined text-sm relative z-10 text-primary">check_circle</span>
                          {/if}
                          {#if isClosed || userVote}
                            <div class="absolute inset-y-0 left-0 bg-primary/10 transition-all duration-1000" style="width: {percent}%"></div>
                          {/if}
                        </button>
                        {#if isClosed || userVote}
                           <div class="flex items-center justify-between px-1">
                             <div class="flex gap-1">
                                {#each optVotes as vote}
                                  <div class="h-1 w-3 rounded-full bg-primary/30" title="Poids: {vote.weight}"></div>
                                {/each}
                             </div>
                             <span class="text-[9px] font-black text-on-surface-variant/50">{Math.round(percent)}% ({optWeight.toFixed(1)})</span>
                           </div>
                        {/if}
                      </div>
                    {/each}
                  </div>

                  <div class="mt-6 pt-4 border-t border-outline-variant/10 flex items-center justify-between">
                    <span class="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest">{totalWeight.toFixed(1)} points de vote</span>
                    {#if poll.closesAt && !isClosed}
                      <span class="text-[10px] font-medium text-amber-600/70 italic flex items-center gap-1">
                        <span class="material-symbols-outlined text-xs">timer</span>
                        Finit le {new Date(poll.closesAt).toLocaleDateString()}
                      </span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {:else if activeTab === 'leadership'}
        <div class="p-6 md:p-8 space-y-8">
          <div>
            <h3 class="text-2xl font-black tracking-tighter text-on-surface">Dashboard Leadership</h3>
            <p class="text-sm font-medium text-on-surface-variant/60 mt-1">Analyse des performances, scores de progression et alertes d'inactivité.</p>
          </div>

          <div class="overflow-x-auto rounded-[2rem] border border-outline-variant/10 bg-surface-container-low/50">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="border-b border-outline-variant/10 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">
                  <th class="px-8 py-5">Membre</th>
                  <th class="px-8 py-5">Score Progression</th>
                  <th class="px-8 py-5">Activité (30j / 7j)</th>
                  <th class="px-8 py-5 text-right">Statut / Alertes</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-outline-variant/5">
                {#each leadershipMetrics as metric}
                  {@const member = staffMembers.find(m => m.userId === metric.staffUserId)}
                  <tr class="group hover:bg-primary/4 transition-colors">
                    <td class="px-8 py-5">
                      <div class="flex items-center gap-3">
                        <div class="h-9 w-9 rounded-full bg-surface-container-high border border-outline-variant/20 flex items-center justify-center text-xs font-black">
                          {member?.username?.substring(0, 1).toUpperCase() || '?'}
                        </div>
                        <div>
                          <div class="text-sm font-black text-on-surface tracking-tight">{member?.displayName || member?.username}</div>
                          <div class="text-[10px] font-bold text-on-surface-variant/50 uppercase">{member?.grade}</div>
                        </div>
                      </div>
                    </td>
                    <td class="px-8 py-5">
                      <div class="flex items-center gap-4">
                        <div class="flex-1 h-2 bg-surface-container-high rounded-full overflow-hidden max-w-[100px]">
                          <div class="h-full bg-primary" style="width: {metric.progressionScore}%"></div>
                        </div>
                        <span class="text-xs font-black text-primary">{metric.progressionScore}/100</span>
                      </div>
                    </td>
                    <td class="px-8 py-5">
                      <div class="flex flex-col gap-1">
                        <div class="text-[11px] font-bold">
                          Avg: <span class="text-on-surface">{metric.avg30d}</span> msg/j
                        </div>
                        <div class="text-[10px] font-medium text-on-surface-variant/60">
                          Semaine: <span class={metric.avg7d < metric.avg30d * 0.5 ? 'text-amber-600 font-bold' : ''}>{metric.avg7d}</span> msg/j
                        </div>
                      </div>
                    </td>
                    <td class="px-8 py-5 text-right">
                       {#if metric.hasInactivityAlert}
                         <span class="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-[10px] font-black text-amber-600 animate-pulse">
                           <span class="material-symbols-outlined text-[14px]">warning</span>
                           INACTIVITÉ DÉTECTÉE
                         </span>
                       {:else}
                         <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-[10px] font-black text-emerald-600">
                           <span class="material-symbols-outlined text-[14px]">check_circle</span>
                           ACTIF
                         </span>
                       {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

      {:else if activeTab === 'absences'}
        <div class="p-6 md:p-8 space-y-8">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-2xl font-black tracking-tighter text-on-surface">Gestion des Absences</h3>
              <p class="text-sm font-medium text-on-surface-variant/60 mt-1">Validez les demandes d'absence et consultez le planning staff.</p>
            </div>
          </div>

          <div class="grid gap-6">
            {#each absences as absence}
              <div class="bg-surface-container px-6 py-6 rounded-3xl border border-outline-variant/10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div class="flex items-center gap-4">
                  <div class="h-12 w-12 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant/40 border border-outline-variant/10">
                    <span class="material-symbols-outlined text-2xl">event_busy</span>
                  </div>
                  <div>
                    <div class="flex items-center gap-2 mb-1">
                      <h4 class="text-base font-black text-on-surface">{absence.staffMember?.displayName || absence.staffUserId}</h4>
                      <span class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-widest">{absence.staffMember?.grade}</span>
                    </div>
                    <p class="text-xs font-bold text-primary">Du {new Date(absence.startDate).toLocaleDateString()} au {new Date(absence.endDate).toLocaleDateString()}</p>
                    <p class="mt-2 text-xs text-on-surface-variant/70 italic">"{absence.reason}"</p>
                  </div>
                </div>

                <div class="flex items-center gap-3">
                  {#if absence.status === 'PENDING'}
                    <div class="flex items-center gap-2">
                      <button onclick={() => updateAbsence(absence.id, 'APPROVED')} class="rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 hover:scale-105 transition-all">Approuver</button>
                      <button onclick={() => { showAbsenceDecision = absence.id; absenceDecisionNote = ''; }} class="rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest bg-rose-500/10 text-rose-600 border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all">Refuser</button>
                    </div>
                  {:else}
                    <span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest {absence.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'}">
                       <span class="material-symbols-outlined text-xs">{absence.status === 'APPROVED' ? 'check_circle' : 'cancel'}</span>
                       {absence.status === 'APPROVED' ? 'Acceptée' : 'Refusée'}
                    </span>
                  {/if}
                </div>
              </div>

              {#if showAbsenceDecision === absence.id}
                <div class="mt-2 p-4 bg-rose-500/5 border border-rose-500/10 rounded-2xl animate-in slide-in-from-top-2 duration-300">
                  <textarea bind:value={absenceDecisionNote} placeholder="Motif du refus..." class="w-full bg-white/50 border border-outline-variant/30 rounded-xl p-3 text-sm outline-none mb-3"></textarea>
                  <div class="flex justify-end gap-2">
                    <button onclick={() => showAbsenceDecision = null} class="px-4 py-2 text-xs font-bold uppercase text-on-surface-variant/60">Annuler</button>
                    <button onclick={() => updateAbsence(absence.id, 'REJECTED')} class="bg-rose-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-rose-500/20">Confirmer Refus</button>
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        </div>

      {:else if activeTab === 'meetings'}
        <div class="p-6 md:p-8 space-y-8">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-2xl font-black tracking-tighter text-on-surface">Registre des Réunions</h3>
              <p class="text-sm font-medium text-on-surface-variant/60 mt-1">Planifiez des réunions et suivez les présences en temps réel.</p>
            </div>
            <button onclick={() => showMeetingForm = !showMeetingForm} class="inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all">
              <span class="material-symbols-outlined text-sm">{showMeetingForm ? 'close' : 'add'}</span>
              Plannifier une réunion
            </button>
          </div>

          {#if showMeetingForm}
             <div class="p-6 md:p-8 bg-primary/5 border border-primary/10 rounded-[2.5rem] animate-in slide-in-from-top-4 duration-300">
                <div class="grid gap-6 md:grid-cols-2">
                   <div class="space-y-4">
                      <FormInput label="Titre de la réunion" bind:value={newMeetingTitle} placeholder="Ex: Débriefing hebdomadaire" />
                      <div>
                         <label for="meeting-description" class="block text-xs font-bold uppercase tracking-[0.1em] text-on-surface-variant/70 mb-2">Description / Ordre du jour</label>
                         <textarea id="meeting-description" bind:value={newMeetingDescription} class="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10 h-24 resize-none" placeholder="Sujets à aborder..."></textarea>
                      </div>
                   </div>
                   <div class="space-y-4 flex flex-col justify-between">
                      <div>
                         <label for="meeting-scheduled-at" class="block text-xs font-bold uppercase tracking-[0.1em] text-on-surface-variant/70 mb-2">Date et Heure</label>
                         <input id="meeting-scheduled-at" type="datetime-local" bind:value={newMeetingScheduledAt} class="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10" />
                      </div>
                      <div class="flex justify-end pt-4">
                         <button onclick={createMeeting} disabled={isSavingMeeting} class="inline-flex items-center gap-2 rounded-2xl bg-primary px-8 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 disabled:opacity-50 transition-all">
                            {isSavingMeeting ? 'Enregistrement...' : 'Enregistrer la réunion'}
                         </button>
                      </div>
                   </div>
                </div>
             </div>
          {/if}

          <div class="grid gap-6 lg:grid-cols-2">
            {#each meetings as meeting}
              <div class="bg-surface-container px-6 py-6 rounded-3xl border border-outline-variant/10 group transition-all hover:border-primary/20">
                <div class="flex items-start justify-between">
                  <div class="space-y-1">
                    <div class="flex items-center gap-2">
                      <span class="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase text-primary tracking-widest">
                         {new Date(meeting.scheduledAt).toLocaleDateString()} à {new Date(meeting.scheduledAt).toLocaleTimeString([], { hour: '2h', minute: '2h' })}
                      </span>
                      <span class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40">{meeting.status}</span>
                    </div>
                    <h4 class="text-xl font-black text-on-surface tracking-tighter">{meeting.title}</h4>
                  </div>
                </div>
                {#if meeting.description}
                  <p class="mt-3 text-xs text-on-surface-variant/70 italic leading-relaxed">{meeting.description}</p>
                {/if}
                
                <div class="mt-6 pt-4 border-t border-outline-variant/5">
                   <div class="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">
                      <span>Présences enregistrées</span>
                      <span class="text-primary">{meeting.presences?.filter(p => p.status === 'PRESENT').length || 0} présents</span>
                   </div>
                   <div class="flex flex-wrap gap-2 mt-3">
                      {#each (meeting.presences || []) as p}
                        <div class="px-2 py-1 rounded-lg border border-outline-variant/10 bg-surface-container-low text-[9px] font-bold" title={p.note || ''}>
                           {p.staffMember?.displayName || p.staffUserId}
                           <span class="ml-1 {p.status === 'PRESENT' ? 'text-emerald-500' : p.status === 'EXCUSED' ? 'text-amber-500' : 'text-rose-500'}">●</span>
                        </div>
                      {/each}
                   </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

    </div>
  {/if}
</div>
