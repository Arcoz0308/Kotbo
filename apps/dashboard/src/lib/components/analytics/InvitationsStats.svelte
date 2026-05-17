<script lang="ts">
  import Papicon from '../Papicon.svelte';
  import { inviteDetailsModal } from '../../stores/inviteDetailsModal.svelte';
  import Chart from '../charts/Chart.svelte';

  let { invitesData } = $props<{ 
    invitesData: any;
  }>();

  let showAllInvites = $state(false);
  const invites = $derived(invitesData || []);
  
  // Svelte 5: Avoid in-place mutation of derived state in template
  const sortedInvites = $derived([...invites].sort((a: any, b: any) => (b.uses || 0) - (a.uses || 0)));
  const displayedInvites = $derived(showAllInvites ? sortedInvites : sortedInvites.slice(0, 5));

  let inviteModalOpen = $state(false);
  let selectedInvite = $state<any>(null);

  // Statistiques des invites
  const totalUses = $derived(invites.reduce((sum: number, inv: any) => sum + (inv.uses || 0), 0));
  const activeInvites = $derived(invites.filter((inv: any) => inv.uses > 0).length);
  const averageUses = $derived(invites.length > 0 ? Math.round(totalUses / invites.length) : 0);

  function chartForInvite(inv: any) {
    const labels = (inv?.trend?.labels) ? inv.trend.labels.map((d: string) => {
      const parts = d.split('-');
      return `${parts[2]}/${parts[1]}`; // DD/MM for small sparkline
    }) : [];

    const counts = inv?.trend?.counts ?? [];

    return {
      data: {
        labels,
        datasets: [
          {
            label: 'Joins',
            data: counts,
            borderColor: 'var(--color-emerald-500)',
            backgroundColor: 'transparent',
            tension: 0.4,
            pointRadius: 0
          }
        ]
      },
      options: {
        scales: {
          x: { display: false },
          y: { display: false }
        },
        plugins: { tooltip: { enabled: true } },
        elements: { line: { borderWidth: 2 } }
      }
    };
  }
</script>

