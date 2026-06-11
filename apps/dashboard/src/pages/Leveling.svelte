<script lang="ts">
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
    deleteLevelingReward 
  } from '../lib/api';

  const saveAction = createAsyncActionState();
  const rewardAction = createAsyncActionState();
  let loading = $state(false);
  let activeTab = $state<'config' | 'leaderboard'>('config');
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
  const avgLevel = $derived(levels.length > 0 ? Math.round(levels.reduce((sum, u) => sum + u.level, 0) / levels.length) : 0);
  const maxLevel = $derived(levels.length > 0 ? Math.max(...levels.map(u => u.level)) : 0);
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <!-- En-tête -->
  <header class="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-surface-container-low/40 backdrop-blur-3xl p-8 rounded-4xl border border-outline-variant/30">
    <div class="flex items-center gap-6">
      <div class="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-inner">
        <Papicon icon="Trophy" size={32} />
      </div>
      <div>
        <h1 class="text-3xl font-black tracking-tight leading-tight">Leveling & XP</h1>
        <p class="text-on-surface-variant/80 font-medium">Configurez le gain d'expérience des membres et les rôles de récompense.</p>
      </div>
    </div>
    {#if !loading}
      <div class="flex items-center gap-4 bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-6 py-3.5">
        <span class="text-sm font-bold text-on-surface-variant/80">Statut du module :</span>
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
  <nav class="flex gap-2 bg-surface-container-low/30 border border-outline-variant/10 rounded-3xl p-2 w-fit">
    <button
      id="tab-config"
      onclick={() => activeTab = 'config'}
      class="flex items-center gap-2.5 px-6 py-3 rounded-2xl text-sm font-black transition-all duration-300 {activeTab === 'config' ? 'bg-primary text-on-primary shadow-lg shadow-primary/20 scale-[1.02]' : 'text-on-surface-variant/70 hover:bg-surface-container-high/40 hover:text-on-surface'}"
    >
      <Papicon icon="Settings" size={16} />
      Configuration
    </button>
    <button
      id="tab-leaderboard"
      onclick={() => activeTab = 'leaderboard'}
      class="flex items-center gap-2.5 px-6 py-3 rounded-2xl text-sm font-black transition-all duration-300 {activeTab === 'leaderboard' ? 'bg-tertiary text-on-tertiary shadow-lg shadow-tertiary/20 scale-[1.02]' : 'text-on-surface-variant/70 hover:bg-surface-container-high/40 hover:text-on-surface'}"
    >
      <Papicon icon="Grades" size={16} />
      Classement
      {#if levels.length > 0}
        <span class="text-[10px] font-black px-1.5 py-0.5 rounded-lg {activeTab === 'leaderboard' ? 'bg-on-tertiary/20' : 'bg-surface-container-high/60 text-on-surface-variant/60'}">
          {levels.length}
        </span>
      {/if}
    </button>
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
        <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-6">
          <h3 class="text-xl font-black flex items-center gap-3">
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
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
                disabled={!canManageSettings}
              />
            </div>

            <div class="space-y-1.5">
              <label for="xpMax" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">XP Maximum par message</label>
              <input 
                id="xpMax"
                type="number" 
                bind:value={config.xpMax} 
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
                disabled={!canManageSettings}
              />
            </div>

            <div class="space-y-1.5">
              <label for="cooldown" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Cooldown XP Textuelle (secondes)</label>
              <input 
                id="cooldown"
                type="number" 
                bind:value={config.cooldownSeconds} 
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
                disabled={!canManageSettings}
              />
            </div>

            <div class="space-y-1.5">
              <label for="vocalXp" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">XP Vocale par minute</label>
              <input 
                id="vocalXp"
                type="number" 
                bind:value={config.vocalXpPerMin} 
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
                disabled={!canManageSettings}
              />
            </div>

            <!-- Toggle cumul récompenses -->
            <div class="space-y-1.5 flex items-center justify-between bg-surface-container-high/20 border border-outline-variant/5 rounded-2xl px-6 py-4 col-span-2 mt-2">
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
              <div class="flex flex-wrap gap-2 p-2.5 bg-surface-container-high/20 border border-outline-variant/10 rounded-2xl min-h-[46px] items-center">
                {#each config.ignoredChannels as channelId}
                  {@const channel = availableChannels.find(c => c.id === channelId)}
                  <span class="flex items-center gap-1.5 px-3 py-1 bg-surface-container-low text-xs font-bold text-on-surface-variant rounded-xl border border-outline-variant/10 shadow-sm">
                    #{channel ? channel.name : channelId}
                    {#if canManageSettings}
                      <button type="button" onclick={() => config.ignoredChannels = config.ignoredChannels.filter(id => id !== channelId)} class="text-[10px] text-error hover:scale-110 transition-transform">✕</button>
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
                    options={availableChannels.filter(c => !config.ignoredChannels.includes(c.id)).map(c => ({ id: c.id, name: `#${c.name}` }))} 
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
              <div class="flex flex-wrap gap-2 p-2.5 bg-surface-container-high/20 border border-outline-variant/10 rounded-2xl min-h-[46px] items-center">
                {#each config.ignoredRoles as roleId}
                  {@const role = availableRoles.find(r => r.id === roleId)}
                  <span class="flex items-center gap-1.5 px-3 py-1 bg-surface-container-low text-xs font-bold text-on-surface-variant rounded-xl border border-outline-variant/10 shadow-sm">
                    @{role ? role.name : roleId}
                    {#if canManageSettings}
                      <button type="button" onclick={() => config.ignoredRoles = config.ignoredRoles.filter(id => id !== roleId)} class="text-[10px] text-error hover:scale-110 transition-transform">✕</button>
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
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end bg-surface-container-high/20 p-4 rounded-3xl border border-outline-variant/5">
                  <div class="space-y-1.5">
                    <label for="multRole" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Rôle</label>
                    <SearchableSelect 
                      id="multRole"
                      bind:value={newMultRoleId}
                      options={availableRoles.filter(r => !Object.keys(config.xpMultipliers).includes(r.id)).map(r => ({ id: r.id, name: `@${r.name}` }))} 
                      placeholder="Choisir un rôle" 
                      className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl"
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
                      class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
                    />
                  </div>

                  <button 
                    type="button"
                    onclick={handleAddMultiplier}
                    disabled={!newMultRoleId || !newMultValue}
                    class="w-full py-3.5 bg-secondary text-on-secondary font-black uppercase tracking-widest text-xs rounded-2xl hover:scale-105 transition-all disabled:opacity-50"
                  >
                    Ajouter
                  </button>
                </div>
              {/if}

              <div class="overflow-hidden rounded-2xl border border-outline-variant/10 bg-surface-container-low/10">
                <table class="w-full border-collapse text-left">
                  <thead>
                    <tr class="bg-surface-container-high/50 border-b border-outline-variant/10">
                      <th class="px-6 py-3 text-xs font-black text-on-surface-variant/70 uppercase tracking-wider">Rôle</th>
                      <th class="px-6 py-3 text-xs font-black text-on-surface-variant/70 uppercase tracking-wider">Multiplicateur</th>
                      {#if canManageSettings}
                        <th class="px-6 py-3 text-right text-xs font-black text-on-surface-variant/70 uppercase tracking-wider">Actions</th>
                      {/if}
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-outline-variant/5">
                    {#each Object.entries(config.xpMultipliers) as [roleId, mult]}
                      <tr class="hover:bg-surface-hover/20 transition-all font-semibold">
                        <td class="px-6 py-3.5 text-sm font-semibold">{getRoleName(roleId)}</td>
                        <td class="px-6 py-3.5 text-sm font-black text-primary">{mult}x</td>
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
                  ...availableChannels.map(c => ({ id: c.id, name: `#${c.name}` }))
                ]} 
                placeholder="— Sélectionner —" 
                className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all"
                disabled={!canManageSettings}
              />
            </div>

            <div class="space-y-1.5">
              <label for="lvlMsg" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Message de Level-Up</label>
              <input 
                id="lvlMsg"
                type="text" 
                bind:value={config.levelUpMessage} 
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
                placeholder={"Ex: Bravo {user} ! Tu es niveau {level} !"}
                disabled={!canManageSettings}
              />
              <p class="text-[9px] text-on-surface-variant/40 ml-2">Variables utilisables : <code class="bg-surface-container px-1 py-0.5 rounded text-primary dark:text-blue-300">{`{user}`}</code> (mention), <code class="bg-surface-container px-1 py-0.5 rounded text-primary dark:text-blue-300">{`{username}`}</code>, <code class="bg-surface-container px-1 py-0.5 rounded text-primary dark:text-blue-300">{`{level}`}</code></p>
            </div>
          </div>

          <!-- Save button removed since global bottom bar handles saving -->
        </section>
      </div>

      <!-- Récompenses (sidebar droite) -->
      <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-6">
        <h3 class="text-xl font-black flex items-center gap-3">
          <Papicon icon="Award" size={20} class="text-secondary" />
          Rôles Récompenses
        </h3>

        {#if canManageSettings}
          <form onsubmit={(e) => { e.preventDefault(); handleAddReward(); }} class="space-y-4 bg-surface-container-high/20 p-4 rounded-3xl border border-outline-variant/5">
            <div class="space-y-1.5">
              <label for="rewardLvl" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Niveau Requis</label>
              <input 
                id="rewardLvl"
                type="number" 
                min="1"
                placeholder="Ex: 5"
                bind:value={newRewardLevel} 
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
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
                className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all"
              />
            </div>

            <button 
              type="submit"
              disabled={!newRewardLevel || !newRewardRoleId}
              class="w-full py-3.5 bg-secondary text-on-secondary font-black uppercase tracking-widest text-xs rounded-2xl hover:scale-105 transition-all disabled:opacity-50"
            >
              Ajouter le rôle récompense
            </button>
          </form>
        {/if}

        <div class="overflow-hidden rounded-3xl border border-outline-variant/10 bg-surface-container-low/10">
          <table class="w-full border-collapse text-left">
            <thead>
              <tr class="bg-surface-container-high/50 border-b border-outline-variant/10">
                <th class="px-5 py-4 text-xs font-black text-on-surface-variant/70 uppercase tracking-wider">Niveau</th>
                <th class="px-5 py-4 text-xs font-black text-on-surface-variant/70 uppercase tracking-wider">Rôle</th>
                {#if canManageSettings}
                  <th class="px-5 py-4 text-right text-xs font-black text-on-surface-variant/70 uppercase tracking-wider">–</th>
                {/if}
              </tr>
            </thead>
            <tbody class="divide-y divide-outline-variant/5">
              {#each rewards as reward}
                <tr class="hover:bg-surface-hover/20 transition-all">
                  <td class="px-5 py-4 font-black text-primary text-sm">Lvl {reward.level}</td>
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

  {:else}
    <!-- === ONGLET CLASSEMENT === -->
    <div class="space-y-6 animate-in fade-in duration-300">

      <!-- Bannière lien public -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-linear-to-r from-tertiary/10 to-secondary/10 border border-tertiary/20 rounded-3xl p-5 px-6">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-tertiary/20 flex items-center justify-center text-tertiary">
            <Papicon icon="Globe" size={18} />
          </div>
          <div>
            <p class="text-sm font-black text-on-surface">Page publique du classement</p>
            <p class="text-xs text-on-surface-variant/60 font-medium">Partagez ce lien avec vos membres pour qu'ils voient leur rang.</p>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <a
            href={publicLeaderboardUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-2 px-4 py-2.5 bg-tertiary/20 text-tertiary border border-tertiary/20 rounded-2xl text-xs font-black hover:bg-tertiary/30 transition-all hover:scale-105"
          >
            <Papicon icon="ExternalLink" size={14} />
            Voir la page
          </a>
          <button
            onclick={copyPublicUrl}
            class="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all hover:scale-105 {copySuccess ? 'bg-green-500/20 text-green-400 border border-green-500/20' : 'bg-surface-container-high/40 text-on-surface-variant border border-outline-variant/10 hover:bg-surface-container-high/60'}"
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
          <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-3xl p-5 text-center space-y-1">
            <p class="text-2xl font-black text-primary">{levels.length}</p>
            <p class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">Membres classés</p>
          </div>
          <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-3xl p-5 text-center space-y-1">
            <p class="text-2xl font-black text-secondary">{maxLevel}</p>
            <p class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">Niveau max</p>
          </div>
          <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-3xl p-5 text-center space-y-1">
            <p class="text-2xl font-black text-tertiary">{avgLevel}</p>
            <p class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">Niveau moyen</p>
          </div>
          <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-3xl p-5 text-center space-y-1">
            <p class="text-2xl font-black text-amber-400">{(totalXp / 1000).toFixed(1)}k</p>
            <p class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">XP Total</p>
          </div>
        </div>
      {/if}

      <!-- Classement principal -->
      <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h3 class="text-xl font-black flex items-center gap-3">
            <Papicon icon="Grades" size={20} class="text-tertiary" />
            Classement XP — Top {levels.length}
          </h3>

          <!-- Barre de recherche -->
          <div class="relative w-full md:w-72">
            <input 
              type="text" 
              placeholder="Rechercher un membre..." 
              bind:value={searchQuery}
              class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-2.5 pl-10 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-tertiary/30 placeholder:text-on-surface-variant/40"
            />
            <div class="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs opacity-50">
              🔍
            </div>
            {#if searchQuery}
              <button 
                onclick={() => searchQuery = ''}
                class="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-on-surface-variant/40 hover:text-error transition-colors"
              >
                ✕
              </button>
            {/if}
          </div>
        </div>

        <!-- Podium Visuel (Top 3) -->
        {#if !searchQuery && levels.length > 0}
          <div class="grid grid-cols-3 gap-4 items-end pt-6 pb-8 border-b border-outline-variant/10 bg-linear-to-b from-surface-container-high/10 to-transparent rounded-3xl p-6">
            <!-- 2ème Place -->
            {#if levels[1]}
              <div class="flex flex-col items-center text-center space-y-3">
                <div class="relative">
                  <div class="absolute -top-4 left-1/2 -translate-x-1/2 text-lg">🥈</div>
                  <img 
                    src={levels[1].avatarUrl || 'https://cdn.discordapp.com/embed/avatars/1.png'} 
                    alt="" 
                    class="w-16 h-16 rounded-full border-2 border-slate-300/60 shadow-lg shadow-slate-300/10 object-cover" 
                  />
                  <div class="absolute -bottom-2 -right-1 w-6 h-6 rounded-full bg-slate-300 text-slate-900 flex items-center justify-center font-black text-[11px] shadow-md">2</div>
                </div>
                <div class="min-w-0 w-full">
                  <p class="text-sm font-black text-on-surface truncate" title={levels[1].displayName}>{levels[1].displayName || 'Inconnu'}</p>
                  <p class="text-[10px] text-on-surface-variant/60 font-bold uppercase tracking-wider">Niveau {levels[1].level}</p>
                  <p class="text-[10px] text-slate-400 font-extrabold">{levels[1].xp.toLocaleString()} XP</p>
                </div>
              </div>
            {/if}

            <!-- 1ère Place -->
            {#if levels[0]}
              <div class="flex flex-col items-center text-center space-y-3 transform -translate-y-4">
                <div class="relative">
                  <div class="absolute -top-5 left-1/2 -translate-x-1/2 text-2xl animate-bounce">👑</div>
                  <div class="absolute inset-0 rounded-full bg-amber-400/20 blur-xl scale-125"></div>
                  <img 
                    src={levels[0].avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'} 
                    alt="" 
                    class="relative w-20 h-20 rounded-full border-4 border-amber-400 shadow-2xl shadow-amber-400/30 object-cover" 
                  />
                  <div class="absolute -bottom-2 -right-1 w-7 h-7 rounded-full bg-amber-400 text-amber-950 flex items-center justify-center font-black text-sm shadow-lg">1</div>
                </div>
                <div class="min-w-0 w-full">
                  <p class="text-base font-black text-on-surface truncate" title={levels[0].displayName}>{levels[0].displayName || 'Inconnu'}</p>
                  <p class="text-[10px] text-amber-400 font-extrabold uppercase tracking-wider">Niveau {levels[0].level}</p>
                  <p class="text-[10px] text-amber-400/80 font-bold">{levels[0].xp.toLocaleString()} XP</p>
                </div>
              </div>
            {/if}

            <!-- 3ème Place -->
            {#if levels[2]}
              <div class="flex flex-col items-center text-center space-y-3">
                <div class="relative">
                  <div class="absolute -top-4 left-1/2 -translate-x-1/2 text-lg">🥉</div>
                  <img 
                    src={levels[2].avatarUrl || 'https://cdn.discordapp.com/embed/avatars/2.png'} 
                    alt="" 
                    class="w-16 h-16 rounded-full border-2 border-amber-700/60 shadow-lg shadow-amber-700/10 object-cover" 
                  />
                  <div class="absolute -bottom-2 -right-1 w-6 h-6 rounded-full bg-amber-700 text-amber-100 flex items-center justify-center font-black text-[11px] shadow-md">3</div>
                </div>
                <div class="min-w-0 w-full">
                  <p class="text-sm font-black text-on-surface truncate" title={levels[2].displayName}>{levels[2].displayName || 'Inconnu'}</p>
                  <p class="text-[10px] text-on-surface-variant/60 font-bold uppercase tracking-wider">Niveau {levels[2].level}</p>
                  <p class="text-[10px] text-amber-600 font-extrabold">{levels[2].xp.toLocaleString()} XP</p>
                </div>
              </div>
            {/if}
          </div>
        {/if}

        <!-- Liste des membres -->
        <div class="space-y-3 max-h-[600px] overflow-y-auto pr-1">
          {#each filteredLevels as userLvl}
            {@const index = levels.findIndex(l => l.userId === userLvl.userId)}
            {@const nextLvlXp = getXpForLevel(userLvl.level)}
            {@const prevLvlXp = getXpForLevel(userLvl.level - 1)}
            {@const currentProgress = userLvl.xp - prevLvlXp}
            {@const neededProgress = nextLvlXp - prevLvlXp}
            {@const percent = Math.min(100, Math.max(0, (currentProgress / neededProgress) * 100))}
            <div class="flex items-center gap-4 p-4 rounded-2xl bg-surface-container-high/15 border border-outline-variant/5 hover:bg-surface-container-high/30 transition-all group">
              <!-- Rang -->
              <div class="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm shrink-0
                {index === 0 ? 'bg-amber-400/20 text-amber-400 ring-1 ring-amber-400/30' : 
                 index === 1 ? 'bg-slate-300/20 text-slate-300 ring-1 ring-slate-300/30' : 
                 index === 2 ? 'bg-amber-700/20 text-amber-600 ring-1 ring-amber-700/30' : 
                 'bg-surface-container text-on-surface-variant/60'}">
                {index + 1}
              </div>

              <!-- Avatar -->
              <img 
                src={userLvl.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'} 
                alt="" 
                class="w-10 h-10 rounded-full border border-outline-variant/10 shadow-sm object-cover shrink-0"
              />

              <!-- Nom & Progression -->
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-1.5 mb-1.5">
                  <p class="text-sm font-black text-on-surface truncate">{userLvl.displayName || userLvl.username || 'Inconnu'}</p>
                  {#if userLvl.username && userLvl.displayName !== userLvl.username}
                    <span class="text-[10px] text-on-surface-variant/40 truncate font-semibold font-mono">@{userLvl.username}</span>
                  {/if}
                </div>

                <!-- Barre de progression -->
                <div class="flex items-center gap-2">
                  <div class="flex-1 h-1.5 bg-surface-container rounded-full overflow-hidden">
                    <div 
                      class="h-full rounded-full transition-all duration-500
                        {index === 0 ? 'bg-linear-to-r from-amber-400 to-yellow-300' : 
                         index === 1 ? 'bg-linear-to-r from-slate-300 to-slate-400' : 
                         index === 2 ? 'bg-linear-to-r from-amber-700 to-amber-600' : 
                         'bg-linear-to-r from-primary to-secondary'}" 
                      style="width: {percent}%"
                    ></div>
                  </div>
                  <span class="text-[9px] font-bold text-on-surface-variant/50 whitespace-nowrap">{userLvl.xp.toLocaleString()} / {nextLvlXp.toLocaleString()} XP</span>
                </div>
              </div>

              <!-- Niveau Badge -->
              <div class="text-right shrink-0">
                <span class="text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-full border
                  {index === 0 ? 'bg-amber-400/10 text-amber-400 border-amber-400/20' : 
                   index === 1 ? 'bg-slate-300/10 text-slate-300 border-slate-300/20' : 
                   index === 2 ? 'bg-amber-700/10 text-amber-600 border-amber-700/20' : 
                   'bg-primary/10 text-primary border-primary/10'}">
                  Lvl {userLvl.level}
                </span>
              </div>
            </div>
          {:else}
            <div class="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <div class="w-14 h-14 rounded-full bg-surface-container-high/30 flex items-center justify-center text-2xl">
                {#if searchQuery}🔍{:else}🏆{/if}
              </div>
              <p class="text-sm text-on-surface-variant/60 font-semibold">
                {#if searchQuery}Aucun membre trouvé pour "{searchQuery}"{:else}Aucun membre dans le classement.{/if}
              </p>
            </div>
          {/each}
        </div>
      </section>
    </div>
  {/if}
</div>
