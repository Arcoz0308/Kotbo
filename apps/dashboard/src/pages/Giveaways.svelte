<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import SearchableSelect from '../lib/components/SearchableSelect.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';
  import { 
    fetchGiveaways, 
    createGiveaway, 
    endGiveaway, 
    rerollGiveaway, 
    deleteGiveaway 
  } from '../lib/api';

  const actionState = createAsyncActionState();
  let loading = $state(false);

  const canManageSettings = $derived(
    !!dashboardStore.state.featureAccess?.giveaways?.canConfigure
      || !!dashboardStore.state.access?.canManageSettings
  );

  const availableChannels = $derived(dashboardStore.state.discordChannels || []);

  let giveaways = $state<Array<{
    id: string;
    channelId: string;
    messageId: string | null;
    prize: string;
    description: string | null;
    winnerCount: number;
    endsAt: string;
    ended: boolean;
    participants: string[];
    winners: string[];
    createdAt: string;
  }>>([]);

  // Create form states
  let newPrize = $state('');
  let newDescription = $state('');
  let newWinnerCount = $state(1);
  let newDurationMinutes = $state(60);
  let newChannelId = $state('');

  onMount(async () => {
    loading = true;
    try {
      await dashboardStore.refresh();
      const res = await fetchGiveaways();
      if (res && res.giveaways) {
        giveaways = res.giveaways;
      }
    } catch (err) {
      console.error(err);
    } finally {
      loading = false;
    }
  });

  async function handleCreate() {
    if (!canManageSettings || !newPrize || !newWinnerCount || !newDurationMinutes || !newChannelId) return;
    await actionState.run(async () => {
      const res = await createGiveaway({
        prize: newPrize,
        description: newDescription || undefined,
        winnerCount: newWinnerCount,
        durationMinutes: newDurationMinutes,
        channelId: newChannelId
      });
      if (!res || !res.giveaway) throw new Error('Erreur de création du concours');
      giveaways = [res.giveaway, ...giveaways];
      newPrize = '';
      newDescription = '';
      newWinnerCount = 1;
      newDurationMinutes = 60;
      newChannelId = '';
      return true;
    }, { successMessage: 'Giveaway créé avec succès sur Discord !' });
  }

  async function handleEnd(id: string) {
    if (!canManageSettings) return;
    await actionState.run(async () => {
      const ok = await endGiveaway(id);
      if (!ok) throw new Error('Erreur de fin de concours');
      
      // Update local state
      giveaways = giveaways.map(g => g.id === id ? { ...g, ended: true } : g);
      const res = await fetchGiveaways();
      if (res && res.giveaways) giveaways = res.giveaways;
      return true;
    }, { successMessage: 'Le tirage du concours a été effectué !' });
  }

  async function handleReroll(id: string) {
    if (!canManageSettings) return;
    await actionState.run(async () => {
      const ok = await rerollGiveaway(id);
      if (!ok) throw new Error('Erreur de reroll');
      
      const res = await fetchGiveaways();
      if (res && res.giveaways) giveaways = res.giveaways;
      return true;
    }, { successMessage: 'Nouveau tirage effectué !' });
  }

  async function handleDelete(id: string) {
    if (!canManageSettings) return;
    if (!confirm('Supprimer ce concours de la base de données ?')) return;
    await actionState.run(async () => {
      const ok = await deleteGiveaway(id);
      if (!ok) throw new Error('Erreur de suppression');
      giveaways = giveaways.filter(g => g.id !== id);
      return true;
    }, { successMessage: 'Concours supprimé.' });
  }

  function getChannelName(channelId: string) {
    const channel = availableChannels.find(c => c.id === channelId);
    return channel ? `#${channel.name}` : `Salon inconnu (${channelId})`;
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <header class="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-surface-container-low/40 backdrop-blur-3xl p-8 rounded-4xl border border-outline-variant/30">
    <div class="flex items-center gap-6">
      <div class="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-inner">
        <Papicon icon="Sparkles" size={32} />
      </div>
      <div>
        <h1 class="text-3xl font-black tracking-tight leading-tight">Giveaways</h1>
        <p class="text-on-surface-variant/80 font-medium">Créez et gérez des tirages au sort interactifs avec boutons de participation.</p>
      </div>
    </div>
  </header>

  <InlineFeedback state={actionState} />

  {#if loading}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <Skeleton height="500px" radius="2.5rem" />
      <div class="lg:col-span-2 space-y-4">
        <Skeleton height="120px" radius="2rem" />
        <Skeleton height="120px" radius="2rem" />
        <Skeleton height="120px" radius="2rem" />
      </div>
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <!-- Create Giveaway Form -->
      <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-6 h-fit">
        <h3 class="text-xl font-black flex items-center gap-3">
          <Papicon icon="Add" size={20} class="text-primary" />
          Lancer un Concours
        </h3>

        <form onsubmit={(e) => { e.preventDefault(); handleCreate(); }} class="space-y-4">
          <div class="space-y-1.5">
            <label for="prize" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Lot / Prix</label>
            <input 
              id="prize"
              type="text" 
              bind:value={newPrize} 
              placeholder="Ex: Nitro Boost 1 Mois 💎"
              class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
              required
              disabled={!canManageSettings}
            />
          </div>

          <div class="space-y-1.5">
            <label for="desc" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Description (Optionnel)</label>
            <textarea 
              id="desc"
              bind:value={newDescription} 
              placeholder="Conditions ou détails supplémentaires..."
              class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none h-20 resize-none"
              disabled={!canManageSettings}
            ></textarea>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <label for="winners" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Gagnants</label>
              <input 
                id="winners"
                type="number" 
                min="1"
                max="50"
                bind:value={newWinnerCount} 
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
                required
                disabled={!canManageSettings}
              />
            </div>

            <div class="space-y-1.5">
              <label for="duration" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Durée (minutes)</label>
              <input 
                id="duration"
                type="number" 
                min="1"
                bind:value={newDurationMinutes} 
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
                required
                disabled={!canManageSettings}
              />
            </div>
          </div>

          <div class="space-y-1.5">
            <label for="channel" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Salon d'envoi</label>
            <SearchableSelect 
              id="channel"
              bind:value={newChannelId} 
              options={availableChannels.map(c => ({ id: c.id, name: `#${c.name}` }))} 
              placeholder="Sélectionner le salon" 
              className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all"
              disabled={!canManageSettings}
            />
          </div>

          {#if canManageSettings}
            <button 
              type="submit"
              class="w-full py-4 mt-2 bg-primary text-on-primary font-black uppercase tracking-widest text-xs rounded-2xl shadow-lg shadow-primary/20 hover:scale-105 transition-all"
            >
              Envoyer sur Discord
            </button>
          {/if}
        </form>
      </section>

      <!-- Giveaways list -->
      <section class="lg:col-span-2 space-y-6">
        <h3 class="text-xl font-black flex items-center gap-3">
          <Papicon icon="List" size={20} class="text-secondary" />
          Liste des Concours ({giveaways.length})
        </h3>

        <div class="space-y-4">
          {#each giveaways as giveaway}
            <div class="bg-surface-container-low/30 border border-outline-variant/10 p-6 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all hover:bg-surface-container-low/50">
              <div class="space-y-2 flex-1">
                <div class="flex items-center gap-3">
                  <span class="text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full {giveaway.ended ? 'bg-outline-variant/20 text-on-surface-variant' : 'bg-primary/20 text-primary animate-pulse'}">
                    {giveaway.ended ? 'Terminé' : 'En cours'}
                  </span>
                  <span class="text-xs font-bold text-on-surface-variant/70">{getChannelName(giveaway.channelId)}</span>
                </div>
                <h4 class="text-lg font-black text-on-surface">{giveaway.prize}</h4>
                {#if giveaway.description}
                  <p class="text-sm text-on-surface-variant/80 font-medium">{giveaway.description}</p>
                {/if}
                <div class="flex flex-wrap gap-4 text-xs font-semibold text-on-surface-variant/60">
                  <span class="flex items-center gap-1.5"><Papicon icon="Users" size={14} /> {giveaway.participants.length} participations</span>
                  <span class="flex items-center gap-1.5"><Papicon icon="Crown" size={14} /> {giveaway.winnerCount} gagnant(s)</span>
                  <span class="flex items-center gap-1.5"><Papicon icon="Clock" size={14} /> Fin le {formatDate(giveaway.endsAt)}</span>
                </div>
                {#if giveaway.ended && giveaway.winners.length > 0}
                  <div class="mt-2 p-3 bg-secondary/10 border border-secondary/15 rounded-2xl text-xs font-bold text-secondary flex items-center gap-2">
                    <Papicon icon="Crown" size={14} /> 
                    Gagnants : {giveaway.winners.join(', ')}
                  </div>
                {/if}
              </div>

              {#if canManageSettings}
                <div class="flex items-center gap-2 md:self-center">
                  {#if !giveaway.ended}
                    <button 
                      onclick={() => handleEnd(giveaway.id)}
                      class="px-4 py-2.5 bg-secondary text-on-secondary text-xs font-black uppercase tracking-wider rounded-xl hover:scale-105 transition-all shadow-md shadow-secondary/10"
                      title="Forcer la fin et tirer au sort"
                    >
                      Tirer Gagnant
                    </button>
                  {:else}
                    <button 
                      onclick={() => handleReroll(giveaway.id)}
                      class="px-4 py-2.5 bg-outline-variant/30 text-on-surface text-xs font-black uppercase tracking-wider rounded-xl hover:scale-105 transition-all"
                      title="Effectuer un nouveau tirage"
                    >
                      Reroll
                    </button>
                  {/if}

                  <button 
                    onclick={() => handleDelete(giveaway.id)}
                    class="p-2.5 text-error hover:bg-error/10 border border-transparent rounded-xl transition-all"
                    title="Supprimer du dashboard"
                  >
                    <Papicon icon="Trash" size={18} />
                  </button>
                </div>
              {/if}
            </div>
          {:else}
            <div class="flex flex-col items-center justify-center py-20 bg-surface-container-low/20 border border-outline-variant/10 rounded-[2.5rem] text-center">
              <Papicon icon="Info" size={32} class="text-on-surface-variant/20 mb-3" />
              <p class="text-sm text-on-surface-variant/60 font-medium">Aucun concours configuré pour le moment.</p>
            </div>
          {/each}
        </div>
      </section>
    </div>
  {/if}
</div>
