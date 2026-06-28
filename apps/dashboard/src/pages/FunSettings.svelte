<script lang="ts">
  import { channelDisplayName } from '../lib/channelUtils';
  import { onMount, onDestroy, untrack } from 'svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import { unsavedChanges } from '../lib/stores/unsavedChanges.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import SearchableSelect from '../lib/components/SearchableSelect.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';
  import LoadingHint from '../lib/components/LoadingHint.svelte';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import {
    fetchFunConfig,
    updateFunConfig,
    resetCountingGame,
    resetGuessNumberGame
  } from '../lib/api';

  const actionState = createAsyncActionState();
  let loading = $state(false);

  const canManageSettings = $derived(
    !!dashboardStore.state.featureAccess?.fun?.canConfigure
      || !!dashboardStore.state.access?.canManageSettings
  );

  const availableChannels = $derived(dashboardStore.state.discordChannels || []);

  let config = $state({
    funEnabled: false,
    funCountingChannelId: null as string | null,
    funOneWordStoryChannelId: null as string | null,
    funGuessNumberChannelId: null as string | null
  });

  let savedConfig = $state({
    funEnabled: false,
    funCountingChannelId: null as string | null,
    funOneWordStoryChannelId: null as string | null,
    funGuessNumberChannelId: null as string | null
  });

  let gameState = $state({
    countingCurrent: 0,
    countingLastUserId: null as string | null,
    oneWordStoryLastUserId: null as string | null,
    guessNumberTarget: 0
  });

  // Detect changes and register/deregister with the global bar
  $effect(() => {
    const current = JSON.stringify(config);
    const saved = JSON.stringify(savedConfig);
    const dirty = current !== saved;

    if (dirty && canManageSettings) {
      untrack(() => {
        unsavedChanges.register({
          label: 'Salons Fun',
          onSave: () => handleSave(),
          onReset: () => { config = { ...savedConfig }; }
        });
      });
    } else if (!dirty) {
      untrack(() => {
        if (unsavedChanges.isDirty && unsavedChanges.pageLabel === 'Salons Fun') {
          unsavedChanges.clear();
        }
      });
    }
  });

  onDestroy(() => {
    if (unsavedChanges.pageLabel === 'Salons Fun') {
      unsavedChanges.clear();
    }
  });

  onMount(async () => {
    loading = true;
    try {
      await dashboardStore.refresh();
      const res = await fetchFunConfig();
      if (res && res.config) {
        const loaded = {
          funEnabled: res.config.funEnabled ?? false,
          funCountingChannelId: res.config.funCountingChannelId ?? null,
          funOneWordStoryChannelId: res.config.funOneWordStoryChannelId ?? null,
          funGuessNumberChannelId: res.config.funGuessNumberChannelId ?? null
        };
        config = loaded;
        savedConfig = { ...loaded };
      }
      if (res && res.gameState) {
        gameState = {
          countingCurrent: res.gameState.countingCurrent ?? 0,
          countingLastUserId: res.gameState.countingLastUserId ?? null,
          oneWordStoryLastUserId: res.gameState.oneWordStoryLastUserId ?? null,
          guessNumberTarget: res.gameState.guessNumberTarget ?? 0
        };
      }
    } catch (err) {
      console.error(err);
    } finally {
      loading = false;
    }
  });

  async function handleSave(): Promise<boolean> {
    if (!canManageSettings) return false;
    let success = false;
    await actionState.run(async () => {
      const res = await updateFunConfig(config);
      if (!res) throw new Error('Erreur de sauvegarde');
      const saved = {
        funEnabled: res.config.funEnabled ?? false,
        funCountingChannelId: res.config.funCountingChannelId ?? null,
        funOneWordStoryChannelId: res.config.funOneWordStoryChannelId ?? null,
        funGuessNumberChannelId: res.config.funGuessNumberChannelId ?? null
      };
      config = saved;
      savedConfig = { ...saved };

      if (res.gameState) {
        gameState = {
          countingCurrent: res.gameState.countingCurrent ?? 0,
          countingLastUserId: res.gameState.countingLastUserId ?? null,
          oneWordStoryLastUserId: res.gameState.oneWordStoryLastUserId ?? null,
          guessNumberTarget: res.gameState.guessNumberTarget ?? 0
        };
      }

      success = true;
      return true;
    }, { successMessage: 'Configuration des salons fun enregistrée !' });
    return success;
  }

  async function handleResetCounting() {
    if (!canManageSettings) return;
    if (!confirm('Voulez-vous vraiment réinitialiser le comptage à 0 ?')) return;

    await actionState.run(async () => {
      const res = await resetCountingGame();
      if (res && res.gameState) {
        gameState = {
          countingCurrent: res.gameState.countingCurrent ?? 0,
          countingLastUserId: res.gameState.countingLastUserId ?? null,
          oneWordStoryLastUserId: res.gameState.oneWordStoryLastUserId ?? null,
          guessNumberTarget: res.gameState.guessNumberTarget ?? 0
        };
      }
      return true;
    }, { successMessage: 'Comptage réinitialisé à 0 !' });
  }

  async function handleResetGuessNumber() {
    if (!canManageSettings) return;
    if (!confirm('Voulez-vous générer un nouveau nombre mystère ?')) return;

    await actionState.run(async () => {
      const res = await resetGuessNumberGame();
      if (res && res.gameState) {
        gameState = {
          countingCurrent: res.gameState.countingCurrent ?? 0,
          countingLastUserId: res.gameState.countingLastUserId ?? null,
          oneWordStoryLastUserId: res.gameState.oneWordStoryLastUserId ?? null,
          guessNumberTarget: res.gameState.guessNumberTarget ?? 0
        };
      }
      return true;
    }, { successMessage: 'Nouveau nombre mystère généré !' });
  }
