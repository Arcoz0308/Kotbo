<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import { unsavedChanges } from '../lib/stores/unsavedChanges.svelte';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import SearchableSelect from '../lib/components/SearchableSelect.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import { fetchChannelsManagementConfig, updateChannelsManagementConfig, rescanChannelsManagementStats, fetchTempVoiceChannels, updateTempVoiceChannel } from '../lib/api';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { toast } from '../lib/stores/toast.svelte';
  import LoadingHint from '../lib/components/LoadingHint.svelte';

  // Config State
  let config = $state({
    autoThreadEnabled: false,
    autoThreadChannels: [] as string[],
    statsEnabled: false,
    statsConfig: {
      categoryId: '',
      memberEnabled: false,
      memberChannelId: '',
      memberTemplate: '👤 Membres : {count}',
      botEnabled: false,
      botChannelId: '',
      botTemplate: '🤖 Bots : {count}',
      roleEnabled: false,
      roleChannelId: '',
      roleTemplate: '👑 Staff : {count}',
      roleTargetId: '',
      channelEnabled: false,
      channelChannelId: '',
      channelTemplate: '💬 Salons : {count}',
      categoryEnabled: false,
      categoryChannelId: '',
      categoryTemplate: '📁 Catégories : {count}',
      activityEnabled: false,
      activityChannelId: '',
      activityTemplate: '📈 Actifs 24h : {count}',
      customStats: [] as any[],
    },
    tempVoiceEnabled: false,
    tempVoiceChannelId: '',
    tempVoiceCategoryId: '',
    tempVoiceNameTemplate: '🔊 Salon de {user}',
    tempVoiceRequiredRoleId: '',
    tempVoiceGenerators: [] as any[],
    honeypotEnabled: false,
    honeypotChannelIds: [] as string[],
    honeypotSanction: 'TIMEOUT',
    honeypotReinvite: false,
  });

  // Snapshot of last-saved state
  let savedConfig = $state(JSON.parse(JSON.stringify({
    autoThreadEnabled: false,
    autoThreadChannels: [] as string[],
    statsEnabled: false,
    statsConfig: {
      categoryId: '',
      memberEnabled: false,
      memberChannelId: '',
      memberTemplate: '👤 Membres : {count}',
      botEnabled: false,
      botChannelId: '',
      botTemplate: '🤖 Bots : {count}',
      roleEnabled: false,
      roleChannelId: '',
      roleTemplate: '👑 Staff : {count}',
      roleTargetId: '',
      channelEnabled: false,
      channelChannelId: '',
      channelTemplate: '💬 Salons : {count}',
      categoryEnabled: false,
      categoryChannelId: '',
      categoryTemplate: '📁 Catégories : {count}',
      activityEnabled: false,
      activityChannelId: '',
      activityTemplate: '📈 Actifs 24h : {count}',
      customStats: [] as any[],
    },
    tempVoiceEnabled: false,
    tempVoiceChannelId: '',
    tempVoiceCategoryId: '',
    tempVoiceNameTemplate: '🔊 Salon de {user}',
    tempVoiceRequiredRoleId: '',
    tempVoiceGenerators: [] as any[],
    honeypotEnabled: false,
    honeypotChannelIds: [] as string[],
    honeypotSanction: 'TIMEOUT',
    honeypotReinvite: false,
  })));

  $effect(() => {
    const dirty = JSON.stringify(config) !== JSON.stringify(savedConfig);
    if (dirty) {
      untrack(() => {
        unsavedChanges.register({
          label: 'Gestion des salons',
          onSave: () => handleSave(),
          onReset: () => {
            config = JSON.parse(JSON.stringify(savedConfig));
          }
        });
      });
    } else {
      untrack(() => {
        if (unsavedChanges.isDirty && unsavedChanges.pageLabel === 'Gestion des salons') {
          unsavedChanges.clear();
        }
      });
    }
  });

  onDestroy(() => {
    if (unsavedChanges.pageLabel === 'Gestion des salons') {
      unsavedChanges.clear();
    }
  });

  let loading = $state(true);
  let loadError = $state('');
  let activeTab = $state<'auto-thread' | 'stats' | 'temp-voice' | 'honeypot'>('auto-thread');
  let searchQuery = $state('');

  const saveAction = createAsyncActionState();
  const rescanAction = createAsyncActionState();

  async function handleRescanStats(force: boolean) {
    await rescanAction.run(async () => {
      const res = await rescanChannelsManagementStats({ force });
      if (!res || !res.ok) throw new Error(res?.error || 'Erreur lors du lancement du scan');
      return true;
    }, { successMessage: 'Scraping historique lancé avec succès en arrière-plan.' });
  }

  const availableChannels = $derived((dashboardStore.state.discordChannels || []) as any[]);
  const availableVoiceChannels = $derived((dashboardStore.state.discordVoiceChannels || []) as any[]);
  const availableCategories = $derived((dashboardStore.state.discordCategories || []) as any[]);
  const availableRoles = $derived((dashboardStore.state.discordRoles || []) as any[]);

  const filteredChannels = $derived(
    availableChannels.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  let activeTempChannels = $state([] as any[]);
  let loadingTempChannels = $state(false);

  async function loadActiveTempChannels() {
    if (!config.tempVoiceEnabled) return;
    loadingTempChannels = true;
    try {
      const res = await fetchTempVoiceChannels();
      if (Array.isArray(res)) {
        activeTempChannels = res;
      }
    } catch (err) {
      console.error('Error fetching temp voice channels:', err);
    } finally {
      loadingTempChannels = false;
    }
  }

  $effect(() => {
    if (activeTab === 'temp-voice') {
      loadActiveTempChannels();
    }
  });

  let editingChannel = $state(null as string | null);
  let newChannelName = $state('');
  let actionInProgress = $state(false);

  async function handleRenameChannel(channelId: string) {
    if (!newChannelName.trim()) return;
    actionInProgress = true;
    try {
      const res = await updateTempVoiceChannel(channelId, { name: newChannelName.trim() });
      if (res && res.ok) {
        toast.success('Salon renommé avec succès.');
        await loadActiveTempChannels();
        editingChannel = null;
      }
    } catch (err) {
      toast.error('Impossible de renommer le salon.');
    } finally {
      actionInProgress = false;
    }
  }

  async function handleReserveChannel(channelId: string, roleId: string | null) {
    actionInProgress = true;
    try {
      const res = await updateTempVoiceChannel(channelId, { roleId });
      if (res && res.ok) {
        toast.success(roleId ? 'Salon réservé avec succès.' : 'Réservation annulée avec succès.');
        await loadActiveTempChannels();
      }
    } catch (err) {
      toast.error('Impossible de modifier la réservation.');
    } finally {
      actionInProgress = false;
    }
  }

  async function handleDeleteChannel(channelId: string) {
    if (!confirm('Êtes-vous sûr de vouloir fermer ce salon temporaire et expulser tous ses membres ?')) return;
    actionInProgress = true;
    try {
      const res = await updateTempVoiceChannel(channelId, { action: 'DELETE' });
      if (res && res.ok) {
        toast.success('Salon temporaire fermé.');
        await loadActiveTempChannels();
      }
    } catch (err) {
      toast.error('Impossible de fermer le salon.');
    } finally {
      actionInProgress = false;
    }
  }

  onMount(async () => {
    try {
      await dashboardStore.refresh();
      const res = await fetchChannelsManagementConfig();
      if (res) {
        config.autoThreadEnabled = res.autoThreadEnabled ?? false;
        config.autoThreadChannels = res.autoThreadChannels ?? [];
        config.statsEnabled = res.statsEnabled ?? false;
        if (res.statsConfig) {
          config.statsConfig = {
            ...config.statsConfig,
            ...(res.statsConfig as any)
          };
          const sc = res.statsConfig as any;
          config.statsConfig.memberEnabled = sc.memberEnabled ?? !!sc.memberChannelId;
          config.statsConfig.botEnabled = sc.botEnabled ?? !!sc.botChannelId;
          config.statsConfig.roleEnabled = sc.roleEnabled ?? !!sc.roleChannelId;
          config.statsConfig.channelEnabled = sc.channelEnabled ?? !!sc.channelChannelId;
          config.statsConfig.categoryEnabled = sc.categoryEnabled ?? !!sc.categoryChannelId;
          config.statsConfig.activityEnabled = sc.activityEnabled ?? !!sc.activityChannelId;
          config.statsConfig.categoryId = sc.categoryId ?? '';
          config.statsConfig.customStats = sc.customStats || [];
        }
        config.tempVoiceEnabled = res.tempVoiceEnabled ?? false;
        config.tempVoiceChannelId = res.tempVoiceChannelId ?? '';
        config.tempVoiceCategoryId = res.tempVoiceCategoryId ?? '';
        config.tempVoiceNameTemplate = res.tempVoiceNameTemplate || '🔊 Salon de {user}';
        config.tempVoiceRequiredRoleId = res.tempVoiceRequiredRoleId ?? '';
        config.tempVoiceGenerators = Array.isArray(res.tempVoiceGenerators) ? res.tempVoiceGenerators : [];
        config.honeypotEnabled = res.honeypotEnabled ?? false;
        config.honeypotChannelIds = Array.isArray(res.honeypotChannelIds) ? res.honeypotChannelIds : [];
        config.honeypotSanction = res.honeypotSanction ?? 'TIMEOUT';
        config.honeypotReinvite = res.honeypotReinvite ?? false;
        savedConfig = JSON.parse(JSON.stringify(config));
      }
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Impossible de charger la configuration.';
    } finally {
      loading = false;
    }
  });

  // Keep toggle state in sync with module header in ModulePage
  $effect(() => {
    const activeModule = (dashboardStore.state.modules as any[]).find(m => m.id === 'auto_thread');
    config.autoThreadEnabled = activeModule?.status === 'active';
  });

  async function handleSave(): Promise<boolean> {
    let success = false;
    await saveAction.run(async () => {
      // Validate statistics role target only if role channel or auto-creation is requested
      if (config.statsConfig.roleEnabled && !config.statsConfig.roleTargetId) {
        toast.error('Veuillez sélectionner un rôle cible pour les statistiques de rôles.');
        throw new Error('Rôle cible manquant');
      }

      const res = await updateChannelsManagementConfig({
        autoThreadEnabled: config.autoThreadEnabled,
        autoThreadChannels: config.autoThreadChannels,
        statsEnabled: config.statsEnabled,
        statsConfig: config.statsConfig,
        tempVoiceEnabled: config.tempVoiceEnabled,
        tempVoiceChannelId: config.tempVoiceChannelId || null,
        tempVoiceCategoryId: config.tempVoiceCategoryId || null,
        tempVoiceNameTemplate: config.tempVoiceNameTemplate,
        tempVoiceRequiredRoleId: config.tempVoiceRequiredRoleId || null,
        tempVoiceGenerators: config.tempVoiceGenerators || [],
        honeypotEnabled: config.honeypotEnabled,
        honeypotChannelIds: config.honeypotChannelIds,
        honeypotSanction: config.honeypotSanction,
        honeypotReinvite: config.honeypotReinvite,
      } as any);

      if (!res || !res.ok) throw new Error('Erreur de sauvegarde API');

      // Update local state with resolved (auto-created) values from backend
      if (res.resolved) {
        if (res.resolved.tempVoiceChannelId) config.tempVoiceChannelId = res.resolved.tempVoiceChannelId;
        if (res.resolved.tempVoiceCategoryId) config.tempVoiceCategoryId = res.resolved.tempVoiceCategoryId;
        if (Array.isArray(res.resolved.tempVoiceGenerators)) config.tempVoiceGenerators = res.resolved.tempVoiceGenerators;
        if (Array.isArray(res.resolved.honeypotChannelIds)) config.honeypotChannelIds = res.resolved.honeypotChannelIds;
        if (res.resolved.honeypotSanction) config.honeypotSanction = res.resolved.honeypotSanction;
        if (res.resolved.honeypotReinvite !== undefined) config.honeypotReinvite = res.resolved.honeypotReinvite;
        if (res.resolved.statsConfig) {
          config.statsConfig = {
            ...config.statsConfig,
            ...res.resolved.statsConfig
          };
        }
      }
      
      await dashboardStore.refresh();
      savedConfig = JSON.parse(JSON.stringify(config));
      success = true;
      return true;
    }, { successMessage: 'Configuration enregistrée avec succès.' });
    return success;
  }

  function toggleChannel(channelId: string) {
    if (config.autoThreadChannels.includes(channelId)) {
      config.autoThreadChannels = config.autoThreadChannels.filter(id => id !== channelId);
    } else {
      config.autoThreadChannels = [...config.autoThreadChannels, channelId];
    }
  }

  function selectAll() {
    config.autoThreadChannels = filteredChannels.map(c => c.id);
  }

  function deselectAll() {
    config.autoThreadChannels = [];
  }
</script>

<ModulePage
  title="Gestion des salons"
  description="Gérez les modules d'automatisation, de statistiques, de création de salons vocaux temporaires et de sécurité honeypot."
  icon="hash"
  featureKey="auto_thread"
>

  <InlineFeedback message={saveAction.state.message} error={saveAction.state.error} />

  {#if loading}
    <div class="flex flex-col gap-6 animate-pulse">
      <div class="h-12 w-48 bg-surface-container-low/60 rounded-xl"></div>
      <div class="h-64 rounded-xl bg-surface-container-low/60"></div>
    </div>
    <div class="flex justify-center mt-4">
      <LoadingHint context="config" />
    </div>
  {:else if loadError}
    <div class="rounded-xl bg-error/10 border border-error/20 p-6 text-error text-sm font-semibold">
      ⚠️ {loadError}
    </div>
  {:else}
    <!-- Tab Switcher -->
    <div class="flex border-b border-outline-variant/20 mb-8 overflow-x-auto no-scrollbar">
      <button 
        onclick={() => activeTab = 'auto-thread'}
        class="px-6 py-4 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap transition-all relative {activeTab === 'auto-thread' ? 'text-primary' : 'text-on-surface-variant/40 hover:text-on-surface-variant'}"
      >
        Auto-Thread
        {#if activeTab === 'auto-thread'}
          <div class="absolute bottom-0 left-6 right-6 h-0.5 bg-primary rounded-t-full"></div>
        {/if}
      </button>

      <button 
        onclick={() => activeTab = 'stats'}
        class="px-6 py-4 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap transition-all relative {activeTab === 'stats' ? 'text-primary' : 'text-on-surface-variant/40 hover:text-on-surface-variant'}"
      >
        Salons Stats
        {#if activeTab === 'stats'}
          <div class="absolute bottom-0 left-6 right-6 h-0.5 bg-primary rounded-t-full"></div>
        {/if}
      </button>

      <button 
        onclick={() => activeTab = 'temp-voice'}
        class="px-6 py-4 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap transition-all relative {activeTab === 'temp-voice' ? 'text-primary' : 'text-on-surface-variant/40 hover:text-on-surface-variant'}"
      >
        Créer son salon
        {#if activeTab === 'temp-voice'}
          <div class="absolute bottom-0 left-6 right-6 h-0.5 bg-primary rounded-t-full"></div>
        {/if}
      </button>

      <button 
        onclick={() => activeTab = 'honeypot'}
        class="px-6 py-4 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap transition-all relative {activeTab === 'honeypot' ? 'text-primary' : 'text-on-surface-variant/40 hover:text-on-surface-variant'}"
      >
        Salon Honeypot
        {#if activeTab === 'honeypot'}
          <div class="absolute bottom-0 left-6 right-6 h-0.5 bg-primary rounded-t-full"></div>
        {/if}
      </button>
    </div>

    <!-- Active Content Tab -->
    <div class="grid grid-cols-1 gap-8">
      {#if activeTab === 'auto-thread'}
        <!-- AUTO-THREAD TAB -->
        <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 class="text-xl font-semibold flex items-center gap-3">
                <Papicon icon="chat" size={20} class="text-primary" />
                Salons éligibles aux fils
              </h3>
              <p class="text-xs text-on-surface-variant/60 mt-1">Sélectionnez les salons textuels et d'annonces où les fils de discussion doivent être créés automatiquement.</p>
            </div>
            
            <div class="flex items-center gap-2">
              <button 
                onclick={selectAll}
                class="px-4 py-2 bg-surface-container-high/40 hover:bg-surface-container-high/80 border border-outline-variant/10 text-xs font-bold rounded-xl transition-all"
              >
                Sélectionner tout (filtre)
              </button>
              <button 
                onclick={deselectAll}
                class="px-4 py-2 bg-surface-container-high/40 hover:bg-surface-container-high/80 border border-outline-variant/10 text-xs font-bold rounded-xl transition-all"
              >
                Tout désélectionner
              </button>
            </div>
          </div>

          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <div class="flex-1 relative">
              <input
                type="text"
                bind:value={searchQuery}
                placeholder="Rechercher un salon..."
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg pl-11 pr-5 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all outline-none"
              />
              <div class="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50">
                <Papicon icon="search" size={16} />
              </div>
            </div>
            
            <div class="px-5 py-3 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 flex items-center gap-2 text-xs font-bold">
              <span class="text-primary">{config.autoThreadChannels.length}</span>
              <span class="text-on-surface-variant/60">salon(s) sélectionné(s)</span>
            </div>
          </div>

          {#if filteredChannels.length > 0}
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[450px] overflow-y-auto pr-2 no-scrollbar">
              {#each filteredChannels as channel}
                {@const isChecked = config.autoThreadChannels.includes(channel.id)}
                <button
                  onclick={() => toggleChannel(channel.id)}
                  class="flex items-center justify-between p-4 rounded-lg border transition-all text-left group
                    {isChecked 
                      ? 'bg-primary/5 border-primary/30 text-primary hover:bg-primary/10' 
                      : 'bg-surface-container-high/10 border-outline-variant/5 hover:bg-surface-container-high/30'}"
                >
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center {isChecked ? 'bg-primary/10' : 'bg-surface-container-highest'}">
                      <span class="text-sm font-semibold opacity-60">#</span>
                    </div>
                    <span class="text-sm font-semibold truncate max-w-[180px]">{channel.name}</span>
                  </div>
                  
                  <div class="w-5 h-5 rounded-md border flex items-center justify-center transition-all
                    {isChecked 
                      ? 'bg-primary border-primary text-on-primary' 
                      : 'border-outline-variant/30 group-hover:border-outline-variant/60'}"
                  >
                    {#if isChecked}
                      <Papicon icon="check" size={12} class="text-white" />
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          {:else}
            <div class="flex flex-col items-center justify-center py-12 text-on-surface-variant/30 bg-surface-container-high/10 border border-dashed border-outline-variant/10 rounded-lg gap-3">
              <Papicon icon="search" size={32} class="opacity-30" />
              <p class="text-sm font-bold">Aucun salon ne correspond à votre recherche.</p>
            </div>
          {/if}
        </section>

      {:else if activeTab === 'stats'}
        <!-- STATS CHANNELS TAB -->
        <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6">
          <InlineFeedback message={rescanAction.state.message} error={rescanAction.state.error} />

          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-xl font-semibold flex items-center gap-3">
                <Papicon icon="bar-chart" size={20} class="text-primary" />
                Salons de Statistiques
              </h3>
              <p class="text-xs text-on-surface-variant/60 mt-1">Affichez des compteurs en temps réel (Membres, Bots, Rôles...) directement dans les noms de salons vocaux.</p>
            </div>
            
            <div class="flex items-center gap-2">
              <input 
                type="checkbox" 
                bind:checked={config.statsEnabled} 
                class="w-10 h-6 bg-surface-container-high rounded-full relative appearance-none cursor-pointer transition-all border border-outline-variant/20 checked:bg-primary before:content-[''] before:absolute before:h-4 before:w-4 before:rounded-full before:bg-white before:top-0.5 before:left-0.5 checked:before:translate-x-4 before:transition-all"
              />
            </div>
          </div>

          {#if config.statsEnabled}
            <!-- Category Selection for Stats -->
            <div class="space-y-1.5 max-w-xl pb-4 border-b border-outline-variant/10">
              <label for="stats-category-select" class="text-xs font-bold text-on-surface/80 block">📁 Catégorie de création des salons de statistiques</label>
              <div class="flex gap-2">
                <div class="flex-1">
                  <SearchableSelect 
                    id="stats-category-select"
                    options={availableCategories.map(c => ({ id: c.id, name: `📁 ${c.name}` }))} 
                    bind:value={config.statsConfig.categoryId} 
                    placeholder="— Créer la catégorie automatiquement —"
                  />
                </div>
                <button
                  type="button"
                  onclick={async () => {
                    config.statsConfig.categoryId = '';
                    await handleSave();
                  }}
                  disabled={saveAction.state.loading || loading}
                  class="px-4 py-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-bold rounded-lg transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Créer la catégorie
                </button>
              </div>
            </div>

            <!-- Historical Scraping Trigger -->
            <div class="p-6 bg-primary/5 border border-primary/20 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div class="space-y-1">
                <h4 class="text-sm font-semibold flex items-center gap-2 text-primary">
                  <Papicon icon="history" size={16} />
                  Reconstruire les Statistiques Historiques
                </h4>
                <p class="text-xs text-on-surface-variant/60">
                  Scrapper tous les messages passés de vos salons textuels pour générer les graphiques d'activité sur le dashboard.
                </p>
              </div>
              <div class="flex gap-2 w-full md:w-auto">
                <button
                  type="button"
                  onclick={async () => {
                    await handleRescanStats(false);
                  }}
                  disabled={rescanAction.state.loading || loading}
                  class="px-5 py-3 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-lg transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed flex-1 md:flex-none"
                >
                  Lancer le Scan
                </button>
                <button
                  type="button"
                  onclick={async () => {
                    if (confirm("Attention : Cela écrasera et recalculera toutes les statistiques existantes du serveur. Continuer ?")) {
                      await handleRescanStats(true);
                    }
                  }}
                  disabled={rescanAction.state.loading || loading}
                  class="px-5 py-3 bg-error/10 hover:bg-error/20 text-error border border-error/20 text-xs font-bold rounded-lg transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed flex-1 md:flex-none"
                >
                  Forcer le Re-scan
                </button>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              <!-- Member Count -->
              <div class="space-y-3 p-5 bg-surface-container-high/20 border border-outline-variant/5 rounded-xl transition-all">
                <div class="flex items-center justify-between">
                  <label for="stats-member-channel" class="text-xs font-bold text-on-surface/80 block">👤 Compteur de Membres</label>
                  <input 
                    type="checkbox" 
                    bind:checked={config.statsConfig.memberEnabled} 
                    class="w-8 h-5 bg-surface-container-high rounded-full relative appearance-none cursor-pointer transition-all border border-outline-variant/20 checked:bg-primary before:content-[''] before:absolute before:h-3.5 before:w-3.5 before:rounded-full before:bg-white before:top-0.5 before:left-0.5 checked:before:translate-x-3 before:transition-all"
                  />
                </div>
                {#if config.statsConfig.memberEnabled}
                  <div class="flex gap-2">
                    <div class="flex-1">
                      <SearchableSelect 
                        id="stats-member-channel"
                        options={availableVoiceChannels.map(c => ({ id: c.id, name: `🔊 ${c.name}` }))} 
                        bind:value={config.statsConfig.memberChannelId} 
                        placeholder="— Créer le salon automatiquement —"
                      />
                    </div>
                    <button
                      type="button"
                      onclick={async () => {
                        config.statsConfig.memberChannelId = '';
                        await handleSave();
                      }}
                      disabled={saveAction.state.loading || loading}
                      class="px-4 py-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-bold rounded-lg transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Créer le salon
                    </button>
                  </div>
                  <input 
                    type="text" 
                    bind:value={config.statsConfig.memberTemplate} 
                    placeholder="Template: Membres : {'{count}'}" 
                    class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-5 py-2.5 text-xs outline-none focus:ring-1 focus:ring-primary/30"
                  />
                {/if}
              </div>

              <!-- Bot Count -->
              <div class="space-y-3 p-5 bg-surface-container-high/20 border border-outline-variant/5 rounded-xl transition-all">
                <div class="flex items-center justify-between">
                  <label for="stats-bot-channel" class="text-xs font-bold text-on-surface/80 block">🤖 Compteur de Bots</label>
                  <input 
                    type="checkbox" 
                    bind:checked={config.statsConfig.botEnabled} 
                    class="w-8 h-5 bg-surface-container-high rounded-full relative appearance-none cursor-pointer transition-all border border-outline-variant/20 checked:bg-primary before:content-[''] before:absolute before:h-3.5 before:w-3.5 before:rounded-full before:bg-white before:top-0.5 before:left-0.5 checked:before:translate-x-3 before:transition-all"
                  />
                </div>
                {#if config.statsConfig.botEnabled}
                  <div class="flex gap-2">
                    <div class="flex-1">
                      <SearchableSelect 
                        id="stats-bot-channel"
                        options={availableVoiceChannels.map(c => ({ id: c.id, name: `🔊 ${c.name}` }))} 
                        bind:value={config.statsConfig.botChannelId} 
                        placeholder="— Créer le salon automatiquement —"
                      />
                    </div>
                    <button
                      type="button"
                      onclick={async () => {
                        config.statsConfig.botChannelId = '';
                        await handleSave();
                      }}
                      disabled={saveAction.state.loading || loading}
                      class="px-4 py-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-bold rounded-lg transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Créer le salon
                    </button>
                  </div>
                  <input 
                    type="text" 
                    bind:value={config.statsConfig.botTemplate} 
                    placeholder="Template: Bots : {'{count}'}" 
                    class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-5 py-2.5 text-xs outline-none focus:ring-1 focus:ring-primary/30"
                  />
                {/if}
              </div>

              <!-- Role Member Count -->
              <div class="space-y-3 p-5 bg-surface-container-high/20 border border-outline-variant/5 rounded-xl transition-all">
                <div class="flex items-center justify-between">
                  <label for="stats-role-channel" class="text-xs font-bold text-on-surface/80 block">👑 Compteur par Rôle</label>
                  <input 
                    type="checkbox" 
                    bind:checked={config.statsConfig.roleEnabled} 
                    class="w-8 h-5 bg-surface-container-high rounded-full relative appearance-none cursor-pointer transition-all border border-outline-variant/20 checked:bg-primary before:content-[''] before:absolute before:h-3.5 before:w-3.5 before:rounded-full before:bg-white before:top-0.5 before:left-0.5 checked:before:translate-x-3 before:transition-all"
                  />
                </div>
                {#if config.statsConfig.roleEnabled}
                  <div class="flex gap-2">
                    <div class="flex-1">
                      <SearchableSelect 
                        id="stats-role-channel"
                        options={availableVoiceChannels.map(c => ({ id: c.id, name: `🔊 ${c.name}` }))} 
                        bind:value={config.statsConfig.roleChannelId} 
                        placeholder="— Créer le salon automatiquement —"
                      />
                    </div>
                    <button
                      type="button"
                      onclick={async () => {
                        config.statsConfig.roleChannelId = '';
                        await handleSave();
                      }}
                      disabled={saveAction.state.loading || loading}
                      class="px-4 py-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-bold rounded-lg transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Créer le salon
                    </button>
                  </div>
                  <SearchableSelect 
                    options={availableRoles.map(r => ({ id: r.id, name: `@${r.name}` }))} 
                    bind:value={config.statsConfig.roleTargetId} 
                    placeholder="— Sélectionner le rôle cible —"
                  />
                  <input 
                    type="text" 
                    bind:value={config.statsConfig.roleTemplate} 
                    placeholder="Template: Staff : {'{count}'}" 
                    class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-5 py-2.5 text-xs outline-none focus:ring-1 focus:ring-primary/30"
                  />
                {/if}
              </div>

              <!-- Channels Count -->
              <div class="space-y-3 p-5 bg-surface-container-high/20 border border-outline-variant/5 rounded-xl transition-all">
                <div class="flex items-center justify-between">
                  <label for="stats-channel-channel" class="text-xs font-bold text-on-surface/80 block">💬 Compteur de Salons</label>
                  <input 
                    type="checkbox" 
                    bind:checked={config.statsConfig.channelEnabled} 
                    class="w-8 h-5 bg-surface-container-high rounded-full relative appearance-none cursor-pointer transition-all border border-outline-variant/20 checked:bg-primary before:content-[''] before:absolute before:h-3.5 before:w-3.5 before:rounded-full before:bg-white before:top-0.5 before:left-0.5 checked:before:translate-x-3 before:transition-all"
                  />
                </div>
                {#if config.statsConfig.channelEnabled}
                  <div class="flex gap-2">
                    <div class="flex-1">
                      <SearchableSelect 
                        id="stats-channel-channel"
                        options={availableVoiceChannels.map(c => ({ id: c.id, name: `🔊 ${c.name}` }))} 
                        bind:value={config.statsConfig.channelChannelId} 
                        placeholder="— Créer le salon automatiquement —"
                      />
                    </div>
                    <button
                      type="button"
                      onclick={async () => {
                        config.statsConfig.channelChannelId = '';
                        await handleSave();
                      }}
                      disabled={saveAction.state.loading || loading}
                      class="px-4 py-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-bold rounded-lg transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Créer le salon
                    </button>
                  </div>
                  <input 
                    type="text" 
                    bind:value={config.statsConfig.channelTemplate} 
                    placeholder="Template: Salons : {'{count}'}" 
                    class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-5 py-2.5 text-xs outline-none focus:ring-1 focus:ring-primary/30"
                  />
                {/if}
              </div>

              <!-- Categories Count -->
              <div class="space-y-3 p-5 bg-surface-container-high/20 border border-outline-variant/5 rounded-xl transition-all">
                <div class="flex items-center justify-between">
                  <label for="stats-category-channel" class="text-xs font-bold text-on-surface/80 block">📁 Compteur de Catégories</label>
                  <input 
                    type="checkbox" 
                    bind:checked={config.statsConfig.categoryEnabled} 
                    class="w-8 h-5 bg-surface-container-high rounded-full relative appearance-none cursor-pointer transition-all border border-outline-variant/20 checked:bg-primary before:content-[''] before:absolute before:h-3.5 before:w-3.5 before:rounded-full before:bg-white before:top-0.5 before:left-0.5 checked:before:translate-x-3 before:transition-all"
                  />
                </div>
                {#if config.statsConfig.categoryEnabled}
                  <div class="flex gap-2">
                    <div class="flex-1">
                      <SearchableSelect 
                        id="stats-category-channel"
                        options={availableVoiceChannels.map(c => ({ id: c.id, name: `🔊 ${c.name}` }))} 
                        bind:value={config.statsConfig.categoryChannelId} 
                        placeholder="— Créer le salon automatiquement —"
                      />
                    </div>
                    <button
                      type="button"
                      onclick={async () => {
                        config.statsConfig.categoryChannelId = '';
                        await handleSave();
                      }}
                      disabled={saveAction.state.loading || loading}
                      class="px-4 py-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-bold rounded-lg transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Créer le salon
                    </button>
                  </div>
                  <input 
                    type="text" 
                    bind:value={config.statsConfig.categoryTemplate} 
                    placeholder="Template: Catégories : {'{count}'}" 
                    class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-5 py-2.5 text-xs outline-none focus:ring-1 focus:ring-primary/30"
                  />
                {/if}
              </div>

              <!-- Activity Count -->
              <div class="space-y-3 p-5 bg-surface-container-high/20 border border-outline-variant/5 rounded-xl transition-all">
                <div class="flex items-center justify-between">
                  <label for="stats-activity-channel" class="text-xs font-bold text-on-surface/80 block">📈 Compteur d'Activité (24h)</label>
                  <input 
                    type="checkbox" 
                    bind:checked={config.statsConfig.activityEnabled} 
                    class="w-8 h-5 bg-surface-container-high rounded-full relative appearance-none cursor-pointer transition-all border border-outline-variant/20 checked:bg-primary before:content-[''] before:absolute before:h-3.5 before:w-3.5 before:rounded-full before:bg-white before:top-0.5 before:left-0.5 checked:before:translate-x-3 before:transition-all"
                  />
                </div>
                {#if config.statsConfig.activityEnabled}
                  <div class="flex gap-2">
                    <div class="flex-1">
                      <SearchableSelect 
                        id="stats-activity-channel"
                        options={availableVoiceChannels.map(c => ({ id: c.id, name: `🔊 ${c.name}` }))} 
                        bind:value={config.statsConfig.activityChannelId} 
                        placeholder="— Créer le salon automatiquement —"
                      />
                    </div>
                    <button
                      type="button"
                      onclick={async () => {
                        config.statsConfig.activityChannelId = '';
                        await handleSave();
                      }}
                      disabled={saveAction.state.loading || loading}
                      class="px-4 py-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-bold rounded-lg transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Créer le salon
                    </button>
                  </div>
                  <input 
                    type="text" 
                    bind:value={config.statsConfig.activityTemplate} 
                    placeholder="Template: Actifs 24h : {'{count}'}" 
                    class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-5 py-2.5 text-xs outline-none focus:ring-1 focus:ring-primary/30"
                  />
                {/if}
              </div>
            </div>

            <!-- Custom stats channels -->
            <div class="border-t border-outline-variant/10 pt-6 mt-6 space-y-4">
              <div>
                <h4 class="text-sm font-semibold flex items-center gap-2">
                  <Papicon icon="plus-circle" size={16} class="text-primary" />
                  Salons de Statistiques Personnalisés
                </h4>
                <p class="text-xs text-on-surface-variant/60">Ajoutez des compteurs spécifiques ou des objectifs de membres.</p>
              </div>

              {#if !config.statsConfig.customStats}
                {config.statsConfig.customStats = []}
              {/if}

              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                {#each config.statsConfig.customStats as custom, index}
                  <div class="p-5 bg-surface-container-high/10 border border-outline-variant/5 rounded-xl space-y-4 transition-all">
                    <div class="flex items-center justify-between border-b border-outline-variant/10 pb-3 mb-2">
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-primary">Compteur #{index + 1}</span>
                      <button
                        type="button"
                        onclick={() => {
                          config.statsConfig.customStats = config.statsConfig.customStats.filter((_, i) => i !== index);
                        }}
                        class="text-on-surface-variant/60 hover:text-error transition-all flex items-center gap-1.5 text-xs font-bold"
                        title="Supprimer ce compteur"
                      >
                        <Papicon icon="trash-2" size={14} />
                        Supprimer
                      </button>
                    </div>

                    <div class="space-y-4">
                      <!-- Enabled checkbox & Type -->
                      <div class="space-y-1.5">
                        <div class="flex items-center justify-between">
                          <label for="custom-type-{index}" class="text-xs font-bold text-on-surface/80 block">Type de Statistique</label>
                          <label class="flex items-center gap-2 text-xs font-bold text-on-surface/80 cursor-pointer">
                            Activer
                            <input 
                              type="checkbox" 
                              bind:checked={custom.enabled} 
                              class="w-8 h-5 bg-surface-container-high rounded-full relative appearance-none cursor-pointer transition-all border border-outline-variant/20 checked:bg-primary before:content-[''] before:absolute before:h-3.5 before:w-3.5 before:rounded-full before:bg-white before:top-0.5 before:left-0.5 checked:before:translate-x-3 before:transition-all"
                            />
                          </label>
                        </div>
                        <select
                          id="custom-type-{index}"
                          bind:value={custom.type}
                          class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-2.5 text-xs outline-none focus:ring-1 focus:ring-primary/30"
                        >
                          <option value="members">👤 Membres Totaux</option>
                          <option value="bots">🤖 Bots Totaux</option>
                          <option value="online">🟢 Membres en Ligne</option>
                          <option value="voice">🔊 Membres en Vocal</option>
                          <option value="role">👑 Rôle Spécifique</option>
                          <option value="channels">💬 Salons Totaux</option>
                          <option value="categories">📁 Catégories Totales</option>
                          <option value="activity">📈 Actifs (24h)</option>
                          <option value="boosts">⚡ Boosts de Serveur</option>
                          <option value="goal">🎯 Objectif de Membres</option>
                        </select>
                      </div>

                      <!-- Channel Selection -->
                      <div class="space-y-1.5">
                        <label for="custom-channel-{index}" class="text-xs font-bold text-on-surface/80 block">Salon Vocal</label>
                        {#if custom.enabled}
                          <div class="flex gap-2">
                            <div class="flex-1">
                              <SearchableSelect 
                                id="custom-channel-{index}"
                                options={availableVoiceChannels.map(c => ({ id: c.id, name: `🔊 ${c.name}` }))} 
                                bind:value={custom.channelId} 
                                placeholder="— Créer le salon automatiquement —"
                              />
                            </div>
                            <button
                              type="button"
                              onclick={async () => {
                                custom.channelId = '';
                                await handleSave();
                              }}
                              disabled={saveAction.state.loading || loading}
                              class="px-4 py-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-bold rounded-lg transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Créer
                            </button>
                          </div>
                        {:else}
                          <div class="text-xs text-on-surface-variant/40 bg-surface-container-high/20 border border-outline-variant/10 rounded-lg px-4 py-2.5">
                            Compteur désactivé
                          </div>
                        {/if}
                      </div>

                      <!-- Conditional field: Role ID -->
                      {#if custom.type === 'role'}
                        <div class="space-y-1.5">
                          <label for="custom-role-select-{index}" class="text-xs font-bold text-on-surface/80 block">Rôle cible</label>
                          <SearchableSelect 
                            id="custom-role-select-{index}"
                            options={availableRoles.map(r => ({ id: r.id, name: `@${r.name}` }))} 
                            bind:value={custom.roleTargetId} 
                            placeholder="— Sélectionner le rôle cible —"
                          />
                        </div>
                      {/if}

                      <!-- Conditional field: Member Goal -->
                      {#if custom.type === 'goal'}
                        <div class="space-y-1.5">
                          <label for="custom-goal-{index}" class="text-xs font-bold text-on-surface/80 block">Objectif (Nombre cible)</label>
                          <input 
                            id="custom-goal-{index}"
                            type="number"
                            bind:value={custom.goalTarget}
                            placeholder="Ex: 1000"
                            class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-5 py-2.5 text-xs outline-none focus:ring-1 focus:ring-primary/30"
                          />
                        </div>
                      {/if}

                      <!-- Template -->
                      <div class="space-y-1.5">
                        <label for="custom-template-{index}" class="text-xs font-bold text-on-surface/80 block">Modèle du nom (Template)</label>
                        <input 
                          id="custom-template-{index}"
                          type="text" 
                          bind:value={custom.template} 
                          placeholder={custom.type === 'goal' ? '🎯 Objectif : {count}/{goal}' : 'Template: Nom : {count}'} 
                          class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-5 py-2.5 text-xs outline-none focus:ring-1 focus:ring-primary/30"
                        />
                        <p class="text-[11px] text-on-surface-variant/40 mt-1">
                          Le mot clé <code>{"{count}"}</code> sera remplacé par le nombre actuel.
                          {#if custom.type === 'goal'}
                            Le mot clé <code>{"{goal}"}</code> sera remplacé par le nombre cible.
                          {/if}
                        </p>
                      </div>
                    </div>
                  </div>
                {/each}

                <button
                  type="button"
                  onclick={() => {
                    config.statsConfig.customStats = [
                      ...(config.statsConfig.customStats || []),
                      {
                        enabled: true,
                        type: 'members',
                        channelId: '',
                        template: '👤 Membres : {count}',
                        roleTargetId: '',
                        goalTarget: 1000
                      }
                    ];
                  }}
                  class="col-span-1 md:col-span-2 py-4 border border-dashed border-outline-variant/20 hover:border-primary/40 text-on-surface-variant/60 hover:text-primary transition-all rounded-xl text-xs font-semibold flex items-center justify-center gap-2"
                >
                  <Papicon icon="plus" size={16} />
                  Ajouter un compteur personnalisé
                </button>
              </div>
            </div>
            <p class="text-[10px] text-on-surface-variant/40 mt-4 block">💡 Les noms des salons de statistiques sont rafraîchis toutes les 10 minutes par le bot pour éviter les limitations de l'API Discord.</p>
          {/if}
        </section>

      {:else if activeTab === 'temp-voice'}
        <!-- DYNAMIC VOCAL CREATORS TAB -->
        <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-xl font-semibold flex items-center gap-3">
                <Papicon icon="volume-2" size={20} class="text-primary" />
                Créer son salon (Salons Temporaires)
              </h3>
              <p class="text-xs text-on-surface-variant/60 mt-1">Créez un salon vocal "générateur". Quand un membre le rejoint, un nouveau salon privé temporaire est automatiquement créé pour lui.</p>
            </div>
            
            <div class="flex items-center gap-2">
              <input 
                type="checkbox" 
                bind:checked={config.tempVoiceEnabled} 
                class="w-10 h-6 bg-surface-container-high rounded-full relative appearance-none cursor-pointer transition-all border border-outline-variant/20 checked:bg-primary before:content-[''] before:absolute before:h-4 before:w-4 before:rounded-full before:bg-white before:top-0.5 before:left-0.5 checked:before:translate-x-4 before:transition-all"
              />
            </div>
          </div>

          {#if config.tempVoiceEnabled}
            <div class="space-y-4 pt-4 border-t border-outline-variant/10 max-w-xl">
              <!-- Generator Voice Channel Selection -->
              <div class="space-y-1.5">
                <label for="temp-voice-channel-select" class="text-xs font-bold text-on-surface/80 block">🔊 Salon Vocal Générateur</label>
                <div class="flex gap-2">
                  <div class="flex-1">
                    <SearchableSelect 
                      id="temp-voice-channel-select"
                      options={availableVoiceChannels.map(c => ({ id: c.id, name: `🔊 ${c.name}` }))} 
                      bind:value={config.tempVoiceChannelId} 
                      placeholder="— Créer le salon automatiquement —"
                    />
                  </div>
                  <button
                    type="button"
                    onclick={async () => {
                      config.tempVoiceChannelId = '';
                      await handleSave();
                    }}
                    disabled={saveAction.state.loading || loading}
                    class="px-4 py-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-bold rounded-lg transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Créer le salon
                  </button>
                </div>
              </div>

              <!-- Target Category Selection -->
              <div class="space-y-1.5">
                <label for="temp-voice-category-select" class="text-xs font-bold text-on-surface/80 block">📁 Catégorie de création</label>
                <div class="flex gap-2">
                  <div class="flex-1">
                    <SearchableSelect 
                      id="temp-voice-category-select"
                      options={availableCategories.map(c => ({ id: c.id, name: `📁 ${c.name}` }))} 
                      bind:value={config.tempVoiceCategoryId} 
                      placeholder="— Créer la catégorie automatiquement —"
                    />
                  </div>
                  <button
                    type="button"
                    onclick={async () => {
                      config.tempVoiceCategoryId = '';
                      await handleSave();
                    }}
                    disabled={saveAction.state.loading || loading}
                    class="px-4 py-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-bold rounded-lg transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Créer la catégorie
                  </button>
                </div>
              </div>

              <!-- Name Template -->
              <div class="space-y-1.5">
                <label for="temp-voice-name-template-input" class="text-xs font-bold text-on-surface/80 block">✏️ Modèle de nom du salon</label>
                <input 
                  id="temp-voice-name-template-input"
                  type="text" 
                  bind:value={config.tempVoiceNameTemplate} 
                  placeholder="Ex: 🔊 Salon de {'{user}'}" 
                  class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                />
                <p class="text-[10px] text-on-surface-variant/40 mt-1">Le mot clé `{"{user}"}` sera remplacé par le pseudonyme du membre.</p>
              </div>

              <!-- Role Restriction Selection -->
              <div class="space-y-1.5">
                <label for="temp-voice-role-select" class="text-xs font-bold text-on-surface/80 block">👑 Rôle requis pour utiliser</label>
                <SearchableSelect 
                  id="temp-voice-role-select"
                  options={availableRoles.map(r => ({ id: r.id, name: `@${r.name}` }))} 
                  bind:value={config.tempVoiceRequiredRoleId} 
                  placeholder="— Aucun rôle requis (ouvert à tous) —"
                />
              </div>

              {#if !config.tempVoiceGenerators}
                {config.tempVoiceGenerators = []}
              {/if}

              <!-- Secondary Voice Generators List -->
              <div class="border-t border-outline-variant/10 pt-6 mt-6 space-y-4">
                <div>
                  <h4 class="text-sm font-semibold flex items-center gap-2 text-primary">
                    <Papicon icon="plus-circle" size={16} />
                    Salons Générateurs Additionnels
                  </h4>
                  <p class="text-xs text-on-surface-variant/60">Ajoutez d'autres salons générateurs de salons temporaires (ex: pour d'autres catégories ou avec d'autres templates de noms).</p>
                </div>

                <div class="grid grid-cols-1 gap-6">
                  {#each config.tempVoiceGenerators as generator, index}
                    <div class="p-5 bg-surface-container-high/10 border border-outline-variant/5 rounded-xl space-y-4 transition-all">
                      <div class="flex items-center justify-between border-b border-outline-variant/10 pb-3 mb-2">
                        <span class="text-[10px] font-semibold uppercase tracking-wider text-primary">Générateur #{index + 2}</span>
                        <button
                          type="button"
                          onclick={() => {
                            config.tempVoiceGenerators = config.tempVoiceGenerators.filter((_, i) => i !== index);
                          }}
                          class="text-on-surface-variant/60 hover:text-error transition-all flex items-center gap-1.5 text-xs font-bold"
                          title="Supprimer ce générateur"
                        >
                          <Papicon icon="trash-2" size={14} />
                          Supprimer
                        </button>
                      </div>

                      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <!-- Generator Voice Channel Selection -->
                        <div class="space-y-1.5">
                          <label for="temp-voice-channel-select-{index}" class="text-xs font-bold text-on-surface/80 block">🔊 Salon Vocal Générateur</label>
                          <div class="flex gap-2">
                            <div class="flex-1">
                              <SearchableSelect 
                                id="temp-voice-channel-select-{index}"
                                options={availableVoiceChannels.map(c => ({ id: c.id, name: `🔊 ${c.name}` }))} 
                                bind:value={generator.channelId} 
                                placeholder="— Créer automatiquement —"
                              />
                            </div>
                            <button
                              type="button"
                              onclick={async () => {
                                generator.channelId = '';
                                await handleSave();
                              }}
                              disabled={saveAction.state.loading || loading}
                              class="px-3 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-bold rounded-lg transition-all"
                            >
                              Créer
                            </button>
                          </div>
                        </div>

                        <!-- Target Category Selection -->
                        <div class="space-y-1.5">
                          <label for="temp-voice-category-select-{index}" class="text-xs font-bold text-on-surface/80 block">📁 Catégorie de création</label>
                          <div class="flex gap-2">
                            <div class="flex-1">
                              <SearchableSelect 
                                id="temp-voice-category-select-{index}"
                                options={availableCategories.map(c => ({ id: c.id, name: `📁 ${c.name}` }))} 
                                bind:value={generator.categoryId} 
                                placeholder="— Créer automatiquement —"
                              />
                            </div>
                            <button
                              type="button"
                              onclick={async () => {
                                generator.categoryId = '';
                                await handleSave();
                              }}
                              disabled={saveAction.state.loading || loading}
                              class="px-3 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-bold rounded-lg transition-all"
                            >
                              Créer
                            </button>
                          </div>
                        </div>

                        <!-- Name Template -->
                        <div class="space-y-1.5">
                          <label for="temp-voice-name-template-input-{index}" class="text-xs font-bold text-on-surface/80 block">✏️ Modèle de nom du salon</label>
                          <input 
                            id="temp-voice-name-template-input-{index}"
                            type="text" 
                            bind:value={generator.nameTemplate} 
                            placeholder="Ex: 🔊 Salon de {'{user}'}" 
                            class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-2.5 text-xs outline-none focus:ring-1 focus:ring-primary/30 transition-all"
                          />
                        </div>

                        <!-- Required Role Selector -->
                        <div class="space-y-1.5">
                          <label for="temp-voice-role-select-{index}" class="text-xs font-bold text-on-surface/80 block">👑 Rôle requis</label>
                          <SearchableSelect 
                            id="temp-voice-role-select-{index}"
                            options={availableRoles.map(r => ({ id: r.id, name: `@${r.name}` }))} 
                            bind:value={generator.requiredRoleId} 
                            placeholder="— Aucun rôle (public) —"
                          />
                        </div>
                      </div>
                    </div>
                  {/each}

                  <button
                    type="button"
                    onclick={() => {
                      config.tempVoiceGenerators = [
                        ...(config.tempVoiceGenerators || []),
                        {
                          channelId: '',
                          categoryId: '',
                          nameTemplate: '🔊 Salon de {user}',
                          requiredRoleId: ''
                        }
                      ];
                    }}
                    class="py-4 border border-dashed border-outline-variant/20 hover:border-primary/40 text-on-surface-variant/60 hover:text-primary transition-all rounded-xl text-xs font-semibold flex items-center justify-center gap-2"
                  >
                    <Papicon icon="plus" size={16} />
                    Ajouter un salon vocal générateur supplémentaire
                  </button>
                </div>
              </div>

              <!-- Description of Chat Control Embed -->
              <div class="p-5 bg-primary/5 border border-primary/20 rounded-xl mt-4">
                <h4 class="text-xs font-semibold text-primary uppercase tracking-wider mb-2">ℹ️ Embed de gestion du salon</h4>
                <p class="text-xs text-on-surface-variant/80 leading-relaxed">
                  Dès la création du salon vocal temporaire, Kotbo enverra automatiquement un message embed interactif dans le chat textuel du salon vocal. Ce message permettra au créateur de gérer son salon à l'aide de boutons :
                  <br/><strong class="text-on-surface font-semibold">• Verrouiller / Déverrouiller</strong> (rendre le salon privé)
                  <br/><strong class="text-on-surface font-semibold">• Renommer</strong> (changer le nom du salon via un formulaire direct)
                  <br/><strong class="text-on-surface font-semibold">• Limite d'utilisateurs</strong> (définir le nombre maximal de personnes connectées)
                  <br/><strong class="text-on-surface font-semibold">• Exclure / Bannir</strong> (exclure un intrus du vocal)
                </p>
              </div>
            </div>
          {/if}
        </section>

        {#if config.tempVoiceEnabled}
          <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6 mt-6">
            <div class="flex items-center justify-between border-b border-outline-variant/10 pb-4">
              <div>
                <h3 class="text-xl font-semibold flex items-center gap-3">
                  <Papicon icon="volume-2" size={20} class="text-primary" />
                  Salons Temporaires Actifs
                </h3>
                <p class="text-xs text-on-surface-variant/60 mt-1">Liste des salons temporaires créés et actifs sur le serveur.</p>
              </div>
              
              <button
                type="button"
                onclick={loadActiveTempChannels}
                disabled={loadingTempChannels}
                class="px-3.5 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-bold rounded-lg transition-all flex items-center gap-2"
              >
                <Papicon icon="refresh" size={14} class={loadingTempChannels ? "animate-spin" : ""} />
                Actualiser
              </button>
            </div>

            {#if loadingTempChannels}
              <div class="flex items-center justify-center py-12">
                <div class="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
              </div>
            {:else if activeTempChannels.length === 0}
              <div class="flex flex-col items-center justify-center py-12 text-on-surface-variant/30">
                <Papicon icon="volume-x" size={32} class="opacity-50 mb-2" />
                <p class="text-xs font-bold">Aucun salon temporaire actif</p>
              </div>
            {:else}
              <!-- Desktop Table -->
              <div class="hidden md:block overflow-x-auto w-full">
                <table class="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr class="border-b border-outline-variant/15 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/70">
                      <th class="py-3 px-4">Nom du Salon</th>
                      <th class="py-3 px-4">Créateur</th>
                      <th class="py-3 px-4 text-center">Membres</th>
                      <th class="py-3 px-4">Réservation</th>
                      <th class="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each activeTempChannels as chan}
                      <tr class="border-b border-outline-variant/10 hover:bg-white/5 transition-colors">
                        <td class="py-3 px-4">
                          {#if editingChannel === chan.id}
                            <div class="flex items-center gap-2">
                              <input 
                                type="text" 
                                bind:value={newChannelName}
                                class="bg-surface-container-high/40 border border-outline-variant/20 rounded-md px-2.5 py-1 text-xs text-on-surface outline-none focus:ring-1 focus:ring-primary/50"
                              />
                              <button
                                type="button"
                                onclick={() => handleRenameChannel(chan.id)}
                                disabled={actionInProgress}
                                class="px-2 py-1 bg-primary text-white text-[10px] font-semibold rounded-md hover:scale-105 active:scale-95 transition-transform"
                              >
                                Valider
                              </button>
                              <button
                                type="button"
                                onclick={() => editingChannel = null}
                                class="px-2 py-1 bg-surface-container text-on-surface text-[10px] font-semibold rounded-md border border-outline-variant/20"
                              >
                                Annuler
                              </button>
                            </div>
                          {:else}
                            <div class="flex items-center gap-2">
                              <span class="font-mono text-sm font-bold text-on-surface">🔊 {chan.name}</span>
                              <button
                                type="button"
                                onclick={() => {
                                  editingChannel = chan.id;
                                  newChannelName = chan.name;
                                }}
                                class="text-on-surface-variant/40 hover:text-primary transition-colors"
                                title="Renommer"
                              >
                                <Papicon icon="edit" size={13} />
                              </button>
                            </div>
                          {/if}
                        </td>
                        <td class="py-3 px-4">
                          <div class="flex items-center gap-2">
                            {#if chan.creatorAvatar}
                              <img src={chan.creatorAvatar} alt={chan.creatorName} class="w-6 h-6 rounded-full border border-outline-variant/10" />
                            {:else}
                              <div class="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                                {chan.creatorName.slice(0, 1).toUpperCase()}
                              </div>
                            {/if}
                            <span class="text-xs text-on-surface-variant font-medium">{chan.creatorName}</span>
                          </div>
                        </td>
                        <td class="py-3 px-4 text-center">
                          <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                            👤 {chan.membersCount}
                          </span>
                        </td>
                        <td class="py-3 px-4">
                          <div class="max-w-[200px]">
                            <SearchableSelect 
                              options={availableRoles.map(r => ({ id: r.id, name: `@${r.name}` }))} 
                              value={chan.roleId || ''} 
                              on:change={(e) => handleReserveChannel(chan.id, e.detail.value || null)}
                              placeholder="— Public (Aucun rôle) —"
                            />
                          </div>
                        </td>
                        <td class="py-3 px-4 text-right">
                          <button
                            type="button"
                            onclick={() => handleDeleteChannel(chan.id)}
                            disabled={actionInProgress}
                            class="px-2.5 py-1.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg text-[10px] font-semibold uppercase tracking-wider hover:bg-rose-500 hover:text-white transition-all inline-flex items-center gap-1"
                          >
                            <Papicon icon="trash-2" size={12} />
                            Fermer
                          </button>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>

              <!-- Mobile Cards -->
              <div class="md:hidden space-y-3">
                {#each activeTempChannels as chan}
                  <div class="rounded-xl border border-outline-variant/10 bg-surface-container/20 p-4 space-y-3">
                    <div class="flex items-center justify-between">
                      {#if editingChannel === chan.id}
                        <div class="flex items-center gap-2">
                          <input 
                            type="text" 
                            bind:value={newChannelName}
                            class="bg-surface-container-high/40 border border-outline-variant/20 rounded-md px-2.5 py-1 text-xs text-on-surface outline-none"
                          />
                          <button
                            type="button"
                            onclick={() => handleRenameChannel(chan.id)}
                            disabled={actionInProgress}
                            class="px-2 py-1 bg-primary text-white text-[10px] font-semibold rounded-md"
                          >
                            OK
                          </button>
                        </div>
                      {:else}
                        <span class="font-mono text-sm font-bold text-on-surface truncate">🔊 {chan.name}</span>
                        <button
                          type="button"
                          onclick={() => {
                            editingChannel = chan.id;
                            newChannelName = chan.name;
                          }}
                          class="text-on-surface-variant/40 hover:text-primary transition-colors"
                        >
                          <Papicon icon="edit" size={13} />
                        </button>
                      {/if}
                    </div>

                    <div class="flex items-center justify-between text-xs border-t border-b border-outline-variant/5 py-2">
                      <div class="flex items-center gap-1.5">
                        {#if chan.creatorAvatar}
                          <img src={chan.creatorAvatar} alt={chan.creatorName} class="w-5 h-5 rounded-full" />
                        {/if}
                        <span class="text-on-surface-variant">{chan.creatorName}</span>
                      </div>
                      <span class="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-primary/10 text-primary border border-primary/20">
                        👤 {chan.membersCount} connectés
                      </span>
                    </div>

                    <div class="space-y-1">
                      <span class="text-[10px] font-bold text-on-surface-variant/60 block">Réservation :</span>
                      <SearchableSelect 
                        options={availableRoles.map(r => ({ id: r.id, name: `@${r.name}` }))} 
                        value={chan.roleId || ''} 
                        on:change={(e) => handleReserveChannel(chan.id, e.detail.value || null)}
                        placeholder="— Public (Aucun rôle) —"
                      />
                    </div>

                    <div class="flex justify-end pt-1">
                      <button
                        type="button"
                        onclick={() => handleDeleteChannel(chan.id)}
                        disabled={actionInProgress}
                        class="px-2.5 py-1.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg text-[9px] font-semibold uppercase tracking-wider hover:bg-rose-500 hover:text-white transition-all inline-flex items-center gap-1"
                      >
                        <Papicon icon="trash-2" size={12} />
                        Fermer le salon
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </section>
        {/if}

      {:else if activeTab === 'honeypot'}
        <!-- HONEYPOT TRAP TAB -->
        <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-xl font-semibold flex items-center gap-3">
                <Papicon icon="shield" size={20} class="text-primary" />
                Salon Honeypot (Piège Anti-Spam)
              </h3>
              <p class="text-xs text-on-surface-variant/60 mt-1">Créez un salon d'appât (ex: `#don-not-send-here`). Toute personne écrivant à l'intérieur (non-staff) sera bannie instantanément pour éliminer les bots de spam et comptes piratés.</p>
            </div>
            
            <div class="flex items-center gap-2">
              <input 
                type="checkbox" 
                bind:checked={config.honeypotEnabled} 
                class="w-10 h-6 bg-surface-container-high rounded-full relative appearance-none cursor-pointer transition-all border border-outline-variant/20 checked:bg-primary before:content-[''] before:absolute before:h-4 before:w-4 before:rounded-full before:bg-white before:top-0.5 before:left-0.5 checked:before:translate-x-4 before:transition-all"
              />
            </div>
          </div>

          {#if config.honeypotEnabled}
            <div class="space-y-6 pt-4 border-t border-outline-variant/10 max-w-xl">
              <!-- Honeypot Channels Selection (multi) -->
              <div class="space-y-1.5">
                <label class="text-xs font-bold text-on-surface/80 block">⚠️ Salons Piège (Honeypot)</label>
                {#if config.honeypotChannelIds.length > 0}
                  <div class="space-y-2">
                    {#each config.honeypotChannelIds as channelId, i}
                      <div class="flex gap-2 items-center">
                        <div class="flex-1">
                          <SearchableSelect
                            id="honeypot-channel-select-{i}"
                            options={availableChannels.map(c => ({ id: c.id, name: `# ${c.name}` }))}
                            bind:value={config.honeypotChannelIds[i]}
                            placeholder="Sélectionner un salon..."
                          />
                        </div>
                        <button
                          type="button"
                          onclick={() => {
                            config.honeypotChannelIds = config.honeypotChannelIds.filter((_: string, idx: number) => idx !== i);
                          }}
                          class="px-3 py-2.5 bg-error/10 hover:bg-error/20 text-error border border-error/20 text-xs font-bold rounded-lg transition-all"
                        >
                          Retirer
                        </button>
                      </div>
                    {/each}
                  </div>
                {:else}
                  <p class="text-[10px] text-on-surface-variant/40">Aucun salon honeypot configuré. Ajoutez-en un ou créez-en un automatiquement.</p>
                {/if}
                <div class="flex gap-2 mt-2">
                  <button
                    type="button"
                    onclick={() => {
                      config.honeypotChannelIds = [...config.honeypotChannelIds, ''];
                    }}
                    class="px-4 py-2.5 bg-surface-container-high/40 hover:bg-surface-container-high/60 text-on-surface/80 border border-outline-variant/10 text-xs font-bold rounded-lg transition-all"
                  >
                    + Ajouter un salon existant
                  </button>
                  <button
                    type="button"
                    onclick={async () => {
                      const res = await updateChannelsManagementConfig({
                        honeypotEnabled: true,
                        honeypotChannelIds: config.honeypotChannelIds,
                        createHoneypotChannel: true,
                      } as any);
                      if (res?.resolved?.honeypotChannelIds) {
                        config.honeypotChannelIds = res.resolved.honeypotChannelIds;
                        savedConfig = JSON.parse(JSON.stringify(config));
                        toast.success('Salon honeypot créé avec succès !');
                      }
                    }}
                    disabled={saveAction.state.loading || loading}
                    class="px-4 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-bold rounded-lg transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Créer un salon automatiquement
                  </button>
                </div>
              </div>

              <!-- Honeypot Sanction Selection -->
              <div class="space-y-1.5">
                <label for="honeypot-sanction-select" class="text-xs font-bold text-on-surface/80 block">🛡️ Sanction à appliquer</label>
                <select
                  id="honeypot-sanction-select"
                  bind:value={config.honeypotSanction}
                  class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-2.5 text-xs outline-none focus:ring-1 focus:ring-primary/30"
                >
                  <option value="TIMEOUT">Exclusion Temporaire / Timeout (TO) — Par défaut</option>
                  <option value="BAN">Bannissement Définitif</option>
                  <option value="SOFTBAN">Softban (Ban + Déban immédiat, purge les messages)</option>
                  <option value="KICK">Exclusion Simple (Kick)</option>
                  <option value="WARN">Avertissement Simple (Warn)</option>
                </select>
                <p class="text-[10px] text-on-surface-variant/40 mt-1">Sélectionnez la sanction automatique à appliquer lorsqu'un membre écrit dans un salon piège.</p>
              </div>

              {#if config.honeypotSanction === 'KICK'}
                <!-- Honeypot Auto Reinvite toggle -->
                <div class="flex items-center justify-between p-5 bg-surface-container-high/20 border border-outline-variant/5 rounded-xl transition-all">
                  <div class="space-y-0.5">
                    <label for="honeypot-reinvite-toggle" class="text-xs font-bold text-on-surface/80 block">📨 Réinvitation automatique</label>
                    <p class="text-[10px] text-on-surface-variant/60">Envoyer automatiquement une invitation temporaire en DM à l'utilisateur exclu par le honeypot.</p>
                  </div>
                  <div class="flex items-center gap-2">
                    <input 
                      id="honeypot-reinvite-toggle"
                      type="checkbox" 
                      bind:checked={config.honeypotReinvite} 
                      class="w-10 h-6 bg-surface-container-high rounded-full relative appearance-none cursor-pointer transition-all border border-outline-variant/20 checked:bg-primary before:content-[''] before:absolute before:h-4 before:w-4 before:rounded-full before:bg-white before:top-0.5 before:left-0.5 checked:before:translate-x-4 before:transition-all"
                    />
                  </div>
                </div>
              {/if}

              <!-- Alert Warning Card -->
              <div class="p-5 bg-error/10 border border-error/20 text-error rounded-xl space-y-3">
                <h4 class="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                  <Papicon icon="alert-triangle" size={16} />
                  Avertissement de Sécurité
                </h4>
                <p class="text-xs leading-relaxed opacity-90">
                  Ce salon est configuré pour être visible par 100% des membres (y compris les nouveaux membres et les bots de spam) afin de servir de piège.
                  <br/><br/>
                  Toute personne (sauf bots et membres ayant les rôles de staff Kotbo configurés) qui enverra un message dans ce salon recevra la <strong>sanction automatique</strong> configurée ci-dessus, immédiatement et sans préavis.
                </p>
              </div>
            </div>
          {/if}
        </section>
      {/if}
    </div>
  {/if}
</ModulePage>

<style>
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
</style>
