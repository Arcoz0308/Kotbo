<script lang="ts">
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { refreshDashboardOnMount } from '../lib/dashboardLifecycle';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import ActionButton from '../lib/components/ActionButton.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import FormTextarea from '../lib/components/FormTextarea.svelte';
  import {
    createRegulationArticle,
    deleteRegulationArticle,
    publishRegulation,
    updateRegulationSettings,
    updateRegulationArticle,
  } from '../lib/api';

  refreshDashboardOnMount();

  type RegulationRule = {
    id: string;
    title: string;
    description: string;
    emoji: string | null;
    sortOrder: number;
    enabled: boolean;
  };

  type DraftMode = 'create' | 'edit';

  let feedbackMessage = $state('');
  let feedbackIsError = $state(false);
  let saving = $state(false);
  let publishing = $state(false);
  let deleteConfirmationText = $state('');
  let deletingRule = $state<RegulationRule | null>(null);
  let modalOpen = $state(false);
  let modalMode = $state<DraftMode>('create');
  let draftId = $state<string | null>(null);
  let draftTitle = $state('');
  let draftDescription = $state('');
  let draftEmoji = $state('');
  let draftSortOrder = $state('0');
  let draftEnabled = $state(true);
  let selectedRegulationChannelId = $state('');

  const canManageSettings = $derived(!!dashboardStore.state.access?.canManageSettings);
  const regulationRules = $derived(
    [...(dashboardStore.state.regulationRules || [])]
      .sort((left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, 'fr'))
  );
  const activeRules = $derived(regulationRules.filter((rule) => rule.enabled));
  const regulationChannelLabel = $derived(
    dashboardStore.state.regulationChannelId
      ? `<#${dashboardStore.state.regulationChannelId}>`
      : dashboardStore.state.configChannelId
        ? `<#${dashboardStore.state.configChannelId}> (fallback configuration)`
        : 'Aucun salon de publication'
  );
  const publicationStatusLabel = $derived(
    dashboardStore.state.regulationMessageId ? 'Message publié et synchronisable' : 'Aucun message publié pour le moment'
  );

  function resetDraft() {
    draftId = null;
    draftTitle = '';
    draftDescription = '';
    draftEmoji = '';
    draftSortOrder = `${regulationRules.length}`;
    draftEnabled = true;
  }

  function openCreateModal() {
    feedbackMessage = '';
    feedbackIsError = false;
    modalMode = 'create';
    resetDraft();
    modalOpen = true;
  }

  function openEditModal(rule: RegulationRule) {
    feedbackMessage = '';
    feedbackIsError = false;
    modalMode = 'edit';
    draftId = rule.id;
    draftTitle = rule.title;
    draftDescription = rule.description;
    draftEmoji = rule.emoji ?? '';
    draftSortOrder = `${rule.sortOrder}`;
    draftEnabled = rule.enabled;
    modalOpen = true;
  }

  function closeModal() {
    modalOpen = false;
  }

  function openDeleteModal(rule: RegulationRule) {
    feedbackMessage = '';
    feedbackIsError = false;
    deletingRule = rule;
    deleteConfirmationText = '';
  }

  function closeDeleteModal() {
    deletingRule = null;
    deleteConfirmationText = '';
  }

  function normalizeText(value: string) {
    return value.trim();
  }

  async function refreshState(message: string) {
    await dashboardStore.refresh();
    feedbackMessage = message;
    feedbackIsError = false;
  }

  async function saveRule() {
    feedbackMessage = '';
    feedbackIsError = false;

    const title = normalizeText(draftTitle);
    const description = normalizeText(draftDescription);
    const emoji = normalizeText(draftEmoji);
    const sortOrder = Number.parseInt(draftSortOrder, 10);

    if (!title || !description) {
      feedbackMessage = 'Le titre et la description sont obligatoires.';
      feedbackIsError = true;
      return;
    }

    saving = true;
    try {
      const payload = {
        title,
        description,
        emoji: emoji || null,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : regulationRules.length,
        enabled: draftEnabled,
      };

      const ok = modalMode === 'create'
        ? await createRegulationArticle(payload)
        : draftId
          ? await updateRegulationArticle(draftId, payload)
          : false;

      if (!ok) {
        feedbackMessage = 'Impossible d’enregistrer l’article de règlement.';
        feedbackIsError = true;
        return;
      }

      modalOpen = false;
      await refreshState(modalMode === 'create' ? 'Article de règlement ajouté.' : 'Article de règlement mis à jour.');
    } finally {
      saving = false;
    }
  }

  async function confirmDeleteRule() {
    if (!deletingRule) return;

    if (deleteConfirmationText.trim().toUpperCase() !== 'SUPPRIMER') {
      feedbackMessage = 'Suppression annulée: validation finale non confirmée.';
      feedbackIsError = true;
      return;
    }

    const rule = deletingRule;
    deletingRule = null;
    deleteConfirmationText = '';
    saving = true;

    try {
      const ok = await deleteRegulationArticle(rule.id);
      if (!ok) {
        feedbackMessage = 'Impossible de supprimer l’article de règlement.';
        feedbackIsError = true;
        return;
      }

      await refreshState('Article de règlement supprimé.');
    } finally {
      saving = false;
    }
  }

  async function handlePublishRegulation() {
    feedbackMessage = '';
    feedbackIsError = false;

    if (!dashboardStore.state.regulationChannelId && !dashboardStore.state.configChannelId) {
      feedbackMessage = 'Le salon de publication du règlement n’est pas défini. Configure-le avant de publier le règlement.';
      feedbackIsError = true;
      return;
    }

    publishing = true;
    try {
      const ok = await publishRegulation();
      if (!ok) {
        feedbackMessage = 'Impossible de publier ou mettre à jour le règlement.';
        feedbackIsError = true;
        return;
      }

      await refreshState(dashboardStore.state.regulationMessageId ? 'Règlement actualisé dans le salon de publication.' : 'Règlement publié dans le salon de publication.');
    } finally {
      publishing = false;
    }
  }

  async function handleRegulationChannelChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const channelId = target.value || null;

    feedbackMessage = '';
    feedbackIsError = false;
    saving = true;

    try {
      const ok = await updateRegulationSettings(channelId);
      if (!ok) {
        feedbackMessage = 'Impossible de mettre à jour le salon de publication du règlement.';
        feedbackIsError = true;
        return;
      }

      await refreshState(channelId ? 'Salon de publication du règlement mis à jour.' : 'Salon de publication spécifique supprimé (fallback configuration actif).');
    } finally {
      saving = false;
    }
  }

  $effect(() => {
    selectedRegulationChannelId = dashboardStore.state.regulationChannelId || '';
  });
