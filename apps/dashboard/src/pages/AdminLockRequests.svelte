<script lang="ts">
  import { onMount } from 'svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import { fetchAdminLockRequests, decideAdminLockRequest as decideRequestApi } from '../lib/api';

  interface AdminLockRequest {
    id: string;
    type: 'ROLE_CREATE' | 'ROLE_PERMISSION_EDIT' | 'MEMBER_ROLE_GRANT';
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
    targetRoleId: string | null;
    targetRoleName: string | null;
    targetMemberId: string | null;
    requestedPermissionBits: string;
    requestedByUserId: string;
    requestedByTag: string | null;
    requestedVia: string;
    requestReason: string | null;
    decidedByTag: string | null;
    decisionReason: string | null;
    decidedAt: string | null;
    createdAt: string;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let tab = $state<'queue' | 'history'>('queue');
  let requests = $state<AdminLockRequest[]>([]);
  let loading = $state(true);
  let openId = $state<string | null>(null);
  let actionReason = $state('');
  let actionInProgress = $state(false);

  const queue = $derived(requests.filter(r => r.status === 'PENDING'));
  const history = $derived(requests.filter(r => r.status !== 'PENDING'));

  const TYPE_LABELS: Record<string, string> = {
    ROLE_CREATE: 'Création de rôle',
    ROLE_PERMISSION_EDIT: 'Modification de permissions',
    MEMBER_ROLE_GRANT: 'Attribution de rôle à un membre',
  };

  const STATUS_META: Record<string, { label: string; classes: string }> = {
    PENDING: { label: 'En attente', classes: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
    APPROVED: { label: 'Approuvée', classes: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' },
    REJECTED: { label: 'Rejetée', classes: 'bg-rose-500/10 text-rose-500 border-rose-500/30' },
    EXPIRED: { label: 'Expirée', classes: 'bg-rose-900/20 text-rose-400 border-rose-900/40' },
  };

  // ── API ────────────────────────────────────────────────────────────────────
  async function loadRequests() {
    loading = true;
    try {
      const res = await fetchAdminLockRequests();
      requests = res?.requests ?? [];
    } catch { /* toast déjà affiché par dashboardRequest */ }
    loading = false;
  }

  function toggleOpen(id: string) {
    openId = openId === id ? null : id;
    actionReason = '';
  }

  async function decide(request: AdminLockRequest, decision: 'APPROVED' | 'REJECTED') {
    if (decision === 'REJECTED' && !actionReason.trim() && !confirm('Rejeter cette demande sans indiquer de raison ?')) return;
    actionInProgress = true;
    try {
      await decideRequestApi(request.id, { decision, reason: actionReason.trim() || undefined });
      openId = null;
      await loadRequests();
    } catch { /* toast déjà affiché */ }
    actionInProgress = false;
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function requesterLabel(r: AdminLockRequest): string {
    if (r.requestedByUserId === 'mcp') return 'Agent MCP (sans identité Discord)';
    return r.requestedByTag ? `${r.requestedByTag} (${r.requestedByUserId})` : r.requestedByUserId;
  }

  function targetLabel(r: AdminLockRequest): string {
    if (r.type === 'MEMBER_ROLE_GRANT') return `Rôle « ${r.targetRoleName ?? r.targetRoleId} » → membre ${r.targetMemberId}`;
    if (r.type === 'ROLE_PERMISSION_EDIT') return `Rôle « ${r.targetRoleName ?? r.targetRoleId} »`;
    return `Nouveau rôle « ${r.targetRoleName ?? '?'} »`;
  }

  onMount(async () => {
    await loadRequests();
  });
</script>

<div class="p-6 max-w-6xl mx-auto space-y-6">

  <!-- Header -->
  <div class="flex flex-wrap items-center justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-on-surface flex items-center gap-3">
        <Papicon icon="lock" size={26} /> Admin Permission Lock
      </h1>
      <p class="text-sm text-on-surface-variant/60 mt-1">
        Demandes d'octroi de la permission ADMINISTRATOR bloquées en attente d'approbation. Configuration disponible dans Modération auto.
      </p>
    </div>
  </div>

  <!-- Tabs -->
  <div class="flex gap-1 border-b border-outline-variant/20">
    {#each [
      { id: 'queue', label: `File d'attente (${queue.length})` },
      { id: 'history', label: 'Historique' },
    ] as t}
      <button onclick={() => { tab = t.id as typeof tab; openId = null; }}
        class="px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px
          {tab === t.id ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant/60 hover:text-on-surface'}">
        {t.label}
      </button>
    {/each}
  </div>

  {#if loading}
    <div class="flex justify-center py-16">
      <div class="w-10 h-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin"></div>
    </div>
  {:else}
    {@const list = tab === 'queue' ? queue : history}
    {#if list.length === 0}
      <div class="text-center py-16 text-on-surface-variant/50 flex flex-col items-center justify-center">
        <div class="mb-4 text-on-surface-variant/30">
          <Papicon icon={tab === 'queue' ? 'check' : 'inbox'} size={48} />
        </div>
        <p class="text-sm">{tab === 'queue' ? 'Aucune demande en attente.' : 'Aucune demande traitée pour le moment.'}</p>
      </div>
    {:else}
      <div class="space-y-3">
        {#each list as request (request.id)}
          {@const meta = STATUS_META[request.status] ?? STATUS_META.PENDING}
          <div class="rounded-xl border border-outline-variant/20 bg-surface overflow-hidden">
            <button onclick={() => toggleOpen(request.id)}
              class="w-full p-4 flex items-center gap-4 hover:bg-surface-container/40 transition-colors text-left">
              <div class="w-10 h-10 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                <Papicon icon="lock" size={18} />
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-semibold text-on-surface text-sm truncate">{TYPE_LABELS[request.type] ?? request.type} — {targetLabel(request)}</p>
                <p class="text-xs text-on-surface-variant/60 mt-0.5 truncate">
                  {formatDate(request.createdAt)} · Demandé par {requesterLabel(request)} · via {request.requestedVia}
                </p>
              </div>
              <span class="px-2.5 py-1 rounded-full text-[11px] font-bold border shrink-0 {meta.classes}">{meta.label}</span>
              <Papicon icon={openId === request.id ? 'expand_less' : 'expand_more'} size={18} />
            </button>

            {#if openId === request.id}
              <div class="border-t border-outline-variant/10 p-5 space-y-4 bg-surface-container-low/30">
                <div class="rounded-lg bg-surface border border-outline-variant/15 p-3 text-sm space-y-1">
                  <p><span class="font-semibold text-on-surface-variant/60">Type :</span> {TYPE_LABELS[request.type] ?? request.type}</p>
                  <p><span class="font-semibold text-on-surface-variant/60">Cible :</span> {targetLabel(request)}</p>
                  <p><span class="font-semibold text-on-surface-variant/60">Demandé par :</span> {requesterLabel(request)}</p>
                  <p><span class="font-semibold text-on-surface-variant/60">Via :</span> {request.requestedVia}</p>
                  {#if request.requestReason}
                    <p><span class="font-semibold text-on-surface-variant/60">Raison :</span> {request.requestReason}</p>
                  {/if}
                </div>

                {#if request.status === 'PENDING'}
                  <div class="space-y-3 pt-2 border-t border-outline-variant/10">
                    <textarea bind:value={actionReason} rows="2"
                      placeholder="Raison du rejet / note d'approbation (optionnel)…"
                      class="w-full bg-surface rounded-xl px-4 py-3 text-sm outline-none border border-outline-variant/20 focus:border-primary transition-colors resize-y"></textarea>
                    <div class="flex flex-wrap gap-2">
                      <button onclick={() => decide(request, 'APPROVED')} disabled={actionInProgress}
                        class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5">
                        <Papicon icon="check" size={14} /> Approuver
                      </button>
                      <button onclick={() => decide(request, 'REJECTED')} disabled={actionInProgress}
                        class="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5">
                        <Papicon icon="x" size={14} /> Rejeter
                      </button>
                    </div>
                    <p class="text-[11px] text-on-surface-variant/50">
                      Seul le propriétaire du serveur ou un membre d'un rôle « sécurité » configuré peut traiter cette demande.
                    </p>
                  </div>
                {:else}
                  <div class="rounded-lg bg-surface border border-outline-variant/15 p-3 text-sm">
                    <p class="font-semibold text-on-surface">
                      Décision : {STATUS_META[request.status]?.label}
                      {#if request.decidedByTag}<span class="text-on-surface-variant/60 font-normal"> par {request.decidedByTag}</span>{/if}
                      {#if request.decidedAt}<span class="text-on-surface-variant/60 font-normal"> le {formatDate(request.decidedAt)}</span>{/if}
                    </p>
                    {#if request.decisionReason}
                      <p class="text-on-surface-variant/80 mt-1">{request.decisionReason}</p>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
