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

  let invitations = $state<any[]>([]);
  let inviteUsage = $state<any[]>([]);
  let inviterUsage = $state<any[]>([]);
  let suspendedInviters = $state<any[]>([]);
  let summary = $state({ totalJoined: 0, totalLeft: 0 });

  let loading = $state(false);
  let error = $state('');

  let searchQuery = $state('');
  let statusFilter = $state<'all' | InviteStatus>('all');
  let sortBy = $state<'createdAt' | 'uses' | 'joins' | 'retention'>('createdAt');
  let sortOrder = $state<'asc' | 'desc'>('desc');

  let suspendUserId = $state('');
  let suspendUserTag = $state('');
  let suspendReason = $state('');
  let suspendCascade = $state(false);


  const canModerate = $derived(
    !!dashboardStore.state.access?.canModerateContent
  );

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
  });

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
    } catch {
      toast.warning('Impossible de copier le lien.');
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

  <div class="space-y-8">
    {#if error}
      <div class="p-4 rounded-2xl bg-red-500/10 text-red-500 text-sm font-bold">{error}</div>
    {/if}

    <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
      <div class="premium-card p-6 rounded-3xl">
        <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Invitations</p>
        <p class="text-3xl font-black text-primary">{totalInvites}</p>
      </div>
      <div class="premium-card p-6 rounded-3xl">
        <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Suspendues</p>
        <p class="text-3xl font-black text-amber-500">{totalSuspended}</p>
      </div>
      <div class="premium-card p-6 rounded-3xl">
        <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Expirées</p>
        <p class="text-3xl font-black text-slate-500">{totalExpired}</p>
      </div>
      <div class="premium-card p-6 rounded-3xl">
        <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Total joins</p>
        <p class="text-3xl font-black text-emerald-500">{totalJoins}</p>
      </div>
      <div class="premium-card p-6 rounded-3xl">
        <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Rétention</p>
        <p class="text-3xl font-black text-cyan-500">{retentionRate}%</p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="premium-card p-6 rounded-3xl lg:col-span-2 space-y-4">
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-xl bg-primary/10 text-primary">
              <Papicon icon="Link" size={18} />
            </div>
            <div>
              <h3 class="text-lg font-black">Liste des invitations</h3>
              <p class="text-xs text-on-surface-variant/60">Recherche, statut, santé et actions rapides.</p>
            </div>
          </div>
          <div class="flex gap-3 flex-wrap">
            <select bind:value={statusFilter} class="px-3 py-2 rounded-xl bg-surface-container-high/40 text-xs font-bold border border-outline-variant/20">
              <option value="all">Tous</option>
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
              class="px-3 py-2 rounded-xl bg-surface-container-high/40 text-xs font-bold border border-outline-variant/20"
              onclick={() => (sortOrder = sortOrder === 'asc' ? 'desc' : 'asc')}
            >
              {sortOrder === 'asc' ? 'Asc' : 'Desc'}
            </button>
          </div>
        </div>

        <div class="flex gap-3">
          <FormInput
            placeholder="Rechercher un code ou un créateur"
            bind:value={searchQuery}
            className="w-full px-4 py-3 rounded-2xl bg-surface-container-high/30 border border-outline-variant/20 text-sm"
          />
        </div>

        <div class="space-y-3 max-h-[560px] overflow-y-auto custom-scrollbar pr-2">
          {#each filteredInvites as invite}
            <div class="p-4 rounded-3xl bg-surface-container-high/20 border border-outline-variant/10 hover:bg-surface-container-high/40 transition-all">
              <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div class="space-y-2">
                  <div class="flex items-center gap-2 flex-wrap">
                    <code class="text-sm font-black text-primary dark:text-blue-300 bg-primary/10 dark:bg-blue-500/15 px-3 py-1 rounded-xl">{invite.code}</code>
                    <span class="px-2 py-1 rounded-full text-[9px] font-black {getStatusClass(getInviteStatus(invite))}">
                      {getStatusLabel(getInviteStatus(invite))}
                    </span>
                    {#if invite.inviterSuspended}
                      <span class="px-2 py-1 rounded-full text-[9px] font-black bg-red-500/10 text-red-500">Créateur suspendu</span>
                    {/if}
                    {#if isDormant(invite)}
                      <span class="px-2 py-1 rounded-full text-[9px] font-black bg-slate-500/10 text-on-surface-variant/60">Dormant</span>
                    {/if}
                  </div>
                  <p class="text-xs text-on-surface-variant/60">
                    Créé par {invite.inviterTag || invite.inviterId || 'Inconnu'} • {formatDate(invite.createdAt)}
                  </p>
                  <p class="text-[11px] text-on-surface-variant/60">
                    Dernier join: {formatRelative(invite.lastJoinedAt)} • Rétention: {invite.retention}%
                  </p>
                </div>

                <div class="flex items-center gap-4 flex-wrap">
                  <div class="text-right">
                    <p class="text-xl font-black text-emerald-500">{invite.joinedCount}</p>
                    <p class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40">Joins</p>
                  </div>
                  <div class="text-right">
                    <p class="text-xl font-black text-orange-500">{invite.uses ?? 0}</p>
                    <p class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40">Uses</p>
                  </div>

                  <div class="flex gap-2">
                    <ActionButton label="Détails" icon="TrendingUp" size="sm" onClick={() => inviteDetailsModal.show(invite.code)} />
                    <ActionButton label="Copier" icon="Copy" size="sm" variant="muted" onClick={() => copyInvite(invite)} />
                    {#if canModerate}
                      <ActionButton
                        label={invite.isSuspended ? 'Restaurer' : 'Suspendre'}
                        icon={invite.isSuspended ? 'Play' : 'Pause'}
                        size="sm"
                        variant={invite.isSuspended ? 'success' : 'muted'}
                        onClick={() => toggleSuspend(invite)}
                      />
                      <ActionButton
                        label="Purger"
                        icon="Trash"
                        size="sm"
                        variant="danger"
                        onClick={() => purgeInvite(invite)}
                      />
                      <ActionButton
                        label="Supprimer"
                        icon="X"
                        size="sm"
                        variant="danger"
                        onClick={() => deleteInvite(invite)}
                      />
                    {/if}
                  </div>
                </div>
              </div>
            </div>
          {/each}

          {#if filteredInvites.length === 0 && !loading}
            <div class="text-center py-10 text-on-surface-variant/60">
              Aucune invitation ne correspond aux filtres.
            </div>
          {/if}
        </div>
      </div>

      <div class="space-y-6">
        <div class="premium-card p-6 rounded-3xl space-y-4">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
              <Papicon icon="Crown" size={18} />
            </div>
            <div>
              <h3 class="text-lg font-black">Top créateurs</h3>
              <p class="text-xs text-on-surface-variant/60">Classement par joins.</p>
            </div>
          </div>

          <div class="space-y-3">
            {#each topInviters as inviter}
              <div class="p-3 rounded-2xl bg-surface-container-high/20 border border-outline-variant/10 flex items-center justify-between">
                <div>
                  <p class="text-sm font-black text-on-surface">{inviter.inviterTag}</p>
                  <p class="text-[10px] text-on-surface-variant/50">Dernier join: {formatRelative(inviter.lastJoinedAt)}</p>
                </div>
                <span class="text-sm font-black text-emerald-500">{inviter.joinedCount}</span>
              </div>
            {/each}
            {#if topInviters.length === 0}
              <p class="text-xs text-on-surface-variant/60">Aucune donnée.</p>
            {/if}
          </div>
        </div>

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

          <div class="space-y-2">
            <FormInput
              placeholder="ID utilisateur"
              bind:value={suspendUserId}
              className="w-full px-3 py-2 rounded-xl bg-surface-container-high/30 border border-outline-variant/20 text-xs"
            />
            <FormInput
              placeholder="Tag (optionnel)"
              bind:value={suspendUserTag}
              className="w-full px-3 py-2 rounded-xl bg-surface-container-high/30 border border-outline-variant/20 text-xs"
            />
            <FormInput
              placeholder="Raison (optionnel)"
              bind:value={suspendReason}
              className="w-full px-3 py-2 rounded-xl bg-surface-container-high/30 border border-outline-variant/20 text-xs"
            />
            <label class="flex items-center gap-2 text-xs font-bold text-on-surface-variant/70">
              <input type="checkbox" bind:checked={suspendCascade} />
              Purge en cascade les membres invités
            </label>
            <ActionButton
              label="Suspendre"
              icon="Pause"
              variant="danger"
              size="md"
              onClick={createSuspension}
            />
          </div>
        </div>

        <div class="premium-card p-6 rounded-3xl space-y-4">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-xl bg-red-500/10 text-red-500">
              <Papicon icon="UserX" size={18} />
            </div>
            <div>
              <h3 class="text-lg font-black">Créateurs suspendus</h3>
              <p class="text-xs text-on-surface-variant/60">Gestion des suspensions globales.</p>
            </div>
          </div>

          <div class="space-y-3 max-h-[260px] overflow-y-auto custom-scrollbar pr-2">
            {#each suspendedInviters as inviter}
              <div class="p-3 rounded-2xl bg-surface-container-high/20 border border-outline-variant/10">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm font-black">{inviter.userTag || inviter.userId}</p>
                    <p class="text-[10px] text-on-surface-variant/50">{inviter.reason || 'Aucune raison'} • {formatDate(inviter.createdAt)}</p>
                  </div>
                  {#if canModerate}
                    <div class="flex gap-2">
                      <ActionButton label="Purger" icon="Trash" size="sm" variant="danger" onClick={() => purgeByInviter(inviter.userId)} />
                      <ActionButton label="Restaurer" icon="Play" size="sm" variant="success" onClick={() => restoreSuspended(inviter.userId)} />
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
            {#if suspendedInviters.length === 0}
              <p class="text-xs text-on-surface-variant/60">Aucun créateur suspendu.</p>
            {/if}
          </div>
        </div>
      </div>
    </div>
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
