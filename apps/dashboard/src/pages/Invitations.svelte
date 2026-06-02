<script lang="ts">
  import { onMount } from 'svelte';
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
    toggleInvitationSuspension,
    deleteInvitation,
    purgeInvitationMembers,
    suspendInviter,
    removeSuspendedInviter,
    purgeInviterMembers,
  } from '../lib/api';
  import { toast } from '../lib/stores/toast.svelte';

  type InviteStatus = 'active' | 'suspended' | 'deleted' | 'expired';
  type Tab = 'invites' | 'top' | 'suspensions';

  let invitations = $state<any[]>([]);
  let inviteUsage = $state<any[]>([]);
  let inviterUsage = $state<any[]>([]);
  let suspendedInviters = $state<any[]>([]);
  let summary = $state({ totalJoined: 0, totalLeft: 0 });

  let loading = $state(false);
  let error = $state('');

  let activeTab = $state<Tab>('invites');
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


  const canModerate = $derived(
    !!dashboardStore.state.access?.canModerateContent
  );

  const tabs = $derived([
    { id: 'invites' as Tab, label: 'Invitations', icon: 'MailOpen', count: totalInvites },
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
        joinedCount: entry._count?._all ?? 0,
        leftCount: entry._count?.leftAt ?? 0,
        lastJoinedAt: entry._max?.joinedAt ?? null,
      }))
      .sort((a, b) => b.joinedCount - a.joinedCount)
      .slice(0, 6);
  });

  const totalInvites = $derived(invitations.length);
  const totalSuspended = $derived(invitations.filter((inv) => inv.isSuspended).length);
  const totalDeleted = $derived(invitations.filter((inv) => inv.isDeleted).length);
  const totalExpired = $derived(invitations.filter((inv) => inv.expiresAt && new Date(inv.expiresAt).getTime() < Date.now()).length);
  const totalJoins = $derived(summary.totalJoined || 0);
  const totalLeft = $derived(summary.totalLeft || 0);
  const retentionRate = $derived(totalJoins > 0 ? Math.round(((totalJoins - totalLeft) / totalJoins) * 100) : 0);


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
    const confirmPurge = confirm(`Purger les membres invités via ${invite.code} ?`);
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
    const confirmDelete = confirm(`Supprimer définitivement l'invitation ${invite.code} ?`);
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
    const confirmPurge = confirm('Purger en cascade les membres invités par ce créateur ?');
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
  description="Analysez les invitations, suspendez les codes et purgez en cascade les arrivées liées."
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
      <div class="p-4 rounded-2xl bg-red-500/10 text-red-500 text-sm font-bold">{error}</div>
    {/if}

    <!-- Stats compactes -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
      {#if loading}
        {#each Array(5) as _}
          <div class="premium-card p-4 rounded-2xl animate-pulse">
            <div class="h-3 w-16 bg-surface-container-high/50 rounded mb-2"></div>
            <div class="h-8 w-12 bg-surface-container-high/50 rounded"></div>
          </div>
        {/each}
      {:else}
        <div class="premium-card p-4 rounded-2xl">
          <p class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/50">Invitations</p>
          <p class="text-2xl font-black text-primary">{totalInvites}</p>
        </div>
        <div class="premium-card p-4 rounded-2xl">
          <p class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/50">Suspendues</p>
          <p class="text-2xl font-black text-amber-500">{totalSuspended}</p>
        </div>
        <div class="premium-card p-4 rounded-2xl">
          <p class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/50">Expirées</p>
          <p class="text-2xl font-black text-slate-500">{totalExpired}</p>
        </div>
        <div class="premium-card p-4 rounded-2xl">
          <p class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/50">Total joins</p>
          <p class="text-2xl font-black text-emerald-500">{totalJoins}</p>
        </div>
        <div class="premium-card p-4 rounded-2xl">
          <p class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/50">Rétention</p>
          <p class="text-2xl font-black text-cyan-500">{retentionRate}%</p>
        </div>
      {/if}
    </div>

    <!-- Onglets -->
    <div class="flex gap-2 border-b border-outline-variant/20 pb-2">
      {#each tabs as tab}
        <button
          class="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all {activeTab === tab.id
            ? 'bg-primary/10 text-primary'
            : 'bg-surface-container-high/30 text-on-surface-variant/70 hover:bg-surface-container-high/50'}"
          onclick={() => activeTab = tab.id}
        >
          <Papicon icon={tab.icon} size={16} />
          <span>{tab.label}</span>
          <span class="px-1.5 py-0.5 rounded-full text-[10px] font-black {activeTab === tab.id
            ? 'bg-primary/20 text-primary'
            : 'bg-surface-container-high/50 text-on-surface-variant/50'}">{tab.count}</span>
        </button>
      {/each}
    </div>

    <!-- Contenu des onglets -->
    {#if activeTab === 'invites'}
      <div class="premium-card p-6 rounded-3xl space-y-4">
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
                <tr class="text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50 border-b border-outline-variant/10">
                  <th class="pb-3 pr-4">Code</th>
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
                      <code class="text-xs font-black text-primary dark:text-blue-300 bg-primary/10 dark:bg-blue-500/15 px-2 py-1 rounded-lg">{invite.code}</code>
                    </td>
                    <td class="py-3 pr-4">
                      <div class="flex flex-col">
                        <span class="font-bold text-on-surface">{invite.inviterTag || invite.inviterId || 'Inconnu'}</span>
                        <span class="text-[10px] text-on-surface-variant/50">{formatDate(invite.createdAt)}</span>
                      </div>
                    </td>
                    <td class="py-3 pr-4">
                      <div class="flex gap-1 flex-wrap">
                        <span class="px-2 py-0.5 rounded-full text-[9px] font-black {getStatusClass(status)}">
                          {getStatusLabel(status)}
                        </span>
                        {#if invite.inviterSuspended}
                          <span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-red-500/10 text-red-500">Créateur suspendu</span>
                        {/if}
                        {#if isDormant(invite)}
                          <span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-slate-500/10 text-on-surface-variant/60">Dormant</span>
                        {/if}
                      </div>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="font-black text-emerald-500">{invite.joinedCount}</span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="font-black text-orange-500">{invite.uses ?? 0}</span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="font-black {invite.retention >= 70 ? 'text-emerald-500' : invite.retention >= 40 ? 'text-amber-500' : 'text-red-500'}">{invite.retention}%</span>
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
                          <div class="absolute right-0 top-full mt-1 z-[9999] min-w-[160px] bg-surface-container rounded-xl shadow-xl border border-outline-variant/20 overflow-hidden">
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
    {:else if activeTab === 'top'}
      <div class="premium-card p-6 rounded-3xl space-y-4">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
            <Papicon icon="Crown" size={18} />
          </div>
          <div>
            <h3 class="text-lg font-black">Top créateurs</h3>
            <p class="text-xs text-on-surface-variant/60">Classement par nombre de joins.</p>
          </div>
        </div>

        <div class="space-y-2">
          {#if loading}
            {#each Array(6) as _, index}
              <div class="p-4 rounded-2xl bg-surface-container-high/20 border border-outline-variant/10 flex items-center justify-between animate-pulse">
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
              {@const avatarUrl = `https://cdn.discordapp.com/embed/avatars/${(inviter.inviterId?.slice(-4) || '0000') % 5}.png`}
              <div class="p-4 rounded-2xl bg-surface-container-high/20 border border-outline-variant/10 flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="relative">
                    <img
                      src={avatarUrl}
                      alt={inviter.inviterTag}
                      class="w-10 h-10 rounded-full object-cover"
                      loading="lazy"
                    />
                    <span class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full {rank === 1 ? 'bg-yellow-500' : rank === 2 ? 'bg-gray-400' : rank === 3 ? 'bg-amber-600' : 'bg-surface-container-high'} text-[9px] font-black flex items-center justify-center border-2 border-surface-container">
                      {rank}
                    </span>
                  </div>
                  <div>
                    <p class="text-sm font-black text-on-surface">{inviter.inviterTag}</p>
                    <p class="text-[10px] text-on-surface-variant/50">Dernier join: {formatRelative(inviter.lastJoinedAt)}</p>
                  </div>
                </div>
                <span class="text-lg font-black text-emerald-500">{inviter.joinedCount}</span>
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
        <div class="premium-card p-6 rounded-3xl space-y-4">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <Papicon icon="UserMinus" size={18} />
            </div>
            <div>
              <h3 class="text-lg font-black">Suspendre un créateur</h3>
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
        <div class="premium-card p-6 rounded-3xl space-y-4">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-xl bg-red-500/10 text-red-500">
              <Papicon icon="UserX" size={18} />
            </div>
            <div>
              <h3 class="text-lg font-black">Créateurs suspendus</h3>
              <p class="text-xs text-on-surface-variant/60">Gestion des suspensions actives.</p>
            </div>
          </div>

          <div class="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
            {#if loading}
              {#each Array(4) as _}
                <div class="p-4 rounded-2xl bg-surface-container-high/20 border border-outline-variant/10 animate-pulse">
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
                <div class="p-4 rounded-2xl bg-surface-container-high/20 border border-outline-variant/10">
                  <div class="flex items-start justify-between gap-3">
                    <div class="flex-1">
                      <p class="text-sm font-black text-on-surface">{inviter.userTag || inviter.userId}</p>
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
    backdrop-filter: blur(24px);
    border: 1px solid rgba(var(--color-outline-variant), 0.1);
    transition: all 0.4s cubic-bezier(0.2, 1, 0.3, 1);
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
