<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from 'tinro';
  import { resolveTabFromUrl, gotoTab } from '../lib/tabRouting';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import ActionButton from '../lib/components/ActionButton.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import { inviteDetailsModal } from '../lib/stores/inviteDetailsModal.svelte';
  import {
    fetchInvitations,
    updateInvitationSource,
    toggleInvitationSuspension,
    deleteInvitation,
    purgeInvitationMembers,
    suspendInviter,
    removeSuspendedInviter,
    purgeInviterMembers,
  } from '../lib/api';
  import { toast } from '../lib/stores/toast.svelte';
  import { confirmDialog } from '../lib/stores/confirmDialog.svelte';

  type InviteStatus = 'active' | 'suspended' | 'deleted' | 'expired';
  type Tab = 'invites' | 'sources' | 'top' | 'suspensions';

  let invitations = $state<any[]>([]);
  let inviteUsage = $state<any[]>([]);
  let inviterUsage = $state<any[]>([]);
  let suspendedInviters = $state<any[]>([]);
  let summary = $state({ totalJoined: 0, totalLeft: 0 });

  let loading = $state(false);
  let error = $state('');

  const inviteTabs = ['invites', 'sources', 'top', 'suspensions'] as const;
  let activeTab = $state<Tab>('invites');

  $effect(() => {
    const _path = $router.path;
    activeTab = resolveTabFromUrl('/invitations', inviteTabs, 'invites') as Tab;
  });
  let searchQuery = $state('');
  let statusFilter = $state<'all' | InviteStatus>('all');
  let sortBy = $state<'createdAt' | 'uses' | 'joins' | 'retention'>('createdAt');
  let sortOrder = $state<'asc' | 'desc'>('desc');

  let suspendUserId = $state('');
  let suspendUserTag = $state('');
  let suspendReason = $state('');
  let suspendCascade = $state(false);
  let actionMenuOpen = $state<string | null>(null);
  let actionMenuPosition = $state({ x: 0, y: 0 });
  let editingSourceCode = $state<string | null>(null);
  let sourceDraft = $state('');
  let savingSource = $state(false);


  const canModerate = $derived(
    !!dashboardStore.state.access?.canModerateContent
  );
  const canManageInvites = $derived(
    !!dashboardStore.state.access?.canModerateContent
      || !!dashboardStore.state.access?.canManageSettings
  );

  const tabs = $derived([
    { id: 'invites' as Tab, label: 'Invitations', icon: 'MailOpen', count: totalInvites },
    { id: 'sources' as Tab, label: 'Provenances', icon: 'Tags', count: sourceStats.length },
    { id: 'top' as Tab, label: 'Top créateurs', icon: 'Crown', count: topInviters.length },
    { id: 'suspensions' as Tab, label: 'Suspensions', icon: 'UserX', count: suspendedInviters.length },
  ]);

  const usageMap = $derived.by(() => {
    const map = new Map<string, any>();
    inviteUsage.forEach((entry) => {
      if (entry.inviteCode) {
        map.set(entry.inviteCode, {
          joinedCount: entry._count?._all ?? 0,
          leftCount: entry._count?.leftAt ?? 0,
          lastJoinedAt: entry._max?.joinedAt ?? null,
        });
      }
    });
    return map;
  });

  const suspendedInviterMap = $derived.by(() => {
    const map = new Map<string, any>();
    suspendedInviters.forEach((entry) => {
      map.set(entry.userId, entry);
    });
    return map;
  });

  const invitesWithStats = $derived.by(() =>
    invitations.map((invite) => {
      const usage = usageMap.get(invite.code) || { joinedCount: 0, leftCount: 0, lastJoinedAt: null };
      const joinedCount = usage.joinedCount ?? 0;
      const leftCount = usage.leftCount ?? 0;
      const retention = joinedCount > 0 ? Math.round(((joinedCount - leftCount) / joinedCount) * 100) : 0;
      const inviterSuspended = invite.inviterId ? suspendedInviterMap.has(invite.inviterId) : false;
      return { ...invite, joinedCount, leftCount, retention, lastJoinedAt: usage.lastJoinedAt, inviterSuspended };
    })
  );

  const filteredInvites = $derived.by(() => {
    const query = searchQuery.trim().toLowerCase();
    const now = Date.now();
    const base = invitesWithStats.filter((invite) => {
      const matchesQuery = !query
        || invite.code?.toLowerCase().includes(query)
        || invite.sourceLabel?.toLowerCase().includes(query)
        || invite.inviterTag?.toLowerCase().includes(query)
        || invite.inviterId?.toLowerCase().includes(query);

      if (!matchesQuery) return false;

      if (statusFilter === 'all') return true;

      const status = getInviteStatus(invite, now);
      return status === statusFilter;
    });

    const direction = sortOrder === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      if (sortBy === 'uses') return (a.uses - b.uses) * direction;
      if (sortBy === 'joins') return (a.joinedCount - b.joinedCount) * direction;
      if (sortBy === 'retention') return (a.retention - b.retention) * direction;
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * direction;
    });
  });

  const topInviters = $derived.by(() => {
    return [...inviterUsage]
      .map((entry) => ({
        inviterId: entry.inviterId,
        inviterTag: entry.inviterTag || `Utilisateur ${entry.inviterId}`,
        avatarUrl: entry.avatarUrl || null,
        joinedCount: entry._count?._all ?? 0,
        leftCount: entry._count?.leftAt ?? 0,
        lastJoinedAt: entry._max?.joinedAt ?? null,
      }))
      .sort((a, b) => b.joinedCount - a.joinedCount)
      .slice(0, 6);
  });

  const sourceStats = $derived.by(() => {
    const sources = new Map<string, {
      name: string;
      invites: any[];
      joinedCount: number;
      leftCount: number;
    }>();

    for (const invite of invitesWithStats) {
      const name = invite.sourceLabel?.trim();
      if (!name) continue;
      const key = name.toLocaleLowerCase('fr-FR');
      const current = sources.get(key) ?? { name, invites: [], joinedCount: 0, leftCount: 0 };
      current.invites.push(invite);
      current.joinedCount += invite.joinedCount ?? 0;
      current.leftCount += invite.leftCount ?? 0;
      sources.set(key, current);
    }

    return [...sources.values()]
      .map((source) => ({
        ...source,
        stayedCount: source.joinedCount - source.leftCount,
        retention: source.joinedCount > 0
          ? Math.round(((source.joinedCount - source.leftCount) / source.joinedCount) * 100)
          : 0,
      }))
      .sort((a, b) => b.joinedCount - a.joinedCount || a.name.localeCompare(b.name, 'fr'));
  });

  const totalInvites = $derived(invitations.length);
  const totalSuspended = $derived(invitations.filter((inv) => inv.isSuspended).length);
  const totalDeleted = $derived(invitations.filter((inv) => inv.isDeleted).length);
  const totalExpired = $derived(invitations.filter((inv) => inv.expiresAt && new Date(inv.expiresAt).getTime() < Date.now()).length);
  const totalJoins = $derived(summary.totalJoined || 0);
  const totalLeft = $derived(summary.totalLeft || 0);
  const retentionRate = $derived(totalJoins > 0 ? Math.round(((totalJoins - totalLeft) / totalJoins) * 100) : 0);
  const trackedInvites = $derived(invitesWithStats.filter((invite) => !!invite.sourceLabel?.trim()).length);
  const untrackedInvites = $derived(totalInvites - trackedInvites);
  const trackedJoins = $derived(sourceStats.reduce((total, source) => total + source.joinedCount, 0));
  const sourceCoverage = $derived(totalJoins > 0 ? Math.round((trackedJoins / totalJoins) * 100) : 0);
  const leadingSource = $derived(sourceStats[0] ?? null);
  const editingInvite = $derived(invitesWithStats.find((invite) => invite.code === editingSourceCode) ?? null);


  onMount(async () => {
    await loadInvitations();
    document.addEventListener('click', handleClickOutside);
  });

  function onUnmount() {
    document.removeEventListener('click', handleClickOutside);
  }

  async function loadInvitations() {
    if (!authStore.selectedGuildId) return;
    loading = true;
    error = '';

    try {
      const data = await fetchInvitations();
      invitations = data?.invitations ?? [];
      suspendedInviters = data?.suspendedInviters ?? [];
      inviteUsage = data?.inviteUsage ?? [];
      inviterUsage = data?.inviterUsage ?? [];
      summary = data?.summary ?? { totalJoined: 0, totalLeft: 0 };
    } catch (err: any) {
      error = err?.message || 'Erreur lors du chargement des invitations.';
    } finally {
      loading = false;
    }
  }

  function formatDate(value: string | null) {
    if (!value) return 'Jamais';
    return new Date(value).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function formatRelative(value: string | null) {
    if (!value) return 'Jamais';
    const diffMs = Date.now() - new Date(value).getTime();
    const minutes = Math.max(1, Math.floor(diffMs / 60000));
    if (minutes < 60) return `il y a ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `il y a ${hours} h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `il y a ${days} j`;
    return formatDate(value);
  }

  function getInviteStatus(invite: any, now = Date.now()): InviteStatus {
    if (invite.isDeleted) return 'deleted';
    if (invite.isSuspended) return 'suspended';
    if (invite.expiresAt && new Date(invite.expiresAt).getTime() < now) return 'expired';
    return 'active';
  }

  function getStatusLabel(status: InviteStatus) {
    switch (status) {
      case 'active': return 'Actif';
      case 'suspended': return 'Suspendu';
      case 'deleted': return 'Supprimé';
      case 'expired': return 'Expiré';
    }
  }

  function getStatusClass(status: InviteStatus) {
    switch (status) {
      case 'active': return 'bg-emerald-500/10 text-emerald-500';
      case 'suspended': return 'bg-amber-500/10 text-amber-500';
      case 'deleted': return 'bg-red-500/10 text-red-500';
      case 'expired': return 'bg-slate-500/10 text-on-surface-variant/60';
    }
  }

  function isDormant(invite: any) {
    if (!invite.lastJoinedAt) return true;
    const diff = Date.now() - new Date(invite.lastJoinedAt).getTime();
    return diff > 30 * 24 * 60 * 60 * 1000;
  }

  async function toggleSuspend(invite: any) {
    if (!canModerate) return;
    const nextValue = !invite.isSuspended;
    try {
      await toggleInvitationSuspension(invite.code, nextValue);
      toast.success(nextValue ? 'Invitation suspendue.' : 'Invitation restaurée.');
      actionMenuOpen = null;
      await loadInvitations();
    } catch (err: any) {
      toast.error(err?.message || 'Erreur lors de la modification.');
    }
  }

  async function purgeInvite(invite: any) {
    if (!canModerate) return;
    const confirmPurge = await confirmDialog.danger(`Purger les membres invités via ${invite.code} ?`, '', 'Purger');
    if (!confirmPurge) return;
    try {
      const result = await purgeInvitationMembers(invite.code);
      toast.success(`Purge terminée (${result?.purgedCount ?? 0} exclus).`);
      actionMenuOpen = null;
      await loadInvitations();
    } catch (err: any) {
      toast.error(err?.message || 'Erreur lors de la purge.');
    }
  }

  async function deleteInvite(invite: any) {
    if (!canModerate) return;
    const confirmDelete = await confirmDialog.danger(`Supprimer l'invitation ${invite.code} ?`, 'Cette suppression est définitive.');
    if (!confirmDelete) return;
    try {
      await deleteInvitation(invite.code);
      toast.success('Invitation supprimée.');
      actionMenuOpen = null;
      await loadInvitations();
    } catch (err: any) {
      toast.error(err?.message || 'Erreur lors de la suppression.');
    }
  }

  async function copyInvite(invite: any) {
    const guildId = authStore.selectedGuildId;
    if (!guildId) return;
    const link = `https://discord.gg/${invite.code}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Lien copié.');
      actionMenuOpen = null;
    } catch {
      toast.warning('Impossible de copier le lien.');
    }
  }

  function beginSourceEdit(invite: any) {
    if (!canManageInvites) return;
    editingSourceCode = invite.code;
    sourceDraft = invite.sourceLabel || '';
    actionMenuOpen = null;
  }

  function cancelSourceEdit() {
    editingSourceCode = null;
    sourceDraft = '';
  }

  async function saveSource(invite: any) {
    if (!canManageInvites || savingSource) return;
    const nextSource = sourceDraft.trim();
    if (nextSource.length > 60) {
      toast.warning('Le nom de provenance est limité à 60 caractères.');
      return;
    }

    savingSource = true;
    try {
      await updateInvitationSource(invite.code, nextSource || null);
      invitations = invitations.map((item) => item.code === invite.code
        ? { ...item, sourceLabel: nextSource || null }
        : item);
      toast.success(nextSource ? `Provenance « ${nextSource} » enregistrée.` : 'Provenance retirée.');
      cancelSourceEdit();
    } catch (err: any) {
      toast.error(err?.message || 'Erreur lors de la modification de la provenance.');
    } finally {
      savingSource = false;
    }
  }

  function toggleActionMenu(inviteCode: string, event: MouseEvent) {
    event.stopPropagation();
    if (actionMenuOpen === inviteCode) {
      actionMenuOpen = null;
    } else {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      actionMenuPosition = { x: rect.right - 160, y: rect.bottom + 4 };
      actionMenuOpen = inviteCode;
    }
  }

  function closeActionMenu() {
    actionMenuOpen = null;
  }

  function handleClickOutside(event: MouseEvent) {
    if (actionMenuOpen && !(event.target as HTMLElement).closest('.action-menu-container')) {
      closeActionMenu();
    }
  }

  function exportInvites() {
    if (filteredInvites.length === 0) {
      toast.warning('Aucune donnée à exporter.');
      return;
    }

    const header = [
      'code',
      'provenance',
      'inviter',
      'createdAt',
      'uses',
      'joins',
      'left',
      'retention',
      'status',
      'expiresAt'
    ];

    const rows = filteredInvites.map((invite) => {
      const status = getStatusLabel(getInviteStatus(invite));
      return [
        invite.code,
        invite.sourceLabel || '',
        invite.inviterTag || invite.inviterId || 'Inconnu',
        invite.createdAt ? new Date(invite.createdAt).toISOString() : '',
        invite.uses ?? 0,
        invite.joinedCount ?? 0,
        invite.leftCount ?? 0,
        `${invite.retention ?? 0}%`,
        status,
        invite.expiresAt ? new Date(invite.expiresAt).toISOString() : ''
      ];
    });

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kotbo_invites_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function createSuspension() {
    if (!suspendUserId.trim()) {
      toast.warning('ID utilisateur requis.');
      return;
    }

    try {
      const result = await suspendInviter(
        suspendUserId.trim(),
        suspendUserTag.trim(),
        suspendReason.trim(),
        { cascade: suspendCascade }
      );
      toast.success('Créateur suspendu.');
      if (result?.cascade) {
        toast.info(`Purge cascade : ${result.cascade.purgedCount ?? 0} exclus.`);
      }
      suspendUserId = '';
      suspendUserTag = '';
      suspendReason = '';
      suspendCascade = false;
      await loadInvitations();
    } catch (err: any) {
      toast.error(err?.message || 'Erreur lors de la suspension.');
    }
  }

  async function restoreSuspended(userId: string) {
    if (!canModerate) return;
    try {
      await removeSuspendedInviter(userId);
      toast.success('Créateur réhabilité.');
      await loadInvitations();
    } catch (err: any) {
      toast.error(err?.message || 'Erreur lors de la restauration.');
    }
  }

  async function purgeByInviter(userId: string) {
    if (!canModerate) return;
    const confirmPurge = await confirmDialog.danger('Purger en cascade ?', 'Tous les membres invités par ce créateur seront purgés.', 'Purger');
    if (!confirmPurge) return;
    try {
      const result = await purgeInviterMembers(userId);
      toast.success(`Purge cascade terminée (${result?.purgedCount ?? 0} exclus).`);
      await loadInvitations();
    } catch (err: any) {
      toast.error(err?.message || 'Erreur lors de la purge cascade.');
    }
  }

</script>

<ModulePage
  title="Invitations"
  description="Nommez vos liens par provenance et mesurez les canaux qui recrutent le mieux."
  icon="MailOpen"
  featureKey="members"
>
  {#snippet actions()}
    <div class="flex gap-3">
      <RefreshButton onClick={loadInvitations} loading={loading} label="Actualiser" />
      <ActionButton
        label="Exporter"
        icon="Download"
        variant="muted"
        size="md"
        onClick={exportInvites}
      />
    </div>
  {/snippet}

  <div class="space-y-6">
    {#if error}
      <div class="p-4 rounded-lg bg-red-500/10 text-red-500 text-sm font-bold">{error}</div>
    {/if}

    <!-- Stats compactes -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
      {#if loading}
        {#each Array(5) as _}
          <div class="premium-card p-4 rounded-lg animate-pulse">
            <div class="h-3 w-16 bg-surface-container-high/50 rounded mb-2"></div>
            <div class="h-8 w-12 bg-surface-container-high/50 rounded"></div>
          </div>
        {/each}
      {:else}
        <div class="premium-card p-4 rounded-lg">
          <p class="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/50">Invitations</p>
          <p class="text-2xl font-semibold text-primary">{totalInvites}</p>
        </div>
        <div class="premium-card p-4 rounded-lg">
          <p class="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/50">Provenances</p>
          <p class="text-2xl font-semibold text-cyan-500">{sourceStats.length}</p>
        </div>
        <div class="premium-card p-4 rounded-lg">
          <p class="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/50">Joins attribués</p>
          <p class="text-2xl font-semibold text-primary">{sourceCoverage}%</p>
        </div>
        <div class="premium-card p-4 rounded-lg">
          <p class="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/50">Total joins</p>
          <p class="text-2xl font-semibold text-emerald-500">{totalJoins}</p>
        </div>
        <div class="premium-card p-4 rounded-lg">
          <p class="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/50">Rétention</p>
          <p class="text-2xl font-semibold text-cyan-500">{retentionRate}%</p>
        </div>
      {/if}
    </div>

    <!-- Onglets -->
    <div class="flex gap-2 border-b border-outline-variant/20 pb-2">
      {#each tabs as tab}
        <button
          class="tab-button {activeTab === tab.id ? 'active' : ''}"
          onclick={() => gotoTab('/invitations', tab.id, 'invites')}
        >
          <Papicon icon={tab.icon} size={16} />
          <span>{tab.label}</span>
          <span class="tab-button {activeTab === tab.id ? 'active' : ''}">{tab.count}</span>
        </button>
      {/each}
    </div>

    <!-- Contenu des onglets -->
    {#if activeTab === 'invites'}
      <div class="premium-card p-6 rounded-xl space-y-4">
        <!-- Filtres et recherche -->
        <div class="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          {#if loading}
            <div class="h-10 w-full lg:w-80 bg-surface-container-high/30 rounded-xl animate-pulse"></div>
            <div class="flex gap-2 flex-wrap">
              <div class="h-10 w-32 bg-surface-container-high/40 rounded-xl animate-pulse"></div>
              <div class="h-10 w-24 bg-surface-container-high/40 rounded-xl animate-pulse"></div>
              <div class="h-10 w-16 bg-surface-container-high/40 rounded-xl animate-pulse"></div>
            </div>
          {:else}
            <FormInput
              placeholder="Rechercher un code ou un créateur..."
              bind:value={searchQuery}
              className="w-full lg:w-80 px-4 py-2.5 rounded-xl bg-surface-container-high/30 border border-outline-variant/20 text-sm"
            />
            <div class="flex gap-2 flex-wrap">
              <select bind:value={statusFilter} class="px-3 py-2 rounded-xl bg-surface-container-high/40 text-xs font-bold border border-outline-variant/20">
                <option value="all">Tous les statuts</option>
                <option value="active">Actives</option>
                <option value="suspended">Suspendues</option>
                <option value="expired">Expirées</option>
                <option value="deleted">Supprimées</option>
              </select>
              <select bind:value={sortBy} class="px-3 py-2 rounded-xl bg-surface-container-high/40 text-xs font-bold border border-outline-variant/20">
                <option value="createdAt">Création</option>
                <option value="uses">Uses</option>
                <option value="joins">Joins</option>
                <option value="retention">Rétention</option>
              </select>
              <button
                class="px-3 py-2 rounded-xl bg-surface-container-high/40 text-xs font-bold border border-outline-variant/20 hover:bg-surface-container-high/60 transition-colors"
                onclick={() => sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'}
              >
                {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
              </button>
            </div>
          {/if}
        </div>

        <!-- Tableau des invitations -->
        <div class="overflow-x-auto overflow-visible">
          {#if loading}
            <div class="space-y-3">
              {#each Array(8) as _}
                <div class="flex items-center gap-4 p-3 rounded-xl bg-surface-container-high/10 animate-pulse">
                  <div class="h-8 w-20 bg-surface-container-high/30 rounded-lg"></div>
                  <div class="flex-1 space-y-2">
                    <div class="h-4 w-32 bg-surface-container-high/30 rounded"></div>
                    <div class="h-3 w-24 bg-surface-container-high/20 rounded"></div>
                  </div>
                  <div class="h-6 w-8 bg-surface-container-high/30 rounded"></div>
                  <div class="h-6 w-8 bg-surface-container-high/30 rounded"></div>
                  <div class="h-6 w-12 bg-surface-container-high/30 rounded"></div>
                  <div class="h-6 w-16 bg-surface-container-high/30 rounded"></div>
                  <div class="h-8 w-8 bg-surface-container-high/30 rounded-lg"></div>
                </div>
              {/each}
            </div>
          {:else}
            <table class="w-full">
              <thead>
                <tr class="text-left text-xs font-medium text-on-surface-variant/50 border-b border-outline-variant/10">
                  <th class="pb-3 pr-4">Code</th>
                  <th class="pb-3 pr-4">Provenance</th>
                  <th class="pb-3 pr-4">Créateur</th>
                  <th class="pb-3 pr-4">Statut</th>
                  <th class="pb-3 pr-4 text-right">Joins</th>
                  <th class="pb-3 pr-4 text-right">Uses</th>
                  <th class="pb-3 pr-4 text-right">Rétention</th>
                  <th class="pb-3 pr-4">Dernier join</th>
                  <th class="pb-3"></th>
                </tr>
              </thead>
              <tbody class="text-sm">
                {#each filteredInvites as invite}
                  {@const status = getInviteStatus(invite)}
                  <tr class="border-b border-outline-variant/5 hover:bg-surface-container-high/20 transition-colors">
                    <td class="py-3 pr-4">
                      <code class="text-xs font-semibold text-primary dark:text-blue-300 bg-primary/10 dark:bg-blue-500/15 px-2 py-1 rounded-lg">{invite.code}</code>
                    </td>
                    <td class="py-3 pr-4 min-w-[180px]">
                      {#if editingSourceCode === invite.code}
                        <div class="flex items-center gap-1.5">
                          <input
                            bind:value={sourceDraft}
                            maxlength="60"
                            placeholder="TikTok, Instagram…"
                            aria-label="Nom de la provenance"
                            class="w-36 px-2.5 py-1.5 rounded-lg bg-surface-container-high/50 border border-primary/40 text-xs outline-none focus:ring-2 focus:ring-primary/20"
                            onkeydown={(event) => {
                              if (event.key === 'Enter') void saveSource(invite);
                              if (event.key === 'Escape') cancelSourceEdit();
                            }}
                          />
                          <button type="button" title="Enregistrer" disabled={savingSource} class="source-icon-button text-emerald-500" onclick={() => saveSource(invite)}>
                            <Papicon icon="Check" size={14} />
                          </button>
                          <button type="button" title="Annuler" class="source-icon-button text-on-surface-variant" onclick={cancelSourceEdit}>
                            <Papicon icon="X" size={14} />
                          </button>
                        </div>
                      {:else if invite.sourceLabel}
                        <button type="button" class="source-chip" disabled={!canManageInvites} onclick={() => beginSourceEdit(invite)}>
                          <span class="h-1.5 w-1.5 rounded-full bg-cyan-500"></span>
                          {invite.sourceLabel}
                        </button>
                      {:else if canManageInvites}
                        <button type="button" class="text-[11px] font-semibold text-on-surface-variant/50 hover:text-primary transition-colors inline-flex items-center gap-1" onclick={() => beginSourceEdit(invite)}>
                          <Papicon icon="Plus" size={13} /> Nommer
                        </button>
                      {:else}
                        <span class="text-xs text-on-surface-variant/30">Non attribuée</span>
                      {/if}
                    </td>
                    <td class="py-3 pr-4">
                      <div class="flex flex-col">
                        <span class="font-bold text-on-surface">{invite.inviterTag || invite.inviterId || 'Inconnu'}</span>
                        <span class="text-[10px] text-on-surface-variant/50">{formatDate(invite.createdAt)}</span>
                      </div>
                    </td>
                    <td class="py-3 pr-4">
                      <div class="flex gap-1 flex-wrap">
                        <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold {getStatusClass(status)}">
                          {getStatusLabel(status)}
                        </span>
                        {#if invite.inviterSuspended}
                          <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/10 text-red-500">Créateur suspendu</span>
                        {/if}
                        {#if isDormant(invite)}
                          <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-500/10 text-on-surface-variant/60">Dormant</span>
                        {/if}
                      </div>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="font-semibold text-emerald-500">{invite.joinedCount}</span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="font-semibold text-orange-500">{invite.uses ?? 0}</span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="font-semibold {invite.retention >= 70 ? 'text-emerald-500' : invite.retention >= 40 ? 'text-amber-500' : 'text-red-500'}">{invite.retention}%</span>
                    </td>
                    <td class="py-3 pr-4 text-right text-[10px] text-on-surface-variant/60">
                      {formatRelative(invite.lastJoinedAt)}
                    </td>
                    <td class="py-3">
                      <div class="relative">
                        <button
                          type="button"
                          class="p-1.5 rounded-lg hover:bg-surface-container-high/50 transition-colors"
                          onclick={(e) => toggleActionMenu(invite.code, e)}
                        >
                          <Papicon icon="MoreVertical" size={16} class="text-on-surface-variant/70" />
                        </button>
                        {#if actionMenuOpen === invite.code}
                          <div class="absolute right-0 top-full mt-1 z-[9999] min-w-[160px] bg-surface-container rounded-xl shadow-sm border border-outline-variant/20 overflow-hidden">
                            <button
                              class="w-full px-3 py-2 text-left text-xs font-bold hover:bg-surface-container-high/50 flex items-center gap-2 transition-colors"
                              onclick={() => { inviteDetailsModal.show(invite.code); closeActionMenu(); }}
                            >
                              <Papicon icon="TrendingUp" size={14} />
                              Détails
                            </button>
                            <button
                              class="w-full px-3 py-2 text-left text-xs font-bold hover:bg-surface-container-high/50 flex items-center gap-2 transition-colors"
                              onclick={() => copyInvite(invite)}
                            >
                              <Papicon icon="Copy" size={14} />
                              Copier le lien
                            </button>
                            {#if canManageInvites}
                              <button
                                class="w-full px-3 py-2 text-left text-xs font-bold hover:bg-surface-container-high/50 flex items-center gap-2 transition-colors"
                                onclick={() => beginSourceEdit(invite)}
                              >
                                <Papicon icon="Tag" size={14} />
                                {invite.sourceLabel ? 'Renommer la source' : 'Nommer la source'}
                              </button>
                            {/if}
                            {#if canModerate}
                              <div class="border-t border-outline-variant/10"></div>
                              <button
                                class="w-full px-3 py-2 text-left text-xs font-bold hover:bg-surface-container-high/50 flex items-center gap-2 transition-colors"
                                onclick={() => toggleSuspend(invite)}
                              >
                                <Papicon icon={invite.isSuspended ? 'Play' : 'Pause'} size={14} />
                                {invite.isSuspended ? 'Restaurer' : 'Suspendre'}
                              </button>
                              <button
                                class="w-full px-3 py-2 text-left text-xs font-bold text-red-500 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
                                onclick={() => purgeInvite(invite)}
                              >
                                <Papicon icon="Trash" size={14} />
                                Purger
                              </button>
                              <button
                                class="w-full px-3 py-2 text-left text-xs font-bold text-red-500 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
                                onclick={() => deleteInvite(invite)}
                              >
                                <Papicon icon="X" size={14} />
                                Supprimer
                              </button>
                            {/if}
                          </div>
                        {/if}
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
            {#if filteredInvites.length === 0}
              <div class="text-center py-12 text-on-surface-variant/60">
                Aucune invitation ne correspond aux filtres.
              </div>
            {/if}
          {/if}
        </div>
      </div>
    {:else if activeTab === 'sources'}
      <div class="space-y-5">
        <section class="source-overview">
          <div class="max-w-2xl">
            <div class="flex items-center gap-2 text-cyan-500 mb-3">
              <Papicon icon="Route" size={18} />
              <span class="text-[11px] font-semibold uppercase tracking-[0.18em]">Attribution des arrivées</span>
            </div>
            <h3 class="text-xl font-semibold text-on-surface">Quel canal fait vraiment grandir le serveur&nbsp;?</h3>
            <p class="mt-2 text-sm text-on-surface-variant/60 leading-relaxed">
              Donnez le même nom à plusieurs liens pour les regrouper. « TikTok », « Instagram », une campagne ou un partenaire : tout est personnalisable.
            </p>
          </div>
          <div class="source-overview-metric">
            {#if leadingSource}
              <span class="text-[10px] uppercase tracking-widest text-on-surface-variant/50">Meilleure provenance</span>
              <strong class="text-lg text-on-surface mt-1">{leadingSource.name}</strong>
              <span class="text-xs text-emerald-500 mt-1">{leadingSource.joinedCount} arrivée{leadingSource.joinedCount > 1 ? 's' : ''}</span>
            {:else}
              <span class="text-sm text-on-surface-variant/60">Nommez un premier lien pour commencer.</span>
            {/if}
          </div>
        </section>

        {#if editingInvite}
          <section class="source-editor" aria-label="Modifier une provenance">
            <div class="min-w-0">
              <p class="text-xs font-semibold text-on-surface">Nommer <code class="text-primary">discord.gg/{editingInvite.code}</code></p>
              <p class="text-[11px] text-on-surface-variant/50 mt-1">Réutilisez exactement le même nom pour regrouper plusieurs invitations.</p>
            </div>
            <div class="flex items-center gap-2 w-full md:w-auto">
              <input
                bind:value={sourceDraft}
                maxlength="60"
                placeholder="Ex. TikTok, Instagram, Partenaire Alex…"
                aria-label="Nom de la provenance"
                class="flex-1 md:w-72 px-3 py-2.5 rounded-xl bg-surface border border-outline-variant/30 text-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                onkeydown={(event) => {
                  if (event.key === 'Enter') void saveSource(editingInvite);
                  if (event.key === 'Escape') cancelSourceEdit();
                }}
              />
              <ActionButton label={savingSource ? 'Enregistrement…' : 'Enregistrer'} icon="Check" size="md" onClick={() => saveSource(editingInvite)} disabled={savingSource} />
              <button type="button" class="source-icon-button" title="Annuler" onclick={cancelSourceEdit}><Papicon icon="X" size={16} /></button>
            </div>
          </section>
        {/if}

        <section class="premium-card rounded-xl overflow-hidden">
          <div class="px-5 py-4 border-b border-outline-variant/10 flex items-center justify-between gap-4">
            <div>
              <h3 class="text-sm font-semibold text-on-surface">Performance par provenance</h3>
              <p class="text-xs text-on-surface-variant/50 mt-1">{trackedInvites} lien{trackedInvites > 1 ? 's' : ''} nommé{trackedInvites > 1 ? 's' : ''} · {trackedJoins} arrivées attribuées</p>
            </div>
            <span class="text-xs font-semibold text-primary">{sourceCoverage}% des joins couverts</span>
          </div>

          {#if sourceStats.length > 0}
            <div class="overflow-x-auto">
              <table class="w-full min-w-[720px]">
                <thead>
                  <tr class="text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/45 border-b border-outline-variant/10">
                    <th class="px-5 py-3">Provenance</th>
                    <th class="px-4 py-3">Liens</th>
                    <th class="px-4 py-3 text-right">Arrivées</th>
                    <th class="px-4 py-3 text-right">Restants</th>
                    <th class="px-5 py-3 text-right">Rétention</th>
                  </tr>
                </thead>
                <tbody>
                  {#each sourceStats as source, index}
                    <tr class="border-b border-outline-variant/8 last:border-0 hover:bg-surface-container-high/15 transition-colors">
                      <td class="px-5 py-4">
                        <div class="flex items-center gap-3">
                          <span class="source-rank">{index + 1}</span>
                          <div class="min-w-0">
                            <p class="font-semibold text-sm text-on-surface truncate">{source.name}</p>
                            <div class="mt-2 h-1 w-36 rounded-full bg-surface-container-high overflow-hidden">
                              <div class="h-full rounded-full bg-cyan-500" style={`width: ${leadingSource && leadingSource.joinedCount > 0 ? Math.max(5, Math.round((source.joinedCount / leadingSource.joinedCount) * 100)) : 0}%`}></div>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td class="px-4 py-4">
                        <div class="flex flex-wrap gap-1.5">
                          {#each source.invites as invite}
                            <button type="button" class="invite-code-chip" disabled={!canManageInvites} onclick={() => beginSourceEdit(invite)} title={canManageInvites ? `Renommer ${invite.code}` : invite.code}>{invite.code}</button>
                          {/each}
                        </div>
                      </td>
                      <td class="px-4 py-4 text-right font-semibold text-emerald-500">{source.joinedCount}</td>
                      <td class="px-4 py-4 text-right font-semibold text-on-surface">{source.stayedCount}</td>
                      <td class="px-5 py-4 text-right">
                        <span class="font-semibold {source.retention >= 70 ? 'text-emerald-500' : source.retention >= 40 ? 'text-amber-500' : 'text-red-500'}">{source.retention}%</span>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <div class="px-6 py-12 text-center">
              <Papicon icon="Tags" size={30} class="mx-auto text-on-surface-variant/25" />
              <p class="mt-3 text-sm font-semibold text-on-surface">Aucune provenance nommée</p>
              <p class="mt-1 text-xs text-on-surface-variant/50">Attribuez vos liens ci-dessous pour faire apparaître le classement.</p>
            </div>
          {/if}
        </section>

        {#if untrackedInvites > 0}
          <section class="premium-card rounded-xl px-5 py-4">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 class="text-sm font-semibold text-on-surface">Liens sans provenance</h3>
                <p class="text-xs text-on-surface-variant/50 mt-1">{untrackedInvites} invitation{untrackedInvites > 1 ? 's' : ''} à attribuer pour compléter vos statistiques.</p>
              </div>
              <div class="flex flex-wrap gap-2 md:justify-end">
                {#each invitesWithStats.filter((invite) => !invite.sourceLabel?.trim()) as invite}
                  <button type="button" class="untracked-invite" disabled={!canManageInvites} onclick={() => beginSourceEdit(invite)}>
                    <code>{invite.code}</code>
                    {#if canManageInvites}<Papicon icon="Plus" size={13} />{/if}
                  </button>
                {/each}
              </div>
            </div>
          </section>
        {/if}
      </div>
    {:else if activeTab === 'top'}
      <div class="premium-card p-6 rounded-xl space-y-4">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
            <Papicon icon="Crown" size={18} />
          </div>
          <div>
            <h3 class="text-lg font-semibold">Top créateurs</h3>
            <p class="text-xs text-on-surface-variant/60">Classement par nombre de joins.</p>
          </div>
        </div>

        <div class="space-y-2">
          {#if loading}
            {#each Array(6) as _, index}
              <div class="p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/10 flex items-center justify-between animate-pulse">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-full bg-surface-container-high/30"></div>
                  <div class="space-y-2">
                    <div class="h-4 w-32 bg-surface-container-high/30 rounded"></div>
                    <div class="h-3 w-24 bg-surface-container-high/20 rounded"></div>
                  </div>
                </div>
                <div class="h-6 w-8 bg-surface-container-high/30 rounded"></div>
              </div>
            {/each}
          {:else}
            {#each topInviters as inviter, index}
              {@const rank = index + 1}
              {@const fallbackAvatarUrl = `https://cdn.discordapp.com/embed/avatars/${Number(inviter.inviterId?.slice(-4) || 0) % 5}.png`}
              <div class="p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/10 flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="relative">
                    <img
                      src={inviter.avatarUrl || fallbackAvatarUrl}
                      alt={inviter.inviterTag}
                      class="w-10 h-10 rounded-full object-cover"
                      loading="lazy"
                    />
                    <span class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full {rank === 1 ? 'bg-yellow-500' : rank === 2 ? 'bg-gray-400' : rank === 3 ? 'bg-amber-600' : 'bg-surface-container-high'} text-[11px] font-semibold flex items-center justify-center border-2 border-surface-container">
                      {rank}
                    </span>
                  </div>
                  <div>
                    <p class="text-sm font-semibold text-on-surface">{inviter.inviterTag}</p>
                    <p class="text-[10px] text-on-surface-variant/50">Dernier join: {formatRelative(inviter.lastJoinedAt)}</p>
                  </div>
                </div>
                <span class="text-lg font-semibold text-emerald-500">{inviter.joinedCount}</span>
              </div>
            {/each}
            {#if topInviters.length === 0}
              <p class="text-xs text-on-surface-variant/60 text-center py-8">Aucune donnée disponible.</p>
            {/if}
          {/if}
        </div>
      </div>
    {:else if activeTab === 'suspensions'}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Formulaire de suspension -->
        <div class="premium-card p-6 rounded-xl space-y-4">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <Papicon icon="UserMinus" size={18} />
            </div>
            <div>
              <h3 class="text-lg font-semibold">Suspendre un créateur</h3>
              <p class="text-xs text-on-surface-variant/60">Bloque les nouvelles invites et peut purger en cascade.</p>
            </div>
          </div>

          {#if loading}
            <div class="space-y-3">
              <div class="h-10 w-full bg-surface-container-high/30 rounded-xl animate-pulse"></div>
              <div class="h-10 w-full bg-surface-container-high/30 rounded-xl animate-pulse"></div>
              <div class="h-10 w-full bg-surface-container-high/30 rounded-xl animate-pulse"></div>
              <div class="h-6 w-48 bg-surface-container-high/30 rounded animate-pulse"></div>
              <div class="h-10 w-full bg-surface-container-high/30 rounded-xl animate-pulse"></div>
            </div>
          {:else}
            <div class="space-y-3">
              <FormInput
                placeholder="ID utilisateur Discord"
                bind:value={suspendUserId}
                className="w-full px-4 py-2.5 rounded-xl bg-surface-container-high/30 border border-outline-variant/20 text-sm"
              />
              <FormInput
                placeholder="Tag utilisateur (optionnel)"
                bind:value={suspendUserTag}
                className="w-full px-4 py-2.5 rounded-xl bg-surface-container-high/30 border border-outline-variant/20 text-sm"
              />
              <FormInput
                placeholder="Raison de la suspension (optionnel)"
                bind:value={suspendReason}
                className="w-full px-4 py-2.5 rounded-xl bg-surface-container-high/30 border border-outline-variant/20 text-sm"
              />
              <label class="flex items-center gap-2 text-sm font-bold text-on-surface-variant/70 cursor-pointer">
                <input type="checkbox" bind:checked={suspendCascade} class="rounded" />
                Purge en cascade les membres invités
              </label>
              <ActionButton
                label="Suspendre le créateur"
                icon="Pause"
                variant="danger"
                size="md"
                onClick={createSuspension}
              />
            </div>
          {/if}
        </div>

        <!-- Liste des créateurs suspendus -->
        <div class="premium-card p-6 rounded-xl space-y-4">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-xl bg-red-500/10 text-red-500">
              <Papicon icon="UserX" size={18} />
            </div>
            <div>
              <h3 class="text-lg font-semibold">Créateurs suspendus</h3>
              <p class="text-xs text-on-surface-variant/60">Gestion des suspensions actives.</p>
            </div>
          </div>

          <div class="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
            {#if loading}
              {#each Array(4) as _}
                <div class="p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/10 animate-pulse">
                  <div class="flex items-start justify-between gap-3">
                    <div class="flex-1 space-y-2">
                      <div class="h-4 w-32 bg-surface-container-high/30 rounded"></div>
                      <div class="h-3 w-24 bg-surface-container-high/20 rounded"></div>
                      <div class="h-3 w-20 bg-surface-container-high/20 rounded"></div>
                    </div>
                    <div class="flex gap-2 shrink-0">
                      <div class="h-8 w-16 bg-surface-container-high/30 rounded-lg"></div>
                      <div class="h-8 w-16 bg-surface-container-high/30 rounded-lg"></div>
                    </div>
                  </div>
                </div>
              {/each}
            {:else}
              {#each suspendedInviters as inviter}
                <div class="p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/10">
                  <div class="flex items-start justify-between gap-3">
                    <div class="flex-1">
                      <p class="text-sm font-semibold text-on-surface">{inviter.userTag || inviter.userId}</p>
                      <p class="text-[10px] text-on-surface-variant/50 mt-1">{inviter.reason || 'Aucune raison'}</p>
                      <p class="text-[10px] text-on-surface-variant/40">{formatDate(inviter.createdAt)}</p>
                    </div>
                    {#if canModerate}
                      <div class="flex gap-2 shrink-0">
                        <ActionButton label="Purger" icon="Trash" size="sm" variant="danger" onClick={() => purgeByInviter(inviter.userId)} />
                        <ActionButton label="Restaurer" icon="Play" size="sm" variant="success" onClick={() => restoreSuspended(inviter.userId)} />
                      </div>
                    {/if}
                  </div>
                </div>
              {/each}
              {#if suspendedInviters.length === 0}
                <p class="text-xs text-on-surface-variant/60 text-center py-8">Aucun créateur suspendu.</p>
              {/if}
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
</ModulePage>

<style>
  .premium-card {
    background: rgba(var(--color-surface-container-low), 0.4);
    border: 1px solid rgba(var(--color-outline-variant), 0.1);
    transition: all 0.4s cubic-bezier(0.2, 1, 0.3, 1);
  }

  .source-overview {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
    padding: 1.5rem;
    border-radius: 0.875rem;
    background:
      radial-gradient(circle at 88% 20%, rgba(6, 182, 212, 0.12), transparent 32%),
      rgba(var(--color-surface-container-low), 0.48);
    border: 1px solid rgba(var(--color-outline-variant), 0.12);
  }

  .source-overview-metric {
    display: flex;
    flex-direction: column;
    min-width: 12rem;
    padding-left: 1.5rem;
    border-left: 1px solid rgba(var(--color-outline-variant), 0.18);
  }

  .source-editor {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.25rem;
    border-radius: 0.75rem;
    background: rgba(var(--color-primary), 0.055);
    border: 1px solid rgba(var(--color-primary), 0.22);
  }

  .source-chip,
  .invite-code-chip,
  .untracked-invite {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    border: 1px solid rgba(var(--color-outline-variant), 0.16);
    transition: border-color 150ms ease, background-color 150ms ease, color 150ms ease;
  }

  .source-chip {
    max-width: 11rem;
    padding: 0.32rem 0.58rem;
    border-radius: 999px;
    background: rgba(6, 182, 212, 0.08);
    color: rgb(8, 145, 178);
    font-size: 0.7rem;
    font-weight: 650;
  }

  :global(.dark) .source-chip {
    color: rgb(103, 232, 249);
  }

  .source-chip:not(:disabled):hover,
  .invite-code-chip:not(:disabled):hover,
  .untracked-invite:not(:disabled):hover {
    border-color: rgba(var(--color-primary), 0.45);
    background: rgba(var(--color-primary), 0.1);
    color: rgb(var(--color-primary));
  }

  .source-icon-button {
    display: inline-flex;
    width: 2rem;
    height: 2rem;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 0.5rem;
    transition: background-color 150ms ease;
  }

  .source-icon-button:hover {
    background: rgba(var(--color-surface-container-high), 0.65);
  }

  .source-rank {
    display: inline-flex;
    width: 1.75rem;
    height: 1.75rem;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 0.5rem;
    background: rgba(6, 182, 212, 0.1);
    color: rgb(8, 145, 178);
    font-size: 0.7rem;
    font-weight: 750;
  }

  .invite-code-chip {
    padding: 0.28rem 0.5rem;
    border-radius: 0.45rem;
    background: rgba(var(--color-surface-container-high), 0.35);
    color: rgb(var(--color-on-surface-variant));
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.68rem;
  }

  .untracked-invite {
    padding: 0.45rem 0.65rem;
    border-radius: 0.55rem;
    background: rgba(var(--color-surface-container-high), 0.3);
    color: rgb(var(--color-on-surface-variant));
    font-size: 0.7rem;
  }

  @media (max-width: 767px) {
    .source-overview,
    .source-editor {
      align-items: stretch;
      flex-direction: column;
    }

    .source-overview-metric {
      min-width: 0;
      padding-top: 1rem;
      padding-left: 0;
      border-top: 1px solid rgba(var(--color-outline-variant), 0.18);
      border-left: 0;
    }
  }

  :global(.custom-scrollbar) {
    scrollbar-width: thin;
    scrollbar-color: rgba(var(--color-primary), 0.3) transparent;
  }

  :global(.custom-scrollbar::-webkit-scrollbar) {
    width: 6px;
  }

  :global(.custom-scrollbar::-webkit-scrollbar-track) {
    background: transparent;
  }

  :global(.custom-scrollbar::-webkit-scrollbar-thumb) {
    background-color: rgba(var(--color-primary), 0.3);
    border-radius: 3px;
  }
</style>
