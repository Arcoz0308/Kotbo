<script lang="ts">
  import { dashboardStore } from "../lib/stores/dashboard.svelte";
  import {
    forceSendContent,
    markContentError,
    translateContentDescription,
    translateContentTitle,
  } from "../lib/api";
  import { refreshDashboardOnMount } from "../lib/dashboardLifecycle";
  import FilterChips from "../lib/components/FilterChips.svelte";
  import MetricCard from "../lib/components/MetricCard.svelte";

  let { initialFilter = "À valider" } = $props();

  const statusMeta = {
    planifie: {
      label: "À valider",
      tone: "amber",
      badgeClass:
        "bg-amber-500/10 text-amber-700 border border-amber-500/20 shadow-sm shadow-amber-500/5",
      dotClass: "bg-amber-500 animate-pulse",
      accentClass: "border-amber-500/25",
    },
    envoye: {
      label: "Publié",
      tone: "emerald",
      badgeClass:
        "bg-emerald-500/10 text-emerald-700 border border-emerald-500/20",
      dotClass: "bg-emerald-500",
      accentClass: "border-emerald-500/25",
    },
    erreur: {
      label: "Rejeté",
      tone: "rose",
      badgeClass: "bg-rose-500/10 text-rose-700 border border-rose-500/20",
      dotClass: "bg-rose-500",
      accentClass: "border-rose-500/25",
    },
  };

  const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function formatDateTime(value) {
    return dateTimeFormatter.format(new Date(value));
  }

  function getStatusMeta(status) {
    return statusMeta[status] || statusMeta.erreur;
  }

  function normalizeText(value) {
    return (value || "").toString().toLowerCase();
  }

  refreshDashboardOnMount();

  let filter = $state(initialFilter);
  let search = $state("");
  let sortMode = $state("schedule-desc");
  let pendingActionById = $state({});
  let bulkTranslationInProgress = $state(false);
  let contentViewModeById = $state({});
  let actionNotice = $state({ type: "", message: "" });
  let noticeTimeoutId = null;

  function showActionNotice(type, message) {
    actionNotice = { type, message };
    if (noticeTimeoutId) clearTimeout(noticeTimeoutId);
    noticeTimeoutId = setTimeout(() => {
      actionNotice = { type: "", message: "" };
      noticeTimeoutId = null;
    }, 2600);
  }

  function removeContentItemOptimistically(id) {
    const index = dashboardStore.state.contentItems.findIndex((item) => item.id === id);
    if (index === -1) return null;

    const snapshot = {
      item: dashboardStore.state.contentItems[index],
      index,
    };

    dashboardStore.state.contentItems = dashboardStore.state.contentItems.filter(
      (item) => item.id !== id,
    );

    return snapshot;
  }

  function restoreContentItem(snapshot) {
    if (!snapshot) return;
    if (dashboardStore.state.contentItems.some((item) => item.id === snapshot.item.id)) return;

    const next = [...dashboardStore.state.contentItems];
    const insertAt = Math.min(snapshot.index, next.length);
    next.splice(insertAt, 0, snapshot.item);
    dashboardStore.state.contentItems = next;
  }

  function hasTranslation(item) {
    return (item.titleOriginal && item.titleOriginal !== item.title) ||
      (item.excerptOriginal && item.excerptOriginal !== item.excerpt);
  }

  function isViewingOriginal(item) {
    return contentViewModeById[item.id] === 'original';
  }

  function toggleContentView(item) {
    const nextMode = isViewingOriginal(item) ? 'translated' : 'original';
    contentViewModeById = { ...contentViewModeById, [item.id]: nextMode };
  }

  function getDisplayTitle(item) {
    return isViewingOriginal(item) ? (item.titleOriginal || item.title) : item.title;
  }

  function getDisplayExcerpt(item) {
    return isViewingOriginal(item) ? (item.excerptOriginal || item.excerpt) : item.excerpt;
  }

  function needsTitleTranslation(item) {
    return !item.titleOriginal || item.titleOriginal === item.title;
  }

  function needsExcerptTranslation(item) {
    return !item.excerptOriginal || item.excerptOriginal === item.excerpt;
  }

  const filterOptions = ["Tous", "À valider", "Publiés", "Rejetés", "Filtrées"];

  const contentStats = $derived({
    total: dashboardStore.state.contentItems.length,
    pending: dashboardStore.state.contentItems.filter(
      (item) => item.status === "planifie",
    ).length,
    published: dashboardStore.state.contentItems.filter(
      (item) => item.status === "envoye",
    ).length,
    rejected: dashboardStore.state.contentItems.filter(
      (item) => item.status === "erreur",
    ).length,
    filtered: dashboardStore.state.contentItems.filter(
      (item) => item.filteredOut,
    ).length,
  });

  const filteredContent = $derived(
    [...dashboardStore.state.contentItems]
      .filter((item) => {
        if (filter === "À valider" && item.status !== "planifie") return false;
        if (filter === "Publiés" && item.status !== "envoye") return false;
        if (filter === "Rejetés" && item.status !== "erreur") return false;
        if (filter === "Filtrées" && !item.filteredOut) return false;

        const query = normalizeText(search).trim();
        if (!query) return true;

        return [item.title, item.excerpt, item.source, item.author]
          .map(normalizeText)
          .some((field) => field.includes(query));
      })
      .sort((left, right) => {
        const leftDate = new Date(left.scheduleAt).getTime();
        const rightDate = new Date(right.scheduleAt).getTime();

        if (sortMode === "schedule-asc") return leftDate - rightDate;
        return rightDate - leftDate;
      }),
  );

  async function handleForceSend(id) {
    if (pendingActionById[id]) return;
    pendingActionById[id] = "publish";
    const removedSnapshot = removeContentItemOptimistically(id);
    const item = removedSnapshot?.item;
    showActionNotice(
      "success",
      item?.filteredOut
        ? "News filtrée publiée manuellement."
        : "News validée et retirée de la file.",
    );

    try {
      const ok = await forceSendContent(id);
      if (ok) {
        dashboardStore.refresh();
      } else {
        restoreContentItem(removedSnapshot);
        showActionNotice("error", "Échec de publication: la news a été restaurée.");
      }
    } catch {
      restoreContentItem(removedSnapshot);
      showActionNotice("error", "Échec de publication: la news a été restaurée.");
    } finally {
      pendingActionById[id] = null;
    }
  }

  async function handleMarkError(id) {
    if (pendingActionById[id]) return;
    pendingActionById[id] = "reject";
    const removedSnapshot = removeContentItemOptimistically(id);
    showActionNotice("success", "News refusée et retirée de la file.");

    try {
      const ok = await markContentError(id);
      if (ok) {
        dashboardStore.refresh();
      } else {
        restoreContentItem(removedSnapshot);
        showActionNotice("error", "Échec du refus: la news a été restaurée.");
      }
    } catch {
      restoreContentItem(removedSnapshot);
      showActionNotice("error", "Échec du refus: la news a été restaurée.");
    } finally {
      pendingActionById[id] = null;
    }
  }

  async function handleTranslate(id) {
    if (pendingActionById[id] || bulkTranslationInProgress) return;

    await translateItemInChain(id);
  }

  async function translateItemInChain(id, options = { silentErrorNotice: false }) {
    const silentErrorNotice = !!options?.silentErrorNotice;
    if (pendingActionById[id]) return false;

    const initialItem = dashboardStore.state.contentItems.find((item) => item.id === id);
    if (!initialItem) return false;

    const shouldTranslateTitle = needsTitleTranslation(initialItem);
    const shouldTranslateExcerpt = needsExcerptTranslation(initialItem);
    if (!shouldTranslateTitle && !shouldTranslateExcerpt) {
      contentViewModeById = { ...contentViewModeById, [id]: "translated" };
      return true;
    }

    try {
      if (shouldTranslateTitle) {
        pendingActionById[id] = "translate-title";
        const titleOk = await translateContentTitle(id);
        if (!titleOk) {
          if (!silentErrorNotice) {
            showActionNotice("error", "Impossible de traduire le titre.");
          }
          return false;
        }
      }

      await dashboardStore.refresh();

      const refreshedItem =
        dashboardStore.state.contentItems.find((item) => item.id === id) || initialItem;

      if (shouldTranslateExcerpt && needsExcerptTranslation(refreshedItem)) {
        pendingActionById[id] = "translate-description";
        const descriptionOk = await translateContentDescription(id);
        if (!descriptionOk) {
          if (!silentErrorNotice) {
            showActionNotice("error", "Le titre a été traduit, mais pas la description.");
          }
          await dashboardStore.refresh();
          return false;
        }
      }

      await dashboardStore.refresh();
      contentViewModeById = { ...contentViewModeById, [id]: 'translated' };
      return true;
    } catch {
      if (!silentErrorNotice) {
        showActionNotice("error", "Une erreur est survenue pendant la traduction.");
      }
      return false;
    } finally {
      pendingActionById[id] = null;
    }
  }

  async function handleTranslateAll() {
    if (bulkTranslationInProgress) return;

    const idsToTranslate = [...filteredContent]
      .map((item) => item.id)
      .filter((id) => !pendingActionById[id]);

    if (idsToTranslate.length === 0) return;

    bulkTranslationInProgress = true;
    let failedCount = 0;

    try {
      for (const id of idsToTranslate) {
        const ok = await translateItemInChain(id, { silentErrorNotice: true });
        if (!ok) failedCount += 1;
      }

      if (failedCount > 0) {
        showActionNotice(
          "error",
          failedCount === 1
            ? "Une news n'a pas pu être traduite."
            : `${failedCount} news n'ont pas pu être traduites.`,
        );
      }
    } finally {
      bulkTranslationInProgress = false;
    }
  }

  const stats = $derived([
    {
      label: "À valider",
      value: `${contentStats.pending}`,
      note: "contenus en attente",
      icon: "pending_actions",
      color: "bg-amber-500/10 text-amber-700",
    },
    {
      label: "Publiés",
      value: `${contentStats.published}`,
      note: "diffusions validées",
      icon: "check_circle",
      color: "bg-emerald-500/10 text-emerald-700",
    },
    {
      label: "Rejetés",
      value: `${contentStats.rejected}`,
      note: "contenus signalés",
      icon: "cancel",
      color: "bg-rose-500/10 text-rose-700",
    },
    {
      label: "Filtrées",
      value: `${contentStats.filtered}`,
      note: "bloquées par préférences",
      icon: "filter_alt",
      color: "bg-slate-500/10 text-slate-600",
    },
    {
      label: "Flux actifs",
      value:
        (dashboardStore.state.feeds.filter((feed) => feed.enabled).length || 0) +
        " flux",
      note: `${contentStats.total} contenus au total`,
      icon: "rss_feed",
      color: "bg-secondary/10 text-secondary",
    },
  ]);

  function getFilterCount(label) {
    if (label === "Tous") return contentStats.total;
    if (label === "À valider") return contentStats.pending;
    if (label === "Publiés") return contentStats.published;
    if (label === "Rejetés") return contentStats.rejected;
    if (label === "Filtrées") return contentStats.filtered;
    return 0;
  }
