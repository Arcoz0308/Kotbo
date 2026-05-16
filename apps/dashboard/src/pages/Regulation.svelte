<script lang="ts">
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import ActionButton from '../lib/components/ActionButton.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import FormTextarea from '../lib/components/FormTextarea.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import {
    createRegulationArticle,
    deleteRegulationArticle,
    publishRegulation,
    reorderRegulationArticles,
    updateRegulationSettings,
    updateRegulationArticle,
    fetchFeatureConfigurations,
    updateFeatureConfiguration
  } from '../lib/api';
  import { onMount } from 'svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import RolePermissionSettings from '../lib/components/RolePermissionSettings.svelte';


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
  let draftEnabled = $state(true);
  let selectedRegulationChannelId = $state('');
  let draggingRuleId = $state<string | null>(null);
  let dragOverRuleId = $state<string | null>(null);
  let reordering = $state(false);
  const saveAction = createAsyncActionState();

  let featureConfig = $state<any>(null);
  let loadingConfig = $state(false);

  onMount(async () => {
    loadingConfig = true;
    try {
      const configs = await fetchFeatureConfigurations();
      featureConfig = configs?.features?.find((c: any) => c.featureKey === 'regulation') || null;
    } catch (err) {
      console.error('Error fetching regulation config:', err);
    } finally {
      loadingConfig = false;
    }
  });

  async function toggleConfig(key: string, value: boolean) {
    if (!featureConfig) return;
    
    await saveAction.run(async () => {
      const ok = await updateFeatureConfiguration('regulation', { [key]: value });
      if (!ok) throw new Error('Erreur API');
      featureConfig[key] = value;
      return true;
    }, { successMessage: 'Configuration mise à jour.' });
  }

  const canManageSettings = $derived(
    !!dashboardStore.state.featureAccess?.regulation?.canConfigure
      || !!dashboardStore.state.access?.canManageSettings
  );
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
    draftEnabled = true;
  }

  function normalizeRuleOrder(rules: RegulationRule[]) {
    return rules.map((rule, index) => ({
      ...rule,
      sortOrder: index,
    }));
  }

  function moveRule(rules: RegulationRule[], sourceId: string, targetId: string, placeAfter: boolean) {
    const nextRules = [...rules];
    const sourceIndex = nextRules.findIndex((rule) => rule.id === sourceId);
    if (sourceIndex === -1) return null;

    const [movedRule] = nextRules.splice(sourceIndex, 1);
    const targetIndex = nextRules.findIndex((rule) => rule.id === targetId);
    if (targetIndex === -1) return null;

    const insertAt = placeAfter ? targetIndex + 1 : targetIndex;
    nextRules.splice(insertAt, 0, movedRule);
    return normalizeRuleOrder(nextRules);
  }

  function handleRuleDragStart(event: DragEvent, ruleId: string) {
    if (!canManageSettings) {
      event.preventDefault();
      return;
    }

    draggingRuleId = ruleId;
    dragOverRuleId = ruleId;
    event.dataTransfer?.setData('text/plain', ruleId);
    event.dataTransfer?.setDragImage?.(event.currentTarget as Element, 24, 24);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  function handleRuleDragEnd() {
    draggingRuleId = null;
    dragOverRuleId = null;
  }

  function handleRuleDragOver(event: DragEvent, ruleId: string) {
    if (!canManageSettings || !draggingRuleId) {
      return;
    }

    event.preventDefault();
    dragOverRuleId = ruleId;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  async function persistRuleOrder(nextRules: RegulationRule[]) {
    const previousRules = dashboardStore.state.regulationRules || [];
    dashboardStore.state.regulationRules = nextRules;
    reordering = true;

    try {
      const ok = await reorderRegulationArticles(nextRules.map((rule) => rule.id));
      if (!ok) {
        dashboardStore.state.regulationRules = previousRules;
        feedbackMessage = 'Impossible de réordonner les articles du règlement.';
        feedbackIsError = true;
        await dashboardStore.refresh();
        return;
      }

      await refreshState('Ordre du règlement mis à jour.');
    } finally {
      reordering = false;
    }
  }

  async function moveRuleByOffset(ruleId: string, offset: number) {
    if (!canManageSettings || reordering) {
      return;
    }

    const sortedRules = [...regulationRules];
    const sourceIndex = sortedRules.findIndex((rule) => rule.id === ruleId);
    if (sourceIndex === -1) {
      return;
    }

    const targetIndex = sourceIndex + offset;
    if (targetIndex < 0 || targetIndex >= sortedRules.length) {
      return;
    }

    const [movedRule] = sortedRules.splice(sourceIndex, 1);
    sortedRules.splice(targetIndex, 0, movedRule);

    await persistRuleOrder(normalizeRuleOrder(sortedRules));
  }

  async function handleRuleDrop(event: DragEvent, targetRuleId: string) {
    if (!canManageSettings || !draggingRuleId) {
      handleRuleDragEnd();
      return;
    }

    event.preventDefault();
    const sourceRuleId = draggingRuleId;
    const targetElement = event.currentTarget as HTMLElement | null;
    const placeAfter = targetElement
      ? event.clientY > targetElement.getBoundingClientRect().top + targetElement.getBoundingClientRect().height / 2
      : false;
    const nextRules = moveRule(regulationRules, sourceRuleId, targetRuleId, placeAfter);

    handleRuleDragEnd();

    if (!nextRules) {
      return;
    }

    await persistRuleOrder(nextRules);
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
      await publishRegulation();
      await refreshState(dashboardStore.state.regulationMessageId ? 'Règlement actualisé dans le salon de publication.' : 'Règlement publié dans le salon de publication.');
    } catch (error) {
      feedbackMessage = error instanceof Error ? error.message : 'Impossible de publier ou mettre à jour le règlement.';
      feedbackIsError = true;
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
      await saveAction.run(async () => {
        const ok = await updateRegulationSettings(channelId);
        if (!ok) throw new Error('Erreur API');
        
        if (featureConfig) {
          await updateFeatureConfiguration('regulation', { channelId });
          featureConfig.channelId = channelId;
        }

        await dashboardStore.refresh();
        return true;
      }, { successMessage: channelId ? 'Salon de publication du règlement mis à jour.' : 'Salon de publication spécifique supprimé (fallback configuration actif).' });
    } finally {
      saving = false;
    }
  }

  $effect(() => {
    selectedRegulationChannelId = dashboardStore.state.regulationChannelId || '';
  });
</script>

<ModulePage 
  title="Règlement du Serveur" 
  description="Crée, ordonne et publie les articles du règlement. La sélection des rapports de sanction se synchronise directement avec cette liste." 
  icon="gavel"
  featureKey="regulation"
>
  {#snippet actions()}
    <div class="flex items-center gap-3">
      <RefreshButton
        onClick={() => dashboardStore.refresh()}
        loading={dashboardStore.state.loading}
        label="Actualiser"
        className="flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-on-surface text-surface shadow-xl hover:scale-105 transition-all duration-300"
        iconClass="text-lg"
      />
    </div>
  {/snippet}

  {#if dashboardStore.state.regulationRules}
    <div class="flex items-center gap-4 text-xs font-bold text-on-surface-variant/40 bg-surface-container-low/40 px-4 py-2 rounded-xl border border-outline-variant/5 mb-8">
       <div class="flex items-center gap-2">
          <span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
          <span>{activeRules.length} actif(s) sur {regulationRules.length} article(s)</span>
       </div>
       <span class="w-px h-3 bg-outline-variant/20"></span>
       <span>Dernière synchro: {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
  {/if}

  <!-- Config & Stats -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
    <div class="bg-surface-container-low/30 p-6 rounded-4xl border border-outline-variant/10 space-y-4">
      <div class="flex items-center gap-3">
        <div class="bg-primary/10 p-2 rounded-xl text-primary">
          <Papicon icon="Hash" size={18} />
        </div>
        <h3 class="text-sm font-black uppercase tracking-widest text-on-surface">Salon de publication</h3>
      </div>
      <div class="space-y-4">
        <div class="flex items-center justify-between p-4 bg-surface-container-high/40 rounded-2xl border border-outline-variant/10">
          <span class="text-sm font-bold text-on-surface-variant">Actuel</span>
          <span class="text-sm font-black text-primary bg-primary/5 px-3 py-1 rounded-lg">{regulationChannelLabel}</span>
        </div>
        {#if canManageSettings}
          <div class="space-y-2">
            <label class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 ml-1" for="regulation-channel-select">Changer le salon</label>
            <select
              id="regulation-channel-select"
              class="w-full rounded-xl border border-outline-variant/10 bg-surface-container-high/60 px-4 py-3 text-sm font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all cursor-pointer"
              bind:value={selectedRegulationChannelId}
              onchange={handleRegulationChannelChange}
              disabled={saving || dashboardStore.state.loading || dashboardStore.state.discordChannels.length === 0}
            >
              <option value="">Utiliser le salon de configuration (fallback)</option>
              {#each dashboardStore.state.discordChannels as channel}
                <option value={channel.id}>{channel.name}</option>
              {/each}
            </select>
          </div>
        {/if}
      </div>
    </div>

    <div class="bg-surface-container-low/30 p-6 rounded-4xl border border-outline-variant/10 space-y-4">
      <div class="flex items-center gap-3">
        <div class="bg-secondary/10 p-2 rounded-xl text-secondary">
          <Papicon icon="PaperPlaneTilt" size={18} />
        </div>
        <h3 class="text-sm font-black uppercase tracking-widest text-on-surface">État du message</h3>
      </div>
      <div class="space-y-4">
        <div class="p-4 bg-surface-container-high/40 rounded-2xl border border-outline-variant/10">
          <p class="text-sm font-bold text-on-surface leading-relaxed">{publicationStatusLabel}</p>
          <p class="mt-1 text-[10px] font-medium text-on-surface-variant/60 uppercase tracking-wider">Synchronisation automatique active</p>
        </div>
        <ActionButton
          onClick={handlePublishRegulation}
          disabled={!canManageSettings || publishing || reordering || regulationRules.length === 0}
          variant="primary"
          className="w-full py-4 rounded-xl shadow-lg shadow-primary/10"
          icon={dashboardStore.state.regulationMessageId ? 'ArrowsCounterClockwise' : 'Megaphone'}
          label={publishing ? 'Publication en cours...' : dashboardStore.state.regulationMessageId ? 'Actualiser le message' : 'Publier le règlement'}
        />
      </div>
    </div>
  </div>

  {#if featureConfig && canManageSettings}
    <div class="bg-surface-container-low/30 p-8 rounded-4xl border border-outline-variant/10 mt-8 animate-in fade-in duration-500">
      <RolePermissionSettings 
        featureKey="regulation" 
        roleAccess={featureConfig.roleAccessByRole} 
      />
    </div>
  {/if}


  <!-- Articles List -->
  <div class="space-y-6">
    <div class="flex items-center justify-between px-2">
      <div class="flex items-center gap-3">
        <div class="bg-primary p-2 rounded-xl text-on-primary shadow-lg shadow-primary/20">
          <Papicon icon="ListBullets" size={20} />
        </div>
        <div>
          <h3 class="text-xl font-black text-on-surface tracking-tight">Articles du règlement</h3>
          <p class="text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest">Gérez la structure de votre serveur</p>
        </div>
      </div>
      <ActionButton
        onClick={openCreateModal}
        disabled={!canManageSettings || reordering}
        variant="primary"
        icon="Plus"
        label="Nouvel Article"
        className="px-6 py-3 rounded-xl shadow-xl shadow-primary/20"
      />
    </div>

    {#if feedbackMessage}
      <div class="animate-in zoom-in-95 duration-300 rounded-2xl px-6 py-4 text-sm font-bold flex items-center gap-3 {feedbackIsError ? 'bg-error-container/10 text-error border border-error/20' : 'bg-primary/5 text-primary border border-primary/20'}">
        <Papicon icon={feedbackIsError ? "WarningCircle" : "CheckCircle"} size={20} />
        {feedbackMessage}
      </div>
    {/if}

    <div class="grid grid-cols-1 gap-4">
      {#if dashboardStore.state.loading && regulationRules.length === 0}
        {#each Array(4) as _}
          <div class="h-32 rounded-4xl bg-surface-container-low/30 border border-outline-variant/10 animate-pulse"></div>
        {/each}
      {:else if regulationRules.length === 0}
        <div class="flex flex-col items-center justify-center py-20 bg-surface-container-low/20 rounded-[3rem] border border-dashed border-outline-variant/20 text-center space-y-4">
          <div class="bg-surface-container-high p-6 rounded-full text-on-surface-variant/20">
            <Papicon icon="Files" size={48} />
          </div>
          <div class="space-y-1">
            <h4 class="text-xl font-black text-on-surface">Aucun article configuré</h4>
            <p class="text-on-surface-variant/60 max-w-sm">Commencez par créer le premier article pour définir les règles de votre communauté.</p>
          </div>
          <ActionButton onClick={openCreateModal} disabled={!canManageSettings} variant="primary" icon="Plus" label="Créer le premier article" className="px-8 py-3 rounded-xl" />
        </div>
      {:else}
        {#each regulationRules as rule}
          <article
            class="group relative overflow-hidden bg-surface-container-low/40 hover:bg-surface-container-low/60 rounded-[2.5rem] border border-outline-variant/10 p-6 md:p-8 transition-all duration-500 {draggingRuleId === rule.id ? 'opacity-40 scale-95' : 'hover:scale-[1.01] hover:shadow-2xl hover:shadow-surface-container-high/50'} {dragOverRuleId === rule.id ? 'ring-2 ring-primary border-primary/30' : ''} {canManageSettings ? 'cursor-grab active:cursor-grabbing' : ''}"
            draggable={canManageSettings}
            ondragstart={(event) => handleRuleDragStart(event, rule.id)}
            ondragend={handleRuleDragEnd}
            ondragover={(event) => handleRuleDragOver(event, rule.id)}
            ondrop={(event) => handleRuleDrop(event, rule.id)}
          >
            <div class="relative flex flex-col md:flex-row gap-8 items-start">
              <!-- Sort & Status -->
              <div class="flex md:flex-col items-center gap-3 shrink-0">
                <div class="w-12 h-12 rounded-2xl bg-surface-container-high flex items-center justify-center text-xl font-black text-primary border border-outline-variant/10 shadow-inner">
                  {rule.sortOrder + 1}
                </div>
                <div class="h-px w-4 md:w-px md:h-8 bg-outline-variant/20"></div>
                <div class="p-2 rounded-xl {rule.enabled ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-on-surface-variant/40'}">
                  <Papicon icon={rule.enabled ? "CheckCircle" : "Prohibit"} size={20} />
                </div>
              </div>

              <!-- Content -->
              <div class="flex-1 space-y-4">
                <div class="space-y-2">
                  <div class="flex items-center gap-3">
                    {#if rule.emoji}
                      <span class="text-2xl drop-shadow-sm">{rule.emoji}</span>
                    {/if}
                    <h4 class="text-2xl font-black text-on-surface tracking-tight group-hover:text-primary transition-colors">{rule.title}</h4>
                  </div>
                  <p class="text-on-surface-variant/70 text-base leading-relaxed whitespace-pre-wrap max-w-4xl">{rule.description}</p>
                </div>
                
                <div class="flex flex-wrap items-center gap-2">
                   <span class="px-3 py-1 rounded-lg bg-surface-container-high/60 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 border border-outline-variant/5">
                    {rule.enabled ? 'Visible' : 'Masqué'}
                   </span>
                   {#if canManageSettings}
                    <span class="px-3 py-1 rounded-lg bg-primary/5 text-[10px] font-black uppercase tracking-widest text-primary/60 border border-primary/10 animate-pulse">
                      Glisser pour réorganiser
                    </span>
                   {/if}
                </div>
              </div>

              <!-- Actions -->
              {#if canManageSettings}
                <div class="flex items-center gap-2 self-end md:self-start bg-surface-container-high/40 p-2 rounded-2xl border border-outline-variant/10 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-300 -translate-y-2 group-hover:translate-y-0">
                  <button 
                    onclick={() => openEditModal(rule)}
                    class="p-3 rounded-xl hover:bg-primary/10 hover:text-primary text-on-surface-variant/60 transition-all"
                    title="Modifier"
                  >
                    <Papicon icon="PencilSimple" size={18} />
                  </button>
                  <button 
                    onclick={() => openDeleteModal(rule)}
                    class="p-3 rounded-xl hover:bg-error-container/20 hover:text-error text-on-surface-variant/60 transition-all"
                    title="Supprimer"
                  >
                    <Papicon icon="Trash" size={18} />
                  </button>
                </div>
              {/if}
            </div>
            
            <!-- Mobile Sort Controls (Fallbacks) -->
            {#if canManageSettings}
              <div class="flex md:hidden items-center justify-center gap-4 mt-6 pt-6 border-t border-outline-variant/10">
                 <button 
                  onclick={() => moveRuleByOffset(rule.id, -1)}
                  disabled={reordering || rule.sortOrder === 0}
                  class="flex-1 py-3 rounded-xl bg-surface-container-high/60 text-xs font-black uppercase tracking-widest disabled:opacity-30"
                 >
                  Monter
                 </button>
                 <button 
                  onclick={() => moveRuleByOffset(rule.id, 1)}
                  disabled={reordering || rule.sortOrder === regulationRules.length - 1}
                  class="flex-1 py-3 rounded-xl bg-surface-container-high/60 text-xs font-black uppercase tracking-widest disabled:opacity-30"
                 >
                  Descendre
                 </button>
              </div>
            {/if}
          </article>
        {/each}
      {/if}
    </div>
  </div>

{#if modalOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="modal-backdrop backdrop-blur-md bg-surface/30" role="dialog" aria-modal="true" aria-labelledby="regulation-modal-title" tabindex="-1" onclick={closeModal}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-panel modal-panel-lg space-y-6 rounded-[3rem]! border border-outline-variant/10 shadow-2xl bg-surface-container-low!" onclick={(e) => e.stopPropagation()}>
      <div class="flex items-start justify-between gap-4">
        <div class="flex items-center gap-4">
          <div class="bg-primary/10 p-3 rounded-2xl text-primary">
            <Papicon icon={modalMode === 'create' ? "PlusCircle" : "PencilSimple"} size={24} />
          </div>
          <div>
            <p class="text-[10px] font-black uppercase tracking-[0.25em] text-on-surface-variant/60">{modalMode === 'create' ? 'Configuration' : 'Édition'}</p>
            <h3 id="regulation-modal-title" class="text-2xl font-black text-on-surface tracking-tight">{modalMode === 'create' ? 'Nouvel Article' : 'Modifier l’Article'}</h3>
          </div>
        </div>
        <button onclick={closeModal} class="p-2 rounded-xl hover:bg-surface-container-high transition-colors text-on-surface-variant/40">
          <Papicon icon="X" size={20} />
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="space-y-2">
          <label for="regulation-title" class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 ml-1">Titre de la règle</label>
          <FormInput id="regulation-title" type="text" bind:value={draftTitle} className="w-full rounded-2xl px-5 py-4 bg-surface-container-high/60 border border-outline-variant/10 font-bold text-on-surface focus:ring-2 focus:ring-primary/40 transition-all" placeholder="Ex: Respect et courtoisie" />
        </div>
        <div class="space-y-2">
          <label for="regulation-emoji" class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 ml-1">Emoji (Optionnel)</label>
          <FormInput id="regulation-emoji" type="text" bind:value={draftEmoji} className="w-full rounded-2xl px-5 py-4 bg-surface-container-high/60 border border-outline-variant/10 font-bold text-on-surface focus:ring-2 focus:ring-primary/40 transition-all" placeholder="📌 ou <:custom:123>" />
        </div>
        <div class="md:col-span-2">
          <label class="group flex items-center gap-4 rounded-4xl border border-outline-variant/10 bg-surface-container-high/40 p-6 cursor-pointer hover:bg-surface-container-high/60 transition-all">
            <div class="relative flex items-center justify-center">
              <input type="checkbox" bind:checked={draftEnabled} class="peer h-6 w-6 rounded-lg border-2 border-outline-variant/20 text-primary focus:ring-primary/40 transition-all appearance-none checked:bg-primary checked:border-primary" />
              <div class="absolute pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity text-on-primary">
                <Papicon icon="Check" size={14} weight="bold" />
              </div>
            </div>
            <div class="flex-1">
              <span class="block text-sm font-black text-on-surface tracking-tight">Article actif et visible</span>
              <span class="block text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest mt-0.5">Visibilité publique et synchronisation</span>
            </div>
          </label>
        </div>
      </div>

      <div class="space-y-2">
        <label for="regulation-description" class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 ml-1">Description détaillée (Markdown supporté)</label>
        <FormTextarea
          id="regulation-description"
          bind:value={draftDescription}
          rows={5}
          className="w-full rounded-4xl px-6 py-5 bg-surface-container-high/60 border border-outline-variant/10 font-medium text-on-surface leading-relaxed focus:ring-2 focus:ring-primary/40 transition-all"
          placeholder="Décris précisément la règle..."
        />
      </div>

      <!-- Preview -->
      <div class="relative overflow-hidden rounded-4xl bg-primary/5 p-6 border border-primary/10">
        <div class="absolute top-0 right-0 p-4 opacity-10 text-primary">
           <Papicon icon="Eye" size={48} />
        </div>
        <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary/60 mb-3">Aperçu en temps réel</p>
        <div class="flex items-center gap-3 mb-2">
          {#if draftEmoji}
            <span class="text-xl">{draftEmoji}</span>
          {/if}
          <p class="text-lg font-black text-on-surface tracking-tight">{draftTitle || 'Titre de l’article'}</p>
        </div>
        <p class="whitespace-pre-wrap text-sm font-medium text-on-surface-variant leading-relaxed">{draftDescription || 'La description apparaîtra ici...'}</p>
      </div>

      <div class="flex items-center justify-end gap-3 pt-2">
        <button 
          onclick={closeModal} 
          class="px-8 py-4 rounded-xl text-xs font-black uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high transition-all"
        >
          Annuler
        </button>
        <ActionButton
          onClick={saveRule}
          variant="primary"
          className="px-10 py-4 rounded-xl shadow-xl shadow-primary/20"
          label={saving ? 'Enregistrement...' : modalMode === 'create' ? 'Créer l’Article' : 'Sauvegarder'}
          disabled={saving || !canManageSettings}
        />
      </div>
    </div>
  </div>
{/if}

{#if deletingRule}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="modal-backdrop backdrop-blur-sm bg-error/10" role="dialog" aria-modal="true" aria-labelledby="delete-rule-title" tabindex="-1" onclick={closeDeleteModal}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-panel max-w-lg rounded-[3rem]! border border-error/20 shadow-2xl bg-surface! space-y-6 p-8" onclick={(e) => e.stopPropagation()}>
      <div class="flex flex-col items-center text-center space-y-4">
        <div class="bg-error/10 p-5 rounded-full text-error">
          <Papicon icon="Warning" size={40} />
        </div>
        <div>
          <p class="text-[10px] font-black uppercase tracking-[0.25em] text-error/60">Action Irréversible</p>
          <h3 id="delete-rule-title" class="text-2xl font-black text-on-surface tracking-tight">Supprimer l’Article ?</h3>
        </div>
        <p class="text-sm font-bold text-on-surface-variant leading-relaxed">
          Voulez-vous vraiment supprimer <span class="text-on-surface font-black">{deletingRule.emoji ? `${deletingRule.emoji} ` : ''}{deletingRule.title}</span> ?
          Cette action retirera l’article de tous les futurs rapports.
        </p>
      </div>

      <div class="space-y-3">
        <label for="delete-rule-confirm" class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 ml-1 text-center block w-full">Tapez <span class="text-error">SUPPRIMER</span> pour confirmer</label>
        <FormInput
          id="delete-rule-confirm"
          type="text"
          bind:value={deleteConfirmationText}
          autocomplete="off"
          className="w-full rounded-2xl px-5 py-4 bg-surface-container-high/60 border border-error/10 font-black text-center text-on-surface focus:ring-2 focus:ring-error/40 transition-all"
          placeholder="SUPPRIMER"
        />
      </div>

      <div class="flex flex-col gap-2">
        <ActionButton onClick={confirmDeleteRule} variant="danger" label={saving ? 'Suppression...' : 'Confirmer la Suppression'} disabled={saving} className="w-full py-4 rounded-xl shadow-xl shadow-error/20" />
        <button onclick={closeDeleteModal} class="w-full py-4 rounded-xl text-xs font-black uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high transition-all">Annuler</button>
      </div>
    </div>
  </div>
{/if}
</ModulePage>