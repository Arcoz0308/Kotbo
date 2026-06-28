<script lang="ts">
  import { channelDisplayName } from '../lib/channelUtils';
  import { onMount, onDestroy, untrack } from 'svelte';
  import { unsavedChanges } from '../lib/stores/unsavedChanges.svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import SearchableSelect from '../lib/components/SearchableSelect.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';
  import { 
    fetchLevelingData, 
    updateLevelingConfig, 
    addLevelingReward, 
    deleteLevelingReward,
    importLevelingData
  } from '../lib/api';

  const saveAction = createAsyncActionState();
  const rewardAction = createAsyncActionState();
  let loading = $state(false);
  let activeTab = $state<'config' | 'leaderboard' | 'import'>('config');
  let copySuccess = $state(false);

  const canManageSettings = $derived(
    !!(dashboardStore.state.featureAccess as any)?.leveling?.canConfigure
      || !!dashboardStore.state.access?.canManageSettings
  );

  const availableChannels = $derived(dashboardStore.state.discordChannels || []);
  const availableRoles = $derived(dashboardStore.state.discordRoles || []);

  // URL publique du classement
  const publicLeaderboardUrl = $derived(
    authStore.selectedGuildId
      ? `${window.location.origin}/${authStore.selectedGuildId}/leveling/classement`
      : ''
  );

  let config = $state({
    enabled: false,
    xpMin: 15,
    xpMax: 25,
    cooldownSeconds: 60,
    vocalXpPerMin: 5,
    levelUpChannelId: null as string | null,
    levelUpMessage: 'Félicitations {user} ! Tu passes au niveau **{level}** ! 🎉',
    stackRewards: false,
    ignoredChannels: [] as string[],
    ignoredRoles: [] as string[],
    xpMultipliers: {} as Record<string, number>
  });

  // Snapshot of last-saved state
  let savedConfig = $state(JSON.parse(JSON.stringify({
    enabled: false,
    xpMin: 15,
    xpMax: 25,
    cooldownSeconds: 60,
    vocalXpPerMin: 5,
    levelUpChannelId: null as string | null,
    levelUpMessage: 'Félicitations {user} ! Tu passes au niveau **{level}** ! 🎉',
    stackRewards: false,
    ignoredChannels: [] as string[],
    ignoredRoles: [] as string[],
    xpMultipliers: {} as Record<string, number>
  })));

  $effect(() => {
    const dirty = JSON.stringify(config) !== JSON.stringify(savedConfig);
    if (dirty && canManageSettings) {
      untrack(() => {
        unsavedChanges.register({
          label: 'Leveling & XP',
          onSave: () => handleSaveConfig(),
          onReset: () => {
            config = JSON.parse(JSON.stringify(savedConfig));
          }
        });
      });
    } else if (!dirty) {
      untrack(() => {
        if (unsavedChanges.isDirty && unsavedChanges.pageLabel === 'Leveling & XP') {
          unsavedChanges.clear();
        }
      });
    }
  });

  onDestroy(() => {
    if (unsavedChanges.pageLabel === 'Leveling & XP') {
      unsavedChanges.clear();
    }
  });

  let rewards = $state<Array<{ id: string; level: number; roleId: string }>>([]);
  let levels = $state<Array<{ userId: string; xp: number; level: number; lastXpGain: string; username?: string; displayName?: string; avatarUrl?: string }>>([]);

  // Form states for adding reward
  let newRewardLevel = $state<number | null>(null);
  let newRewardRoleId = $state('');

  // New features UI states
  let newMultRoleId = $state('');
  let newMultValue = $state<number | null>(1.5);
  let searchQuery = $state('');
  let pendingIgnoreChannelId = $state<string | null>(null);
  let pendingIgnoreRoleId = $state<string | null>(null);

  $effect(() => {
    const channelId = pendingIgnoreChannelId;
    if (!channelId || config.ignoredChannels.includes(channelId)) return;
    config.ignoredChannels = [...config.ignoredChannels, channelId];
    pendingIgnoreChannelId = null;
  });

  $effect(() => {
    const roleId = pendingIgnoreRoleId;
    if (!roleId || config.ignoredRoles.includes(roleId)) return;
    config.ignoredRoles = [...config.ignoredRoles, roleId];
    pendingIgnoreRoleId = null;
  });

  onMount(async () => {
    loading = true;
    try {
      await dashboardStore.refresh();
      const res = await fetchLevelingData();
      if (res) {
        config = {
          enabled: res.config.enabled ?? false,
          xpMin: res.config.xpMin ?? 15,
          xpMax: res.config.xpMax ?? 25,
          cooldownSeconds: res.config.cooldownSeconds ?? 60,
          vocalXpPerMin: res.config.vocalXpPerMin ?? 5,
          levelUpChannelId: res.config.levelUpChannelId ?? null,
          levelUpMessage: res.config.levelUpMessage ?? '',
          stackRewards: res.config.stackRewards ?? false,
          ignoredChannels: res.config.ignoredChannels ?? [],
          ignoredRoles: res.config.ignoredRoles ?? [],
          xpMultipliers: res.config.xpMultipliers ?? {}
        };
        savedConfig = JSON.parse(JSON.stringify(config));
        rewards = res.rewards || [];
        levels = res.levels || [];
      }
    } catch (err) {
      console.error(err);
    } finally {
      loading = false;
    }
  });

  async function handleSaveConfig(): Promise<boolean> {
    if (!canManageSettings) return false;
    let success = false;
    await saveAction.run(async () => {
      const res = await updateLevelingConfig(config);
      if (!res) throw new Error('Erreur de sauvegarde');
      config = res.config;
      savedConfig = JSON.parse(JSON.stringify(res.config));
      success = true;
      return true;
    }, { successMessage: 'Configuration XP enregistrée.' });
    return success;
  }

  async function handleAddReward() {
    if (!canManageSettings || !newRewardLevel || !newRewardRoleId) return;
    await rewardAction.run(async () => {
      const res = await addLevelingReward(newRewardLevel!, newRewardRoleId);
      if (!res) throw new Error('Erreur d\'ajout');
      rewards = [...rewards, res.reward].sort((a, b) => a.level - b.level);
      newRewardLevel = null;
      newRewardRoleId = '';
      return true;
    }, { successMessage: 'Rôle récompense ajouté.' });
  }

  async function handleDeleteReward(id: string) {
    if (!canManageSettings) return;
    const ok = await deleteLevelingReward(id);
    if (ok) {
      rewards = rewards.filter(r => r.id !== id);
    }
  }

  function getRoleName(roleId: string) {
    const role = availableRoles.find(r => r.id === roleId);
    return role ? `@${role.name}` : `Rôle inconnu (${roleId})`;
  }

  function handleAddMultiplier() {
    if (!newMultRoleId || !newMultValue) return;
    config.xpMultipliers = {
      ...config.xpMultipliers,
      [newMultRoleId]: newMultValue
    };
    newMultRoleId = '';
    newMultValue = 1.5;
  }

  function handleRemoveMultiplier(roleId: string) {
    const updated = { ...config.xpMultipliers };
    delete updated[roleId];
    config.xpMultipliers = updated;
  }

  function getXpForLevel(level: number): number {
    if (level < 0) return 0;
    return 100 * Math.pow(level, 2) + 200 * level;
  }

  // L'XP est la source de vérité : le niveau en est dérivé, identique au bot.
  function getLevelFromXp(xp: number): number {
    if (xp < 0) return 0;
    let level = 0;
    while (xp >= getXpForLevel(level)) {
      level++;
    }
    return level;
  }

  async function copyPublicUrl() {
    if (!publicLeaderboardUrl) return;
    await navigator.clipboard.writeText(publicLeaderboardUrl);
    copySuccess = true;
    setTimeout(() => { copySuccess = false; }, 2000);
  }

  const filteredLevels = $derived(
    levels.filter(u => {
      const q = searchQuery.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
      const name = u.displayName?.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '') || '';
      const username = u.username?.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '') || '';
      return name.includes(q) || username.includes(q) || u.userId.includes(searchQuery);
    })
  );

  // Stats du classement
  const totalXp = $derived(levels.reduce((sum, u) => sum + u.xp, 0));
  const avgLevel = $derived(levels.length > 0 ? Math.round(levels.reduce((sum, u) => sum + getLevelFromXp(u.xp), 0) / levels.length) : 0);
  const maxLevel = $derived(levels.length > 0 ? Math.max(...levels.map(u => getLevelFromXp(u.xp))) : 0);

  // Import states
  let importRawJson = $state('');
  let importFileError = $state<string | null>(null);
  const importActionState = createAsyncActionState();
  let importResults = $state<{
    importedCount: number;
    failedCount: number;
    failedMembers: Array<{ username?: string; display_name?: string; reason: string }>;
  } | null>(null);

  let isDragging = $state(false);

  async function handleImportSubmit() {
    importFileError = null;
    importResults = null;
    if (!importRawJson.trim()) {
      importFileError = 'Veuillez saisir du JSON ou glisser-déposer un fichier.';
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(importRawJson);
    } catch (err) {
      importFileError = `Format JSON invalide : ${(err as Error).message}`;
      return;
    }

    if (!Array.isArray(parsed)) {
      importFileError = 'Le JSON doit être un tableau d\'utilisateurs (ex: [ { ... }, { ... } ]).';
      return;
    }

    await importActionState.run(async () => {
      const res = await importLevelingData(parsed);
      if (!res) throw new Error('Erreur lors de l\'importation');
      importResults = res;
      // Refresh leveling data after import to reflect the new leaderboard
      const updatedData = await fetchLevelingData();
      if (updatedData) {
        levels = updatedData.levels || [];
      }
      return true;
    }, { successMessage: 'Importation terminée avec succès.' });
  }

  function handleFileDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    importFileError = null;
    importResults = null;

    const file = e.dataTransfer?.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      importFileError = 'Seuls les fichiers .json sont acceptés.';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        importRawJson = text;
      }
    };
    reader.onerror = () => {
      importFileError = 'Erreur lors de la lecture du fichier.';
    };
    reader.readAsText(file);
  }

  function handleFileSelect(e: Event) {
    importFileError = null;
    importResults = null;
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      importFileError = 'Seuls les fichiers .json sont acceptés.';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        importRawJson = text;
      }
    };
    reader.onerror = () => {
      importFileError = 'Erreur lors de la lecture du fichier.';
    };
    reader.readAsText(file);
  }
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <!-- En-tête -->
  <header class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-container-low/40 p-5 rounded-xl border border-outline-variant/30">
    <div class="flex items-center gap-4">
      <div class="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
        <Papicon icon="Trophy" size={20} />
      </div>
      <div>
        <h1 class="text-lg font-semibold tracking-tight leading-tight">Leveling & XP</h1>
        <p class="text-sm text-on-surface-variant/70 font-medium">Configurez le gain d'expérience des membres et les rôles de récompense.</p>
      </div>
    </div>
    {#if !loading}
      <div class="flex items-center gap-3 bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-2.5">
        <span class="text-xs font-bold text-on-surface-variant/80">Statut du module :</span>
        <ToggleSwitch
          checked={config.enabled}
          onToggle={(v: boolean) => {
            config.enabled = v;
          }}
          disabled={!canManageSettings}
        />
      </div>
    {/if}
  </header>

  <InlineFeedback state={saveAction} />
  <InlineFeedback state={rewardAction} />

  <!-- Navigation par onglets -->
  <nav class="flex gap-2 bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-2 w-fit">
    <button
      id="tab-config"
      onclick={() => activeTab = 'config'}
      class="flex items-center gap-2.5 px-6 py-3 rounded-lg text-sm font-semibold transition-all duration-300 {activeTab === 'config' ? 'bg-primary text-on-primary  ' : 'text-on-surface-variant/70 hover:bg-surface-container-high/40 hover:text-on-surface'}"
    >
      <Papicon icon="Settings" size={16} />
      Configuration
    </button>
    <button
      id="tab-leaderboard"
      onclick={() => activeTab = 'leaderboard'}
      class="flex items-center gap-2.5 px-6 py-3 rounded-lg text-sm font-semibold transition-all duration-300 {activeTab === 'leaderboard' ? 'bg-tertiary text-on-tertiary shadow-lg shadow-tertiary/20 ' : 'text-on-surface-variant/70 hover:bg-surface-container-high/40 hover:text-on-surface'}"
    >
      <Papicon icon="Grades" size={16} />
      Classement
      {#if levels.length > 0}
        <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-lg {activeTab === 'leaderboard' ? 'bg-on-tertiary/20' : 'bg-surface-container-high/60 text-on-surface-variant/60'}">
          {levels.length}
        </span>
      {/if}
    </button>
    {#if canManageSettings}
      <button
        id="tab-import"
        onclick={() => activeTab = 'import'}
        class="flex items-center gap-2.5 px-6 py-3 rounded-lg text-sm font-semibold transition-all duration-300 {activeTab === 'import' ? 'bg-secondary text-on-secondary shadow-lg shadow-secondary/20 ' : 'text-on-surface-variant/70 hover:bg-surface-container-high/40 hover:text-on-surface'}"
      >
        <Papicon icon="Upload" size={16} />
        Importer
      </button>
    {/if}
  </nav>

  {#if loading}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div class="lg:col-span-2 space-y-8">
        <Skeleton height="350px" radius="2.5rem" />
        <Skeleton height="250px" radius="2.5rem" />
      </div>
      <Skeleton height="620px" radius="2.5rem" />
    </div>
  {:else if activeTab === 'config'}
    <!-- === ONGLET CONFIGURATION === -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-300">
      <div class="lg:col-span-2 space-y-8">
        <!-- Paramètres XP -->
        <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6">
          <h3 class="text-xl font-semibold flex items-center gap-3">
            <Papicon icon="Settings" size={20} class="text-primary" />
            Paramètres d'Expérience (XP)
          </h3>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-1.5">
              <label for="xpMin" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">XP Minimum par message</label>
              <input 
                id="xpMin"
                type="number" 
                bind:value={config.xpMin} 
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
                disabled={!canManageSettings}
              />
            </div>

            <div class="space-y-1.5">
              <label for="xpMax" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">XP Maximum par message</label>
              <input 
                id="xpMax"
                type="number" 
                bind:value={config.xpMax} 
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
                disabled={!canManageSettings}
              />
            </div>

            <div class="space-y-1.5">
              <label for="cooldown" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Cooldown XP Textuelle (secondes)</label>
              <input 
                id="cooldown"
                type="number" 
                bind:value={config.cooldownSeconds} 
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
                disabled={!canManageSettings}
              />
            </div>

            <div class="space-y-1.5">
              <label for="vocalXp" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">XP Vocale par minute</label>
              <input 
                id="vocalXp"
                type="number" 
                bind:value={config.vocalXpPerMin} 
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
                disabled={!canManageSettings}
              />
            </div>

            <!-- Toggle cumul récompenses -->
            <div class="space-y-1.5 flex items-center justify-between bg-surface-container-high/20 border border-outline-variant/5 rounded-lg px-6 py-4 col-span-2 mt-2">
              <div>
                <span class="text-xs font-bold text-on-surface">Cumuler les Rôles de Récompense</span>
                <p class="text-[10px] text-on-surface-variant/60 font-medium">Les membres conservent tous les rôles obtenus au lieu de ne garder que le plus élevé.</p>
              </div>
              <ToggleSwitch 
                checked={config.stackRewards} 
                onToggle={(v: boolean) => { config.stackRewards = v; }} 
                disabled={!canManageSettings}
              />
            </div>

            <!-- Salons exclus -->
            <div class="space-y-2 col-span-2 pt-2 border-t border-outline-variant/10">
              <p class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Salons Exclus (Pas de gain d'XP)</p>
              <div class="flex flex-wrap gap-2 p-2.5 bg-surface-container-high/20 border border-outline-variant/10 rounded-lg min-h-[46px] items-center">
                {#each config.ignoredChannels as channelId}
                  {@const channel = availableChannels.find(c => c.id === channelId)}
                  <span class="flex items-center gap-1.5 px-3 py-1 bg-surface-container-low text-xs font-bold text-on-surface-variant rounded-xl border border-outline-variant/10 shadow-sm">
                    #{channel ? channel.name : channelId}
                    {#if canManageSettings}
                      <button type="button" onclick={() => config.ignoredChannels = config.ignoredChannels.filter(id => id !== channelId)} class="text-[10px] text-error  transition-transform">✕</button>
                    {/if}
                  </span>
                {:else}
                  <span class="text-xs text-on-surface-variant/40 ml-2 font-medium">Aucun salon exclu. Tous les salons rapportent de l'XP.</span>
                {/each}
              </div>
              {#if canManageSettings}
                <div class="relative w-full">
                  <SearchableSelect 
                    bind:value={pendingIgnoreChannelId}
                    options={availableChannels.filter(c => !config.ignoredChannels.includes(c.id)).map(c => ({ id: c.id, name: channelDisplayName(c) }))} 
                    placeholder="Ajouter un salon à exclure..." 
                    className="w-full"
                    clearable={false}
                  />
                </div>
              {/if}
            </div>

            <!-- Rôles exclus -->
            <div class="space-y-2 col-span-2 pt-2 border-t border-outline-variant/10">
              <p class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Rôles Exclus (Pas de gain d'XP)</p>
              <div class="flex flex-wrap gap-2 p-2.5 bg-surface-container-high/20 border border-outline-variant/10 rounded-lg min-h-[46px] items-center">
                {#each config.ignoredRoles as roleId}
                  {@const role = availableRoles.find(r => r.id === roleId)}
                  <span class="flex items-center gap-1.5 px-3 py-1 bg-surface-container-low text-xs font-bold text-on-surface-variant rounded-xl border border-outline-variant/10 shadow-sm">
                    @{role ? role.name : roleId}
                    {#if canManageSettings}
                      <button type="button" onclick={() => config.ignoredRoles = config.ignoredRoles.filter(id => id !== roleId)} class="text-[10px] text-error  transition-transform">✕</button>
                    {/if}
                  </span>
                {:else}
                  <span class="text-xs text-on-surface-variant/40 ml-2 font-medium">Aucun rôle exclu. Tous les membres gagnent de l'XP.</span>
                {/each}
              </div>
              {#if canManageSettings}
                <div class="relative w-full">
                  <SearchableSelect 
                    bind:value={pendingIgnoreRoleId}
                    options={availableRoles.filter(r => !config.ignoredRoles.includes(r.id)).map(r => ({ id: r.id, name: `@${r.name}` }))} 
                    placeholder="Ajouter un rôle à exclure..." 
                    className="w-full"
                    clearable={false}
                  />
                </div>
              {/if}
            </div>

            <!-- Multiplicateurs par rôle -->
            <div class="space-y-4 pt-4 border-t border-outline-variant/20 col-span-2">
              <h4 class="text-sm font-bold text-on-surface-variant">Multiplicateurs d'XP par Rôle</h4>
              
              {#if canManageSettings}
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end bg-surface-container-high/20 p-4 rounded-xl border border-outline-variant/5">
                  <div class="space-y-1.5">
                    <label for="multRole" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Rôle</label>
                    <SearchableSelect 
                      id="multRole"
                      bind:value={newMultRoleId}
                      options={availableRoles.filter(r => !Object.keys(config.xpMultipliers).includes(r.id)).map(r => ({ id: r.id, name: `@${r.name}` }))} 
                      placeholder="Choisir un rôle" 
                      className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg"
                      clearable={true}
                    />
                  </div>

                  <div class="space-y-1.5">
                    <label for="multValue" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Multiplicateur</label>
                    <input 
                      id="multValue"
                      type="number" 
                      step="0.1"
                      min="0.1"
                      max="10"
                      bind:value={newMultValue} 
                      class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
                    />
                  </div>

                  <button 
                    type="button"
                    onclick={handleAddMultiplier}
                    disabled={!newMultRoleId || !newMultValue}
                    class="w-full py-3.5 bg-secondary text-on-secondary font-semibold uppercase tracking-widest text-xs rounded-lg hover:scale-105 transition-all disabled:opacity-50"
                  >
                    Ajouter
                  </button>
                </div>
              {/if}

              <div class="overflow-hidden rounded-lg border border-outline-variant/10 bg-surface-container-low/10">
                <table class="w-full border-collapse text-left">
                  <thead>
                    <tr class="bg-surface-container-high/50 border-b border-outline-variant/10">
                      <th class="px-6 py-3 text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider">Rôle</th>
                      <th class="px-6 py-3 text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider">Multiplicateur</th>
                      {#if canManageSettings}
                        <th class="px-6 py-3 text-right text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider">Actions</th>
                      {/if}
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-outline-variant/5">
                    {#each Object.entries(config.xpMultipliers) as [roleId, mult]}
                      <tr class="hover:bg-surface-hover/20 transition-all font-semibold">
                        <td class="px-6 py-3.5 text-sm font-semibold">{getRoleName(roleId)}</td>
                        <td class="px-6 py-3.5 text-sm font-semibold text-primary">{mult}x</td>
                        {#if canManageSettings}
                          <td class="px-6 py-3.5 text-right">
                            <button 
                              type="button"
                              onclick={() => handleRemoveMultiplier(roleId)}
                              class="p-2 text-error hover:bg-error/10 rounded-xl transition-all"
                              title="Supprimer"
                            >
                              <Papicon icon="Trash" size={14} />
                            </button>
                          </td>
                        {/if}
                      </tr>
                    {:else}
                      <tr>
                        <td colspan={canManageSettings ? 3 : 2} class="px-6 py-6 text-center text-xs text-on-surface-variant/60 font-medium">Aucun multiplicateur configuré.</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="space-y-6 pt-4 border-t border-outline-variant/20">
            <h4 class="text-sm font-bold text-on-surface-variant">Notifications de niveau supérieur</h4>
            
            <div class="space-y-1.5">
              <label for="lvlChannel" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Salon de Level-Up</label>
              <SearchableSelect 
                id="lvlChannel"
                bind:value={config.levelUpChannelId} 
                options={[
                  { id: '', name: '💬 Salon d\'origine du message' },
                  { id: 'DM', name: '✉️ Message Privé (DM)' },
                  ...availableChannels.map(c => ({ id: c.id, name: channelDisplayName(c) }))
                ]} 
                placeholder="— Sélectionner —" 
                className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all"
                disabled={!canManageSettings}
              />
            </div>

            <div class="space-y-1.5">
              <label for="lvlMsg" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Message de Level-Up</label>
              <input 
                id="lvlMsg"
                type="text" 
                bind:value={config.levelUpMessage} 
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
                placeholder={"Ex: Bravo {user} ! Tu es niveau {level} !"}
                disabled={!canManageSettings}
              />
              <p class="text-[11px] text-on-surface-variant/40 ml-2">Variables utilisables : <code class="bg-surface-container px-1 py-0.5 rounded text-primary dark:text-blue-300">{`{user}`}</code> (mention), <code class="bg-surface-container px-1 py-0.5 rounded text-primary dark:text-blue-300">{`{username}`}</code>, <code class="bg-surface-container px-1 py-0.5 rounded text-primary dark:text-blue-300">{`{level}`}</code></p>
            </div>
          </div>

          <!-- Save button removed since global bottom bar handles saving -->
        </section>
      </div>

      <!-- Récompenses (sidebar droite) -->
      <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6">
        <h3 class="text-xl font-semibold flex items-center gap-3">
          <Papicon icon="Award" size={20} class="text-secondary" />
          Rôles Récompenses
        </h3>

        {#if canManageSettings}
          <form onsubmit={(e) => { e.preventDefault(); handleAddReward(); }} class="space-y-4 bg-surface-container-high/20 p-4 rounded-xl border border-outline-variant/5">
            <div class="space-y-1.5">
              <label for="rewardLvl" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Niveau Requis</label>
              <input 
                id="rewardLvl"
                type="number" 
                min="1"
                placeholder="Ex: 5"
                bind:value={newRewardLevel} 
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
                required
              />
            </div>

            <div class="space-y-1.5">
              <label for="rewardRole" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Rôle à attribuer</label>
              <SearchableSelect 
                id="rewardRole"
                bind:value={newRewardRoleId} 
                options={availableRoles.map(r => ({ id: r.id, name: `@${r.name}` }))} 
                placeholder="Choisir un rôle" 
                className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all"
              />
            </div>

            <button 
              type="submit"
              disabled={!newRewardLevel || !newRewardRoleId}
              class="w-full py-3.5 bg-secondary text-on-secondary font-semibold uppercase tracking-widest text-xs rounded-lg hover:scale-105 transition-all disabled:opacity-50"
            >
              Ajouter le rôle récompense
            </button>
          </form>
        {/if}

        <div class="overflow-hidden rounded-xl border border-outline-variant/10 bg-surface-container-low/10">
          <table class="w-full border-collapse text-left">
            <thead>
              <tr class="bg-surface-container-high/50 border-b border-outline-variant/10">
                <th class="px-5 py-4 text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider">Niveau</th>
                <th class="px-5 py-4 text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider">Rôle</th>
                {#if canManageSettings}
                  <th class="px-5 py-4 text-right text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider">–</th>
                {/if}
              </tr>
            </thead>
            <tbody class="divide-y divide-outline-variant/5">
              {#each rewards as reward}
                <tr class="hover:bg-surface-hover/20 transition-all">
                  <td class="px-5 py-4 font-semibold text-primary text-sm">Lvl {reward.level}</td>
                  <td class="px-5 py-4 text-xs font-semibold">{getRoleName(reward.roleId)}</td>
                  {#if canManageSettings}
                    <td class="px-5 py-4 text-right">
                      <button 
                        onclick={() => handleDeleteReward(reward.id)}
                        class="p-2 text-error hover:bg-error/10 rounded-xl transition-all"
                        title="Supprimer la récompense"
                      >
                        <Papicon icon="Trash" size={14} />
                      </button>
                    </td>
                  {/if}
                </tr>
              {:else}
                <tr>
                  <td colspan={canManageSettings ? 3 : 2} class="px-5 py-8 text-center text-xs text-on-surface-variant/60 font-medium">Aucun rôle de récompense.</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    </div>

  {:else if activeTab === 'leaderboard'}
    <!-- === ONGLET CLASSEMENT === -->
    <div class="space-y-6 animate-in fade-in duration-300">

      <!-- Bannière lien public premium -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-linear-to-r from-tertiary/10 to-secondary/10 border border-tertiary/20 rounded-xl p-6 px-8 shadow-xs relative overflow-hidden group">
        <div class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700" style="background: radial-gradient(circle, color-mix(in srgb, var(--color-tertiary) 5%, transparent) 0%, transparent 70%);"></div>
        <div class="flex items-center gap-4 relative z-10">
          <div class="w-12 h-12 rounded-lg bg-tertiary/10 border border-tertiary/20 flex items-center justify-center text-tertiary shadow-inner transform  transition-transform duration-350">
            <Papicon icon="Globe" size={22} />
          </div>
          <div>
            <p class="text-sm font-semibold text-on-surface">Page publique du classement</p>
            <p class="text-xs text-on-surface-variant/70 font-medium">Partagez ce lien avec vos membres pour qu'ils consultent leur progression en direct.</p>
          </div>
        </div>
        <div class="flex items-center gap-3 shrink-0 relative z-10 w-full sm:w-auto">
          <a
            href={publicLeaderboardUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center justify-center gap-2 px-5 py-3 bg-tertiary/20 text-tertiary border border-tertiary/25 rounded-lg text-xs font-semibold hover:bg-tertiary/30 transition-all hover:scale-103 w-full sm:w-auto text-center"
          >
            <Papicon icon="ExternalLink" size={14} />
            Voir la page
          </a>
          <button
            onclick={copyPublicUrl}
            class="flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-xs font-semibold transition-all hover:scale-103 w-full sm:w-auto {copySuccess ? 'bg-green-500/15 text-green-400 border border-green-500/20' : 'bg-surface-container-high/40 text-on-surface-variant border border-outline-variant/10 hover:bg-surface-container-high/60'}"
          >
            {#if copySuccess}
              <Papicon icon="Check" size={14} />
              Copié !
            {:else}
              <Papicon icon="Copy" size={14} />
              Copier le lien
            {/if}
          </button>
        </div>
      </div>

      <!-- Stats globales -->
      {#if levels.length > 0}
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-5 text-center space-y-1.5 hover:border-primary/20 transition-all duration-300 group">
            <p class="text-2xl font-semibold text-primary  transition-transform duration-300">{levels.length}</p>
            <p class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">Membres classés</p>
          </div>
          <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-5 text-center space-y-1.5 hover:border-secondary/20 transition-all duration-300 group">
            <p class="text-2xl font-semibold text-secondary  transition-transform duration-300">{maxLevel}</p>
            <p class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">Niveau max</p>
          </div>
          <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-5 text-center space-y-1.5 hover:border-tertiary/20 transition-all duration-300 group">
            <p class="text-2xl font-semibold text-tertiary  transition-transform duration-300">{avgLevel}</p>
            <p class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">Niveau moyen</p>
          </div>
          <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-5 text-center space-y-1.5 hover:border-amber-500/20 transition-all duration-300 group">
            <p class="text-2xl font-semibold text-amber-500  transition-transform duration-300">{(totalXp / 1000).toFixed(1)}k</p>
            <p class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">XP Total</p>
          </div>
        </div>
      {/if}

      <!-- Classement principal -->
      <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h3 class="text-xl font-semibold flex items-center gap-3">
            <Papicon icon="Grades" size={20} class="text-tertiary" />
            Classement XP — Top {levels.length}
          </h3>

          <!-- Barre de recherche -->
          <div class="relative w-full md:w-80">
            <input 
              type="text" 
              placeholder="Rechercher un membre..." 
              bind:value={searchQuery}
              class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 pl-11 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-tertiary/30 placeholder:text-on-surface-variant/50 transition-all shadow-inner"
            />
            <div class="absolute left-4 top-1/2 -translate-y-1/2 text-sm opacity-40 text-on-surface flex items-center">
              <Papicon icon="Search" size={14} />
            </div>
            {#if searchQuery}
              <button 
                onclick={() => searchQuery = ''}
                class="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-surface-container-high/60 hover:bg-error/10 hover:text-error text-on-surface-variant/60 flex items-center justify-center text-[10px] font-bold transition-all"
              >
                ✕
              </button>
            {/if}
          </div>
        </div>

        <!-- Section Top 3 Sleek Cards -->
        {#if !searchQuery && levels.length > 0}
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto pt-4 pb-8 border-b border-outline-variant/10">
            
            <!-- Rank 2 Card -->
            {#if levels[1]}
              <div class="relative bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-6 flex flex-col justify-between hover:border-primary/25 transition-all duration-300 group shadow-sm order-2 sm:order-1">
                <div class="flex items-start justify-between">
                  <div class="relative">
                    <img
                      src={levels[1].avatarUrl || 'https://cdn.discordapp.com/embed/avatars/1.png'}
                      alt=""
                      class="w-16 h-16 rounded-lg object-cover border border-outline-variant/10 shadow-inner"
                    />
                    <!-- Rank indicator -->
                    <div class="absolute -bottom-2 -right-2 bg-surface-container-high text-on-surface-variant border border-outline-variant/15 w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs font-mono">
                      2
                    </div>
                  </div>
                  <!-- Medal Icon -->
                  <div class="text-on-surface-variant/40 group-hover:text-primary transition-colors">
                    <Papicon icon="Medal" size={20} />
                  </div>
                </div>
                
                <div class="mt-6 space-y-4">
                  <div class="space-y-0.5">
                    <p class="font-bold text-on-surface truncate group-hover:text-primary transition-colors" title={levels[1].displayName}>
                      {levels[1].displayName || levels[1].username || 'Inconnu'}
                    </p>
                    {#if levels[1].username && levels[1].displayName !== levels[1].username}
                      <p class="text-xs text-on-surface-variant/50 font-medium truncate">@{levels[1].username}</p>
                    {/if}
                  </div>
                  
                  <div class="flex items-center justify-between border-t border-outline-variant/5 pt-3 text-xs">
                    <span class="text-on-surface-variant/70 font-semibold">Niveau {getLevelFromXp(levels[1].xp)}</span>
                    <span class="text-on-surface-variant/80 font-mono font-medium">{levels[1].xp.toLocaleString()} XP</span>
                  </div>
                </div>
              </div>
            {/if}

            <!-- Rank 1 Card (Highlighted) -->
            {#if levels[0]}
              <div class="relative bg-surface-container-low/60 border border-tertiary/20 rounded-xl overflow-hidden p-6 flex flex-col justify-between hover:border-tertiary/40 transition-all duration-300 group shadow-md ring-1 ring-tertiary/5 order-1 sm:order-2">
                <!-- Top accent bar -->
                <div class="absolute top-0 inset-x-0 h-1 bg-linear-to-r from-tertiary to-secondary"></div>
                
                <div class="flex items-start justify-between mt-1">
                  <div class="relative">
                    <img
                      src={levels[0].avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                      alt=""
                      class="w-20 h-20 rounded-lg object-cover border border-tertiary/20 shadow-inner"
                    />
                    <!-- Rank indicator -->
                    <div class="absolute -bottom-2 -right-2 bg-tertiary text-on-tertiary w-7 h-7 rounded-lg flex items-center justify-center font-semibold text-sm font-mono shadow-md">
                      1
                    </div>
                  </div>
                  <!-- Crown Icon -->
                  <div class="text-tertiary filter drop-shadow-[0_0_8px_rgba(var(--tertiary-color),0.2)]">
                    <Papicon icon="Crown" size={24} />
                  </div>
                </div>
                
                <div class="mt-6 space-y-4">
                  <div class="space-y-0.5">
                    <p class="font-extrabold text-on-surface text-lg truncate group-hover:text-tertiary transition-colors" title={levels[0].displayName}>
                      {levels[0].displayName || levels[0].username || 'Inconnu'}
                    </p>
                    {#if levels[0].username && levels[0].displayName !== levels[0].username}
                      <p class="text-xs text-tertiary/70 font-medium truncate">@{levels[0].username}</p>
                    {/if}
                  </div>
                  
                  <div class="flex items-center justify-between border-t border-tertiary/10 pt-3 text-sm">
                    <span class="text-tertiary font-extrabold">Niveau {getLevelFromXp(levels[0].xp)}</span>
                    <span class="text-tertiary/90 font-mono font-bold">{levels[0].xp.toLocaleString()} XP</span>
                  </div>
                </div>
              </div>
            {/if}

            <!-- Rank 3 Card -->
            {#if levels[2]}
              <div class="relative bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-6 flex flex-col justify-between hover:border-primary/25 transition-all duration-300 group shadow-sm order-3">
                <div class="flex items-start justify-between">
                  <div class="relative">
                    <img
                      src={levels[2].avatarUrl || 'https://cdn.discordapp.com/embed/avatars/2.png'}
                      alt=""
                      class="w-16 h-16 rounded-lg object-cover border border-outline-variant/10 shadow-inner"
                    />
                    <!-- Rank indicator -->
                    <div class="absolute -bottom-2 -right-2 bg-surface-container-high text-on-surface-variant border border-outline-variant/15 w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs font-mono">
                      3
                    </div>
                  </div>
                  <!-- Medal Icon -->
                  <div class="text-on-surface-variant/40 group-hover:text-primary transition-colors">
                    <Papicon icon="Medal" size={20} />
                  </div>
                </div>
                
                <div class="mt-6 space-y-4">
                  <div class="space-y-0.5">
                    <p class="font-bold text-on-surface truncate group-hover:text-primary transition-colors" title={levels[2].displayName}>
                      {levels[2].displayName || levels[2].username || 'Inconnu'}
                    </p>
                    {#if levels[2].username && levels[2].displayName !== levels[2].username}
                      <p class="text-xs text-on-surface-variant/50 font-medium truncate">@{levels[2].username}</p>
                    {/if}
                  </div>
                  
                  <div class="flex items-center justify-between border-t border-outline-variant/5 pt-3 text-xs">
                    <span class="text-on-surface-variant/70 font-semibold">Niveau {getLevelFromXp(levels[2].xp)}</span>
                    <span class="text-on-surface-variant/80 font-mono font-medium">{levels[2].xp.toLocaleString()} XP</span>
                  </div>
                </div>
              </div>
            {/if}

          </div>
        {/if}

        <!-- Liste complète des membres avec design en cartes premiums -->
        <div class="space-y-3 max-h-[600px] overflow-y-auto pr-1">
          {#each filteredLevels as userLvl}
            {@const index = levels.findIndex(l => l.userId === userLvl.userId)}
            {@const lvl = getLevelFromXp(userLvl.xp)}
            {@const nextLvlXp = getXpForLevel(lvl)}
            {@const prevLvlXp = getXpForLevel(lvl - 1)}
            {@const currentProgress = Math.max(0, userLvl.xp - prevLvlXp)}
            {@const neededProgress = Math.max(1, nextLvlXp - prevLvlXp)}
            {@const percent = Math.min(100, Math.max(0, (currentProgress / neededProgress) * 100))}
            
            <div class="flex items-center gap-4 p-4 rounded-lg bg-surface-container-high/15 border border-outline-variant/5 hover:bg-surface-container-high/30 hover:border-outline-variant/15 transition-all duration-350 group">
              <!-- Rang -->
              <div class="w-10 h-10 rounded-xl flex items-center justify-center font-extrabold text-sm shrink-0 font-mono
                {index === 0 ? 'bg-amber-400/15 text-amber-500 border border-amber-400/25 shadow-sm shadow-amber-400/5' : 
                 index === 1 ? 'bg-slate-400/15 text-slate-500 border border-slate-400/25 shadow-sm shadow-slate-400/5' : 
                 index === 2 ? 'bg-amber-700/15 text-amber-600 border border-amber-700/25 shadow-sm shadow-amber-700/5' : 
                 'bg-surface-container text-on-surface-variant/50 border border-outline-variant/5'}">
                {index + 1}
              </div>

              <!-- Avatar -->
              <img 
                src={userLvl.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'} 
                alt="" 
                class="w-11 h-11 rounded-xl border border-outline-variant/10 shadow-inner object-cover shrink-0"
              />

              <!-- Nom & Progression -->
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-2 mb-1.5">
                  <p class="text-sm font-extrabold text-on-surface truncate">{userLvl.displayName || userLvl.username || 'Inconnu'}</p>
                  {#if userLvl.username && userLvl.displayName !== userLvl.username}
                    <span class="text-[10px] text-on-surface-variant/40 truncate font-semibold font-mono">@{userLvl.username}</span>
                  {/if}
                </div>

                <!-- Barre de progression -->
                <div class="flex items-center gap-2.5">
                  <div class="flex-1 h-2 bg-surface-container/60 rounded-full overflow-hidden p-[2px] border border-outline-variant/5">
                    <div 
                      class="h-full rounded-full transition-all duration-700
                        {index === 0 ? 'bg-linear-to-r from-amber-400 to-yellow-300' : 
                         index === 1 ? 'bg-linear-to-r from-slate-300 to-slate-400' : 
                         index === 2 ? 'bg-linear-to-r from-amber-700 to-amber-600' : 
                         'bg-linear-to-r from-primary to-secondary'}" 
                      style="width: {percent}%"
                    ></div>
                  </div>
                  <span class="text-[11px] font-bold text-on-surface-variant/40 whitespace-nowrap font-mono tracking-wide">{currentProgress.toLocaleString()} / {neededProgress.toLocaleString()} XP</span>
                </div>
              </div>

              <!-- Niveau Badge -->
              <div class="text-right shrink-0">
                <span class="text-xs font-semibold uppercase tracking-wider px-3.5 py-2 rounded-xl border whitespace-nowrap shadow-xs
                  {index === 0 ? 'bg-amber-400/10 text-amber-500 border-amber-400/20' : 
                   index === 1 ? 'bg-slate-400/10 text-slate-500 border-slate-400/20' : 
                   index === 2 ? 'bg-amber-700/10 text-amber-600 border-amber-700/20' : 
                   'bg-primary/10 text-primary border-primary/15'}">
                  Lvl {lvl}
                </span>
              </div>
            </div>
          {:else}
            <!-- Aucun membre trouvé -->
            <div class="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div class="w-16 h-16 rounded-lg bg-surface-container-high/30 border border-outline-variant/10 flex items-center justify-center text-primary animate-bounce">
                {#if searchQuery}
                  <Papicon icon="Search" size={24} />
                {:else}
                  <Papicon icon="Trophy" size={24} />
                {/if}
              </div>
              <div class="space-y-1">
                <p class="text-sm text-on-surface font-extrabold">
                  {#if searchQuery}Aucun membre trouvé pour "{searchQuery}"{:else}Le classement est vide.{/if}
                </p>
                {#if searchQuery}
                  <button onclick={() => searchQuery = ''} class="text-primary text-xs font-semibold hover:underline">Effacer la recherche</button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </section>
    </div>
  {:else if activeTab === 'import'}
    <!-- === ONGLET IMPORTATION === -->
    <div class="space-y-8 animate-in fade-in duration-300">
      
      <!-- Avertissement de sécurité / explicatif -->
      <div class="bg-surface-container-low/40 border border-outline-variant/10 p-6 rounded-xl flex items-start gap-4">
        <div class="w-10 h-10 bg-secondary/15 rounded-lg flex items-center justify-center text-secondary shrink-0">
          <Papicon icon="Info" size={20} />
        </div>
        <div class="space-y-1">
          <h4 class="text-sm font-semibold text-on-surface">Comment fonctionne l'importation ?</h4>
          <p class="text-xs text-on-surface-variant/70 leading-relaxed font-medium">
            L'importation permet de charger une liste de membres avec leurs niveaux et XP. Le système essaiera de faire correspondre chaque membre avec un utilisateur Discord du serveur en comparant de manière insensible à la casse son <strong>nom d'utilisateur (@username)</strong>, son <strong>nom d'affichage (Display Name)</strong> ou son <strong>tag classique</strong>. Les membres non trouvés seront ignorés et listés dans un récapitulatif.
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Zone d'importation (2/3 de large) -->
        <div class="lg:col-span-2 space-y-6">
          <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6">
            <h3 class="text-xl font-semibold flex items-center gap-3">
              <Papicon icon="Upload" size={20} class="text-secondary" />
              Saisie des Données
            </h3>

            <!-- Glisser-déposer / Sélecteur de fichier -->
            <div 
              role="button"
              tabindex="0"
              class="w-full border-2 border-dashed border-outline-variant/20 rounded-xl p-8 text-center hover:bg-surface-container-high/20 transition-all cursor-pointer flex flex-col items-center justify-center space-y-2 relative {isDragging ? 'border-primary bg-primary/5 scale-[1.01]' : ''}"
              ondragover={(e) => { e.preventDefault(); isDragging = true; }}
              ondragleave={() => isDragging = false}
              ondrop={handleFileDrop}
            >
              <input 
                type="file" 
                accept=".json" 
                class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onchange={handleFileSelect}
              />
              <div class="w-12 h-12 bg-secondary/10 text-secondary rounded-lg flex items-center justify-center shadow-inner mb-2">
                <Papicon icon="Upload" size={24} />
              </div>
              <p class="text-sm font-semibold text-on-surface">Glissez-déposez un fichier `.json` ici</p>
              <p class="text-xs text-on-surface-variant/60 font-medium">ou cliquez pour parcourir vos dossiers</p>
            </div>

            <!-- Textarea alternatif -->
            <div class="space-y-2">
              <label for="rawJsonTextarea" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Ou collez le JSON directement</label>
              <textarea
                id="rawJsonTextarea"
                rows="10"
                bind:value={importRawJson}
                placeholder={`[\n  {\n    "username": "@klaynight",\n    "display_name": "Klaynight",\n    "level": 48,\n    "xp": 119652\n  }\n]`}
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-xs font-mono focus:ring-2 focus:ring-secondary/30 transition-all text-on-surface focus:outline-none resize-y"
              ></textarea>
            </div>

            <!-- Messages d'erreur locaux / globaux -->
            {#if importFileError}
              <div class="bg-error/10 text-error text-xs font-bold px-4 py-3 rounded-lg border border-error/20 flex items-center gap-2">
                ✕ {importFileError}
              </div>
            {/if}

            <InlineFeedback state={importActionState} />

            <!-- Boutons de validation -->
            <div class="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onclick={() => { importRawJson = ''; importFileError = null; importResults = null; }}
                class="px-6 py-3.5 bg-surface-container-high/50 text-on-surface-variant font-semibold uppercase tracking-widest text-xs rounded-lg hover:bg-surface-container-high transition-all"
              >
                Vider
              </button>
              <button
                type="button"
                onclick={handleImportSubmit}
                disabled={!importRawJson.trim()}
                class="px-8 py-3.5 bg-secondary text-on-secondary font-semibold uppercase tracking-widest text-xs rounded-lg hover:scale-105 transition-all disabled:opacity-50"
              >
                Lancer l'importation
              </button>
            </div>
          </section>

          <!-- Liste des erreurs d'import (si présentes) -->
          {#if importResults && importResults.failedCount > 0}
            <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-4">
              <div class="flex items-center gap-3 text-error">
                <div class="w-8 h-8 rounded-xl bg-error/15 flex items-center justify-center">
                  ✕
                </div>
                <div>
                  <h3 class="text-base font-semibold">Membres non importés ({importResults.failedCount})</h3>
                  <p class="text-[10px] text-on-surface-variant/60 font-semibold uppercase tracking-wider">Ces membres n'ont pas pu être fait correspondre à un utilisateur Discord</p>
                </div>
              </div>

              <div class="overflow-hidden rounded-lg border border-outline-variant/10 bg-surface-container-low/10 max-h-72 overflow-y-auto">
                <table class="w-full border-collapse text-left">
                  <thead>
                    <tr class="bg-surface-container-high/50 border-b border-outline-variant/10">
                      <th class="px-5 py-3 text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider">Username</th>
                      <th class="px-5 py-3 text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider">Display Name</th>
                      <th class="px-5 py-3 text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider">Raison</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-outline-variant/5">
                    {#each importResults.failedMembers as failed}
                      <tr class="text-xs font-semibold hover:bg-surface-hover/20 transition-all">
                        <td class="px-5 py-3 font-mono text-on-surface">{failed.username || '—'}</td>
                        <td class="px-5 py-3 text-on-surface">{failed.display_name || '—'}</td>
                        <td class="px-5 py-3 text-error font-medium">{failed.reason}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </section>
          {/if}
        </div>

        <!-- Format Attendu & Résumé (1/3 de large) -->
        <div class="space-y-6">
          <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6">
            <h3 class="text-lg font-semibold flex items-center gap-3">
              <Papicon icon="Info" size={18} class="text-primary" />
              Format Attendu
            </h3>
            
            <p class="text-xs text-on-surface-variant/85 leading-relaxed font-medium">
              Les données doivent être un tableau d'objets JSON contenant au minimum le <code>username</code> ou <code>display_name</code>, ainsi que le <code>level</code> ou les <code>xp</code>.
            </p>

            <div class="relative bg-surface-container-high/60 border border-outline-variant/5 p-4 rounded-lg">
              <pre class="text-[10px] font-mono text-on-surface-variant/90 overflow-x-auto leading-relaxed">{`[
  {
    "username": "@klaynight",
    "display_name": "Klaynight",
    "level": 48,
    "xp": 119652
  },
  {
    "username": "@nathan_nrg4",
    "display_name": "SailingTeam4",
    "level": 44,
    "xp": 99301
  }
]`}</pre>
            </div>

            <div class="space-y-2.5 pt-2 border-t border-outline-variant/10">
              <h4 class="text-[10px] font-semibold text-on-surface-variant/50 uppercase tracking-widest">Règles de conversion :</h4>
              <ul class="list-disc list-inside text-[11px] text-on-surface-variant/80 space-y-1 font-medium">
                <li>Si seul l'<strong>XP</strong> est fourni, le niveau est déduit automatiquement.</li>
                <li>Si seul le <strong>niveau</strong> est fourni, l'XP minimum pour ce niveau est attribué.</li>
                <li>L'importation écrase les niveaux existants des membres correspondants.</li>
              </ul>
            </div>
          </section>

          <!-- Carte de résumé rapide des résultats d'importation -->
          {#if importResults}
            <section class="bg-linear-to-b from-secondary/15 to-transparent border border-secondary/20 p-8 rounded-xl space-y-4">
              <h3 class="text-base font-semibold flex items-center gap-2 text-secondary">
                <Papicon icon="Check" size={18} />
                Résultat de l'Import
              </h3>
              
              <div class="grid grid-cols-2 gap-4">
                <div class="bg-surface-container-low/50 border border-outline-variant/10 rounded-lg p-4 text-center">
                  <p class="text-2xl font-semibold text-green-400">{importResults.importedCount}</p>
                  <p class="text-[11px] font-bold text-on-surface-variant/60 uppercase tracking-wider">Succès</p>
                </div>
                <div class="bg-surface-container-low/50 border border-outline-variant/10 rounded-lg p-4 text-center">
                  <p class="text-2xl font-semibold {importResults.failedCount > 0 ? 'text-error' : 'text-on-surface-variant/40'}">{importResults.failedCount}</p>
                  <p class="text-[11px] font-bold text-on-surface-variant/60 uppercase tracking-wider">Échecs</p>
                </div>
              </div>
            </section>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>
