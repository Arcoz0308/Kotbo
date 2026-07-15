<script lang="ts">
  import { channelDisplayName } from '../lib/channelUtils';
  import { onMount, onDestroy, untrack } from 'svelte';
  import { unsavedChanges } from '../lib/stores/unsavedChanges.svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import SectionCard from '../lib/components/SectionCard.svelte';
  import EmptyState from '../lib/components/EmptyState.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import SearchableSelect from '../lib/components/SearchableSelect.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';
  import {
    fetchSuggestions,
    fetchSuggestionsConfig,
    updateSuggestionsConfig,
    resolveSuggestion,
  } from '../lib/api';

  const actionState = createAsyncActionState();
  const configAction = createAsyncActionState();
  let loading = $state(false);

  const canModerate = $derived(
    !!(dashboardStore.state.featureAccess as any)?.suggestions?.canModerate
      || !!dashboardStore.state.access?.canManageSettings
  );

  const canConfigure = $derived(
    !!dashboardStore.state.featureAccess?.suggestions?.canConfigure
      || !!dashboardStore.state.access?.canManageSettings
  );

  const availableChannels = $derived(dashboardStore.state.discordChannels || []);

  let moduleConfig = $state({
    enabled: true,
    channelId: null as string | null,
  });

  // Snapshot of last-saved state
  let savedConfig = $state({
    enabled: true,
    channelId: null as string | null,
  });

  $effect(() => {
    const dirty = JSON.stringify(moduleConfig) !== JSON.stringify(savedConfig);
    if (dirty && canConfigure) {
      untrack(() => {
        unsavedChanges.register({
          label: 'Suggestions',
          onSave: () => handleSaveConfig(),
          onReset: () => {
            moduleConfig = { ...savedConfig };
          }
        });
      });
    } else if (!dirty) {
      untrack(() => {
        if (unsavedChanges.isDirty && unsavedChanges.pageLabel === 'Suggestions') {
          unsavedChanges.clear();
        }
      });
    }
  });

  onDestroy(() => {
    if (unsavedChanges.pageLabel === 'Suggestions') {
      unsavedChanges.clear();
    }
  });

  let suggestions = $state<Array<{
    id: string;
    userId: string;
    username: string;
    content: string;
    status: string; // PENDING, APPROVED, REJECTED, IMPLEMENTED
    responseText: string | null;
    upvoters: string[];
    downvoters: string[];
    createdAt: string;
  }>>([]);

  // Filter selection state
  let currentFilter = $state<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'IMPLEMENTED'>('ALL');

  // Response text form states mapped by suggestion ID
  let responseDrafts = $state<Record<string, string>>({});

  async function loadSuggestions() {
    const res = await fetchSuggestions();
    if (res?.suggestions) {
      suggestions = res.suggestions;
    }
  }

  async function loadConfig() {
    const res = await fetchSuggestionsConfig();
    if (res?.config) {
      const loaded = {
        enabled: res.config.enabled ?? true,
        channelId: res.config.channelId ?? null,
      };
      moduleConfig = loaded;
      savedConfig = { ...loaded };
    }
  }

  onMount(async () => {
    loading = true;
    try {
      await dashboardStore.refresh();
      await Promise.all([loadSuggestions(), loadConfig()]);
    } catch (err) {
      console.error(err);
    } finally {
      loading = false;
    }
  });

  async function handleSaveConfig(): Promise<boolean> {
    if (!canConfigure) return false;
    let success = false;
    await configAction.run(async () => {
      const res = await updateSuggestionsConfig(moduleConfig);
      if (!res?.config) throw new Error('Erreur de sauvegarde');
      const saved = {
        enabled: res.config.enabled ?? true,
        channelId: res.config.channelId ?? null,
      };
      moduleConfig = saved;
      savedConfig = { ...saved };
      success = true;
      return true;
    }, { successMessage: 'Configuration des suggestions enregistrée !' });
    return success;
  }

  async function handleResolve(id: string, status: 'APPROVED' | 'REJECTED' | 'IMPLEMENTED') {
    if (!canModerate) return;
    const responseText = responseDrafts[id] || '';
    if (!responseText.trim()) {
      actionState.setError('Veuillez saisir un commentaire de réponse.');
      return;
    }

    await actionState.run(async () => {
      const res = await resolveSuggestion(id, { status, responseText });
      if (!res || !res.suggestion) throw new Error('Erreur de résolution');
      
      // Update local state
      suggestions = suggestions.map(s => s.id === id ? res.suggestion : s);
      responseDrafts[id] = '';
      return true;
    }, { successMessage: 'Décision enregistrée et embed mis à jour sur Discord !' });
  }

  const filteredSuggestions = $derived(
    currentFilter === 'ALL' 
      ? suggestions 
      : suggestions.filter(s => s.status === currentFilter)
  );

  const statusLabels: Record<string, string> = {
    'PENDING': 'En Attente',
    'APPROVED': 'Approuvée',
    'REJECTED': 'Rejetée',
    'IMPLEMENTED': 'Implémentée'
  };

  const statusColors: Record<string, string> = {
    'PENDING': 'bg-amber-400/20 text-amber-400 border-amber-400/20',
    'APPROVED': 'bg-emerald-400/20 text-emerald-400 border-emerald-400/20',
    'REJECTED': 'bg-rose-400/20 text-rose-400 border-rose-400/20',
    'IMPLEMENTED': 'bg-sky-400/20 text-sky-400 border-sky-400/20'
  };

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<ModulePage
  title="Suggestions"
  description="Consultez et modérez les suggestions de la communauté avec vote en temps réel."
  icon="thumbs-up"
  featureKey="suggestions"
