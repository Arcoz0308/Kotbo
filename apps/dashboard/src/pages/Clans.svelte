<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import { unsavedChanges } from '../lib/stores/unsavedChanges.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import SearchableSelect from '../lib/components/SearchableSelect.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';
  import LoadingHint from '../lib/components/LoadingHint.svelte';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import {
    fetchClansData,
    updateClanSettings,
    createClan,
    updateClan,
    deleteClan,
    distributeClans,
    clearClans,
    resetClanSeason,
    type ClanEntry,
    type ClansDataResult
  } from '../lib/api';

  const actionState = createAsyncActionState();
  let loading = $state(false);
  let showModal = $state(false);
  let editingClan = $state<ClanEntry | null>(null);

  // States
  let clansEnabled = $state(false);
  let clansUnique = $state(true);
  let currentClanSeason = $state(1);
  let clanXpFromActivity = $state(true);
  let clanXpFromLevelUp = $state(false);
  let clanXpPerLevelUp = $state(50);
  let clans = $state<ClanEntry[]>([]);
  let taskInProgress = $state<ClansDataResult['taskInProgress']>(null);

  // Saved states (for dirty checking)
  let savedClansEnabled = $state(false);
  let savedClansUnique = $state(true);
  let savedClanXpFromActivity = $state(true);
  let savedClanXpFromLevelUp = $state(false);
  let savedClanXpPerLevelUp = $state(50);

  // Form states
  let formName = $state('');
  let formDescription = $state('');
  let formRoleId = $state('');

  // Confirmation state for reset/clear/distribute
  let confirmInput = $state('');
  let confirmActionType = $state<'clear' | 'reset' | 'distribute' | null>(null);
  let showConfirmModal = $state(false);

  const canManageSettings = $derived(
    !!dashboardStore.state.featureAccess?.welcome_goodbye?.canConfigure
      || !!dashboardStore.state.access?.canManageSettings
  );

  const availableRoles = $derived(dashboardStore.state.discordRoles || []);

  // Sync state changes with the unsaved changes bar
  $effect(() => {
    const dirty = clansEnabled !== savedClansEnabled 
      || clansUnique !== savedClansUnique
      || clanXpFromActivity !== savedClanXpFromActivity
      || clanXpFromLevelUp !== savedClanXpFromLevelUp
      || clanXpPerLevelUp !== savedClanXpPerLevelUp;

    if (dirty && canManageSettings) {
      untrack(() => {
        unsavedChanges.register({
          label: 'Configuration des Clans',
          onSave: () => handleSaveSettings(),
          onReset: () => {
            clansEnabled = savedClansEnabled;
            clansUnique = savedClansUnique;
            clanXpFromActivity = savedClanXpFromActivity;
            clanXpFromLevelUp = savedClanXpFromLevelUp;
            clanXpPerLevelUp = savedClanXpPerLevelUp;
          }
        });
      });
    } else if (!dirty) {
      untrack(() => {
        if (unsavedChanges.isDirty && unsavedChanges.pageLabel === 'Configuration des Clans') {
          unsavedChanges.clear();
        }
      });
    }
  });

  // Polling mechanism while a background operation is active
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  $effect(() => {
    if (taskInProgress && !pollInterval) {
      pollInterval = setInterval(() => {
        void refreshData(true);
      }, 2000);
    } else if (!taskInProgress && pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  });

  onDestroy(() => {
    if (unsavedChanges.pageLabel === 'Configuration des Clans') {
      unsavedChanges.clear();
    }
    if (pollInterval) {
      clearInterval(pollInterval);
    }
  });

  async function refreshData(silent = false) {
    if (!silent) loading = true;
    try {
      const res = await fetchClansData();
      if (res) {
        clansEnabled = res.clansEnabled;
        clansUnique = res.clansUnique;
        currentClanSeason = res.currentClanSeason;
        clanXpFromActivity = res.clanXpFromActivity;
        clanXpFromLevelUp = res.clanXpFromLevelUp;
        clanXpPerLevelUp = res.clanXpPerLevelUp;
        clans = res.clans;
        taskInProgress = res.taskInProgress;

        if (!silent) {
          savedClansEnabled = res.clansEnabled;
          savedClansUnique = res.clansUnique;
          savedClanXpFromActivity = res.clanXpFromActivity;
          savedClanXpFromLevelUp = res.clanXpFromLevelUp;
          savedClanXpPerLevelUp = res.clanXpPerLevelUp;
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) loading = false;
    }
  }

  onMount(async () => {
    await dashboardStore.refresh();
    await refreshData();
  });

  async function handleSaveSettings(): Promise<boolean> {
    if (!canManageSettings) return false;
    let success = false;
    await actionState.run(async () => {
      const res = await updateClanSettings({
        clansEnabled,
        clansUnique,
        clanXpFromActivity,
        clanXpFromLevelUp,
        clanXpPerLevelUp
      });
      if (!res) throw new Error('Erreur de sauvegarde');
      
      savedClansEnabled = res.clansEnabled;
      savedClansUnique = res.clansUnique;
      savedClanXpFromActivity = res.clanXpFromActivity;
      savedClanXpFromLevelUp = res.clanXpFromLevelUp;
      savedClanXpPerLevelUp = res.clanXpPerLevelUp;
      success = true;
      return true;
    }, { successMessage: 'Paramètres des clans sauvegardés avec succès !' });
    return success;
  }

  function openCreateModal() {
    editingClan = null;
    formName = '';
    formDescription = '';
    formRoleId = '';
    actionState.clearFeedback();
    showModal = true;
  }

  function openEditModal(clan: ClanEntry) {
    editingClan = clan;
    formName = clan.name;
    formDescription = clan.description || '';
    formRoleId = clan.roleId;
    actionState.clearFeedback();
    showModal = true;
  }

  async function handleSaveClan() {
    if (!canManageSettings || !formName || !formRoleId) return;

    await actionState.run(async () => {
      if (editingClan) {
        const res = await updateClan(editingClan.id, {
          name: formName,
          description: formDescription || undefined,
          roleId: formRoleId
        });
        if (!res) throw new Error('Erreur lors de la modification');
        clans = clans.map(c => c.id === editingClan!.id ? res.clan : c);
      } else {
        const res = await createClan({
          name: formName,
          description: formDescription || undefined,
          roleId: formRoleId
        });
        if (!res) throw new Error('Erreur lors de la création');
        clans = [...clans, res.clan];
      }
      showModal = false;
      await refreshData(true);
      return true;
    }, { successMessage: editingClan ? 'Clan modifié avec succès !' : 'Clan créé avec succès !' });
  }

  async function handleDeleteClan(clan: ClanEntry) {
    if (!canManageSettings) return;
    if (!confirm(`Voulez-vous vraiment supprimer le clan "${clan.name}" ?`)) return;

    await actionState.run(async () => {
      const success = await deleteClan(clan.id);
      if (!success) throw new Error('Erreur de suppression');
      clans = clans.filter(c => c.id !== clan.id);
      return true;
    }, { successMessage: 'Clan supprimé.' });
  }

  function openConfirmation(type: 'clear' | 'reset' | 'distribute') {
    confirmActionType = type;
    confirmInput = '';
    showConfirmModal = true;
  }

  async function handleConfirmAction() {
    if (!canManageSettings || !confirmActionType) return;

    const expected = confirmActionType === 'clear' 
      ? 'RETIRER' 
      : confirmActionType === 'reset' 
      ? 'RESET' 
      : 'DISTRIBUER';

    if (confirmInput.toUpperCase() !== expected) {
      alert('Veuillez saisir le mot de confirmation correct.');
      return;
    }

    showConfirmModal = false;

    await actionState.run(async () => {
      if (confirmActionType === 'clear') {
        const res = await clearClans();
        if (!res) throw new Error('Erreur lors du retrait');
        await refreshData(true);
      } else if (confirmActionType === 'reset') {
        const res = await resetClanSeason();
        if (!res) throw new Error('Erreur lors du reset');
        currentClanSeason = res.currentClanSeason;
        await refreshData(true);
      } else if (confirmActionType === 'distribute') {
        const res = await distributeClans();
        if (!res) throw new Error('Erreur lors du lancement');
        await refreshData(true);
      }
      return true;
    }, {
      successMessage: confirmActionType === 'clear'
        ? 'Retrait de tous les rôles démarré en arrière-plan.'
        : confirmActionType === 'reset'
        ? 'Nouvelle saison de clans démarrée !'
        : 'Distribution aléatoire lancée en arrière-plan.'
    });
  }

  function handleDistribute() {
    if (!canManageSettings) return;
    if (clans.length === 0) {
      alert('Veuillez configurer au moins un clan avant de lancer la distribution.');
      return;
    }
    openConfirmation('distribute');
  }
</script>

<ModulePage
  title="Clans"
  description="Divisez votre communauté en clans basés sur des rôles Discord et suivez la compétition."
  icon="Shield"
  featureKey="welcome_goodbye"
>
  <InlineFeedback state={actionState} />

  {#if loading}
    <div class="space-y-6">
      <Skeleton height="80px" />
      <Skeleton height="300px" />
    </div>
    <div class="flex justify-center mt-4">
      <LoadingHint context="clans" />
    </div>
  {:else}
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
      
      <!-- Left side: General Settings -->
      <div class="xl:col-span-1 space-y-6">
        <section class="bg-surface-container-low/40 border border-outline-variant/30 p-6 rounded-xl space-y-6">
          <h3 class="text-lg font-semibold border-b border-outline-variant/15 pb-2">⚙️ Configuration</h3>
          
          <div class="space-y-4 divide-y divide-outline-variant/10">
            <div class="space-y-4 pb-4">
              <div class="flex items-center justify-between">
                <div>
                  <span class="text-sm font-medium text-on-surface">Activer les clans</span>
                  <p class="text-xs text-on-surface-variant/70">Active les commandes slash /clan et la sécurité.</p>
                </div>
                <ToggleSwitch bind:checked={clansEnabled} disabled={!canManageSettings} />
              </div>

              <div class="flex items-center justify-between">
                <div>
                  <span class="text-sm font-medium text-on-surface">Clan Unique</span>
                  <p class="text-xs text-on-surface-variant/70">Force un seul rôle de clan par membre Discord.</p>
                </div>
                <ToggleSwitch bind:checked={clansUnique} disabled={!canManageSettings} />
              </div>
            </div>

            <div class="space-y-4 pt-4">
              <h4 class="text-xs font-bold text-on-surface-variant/80 uppercase tracking-wider">⚡ Sources de points</h4>
              
              <div class="flex items-center justify-between">
                <div>
                  <span class="text-sm font-medium text-on-surface">Activité (écrit / vocal)</span>
                  <p class="text-xs text-on-surface-variant/70">Gagne des points de clan via l'XP de chat/vocal.</p>
                </div>
                <ToggleSwitch bind:checked={clanXpFromActivity} disabled={!canManageSettings} />
              </div>

              <div class="flex items-center justify-between">
                <div>
                  <span class="text-sm font-medium text-on-surface">Passage de niveau</span>
                  <p class="text-xs text-on-surface-variant/70">Points bonus offerts lors d'un level up sur le serveur.</p>
                </div>
                <ToggleSwitch bind:checked={clanXpFromLevelUp} disabled={!canManageSettings} />
              </div>

              {#if clanXpFromLevelUp}
                <div class="space-y-1.5 pl-4 animate-in slide-in-from-top-2 duration-200">
                  <label for="clan-xp-levelup-amount" class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">Points attribués par niveau</label>
                  <div class="flex items-center gap-2">
                    <input
                      id="clan-xp-levelup-amount"
                      type="number"
                      bind:value={clanXpPerLevelUp}
                      min="0"
                      class="w-24 bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-2.5 py-1.5 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/40 font-bold"
                      disabled={!canManageSettings}
                    />
                    <span class="text-xs text-on-surface-variant/60 font-semibold">XP / niveau</span>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        </section>

        <!-- Seasons control -->
        <section class="bg-surface-container-low/40 border border-outline-variant/30 p-6 rounded-xl space-y-6">
          <div class="flex items-center justify-between border-b border-outline-variant/15 pb-2">
            <h3 class="text-lg font-semibold">📅 Saison Actuelle</h3>
            <span class="px-3 py-1 bg-amber-500/10 text-amber-500 text-xs font-bold rounded-full">Saison {currentClanSeason}</span>
          </div>

          <div class="space-y-4">
            <p class="text-xs text-on-surface-variant/70">
              Passer à la saison suivante réinitialise l'XP active de tous les clans à 0. L'historique des contributions des anciennes saisons reste conservé en base de données.
            </p>
            {#if canManageSettings}
              <button
                onclick={() => openConfirmation('reset')}
                class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer"
              >
                <Papicon icon="Refresh" size={14} /> Réinitialiser la Saison (Reset)
              </button>
            {/if}
          </div>
        </section>

        <!-- Bulk Task Progress Bar -->
        {#if taskInProgress}
          <section class="bg-primary/5 border border-primary/20 p-6 rounded-xl space-y-4 animate-pulse">
            <h3 class="text-sm font-bold text-primary uppercase tracking-wider flex items-center gap-2">
              <svg class="animate-spin h-4 w-4 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Tâche en arrière-plan active
            </h3>
            
            <div class="space-y-2">
              <div class="flex justify-between text-xs font-medium text-on-surface-variant">
                <span>{taskInProgress.type === 'distribute' ? 'Distribution aléatoire' : 'Retrait des rôles'}</span>
                <span>{taskInProgress.processed} / {taskInProgress.total}</span>
              </div>
              <div class="w-full bg-surface-container-high rounded-full h-2">
                <div class="bg-primary h-2 rounded-full transition-all duration-300" style="width: {taskInProgress.total > 0 ? (taskInProgress.processed / taskInProgress.total) * 100 : 0}%"></div>
              </div>
            </div>
          </section>
        {/if}
      </div>

      <!-- Right side: Clans List & Leaderboard -->
      <div class="xl:col-span-2 space-y-6">
        <section class="bg-surface-container-low/40 border border-outline-variant/30 p-6 rounded-xl space-y-6">
          <div class="flex items-center justify-between border-b border-outline-variant/15 pb-3">
            <h3 class="text-lg font-semibold">🛡️ Clans Configurés</h3>
            <div class="flex gap-2">
              {#if canManageSettings}
                <button
                  onclick={() => openConfirmation('clear')}
                  class="flex items-center gap-1.5 px-3 py-1.5 border border-rose-500/30 hover:bg-rose-500/10 text-rose-500 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                  title="Retirer tous les rôles de clan du serveur"
                >
                  <Papicon icon="Trash" size={12} /> Retirer à tous
                </button>
                <button
                  onclick={handleDistribute}
                  class="flex items-center gap-1.5 px-3 py-1.5 bg-secondary/15 hover:bg-secondary/25 text-secondary font-bold text-xs rounded-lg transition-colors cursor-pointer"
                  title="Distribuer aléatoirement les membres sans clan"
                >
                  <Papicon icon="Users" size={12} /> Distribuer
                </button>
                <button
                  onclick={openCreateModal}
                  class="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary font-bold text-xs rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
                >
                  <Papicon icon="Add" size={12} /> Nouveau clan
                </button>
              {/if}
            </div>
          </div>

          {#if clans.length === 0}
            <div class="flex flex-col items-center justify-center py-12 text-center">
              <p class="text-sm text-on-surface-variant/60 font-medium">Aucun clan n'a été créé.</p>
              <p class="text-xs text-on-surface-variant/40">Cliquez sur « Nouveau clan » pour commencer la configuration.</p>
            </div>
          {:else}
            <!-- Clans table -->
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="border-b border-outline-variant/10 text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-wider">
                    <th class="pb-3">Clan</th>
                    <th class="pb-3">Rôle Discord</th>
                    <th class="pb-3 text-center">Membres</th>
                    <th class="pb-3 text-right">XP Cumulée</th>
                    {#if canManageSettings}
                      <th class="pb-3 text-right">Actions</th>
                    {/if}
                  </tr>
                </thead>
                <tbody class="divide-y divide-outline-variant/10">
                  {#each clans as clan}
                    <tr class="hover:bg-surface-container-low/20 transition-colors">
                      <td class="py-4">
                        <span class="font-bold text-sm text-on-surface">{clan.name}</span>
                        {#if clan.description}
                          <p class="text-xs text-on-surface-variant/70 max-w-[200px] truncate">{clan.description}</p>
                        {/if}
                      </td>
                      <td class="py-4">
                        <span class="px-2 py-1 bg-surface-container-high rounded text-xs text-on-surface-variant">
                          {availableRoles.find(r => r.id === clan.roleId)?.name || `ID: ${clan.roleId}`}
                        </span>
                      </td>
                      <td class="py-4 text-center font-medium text-xs text-on-surface">
                        {clan.memberCount}
                      </td>
                      <td class="py-4 text-right font-bold text-xs text-amber-500">
                        {clan.totalXp.toLocaleString('fr-FR')} XP
                      </td>
                      {#if canManageSettings}
                        <td class="py-4 text-right space-x-2">
                          <button
                            onclick={() => openEditModal(clan)}
                            class="p-1.5 hover:bg-surface-container-high rounded-lg text-on-surface-variant transition-colors cursor-pointer inline-flex"
                            title="Modifier"
                          >
                            <Papicon icon="Edit" size={14} />
                          </button>
                          <button
                            onclick={() => handleDeleteClan(clan)}
                            class="p-1.5 hover:bg-rose-500/10 text-rose-500 rounded-lg transition-colors cursor-pointer inline-flex"
                            title="Supprimer"
                          >
                            <Papicon icon="Trash" size={14} />
                          </button>
                        </td>
                      {/if}
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </section>
      </div>

    </div>
  {/if}
</ModulePage>

<!-- Modal: Créer / Éditer un Clan -->
{#if showModal}
  <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" transition:fade={{ duration: 150 }}>
    <div class="bg-surface-container-low/95 border border-outline-variant/20 max-w-lg w-full rounded-xl p-6 space-y-6 shadow-lg relative" transition:scale={{ start: 0.97, duration: 150 }}>
      
      <button
        onclick={() => showModal = false}
        class="absolute top-6 right-6 p-2 rounded-full bg-surface-container-high/40 hover:bg-rose-500/15 hover:text-rose-500 text-on-surface-variant transition-colors cursor-pointer"
      >
        <Papicon icon="Cross" size={18} />
      </button>

      <div>
        <h3 class="text-xl font-semibold">{editingClan ? 'Modifier le clan' : 'Créer un clan'}</h3>
        <p class="text-xs text-on-surface-variant/80">Liez un rôle Discord et configurez les détails de votre clan.</p>
      </div>

      <form onsubmit={(e) => { e.preventDefault(); handleSaveClan(); }} class="space-y-4">
        <div class="space-y-1.5">
          <label for="clan-name" class="text-[10px] font-bold text-on-surface-variant/60 ml-1 uppercase tracking-widest">Nom du Clan</label>
          <input
            id="clan-name"
            type="text"
            bind:value={formName}
            placeholder="Ex: Griffondor, Guerriers, etc."
            class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
            required
            disabled={!canManageSettings}
          />
        </div>

        <div class="space-y-1.5">
          <label for="clan-desc" class="text-[10px] font-bold text-on-surface-variant/60 ml-1 uppercase tracking-widest">Description</label>
          <textarea
            id="clan-desc"
            bind:value={formDescription}
            placeholder="Description du clan, son histoire ou sa devise..."
            class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none h-20"
            disabled={!canManageSettings}
          ></textarea>
        </div>

        <div class="space-y-1.5">
          <label for="clan-role" class="text-[10px] font-bold text-on-surface-variant/60 ml-1 uppercase tracking-widest">Rôle Discord Associé</label>
          <SearchableSelect
            id="clan-role"
            bind:value={formRoleId}
            options={availableRoles.map(r => ({ id: r.id, name: r.name }))}
            placeholder="Choisir le rôle Discord"
            disabled={!canManageSettings}
          />
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onclick={() => showModal = false}
            class="px-4 py-2 border border-outline-variant/30 hover:bg-surface-container-high/60 text-on-surface text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="submit"
            class="px-4 py-2 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
          >
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Modal: Confirmation de Double Validation (Reset / Clear) -->
{#if showConfirmModal}
  <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" transition:fade={{ duration: 150 }}>
    <div class="bg-surface-container-low border border-outline-variant/20 max-w-md w-full rounded-xl p-6 space-y-6 shadow-lg relative" transition:scale={{ start: 0.97, duration: 150 }}>
      
      <button
        onclick={() => showConfirmModal = false}
        class="absolute top-6 right-6 p-2 rounded-full bg-surface-container-high/40 hover:bg-rose-500/15 hover:text-rose-500 text-on-surface-variant transition-colors cursor-pointer"
      >
        <Papicon icon="Cross" size={18} />
      </button>

      <div>
        <h3 class="text-lg font-semibold text-rose-500 flex items-center gap-2">
          <Papicon icon="AlertTriangle" size={20} />
          Validation requise
        </h3>
        <p class="text-xs text-on-surface-variant/80 mt-1">
          {#if confirmActionType === 'clear'}
            Vous vous apprêtez à <strong>retirer tous les rôles de clan</strong> de tous les membres du serveur. Cette action s'exécute progressivement en arrière-plan.
          {:else}
            {#if confirmActionType === 'reset'}
              Vous vous apprêtez à <strong>clore la saison active</strong> de clans et à passer à la suivante. Les scores d'XP des clans repartiront à 0.
            {:else if confirmActionType === 'distribute'}
              Vous vous apprêtez à <strong>distribuer aléatoirement un clan</strong> à tous les membres sans clan. Cette action s'exécute progressivement en arrière-plan.
            {/if}
          {/if}
        </p>
      </div>

      <div class="space-y-4">
        <div class="space-y-1.5">
          <label for="confirm-word" class="text-[10px] font-bold text-on-surface-variant/60 ml-1 uppercase tracking-widest">
            Saisissez <strong>{confirmActionType === 'clear' ? 'RETIRER' : confirmActionType === 'reset' ? 'RESET' : 'DISTRIBUER'}</strong> pour confirmer
          </label>
          <input
            id="confirm-word"
            type="text"
            bind:value={confirmInput}
            placeholder={confirmActionType === 'clear' ? 'RETIRER' : confirmActionType === 'reset' ? 'RESET' : 'DISTRIBUER'}
            class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none font-bold uppercase tracking-wider"
          />
        </div>

        <div class="flex justify-end gap-2">
          <button
            type="button"
            onclick={() => showConfirmModal = false}
            class="px-4 py-2 border border-outline-variant/30 hover:bg-surface-container-high/60 text-on-surface text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="button"
            onclick={handleConfirmAction}
            class="px-4 py-2 bg-rose-500 text-white text-xs font-semibold rounded-lg hover:bg-rose-600 transition-colors cursor-pointer"
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
