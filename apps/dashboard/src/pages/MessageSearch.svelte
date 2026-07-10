<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { toast } from '../lib/stores/toast.svelte';
  import {
    searchMessages,
    fetchMessageLogChannels,
    fetchMessageLogStats,
    updateMessageLogConfig,
    deleteMessageLog,
    type MessageLogEntry,
  } from '../lib/api';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';

  const PAGE_SIZE = 50;

  let messages = $state<MessageLogEntry[]>([]);
  let total = $state(0);
  let offset = $state(0);
  let loading = $state(false);
  let loadingMore = $state(false);
  let hasSearched = $state(false);

  // Filters
  let query = $state('');
  let channelId = $state('');
  let authorId = $state('');
  let botFilter = $state<'all' | 'true' | 'false'>('all');
  let onlyAttachments = $state(false);
  let includeDeleted = $state(false);
  let order = $state<'desc' | 'asc'>('desc');
  let showFilters = $state(false);

  // Config / stats
  let channels = $state<{ channelId: string; channelName: string; count: number }[]>([]);
  let stats = $state<{
    total: number;
    enabled: boolean;
    retentionDays: number;
    ignoredChannels: string[];
    status: {
      status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
      error: string | null;
      scrapedChannelsCount: number;
      totalChannelsCount: number;
      scrapedMessagesCount: number;
      currentChannelName: string;
      startedAt: string;
      completedAt?: string;
    } | null;
  } | null>(null);
  let savingConfig = $state(false);
  let retentionInput = $state(90);
  let pendingDeleteId = $state<string | null>(null);

  const isAdmin = $derived(dashboardStore.state.access?.canManageSettings === true);

  // Logging only captures messages sent AFTER activation, so early on there is
  // little/no data. Surface this so users don't mistake it for a bug.
  const enabledButEmpty = $derived(stats?.enabled === true && stats.total === 0);
  const enabledLowData = $derived(stats?.enabled === true && stats.total > 0 && stats.total < 50);

  // Polling logic for retroactive backfill/indexing status
  let pollInterval: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (stats?.status?.status === 'IN_PROGRESS') {
      if (!pollInterval) {
        pollInterval = setInterval(async () => {
          const st = await fetchMessageLogStats();
          if (st) {
            stats = st as any;
            if (st.status?.status !== 'IN_PROGRESS') {
              if (pollInterval) {
                clearInterval(pollInterval);
                pollInterval = null;
              }
              await refreshMeta();
              await search(true);
            }
          }
        }, 4000);
      }
    } else {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    }
  });

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval);
  });

  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  function buildParams(currentOffset: number) {
    return {
      q: query.trim() || undefined,
      channelId: channelId || undefined,
      authorId: authorId.trim() || undefined,
      isBot: botFilter === 'all' ? undefined : (botFilter as 'true' | 'false'),
      hasAttachment: onlyAttachments ? ('true' as const) : undefined,
      includeDeleted: includeDeleted || undefined,
      order,
      limit: PAGE_SIZE,
      offset: currentOffset,
    };
  }

  async function search(reset = true) {
    if (reset) {
      loading = true;
      offset = 0;
    } else {
      loadingMore = true;
    }
    hasSearched = true;
    try {
      const res = await searchMessages(buildParams(reset ? 0 : offset));
      total = res.total;
      messages = reset ? res.messages : [...messages, ...res.messages];
    } catch {
      if (reset) messages = [];
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  function onQueryInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => search(true), 350);
  }

  async function loadMore() {
    offset += PAGE_SIZE;
    await search(false);
  }

  async function refreshMeta() {
    const [ch, st] = await Promise.all([fetchMessageLogChannels(), fetchMessageLogStats()]);
    channels = ch;
    stats = st;
    if (st) retentionInput = st.retentionDays;
  }

  async function toggleLogging(enabled: boolean) {
    savingConfig = true;
    try {
      const res = await updateMessageLogConfig({ enabled });
      if (res) {
        stats = stats ? {
          ...stats,
          enabled: res.enabled,
          retentionDays: res.retentionDays,
          status: (res as any).status ?? null
        } : null;
        if (enabled) {
          toast.success('Journalisation activée — l\'indexation rétroactive démarre en arrière-plan.');
        } else {
          toast.success('Journalisation désactivée.');
        }
      }
    } finally {
      savingConfig = false;
    }
  }

  async function saveRetention() {
    savingConfig = true;
    try {
      const res = await updateMessageLogConfig({ retentionDays: retentionInput });
      if (res && stats) stats = { ...stats, retentionDays: res.retentionDays };
    } finally {
      savingConfig = false;
    }
  }

  async function confirmDelete(id: string) {
    const ok = await deleteMessageLog(id);
    if (ok) {
      messages = messages.filter((m) => m.id !== id);
      total = Math.max(0, total - 1);
      pendingDeleteId = null;
    }
  }

  function resetFilters() {
    channelId = '';
    authorId = '';
    botFilter = 'all';
    onlyAttachments = false;
    includeDeleted = false;
    order = 'desc';
    search(true);
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  onMount(async () => {
    await refreshMeta();
    await search(true);
  });
</script>

<ModulePage
  title="Recherche de messages"
  description="Recherche globale dans tous les messages enregistrés par le bot"
  icon="search"
  featureKey=""
>
  {#snippet actions()}
    <RefreshButton onClick={() => { refreshMeta(); search(true); }} />
  {/snippet}

  {#snippet children()}
    <div class="flex flex-col gap-6">
      <!-- Logging config / status -->
      <div class="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-surface-container-low/60 border border-outline-variant/20 rounded-xl">
        <div class="flex items-center gap-3 flex-1">
          <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 {stats?.enabled ? 'bg-primary/10' : 'bg-surface-container'}">
            <Papicon icon="message" size={18} class={stats?.enabled ? 'text-primary' : 'text-on-surface-variant/50'} />
          </div>
          <div>
            <p class="text-sm font-semibold text-on-surface">
              Journalisation {stats?.enabled ? 'activée' : 'désactivée'}
            </p>
            <p class="text-xs text-on-surface-variant/60">
              {stats ? `${stats.total.toLocaleString('fr-FR')} message(s) enregistré(s)` : 'Chargement…'}
            </p>
          </div>
        </div>

        {#if isAdmin}
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <label for="retention" class="text-xs text-on-surface-variant/70">Rétention (jours)</label>
              <input
                id="retention"
                type="number"
                min="0"
                max="3650"
                bind:value={retentionInput}
                onchange={saveRetention}
                disabled={savingConfig}
                class="w-20 px-2 py-1.5 bg-surface-container border border-outline-variant/30 rounded-md text-sm text-on-surface focus:outline-none focus:border-primary/60"
              />
            </div>
            <ToggleSwitch
              checked={stats?.enabled ?? false}
              disabled={savingConfig}
              onToggle={toggleLogging}
              size="lg"
            />
          </div>
        {/if}
      </div>

      <!-- Delay-before-data notice: logging only captures messages sent after activation -->
      {#if stats?.status?.status === 'IN_PROGRESS'}
        <div class="flex items-start gap-3 p-4 bg-primary/10 border border-primary/20 rounded-xl">
          <div class="shrink-0 mt-1 text-primary">
            <div class="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full"></div>
          </div>
          <div class="text-sm">
            <p class="font-semibold text-on-surface">Indexation rétroactive de l'historique en cours</p>
            <p class="text-on-surface-variant/80 mt-0.5">
              Le bot récupère actuellement les anciens messages du serveur (dans la limite de {stats.retentionDays} jours de rétention). Les résultats s'enrichissent au fur et à mesure.
            </p>
            <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-surface-variant/60 font-medium">
              <span>Salon actuel : <strong>#{stats.status.currentChannelName || '...'}</strong></span>
              <span>Salons : <strong>{stats.status.scrapedChannelsCount} / {stats.status.totalChannelsCount}</strong></span>
              <span>Messages importés : <strong>{stats.status.scrapedMessagesCount.toLocaleString('fr-FR')}</strong></span>
            </div>
          </div>
        </div>
      {:else if stats?.status?.status === 'FAILED'}
        <div class="flex items-start gap-3 p-4 bg-error/10 border border-error/20 rounded-xl">
          <div class="shrink-0 mt-0.5 text-error">
            <Papicon icon="alert-circle" size={18} />
          </div>
          <div class="text-sm">
            <p class="font-semibold text-on-surface">L'indexation de l'historique a échoué</p>
            <p class="text-on-surface-variant/80 mt-0.5">
              Une erreur est survenue : {stats.status.error}. Les nouveaux messages continueront toutefois d'être enregistrés.
            </p>
          </div>
        </div>
      {:else if enabledButEmpty}
        <div class="flex items-start gap-3 p-4 bg-primary/10 border border-primary/20 rounded-xl">
          <div class="shrink-0 mt-0.5 text-primary">
            <Papicon icon="info" size={18} />
          </div>
          <div class="text-sm">
            <p class="font-semibold text-on-surface">La collecte des messages vient de démarrer</p>
            <p class="text-on-surface-variant/80 mt-0.5">
              Seuls les messages envoyés <strong>à partir de maintenant</strong> sont enregistrés — l'historique
              antérieur n'est pas disponible. Les résultats apparaîtront au fur et à mesure de l'activité du serveur,
              revenez un peu plus tard.
            </p>
          </div>
        </div>
      {:else if enabledLowData}
        <div class="flex items-start gap-3 p-3 bg-surface-container-low/60 border border-outline-variant/20 rounded-xl">
          <div class="shrink-0 mt-0.5 text-on-surface-variant/60">
            <Papicon icon="info" size={16} />
          </div>
          <p class="text-xs text-on-surface-variant/80">
            La journalisation est récente : peu de messages sont encore enregistrés. La base va s'enrichir avec l'activité du serveur.
          </p>
        </div>
      {/if}

      <!-- Search bar -->
      <div class="flex items-center gap-3">
        <div class="relative flex-1">
          <div class="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50">
            <Papicon icon="search" size={18} />
          </div>
          <input
            type="text"
            bind:value={query}
            oninput={onQueryInput}
            placeholder="Rechercher dans les messages…"
            class="w-full pl-10 pr-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/60 transition-colors"
          />
        </div>
        <button
          onclick={() => (showFilters = !showFilters)}
          class="flex items-center gap-2 px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 text-on-surface rounded-lg hover:bg-surface-container transition-colors text-sm font-medium"
        >
          <Papicon icon="filter" size={16} />
          Filtres
        </button>
      </div>

      <!-- Filters panel -->
      {#if showFilters}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-surface-container-low/40 border border-outline-variant/20 rounded-xl">
          <div class="flex flex-col gap-1.5">
            <label for="f-channel" class="text-xs font-medium text-on-surface-variant/70">Salon</label>
            <select
              id="f-channel"
              bind:value={channelId}
              onchange={() => search(true)}
              class="px-3 py-2 bg-surface-container border border-outline-variant/30 rounded-md text-sm text-on-surface focus:outline-none focus:border-primary/60"
            >
              <option value="">Tous les salons</option>
              {#each channels as c (c.channelId)}
                <option value={c.channelId}>#{c.channelName} ({c.count})</option>
              {/each}
            </select>
          </div>

          <div class="flex flex-col gap-1.5">
            <label for="f-author" class="text-xs font-medium text-on-surface-variant/70">ID auteur</label>
            <input
              id="f-author"
              type="text"
              bind:value={authorId}
              onchange={() => search(true)}
              placeholder="123456789012345678"
              class="px-3 py-2 bg-surface-container border border-outline-variant/30 rounded-md text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/60"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label for="f-bot" class="text-xs font-medium text-on-surface-variant/70">Type d'auteur</label>
            <select
              id="f-bot"
              bind:value={botFilter}
              onchange={() => search(true)}
              class="px-3 py-2 bg-surface-container border border-outline-variant/30 rounded-md text-sm text-on-surface focus:outline-none focus:border-primary/60"
            >
              <option value="all">Tous</option>
              <option value="false">Humains uniquement</option>
              <option value="true">Bots uniquement</option>
            </select>
          </div>

          <div class="flex flex-col gap-1.5">
            <label for="f-order" class="text-xs font-medium text-on-surface-variant/70">Tri</label>
            <select
              id="f-order"
              bind:value={order}
              onchange={() => search(true)}
              class="px-3 py-2 bg-surface-container border border-outline-variant/30 rounded-md text-sm text-on-surface focus:outline-none focus:border-primary/60"
            >
              <option value="desc">Plus récents d'abord</option>
              <option value="asc">Plus anciens d'abord</option>
            </select>
          </div>

          <label class="flex items-center gap-2 text-sm text-on-surface cursor-pointer self-end pb-2">
            <input type="checkbox" bind:checked={onlyAttachments} onchange={() => search(true)} class="accent-primary" />
            Avec pièces jointes
          </label>

          <label class="flex items-center gap-2 text-sm text-on-surface cursor-pointer self-end pb-2">
            <input type="checkbox" bind:checked={includeDeleted} onchange={() => search(true)} class="accent-primary" />
            Inclure les messages supprimés
          </label>

          <div class="sm:col-span-2 lg:col-span-3 flex justify-end">
            <button
              onclick={resetFilters}
              class="px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors"
            >Réinitialiser les filtres</button>
          </div>
        </div>
      {/if}

      <div class="flex items-center justify-between">
        <p class="text-sm text-on-surface-variant/70">{total.toLocaleString('fr-FR')} résultat(s)</p>
      </div>

      <!-- Results -->
      {#if loading}
        <div class="flex items-center justify-center py-16">
          <div class="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full"></div>
        </div>
      {:else if messages.length === 0}
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <div class="w-16 h-16 bg-surface-container-low rounded-2xl flex items-center justify-center mb-4">
            <Papicon icon="message" size={32} class="text-on-surface-variant/40" />
          </div>
          <h3 class="text-lg font-semibold text-on-surface mb-1">Aucun message</h3>
          <p class="text-sm text-on-surface-variant/60 max-w-sm">
            {#if !stats?.enabled}
              La journalisation des messages est désactivée. Activez-la pour commencer à enregistrer les messages.
            {:else if enabledButEmpty}
              La collecte vient de démarrer : les messages envoyés à partir de maintenant apparaîtront ici au fil de l'activité.
            {:else if hasSearched}
              Aucun message ne correspond à votre recherche.
            {:else}
              Les messages enregistrés apparaîtront ici.
            {/if}
          </p>
        </div>
      {:else}
        <div class="flex flex-col gap-2">
          {#each messages as m (m.id)}
            <div class="flex gap-3 p-4 bg-surface-container-low/60 border border-outline-variant/20 rounded-lg hover:border-outline-variant/40 transition-colors {m.deletedAt ? 'opacity-70' : ''}">
              {#if m.authorAvatar}
                <img src={m.authorAvatar} alt="" class="w-9 h-9 rounded-full shrink-0" />
              {:else}
                <div class="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center shrink-0">
                  <Papicon icon="user" size={16} class="text-on-surface-variant/50" />
                </div>
              {/if}

              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-semibold text-on-surface">{m.authorName}</span>
                  {#if m.isBot}
                    <span class="px-1.5 py-0.5 text-[10px] font-bold bg-primary/20 text-primary rounded">BOT</span>
                  {/if}
                  <span class="text-xs text-on-surface-variant/50">#{m.channelName}</span>
                  <span class="text-xs text-on-surface-variant/40">· {formatDate(m.createdAt)}</span>
                  {#if m.editedAt}
                    <span class="text-xs text-on-surface-variant/40">(modifié)</span>
                  {/if}
                  {#if m.deletedAt}
                    <span class="px-1.5 py-0.5 text-[10px] font-bold bg-error/20 text-error rounded">SUPPRIMÉ</span>
                  {/if}
                </div>

                {#if m.content}
                  <p class="text-sm text-on-surface-variant mt-1 whitespace-pre-wrap break-words">{m.content}</p>
                {/if}

                {#if m.attachments && m.attachments.length > 0}
                  <div class="flex flex-wrap gap-2 mt-2">
                    {#each m.attachments as att}
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noopener"
                        class="flex items-center gap-1.5 px-2 py-1 text-xs bg-surface-container border border-outline-variant/30 rounded-md text-primary hover:bg-surface-container-high transition-colors"
                      >
                        <Papicon icon="download" size={12} />
                        {att.name}
                      </a>
                    {/each}
                  </div>
                {/if}
              </div>

              {#if isAdmin}
                {#if pendingDeleteId === m.id}
                  <div class="flex items-center gap-2 shrink-0">
                    <button
                      onclick={() => confirmDelete(m.id)}
                      class="px-2.5 py-1 text-xs font-medium bg-error text-white rounded-md hover:bg-error/90 transition-colors"
                    >Supprimer</button>
                    <button
                      onclick={() => (pendingDeleteId = null)}
                      class="px-2.5 py-1 text-xs font-medium bg-surface-container text-on-surface rounded-md hover:bg-surface-container-high transition-colors"
                    >Annuler</button>
                  </div>
                {:else}
                  <button
                    onclick={() => (pendingDeleteId = m.id)}
                    class="flex items-center justify-center w-8 h-8 text-on-surface-variant hover:text-error hover:bg-error/10 rounded-md transition-colors shrink-0"
                    title="Supprimer de l'historique"
                    aria-label="Supprimer le message"
                  >
                    <Papicon icon="trash" size={15} />
                  </button>
                {/if}
              {/if}
            </div>
          {/each}
        </div>

        {#if messages.length < total}
          <div class="flex justify-center">
            <button
              onclick={loadMore}
              disabled={loadingMore}
              class="px-4 py-2 text-sm font-medium bg-surface-container-low border border-outline-variant/30 text-on-surface rounded-lg hover:bg-surface-container transition-colors disabled:opacity-50"
            >
              {loadingMore ? 'Chargement…' : 'Charger plus'}
            </button>
          </div>
        {/if}
      {/if}
    </div>
  {/snippet}
</ModulePage>