>
  {#snippet actions()}
    <div class="tab-group" role="tablist">
      {#each ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'IMPLEMENTED'] as filter}
        <button
          onclick={() => currentFilter = filter as any}
          role="tab" aria-selected={currentFilter === filter}
          class="tab-button {currentFilter === filter ? 'active' : ''}"
        >
          {filter === 'ALL' ? 'Toutes' : statusLabels[filter]}
        </button>
      {/each}
    </div>
  {/snippet}

  <InlineFeedback state={actionState} />
  <InlineFeedback state={configAction} />

  {#if loading}
    <Skeleton height="180px" radius="2rem" />
    <div class="space-y-4">
      <Skeleton height="150px" radius="2rem" />
      <Skeleton height="150px" radius="2rem" />
      <Skeleton height="150px" radius="2rem" />
    </div>
  {:else}
    <div class="space-y-6">
      {#each filteredSuggestions as suggestion}
        <div class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6 hover:bg-surface-container-low/40 transition-all">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/10 pb-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary text-sm uppercase">
                {suggestion.username.substring(0, 2)}
              </div>
              <div>
                <p class="text-sm font-semibold text-on-surface">{suggestion.username}</p>
                <p class="text-[10px] text-on-surface-variant/50 font-bold">Posté le {formatDate(suggestion.createdAt)}</p>
              </div>
            </div>

            <div class="flex items-center gap-3">
              <!-- Upvote Downvote pills -->
              <div class="flex items-center gap-1.5 px-3 py-1 bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 rounded-full text-xs font-semibold">
                <Papicon icon="ThumbsUp" size={12} /> {suggestion.upvoters.length}
              </div>
              <div class="flex items-center gap-1.5 px-3 py-1 bg-rose-400/10 border border-rose-400/20 text-rose-400 rounded-full text-xs font-semibold">
                <Papicon icon="Minus" size={12} /> {suggestion.downvoters.length}
              </div>
              <!-- Status badge -->
              <span class="px-4 py-1.5 rounded-full text-[13px] font-medium border {statusColors[suggestion.status]}">
                {statusLabels[suggestion.status]}
              </span>
            </div>
          </div>

          <div class="text-sm font-medium text-on-surface-variant/90 leading-relaxed whitespace-pre-wrap font-sans bg-surface-container-high/15 p-5 rounded-lg border border-outline-variant/5">
            {suggestion.content}
          </div>

          {#if suggestion.responseText}
            <!-- Public response display -->
            <div class="p-5 rounded-lg bg-secondary/5 border border-secondary/15 space-y-2 animate-in fade-in duration-200">
              <div class="flex items-center gap-2 text-xs font-semibold text-secondary uppercase tracking-wider">
                <Papicon icon="User" size={14} /> Réponse du Staff
              </div>
              <p class="text-sm text-on-surface-variant font-medium leading-relaxed font-sans">{suggestion.responseText}</p>
            </div>
          {/if}

          {#if suggestion.status === 'PENDING' && canModerate}
            <!-- Moderation actions form -->
            <div class="space-y-4 pt-4 border-t border-outline-variant/10 animate-in fade-in duration-300">
              <div class="space-y-1.5">
                <label for={`resp-${suggestion.id}`} class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Réponse ou commentaire public</label>
                <textarea 
                  id={`resp-${suggestion.id}`}
                  bind:value={responseDrafts[suggestion.id]} 
                  placeholder="Expliquez la décision prise par l'équipe..."
                  class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:outline-none h-20 resize-none"
                ></textarea>
              </div>

              <div class="flex flex-wrap gap-3 justify-end">
                <button 
                  onclick={() => handleResolve(suggestion.id, 'REJECTED')}
                  disabled={!responseDrafts[suggestion.id]?.trim()}
                  class="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-[13px] font-medium rounded-lg transition-all disabled:opacity-50"
                >
                  Refuser
                </button>
                <button 
                  onclick={() => handleResolve(suggestion.id, 'APPROVED')}
                  disabled={!responseDrafts[suggestion.id]?.trim()}
                  class="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-[13px] font-medium rounded-lg transition-all disabled:opacity-50"
                >
                  Approuver
                </button>
                <button 
                  onclick={() => handleResolve(suggestion.id, 'IMPLEMENTED')}
                  disabled={!responseDrafts[suggestion.id]?.trim()}
                  class="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-[13px] font-medium rounded-lg transition-all disabled:opacity-50"
                >
                  Implémentée
                </button>
              </div>
            </div>
          {/if}
        </div>
      {:else}
        <div class="section-card">
          <EmptyState
            icon="thumbs-up"
            title="Aucune suggestion"
            description="Aucune suggestion trouvée dans cette catégorie. Les membres peuvent en proposer via la commande Discord."
          />
        </div>
      {/each}
    </div>

    {#if canConfigure}
      <SectionCard
        title="Configuration"
        description="Définissez le salon où les nouvelles suggestions sont publiées sur Discord."
        icon="settings"
      >
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="flex items-center justify-between gap-4 p-4 bg-surface-container rounded-lg border border-outline-variant">
            <div>
              <p class="text-sm font-medium text-on-surface">Système de suggestions</p>
              <p class="text-xs text-on-surface-variant mt-0.5">Active ou désactive la publication des suggestions.</p>
            </div>
            <ToggleSwitch
              checked={moduleConfig.enabled}
              onToggle={(v: boolean) => { moduleConfig.enabled = v; }}
              disabled={!canConfigure}
            />
          </div>

          <div>
            <label for="suggestions-channel" class="field-label">Salon des suggestions</label>
            <SearchableSelect
              id="suggestions-channel"
              bind:value={moduleConfig.channelId}
              options={availableChannels.map((c) => ({ id: c.id, name: channelDisplayName(c) }))}
              placeholder="Sélectionner un salon"
              className="w-full bg-surface-container border border-outline-variant rounded-lg px-4 py-3 text-sm"
              disabled={!canConfigure || !moduleConfig.enabled}
            />
          </div>
        </div>
      </SectionCard>
    {/if}
  {/if}
</ModulePage>
