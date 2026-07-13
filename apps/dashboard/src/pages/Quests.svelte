<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchQuestsData, createQuest, updateQuest, deleteQuest } from '../lib/api';
  import { toast } from '../lib/stores/toast.svelte';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import EmptyState from '../lib/components/EmptyState.svelte';

  let loading = $state(true);
  let data: any = $state(null);
  let showCreate = $state(false);
  let showTemplates = $state(false);
  let newQuest = $state({
    name: '', description: '', type: 'SEND_MESSAGES', frequency: 'DAILY',
    target: 10, rewardCoins: 50, rewardXp: 25
  });

  const questTypes: Record<string, string> = {
    SEND_MESSAGES: 'Envoyer des messages',
    VOICE_MINUTES: 'Minutes en vocal',
    REACT_MESSAGES: 'Réagir à des messages',
    WIN_GAME: 'Gagner un jeu',
    EARN_COINS: 'Gagner des coins',
    GIVE_REP: 'Donner des +rep',
    CREATE_THREADS: 'Créer des threads',
    REPLY_MESSAGES: 'Répondre à des messages',
  };

  const questTemplates = [
    { name: 'Bavard du jour', type: 'SEND_MESSAGES', target: 50, rewardCoins: 100, rewardXp: 50, frequency: 'DAILY', description: 'Envoyez 50 messages aujourd\'hui', icon: 'MessageSquare', color: 'primary' },
    { name: 'Vocaliste', type: 'VOICE_MINUTES', target: 30, rewardCoins: 75, rewardXp: 40, frequency: 'DAILY', description: 'Passez 30 minutes en vocal', icon: 'Mic', color: 'emerald-500' },
    { name: 'Réacteur', type: 'REACT_MESSAGES', target: 20, rewardCoins: 50, rewardXp: 25, frequency: 'DAILY', description: 'Réagissez à 20 messages', icon: 'Heart', color: 'pink-500' },
    { name: 'Champion', type: 'WIN_GAME', target: 3, rewardCoins: 150, rewardXp: 75, frequency: 'WEEKLY', description: 'Gagnez 3 parties cette semaine', icon: 'Crown', color: 'amber-500' },
    { name: 'Philanthrope', type: 'GIVE_REP', target: 5, rewardCoins: 100, rewardXp: 50, frequency: 'WEEKLY', description: 'Donnez 5 +rep cette semaine', icon: 'Star', color: 'emerald-500' },
    { name: 'Créateur', type: 'CREATE_THREADS', target: 3, rewardCoins: 80, rewardXp: 40, frequency: 'WEEKLY', description: 'Créez 3 threads cette semaine', icon: 'PenLine', color: 'primary' },
  ];

  function openTemplates() {
    showTemplates = true;
    showCreate = false;
  }

  function selectTemplate(tpl: typeof questTemplates[0]) {
    newQuest = {
      name: tpl.name,
      description: tpl.description,
      type: tpl.type,
      frequency: tpl.frequency,
      target: tpl.target,
      rewardCoins: tpl.rewardCoins,
      rewardXp: tpl.rewardXp,
    };
    showTemplates = false;
    showCreate = true;
  }

  function openBlankForm() {
    newQuest = { name: '', description: '', type: 'SEND_MESSAGES', frequency: 'DAILY', target: 10, rewardCoins: 50, rewardXp: 25 };
    showTemplates = false;
    showCreate = true;
  }

  async function load() {
    loading = true;
    try {
      data = await fetchQuestsData();
    } catch {
      toast.error('Erreur lors du chargement');
    } finally {
      loading = false;
    }
  }

  async function handleCreate() {
    if (!newQuest.name) { toast.error('Le nom est requis'); return; }
    try {
      await createQuest(newQuest);
      showCreate = false;
      newQuest = { name: '', description: '', type: 'SEND_MESSAGES', frequency: 'DAILY', target: 10, rewardCoins: 50, rewardXp: 25 };
      await load();
    } catch {
      toast.error('Erreur lors de la création');
    }
  }

  async function handleToggle(quest: any) {
    try {
      await updateQuest(quest.id, { enabled: !quest.enabled });
      await load();
    } catch {
      toast.error('Erreur lors de la mise a jour');
    }
  }

  async function handleDelete(questId: string) {
    try {
      await deleteQuest(questId);
      await load();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  }

  onMount(load);
</script>

<ModulePage
  title="Quêtes"
  description="Quêtes quotidiennes et hebdomadaires avec récompenses."
  icon="compass"
  featureKey="economy"
>
  {#snippet actions()}
    <button
      class="px-4 py-2 bg-primary text-on-primary text-[13px] font-medium rounded-xl shadow-sm active:scale-[0.98] transition-all flex items-center gap-2"
      onclick={openTemplates}
    >
      <Papicon icon="Plus" size={16} /> Nouvelle quête
    </button>
  {/snippet}

<!-- Template Picker -->
{#if showTemplates}
  <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-6 space-y-4 mb-4">
    <div>
      <h3 class="text-base font-semibold flex items-center gap-2.5">Choisir un modele</h3>
      <p class="text-xs text-on-surface-variant/60 mt-1">Selectionnez un modele pre-configure ou creez une quete personnalisee</p>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {#each questTemplates as tpl}
        <button
          class="flex flex-col gap-3 bg-surface-container-high/20 border border-outline-variant/10 rounded-xl p-4 text-left transition-all hover:border-{tpl.color}/40 hover:bg-surface-container-high/40 hover:-translate-y-0.5 border-l-3 border-l-{tpl.color} cursor-pointer"
          onclick={() => selectTemplate(tpl)}
        >
          <div class="text-{tpl.color}">
            <Papicon icon={tpl.icon} size={22} />
          </div>
          <div class="flex flex-col gap-0.5">
            <span class="font-semibold text-sm text-on-surface">{tpl.name}</span>
            <span class="text-xs text-on-surface-variant/60">{tpl.description}</span>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            {#if tpl.frequency === 'DAILY'}
              <span class="px-2.5 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded-full">Quotidienne</span>
            {:else}
              <span class="px-2.5 py-0.5 bg-pink-500/10 text-pink-500 text-xs font-medium rounded-full">Hebdomadaire</span>
            {/if}
            <span class="text-[10px] text-on-surface-variant/40">{tpl.rewardCoins} coins / {tpl.rewardXp} XP</span>
          </div>
        </button>
      {/each}
      <button
        class="flex flex-col gap-3 bg-surface-container-high/20 border border-outline-variant/10 rounded-xl p-4 text-left transition-all hover:border-on-surface-variant/30 hover:bg-surface-container-high/40 hover:-translate-y-0.5 border-l-3 border-l-outline-variant/20 cursor-pointer"
        onclick={openBlankForm}
      >
        <div class="text-on-surface-variant/40">
          <Papicon icon="Plus" size={22} />
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="font-semibold text-sm text-on-surface">Personnalisee</span>
          <span class="text-xs text-on-surface-variant/60">Creez une quete sur-mesure</span>
        </div>
      </button>
    </div>
    <div class="flex justify-end">
      <button
        class="px-4 py-2 bg-surface-container-high/40 text-on-surface-variant rounded-xl text-xs font-bold hover:bg-surface-container-high/60 transition-all flex items-center gap-2"
        onclick={() => showTemplates = false}
      >
        Annuler
      </button>
    </div>
  </div>
{/if}

<!-- Create Form -->
{#if showCreate}
  <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-6 space-y-4 mb-4">
    <h3 class="text-base font-semibold flex items-center gap-2.5">Creer une quete</h3>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div class="space-y-1">
        <label for="new-quest-name" class="field-label">Nom</label>
        <input id="new-quest-name" type="text" bind:value={newQuest.name} placeholder="Bavard du jour" class="w-full px-3 py-2 bg-surface-container-high/30 border border-outline-variant/10 rounded-lg text-on-surface text-sm focus:border-primary focus:outline-none transition-colors" />
      </div>
      <div class="space-y-1">
        <label for="new-quest-description" class="field-label">Description</label>
        <input id="new-quest-description" type="text" bind:value={newQuest.description} placeholder="Envoyez 50 messages aujourd'hui" class="w-full px-3 py-2 bg-surface-container-high/30 border border-outline-variant/10 rounded-lg text-on-surface text-sm focus:border-primary focus:outline-none transition-colors" />
      </div>
      <div class="space-y-1">
        <label for="new-quest-type" class="field-label">Type</label>
        <select id="new-quest-type" bind:value={newQuest.type} class="w-full px-3 py-2 bg-surface-container-high/30 border border-outline-variant/10 rounded-lg text-on-surface text-sm focus:border-primary focus:outline-none transition-colors">
          {#each Object.entries(questTypes) as [key, label]}
            <option value={key}>{label}</option>
          {/each}
        </select>
      </div>
      <div class="space-y-1">
        <label for="new-quest-frequency" class="field-label">Frequence</label>
        <select id="new-quest-frequency" bind:value={newQuest.frequency} class="w-full px-3 py-2 bg-surface-container-high/30 border border-outline-variant/10 rounded-lg text-on-surface text-sm focus:border-primary focus:outline-none transition-colors">
          <option value="DAILY">Quotidienne</option>
          <option value="WEEKLY">Hebdomadaire</option>
        </select>
      </div>
      <div class="space-y-1">
        <label for="new-quest-target" class="field-label">Objectif</label>
        <input id="new-quest-target" type="number" bind:value={newQuest.target} min="1" class="w-full px-3 py-2 bg-surface-container-high/30 border border-outline-variant/10 rounded-lg text-on-surface text-sm focus:border-primary focus:outline-none transition-colors" />
      </div>
      <div class="space-y-1">
        <label for="new-quest-reward-coins" class="field-label">Recompense (coins)</label>
        <input id="new-quest-reward-coins" type="number" bind:value={newQuest.rewardCoins} min="0" class="w-full px-3 py-2 bg-surface-container-high/30 border border-outline-variant/10 rounded-lg text-on-surface text-sm focus:border-primary focus:outline-none transition-colors" />
      </div>
      <div class="space-y-1">
        <label for="new-quest-reward-xp" class="field-label">Recompense (XP)</label>
        <input id="new-quest-reward-xp" type="number" bind:value={newQuest.rewardXp} min="0" class="w-full px-3 py-2 bg-surface-container-high/30 border border-outline-variant/10 rounded-lg text-on-surface text-sm focus:border-primary focus:outline-none transition-colors" />
      </div>
    </div>
    <div class="flex justify-end gap-2">
      <button
        class="px-4 py-2 bg-surface-container-high/40 text-on-surface-variant rounded-xl text-xs font-bold hover:bg-surface-container-high/60 transition-all flex items-center gap-2"
        onclick={() => showCreate = false}
      >
        Annuler
      </button>
      <button
        class="px-4 py-2 bg-primary text-on-primary text-[13px] font-medium rounded-xl shadow-sm active:scale-[0.98] transition-all flex items-center gap-2"
        onclick={handleCreate}
      >
        Creer
      </button>
    </div>
  </div>
{/if}

<!-- Loading -->
{#if loading}
  <div class="flex flex-col items-center justify-center py-16 text-on-surface-variant/50 gap-4">
    <div class="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent"></div>
    <p class="text-sm">Chargement...</p>
  </div>
{:else if data}
  <!-- Stats Row -->
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
    <div class="bg-surface-container-high/30 rounded-xl p-4 flex items-center gap-3">
      <div class="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
        <Papicon icon="Compass" size={20} />
      </div>
      <div class="flex flex-col">
        <span class="text-xl font-bold text-on-surface">{data.definitions.length}</span>
        <span class="text-xs font-medium text-on-surface-variant/60">Quetes configurees</span>
      </div>
    </div>
    <div class="bg-surface-container-high/30 rounded-xl p-4 flex items-center gap-3">
      <div class="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
        <Papicon icon="Check" size={20} />
      </div>
      <div class="flex flex-col">
        <span class="text-xl font-bold text-on-surface">{data.definitions.filter((q: any) => q.enabled).length}</span>
        <span class="text-xs font-medium text-on-surface-variant/60">Quetes actives</span>
      </div>
    </div>
    <div class="bg-surface-container-high/30 rounded-xl p-4 flex items-center gap-3">
      <div class="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
        <Papicon icon="Star" size={20} />
      </div>
      <div class="flex flex-col">
        <span class="text-xl font-bold text-on-surface">{data.totalClaimed}</span>
        <span class="text-xs font-medium text-on-surface-variant/60">Recompenses reclamees</span>
      </div>
    </div>
  </div>

  <!-- Quest List or Empty State -->
  {#if data.definitions.length === 0}
    <EmptyState icon="compass" title="Aucune quête configurée" description="Cliquez sur « Nouvelle quête » pour commencer." />
  {:else}
    <div class="space-y-3">
      {#each data.definitions as quest}
        <div
          class="bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-5 space-y-3 transition-all {quest.frequency === 'DAILY' ? 'border-l-3 border-l-primary' : 'border-l-3 border-l-pink-500'} {!quest.enabled ? 'opacity-50' : ''}"
        >
          <!-- Quest Header -->
          <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h4 class="text-sm font-semibold text-on-surface">{quest.name}</h4>
              <p class="text-xs text-on-surface-variant/60 mt-0.5">{quest.description}</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              {#if quest.frequency === 'DAILY'}
                <span class="px-2.5 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded-full">Quotidienne</span>
              {:else}
                <span class="px-2.5 py-0.5 bg-pink-500/10 text-pink-500 text-xs font-medium rounded-full">Hebdomadaire</span>
              {/if}
              <span class="px-2.5 py-0.5 bg-surface-container-high/40 text-on-surface-variant/60 text-xs font-medium rounded-full">{questTypes[quest.type] ?? quest.type}</span>
            </div>
          </div>

          <!-- Quest Details -->
          <div class="flex flex-wrap gap-4 text-xs text-on-surface-variant/60">
            <div class="flex items-center gap-1.5">
              <Papicon icon="Flag" size={14} />
              <span>Objectif: <strong class="text-on-surface">{quest.target}</strong></span>
            </div>
            <div class="flex items-center gap-1.5">
              <Papicon icon="DollarSign" size={14} />
              <span>Coins: <strong class="text-on-surface">{quest.rewardCoins}</strong></span>
            </div>
            <div class="flex items-center gap-1.5">
              <Papicon icon="TrendingUp" size={14} />
              <span>XP: <strong class="text-on-surface">{quest.rewardXp}</strong></span>
            </div>
          </div>

          <!-- Progress -->
          <div class="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div class="flex items-center gap-1.5 text-xs text-on-surface-variant/60 shrink-0">
              <Papicon icon="Users" size={14} />
              <span>{quest._count?.progress ?? 0} participations</span>
            </div>
            {#if (quest._count?.progress ?? 0) > 0}
              <div class="h-2 bg-surface-container-high rounded-full overflow-hidden w-full max-w-50 sm:max-w-50">
                <div
                  class="h-2 rounded-full transition-all duration-500"
                  style="width: {Math.min(100, ((quest._count?.progress ?? 0) / Math.max(quest.target, 1)) * 100)}%; background: {quest.frequency === 'DAILY' ? 'var(--color-primary, #6750a4)' : '#ec4899'}"
                ></div>
              </div>
            {/if}
          </div>

          <!-- Actions -->
          <div class="flex gap-2">
            {#if quest.enabled}
              <button
                class="px-4 py-2 bg-surface-container-high/40 text-on-surface-variant rounded-xl text-xs font-bold hover:bg-surface-container-high/60 transition-all flex items-center gap-2"
                onclick={() => handleToggle(quest)}
              >
                Desactiver
              </button>
            {:else}
              <button
                class="px-4 py-2 bg-emerald-500/10 text-emerald-500 rounded-xl text-xs font-bold hover:bg-emerald-500/20 transition-all flex items-center gap-2"
                onclick={() => handleToggle(quest)}
              >
                Activer
              </button>
            {/if}
            <button
              class="px-4 py-2 bg-rose-500/10 text-rose-500 rounded-xl text-xs font-bold hover:bg-rose-500/20 transition-all flex items-center gap-2"
              onclick={() => handleDelete(quest.id)}
            >
              Supprimer
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
{/if}
</ModulePage>