<div class="space-y-6">
  <!-- Invites Overview -->
  <div class="premium-card p-8 rounded-[2.5rem] space-y-8">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <div class="bg-purple-500/10 p-3 rounded-2xl text-purple-500">
          <Papicon icon="MailOpen" size={24} />
        </div>
        <div>
          <h3 class="text-xl font-black text-on-surface">Codes d'Invitation</h3>
          <p class="text-xs font-bold text-on-surface-variant/40">Analyse complète des invites</p>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-4 gap-4">
      <div class="bg-surface-container-high/30 p-6 rounded-2xl border border-outline-variant/5">
        <p class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-2">Total Codes</p>
        <p class="text-3xl font-black text-purple-500">{invites.length}</p>
      </div>
      <div class="bg-surface-container-high/30 p-6 rounded-2xl border border-outline-variant/5">
        <p class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-2">Codes Actifs</p>
        <p class="text-3xl font-black text-cyan-500">{activeInvites}</p>
      </div>
      <div class="bg-surface-container-high/30 p-6 rounded-2xl border border-outline-variant/5">
        <p class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-2">Utilisations Totales</p>
        <p class="text-3xl font-black text-emerald-500">{totalUses}</p>
      </div>
      <div class="bg-surface-container-high/30 p-6 rounded-2xl border border-outline-variant/5">
        <p class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-2">Moy. par Code</p>
        <p class="text-3xl font-black text-orange-500">{averageUses}</p>
      </div>
    </div>
  </div>

  <!-- Top Invites -->
  <div class="premium-card p-8 rounded-[2.5rem] space-y-6">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <div class="bg-emerald-500/10 p-3 rounded-2xl text-emerald-500">
          <Papicon icon="Fire" size={24} />
        </div>
        <div>
          <h3 class="text-xl font-black text-on-surface">Codes Populaires</h3>
          <p class="text-xs font-bold text-on-surface-variant/40">Codes avec le plus d'utilisations</p>
        </div>
      </div>
      <button 
        onclick={() => showAllInvites = !showAllInvites}
        class="px-4 py-2 rounded-xl bg-surface-container-high/40 hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors flex items-center gap-2"
      >
        <Papicon icon={showAllInvites ? 'ArrowsIn' : 'ArrowsOut'} size={18} />
        {showAllInvites ? 'Réduire' : 'Voir plus'}
      </button>
    </div>

    <div class="overflow-x-auto {showAllInvites ? 'max-h-125 overflow-y-auto custom-scrollbar pr-2' : ''}">
      <div class="space-y-2">
        {#each displayedInvites as invite}
          <div class="p-4 rounded-2xl bg-surface-container-high/20 border border-outline-variant/5 hover:border-primary/20 transition-all">
              <div class="flex items-center justify-between gap-4" role="button" tabindex="0" onclick={() => { selectedInvite = invite; inviteModalOpen = true }} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (selectedInvite = invite, inviteModalOpen = true)}>
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-2">
                  <button
                    class="text-sm font-black text-primary bg-primary/10 px-3 py-1 rounded-lg hover:bg-primary/20 transition-colors"
                    onclick={(event) => {
                      event.stopPropagation();
                      inviteDetailsModal.show(invite.code);
                    }}
                    title="Ouvrir la vue Invitations"
                  >
                    {invite.code}
                  </button>
                  {#if invite.uses > 0}
                    <span class="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-[9px] font-black">
                      {invite.uses} utilisations
                    </span>
                  {/if}
                </div>
                <p class="text-xs text-on-surface-variant/60">
                  Créé par: {invite.createdBy || 'Inconnu'} • Expire: {invite.expiresAt ? new Date(invite.expiresAt).toLocaleDateString('fr-FR') : 'Jamais'}
                </p>
              </div>
              <div class="flex items-center gap-4">
                <div class="w-40">
                  <Chart data={chartForInvite(invite).data} options={chartForInvite(invite).options} height={60} />
                </div>
                <div class="text-right">
                  <p class="text-2xl font-black text-emerald-500">{invite.uses || 0}</p>
                  <p class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40">utilisations</p>
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>

    {#if invites.length === 0}
      <div class="text-center py-10">
        <Papicon icon="MailOpen" size={40} class="text-on-surface-variant/20 mx-auto mb-3" />
        <p class="text-on-surface-variant/60 font-bold text-sm">Aucun code d'invitation</p>
      </div>
    {/if}
  </div>

  <!-- Inactive Codes -->
  {#if invites.filter((inv: any) => !inv.uses).length > 0}
    <div class="premium-card p-8 rounded-[2.5rem] space-y-6">
      <div class="flex items-center gap-4">
        <div class="bg-orange-500/10 p-3 rounded-2xl text-orange-500">
          <Papicon icon="Warning" size={24} />
        </div>
        <div>
          <h3 class="text-xl font-black text-on-surface">Codes Inactifs</h3>
          <p class="text-xs font-bold text-on-surface-variant/40">{invites.filter((inv: any) => !inv.uses).length} codes non utilisés</p>
        </div>
      </div>

      <div class="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
        {#each invites.filter((inv: any) => !inv.uses) as invite}
          <div class="p-3 rounded-xl bg-surface-container-high/20 border border-outline-variant/5 flex items-center justify-between">
            <code class="text-xs font-bold text-on-surface-variant/60">{invite.code}</code>
            <span class="text-[9px] text-on-surface-variant/40">Créé: {new Date(invite.createdAt).toLocaleDateString('fr-FR')}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if inviteModalOpen && selectedInvite}
    <div class="fixed inset-0 z-100 flex items-center justify-center p-4">
      <div 
        class="absolute inset-0 bg-black/60 backdrop-blur-sm" 
        onclick={() => { inviteModalOpen = false; selectedInvite = null }}
        onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (inviteModalOpen = false, selectedInvite = null)}
        role="button"
        tabindex="-1"
        aria-label="Fermer le modal"
      ></div>

      <div class="relative w-full max-w-xl modal-panel modal-panel-lg">
        <div class="p-6 border-b border-outline-variant/30 flex items-center justify-between">
          <div>
            <h3 class="text-2xl font-black">Détails du code: {selectedInvite.code}</h3>
            <p class="text-sm text-on-surface-variant">Créé par: {selectedInvite.createdBy || 'Inconnu'}</p>
          </div>
          <button onclick={() => { inviteModalOpen = false; selectedInvite = null }} class="px-3 py-2 rounded-xl text-sm font-bold">Fermer</button>
        </div>

        <div class="p-6 space-y-6">
          <div class="w-full h-64">
            <Chart data={{ labels: (selectedInvite.trend?.labels ?? []).map((d: string) => { const parts = d.split('-'); return `${parts[2]}/${parts[1]}/${parts[0]}` }), datasets: [{ label: 'Arrivées', data: selectedInvite.trend?.counts ?? [], borderColor: 'var(--color-emerald-500)', backgroundColor: 'transparent', tension: 0.3 }] }} options={{ plugins: { tooltip: { enabled: true } }, scales: { x: { ticks: { color: 'var(--on-surface)' } }, y: { ticks: { color: 'var(--on-surface)' } } } }} height={240} />
          </div>

          <div class="grid grid-cols-3 gap-4">
            <div class="bg-surface-container-high/30 p-4 rounded-2xl border border-outline-variant/5 text-center">
              <p class="text-xs text-on-surface-variant uppercase font-black">Total arrivées</p>
              <p class="text-2xl font-black text-emerald-500">{selectedInvite.trend?.totalJoined ?? 0}</p>
            </div>
            <div class="bg-surface-container-high/30 p-4 rounded-2xl border border-outline-variant/5 text-center">
              <p class="text-xs text-on-surface-variant uppercase font-black">Utilisations</p>
              <p class="text-2xl font-black text-primary">{selectedInvite.uses ?? 0}</p>
            </div>
            <div class="bg-surface-container-high/30 p-4 rounded-2xl border border-outline-variant/5 text-center">
              <p class="text-xs text-on-surface-variant uppercase font-black">Max utilisations</p>
              <p class="text-2xl font-black text-cyan-500">{selectedInvite.maxUses ?? '∞'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    {/if}

  </div>

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
