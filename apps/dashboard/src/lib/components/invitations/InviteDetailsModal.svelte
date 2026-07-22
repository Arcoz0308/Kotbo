<script lang="ts">
  import { onMount } from 'svelte';
  import { portal } from '../../actions/portal';
  import { router } from 'tinro';
  import Papicon from '../Papicon.svelte';
  import Chart from '../charts/Chart.svelte';
  import ActionButton from '../ActionButton.svelte';
  import { inviteDetailsModal } from '../../stores/inviteDetailsModal.svelte';
  import { dashboardStore } from '../../stores/dashboard.svelte';
  import { toast } from '../../stores/toast.svelte';
  import { confirmDialog } from '../../stores/confirmDialog.svelte';
  import {
    fetchInvitationDetails,
    toggleInvitationSuspension,
    purgeInvitationMembers,
    purgeInviterMembers,
    deleteInvitation
  } from '../../api';

  let details = $state<any>(null);
  let loading = $state(false);
  let error = $state('');
  let days = $state(30);

  const isOpen = $derived(inviteDetailsModal.open);
  const inviteCode = $derived(inviteDetailsModal.code);
  const canModerate = $derived(!!dashboardStore.state.access?.canModerateContent);

  $effect(() => {
    if (!isOpen || !inviteCode) return;
    void loadDetails();
  });

  $effect(() => {
    if (isOpen) return;
    details = null;
    error = '';
    loading = false;
  });

  onMount(() => {
    if (isOpen && inviteCode) {
      void loadDetails();
    }
  });

  async function loadDetails() {
    if (!inviteCode) return;
    loading = true;
    error = '';
    try {
      const daysValue = Number(days) || 30;
      details = await fetchInvitationDetails(inviteCode, { days: daysValue });
    } catch (err: any) {
      error = err?.message || 'Erreur lors du chargement des détails.';
      details = null;
    } finally {
      loading = false;
    }
  }

  function closeModal() {
    inviteDetailsModal.close();
  }

  function formatDate(value: string | null | undefined) {
    if (!value) return 'Jamais';
    return new Date(value).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function formatDateTime(value: string | null | undefined) {
    if (!value) return 'Inconnu';
    return new Date(value).toLocaleString('fr-FR');
  }

  async function toggleSuspend() {
    if (!details?.invite) return;
    try {
      await toggleInvitationSuspension(details.invite.code, !details.invite.isSuspended);
      toast.success(details.invite.isSuspended ? 'Invitation restaurée.' : 'Invitation suspendue.');
      await loadDetails();
    } catch (err: any) {
      toast.error(err?.message || 'Erreur lors de la modification.');
    }
  }

  async function purgeInvite() {
    if (!details?.invite) return;
    const ok = await confirmDialog.danger(`Purger les membres invités via ${details.invite.code} ?`, '', 'Purger');
    if (!ok) return;
    try {
      const result = await purgeInvitationMembers(details.invite.code);
      toast.success(`Purge terminée (${result?.purgedCount ?? 0} exclus).`);
      await loadDetails();
    } catch (err: any) {
      toast.error(err?.message || 'Erreur lors de la purge.');
    }
  }

  async function purgeInviter() {
    const inviterId = details?.invite?.inviterId;
    if (!inviterId) return;
    const ok = await confirmDialog.danger('Purger en cascade ?', 'Tous les membres invités par ce créateur seront purgés.', 'Purger');
    if (!ok) return;
    try {
      const result = await purgeInviterMembers(inviterId);
      toast.success(`Purge cascade terminée (${result?.purgedCount ?? 0} exclus).`);
      await loadDetails();
    } catch (err: any) {
      toast.error(err?.message || 'Erreur lors de la purge cascade.');
    }
  }

  async function deleteInvite() {
    if (!details?.invite) return;
    const ok = await confirmDialog.danger(`Supprimer l'invitation ${details.invite.code} ?`, 'Cette suppression est définitive.');
    if (!ok) return;
    try {
      await deleteInvitation(details.invite.code);
      toast.success('Invitation supprimée.');
      closeModal();
    } catch (err: any) {
      toast.error(err?.message || 'Erreur lors de la suppression.');
    }
  }

  function copyInvite() {
    if (!details?.invite?.code) return;
    const link = `https://discord.gg/${details.invite.code}`;
    navigator.clipboard.writeText(link)
      .then(() => toast.success('Lien copié.'))
      .catch(() => toast.warning('Impossible de copier le lien.'));
  }

  function openMember(userId: string) {
    router.goto(`/members/${userId}`);
  }

  const trendData = $derived.by(() => {
    const trend = details?.trend;
    if (!trend) return null;
    const labels = (trend.labels || []).map((dateKey: string) => {
      const parts = dateKey.split('-');
      return `${parts[2]}/${parts[1]}`;
    });

    return {
      data: {
        labels,
        datasets: [
          {
            label: 'Arrivees',
            data: trend.counts || [],
            borderColor: 'var(--color-emerald-500)',
            backgroundColor: 'transparent',
            tension: 0.35,
            pointRadius: 0,
            borderWidth: 3
          }
        ]
      },
      options: {
        scales: {
          x: { display: true, grid: { display: false } },
          y: { display: true, beginAtZero: true }
        },
        plugins: { legend: { display: false } },
        maintainAspectRatio: false
      }
    };
  });
</script>

{#if isOpen}
  <div
    use:portal
    class="modal-backdrop"
    role="button"
    aria-label="Fermer la vue invitation"
    tabindex="0"
    onclick={(e) => e.currentTarget === e.target && closeModal()}
    onkeydown={(e) => {
      if (e.key === 'Escape') closeModal();
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        closeModal();
      }
    }}
  >
    <div class="modal-panel modal-panel-xl space-y-0 p-0 font-body">
      <div class="p-6 border-b border-outline-variant/30 flex items-center justify-between">
        <div>
          <h3 class="text-2xl font-semibold">Invitation {inviteCode}</h3>
          <p class="text-sm text-on-surface-variant">Vue modération centralisée</p>
        </div>
        <button
          type="button"
          onclick={closeModal}
          class="h-10 w-10 flex items-center justify-center rounded-xl bg-surface-container-high/60 hover:bg-surface-container-high transition-colors"
        >
          <Papicon icon="X" size={18} />
        </button>
      </div>

      <div class="p-6 space-y-6">
        {#if loading}
          <div class="flex items-center justify-center py-12 gap-3 text-on-surface-variant/60">
            <div class="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
            <span class="text-sm font-bold">Chargement des détails...</span>
          </div>
        {:else if error}
          <div class="p-4 rounded-lg bg-red-500/10 text-red-500 text-sm font-bold">{error}</div>
        {:else if details}
          <!-- Tendance des joins -->
          <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div class="lg:col-span-3 premium-card p-5 rounded-xl space-y-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="p-2 rounded-xl bg-primary/10 text-primary">
                    <Papicon icon="TrendingUp" size={18} />
                  </div>
                  <div>
                    <h4 class="text-sm font-semibold uppercase tracking-widest text-on-surface-variant/60">TENDANCE DES JOINS</h4>
                    <p class="text-xs text-on-surface-variant/40">Évolution sur la période sélectionnée</p>
                  </div>
                </div>
                <select bind:value={days} onchange={loadDetails} class="px-3 py-2 rounded-xl bg-surface-container-high/40 text-xs font-bold border border-outline-variant/20">
                  <option value="7">7 jours</option>
                  <option value="30">30 jours</option>
                  <option value="90">90 jours</option>
                </select>
              </div>
              <div class="h-56">
                {#if trendData}
                  <Chart data={trendData.data} options={trendData.options} type="line" height={200} />
                {:else}
                  <div class="flex items-center justify-center h-full text-on-surface-variant/60 text-sm">
                    Aucune donnée disponible
                  </div>
                {/if}
              </div>
            </div>

            <div class="premium-card p-5 rounded-xl space-y-4">
              <div class="grid grid-cols-1 gap-4">
                <div>
                  <p class="text-xs font-medium text-on-surface-variant/50">JOINS</p>
                  <p class="text-lg font-semibold text-emerald-500">{details.trend?.totalJoined ?? 0}</p>
                </div>
                <div>
                  <p class="text-xs font-medium text-on-surface-variant/50">DEPARTS</p>
                  <p class="text-lg font-semibold text-orange-500">{details.trend?.totalLeft ?? 0}</p>
                </div>
                <div>
                  <p class="text-xs font-medium text-on-surface-variant/50">RESTANTS</p>
                  <p class="text-lg font-semibold text-cyan-500">{details.trend?.totalStayed ?? 0}</p>
                </div>
                <div class="pt-2 border-t border-outline-variant/10">
                  <p class="text-xs font-medium text-on-surface-variant/50">EXPIRE</p>
                  <p class="text-sm font-bold text-on-surface-variant/70">{details.invite?.expiresAt ? formatDate(details.invite.expiresAt) : 'Jamais'}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Meta, Créateur, Actions -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div class="premium-card p-5 rounded-xl space-y-4">
              <div class="flex items-center gap-3">
                <div class="p-2 rounded-xl bg-surface-container-high/40 text-on-surface-variant">
                  <Papicon icon="Info" size={18} />
                </div>
                <h4 class="text-sm font-semibold">META</h4>
              </div>
              <div class="space-y-2">
                <div class="flex justify-between text-xs">
                  <span class="text-on-surface-variant/60">Créée le</span>
                  <span class="font-bold text-on-surface">{formatDate(details.invite?.createdAt)}</span>
                </div>
                <div class="flex justify-between text-xs">
                  <span class="text-on-surface-variant/60">Uses</span>
                  <span class="font-bold text-on-surface">{details.invite?.uses ?? 0}</span>
                </div>
                <div class="flex justify-between text-xs">
                  <span class="text-on-surface-variant/60">Max</span>
                  <span class="font-bold text-on-surface">{details.invite?.maxUses ?? '∞'}</span>
                </div>
                <div class="flex justify-between text-xs">
                  <span class="text-on-surface-variant/60">Temporaire</span>
                  <span class="font-bold {details.invite?.isTemporary ? 'text-amber-500' : 'text-on-surface-variant/70'}">{details.invite?.isTemporary ? 'Oui' : 'Non'}</span>
                </div>
                <div class="flex justify-between text-xs">
                  <span class="text-on-surface-variant/60">Suspendue</span>
                  <span class="font-bold {details.invite?.isSuspended ? 'text-amber-500' : 'text-on-surface-variant/70'}">{details.invite?.isSuspended ? 'Oui' : 'Non'}</span>
                </div>
                <div class="flex justify-between text-xs">
                  <span class="text-on-surface-variant/60">Supprimée</span>
                  <span class="font-bold {details.invite?.isDeleted ? 'text-red-500' : 'text-on-surface-variant/70'}">{details.invite?.isDeleted ? 'Oui' : 'Non'}</span>
                </div>
              </div>
            </div>

            <div class="premium-card p-5 rounded-xl space-y-4">
              <div class="flex items-center gap-3">
                <div class="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                  <Papicon icon="User" size={18} />
                </div>
                <h4 class="text-sm font-semibold">CRÉATEUR</h4>
              </div>
              <div class="space-y-2">
                <div class="flex justify-between text-xs">
                  <span class="text-on-surface-variant/60">Tag</span>
                  <span class="font-bold text-on-surface">{details.invite?.inviterTag || 'Inconnu'}</span>
                </div>
                <div class="flex justify-between text-xs">
                  <span class="text-on-surface-variant/60">ID</span>
                  <span class="font-bold text-on-surface font-mono text-xs">{details.invite?.inviterId || '—'}</span>
                </div>
              </div>
              {#if canModerate && details.invite?.inviterId}
                <div class="mt-2">
                  <ActionButton label="PURGER EN CASCADE" icon="Trash" size="md" variant="danger" onClick={purgeInviter} />
                </div>
              {/if}
            </div>

            <div class="premium-card p-5 rounded-xl space-y-4">
              <div class="flex items-center gap-3">
                <div class="p-2 rounded-xl bg-primary/10 text-primary">
                  <Papicon icon="Settings" size={18} />
                </div>
                <h4 class="text-sm font-semibold">ACTIONS</h4>
              </div>
              <div class="space-y-2">
                <ActionButton label="COPIER LIEN" icon="Copy" size="md" variant="muted" onClick={copyInvite} />
                {#if canModerate}
                  <ActionButton
                    label={details.invite?.isSuspended ? 'RESTAURER' : 'SUSPENDRE'}
                    icon={details.invite?.isSuspended ? 'Play' : 'Pause'}
                    size="md"
                    variant={details.invite?.isSuspended ? 'success' : 'muted'}
                    onClick={toggleSuspend}
                  />
                  <ActionButton label="PURGER" icon="Trash" size="md" variant="danger" onClick={purgeInvite} />
                  <ActionButton label="SUPPRIMER" icon="X" size="md" variant="danger" onClick={deleteInvite} />
                {/if}
              </div>
            </div>
          </div>

          <!-- Personnes invitées -->
          <div class="premium-card p-5 rounded-xl space-y-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="p-2 rounded-xl bg-purple-500/10 text-purple-500">
                  <Papicon icon="Users" size={18} />
                </div>
                <div>
                  <h4 class="text-sm font-semibold">PERSONNES INVITÉES</h4>
                  <p class="text-xs text-on-surface-variant/60">Cliquez pour ouvrir la fiche membre</p>
                </div>
              </div>
              <span class="px-3 py-1 rounded-full text-xs font-semibold bg-surface-container-high/40 text-on-surface-variant/70">{details.joins?.length ?? 0} entrées</span>
            </div>

            <div class="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
              {#each details.joins as join}
                <button
                  class="w-full flex items-center justify-between p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/10 hover:bg-surface-container-high/40 transition-all text-left group"
                  onclick={() => openMember(join.userId)}
                >
                  <div class="flex items-center gap-4">
                    <img src={join.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'} alt="" class="w-10 h-10 rounded-xl object-cover" />
                    <div>
                      <p class="text-sm font-semibold text-on-surface group-hover:text-primary transition-colors">{join.userTag}</p>
                      <p class="text-[10px] text-on-surface-variant/50 font-mono">{join.userId} • {formatDateTime(join.joinedAt)}</p>
                    </div>
                  </div>
                  <div class="text-right">
                    <p class="text-xs font-medium text-on-surface-variant/40">Statut</p>
                    <span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold {join.leftAt ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}">
                      {join.leftAt ? 'Parti' : 'Présent'}
                    </span>
                  </div>
                </button>
              {/each}
              {#if (details.joins?.length ?? 0) === 0}
                <div class="text-center py-8 text-on-surface-variant/60 text-sm">
                  Aucune personne invitée pour le moment
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

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
