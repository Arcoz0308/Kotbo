<script lang="ts">
  import { onMount } from 'svelte';
  import { API_BASE_URL } from '../lib/api';
  import { authStore } from '../lib/stores/auth.svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { toast } from '../lib/stores/toast.svelte';
  import Papicon from '../lib/components/Papicon.svelte';

  // ── Types ──────────────────────────────────────────────────────────────────
  interface Appeal {
    id: string; userId: string; userTag: string | null; avatar: string | null;
    data: Record<string, unknown>; status: string; banReason: string | null;
    infoRequest: string | null; infoResponse: string | null;
    decidedByTag: string | null; decisionReason: string | null; decidedAt: string | null;
    dmDelivered: boolean; createdAt: string;
  }
  interface AppealDetail {
    appeal: Appeal;
    sanctions: { id: string; type: string; status: string; reason: string; createdAt: string; moderatorTag: string | null }[];
    previousAppeals: { id: string; status: string; createdAt: string; decidedAt: string | null; decisionReason: string | null }[];
  }
  interface AppealConfig {
    enabled: boolean; formId: string | null; staffChannelId: string | null;
    inviteChannelId: string | null; cooldownDays: number;
    welcomeText: string | null; acceptMessage: string | null; denyMessage: string | null;
    form?: { id: string; name: string } | null;
  }
  interface BlacklistEntry { id: string; userId: string; reason: string | null; addedByTag: string | null; createdAt: string; }

  // ── State ──────────────────────────────────────────────────────────────────
  let tab = $state<'queue' | 'history' | 'config' | 'blacklist'>('queue');
  let appeals = $state<Appeal[]>([]);
  let loading = $state(true);
  let detail = $state<AppealDetail | null>(null);
  let detailLoading = $state(false);
  let actionReason = $state('');
  let actionInProgress = $state(false);
  let config = $state<AppealConfig | null>(null);
  let configSaving = $state(false);
  let forms = $state<{ id: string; name: string }[]>([]);
  let blacklist = $state<BlacklistEntry[]>([]);

  const channels = $derived((dashboardStore.state.discordChannels ?? []) as { id: string; name: string; type?: number }[]);
  const textChannels = $derived(channels.filter(c => c.type === undefined || c.type === 0 || c.type === 5));
  const queue = $derived(appeals.filter(a => a.status === 'PENDING' || a.status === 'NEEDS_INFO'));
  const history = $derived(appeals.filter(a => a.status !== 'PENDING' && a.status !== 'NEEDS_INFO'));
  const publicUrl = $derived(`${window.location.origin}/appeal/${authStore.selectedGuildId}`);

  const STATUS_META: Record<string, { label: string; classes: string }> = {
    PENDING: { label: 'En attente', classes: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
    NEEDS_INFO: { label: 'Attente d\'infos', classes: 'bg-blue-500/10 text-blue-500 border-blue-500/30' },
    ACCEPTED: { label: 'Accepté', classes: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' },
    DENIED: { label: 'Refusé', classes: 'bg-rose-500/10 text-rose-500 border-rose-500/30' },
    DENIED_PERMANENT: { label: 'Refus définitif', classes: 'bg-rose-900/20 text-rose-400 border-rose-900/40' },
  };

  // ── API ────────────────────────────────────────────────────────────────────
  const base = () => `${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/appeals`;
  const headers = () => ({ Authorization: `Bearer ${authStore.token}`, 'Content-Type': 'application/json' });

  async function loadAppeals() {
    loading = true;
    try {
      const res = await fetch(base(), { headers: headers() });
      if (res.ok) appeals = (await res.json()).appeals ?? [];
    } catch { /* ignore */ }
    loading = false;
  }

  async function loadConfig() {
    try {
      const [cfgRes, formsRes] = await Promise.all([
        fetch(`${base()}/config`, { headers: headers() }),
        fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/custom-forms`, { headers: headers() }),
      ]);
      if (cfgRes.ok) {
        config = (await cfgRes.json()).config ?? {
          enabled: false, formId: null, staffChannelId: null, inviteChannelId: null,
          cooldownDays: 30, welcomeText: null, acceptMessage: null, denyMessage: null,
        };
      }
      if (formsRes.ok) forms = ((await formsRes.json()).forms ?? []).map((f: { id: string; name: string }) => ({ id: f.id, name: f.name }));
    } catch { /* ignore */ }
  }

  async function loadBlacklist() {
    try {
      const res = await fetch(`${base()}/blacklist`, { headers: headers() });
      if (res.ok) blacklist = (await res.json()).entries ?? [];
    } catch { /* ignore */ }
  }

  async function openDetail(appealId: string) {
    if (detail?.appeal.id === appealId) { detail = null; return; }
    detailLoading = true;
    actionReason = '';
    try {
      const res = await fetch(`${base()}/${appealId}`, { headers: headers() });
      if (res.ok) detail = await res.json();
    } catch { /* ignore */ }
    detailLoading = false;
  }

  async function decide(decision: 'ACCEPTED' | 'DENIED' | 'DENIED_PERMANENT') {
    if (!detail) return;
    if (decision !== 'ACCEPTED' && !actionReason.trim()) {
      toast.error('Une raison est requise pour un refus');
      return;
    }
    if (decision === 'DENIED_PERMANENT' && !confirm('Refus définitif : ce membre ne pourra plus jamais faire appel. Confirmer ?')) return;
    actionInProgress = true;
    try {
      const res = await fetch(`${base()}/${detail.appeal.id}/decide`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ decision, reason: actionReason.trim() || undefined }),
      });
      if (res.ok) {
        toast.success(decision === 'ACCEPTED' ? 'Appel accepté — membre débanni et prévenu par DM' : 'Appel refusé — membre prévenu par DM');
        detail = null;
        await loadAppeals();
      } else {
        toast.error((await res.json()).error || 'Erreur');
      }
    } catch { toast.error('Erreur réseau'); }
    actionInProgress = false;
  }

  async function requestInfo() {
    if (!detail || !actionReason.trim()) {
      toast.error('Écris la question à poser au membre');
      return;
    }
    actionInProgress = true;
    try {
      const res = await fetch(`${base()}/${detail.appeal.id}/request-info`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ question: actionReason.trim() }),
      });
      if (res.ok) {
        toast.success('Demande d\'informations envoyée au membre');
        detail = null;
        await loadAppeals();
      } else {
        toast.error((await res.json()).error || 'Erreur');
      }
    } catch { toast.error('Erreur réseau'); }
    actionInProgress = false;
  }

  async function saveConfig(extra: Record<string, unknown> = {}) {
    if (!config) return;
    configSaving = true;
    try {
      const res = await fetch(`${base()}/config`, {
        method: 'PUT', headers: headers(),
        body: JSON.stringify({
          enabled: config.enabled,
          formId: config.formId,
          staffChannelId: config.staffChannelId,
          inviteChannelId: config.inviteChannelId,
          cooldownDays: config.cooldownDays,
          welcomeText: config.welcomeText,
          acceptMessage: config.acceptMessage,
          denyMessage: config.denyMessage,
          ...extra,
        }),
      });
      if (res.ok) {
        config = (await res.json()).config;
        toast.success('Configuration enregistrée');
        if (extra.createDefaultForm) await loadConfig();
      } else {
        toast.error((await res.json()).error || 'Erreur');
      }
    } catch { toast.error('Erreur réseau'); }
    configSaving = false;
  }

  async function removeFromBlacklist(userId: string) {
    try {
      const res = await fetch(`${base()}/blacklist/${userId}`, { method: 'DELETE', headers: headers() });
      if (res.ok) {
        toast.success('Retiré de la blacklist');
        await loadBlacklist();
      }
    } catch { /* ignore */ }
  }

  function copyPublicUrl() {
    navigator.clipboard.writeText(publicUrl);
    toast.success('URL copiée !');
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  onMount(async () => {
    await Promise.all([loadAppeals(), loadConfig(), loadBlacklist()]);
  });
</script>

<div class="p-6 max-w-6xl mx-auto space-y-6">

  <!-- Header -->
  <div class="flex flex-wrap items-center justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-on-surface flex items-center gap-3">
        <Papicon icon="gavel" size={26} /> Appels de bannissement
      </h1>
      <p class="text-sm text-on-surface-variant/60 mt-1">
        Les membres bannis peuvent demander leur débannissement via un formulaire public.
      </p>
    </div>
    <button onclick={copyPublicUrl}
      class="px-4 py-2 rounded-xl bg-surface-container text-xs font-bold flex items-center gap-2 hover:bg-surface-container-high transition-colors"
      title={publicUrl}>
      <Papicon icon="link" size={14} /> Copier le lien public
    </button>
  </div>

  <!-- Tabs -->
  <div class="flex gap-1 border-b border-outline-variant/20">
    {#each [
      { id: 'queue', label: `File d'attente (${queue.length})` },
      { id: 'history', label: 'Historique' },
      { id: 'config', label: 'Configuration' },
      { id: 'blacklist', label: `Blacklist (${blacklist.length})` },
    ] as t}
      <button onclick={() => { tab = t.id as typeof tab; detail = null; }}
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

  {:else if tab === 'queue' || tab === 'history'}
    {@const list = tab === 'queue' ? queue : history}
    {#if list.length === 0}
      <div class="text-center py-16 text-on-surface-variant/50">
        <div class="text-5xl mb-4">{tab === 'queue' ? '🎉' : '📭'}</div>
        <p class="text-sm">{tab === 'queue' ? 'Aucune demande en attente.' : 'Aucune demande traitée pour le moment.'}</p>
      </div>
    {:else}
      <div class="space-y-3">
        {#each list as appeal (appeal.id)}
          {@const meta = STATUS_META[appeal.status] ?? STATUS_META.PENDING}
          <div class="rounded-xl border border-outline-variant/20 bg-surface overflow-hidden">
            <button onclick={() => openDetail(appeal.id)}
              class="w-full p-4 flex items-center gap-4 hover:bg-surface-container/40 transition-colors text-left">
              {#if appeal.avatar}
                <img src={`https://cdn.discordapp.com/avatars/${appeal.userId}/${appeal.avatar}.png?size=64`} alt=""
                  class="w-10 h-10 rounded-full shrink-0" />
              {:else}
                <div class="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center font-bold text-sm shrink-0">
                  {(appeal.userTag || '?').charAt(0).toUpperCase()}
                </div>
              {/if}
              <div class="flex-1 min-w-0">
                <p class="font-semibold text-on-surface text-sm truncate">{appeal.userTag || appeal.userId}</p>
                <p class="text-xs text-on-surface-variant/60 mt-0.5 truncate">
                  {formatDate(appeal.createdAt)}
                  {#if appeal.banReason} · Ban : {appeal.banReason}{/if}
                </p>
              </div>
              <span class="px-2.5 py-1 rounded-full text-[11px] font-bold border shrink-0 {meta.classes}">{meta.label}</span>
              <Papicon icon={detail?.appeal.id === appeal.id ? 'expand_less' : 'expand_more'} size={18} />
            </button>

            {#if detail?.appeal.id === appeal.id}
              <div class="border-t border-outline-variant/10 p-5 space-y-5 bg-surface-container-low/30">
                {#if detailLoading}
                  <div class="flex justify-center py-6">
                    <div class="w-7 h-7 rounded-full border-3 border-primary/20 border-t-primary animate-spin"></div>
                  </div>
                {:else}
                  <!-- Réponses du formulaire -->
                  <div>
                    <p class="text-xs font-semibold uppercase tracking-widest text-on-surface-variant/50 mb-2">Réponses</p>
                    <div class="space-y-2">
                      {#each Object.entries(detail.appeal.data || {}) as [key, value]}
                        <div class="rounded-lg bg-surface border border-outline-variant/15 p-3">
                          <p class="text-[11px] font-semibold text-on-surface-variant/60">{key.replace(/^appeal_/, '').replace(/_/g, ' ')}</p>
                          <p class="text-sm text-on-surface mt-1 whitespace-pre-wrap break-words">{Array.isArray(value) ? value.join(', ') : String(value)}</p>
                        </div>
                      {/each}
                    </div>
                  </div>

                  {#if detail.appeal.infoRequest}
                    <div class="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3">
                      <p class="text-[11px] font-semibold text-blue-500">💬 Infos demandées</p>
                      <p class="text-sm text-on-surface mt-1">{detail.appeal.infoRequest}</p>
                      {#if detail.appeal.infoResponse}
                        <p class="text-[11px] font-semibold text-blue-500 mt-3">↩️ Réponse du membre</p>
                        <p class="text-sm text-on-surface mt-1 whitespace-pre-wrap">{detail.appeal.infoResponse}</p>
                      {:else}
                        <p class="text-xs text-on-surface-variant/50 mt-2 italic">En attente de la réponse du membre…</p>
                      {/if}
                    </div>
                  {/if}

                  <!-- Contexte -->
                  <div class="grid md:grid-cols-2 gap-4">
                    <div>
                      <p class="text-xs font-semibold uppercase tracking-widest text-on-surface-variant/50 mb-2">
                        Historique de sanctions ({detail.sanctions.length})
                      </p>
                      {#if detail.sanctions.length === 0}
                        <p class="text-xs text-on-surface-variant/50 italic">Aucune sanction enregistrée.</p>
                      {:else}
                        <div class="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {#each detail.sanctions as s}
                            <div class="rounded-lg bg-surface border border-outline-variant/15 px-3 py-2 text-xs">
                              <span class="font-bold">{s.type}</span>
                              <span class="text-on-surface-variant/50"> · {formatDate(s.createdAt)}{s.moderatorTag ? ` · ${s.moderatorTag}` : ''}</span>
                              <p class="text-on-surface-variant/80 mt-0.5 truncate">{s.reason}</p>
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </div>
                    <div>
                      <p class="text-xs font-semibold uppercase tracking-widest text-on-surface-variant/50 mb-2">
                        Appels précédents ({detail.previousAppeals.length})
                      </p>
                      {#if detail.previousAppeals.length === 0}
                        <p class="text-xs text-on-surface-variant/50 italic">Premier appel de ce membre.</p>
                      {:else}
                        <div class="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {#each detail.previousAppeals as pa}
                            {@const pmeta = STATUS_META[pa.status] ?? STATUS_META.PENDING}
                            <div class="rounded-lg bg-surface border border-outline-variant/15 px-3 py-2 text-xs flex items-center justify-between gap-2">
                              <span class="text-on-surface-variant/70">{formatDate(pa.createdAt)}</span>
                              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border {pmeta.classes}">{pmeta.label}</span>
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  </div>

                  <!-- Décision -->
                  {#if appeal.status === 'PENDING' || appeal.status === 'NEEDS_INFO'}
                    <div class="space-y-3 pt-2 border-t border-outline-variant/10">
                      <textarea bind:value={actionReason} rows="2"
                        placeholder="Raison du refus / note d'acceptation / question au membre…"
                        class="w-full bg-surface rounded-xl px-4 py-3 text-sm outline-none border border-outline-variant/20 focus:border-primary transition-colors resize-y"></textarea>
                      <div class="flex flex-wrap gap-2">
                        <button onclick={() => decide('ACCEPTED')} disabled={actionInProgress}
                          class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5">
                          ✅ Accepter et débannir
                        </button>
                        <button onclick={() => decide('DENIED')} disabled={actionInProgress}
                          class="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5">
                          ❌ Refuser
                        </button>
                        <button onclick={() => decide('DENIED_PERMANENT')} disabled={actionInProgress}
                          class="px-4 py-2 rounded-xl bg-rose-950 hover:bg-rose-900 text-rose-200 text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5">
                          ⛔ Refus définitif
                        </button>
                        <button onclick={requestInfo} disabled={actionInProgress}
                          class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5">
                          💬 Demander plus d'infos
                        </button>
                      </div>
                      <p class="text-[11px] text-on-surface-variant/50">
                        Accepter = unban Discord + sanction résolue + DM avec invitation. Refuser = DM avec la raison + cooldown de {config?.cooldownDays ?? 30} jours.
                      </p>
                    </div>
                  {:else}
                    <div class="rounded-lg bg-surface border border-outline-variant/15 p-3 text-sm">
                      <p class="font-semibold text-on-surface">
                        Décision : {STATUS_META[detail.appeal.status]?.label}
                        {#if detail.appeal.decidedByTag}<span class="text-on-surface-variant/60 font-normal"> par {detail.appeal.decidedByTag}</span>{/if}
                        {#if detail.appeal.decidedAt}<span class="text-on-surface-variant/60 font-normal"> le {formatDate(detail.appeal.decidedAt)}</span>{/if}
                      </p>
                      {#if detail.appeal.decisionReason}
                        <p class="text-on-surface-variant/80 mt-1">{detail.appeal.decisionReason}</p>
                      {/if}
                      <p class="text-[11px] mt-2 {detail.appeal.dmDelivered ? 'text-emerald-500' : 'text-amber-500'}">
                        {detail.appeal.dmDelivered ? '✓ DM de verdict envoyé au membre' : '⚠ DM non délivré (DM fermés) — le membre verra le verdict sur la page publique'}
                      </p>
                    </div>
                  {/if}
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

  {:else if tab === 'config'}
    {#if config}
      <div class="max-w-2xl space-y-5">
        <label class="flex items-center justify-between rounded-xl border border-outline-variant/20 bg-surface p-4 cursor-pointer">
          <div>
            <p class="font-semibold text-on-surface text-sm">Activer les appels de bannissement</p>
            <p class="text-xs text-on-surface-variant/60 mt-0.5">Rend la page publique accessible : {publicUrl}</p>
          </div>
          <input type="checkbox" bind:checked={config.enabled} class="accent-primary w-5 h-5" />
        </label>

        <div class="rounded-xl border border-outline-variant/20 bg-surface p-4 space-y-4">
          <div>
            <p class="text-xs font-semibold text-on-surface-variant/60 mb-1.5">Formulaire d'appel</p>
            <div class="flex gap-2">
              <select bind:value={config.formId}
                class="flex-1 bg-surface-container rounded-lg px-3 py-2.5 text-sm outline-none border border-outline-variant/20">
                <option value={null}>— Aucun —</option>
                {#each forms as f}
                  <option value={f.id}>{f.name}</option>
                {/each}
              </select>
              {#if !config.formId}
                <button onclick={() => saveConfig({ createDefaultForm: true })} disabled={configSaving}
                  class="px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors shrink-0">
                  Créer le formulaire par défaut
                </button>
              {/if}
            </div>
            <p class="text-[11px] text-on-surface-variant/50 mt-1.5">
              Les questions (et le thème visuel) se modifient dans Formulaires → Builder.
            </p>
          </div>

          <div class="grid sm:grid-cols-2 gap-4">
            <div>
              <p class="text-xs font-semibold text-on-surface-variant/60 mb-1.5">Salon staff (embed + boutons)</p>
              <select bind:value={config.staffChannelId}
                class="w-full bg-surface-container rounded-lg px-3 py-2.5 text-sm outline-none border border-outline-variant/20">
                <option value={null}>— Aucun —</option>
                {#each textChannels as c}
                  <option value={c.id}># {c.name}</option>
                {/each}
              </select>
            </div>
            <div>
              <p class="text-xs font-semibold text-on-surface-variant/60 mb-1.5">Salon pour l'invitation de retour</p>
              <select bind:value={config.inviteChannelId}
                class="w-full bg-surface-container rounded-lg px-3 py-2.5 text-sm outline-none border border-outline-variant/20">
                <option value={null}>— Automatique —</option>
                {#each textChannels as c}
                  <option value={c.id}># {c.name}</option>
                {/each}
              </select>
            </div>
          </div>

          <div>
            <p class="text-xs font-semibold text-on-surface-variant/60 mb-1.5">
              Cooldown après refus : {config.cooldownDays} jour{config.cooldownDays > 1 ? 's' : ''}
            </p>
            <input type="range" min="0" max="180" bind:value={config.cooldownDays} class="w-full accent-primary" />
          </div>

          <div>
            <p class="text-xs font-semibold text-on-surface-variant/60 mb-1.5">Texte d'accueil de la page publique</p>
            <textarea bind:value={config.welcomeText} rows="2"
              placeholder="Ex : Sois honnête et détaillé, chaque demande est lue par un humain."
              class="w-full bg-surface-container rounded-lg px-3 py-2.5 text-sm outline-none border border-outline-variant/20 resize-none"></textarea>
          </div>
          <div class="grid sm:grid-cols-2 gap-4">
            <div>
              <p class="text-xs font-semibold text-on-surface-variant/60 mb-1.5">DM si accepté</p>
              <textarea bind:value={config.acceptMessage} rows="3"
                placeholder={'Défaut : "Ta demande sur {server} a été acceptée… {invite}"'}
                class="w-full bg-surface-container rounded-lg px-3 py-2.5 text-xs outline-none border border-outline-variant/20 resize-none"></textarea>
            </div>
            <div>
              <p class="text-xs font-semibold text-on-surface-variant/60 mb-1.5">DM si refusé</p>
              <textarea bind:value={config.denyMessage} rows="3"
                placeholder={'Défaut : "Ta demande sur {server} a été refusée. Raison : {reason}"'}
                class="w-full bg-surface-container rounded-lg px-3 py-2.5 text-xs outline-none border border-outline-variant/20 resize-none"></textarea>
            </div>
          </div>
          <p class="text-[11px] text-on-surface-variant/50">
            Variables : {'{server}'}, {'{reason}'}, {'{invite}'} (accepté uniquement)
          </p>
        </div>

        <div class="flex justify-end">
          <button onclick={() => saveConfig()} disabled={configSaving}
            class="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60">
            {configSaving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    {/if}

  {:else if tab === 'blacklist'}
    {#if blacklist.length === 0}
      <div class="text-center py-16 text-on-surface-variant/50">
        <div class="text-5xl mb-4">🈳</div>
        <p class="text-sm">Aucun membre blacklisté des appels.</p>
      </div>
    {:else}
      <div class="space-y-2 max-w-2xl">
        {#each blacklist as entry (entry.id)}
          <div class="rounded-xl border border-outline-variant/20 bg-surface p-4 flex items-center gap-4">
            <div class="flex-1 min-w-0">
              <p class="font-semibold text-on-surface text-sm">ID : {entry.userId}</p>
              <p class="text-xs text-on-surface-variant/60 mt-0.5 truncate">
                {entry.reason || 'Sans raison'} · ajouté {entry.addedByTag ? `par ${entry.addedByTag}` : ''} le {formatDate(entry.createdAt)}
              </p>
            </div>
            <button onclick={() => removeFromBlacklist(entry.userId)}
              class="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-500 text-xs font-bold hover:bg-rose-500/20 transition-colors shrink-0">
              Retirer
            </button>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
