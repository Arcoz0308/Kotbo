<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from 'tinro';
  import { authStore } from '../lib/stores/auth.svelte';
  import { API_BASE_URL, fetchGuildState, fetchPolls, toggleTutorStatus } from '../lib/api';
  import DiscordMemberLookup from '../lib/components/DiscordMemberLookup.svelte';
  import MetricCard from '../lib/components/MetricCard.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';
  import MemberCaseModal from '../lib/components/MemberCaseModal.svelte';
import type { StaffMember, StaffRole, TestingPeriod } from '../lib/types';
import Papicon from '../lib/components/Papicon.svelte';


  let guildId = $state<string | null>(null);
  let accessLevel = $state('none');
  let error = $state('');
  
  type StaffTab = 'members' | 'roles' | 'warnings' | 'blacklist' | 'polls' | 'leadership';
  const staffTabs: StaffTab[] = ['members', 'roles', 'warnings', 'blacklist', 'polls', 'leadership'];

  function isStaffTab(value: string | null | undefined): value is StaffTab {
    return !!value && staffTabs.includes(value as StaffTab);
  }

  function getTabFromSearch(search: string): StaffTab | null {
    const tab = new URLSearchParams(search).get('tab');
    return isStaffTab(tab) ? tab : null;
  }

  let activeTab = $state<StaffTab>('members');
  
  // États de chargement par catégorie
  let loadingStates = $state<Record<string, boolean>>({
    members: true,
    roles: true,
    warnings: false, // Pas de fetch au démarrage (interne)
    blacklist: false, // Pas de fetch au démarrage (interne)
    polls: true,
    leadership: true
  });

  // Synchronisation de l'onglet avec l'URL
  $effect(() => {
    // On observe $router.path pour déclencher l'effet lors des changements de navigation
    const _path = $router.path;
    const tabFromUrl = getTabFromSearch(window.location.search);
    if (tabFromUrl && tabFromUrl !== activeTab) {
      activeTab = tabFromUrl;
    }
  });

  function switchTab(tab: StaffTab) {
    activeTab = tab;
    router.goto(`/staff-management?tab=${tab}`);
    // Si on change d'onglet et qu'il n'est pas encore prêt (par ex: lazy load non fini)
    // on peut forcer le refresh ici si besoin, mais le background load s'en occupe.
  }

  // Data
  let staffMembers = $state<StaffMember[]>([]);
  let staffRoles = $state<StaffRole[]>([]);
  let polls = $state<any[]>([]);
  let leadershipMetrics = $state<any[]>([]);
  let availableDiscordRoles = $state<Array<{ id: string; name: string }>>([]);
  let availableDiscordChannels = $state<Array<{ id: string; name: string }>>([]);
  let availableDiscordVoiceChannels = $state<Array<{ id: string; name: string }>>([]);

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


  // Polls
  let showPollForm = $state(false);
  let newPollTitle = $state('');
  let newPollDescription = $state('');
  let newPollOptions = $state<string[]>(['', '']);
  let newPollClosesAt = $state('');
  let isSavingPoll = $state(false);
  
  let baseStaffRoleId = $state<string | null>(null);
  let testStaffRoleId = $state<string | null>(null);
  let meetingAnnouncementChannelId = $state<string | null>(null);
  let meetingVoiceChannelId = $state<string | null>(null);
  let isSavingConfig = $state(false);
  
  // Member Case Modal State
  let caseModalOpen = $state(false);
  let caseSelectedUserId = $state<string | null>(null);
  let caseSelectedUserName = $state('');
  let caseData = $state<any>(null);
  let caseLoading = $state(false);
  let caseError = $state('');

  async function openMemberCase(userId: string, userName: string) {
    if (!guildId || !authStore.token || !userId) return;
    
    // Si l'ID ressemble à un cuid (commence par 'c'), on ne peut pas l'utiliser pour le member-case Discord
    // Mais ici les userId passés devraient être les IDs Discord (18-19 chiffres)
    caseSelectedUserId = userId;
    caseSelectedUserName = userName;
    caseModalOpen = true;
    caseLoading = true;
    caseError = '';
    caseData = null;

    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/staff/member-case/${userId}`, {
        headers: {
          'Authorization': `Bearer ${authStore.token}`
        }
      });
      if (!res.ok) throw new Error('Impossible de charger le dossier');
      caseData = await res.json();
    } catch (err: any) {
      caseError = err.message;
    } finally {
      caseLoading = false;
    }
  }


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

  // Loadings

  onMount(async () => {
    const initialTab = getTabFromSearch(window.location.search);
    if (initialTab) {
      activeTab = initialTab;
    }

    if (!authStore.token) {
      error = 'Non authentifié';
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
        return;
      }

      const dashboardState = await fetchGuildState(guildId);
      availableDiscordRoles = dashboardState?.discordRoles || [];
      availableDiscordChannels = dashboardState?.discordChannels || [];
      availableDiscordVoiceChannels = dashboardState?.discordVoiceChannels || [];

      // Démarrage du chargement intelligent
      console.log('--- PRIORITIZED LOADING START ---');
      await loadInitialData();
      console.log('--- PRIORITIZED LOADING END ---');
    } catch (err) {
      console.error('Erreur:', err);
      error = 'Erreur lors du chargement';
    }
  });

  async function loadInitialData() {
    // 1. Charger les configs essentielles (non bloquantes pour l'UI, mais nécessaires pour les selects/rôles)
    await Promise.all([loadStaffRoles(), loadStaffConfig()]);

    // 2. Charger l'onglet actif immédiatement
    await loadTabData(activeTab);

    // 3. Charger le reste en tâche de fond (lazy loading)
    const otherTabs: StaffTab[] = ['members', 'roles', 'polls', 'leadership']
       .filter(t => t !== activeTab) as StaffTab[];
    
    // On lance en parallèle sans await pour ne pas bloquer l'interactivité
    otherTabs.forEach(tab => loadTabData(tab));
  }

  async function loadTabData(tab: StaffTab) {
    switch (tab) {
      case 'members': await loadStaffMembers(); break;
      case 'roles': await loadStaffRoles(); break;
      case 'polls': await loadPolls(); break;
      case 'leadership': await loadLeadershipMetrics(); break;
    }
  }

  async function loadStaffMembers() {
    if (!guildId || !authStore.token) return;
    loadingStates.members = true;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/staff/members`, {
        headers: { Authorization: `Bearer ${authStore.token}` }
      });
      if (!res.ok) throw new Error(`Erreur API staff members (${res.status})`);
      const data = await res.json();
      staffMembers = data.members || [];
    } catch (err) {
      console.error('Erreur loading staff members:', err);
    } finally {
      loadingStates.members = false;
    }
  }

  async function loadStaffRoles() {
    if (!guildId || !authStore.token) return;
    loadingStates.roles = true;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/staff/roles`, {
        headers: { Authorization: `Bearer ${authStore.token}` }
      });
      if (!res.ok) throw new Error(`Erreur API staff roles (${res.status})`);
      const data = await res.json();
      staffRoles = data.roles || [];
    } catch (err) {
      console.error('Erreur loading staff roles:', err);
    } finally {
      loadingStates.roles = false;
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
        meetingAnnouncementChannelId = data.config?.meetingAnnouncementChannelId ?? null;
        meetingVoiceChannelId = data.config?.meetingVoiceChannelId ?? null;
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
        body: JSON.stringify({
          baseStaffRoleId,
          testStaffRoleId,
          meetingAnnouncementChannelId,
          meetingVoiceChannelId
        })
      });
      if (!res.ok) throw new Error('Erreur');
    } catch (err) {
      alert('Erreur lors de la sauvegarde de la configuration globale');
    } finally {
      isSavingConfig = false;
    }
  }

  async function loadLeadershipMetrics() {
    if (!guildId || !authStore.token) return;
    loadingStates.leadership = true;
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
    } finally {
      loadingStates.leadership = false;
    }
  }

  async function loadPolls() {
    if (!guildId || !authStore.token) return;
    loadingStates.polls = true;
    try {
      const data = await fetchPolls(guildId);
      polls = data.polls || [];
    } catch (err) {
      console.error('Erreur loading polls:', err);
    } finally {
      loadingStates.polls = false;
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

  async function toggleTutor(userId: string) {
    if (!guildId || !authStore.token) return;
    try {
      const ok = await toggleTutorStatus(userId, guildId);
      if (!ok) throw new Error('Erreur API');
      await loadStaffMembers();
    } catch (err) {
      console.error('Erreur toggle tutor:', err);
      alert('Erreur lors de la modification du statut tuteur');
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
      icon: "users",
      color: "bg-primary/10 text-primary",
      loading: loadingStates.members
    },
    {
      label: "Rôles Staff",
      value: staffRoles.length.toString(),
      note: "niveaux configurés",
      icon: "shield",
      color: "bg-emerald-500/10 text-emerald-700",
      loading: loadingStates.roles
    },
    {
      label: "Avertissements",
      value: staffMembers.reduce((acc, member) => acc + (member.warnings?.length || 0), 0).toString(),
      note: "actifs actuellement",
      icon: "alert-triangle",
      color: "bg-amber-500/10 text-amber-700",
      loading: loadingStates.members // Dépend de staffMembers
    },
    {
      label: "Sondages Actifs",
      value: polls.filter(p => !p.closesAt || new Date(p.closesAt) > new Date()).length.toString(),
      note: "en cours",
      icon: "bar-chart-2",
      color: "bg-slate-500/10 text-slate-600",
      loading: loadingStates.polls
    },
  ]);
</script>

<div class="space-y-16 animate-in fade-in slide-in-from-bottom-6 duration-1000">
  {#if !guildId && !error}
    <div class="space-y-8 p-8 md:p-10 w-full animate-in fade-in duration-700">
      <Skeleton width="w-1/3" height="h-14" rounded="rounded-2xl" />
      <div class="flex flex-col md:flex-row gap-6">
        <Skeleton height="h-32" class="flex-1" rounded="rounded-3xl" />
        <Skeleton height="h-32" class="flex-1" rounded="rounded-3xl" />
        <Skeleton height="h-32" class="flex-1" rounded="rounded-3xl" />
        <Skeleton height="h-32" class="flex-1" rounded="rounded-3xl" />
      </div>
      <Skeleton height="h-[60vh]" rounded="rounded-[3rem]" />
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
            <Papicon icon="user" size={14} class="text-primary" />
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
          loading={stat.loading}
        />
      {/each}
    </div>

    <!-- TABS -->
    <div class="flex flex-wrap items-center gap-3">
      {#each [
        { id: 'members', label: 'Membres', icon: 'users' },
        { id: 'roles', label: 'Rôles Staff', icon: 'shield' },
        { id: 'warnings', label: 'Avertir', icon: 'alert-triangle' },
        { id: 'blacklist', label: 'Blacklist', icon: 'slash' },
        { id: 'polls', label: 'Sondages', icon: 'check-square' },
        { id: 'leadership', label: 'Leadership', icon: 'bar-chart' }
      ] as tab}
        <button
          onclick={() => switchTab(tab.id as StaffTab)}
          class="inline-flex items-center gap-2 rounded-full px-5 py-3 text-xs font-black uppercase tracking-[0.18em] transition-all {activeTab === tab.id
            ? 'bg-primary text-white shadow-xl shadow-primary/20 scale-[1.02]'
            : 'border border-outline-variant/20 bg-surface-container-low/50 text-on-surface-variant/70 hover:bg-surface-container-low hover:text-on-surface'}"
        >
        <Papicon icon={tab.icon} size={16} class="shrink-0" />
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
            <Papicon icon={showAddMemberForm ? 'x' : 'plus'} size={14} />
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

        {#if loadingStates.members}
          <div class="divide-y divide-outline-variant/10">
            {#each Array(5) as _}
              <div class="px-8 py-6 flex flex-col gap-6 lg:flex-row lg:items-center">
                <div class="flex items-center gap-4 flex-1">
                  <Skeleton width="w-12" height="h-12" circle={true} />
                  <div class="space-y-2 flex-1">
                    <Skeleton width="w-1/4" height="h-5" />
                    <div class="flex gap-2">
                       <Skeleton width="w-16" height="h-4" rounded="rounded-full" />
                       <Skeleton width="w-24" height="h-4" rounded="rounded-full" />
                    </div>
                  </div>
                </div>
                <div class="flex gap-2">
                  <Skeleton width="w-10" height="h-10" rounded="rounded-xl" />
                  <Skeleton width="w-10" height="h-10" rounded="rounded-xl" />
                  <Skeleton width="w-10" height="h-10" rounded="rounded-xl" />
                </div>
              </div>
            {/each}
          </div>
        {:else if staffMembers.length > 0}
          <div class="divide-y divide-outline-variant/10">
            {#each staffMembers as member (member.id)}
              <article class="group bg-transparent px-6 py-6 md:px-8 transition-all hover:bg-primary/4">
                <div class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                  <div class="flex items-center gap-4 flex-1">
                    <div class="h-12 w-12 shrink-0 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant/70 border border-outline-variant/20 shadow-sm overflow-hidden">
                      {#if member.avatarUrl}
                        <img src={member.avatarUrl} alt="" class="h-full w-full object-cover" />
                      {:else}
                        <Papicon icon="user" size={24} />
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
                        {#if member.isTutor}
                          <span class="inline-flex items-center gap-1 item rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.15em] text-indigo-600 shadow-sm shadow-indigo-500/5 transition-all animate-in zoom-in-95 duration-300">
                            <Papicon icon="shield" size={12} />
                            Tuteur
                          </span>
                        {/if}
                        <span class="text-[11px] font-medium text-on-surface-variant/70">
                          Membre depuis {new Date(member.joinedStaffAt).toLocaleDateString()}
                        </span>
                        {#if (member.warnings?.length || 0) > 0}
                          <span class="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.15em] text-amber-700">
                            <Papicon icon="alert-triangle" size={12} />
                            {member.warnings.length} avert.{member.warnings.length > 1 ? 's' : ''}
                          </span>
                        {/if}
                      </div>

                      {#if member.stats}
                        <div class="flex items-center gap-3 mt-2 text-xs text-on-surface-variant/60">
                           <div class="flex items-center gap-1">
                             <Papicon icon="message-square" size={14} />
                             <span>{member.stats.totalMessages} msg</span>
                           </div>
                           <div class="flex items-center gap-1">
                             <Papicon icon="mic" size={14} />
                             <span>{member.stats.totalVoiceMinutes} min</span>
                           </div>
                           <div class="flex items-center gap-1">
                             <Papicon icon="gavel" size={14} />
                             <span>{member.stats.sanctionsIssued} sanctions</span>
                           </div>
                        </div>
                      {/if}
                    </div>
                  </div>

                  <div class="flex items-center gap-2 shrink-0 flex-wrap">
                    <button
                      onclick={() => toggleTutor(member.userId)}
                      class="group/tutor relative inline-flex items-center justify-center rounded-xl p-2.5 transition-all {member.isTutor ? 'text-indigo-600 bg-indigo-500/15 border border-indigo-500/30 shadow-lg shadow-indigo-500/10 ring-2 ring-indigo-500/20' : 'text-on-surface-variant/40 hover:text-indigo-600 hover:bg-indigo-500/10 border border-outline-variant/20 bg-surface-container-low/50 hover:border-indigo-500/30'}"
                      title={member.isTutor ? 'Retirer le statut de tuteur' : 'Désigner comme Tuteur'}
                    >
                      <Papicon 
                        icon={member.isTutor ? 'user-check' : 'user-plus'} 
                        size={20} 
                        class="transition-transform group-hover/tutor:scale-110 group-active/tutor:scale-90" 
                      />
                      {#if member.isTutor}
                         <span class="absolute -top-1 -right-1 flex h-3 w-3">
                           <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                           <span class="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                         </span>
                      {/if}
                    </button>
                    <div class="w-px h-6 bg-outline-variant/10 mx-1"></div>
                    <button
                      onclick={() => promoteStaff(member.userId)}
                      disabled={(() => {
                        const idx = orderedStaffRoles.findIndex((r) => r.name === member.grade);
                        return idx === -1 || idx >= orderedStaffRoles.length - 1;
                      })()}
                      class="inline-flex items-center justify-center rounded-xl p-2.5 transition-colors disabled:opacity-40 {(orderedStaffRoles.findIndex((r) => r.name === member.grade) >= orderedStaffRoles.length - 1) ? 'text-on-surface-variant/30' : 'text-emerald-600 hover:bg-emerald-500/15 border border-emerald-500/20 bg-emerald-500/5'}"
                      title="Promouvoir"
                    >
                      <Papicon icon="chevrons-up" size={20} />
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
                      <Papicon icon="chevrons-down" size={20} />
                    </button>
                    <div class="w-px h-6 bg-outline-variant/20 mx-1"></div>
                    <button
                      onclick={() => removeStaff(member.userId)}
                      class="inline-flex items-center justify-center rounded-xl p-2.5 text-rose-600 transition-colors hover:bg-rose-500/15 border border-rose-500/20 bg-rose-500/5"
                      title="Démettre"
                    >
                      <Papicon icon="user-minus" size={20} />
                    </button>
                  </div>
                </div>
              </article>
            {/each}
          </div>
        {:else}
          <div class="flex flex-col items-center justify-center p-16 text-center">
            <div class="w-20 h-20 rounded-4xl bg-primary/8 text-primary flex items-center justify-center shadow-inner">
              <Papicon icon="users" size={40} />
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
            <p class="text-sm font-medium text-on-surface-variant/75 mt-1">Associez un rôle Discord à un grade staff, et réordonnez la hiérarchie.</p>
          </div>
          <button
            onclick={() => showAddRoleForm = !showAddRoleForm}
            class="inline-flex items-center gap-2 whitespace-nowrap rounded-2xl border border-primary/20 bg-primary/8 px-6 py-3 text-xs font-black uppercase tracking-[0.18em] text-primary transition-colors hover:bg-primary hover:text-white"
          >
            <Papicon icon={showAddRoleForm ? 'x' : 'plus'} size={14} />
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
            <div>
              <label>
                <span class="block text-xs font-bold text-on-surface uppercase tracking-wider mb-2">Salon d'annonce des réunions <span class="text-on-surface-variant/50 normal-case tracking-normal">(Texte)</span></span>
                <select bind:value={meetingAnnouncementChannelId} onchange={saveStaffConfig} class="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10">
                  <option value={null}>-- Aucun --</option>
                  {#each availableDiscordChannels as dc}
                    <option value={dc.id}>#{dc.name}</option>
                  {/each}
                </select>
              </label>
            </div>
            <div>
              <label>
                <span class="block text-xs font-bold text-on-surface uppercase tracking-wider mb-2">Salon vocal / conférence des réunions</span>
                <select bind:value={meetingVoiceChannelId} onchange={saveStaffConfig} class="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10">
                  <option value={null}>-- Aucun --</option>
                  {#each availableDiscordVoiceChannels as vc}
                    <option value={vc.id}>{vc.name}</option>
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
                <label for="staff-role-search" class="block text-xs font-bold uppercase tracking-[0.1em] text-on-surface-variant/70 mb-2">Rechercher un rôle Discord</label>
                <div class="relative">
                  <Papicon icon="search" size={20} class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/40" />
                  <input
                    id="staff-role-search"
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
                        <span class="text-xs text-on-surface-variant/70">@{role.id}</span>
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
             <Papicon icon="refresh-cw" size={14} class="animate-spin" />
             Sauvegarde de l'ordre...
          </div>
        {/if}

        {#if loadingStates.roles}
          <div class="p-6 md:p-8 space-y-3">
            {#each Array(4) as _}
              <div class="flex items-center justify-between gap-4 rounded-3xl border border-outline-variant/10 bg-surface-container px-6 py-4">
                <div class="flex items-center gap-3">
                  <Skeleton width="w-8" height="h-8" rounded="rounded-lg" />
                  <Skeleton width="w-32" height="h-5" />
                </div>
                <Skeleton width="w-24" height="h-4" rounded="rounded-full" />
              </div>
            {/each}
          </div>
        {:else if orderedStaffRoles.length > 0}
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
                      class="flex shrink-0 cursor-grab items-center justify-center rounded-xl p-2.5 text-on-surface-variant/70 hover:bg-primary/10 hover:text-primary active:cursor-grabbing"
                      draggable="true"
                      ondragstart={() => startRoleDrag(role.id)}
                      ondragend={clearRoleDragState}
                      aria-label={`Déplacer ${role.name}`}
                    >
                      <Papicon icon="menu" size={20} />
                    </button>
                    <div class="min-w-0 flex-1">
                      <h4 class="text-base font-black text-on-surface flex items-center gap-2">
                        {role.name}
                        <span class="inline-flex items-center rounded-full bg-outline-variant/20 px-2 py-0.5 text-[10px] font-bold text-on-surface-variant">
                          Niveau {orderedStaffRoles.indexOf(role) + 1}
                        </span>
                      </h4>
                      <p class="mt-0.5 truncate text-sm font-medium text-on-surface-variant/75">
                        {#if role.discordRoleId}
                          Rôle Discord lié: <span class="font-bold text-on-surface-variant">@{availableDiscordRoles.find((entry) => entry.id === role.discordRoleId)?.name || role.discordRoleId}</span>
                        {:else}
                          Rôle personnalisé (aucune liaison Discord)
                        {/if}
                      </p>
                    </div>
                  </div>
                  
                  <div class="flex items-center shrink-0">
                    <Papicon icon="repeat" size={20} class="text-on-surface-variant/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {:else}
          <div class="flex flex-col items-center justify-center p-16 text-center">
            <div class="w-20 h-20 rounded-4xl bg-primary/8 text-primary flex items-center justify-center shadow-inner">
              <Papicon icon="shield" size={40} />
            </div>
            <h3 class="mt-6 text-2xl font-black tracking-tighter text-on-surface">
              Aucun rôle staff configuré
            </h3>
            <p class="mt-3 max-w-xl text-sm leading-relaxed text-on-surface-variant/65">
              Associez des rôles Discord à la hiérarchie Staff pour accorder facilement les permissions.
            </p>
          </div>
        {/if}


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
            <Papicon icon={showWarnForm ? 'x' : 'plus'} size={14} />
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
                   <label for="warn-expires-at" class="block text-xs font-bold uppercase tracking-[0.1em] text-on-surface-variant/70 mb-2">Expire le (Optionnel)</label>
                   <input
                     id="warn-expires-at"
                     type="datetime-local"
                     bind:value={warnExpiresAt}
                     class="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
                   />
                </div>
                <div class="flex justify-end mt-4">
                  <button onclick={issueWarning} class="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-8 py-3 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.02] hover:bg-amber-600 active:scale-[0.98]">
                    <Papicon icon="gavel" size={14} />
                    Sanctionner
                  </button>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <div class="p-16 flex flex-col items-center justify-center text-center">
            <div class="w-20 h-20 rounded-4xl bg-amber-500/10 text-amber-500 flex items-center justify-center shadow-inner">
              <Papicon icon="alert-triangle" size={40} />
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
            <Papicon icon={showBlacklistForm ? 'x' : 'slash'} size={14} />
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
                   <label for="blacklist-end-date" class="block text-xs font-bold uppercase tracking-[0.1em] text-rose-700/80 mb-2">Fin de blacklist (vide = permanent)</label>
                   <input
                     id="blacklist-end-date"
                     type="date"
                     bind:value={blacklistEndDate}
                     class="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none transition focus:border-rose-500/40 focus:ring-4 focus:ring-rose-500/10"
                   />
                </div>
                <div class="flex justify-end mt-4">
                  <button onclick={blacklistStaff} class="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-8 py-3 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-rose-500/20 transition-all hover:scale-[1.02] hover:bg-rose-700 active:scale-[0.98]">
                    <Papicon icon="slash" size={14} />
                    Appliquer Blacklist
                  </button>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <div class="p-16 flex flex-col items-center justify-center text-center">
            <div class="w-20 h-20 rounded-4xl bg-rose-500/10 text-rose-500 flex items-center justify-center shadow-inner">
              <Papicon icon="user-x" size={40} />
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
            <Papicon icon={showPollForm ? 'x' : 'plus'} size={14} />
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
                          <Papicon icon="trash-2" size={20} />
                        </button>
                      {/if}
                    </div>
                  {/each}
                </div>
                <button onclick={addPollOptionInput} class="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary/70 hover:text-primary transition-colors mt-2">
                  <Papicon icon="plus-circle" size={18} />
                  Ajouter une option
                </button>
                <div class="pt-6 border-t border-outline-variant/10">
                   <button onclick={createPoll} disabled={isSavingPoll} class="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-8 py-4 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50">
                    <Papicon icon={isSavingPoll ? 'refresh-cw' : 'check-square'} size={14} class={isSavingPoll ? 'animate-spin' : ''} />
                    Publier le sondage
                  </button>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <div class="p-6 md:p-8 space-y-6">
          {#if loadingStates.polls}
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {#each Array(4) as _}
                <div class="bg-surface-container px-6 py-6 rounded-3xl border border-outline-variant/10">
                   <div class="flex justify-between items-start mb-6">
                      <div class="space-y-2">
                        <Skeleton width="w-24" height="h-4" rounded="rounded-full" />
                        <Skeleton width="w-48" height="h-6" />
                      </div>
                      <Skeleton width="w-8" height="h-8" rounded="rounded-lg" />
                   </div>
                   <div class="space-y-3 mb-6">
                      <Skeleton height="h-10" rounded="rounded-xl" />
                      <Skeleton height="h-10" rounded="rounded-xl" />
                   </div>
                   <div class="pt-4 border-t border-outline-variant/10 flex justify-between">
                      <Skeleton width="w-32" height="h-3" />
                      <Skeleton width="w-24" height="h-3" />
                   </div>
                </div>
              {/each}
            </div>
          {:else if polls.length === 0}
            <div class="p-16 flex flex-col items-center justify-center text-center opacity-40">
              <Papicon icon="list" size={60} />
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
                {@const userVote = poll.votes?.find(v => v.staffUserId === authStore.user?.id)}
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
                         <Papicon icon="x" size={20} />
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
                             <Papicon icon="check-circle" size={14} class="relative z-10 text-primary" />
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
                        <Papicon icon="clock" size={12} />
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
                {#if loadingStates.leadership}
                  {#each Array(5) as _}
                    <tr>
                      <td class="px-8 py-5">
                        <div class="flex items-center gap-3">
                          <Skeleton width="w-9" height="h-9" circle={true} />
                          <div class="space-y-1">
                            <Skeleton width="w-24" height="h-4" />
                            <Skeleton width="w-16" height="h-3" />
                          </div>
                        </div>
                      </td>
                      <td class="px-8 py-5"><Skeleton width="w-32" height="h-4" /></td>
                      <td class="px-8 py-5"><Skeleton width="w-24" height="h-10" /></td>
                      <td class="px-8 py-5 text-right"><Skeleton width="w-20" height="h-5" rounded="rounded-full" class="ml-auto" /></td>
                    </tr>
                  {/each}
                {:else}
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
                           <Papicon icon="alert-triangle" size={14} />
                           INACTIVITÉ DÉTECTÉE
                         </span>
                       {:else}
                         <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-[10px] font-black text-emerald-600">
                           <Papicon icon="check-circle" size={14} />
                           ACTIF
                         </span>
                       {/if}
                    </td>
                  </tr>
                {/each}
                {/if}
              </tbody>
            </table>
          </div>
        </div>

      {/if}

    </div>
  {/if}
</div>

<MemberCaseModal
  open={caseModalOpen}
  userId={caseSelectedUserId}
  userName={caseSelectedUserName}
  caseData={caseData}
  loading={caseLoading}
  error={caseError}
  onClose={() => caseModalOpen = false}
/>