</script>

<div class="flex flex-col gap-6 mb-8 font-inter">
  <div class="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
    <div>
      <p class="text-[10px] font-black uppercase tracking-[0.25em] text-on-surface-variant">Module de gouvernance</p>
      <h2 class="text-3xl font-extrabold tracking-tight text-primary font-headline mt-2">Règlement du serveur</h2>
      <p class="text-on-surface-variant mt-2 max-w-3xl leading-relaxed">
        Crée, ordonne et publie les articles du règlement. La sélection des rapports de sanction se synchronise directement avec cette liste.
      </p>
    </div>
    <RefreshButton
      onClick={() => dashboardStore.refresh()}
      loading={dashboardStore.state.loading}
      label="Actualiser"
      className="px-5 py-2.5 font-bold shadow-lg shadow-primary/10"
      iconClass="text-lg"
    />
  </div>

  <section class="grid grid-cols-1 xl:grid-cols-2 gap-4">
    <div class="section-card p-5 xl:col-span-2">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 class="text-lg font-black text-on-surface">Articles du règlement</h3>
          <p class="text-xs text-on-surface-variant mt-1">{activeRules.length} actif(s) sur {regulationRules.length} article(s)</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <ActionButton
            onClick={openCreateModal}
            disabled={!canManageSettings}
            variant="primary"
            icon="➕"
            label="Ajouter un article"
          />
          <ActionButton
            onClick={handlePublishRegulation}
            disabled={!canManageSettings || publishing || regulationRules.length === 0}
            variant="success"
            icon={dashboardStore.state.regulationMessageId ? '♻️' : '📣'}
            label={publishing ? 'Publication...' : dashboardStore.state.regulationMessageId ? 'Actualiser le message' : 'Publier le règlement'}
          />
        </div>
      </div>

      {#if feedbackMessage}
        <div class="mb-4 rounded-2xl px-4 py-3 text-sm font-semibold {feedbackIsError ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}">
          {feedbackMessage}
        </div>
      {/if}

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/40 p-4">
          <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Salon cible</p>
          <p class="mt-2 text-sm font-semibold text-on-surface">{regulationChannelLabel}</p>
          {#if canManageSettings}
            <label class="mt-3 block text-[11px] font-semibold text-on-surface-variant" for="regulation-channel-select">Modifier via menu déroulant</label>
            <select
              id="regulation-channel-select"
              class="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/60 dark:border-slate-700 dark:bg-slate-900"
              bind:value={selectedRegulationChannelId}
              onchange={handleRegulationChannelChange}
              disabled={saving || dashboardStore.state.loading || dashboardStore.state.discordChannels.length === 0}
            >
              <option value="">Utiliser le salon de configuration (fallback)</option>
              {#each dashboardStore.state.discordChannels as channel}
                <option value={channel.id}>{channel.name}</option>
              {/each}
            </select>
          {/if}
        </div>
        <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/40 p-4">
          <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Message publié</p>
          <p class="mt-2 text-sm font-semibold text-on-surface">{publicationStatusLabel}</p>
        </div>
      </div>

      {#if dashboardStore.state.loading && regulationRules.length === 0}
        <div class="space-y-3">
          {#each Array(4) as _, index (index)}
            <div class="animate-pulse rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
              <div class="h-4 w-48 rounded-full bg-slate-200 dark:bg-slate-700"></div>
              <div class="mt-3 h-3 w-full rounded-full bg-slate-200 dark:bg-slate-700"></div>
              <div class="mt-2 h-3 w-4/5 rounded-full bg-slate-200 dark:bg-slate-700"></div>
            </div>
          {/each}
        </div>
      {:else if regulationRules.length === 0}
        <div class="rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/30 p-8 text-center">
          <p class="text-lg font-black text-on-surface">Aucun article pour le moment</p>
          <p class="mt-2 text-sm text-on-surface-variant max-w-xl mx-auto">
            Ajoute des articles pour construire le règlement du serveur. Ils seront ensuite disponibles dans les rapports de sanction.
          </p>
          <div class="mt-4 flex justify-center">
            <ActionButton onClick={openCreateModal} disabled={!canManageSettings} variant="primary" icon="➕" label="Créer le premier article" />
          </div>
        </div>
      {:else}
        <div class="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          {#each regulationRules as rule}
            <article class="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-linear-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-950 p-4 shadow-sm">
              <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div class="space-y-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] {rule.enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}">
                      {rule.enabled ? 'Activé' : 'Désactivé'}
                    </span>
                    <span class="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em]">
                      Ordre {rule.sortOrder}
                    </span>
                  </div>
                  <h4 class="text-lg font-black text-on-surface">{rule.emoji ? `${rule.emoji} ` : ''}{rule.title}</h4>
                  <p class="text-sm leading-relaxed text-on-surface-variant whitespace-pre-wrap">{rule.description}</p>
                </div>

                {#if canManageSettings}
                  <div class="flex flex-wrap items-center gap-2 lg:justify-end">
                    <ActionButton onClick={() => openEditModal(rule)} variant="neutral" icon="✏️" label="Modifier" />
                    <ActionButton onClick={() => openDeleteModal(rule)} variant="danger" icon="🗑️" label="Supprimer" />
                  </div>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </div>
  </section>
</div>

{#if modalOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="regulation-modal-title" onclick={closeModal}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-panel modal-panel-lg space-y-5 font-inter" onclick={(e) => e.stopPropagation()}>
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-[10px] font-black uppercase tracking-[0.25em] text-on-surface-variant">{modalMode === 'create' ? 'Nouvel article' : 'Modifier l’article'}</p>
          <h3 id="regulation-modal-title" class="text-xl font-black text-on-surface mt-1">{modalMode === 'create' ? 'Créer un article du règlement' : 'Éditer l’article du règlement'}</h3>
        </div>
        <ActionButton onClick={closeModal} size="sm" variant="neutral" label="Fermer" />
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label for="regulation-title" class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Titre</label>
          <FormInput id="regulation-title" type="text" bind:value={draftTitle} className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border-none text-sm" placeholder="Ex: Respect et courtoisie" />
        </div>
        <div>
          <label for="regulation-emoji" class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Emoji</label>
          <FormInput id="regulation-emoji" type="text" bind:value={draftEmoji} className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border-none text-sm" placeholder="Ex: 📌 ou <:emoji:123>" />
        </div>
        <div>
          <label for="regulation-order" class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Ordre d’affichage</label>
          <input id="regulation-order" type="number" bind:value={draftSortOrder} min="0" step="1" class="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border-none text-sm" />
        </div>
        <div class="flex items-end">
          <label class="inline-flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 w-full cursor-pointer select-none">
            <input type="checkbox" bind:checked={draftEnabled} class="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary" />
            <span>
              <span class="block text-sm font-bold text-on-surface">Article actif</span>
              <span class="block text-xs text-on-surface-variant">Si désactivé, il ne sera plus affiché dans le message publié ni dans les rapports.</span>
            </span>
          </label>
        </div>
      </div>

      <div>
        <label for="regulation-description" class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Description</label>
        <FormTextarea
          id="regulation-description"
          bind:value={draftDescription}
          rows={5}
          className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border-none text-sm"
          placeholder="Décris précisément la règle en Markdown Discord..."
        />
        <p class="mt-2 text-[11px] text-on-surface-variant">Tu peux utiliser le Markdown Discord, les listes, le gras, les liens et les mentions d’emoji.</p>
      </div>

      <div class="rounded-2xl bg-slate-50 dark:bg-slate-800/40 p-4">
        <p class="text-[10px] font-black uppercase tracking-[0.25em] text-on-surface-variant">Aperçu de l’article</p>
        <p class="mt-2 text-base font-black text-on-surface">{draftEmoji ? `${draftEmoji} ` : ''}{draftTitle || 'Titre de l’article'}</p>
        <p class="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-on-surface-variant">{draftDescription || 'La description de l’article apparaîtra ici.'}</p>
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2">
        <ActionButton onClick={closeModal} variant="neutral" label="Annuler" />
        <ActionButton
          onClick={saveRule}
          variant="primary"
          label={saving ? 'Enregistrement...' : modalMode === 'create' ? 'Créer l’article' : 'Enregistrer les modifications'}
          disabled={saving || !canManageSettings}
        />
      </div>
    </div>
  </div>
{/if}

{#if deletingRule}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-rule-title" onclick={closeDeleteModal}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-panel max-w-lg space-y-4 font-inter" onclick={(e) => e.stopPropagation()}>
      <div>
        <p class="text-[10px] font-black uppercase tracking-[0.25em] text-red-500">Action sensible</p>
        <h3 id="delete-rule-title" class="mt-1 text-xl font-black text-on-surface">Supprimer l’article</h3>
        <p class="mt-2 text-sm text-on-surface-variant">
          Tu es sur le point de supprimer <span class="font-bold text-on-surface">{deletingRule.emoji ? `${deletingRule.emoji} ` : ''}{deletingRule.title}</span>.
          Cette action retire l’article de la sélection des rapports de sanction.
        </p>
      </div>

      <div>
        <label for="delete-rule-confirm" class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Tape SUPPRIMER pour valider</label>
        <FormInput
          id="delete-rule-confirm"
          type="text"
          bind:value={deleteConfirmationText}
          autocomplete="off"
          className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-red-400/40 focus:border-red-400 dark:focus:border-red-500 transition-all"
          placeholder="SUPPRIMER"
        />
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2">
        <ActionButton onClick={closeDeleteModal} variant="neutral" label="Annuler" />
        <ActionButton onClick={confirmDeleteRule} variant="danger" label={saving ? 'Suppression...' : 'Supprimer définitivement'} disabled={saving} />
      </div>
    </div>
  </div>
{/if}
