<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { API_BASE_URL, fetchGuildState } from '../lib/api';
  import DiscordMemberLookup from '../lib/components/DiscordMemberLookup.svelte';
  import MetricCard from '../lib/components/MetricCard.svelte';
  import FormInput from '../lib/components/FormInput.svelte';

  let guildId = $state<string | null>(null);
  let accessLevel = $state('none');
  let loading = $state(true);
  let error = $state('');

  // Onglets
  let activeTab = $state<'members' | 'roles' | 'testing' | 'warnings' | 'blacklist'>('members');

  // Data
  let staffMembers = $state<any[]>([]);
  let staffRoles = $state<any[]>([]);
  let testingPeriods = $state<any[]>([]);
  let availableDiscordRoles = $state<Array<{ id: string; name: string }>>([]);

  // Forms
  let showAddMemberForm = $state(false);
  let addMemberLookupQuery = $state('');
  let newMemberUserId = $state('');
  let newMemberGrade = $state('');
  let newMemberUsername = $state('');

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

  // Testing Periods
  let showTestingForm = $state(false);
  let testSubjectUserId = $state('');
  let testMentorUserId = $state('');
  
  let showReportFormId = $state<string | null>(null);
  let reportType = $state<'POSITIVE'|'NEGATIVE'|'NEUTRAL'>('NEUTRAL');
  let reportContent = $state('');

  let showEndTestFormId = $state<string | null>(null);
  let endTestStatus = $state<'PASSED'|'FAILED'>('PASSED');
  let endTestNotes = $state('');
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
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/testing-periods`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`
        },
        body: JSON.stringify({
          staffUserId: testSubjectUserId,
          mentorId: testMentorUserId || undefined
        })
      });
      if (!res.ok) throw new Error('Erreur création testing period');
      
      openTestingForm();
      await loadTestingPeriods();
    } catch (err) {
      alert('Erreur lors de la création de la période de test');
    }
  }

  async function addMentorReport(periodId: string) {
    if (!guildId || !authStore.token || !reportContent.trim()) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/mentor-reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`
        },
        body: JSON.stringify({
          testingPeriodId: periodId,
          type: reportType,
          content: reportContent
        })
      });
      if (!res.ok) throw new Error('Erreur ajout rapport tuteur');
      
      showReportFormId = null;
      reportContent = '';
      reportType = 'NEUTRAL';
      await loadTestingPeriods();
    } catch (err) {
      alert('Erreur lors de l\'ajout du rapport');
    }
  }

  async function endTestingPeriod(periodId: string) {
    if (!guildId || !authStore.token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/testing-periods/${periodId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`
        },
        body: JSON.stringify({
          status: endTestStatus,
          notes: endTestNotes
        })
      });
      if (!res.ok) throw new Error('Erreur fin testing period');
      
      showEndTestFormId = null;
      endTestNotes = '';
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
          username: newMemberUsername
        })
      });

      if (!res.ok) throw new Error('Erreur lors de l\'ajout');

      showAddMemberForm = false;
      addMemberLookupQuery = '';
      newMemberUserId = '';
      newMemberGrade = 'HELPER';
      newMemberUsername = '';
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
    <div class="flex flex-col items-center justify-center p-24 text-on-surface-variant/25">
      <span class="material-symbols-outlined text-7xl animate-spin">sync</span>
      <p class="mt-6 text-sm font-semibold uppercase tracking-[0.2em]">Chargement des données...</p>
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
        { id: 'blacklist', label: 'Blacklist', icon: 'block' }
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
                <label class="block text-xs font-bold uppercase tracking-[0.1em] text-on-surface-variant/70 mb-2">Utilisateur Discord</label>
                <div class="min-w-0">
                  <DiscordMemberLookup
                    {guildId}
                    bind:query={addMemberLookupQuery}
                    bind:selectedId={newMemberUserId}
                    bind:selectedUsername={newMemberUsername}
                    placeholder="@mention, pseudo ou ID Discord"
                    selectedIdPlaceholder="ID Discord (auto-rempli)"
                  />
                </div>
              </div>
              <div class="md:w-64 shrink-0">
                <label class="block text-xs font-bold uppercase tracking-[0.1em] text-on-surface-variant/70 mb-2">Grade</label>
                <select bind:value={newMemberGrade} class="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10">
                  {#each orderedStaffRoles as role}
                    <option value={role.name}>{role.name}</option>
                  {/each}
                </select>
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
                       <span class="material-symbols-outlined text-2xl">person</span>
                    </div>
                    <div>
                      <h4 class="text-lg font-black text-on-surface leading-tight">
                        {member.displayName || member.username || 'Utilisateur inconnu'}
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
              <label class="block text-xs font-bold text-on-surface uppercase tracking-wider mb-2">Rôle Staff de base <span class="text-on-surface-variant/50 normal-case tracking-normal">(Optionnel)</span></label>
              <select bind:value={baseStaffRoleId} onchange={saveStaffConfig} class="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10">
                <option value={null}>-- Aucun --</option>
                {#each availableDiscordRoles as dr}
                  <option value={dr.id}>{dr.name}</option>
                {/each}
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-on-surface uppercase tracking-wider mb-2">Rôle Staff en Test <span class="text-on-surface-variant/50 normal-case tracking-normal">(Optionnel)</span></label>
              <select bind:value={testStaffRoleId} onchange={saveStaffConfig} class="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10">
                <option value={null}>-- Aucun --</option>
                {#each availableDiscordRoles as dr}
                  <option value={dr.id}>{dr.name}</option>
                {/each}
              </select>
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
        <div class="p-6 md:p-8 flex items-center justify-between border-b border-outline-variant/10 bg-surface-container-low/30 backdrop-blur-sm">
          <div>
            <h3 class="text-2xl font-black tracking-tighter text-on-surface">Système de Tutorat</h3>
            <p class="text-sm font-medium text-on-surface-variant/60 mt-1">Accompagnement et évaluation des nouveaux Helpers.</p>
          </div>
          <button
            onclick={openTestingForm}
            class="inline-flex items-center gap-2 whitespace-nowrap rounded-2xl border border-primary/20 bg-primary/8 px-6 py-3 text-xs font-black uppercase tracking-widest text-primary transition-colors hover:bg-primary hover:text-white"
          >
            <span class="material-symbols-outlined text-sm">{showTestingForm ? 'close' : 'person_add'}</span>
            {showTestingForm ? 'Annuler' : 'Placer sous tutelle'}
          </button>
        </div>

        {#if showTestingForm}
          <div class="p-6 md:p-8 border-b border-primary/10 bg-primary/5 animate-in slide-in-from-top-4 fade-in duration-300">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div class="md:col-span-1">
                 <label class="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant/70 mb-2">Candidat (Helper uniquement)</label>
                 <select bind:value={testSubjectUserId} class="w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10">
                   <option value="" disabled selected>-- Choisir un Helper --</option>
                   {#each staffMembers.filter(m => m.grade.toUpperCase() === 'HELPER' || m.grade.toUpperCase() === 'STAFF EN TEST') as member}
                     <option value={member.id}>{member.displayName || member.username} (@{member.userId})</option>
                   {/each}
                 </select>
              </div>
              <div class="md:col-span-1">
                 <label class="block text-[10px] font-black uppercase tracking-widest text-on-surface-variant/70 mb-2">Tuteur assigné</label>
                 <select bind:value={testMentorUserId} class="w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10">
                   <option value="">-- Aucun (Auto-gestion) --</option>
                   {#each staffMembers as member}
                     <option value={member.id}>{member.displayName || member.username}</option>
                   {/each}
                 </select>
              </div>
              <button onclick={createTestingPeriod} class="h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-8 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
                Confirmer l'accompagnement
              </button>
            </div>
          </div>
        {/if}

        {#if testingPeriods.length > 0}
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 md:p-8">
            {#each testingPeriods as period}
              <div class="flex flex-col rounded-3xl border border-outline-variant/15 bg-surface-container-low shadow-sm transition-all hover:shadow-md">
                 <!-- Header Card -->
                 <div class="p-6 border-b border-outline-variant/5 flex items-center justify-between">
                    <div class="flex items-center gap-4 min-w-0">
                       <div class="w-12 h-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary shrink-0 border border-primary/10">
                          <span class="material-symbols-outlined text-2xl">school</span>
                       </div>
                       <div class="min-w-0">
                         <h4 class="font-black text-on-surface text-lg truncate tracking-tight">
                           {period.staffMember?.displayName || period.staffMember?.username || 'Inconnu'}
                         </h4>
                         <div class="flex items-center gap-2 mt-0.5">
                            <span class="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest">
                               Depuis {new Date(period.startDate).toLocaleDateString()}
                            </span>
                         </div>
                       </div>
                    </div>
                    <div>
                      {#if period.status === 'ONGOING'}
                         <span class="px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-600 text-[10px] font-black uppercase tracking-widest border border-blue-500/20">
                           Sous Tutelle
                         </span>
                      {:else if period.status === 'PASSED'}
                         <span class="px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px] font-black uppercase tracking-widest border border-emerald-500/20">
                           Validé
                         </span>
                      {:else}
                         <span class="px-3 py-1.5 rounded-full bg-rose-500/10 text-rose-600 text-[10px] font-black uppercase tracking-widest border border-rose-500/20">
                           Refusé
                         </span>
                      {/if}
                    </div>
                 </div>

                 <!-- Content Card -->
                 <div class="p-6 flex-1 bg-surface-container-lowest/30">
                    <div class="flex items-center justify-between mb-4">
                       <span class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Suivi du Tuteur</span>
                       {#if period.mentor}
                          <div class="flex items-center gap-2">
                             <span class="text-[11px] font-bold text-on-surface-variant">Tuteur: {period.mentor.displayName || period.mentor.username}</span>
                          </div>
                       {/if}
                    </div>

                    <!-- Reports Timeline -->
                    <div class="space-y-4 max-h-[300px] overflow-y-auto mb-6 pr-2 scrollbar-thin">
                      {#if period.reports && period.reports.length > 0}
                        {#each period.reports as report}
                           <div class="relative pl-6 before:absolute before:left-[5px] before:top-2 before:bottom-0 before:w-px before:bg-outline-variant/20 last:before:display-none">
                              <div class="absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full border-2 border-surface-container-low {report.type === 'POSITIVE' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : report.type === 'NEGATIVE' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]' : 'bg-amber-500'}"></div>
                              <div class="rounded-2xl border border-outline-variant/10 bg-surface-container-high/40 p-3">
                                 <p class="text-xs font-medium text-on-surface leading-normal">{report.content}</p>
                                 <div class="flex items-center justify-between mt-2">
                                    <span class="text-[9px] font-bold text-on-surface-variant/40 uppercase tracking-tight">{new Date(report.createdAt).toLocaleDateString()} - {report.author?.displayName || 'Système'}</span>
                                    <span class="text-[9px] font-black uppercase tracking-widest {report.type === 'POSITIVE' ? 'text-emerald-500' : report.type === 'NEGATIVE' ? 'text-rose-500' : 'text-amber-500'}">{report.type}</span>
                                 </div>
                              </div>
                           </div>
                        {/each}
                      {:else}
                         <div class="py-8 flex flex-col items-center justify-center text-center opacity-40">
                            <span class="material-symbols-outlined text-3xl mb-2">assignment_late</span>
                            <p class="text-[11px] font-bold uppercase tracking-widest">Aucune note de suivi</p>
                         </div>
                      {/if}
                    </div>

                    {#if period.status === 'ONGOING'}
                       <div class="grid grid-cols-2 gap-3 mt-auto pt-4 border-t border-outline-variant/5">
                          <button 
                            onclick={() => showReportFormId = showReportFormId === period.id ? null : period.id} 
                            class="h-10 rounded-xl text-[11px] font-black uppercase tracking-widest bg-primary/5 text-primary hover:bg-primary/10 transition-colors border border-primary/10"
                          >
                             Rapport
                          </button>
                          <button 
                            onclick={() => showEndTestFormId = showEndTestFormId === period.id ? null : period.id} 
                            class="h-10 rounded-xl text-[11px] font-black uppercase tracking-widest bg-rose-500/5 text-rose-500 hover:bg-rose-500/10 transition-colors border border-rose-500/10"
                          >
                             Clôturer
                          </button>
                       </div>
                    {/if}

                    <!-- Forms embedded -->
                    {#if showReportFormId === period.id}
                      <div class="mt-4 p-5 rounded-2xl bg-surface-container-high shadow-xl border border-primary/20 animate-in zoom-in-95 duration-200">
                         <div class="flex gap-2 mb-3">
                            {#each ['POSITIVE', 'NEUTRAL', 'NEGATIVE'] as type}
                               <button 
                                 onclick={() => reportType = type as typeof reportType}
                                 class="flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all {reportType === type ? (type === 'POSITIVE' ? 'bg-emerald-500 text-white' : type === 'NEGATIVE' ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white') : 'bg-surface-container-low text-on-surface-variant/60 hover:bg-surface-container-lowest'}"
                               >
                                  {type === 'POSITIVE' ? 'Bon (+)' : type === 'NEGATIVE' ? 'Mauvais (-)' : 'Neutre'}
                               </button>
                            {/each}
                         </div>
                         <textarea 
                           bind:value={reportContent} 
                           placeholder="Détaillez vos observations ici (comportement, réactivité, erreurs...)" 
                           class="w-full text-xs p-3 rounded-xl bg-surface-container-low border border-outline-variant/10 h-24 resize-none mb-3 outline-none focus:border-primary/30"
                         ></textarea>
                         <div class="flex gap-2">
                            <button onclick={() => showReportFormId = null} class="flex-1 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:bg-black/5 transition-colors">Annuler</button>
                            <button onclick={() => addMentorReport(period.id)} class="flex-1 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest bg-primary text-white shadow-lg shadow-primary/20">Publier</button>
                         </div>
                      </div>
                    {/if}

                    {#if showEndTestFormId === period.id}
                      <div class="mt-4 p-5 rounded-2xl bg-surface-container-high shadow-xl border border-rose-500/20 animate-in zoom-in-95 duration-200">
                         <div class="flex gap-2 mb-3">
                           <button onclick={() => endTestStatus = 'PASSED'} class="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all {endTestStatus === 'PASSED' ? 'bg-emerald-500 text-white' : 'bg-surface-container-low text-on-surface-variant/40'}">Passage Validé</button>
                           <button onclick={() => endTestStatus = 'FAILED'} class="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all {endTestStatus === 'FAILED' ? 'bg-rose-500 text-white' : 'bg-surface-container-low text-on-surface-variant/40'}">Échec / Fin</button>
                         </div>
                         <textarea bind:value={endTestNotes} placeholder="Motif final de la décision..." class="w-full text-xs p-3 rounded-xl bg-surface-container-low border border-outline-variant/10 h-20 resize-none mb-3 outline-none focus:border-primary/30"></textarea>
                         <div class="flex gap-2">
                           <button onclick={() => showEndTestFormId = null} class="flex-1 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:bg-black/5 transition-colors">Annuler</button>
                           <button onclick={() => endTestingPeriod(period.id)} class="flex-1 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest bg-rose-600 text-white shadow-lg shadow-rose-500/20">Confirmer la fin</button>
                         </div>
                      </div>
                    {/if}
                 </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="flex flex-col items-center justify-center p-20 text-center">
            <div class="w-24 h-24 rounded-[2rem] bg-primary/5 text-primary flex items-center justify-center border border-primary/10 shadow-inner mb-8">
              <span class="material-symbols-outlined text-5xl">person_search</span>
            </div>
            <h3 class="text-2xl font-black tracking-tight text-on-surface">Personne en période de test</h3>
            <p class="mt-4 max-w-sm text-sm font-medium text-on-surface-variant/60 leading-relaxed">
              Utilisez le bouton en haut à droite pour placer un nouveau <span class="text-primary font-bold">Helper</span> sous la tutelle d'un tuteur expérimenté.
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
            <span class="material-symbols-outlined text-sm">{showWarnForm ? 'close' : 'add'}</span>
            {showWarnForm ? 'Annuler' : 'Nouvel Avertisss.'}
          </button>
        </div>

        {#if showWarnForm}
          <div class="p-6 md:p-8 border-b border-primary/10 bg-primary/5 animate-in slide-in-from-top-4 fade-in duration-300">
            <div class="grid gap-6 md:grid-cols-2">
              <div class="space-y-4 md:col-span-2">
                <label class="block text-xs font-bold uppercase tracking-[0.1em] text-on-surface-variant/70">Membre visé</label>
                <DiscordMemberLookup
                  {guildId}
                  bind:query={warnLookupQuery}
                  bind:selectedId={warnTargetUserId}
                  placeholder="@mention, pseudo ou ID Discord"
                  selectedIdPlaceholder="ID Discord du staff (auto-rempli)"
                />
              </div>

              <div class="space-y-4">
                <label class="block text-xs font-bold uppercase tracking-[0.1em] text-on-surface-variant/70">Raison de l'avertissement</label>
                <textarea
                  bind:value={warnReason}
                  placeholder="Décrivez précisément le manquement constaté..."
                  rows="3"
                  class="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10 resize-none"
                ></textarea>
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
                <label class="block text-xs font-bold uppercase tracking-[0.1em] text-rose-700/80">Membre à blacklister</label>
                <DiscordMemberLookup
                  {guildId}
                  bind:query={blacklistLookupQuery}
                  bind:selectedId={blacklistTargetUserId}
                  placeholder="@mention, pseudo ou ID Discord"
                  selectedIdPlaceholder="ID Discord du staff (auto-rempli)"
                />
              </div>

              <div class="space-y-4">
                <label class="block text-xs font-bold uppercase tracking-[0.1em] text-rose-700/80">Raison de l'exclusion</label>
                <textarea
                  bind:value={blacklistReason}
                  placeholder="Décrivez précisément ce qui a mené à cette blacklist..."
                  rows="3"
                  class="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none transition focus:border-rose-500/40 focus:ring-4 focus:ring-rose-500/10 resize-none"
                ></textarea>
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


      {/if}
    </div>
  {/if}
</div>