</script>

<ModulePage
  title="Salons Fun"
  description="Configurez des salons de jeux interactifs pour divertir votre communauté."
  icon="Smile"
  featureKey="fun"
>
  <InlineFeedback state={actionState} />

  {#if loading}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <Skeleton height="320px" radius="2.5rem" />
      <Skeleton height="320px" radius="2.5rem" />
      <Skeleton height="320px" radius="2.5rem" />
    </div>
    <div class="flex justify-center mt-4">
      <LoadingHint context="config" />
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <!-- Counting Card -->
      <section class="bg-surface-container-low/40 border border-outline-variant/30 p-8 rounded-xl flex flex-col justify-between gap-6 hover:bg-surface-container-low/60 transition-all duration-300">
        <div class="space-y-4">
          <div class="flex items-center gap-3 pb-3 border-b border-outline-variant/15">
            <div class="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Papicon icon="Binary" size={20} />
            </div>
            <div>
              <h3 class="text-lg font-semibold tracking-tight text-on-surface">Salon de comptage</h3>
              <p class="text-[10px] text-on-surface-variant/55 uppercase font-bold tracking-wider">Jeu : 1, 2, 3...</p>
            </div>
          </div>

          <div class="space-y-1.5">
            <label for="countingChannel" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Salon Discord</label>
            <SearchableSelect
              id="countingChannel"
              bind:value={config.funCountingChannelId}
              options={availableChannels.map(c => ({ id: c.id, name: channelDisplayName(c) }))}
              placeholder="Aucun salon configuré"
              className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-amber-500/30 transition-all"
              disabled={!canManageSettings}
            />
          </div>

          <div class="p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 space-y-2.5">
            <p class="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">État actuel du jeu</p>
            <div class="grid grid-cols-2 gap-4">
              <div class="bg-surface-container-high/40 p-3 rounded-xl border border-outline-variant/10 text-center">
                <span class="text-[10px] text-on-surface-variant/50 uppercase font-bold">Nombre</span>
                <p class="text-2xl font-semibold text-amber-500 mt-0.5">{gameState.countingCurrent}</p>
              </div>
              <div class="bg-surface-container-high/40 p-3 rounded-xl border border-outline-variant/10 text-center flex flex-col justify-center min-w-0">
                <span class="text-[10px] text-on-surface-variant/50 uppercase font-bold truncate">Dernier joueur</span>
                <p class="text-xs font-bold text-on-surface mt-1 truncate" title={gameState.countingLastUserId || 'Aucun'}>
                  {gameState.countingLastUserId ? `ID: ${gameState.countingLastUserId}` : 'Aucun'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onclick={handleResetCounting}
          disabled={!canManageSettings || actionState.state.loading}
          class="w-full py-3.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-40"
        >
          <Papicon icon="refresh-cw" size={14} />
          Réinitialiser le comptage
        </button>
      </section>

      <!-- One Word Story Card -->
      <section class="bg-surface-container-low/40 border border-outline-variant/30 p-8 rounded-xl flex flex-col justify-between gap-6 hover:bg-surface-container-low/60 transition-all duration-300">
        <div class="space-y-4">
          <div class="flex items-center gap-3 pb-3 border-b border-outline-variant/15">
            <div class="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <Papicon icon="BookOpen" size={20} />
            </div>
            <div>
              <h3 class="text-lg font-semibold tracking-tight text-on-surface">One Word Story</h3>
              <p class="text-[10px] text-on-surface-variant/55 uppercase font-bold tracking-wider">Un mot après l'autre</p>
            </div>
          </div>

          <div class="space-y-1.5">
            <label for="oneWordStoryChannel" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Salon Discord</label>
            <SearchableSelect
              id="oneWordStoryChannel"
              bind:value={config.funOneWordStoryChannelId}
              options={availableChannels.map(c => ({ id: c.id, name: channelDisplayName(c) }))}
              placeholder="Aucun salon configuré"
              className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500/30 transition-all"
              disabled={!canManageSettings}
            />
          </div>

          <div class="p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 space-y-2.5">
            <p class="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">État actuel du jeu</p>
            <div class="bg-surface-container-high/40 p-3 rounded-xl border border-outline-variant/10 text-center flex flex-col justify-center min-w-0">
              <span class="text-[10px] text-on-surface-variant/50 uppercase font-bold truncate">Dernier auteur</span>
              <p class="text-xs font-bold text-on-surface mt-1 truncate" title={gameState.oneWordStoryLastUserId || 'Aucun'}>
                {gameState.oneWordStoryLastUserId ? `ID: ${gameState.oneWordStoryLastUserId}` : 'Aucun'}
              </p>
            </div>
          </div>
        </div>

        <div class="text-[11px] text-on-surface-variant/40 italic text-center py-2 leading-relaxed font-medium">
          Ce jeu régule automatiquement le salon. Les mauvais messages sont supprimés et les doubles envois bloqués.
        </div>
      </section>

      <!-- Guess Number Card -->
      <section class="bg-surface-container-low/40 border border-outline-variant/30 p-8 rounded-xl flex flex-col justify-between gap-6 hover:bg-surface-container-low/60 transition-all duration-300">
        <div class="space-y-4">
          <div class="flex items-center gap-3 pb-3 border-b border-outline-variant/15">
            <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Papicon icon="Gamepad2" size={20} />
            </div>
            <div>
              <h3 class="text-lg font-semibold tracking-tight text-on-surface">Nombre Mystère</h3>
              <p class="text-[10px] text-on-surface-variant/55 uppercase font-bold tracking-wider">Deviner un chiffre</p>
            </div>
          </div>

          <div class="space-y-1.5">
            <label for="guessNumberChannel" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Salon Discord</label>
            <SearchableSelect
              id="guessNumberChannel"
              bind:value={config.funGuessNumberChannelId}
              options={availableChannels.map(c => ({ id: c.id, name: channelDisplayName(c) }))}
              placeholder="Aucun salon configuré"
              className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/30 transition-all"
              disabled={!canManageSettings}
            />
          </div>

          <div class="p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 space-y-2.5">
            <p class="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">État actuel du jeu</p>
            <div class="bg-surface-container-high/40 p-3 rounded-xl border border-outline-variant/10 text-center">
              <span class="text-[10px] text-on-surface-variant/50 uppercase font-bold">Cible mystère</span>
              <p class="text-2xl font-semibold text-emerald-500 mt-0.5">{gameState.guessNumberTarget || '???'}</p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onclick={handleResetGuessNumber}
          disabled={!canManageSettings || actionState.state.loading}
          class="w-full py-3.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-40"
        >
          <Papicon icon="refresh-cw" size={14} />
          Générer une nouvelle cible
        </button>
      </section>
    </div>
  {/if}
</ModulePage>
