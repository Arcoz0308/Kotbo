<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import { unsavedChanges } from '../lib/stores/unsavedChanges.svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import SearchableSelect from '../lib/components/SearchableSelect.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';
  import LoadingHint from '../lib/components/LoadingHint.svelte';
  import { fetchAutoModConfig, updateAutoModConfig } from '../lib/api';

  const actionState = createAsyncActionState();
  let loading = $state(false);

  const canManageSettings = $derived(
    !!dashboardStore.state.featureAccess?.automod?.canConfigure
      || !!dashboardStore.state.access?.canManageSettings
  );

  let isOwner = $state(false);

  const availableChannels = $derived(dashboardStore.state.discordChannels || []);
  const availableRoles = $derived(dashboardStore.state.discordRoles || []);

  let config = $state({
    discordAutoModEnabled: true,
    spamEnabled: false,
    spamLimit: 5,
    spamIntervalSeconds: 5,
    spamAction: 'TIMEOUT',
    
    linksEnabled: false,
    linksAction: 'DELETE_AND_WARN',
    linksWhitelist: [] as string[],
    
    capsEnabled: false,
    capsThresholdPercent: 80,
    capsMinLength: 10,
    
    emojisEnabled: false,
    emojisLimit: 10,
    
    mentionsEnabled: false,
    mentionsLimit: 5,

    ghostPingEnabled: false,
    ghostPingAction: 'ALERT',
    
    antiEveryoneEnabled: false,
    antiEveryoneAction: 'DELETE_AND_WARN',

    antiBotEnabled: false,
    antiBotAction: 'KICK',
    antiBotBypassUsers: [] as string[],

    bypassRoles: [] as string[],
    bypassChannels: [] as string[]
  });

  // Snapshot of last-saved state
  let savedConfig = $state(JSON.parse(JSON.stringify({
    discordAutoModEnabled: true,
    spamEnabled: false, spamLimit: 5, spamIntervalSeconds: 5, spamAction: 'TIMEOUT',
    linksEnabled: false, linksAction: 'DELETE_AND_WARN', linksWhitelist: [],
    capsEnabled: false, capsThresholdPercent: 80, capsMinLength: 10,
    emojisEnabled: false, emojisLimit: 10,
    mentionsEnabled: false, mentionsLimit: 5,
    ghostPingEnabled: false, ghostPingAction: 'ALERT',
    antiEveryoneEnabled: false, antiEveryoneAction: 'DELETE_AND_WARN',
    antiBotEnabled: false, antiBotAction: 'KICK', antiBotBypassUsers: [],
    bypassRoles: [], bypassChannels: []
  })));

  $effect(() => {
    const dirty = JSON.stringify(config) !== JSON.stringify(savedConfig);
    if (dirty && canManageSettings) {
      untrack(() => {
        unsavedChanges.register({
          label: 'AutoMod',
          onSave: () => handleSave(),
          onReset: () => {
            config = JSON.parse(JSON.stringify(savedConfig));
            whitelistInput = config.linksWhitelist.join('\n');
          }
        });
      });
    } else if (!dirty) {
      untrack(() => {
        if (unsavedChanges.isDirty && unsavedChanges.pageLabel === 'AutoMod') unsavedChanges.clear();
      });
    }
  });

  onDestroy(() => {
    if (unsavedChanges.pageLabel === 'AutoMod') unsavedChanges.clear();
  });

  // Helper local states for lists editing
  let whitelistInput = $state('');
  let selectedBypassRole = $state('');
  let selectedBypassChannel = $state('');
  let antiBotBypassInput = $state('');

  onMount(async () => {
    loading = true;
    try {
      await dashboardStore.refresh();
      const res = await fetchAutoModConfig();
      if (res && res.config) {
        config = res.config;
        savedConfig = JSON.parse(JSON.stringify(res.config));
        whitelistInput = config.linksWhitelist.join('\n');
        if (res.isOwner) isOwner = true;
      }
    } catch (err) {
      console.error(err);
    } finally {
      loading = false;
    }
  });

  async function handleSave(): Promise<boolean> {
    if (!canManageSettings) return false;
    
    // Parse domains list
    config.linksWhitelist = whitelistInput
      .split('\n')
      .map(d => d.trim().toLowerCase())
      .filter(d => d.length > 0);

    let success = false;
    let syncWarning: string | null = null;
    await actionState.run(async () => {
      const res = await updateAutoModConfig(config);
      if (!res || !res.config) throw new Error('Erreur de sauvegarde AutoMod');
      config = res.config;
      savedConfig = JSON.parse(JSON.stringify(res.config));
      syncWarning = res.syncWarning ?? null;
      success = true;
      if (syncWarning) {
        throw new Error(syncWarning);
      }
      return true;
    }, { successMessage: 'Verrous AutoMod mis à jour et synchronisés avec Discord !' });
    return success;
  }

  function addBypassRole() {
    if (!selectedBypassRole) return;
    if (!config.bypassRoles.includes(selectedBypassRole)) {
      config.bypassRoles = [...config.bypassRoles, selectedBypassRole];
    }
    selectedBypassRole = '';
  }

  function removeBypassRole(roleId: string) {
    config.bypassRoles = config.bypassRoles.filter(id => id !== roleId);
  }

  function addBypassChannel() {
    if (!selectedBypassChannel) return;
    if (!config.bypassChannels.includes(selectedBypassChannel)) {
      config.bypassChannels = [...config.bypassChannels, selectedBypassChannel];
    }
    selectedBypassChannel = '';
  }

  function removeBypassChannel(channelId: string) {
    config.bypassChannels = config.bypassChannels.filter(id => id !== channelId);
  }

  function getRoleName(roleId: string) {
    const role = availableRoles.find(r => r.id === roleId);
    return role ? `@${role.name}` : roleId;
  }

  function getChannelName(channelId: string) {
    const chan = availableChannels.find(c => c.id === channelId);
    return chan ? `#${chan.name}` : channelId;
  }

  function addAntiBotBypassUser() {
    const userId = antiBotBypassInput.trim();
    if (!userId || !/^\d{17,20}$/.test(userId)) return;
    if (!config.antiBotBypassUsers.includes(userId)) {
      config.antiBotBypassUsers = [...config.antiBotBypassUsers, userId];
    }
    antiBotBypassInput = '';
  }

  function removeAntiBotBypassUser(userId: string) {
    config.antiBotBypassUsers = config.antiBotBypassUsers.filter(id => id !== userId);
  }
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <header class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-container-low/40 p-5 rounded-xl border border-outline-variant/30">
    <div class="flex items-center gap-4">
      <div class="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
        <Papicon icon="ShieldAlert" size={20} />
      </div>
      <div>
        <h1 class="text-lg font-semibold tracking-tight leading-tight">AutoMod</h1>
        <p class="text-sm text-on-surface-variant/70 font-medium">Configurez les filtres de sécurité pour modérer automatiquement les comportements néfastes.</p>
      </div>
    </div>
  </header>

  <InlineFeedback state={actionState} />

  {#if loading}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <Skeleton height="400px" radius="2.5rem" />
      <Skeleton height="400px" radius="2.5rem" />
    </div>
    <div class="flex justify-center mt-4">
      <LoadingHint context="config" />
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Left Column: Filters -->
      <div class="space-y-8">

        <!-- Anti-Spam -->
        <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6">
          <div class="flex items-center justify-between border-b border-outline-variant/15 pb-4">
            <h3 class="text-lg font-semibold flex items-center gap-3">
              <Papicon icon="Clock" size={20} class="text-primary" />
              Filtre Anti-Spam
            </h3>
            <ToggleSwitch 
              checked={config.spamEnabled} 
              onToggle={(v: boolean) => config.spamEnabled = v} 
              disabled={!canManageSettings}
            />
          </div>

          {#if config.spamEnabled}
            <div class="grid grid-cols-2 gap-4 animate-in fade-in duration-300">
              <div class="space-y-1.5">
                <label for="spamLimit" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Nombre max de messages</label>
                <input 
                  id="spamLimit"
                  type="number" 
                  min="2"
                  max="20"
                  bind:value={config.spamLimit} 
                  class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:outline-none"
                  disabled={!canManageSettings}
                />
              </div>

              <div class="space-y-1.5">
                <label for="spamInterval" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Intervalle de temps (sec)</label>
                <input 
                  id="spamInterval"
                  type="number" 
                  min="1"
                  max="30"
                  bind:value={config.spamIntervalSeconds} 
                  class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:outline-none"
                  disabled={!canManageSettings}
                />
              </div>

              <div class="col-span-2 space-y-1.5">
                <label for="spamAction" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Sanction en cas d'infraction</label>
                <select 
                  id="spamAction"
                  bind:value={config.spamAction}
                  class="w-full bg-surface-container-high/45 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm text-on-surface focus:outline-none"
                  disabled={!canManageSettings}
                >
                  <option value="WARN">Avertissement (Warn)</option>
                  <option value="TIMEOUT">Exclusion temporaire (Mute 10 min)</option>
                </select>
              </div>
            </div>
          {/if}
        </section>

        <!-- Anti-Links & Discord invites -->
        <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6">
          <div class="flex items-center justify-between border-b border-outline-variant/15 pb-4">
            <h3 class="text-lg font-semibold flex items-center gap-3">
              <Papicon icon="Link" size={20} class="text-secondary" />
              Filtre Anti-Liens / Invitations
            </h3>
            <ToggleSwitch 
              checked={config.linksEnabled} 
              onToggle={(v: boolean) => config.linksEnabled = v} 
              disabled={!canManageSettings}
            />
          </div>

          {#if config.linksEnabled}
            <div class="space-y-4 animate-in fade-in duration-300">
              <div class="space-y-1.5">
                <label for="linksAction" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Sanction appliquée</label>
                <select 
                  id="linksAction"
                  bind:value={config.linksAction}
                  class="w-full bg-surface-container-high/45 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm text-on-surface focus:outline-none"
                  disabled={!canManageSettings}
                >
                  <option value="DELETE_AND_WARN">Supprimer & Avertir le membre</option>
                  <option value="DELETE_ONLY">Supprimer silencieusement</option>
                </select>
              </div>

              <div class="space-y-1.5">
                <label for="whitelist" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Domaines autorisés (un par ligne)</label>
                <textarea 
                  id="whitelist"
                  bind:value={whitelistInput} 
                  placeholder="github.com&#10;google.com"
                  class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:outline-none h-24 resize-none font-mono"
                  disabled={!canManageSettings}
                ></textarea>
              </div>
            </div>
          {/if}
        </section>

        <!-- Anti-Caps (MAJUSCULES) -->
        <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6">
          <div class="flex items-center justify-between border-b border-outline-variant/15 pb-4">
            <h3 class="text-lg font-semibold flex items-center gap-3">
              <Papicon icon="Font" size={20} class="text-tertiary" />
              Filtre Majuscules Excessives
            </h3>
            <ToggleSwitch 
              checked={config.capsEnabled} 
              onToggle={(v: boolean) => config.capsEnabled = v} 
              disabled={!canManageSettings}
            />
          </div>

          {#if config.capsEnabled}
            <div class="grid grid-cols-2 gap-4 animate-in fade-in duration-300">
              <div class="space-y-1.5">
                <label for="capsThresh" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Seuil de MAJ (%)</label>
                <input 
                  id="capsThresh"
                  type="number" 
                  min="20"
                  max="100"
                  bind:value={config.capsThresholdPercent} 
                  class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:outline-none"
                  disabled={!canManageSettings}
                />
              </div>

              <div class="space-y-1.5">
                <label for="capsMin" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Longueur minimale</label>
                <input 
                  id="capsMin"
                  type="number" 
                  min="4"
                  bind:value={config.capsMinLength} 
                  class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:outline-none"
                  disabled={!canManageSettings}
                />
              </div>
            </div>
          {/if}
        </section>
      </div>

      <!-- Right Column: Other filters & Bypasses -->
      <div class="space-y-8">
        <!-- Emojis Flood -->
        <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6">
          <div class="flex items-center justify-between border-b border-outline-variant/15 pb-4">
            <h3 class="text-lg font-semibold flex items-center gap-3">
              <Papicon icon="Emoji" size={20} class="text-amber-400" />
              Filtre Spam Émojis
            </h3>
            <ToggleSwitch 
              checked={config.emojisEnabled} 
              onToggle={(v: boolean) => config.emojisEnabled = v} 
              disabled={!canManageSettings}
            />
          </div>

          {#if config.emojisEnabled}
            <div class="space-y-1.5 animate-in fade-in duration-300">
              <label for="emojisLim" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Limite d'émojis par message</label>
              <input 
                id="emojisLim"
                type="number" 
                min="1"
                bind:value={config.emojisLimit} 
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:outline-none"
                disabled={!canManageSettings}
              />
            </div>
          {/if}
        </section>

        <!-- Mentions Flood -->
        <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6">
          <div class="flex items-center justify-between border-b border-outline-variant/15 pb-4">
            <h3 class="text-lg font-semibold flex items-center gap-3">
              <Papicon icon="User" size={20} class="text-purple-400" />
              Filtre Spam Mentions (@)
            </h3>
            <ToggleSwitch 
              checked={config.mentionsEnabled} 
              onToggle={(v: boolean) => config.mentionsEnabled = v} 
              disabled={!canManageSettings}
            />
          </div>

          {#if config.mentionsEnabled}
            <div class="space-y-1.5 animate-in fade-in duration-300">
              <label for="mentionsLim" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Limite de mentions par message</label>
              <input 
                id="mentionsLim"
                type="number" 
                min="1"
                bind:value={config.mentionsLimit} 
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:outline-none"
                disabled={!canManageSettings}
              />
            </div>
          {/if}
        </section>

        <!-- Anti-Ghost Ping -->
        <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6">
          <div class="flex items-center justify-between border-b border-outline-variant/15 pb-4">
            <h3 class="text-lg font-semibold flex items-center gap-3">
              <Papicon icon="Ghost" size={20} class="text-rose-400" />
              Filtre Anti-Ghost Ping
            </h3>
            <ToggleSwitch 
              checked={config.ghostPingEnabled} 
              onToggle={(v: boolean) => config.ghostPingEnabled = v} 
              disabled={!canManageSettings}
            />
          </div>

          <p class="text-xs text-on-surface-variant/70 leading-relaxed">
            Détecte et signale les mentions supprimées ou modifiées rapidement pour masquer un ping.
            <br />
            <span class="text-amber-500/90 font-medium">⚠️ Seuls les messages en cache du bot peuvent être analysés (limite de l'API Discord).</span>
          </p>

          {#if config.ghostPingEnabled}
            <div class="space-y-4 animate-in fade-in duration-300">
              <div class="space-y-1.5">
                <label for="ghostPingAction" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Sanction en cas d'infraction</label>
                <select 
                  id="ghostPingAction"
                  bind:value={config.ghostPingAction}
                  class="w-full bg-surface-container-high/45 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm text-on-surface focus:outline-none"
                  disabled={!canManageSettings}
                >
                  <option value="ALERT">Simple Alerte (Message)</option>
                  <option value="WARN">Avertissement (Warn + Alerte)</option>
                </select>
              </div>
            </div>
          {/if}
        </section>

        <!-- Anti-Everyone/Here Troll -->
        <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6">
          <div class="flex items-center justify-between border-b border-outline-variant/15 pb-4">
            <h3 class="text-lg font-semibold flex items-center gap-3">
              <Papicon icon="ShieldAlert" size={20} class="text-red-400" />
              Filtre Anti-Mention Everyone & Here
            </h3>
            <ToggleSwitch 
              checked={config.antiEveryoneEnabled} 
              onToggle={(v: boolean) => config.antiEveryoneEnabled = v} 
              disabled={!canManageSettings}
            />
          </div>

          <p class="text-xs text-on-surface-variant/70 leading-relaxed">
            Supprime les messages contenant des tentatives de mention de @everyone ou @here pour les membres n'ayant pas la permission.
          </p>

          {#if config.antiEveryoneEnabled}
            <div class="space-y-4 animate-in fade-in duration-300">
              <div class="space-y-1.5">
                <label for="antiEveryoneAction" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Sanction en cas d'infraction</label>
                <select 
                  id="antiEveryoneAction"
                  bind:value={config.antiEveryoneAction}
                  class="w-full bg-surface-container-high/45 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm text-on-surface focus:outline-none"
                  disabled={!canManageSettings}
                >
                  <option value="DELETE_ONLY">Suppression simple</option>
                  <option value="DELETE_AND_WARN">Supprimer & Avertir le membre</option>
                  <option value="TIMEOUT">Exclusion temporaire (Mute 10 min)</option>
                </select>
              </div>
            </div>
          {/if}
        </section>

        <!-- Anti-Bot (Mode Sécurisé) -->
        <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6">
          <div class="flex items-center justify-between border-b border-outline-variant/15 pb-4">
            <h3 class="text-lg font-semibold flex items-center gap-3">
              <Papicon icon="ShieldCheck" size={20} class="text-cyan-400" />
              Mode Sécurisé (Anti-Bot)
            </h3>
            <ToggleSwitch
              checked={config.antiBotEnabled}
              onToggle={(v: boolean) => config.antiBotEnabled = v}
              disabled={!isOwner}
            />
          </div>

          {#if !isOwner}
            <div class="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p class="text-xs text-red-400/90 font-medium">
                Seul le propriétaire du serveur peut activer, désactiver ou configurer le mode sécurisé anti-bot.
              </p>
            </div>
          {/if}

          <p class="text-xs text-on-surface-variant/70 leading-relaxed">
            Empêche tout membre autre que le propriétaire du serveur d'ajouter des bots.
            Les bots ajoutés par un non-propriétaire seront automatiquement expulsés ou bannis.
          </p>

          {#if config.antiBotEnabled}
            <div class="space-y-5 animate-in fade-in duration-300">
              <div class="space-y-1.5">
                <label for="antiBotAction" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Action sur le bot non autorisé</label>
                <select
                  id="antiBotAction"
                  bind:value={config.antiBotAction}
                  class="w-full bg-surface-container-high/45 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm text-on-surface focus:outline-none"
                  disabled={!isOwner}
                >
                  <option value="KICK">Expulser le bot</option>
                  <option value="BAN">Bannir le bot</option>
                </select>
              </div>

              <!-- Bypass users -->
              <div class="space-y-3 pt-2 border-t border-outline-variant/10">
                <span class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Utilisateurs autorisés à ajouter des bots</span>
                <p class="text-xs text-on-surface-variant/50 ml-2">Ces utilisateurs peuvent ajouter des bots mais ne peuvent pas modifier cette configuration.</p>
                {#if isOwner}
                  <div class="flex gap-2">
                    <input
                      type="text"
                      bind:value={antiBotBypassInput}
                      placeholder="ID Discord de l'utilisateur"
                      class="flex-1 bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-2.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                      onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); addAntiBotBypassUser(); } }}
                    />
                    <button
                      type="button"
                      onclick={addAntiBotBypassUser}
                      disabled={!antiBotBypassInput.trim() || !/^\d{17,20}$/.test(antiBotBypassInput.trim())}
                      class="px-4 py-2.5 bg-outline-variant/20 hover:bg-outline-variant/35 text-xs font-bold rounded-xl transition-all disabled:opacity-50"
                    >
                      Ajouter
                    </button>
                  </div>
                {/if}

                <div class="flex flex-wrap gap-2">
                  {#each config.antiBotBypassUsers as userId}
                    <div class="flex items-center gap-1.5 px-3 py-1 bg-surface-container-high/40 border border-outline-variant/10 rounded-xl text-xs font-bold font-mono">
                      <span>{userId}</span>
                      {#if isOwner}
                        <button type="button" onclick={() => removeAntiBotBypassUser(userId)} class="text-error hover:text-error/80 transition-colors ml-1 text-sm font-bold leading-none">&times;</button>
                      {/if}
                    </div>
                  {:else}
                    <span class="text-xs text-on-surface-variant/40 italic ml-2">Aucun utilisateur autorisé (seul le propriétaire peut ajouter des bots).</span>
                  {/each}
                </div>
              </div>

              <div class="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <p class="text-xs text-amber-400/90 font-medium">
                  Le bot Kotbo ne sera jamais affecté par cette protection. La personne ayant ajouté le bot recevra un message privé pour l'informer du blocage.
                </p>
              </div>
            </div>
          {/if}
        </section>

        <!-- Exempte rules (Bypass) -->
        <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6">
          <h3 class="text-xl font-semibold flex items-center gap-3 border-b border-outline-variant/15 pb-4">
            <Papicon icon="Unlock" size={20} class="text-emerald-400" />
            Exceptions / Salons et Rôles Ignorés
          </h3>

          <div class="space-y-5">
            <!-- Ignored roles -->
            <div class="space-y-3">
              <span class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Rôles exemptés</span>
              {#if canManageSettings}
                <div class="flex gap-2">
                  <div class="flex-1">
                    <SearchableSelect 
                      id="bypassRoleSelect"
                      bind:value={selectedBypassRole} 
                      options={availableRoles.map(r => ({ id: r.id, name: `@${r.name}` }))} 
                      placeholder="Ajouter un rôle" 
                      className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-primary/20 transition-all"
                    />
                  </div>
                  <button 
                    type="button"
                    onclick={addBypassRole}
                    disabled={!selectedBypassRole}
                    class="px-4 py-2.5 bg-outline-variant/20 hover:bg-outline-variant/35 text-xs font-bold rounded-xl transition-all disabled:opacity-50"
                  >
                    Ajouter
                  </button>
                </div>
              {/if}

              <div class="flex flex-wrap gap-2">
                {#each config.bypassRoles as roleId}
                  <div class="flex items-center gap-1.5 px-3 py-1 bg-surface-container-high/40 border border-outline-variant/10 rounded-xl text-xs font-bold">
                    <span>{getRoleName(roleId)}</span>
                    {#if canManageSettings}
                      <button type="button" onclick={() => removeBypassRole(roleId)} class="text-error hover:text-error/80 transition-colors ml-1 text-sm font-bold leading-none">×</button>
                    {/if}
                  </div>
                {:else}
                  <span class="text-xs text-on-surface-variant/40 italic ml-2">Aucun rôle exempté.</span>
                {/each}
              </div>
            </div>

            <!-- Ignored channels -->
            <div class="space-y-3 pt-2 border-t border-outline-variant/10">
              <span class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Salons exemptés</span>
              {#if canManageSettings}
                <div class="flex gap-2">
                  <div class="flex-1">
                    <SearchableSelect 
                      id="bypassChanSelect"
                      bind:value={selectedBypassChannel} 
                      options={availableChannels.map(c => ({ id: c.id, name: `#${c.name}` }))} 
                      placeholder="Ajouter un salon" 
                      className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-primary/20 transition-all"
                    />
                  </div>
                  <button 
                    type="button"
                    onclick={addBypassChannel}
                    disabled={!selectedBypassChannel}
                    class="px-4 py-2.5 bg-outline-variant/20 hover:bg-outline-variant/35 text-xs font-bold rounded-xl transition-all disabled:opacity-50"
                  >
                    Ajouter
                  </button>
                </div>
              {/if}

              <div class="flex flex-wrap gap-2">
                {#each config.bypassChannels as channelId}
                  <div class="flex items-center gap-1.5 px-3 py-1 bg-surface-container-high/40 border border-outline-variant/10 rounded-xl text-xs font-bold">
                    <span>{getChannelName(channelId)}</span>
                    {#if canManageSettings}
                      <button type="button" onclick={() => removeBypassChannel(channelId)} class="text-error hover:text-error/80 transition-colors ml-1 text-sm font-bold leading-none">×</button>
                    {/if}
                  </div>
                {:else}
                  <span class="text-xs text-on-surface-variant/40 italic ml-2">Aucun salon exempté.</span>
                {/each}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  {/if}
</div>