</script>

<div class="space-y-16 animate-in fade-in slide-in-from-bottom-6 duration-1000">
  {#if actionNotice.message}
    <div class="fixed right-6 top-24 z-60 max-w-sm rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-lg transition-all {actionNotice.type === 'success'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
      : 'border-rose-500/30 bg-rose-500/10 text-rose-700'}">
      <div class="flex items-start gap-2">
        <span class="material-symbols-outlined text-base">{actionNotice.type === 'success' ? 'check_circle' : 'error'}</span>
        <p class="text-xs font-black uppercase tracking-[0.12em]">{actionNotice.message}</p>
      </div>
    </div>
  {/if}

  <div
    class="rounded-[3rem] border border-outline-variant/20 bg-linear-to-br from-surface-container/90 via-surface-container-low/80 to-surface-container/50 p-8 md:p-10 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl"
  >
    <div class="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
      <div class="max-w-3xl space-y-4">
        <div class="inline-flex items-center gap-2 rounded-full border border-outline-variant/20 bg-white/60 px-4 py-2 text-[10px] font-black uppercase tracking-[0.25em] text-on-surface-variant/60">
          <span class="material-symbols-outlined text-base text-primary">fact_check</span>
          Modération du contenu
        </div>
        <h2 class="text-4xl font-black text-on-surface tracking-tighter font-headline leading-tight md:text-5xl">
          Piloter la diffusion sans friction
        </h2>
        <p class="max-w-2xl text-base leading-relaxed text-on-surface-variant/75 md:text-lg">
          Vue opérationnelle pour valider, rejeter ou publier rapidement les contenus destinés à {dashboardStore.state.guildName}. Tout ce qui compte est accessible en un coup d'oeil, sans panneau d'aperçu séparé.
        </p>
      </div>

      <div class="grid min-w-0 gap-4 sm:grid-cols-2 xl:min-w-90 xl:grid-cols-2">
        <div class="rounded-4xl border border-outline-variant/20 bg-surface-container-low/80 p-5 shadow-sm">
          <p class="text-[10px] font-black uppercase tracking-[0.25em] text-on-surface-variant/40">Statut</p>
          <p class="mt-2 text-2xl font-black tracking-tighter text-on-surface">
            {contentStats.pending} à traiter
          </p>
        </div>
        <div class="rounded-4xl border border-outline-variant/20 bg-surface-container-low/80 p-5 shadow-sm">
          <p class="text-[10px] font-black uppercase tracking-[0.25em] text-on-surface-variant/40">Flux</p>
          <p class="mt-2 text-2xl font-black tracking-tighter text-on-surface">
            {dashboardStore.state.feeds.filter((feed) => feed.enabled).length} actifs
          </p>
        </div>
      </div>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
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

  <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-8 items-start">
    <div class="space-y-6">
      <div class="rounded-[2.5rem] border border-outline-variant/20 bg-surface-container/70 p-5 md:p-6 shadow-sm backdrop-blur-xl">
        <div class="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div class="min-w-0 2xl:flex-1">
            <FilterChips
              options={filterOptions}
              selected={filter}
              onSelect={(value) => (filter = value)}
              getCount={getFilterCount}
              showCount={true}
              containerClass="flex flex-wrap items-center gap-3"
              buttonClass="px-5 py-2.5 rounded-full text-xs font-black transition-all uppercase tracking-widest border"
              activeClass="bg-primary text-on-primary border-primary shadow-lg shadow-primary/20"
              inactiveClass="bg-surface-container-low text-on-surface-variant/65 border-outline-variant/20 hover:bg-surface-container-hover hover:text-on-surface"
            />
          </div>

          <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center 2xl:justify-end">
            <label class="relative w-full sm:min-w-72 sm:flex-1 2xl:max-w-80">
              <span class="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/40 text-xl">search</span>
              <input
                bind:value={search}
                type="search"
                placeholder="Rechercher un titre, une source, un auteur..."
                class="w-full rounded-full border border-outline-variant/20 bg-surface-container-low px-12 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/40 outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
              />
            </label>

            <select
              bind:value={sortMode}
              class="shrink-0 rounded-full border border-outline-variant/20 bg-surface-container-low px-5 py-3 text-sm font-semibold text-on-surface outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
            >
              <option value="schedule-desc">Plus récents</option>
              <option value="schedule-asc">Plus proches</option>
            </select>

            <div class="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                onclick={handleTranslateAll}
                disabled={bulkTranslationInProgress || filteredContent.length === 0}
                class="inline-flex items-center gap-1 rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] transition-colors {(bulkTranslationInProgress || filteredContent.length === 0)
                  ? 'cursor-not-allowed border border-blue-500/10 bg-blue-500/5 text-blue-700/35'
                  : 'border border-blue-500/20 bg-blue-500/8 text-blue-700 hover:bg-blue-600 hover:text-white'}"
              >
                {#if bulkTranslationInProgress}
                  <span class="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                  Traduction en chaîne...
                {:else}
                  <span class="material-symbols-outlined text-sm">translate</span>
                  Tout traduire
                {/if}
              </button>
              <a
                href="/content/filtered"
                class="inline-flex items-center gap-1 rounded-full border border-slate-500/20 bg-slate-500/8 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 transition-colors hover:bg-slate-500/15"
              >
                <span class="material-symbols-outlined text-sm">filter_alt</span>
                Filtrées
              </a>
              <a
                href="/content"
                class="inline-flex items-center gap-1 rounded-full border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant/70 transition-colors hover:text-on-surface"
              >
                <span class="material-symbols-outlined text-sm">newsstand</span>
                Toutes
              </a>
            </div>
          </div>
        </div>
      </div>

      <div class="premium-card rounded-[3rem] overflow-hidden">
        {#if dashboardStore.state.loading && dashboardStore.state.contentItems.length === 0}
          <div class="p-24 flex flex-col items-center justify-center text-on-surface-variant/25">
            <span class="material-symbols-outlined text-7xl animate-spin">sync</span>
            <p class="mt-6 text-sm font-semibold uppercase tracking-[0.2em]">Chargement des contenus</p>
          </div>
        {:else if filteredContent.length > 0}
          <div class="divide-y divide-outline-variant/10">
            {#each filteredContent as item}
              {@const status = getStatusMeta(item.status)}
              {@const pendingAction = pendingActionById[item.id]}
              <article class="group bg-transparent px-6 py-6 md:px-8 md:py-7 transition-all hover:bg-primary/4">
                <div class="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                  <div class="min-w-0 flex-1 space-y-4">
                    <div class="flex flex-wrap items-center gap-3">
                      <span class="inline-flex items-center gap-2 rounded-full border border-outline-variant/20 bg-surface-container-low px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant/70">
                        <span class="material-symbols-outlined text-base text-secondary">rss_feed</span>
                        {item.source}
                      </span>
                      {#if item.filteredOut}
                        <span class="inline-flex items-center gap-2 rounded-full border border-slate-500/25 bg-slate-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-slate-600">
                          <span class="material-symbols-outlined text-base">filter_alt</span>
                          Filtrée
                        </span>
                      {/if}
                      <span class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] {status.badgeClass}">
                        <span class="h-2 w-2 rounded-full {status.dotClass}"></span>
                        {status.label}
                      </span>
                      <span class="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/40">
                        Diffusion prévue le {formatDateTime(item.scheduleAt)}
                      </span>
                    </div>

                    <div class="space-y-2">
                      <h3 class="text-xl md:text-2xl font-black tracking-tighter text-on-surface leading-tight">
                        {getDisplayTitle(item)}
                      </h3>
                      <p class="max-w-4xl text-sm md:text-[15px] leading-relaxed text-on-surface-variant/75 line-clamp-3">
                        {getDisplayExcerpt(item) || 'Aucun extrait disponible pour ce contenu.'}
                      </p>
                      {#if item.filteredOut}
                        <p class="text-xs font-semibold text-slate-600">
                          Raison du filtre: {item.filterReason || 'Filtrée par préférences de contenu.'}
                        </p>
                      {/if}
                    </div>

                    <div class="flex flex-wrap items-center gap-4 text-xs font-medium text-on-surface-variant/55">
                      <span class="inline-flex items-center gap-2">
                        <span class="material-symbols-outlined text-base">person</span>
                        {item.author || 'Auteur inconnu'}
                      </span>
                      <span class="inline-flex items-center gap-2">
                        <span class="material-symbols-outlined text-base">schedule</span>
                        {formatDateTime(item.scheduleAt)}
                      </span>
                    </div>
                  </div>

                  <div class="flex flex-row flex-wrap gap-3 lg:w-70 lg:justify-end lg:flex-col">
                    {#if hasTranslation(item)}
                      <button
                        onclick={() => toggleContentView(item)}
                        class="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-500/20 bg-slate-500/8 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-300 transition-all hover:bg-slate-500/15 hover:text-white hover:scale-[1.02] active:scale-[0.98]"
                      >
                        <span class="material-symbols-outlined text-lg">swap_horiz</span>
                        {#if isViewingOriginal(item)}
                          Voir traduit
                        {:else}
                          Voir original
                        {/if}
                      </button>
                    {/if}

                    <button
                      onclick={() => handleTranslate(item.id)}
                      disabled={!!pendingAction || bulkTranslationInProgress}
                      class="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-[0.18em] transition-all {(pendingAction || bulkTranslationInProgress)
                        ? 'cursor-not-allowed border border-blue-500/10 bg-blue-500/5 text-blue-700/35'
                        : 'border border-blue-500/20 bg-blue-500/8 text-blue-700 hover:bg-blue-600 hover:text-white hover:scale-[1.02] active:scale-[0.98]'}"
                    >
                      {#if pendingAction === 'translate-title'}
                        <span class="material-symbols-outlined text-lg animate-spin">progress_activity</span>
                        Titre...
                      {:else if pendingAction === 'translate-description'}
                        <span class="material-symbols-outlined text-lg animate-spin">progress_activity</span>
                        Description...
                      {:else if pendingAction === 'translate'}
                        <span class="material-symbols-outlined text-lg animate-spin">progress_activity</span>
                        Traduction...
                      {:else}
                        <span class="material-symbols-outlined text-lg">translate</span>
                        Traduire
                      {/if}
                    </button>

                    <button
                      onclick={() => handleForceSend(item.id)}
                      disabled={!(item.status === 'planifie' || item.filteredOut) || !!pendingAction}
                      class="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-[0.18em] transition-all {((item.status === 'planifie' || item.filteredOut) && !pendingAction)
                        ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98]'
                        : 'cursor-not-allowed bg-emerald-500/10 text-emerald-700/40'}"
                    >
                      {#if pendingAction === 'publish'}
                        <span class="material-symbols-outlined text-lg animate-spin">progress_activity</span>
                        Publication...
                      {:else}
                        <span class="material-symbols-outlined text-lg">check_circle</span>
                        {item.filteredOut ? 'Publier quand même' : 'Publier'}
                      {/if}
                    </button>

                    <button
                      onclick={() => handleMarkError(item.id)}
                      disabled={item.status !== 'planifie' || !!pendingAction}
                      class="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-[0.18em] transition-all {(item.status === 'planifie' && !pendingAction)
                        ? 'border border-rose-500/20 bg-rose-500/8 text-rose-700 hover:bg-rose-600 hover:text-white hover:scale-[1.02] active:scale-[0.98]'
                        : 'cursor-not-allowed border border-rose-500/10 bg-rose-500/5 text-rose-700/35'}"
                    >
                      {#if pendingAction === 'reject'}
                        <span class="material-symbols-outlined text-lg animate-spin">progress_activity</span>
                        Rejet...
                      {:else}
                        <span class="material-symbols-outlined text-lg">cancel</span>
                        Rejeter
                      {/if}
                    </button>
                  </div>
                </div>

                <div class="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-outline-variant/10 bg-surface-container-low/60 px-4 py-3">
                  <div class="flex flex-wrap items-center gap-3 text-xs font-semibold text-on-surface-variant/60">
                    <span class="inline-flex items-center gap-2">
                      <span class="material-symbols-outlined text-base">tag</span>
                      {item.status === 'planifie' ? 'En attente de validation' : status.label}
                    </span>
                    <span class="inline-flex items-center gap-2">
                      <span class="material-symbols-outlined text-base">calendar_month</span>
                      {formatDateTime(item.scheduleAt)}
                    </span>
                  </div>

                  <div class="flex flex-wrap items-center gap-3">
                    {#if item.url}
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-secondary transition-colors hover:text-secondary-container"
                      >
                        Aller à la news
                        <span class="material-symbols-outlined text-base">open_in_new</span>
                      </a>
                    {/if}

                    <a
                      href="/activity"
                      class="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-primary transition-colors hover:text-primary-container"
                    >
                      Voir le journal
                      <span class="material-symbols-outlined text-base">open_in_new</span>
                    </a>
                  </div>
                </div>
              </article>
            {/each}
          </div>
        {:else}
          <div class="flex flex-col items-center justify-center p-16 text-center">
            <div class="w-20 h-20 rounded-4xl bg-primary/8 text-primary flex items-center justify-center shadow-inner">
              <span class="material-symbols-outlined text-4xl">inbox</span>
            </div>
            <h3 class="mt-6 text-2xl font-black tracking-tighter text-on-surface">
              Aucun contenu ne correspond à vos critères
            </h3>
            <p class="mt-3 max-w-xl text-sm leading-relaxed text-on-surface-variant/65">
              Essayez de changer le filtre, d'élargir la recherche ou de recharger la source concernée.
            </p>
          </div>
        {/if}
      </div>

      <div class="flex flex-wrap items-center justify-between gap-4 rounded-4xl border border-outline-variant/20 bg-surface-container-low/70 px-6 py-4 text-sm text-on-surface-variant/70">
        <p>
          {contentStats.total} contenus chargés, {filteredContent.length} visibles avec les filtres actuels.
        </p>
        <a
          href="/activity"
          class="inline-flex items-center gap-2 font-black uppercase tracking-[0.18em] text-primary transition-colors hover:text-primary-container"
        >
          Ouvrir le journal complet
          <span class="material-symbols-outlined text-base">arrow_forward</span>
        </a>
      </div>
    </div>

    <aside class="space-y-6 xl:sticky xl:top-6">
      <div class="premium-card rounded-[2.5rem] p-6 space-y-5">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <span class="material-symbols-outlined text-2xl">tune</span>
          </div>
          <div>
            <p class="text-[10px] font-black uppercase tracking-[0.25em] text-on-surface-variant/40">Ergonomie</p>
            <h3 class="text-lg font-black tracking-tighter text-on-surface">Raccourcis de pilotage</h3>
          </div>
        </div>

        <div class="space-y-3 text-sm leading-relaxed text-on-surface-variant/70">
          <p>La vue met l'accent sur la validation rapide: recherche, filtres, tri et actions directes sont regroupés au même endroit.</p>
          <p>Les contenus déjà publiés restent visibles pour garder le contexte, mais les actions actives sont réservées aux éléments en attente.</p>
        </div>

        <div class="grid gap-3">
          <div class="rounded-3xl border border-outline-variant/15 bg-surface-container-low/70 p-4">
            <p class="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant/40">Priorité</p>
            <p class="mt-1 text-base font-bold text-on-surface">Traiter les contenus à valider en premier</p>
          </div>
          <div class="rounded-3xl border border-outline-variant/15 bg-surface-container-low/70 p-4">
            <p class="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant/40">Contexte</p>
            <p class="mt-1 text-base font-bold text-on-surface">Historique et actions accessibles via le journal</p>
          </div>
        </div>
      </div>

      <div class="premium-card rounded-[2.5rem] p-6 space-y-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-[10px] font-black uppercase tracking-[0.25em] text-on-surface-variant/40">Sources actives</p>
            <h3 class="mt-1 text-lg font-black tracking-tighter text-on-surface">Flux suivis</h3>
          </div>
          <div class="rounded-full bg-secondary/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-secondary">
            {dashboardStore.state.feeds.filter((feed) => feed.enabled).length}
          </div>
        </div>

        <div class="space-y-3">
          {#each dashboardStore.state.feeds.slice(0, 4) as feed}
            <div class="flex items-center justify-between gap-3 rounded-[1.25rem] border border-outline-variant/15 bg-surface-container-low/60 px-4 py-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-bold text-on-surface">{feed.name}</p>
                <p class="truncate text-[11px] text-on-surface-variant/45">{feed.url}</p>
              </div>
              <span class="rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] {feed.enabled ? 'bg-emerald-500/10 text-emerald-700' : 'bg-outline-variant/15 text-on-surface-variant/45'}">
                {feed.enabled ? 'Actif' : 'Inactif'}
              </span>
            </div>
          {/each}

          {#if dashboardStore.state.feeds.length === 0}
            <div class="rounded-3xl border border-dashed border-outline-variant/20 p-6 text-center text-sm text-on-surface-variant/55">
              Aucun flux configuré.
            </div>
          {/if}
        </div>
      </div>
    </aside>
  </div>
</div>
