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
  import { fetchWelcomeConfig, updateWelcomeConfig } from '../lib/api';

  const actionState = createAsyncActionState();
  let loading = $state(false);

  const welcomePresets = [
    { label: 'Accueil classique',   icon: 'DoorOpen', text: 'Bienvenue {user} sur **{server}** ! 🎉 Tu es notre **{memberCount}**ème membre !' },
    { label: 'Accueil festif',      icon: 'Sparkles', text: '🎊 Hourra ! {user} vient de rejoindre **{server}** ! Bienvenue parmi nous, tu es le membre **#{memberCount}** !' },
    { label: 'Accueil immersif',    icon: 'Shield',   text: '⚔️ Un nouveau guerrier débarque ! Bienvenue {user} sur **{server}** ! Prépare-toi à rejoindre l\'aventure !' },
    { label: 'Accueil chaleureux',  icon: 'Users',    text: 'Hey {user} ! 👋 Toute l\'équipe de **{server}** est ravie de t\'accueillir. N\'hésite pas à te présenter !' },
    { label: 'Accueil gaming',      icon: 'Gamepad2', text: 'GG {user} ! Tu viens de rejoindre **{server}** 🎮 – le serveur ultime. Amuse-toi bien et bonne chance !' },
  ];

  const leavePresets = [
    { label: 'Départ simple',       icon: 'Logout',   text: '{username} vient de quitter **{server}**. 👋 On espère te revoir bientôt !' },
    { label: 'Départ triste',       icon: 'Frown',    text: 'Oh non... {username} a quitté le navire. 😢 Nous sommes maintenant **{memberCount}** membres.' },
    { label: 'Départ neutre',       icon: 'Smile',    text: '{username} a quitté **{server}**. Il nous reste **{memberCount}** membres.' },
    { label: 'Départ poétique',     icon: 'Cloud',    text: 'Et comme une vague, {username} s\'en est allé... ✨ On ne l\'oubliera pas.' },
    { label: 'Départ dramatique',   icon: 'Play',     text: '🎬 Rideau. {username} a quitté **{server}** pour de nouvelles aventures. Bon courage !' },
  ];

  const boostPresets = [
    { label: 'Boost standard',      icon: 'Zap',      text: 'Merci {user} pour ton boost ! 🚀 Grâce à toi, **{server}** compte maintenant **{boostCount}** boosts !' },
    { label: 'Boost premium',       icon: 'Gem',      text: '💎 WOW ! {user} vient de booster **{server}** ! Tu es incroyable, merci énormément ! 🙏' },
    { label: 'Boost épique',        icon: 'Zap',      text: '⚡ BOOST ACTIVÉ ! {user} propulse **{server}** vers de nouveaux sommets ! On est à **{boostCount}** boosts !' },
    { label: 'Boost festif',        icon: 'Sparkles', text: '🎉 {user} a boosté le serveur ! Merci pour ton soutien, tu es une star ! ✨ ({boostCount} boosts au total)' },
    { label: 'Boost héroïque',      icon: 'Trophy',   text: '🏆 Héros du jour : {user} ! Son boost porte **{server}** à **{boostCount}** boosts. Respect total !' },
  ];

  let showWelcomePresets = $state(false);
  let showLeavePresets   = $state(false);
  let showBoostPresets   = $state(false);
  let activeTab = $state<'welcome' | 'leave' | 'boost' | 'autoroles'>('welcome');

  const canManageSettings = $derived(
    !!dashboardStore.state.featureAccess?.welcome_goodbye?.canConfigure
      || !!dashboardStore.state.access?.canManageSettings
  );

  const availableChannels = $derived(dashboardStore.state.discordChannels || []);
  const availableRoles = $derived(dashboardStore.state.discordRoles || []);

  let config = $state({
    welcomeEnabled: false,
    welcomeChannelId: null as string | null,
    welcomeMessage: 'Bienvenue {user} sur notre serveur ! 🎉',
    welcomeImageEnabled: false,
    welcomeImageUrl: null as string | null,
    leaveEnabled: false,
    leaveChannelId: null as string | null,
    leaveMessage: 'Au revoir {user}... 😢',
    boostEnabled: false,
    boostChannelId: null as string | null,
    boostMessage: 'Merci pour ton boost {user} ! 🚀',
    boostImageEnabled: false,
    boostImageUrl: null as string | null,
    joinRoleId: null as string | null,
    tagAutoRoleEnabled: false,
    tagAutoRoleWord: '',
    tagAutoRoleId: null as string | null,
  });

  // Snapshot of last-saved state
  let savedConfig = $state({
    welcomeEnabled: false,
    welcomeChannelId: null as string | null,
    welcomeMessage: 'Bienvenue {user} sur notre serveur ! 🎉',
    welcomeImageEnabled: false,
    welcomeImageUrl: null as string | null,
    leaveEnabled: false,
    leaveChannelId: null as string | null,
    leaveMessage: 'Au revoir {user}... 😢',
    boostEnabled: false,
    boostChannelId: null as string | null,
    boostMessage: 'Merci pour ton boost {user} ! 🚀',
    boostImageEnabled: false,
    boostImageUrl: null as string | null,
    joinRoleId: null as string | null,
    tagAutoRoleEnabled: false,
    tagAutoRoleWord: '',
    tagAutoRoleId: null as string | null,
  });

  $effect(() => {
    const dirty = JSON.stringify(config) !== JSON.stringify(savedConfig);
    if (dirty && canManageSettings) {
      untrack(() => {
        unsavedChanges.register({
          label: 'Annonces & Auto-Rôle',
          onSave: () => handleSave(),
          onReset: () => { config = { ...savedConfig }; }
        });
      });
    } else if (!dirty) {
      untrack(() => {
        if (unsavedChanges.isDirty && unsavedChanges.pageLabel === 'Annonces & Auto-Rôle') {
          unsavedChanges.clear();
        }
      });
    }
  });

  onDestroy(() => {
    if (unsavedChanges.pageLabel === 'Annonces & Auto-Rôle') unsavedChanges.clear();
  });

  onMount(async () => {
    loading = true;
    try {
      await dashboardStore.refresh();
      const res = await fetchWelcomeConfig();
      if (res && res.config) {
        config = {
          welcomeEnabled: res.config.welcomeEnabled ?? false,
          welcomeChannelId: res.config.welcomeChannelId ?? null,
          welcomeMessage: res.config.welcomeMessage ?? '',
          welcomeImageEnabled: res.config.welcomeImageEnabled ?? false,
          welcomeImageUrl: res.config.welcomeImageUrl ?? null,
          leaveEnabled: res.config.leaveEnabled ?? false,
          leaveChannelId: res.config.leaveChannelId ?? null,
          leaveMessage: res.config.leaveMessage ?? '',
          boostEnabled: res.config.boostEnabled ?? false,
          boostChannelId: res.config.boostChannelId ?? null,
          boostMessage: res.config.boostMessage ?? '',
          boostImageEnabled: res.config.boostImageEnabled ?? false,
          boostImageUrl: res.config.boostImageUrl ?? null,
          joinRoleId: res.config.joinRoleId ?? null,
          tagAutoRoleEnabled: res.config.tagAutoRoleEnabled ?? false,
          tagAutoRoleWord: res.config.tagAutoRoleWord ?? '',
          tagAutoRoleId: res.config.tagAutoRoleId ?? null,
        };
        savedConfig = { ...config };
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
      const res = await updateWelcomeConfig(config);
      if (!res) throw new Error('Erreur de sauvegarde');
      const saved = {
        welcomeEnabled: res.config.welcomeEnabled ?? false,
        welcomeChannelId: res.config.welcomeChannelId ?? null,
        welcomeMessage: res.config.welcomeMessage ?? '',
        welcomeImageEnabled: res.config.welcomeImageEnabled ?? false,
        welcomeImageUrl: res.config.welcomeImageUrl ?? null,
        leaveEnabled: res.config.leaveEnabled ?? false,
        leaveChannelId: res.config.leaveChannelId ?? null,
        leaveMessage: res.config.leaveMessage ?? '',
        boostEnabled: res.config.boostEnabled ?? false,
        boostChannelId: res.config.boostChannelId ?? null,
        boostMessage: res.config.boostMessage ?? '',
        boostImageEnabled: res.config.boostImageEnabled ?? false,
        boostImageUrl: res.config.boostImageUrl ?? null,
        joinRoleId: res.config.joinRoleId ?? null,
        tagAutoRoleEnabled: res.config.tagAutoRoleEnabled ?? false,
        tagAutoRoleWord: res.config.tagAutoRoleWord ?? '',
        tagAutoRoleId: res.config.tagAutoRoleId ?? null,
      };
      config = saved;
      savedConfig = { ...saved };
      success = true;
      return true;
    }, { successMessage: 'Configuration enregistrée avec succès !' });
    return success;
  }

  // Preview helper
  function previewText(template: string) {
    return template
      .replace(/{user}/g, '@JeanDupont')
      .replace(/{username}/g, 'JeanDupont')
      .replace(/{server}/g, 'Kotbo Server')
      .replace(/{memberCount}/g, '1,234')
      .replace(/{boostCount}/g, '18');
  }
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <header class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-container-low/40 p-5 rounded-xl border border-outline-variant/30">
    <div class="flex items-center gap-4">
      <div class="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
        <Papicon icon="Megaphone" size={20} />
      </div>
      <div>
        <h1 class="text-lg font-semibold tracking-tight leading-tight">Annonces & Auto-Rôle</h1>
        <p class="text-sm text-on-surface-variant/70 font-medium">Gérez les messages de bienvenue, départ, boosts Discord et les attributions automatiques de rôles.</p>
      </div>
    </div>
  </header>

  <InlineFeedback state={actionState} />

  {#if loading}
    <div class="space-y-6">
      <Skeleton height="60px" radius="1.5rem" />
      <Skeleton height="450px" radius="2.5rem" />
    </div>
  {:else}
    <!-- Tabs Header -->
    <div class="flex flex-wrap border-b border-outline-variant/15 gap-2 pb-2">
      <button 
        onclick={() => activeTab = 'welcome'}
        class="px-6 py-3 text-xs font-semibold uppercase tracking-wider transition-all duration-300 flex items-center gap-2 rounded-xl {activeTab === 'welcome' ? 'bg-primary/10 text-primary ' : 'text-on-surface-variant/70 hover:text-on-surface'}"
      >
        <Papicon icon="DoorOpen" size={14} />
        Accueil
      </button>
      <button 
        onclick={() => activeTab = 'leave'}
        class="px-6 py-3 text-xs font-semibold uppercase tracking-wider transition-all duration-300 flex items-center gap-2 rounded-xl {activeTab === 'leave' ? 'bg-primary/10 text-primary ' : 'text-on-surface-variant/70 hover:text-on-surface'}"
      >
        <Papicon icon="Logout" size={14} />
        Départ
      </button>
      <button 
        onclick={() => activeTab = 'boost'}
        class="px-6 py-3 text-xs font-semibold uppercase tracking-wider transition-all duration-300 flex items-center gap-2 rounded-xl {activeTab === 'boost' ? 'bg-primary/10 text-primary ' : 'text-on-surface-variant/70 hover:text-on-surface'}"
      >
        <Papicon icon="Zap" size={14} />
        Boosts
      </button>
      <button 
        onclick={() => activeTab = 'autoroles'}
        class="px-6 py-3 text-xs font-semibold uppercase tracking-wider transition-all duration-300 flex items-center gap-2 rounded-xl {activeTab === 'autoroles' ? 'bg-primary/10 text-primary ' : 'text-on-surface-variant/70 hover:text-on-surface'}"
      >
        <Papicon icon="Shield" size={14} />
        Auto-Rôles
      </button>
    </div>

    <!-- Guides Box (Contextual) -->
    <section class="bg-surface-container-low/30 border border-outline-variant/10 p-6 rounded-xl space-y-2">
      <h4 class="text-sm font-bold text-on-surface flex items-center gap-2">
        <Papicon icon="Info" size={16} class="text-primary" />
        {#if activeTab === 'autoroles'}
          Règles de configuration des Auto-Rôles
        {:else}
          Guide des variables éligibles
        {/if}
      </h4>
      {#if activeTab === 'autoroles'}
        <p class="text-xs text-on-surface-variant/80 font-medium">
          L'attribution automatique donne des rôles configurés aux membres. L'auto-rôle à l'arrivée s'applique immédiatement à l'entrée. L'auto-rôle tag s'applique et se retire automatiquement lorsque le membre met à jour son pseudo ou pseudo global avec le tag recherché.
        </p>
      {:else}
        <p class="text-xs text-on-surface-variant/80 font-medium">
          Vous pouvez insérer les balises suivantes dans vos templates de messages pour les personnaliser dynamiquement :
        </p>
        <div class="flex flex-wrap gap-3 pt-2">
          <span class="text-[11px] font-mono bg-surface-container-high px-2.5 py-1.5 rounded-xl border border-outline-variant/10 font-bold"><code class="text-primary dark:text-blue-300">{`{user}`}</code> : Mentionne le membre</span>
          <span class="text-[11px] font-mono bg-surface-container-high px-2.5 py-1.5 rounded-xl border border-outline-variant/10 font-bold"><code class="text-primary dark:text-blue-300">{`{username}`}</code> : Nom du membre</span>
          <span class="text-[11px] font-mono bg-surface-container-high px-2.5 py-1.5 rounded-xl border border-outline-variant/10 font-bold"><code class="text-primary dark:text-blue-300">{`{server}`}</code> : Nom du serveur</span>
          <span class="text-[11px] font-mono bg-surface-container-high px-2.5 py-1.5 rounded-xl border border-outline-variant/10 font-bold"><code class="text-primary dark:text-blue-300">{`{memberCount}`}</code> : Nombre total de membres</span>
          {#if activeTab === 'boost'}
            <span class="text-[11px] font-mono bg-surface-container-high px-2.5 py-1.5 rounded-xl border border-outline-variant/10 font-bold"><code class="text-primary dark:text-blue-300">{`{boostCount}`}</code> : Nombre de boosts actuel</span>
          {/if}
        </div>
      {/if}
    </section>

    <!-- Tab Contents -->
    <div class="space-y-6">
      
      <!-- Welcome Tab -->
      {#if activeTab === 'welcome'}
        <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6 max-w-4xl">
          <div class="flex items-center justify-between border-b border-outline-variant/15 pb-4">
            <h3 class="text-xl font-semibold flex items-center gap-3">
              <Papicon icon="DoorOpen" size={20} class="text-primary" />
              Message de Bienvenue
            </h3>
            <ToggleSwitch 
              checked={config.welcomeEnabled} 
              onToggle={(v: boolean) => config.welcomeEnabled = v} 
              disabled={!canManageSettings}
            />
          </div>

          {#if config.welcomeEnabled}
            <div class="space-y-4 animate-in fade-in duration-300">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-1.5">
                  <label for="wChannel" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Salon de diffusion</label>
                  <SearchableSelect 
                    id="wChannel"
                    bind:value={config.welcomeChannelId} 
                    options={availableChannels.map(c => ({ id: c.id, name: `#${c.name}` }))} 
                    placeholder="Sélectionner le salon" 
                    className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all"
                    disabled={!canManageSettings}
                  />
                </div>
              </div>

              <div class="space-y-1.5">
                <div class="flex items-center justify-between ml-2 mb-1">
                  <label for="wMsg" class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">Contenu du message</label>
                  <button
                    onclick={() => showWelcomePresets = !showWelcomePresets}
                    class="text-[10px] font-bold text-primary/70 hover:text-primary flex items-center gap-1.5 transition-colors"
                    disabled={!canManageSettings}
                  >
                    <Papicon icon="Sparkles" size={12} />
                    <span>Presets</span>
                    <span class="transition-transform duration-200 {showWelcomePresets ? 'rotate-180' : ''}">▾</span>
                  </button>
                </div>
                {#if showWelcomePresets}
                  <div class="flex flex-wrap gap-2 pb-2 animate-in fade-in duration-200">
                    {#each welcomePresets as preset}
                      <button
                        onclick={() => { config.welcomeMessage = preset.text; showWelcomePresets = false; }}
                        class="text-[10px] font-bold px-3 py-1.5 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/15 text-primary transition-all hover: flex items-center gap-1.5"
                        disabled={!canManageSettings}
                      >
                        <Papicon icon={preset.icon} size={12} />
                        {preset.label}
                      </button>
                    {/each}
                  </div>
                {/if}
                <textarea 
                  id="wMsg"
                  bind:value={config.welcomeMessage} 
                  class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none h-28 resize-none"
                  placeholder="Écrivez le message de bienvenue..."
                  disabled={!canManageSettings}
                ></textarea>
              </div>

              <div class="p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 space-y-3">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm font-bold">Activer l'image de bienvenue</p>
                    <p class="text-[10px] text-on-surface-variant/50">Génère un bandeau d'avatar stylisé</p>
                  </div>
                  <ToggleSwitch 
                    checked={config.welcomeImageEnabled} 
                    onToggle={(v: boolean) => config.welcomeImageEnabled = v} 
                    disabled={!canManageSettings}
                  />
                </div>

                {#if config.welcomeImageEnabled}
                  <div class="space-y-1.5 pt-2 animate-in fade-in duration-300">
                    <label for="wImgUrl" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">URL de fond d'image personnalisée (Optionnel)</label>
                    <input 
                      id="wImgUrl"
                      type="url" 
                      bind:value={config.welcomeImageUrl} 
                      placeholder="https://example.com/background.png"
                      class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
                      disabled={!canManageSettings}
                    />
                  </div>
                {/if}
              </div>

              <div class="space-y-1.5">
                <span class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Aperçu du rendu Discord</span>
                <div class="p-5 rounded-lg bg-surface-container-high/35 border border-outline-variant/15 text-sm text-on-surface font-semibold font-sans whitespace-pre-wrap select-none relative overflow-hidden">
                  <div class="flex items-start gap-4">
                    <div class="w-10 h-10 rounded-full bg-outline-variant/30 flex items-center justify-center text-xs font-semibold text-on-surface-variant/60">BOT</div>
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="font-bold text-primary">Kotbo</span>
                        <span class="bg-primary/20 text-primary text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase leading-none">BOT</span>
                        <span class="text-[11px] text-on-surface-variant/40">Aujourd'hui à 12:00</span>
                      </div>
                      <div class="mt-1 text-on-surface-variant/90 leading-relaxed text-sm font-medium font-sans">
                        {previewText(config.welcomeMessage)}
                      </div>
                      {#if config.welcomeImageEnabled}
                        <div class="mt-3 w-full max-w-sm aspect-5/2 rounded-xl bg-[#0b0e14] flex items-center justify-center border border-[#5865f2]/30 relative overflow-hidden">
                          {#if config.welcomeImageUrl}
                            <img src={config.welcomeImageUrl} alt="Background" class="absolute inset-0 w-full h-full object-cover opacity-50" />
                          {/if}
                          <div class="relative flex flex-col items-center gap-1.5 z-10 p-4 text-center">
                            <div class="w-12 h-12 rounded-full border border-primary/20 bg-surface-container/85 flex items-center justify-center text-sm font-semibold text-primary">JD</div>
                            <span class="text-xs font-semibold text-white leading-none drop-shadow-sm">BIENVENUE !</span>
                            <span class="text-[10px] font-bold text-[#57f287] leading-none font-sans">JEANDUPONT</span>
                            <span class="text-[11px] text-[#b8bcc8] font-medium uppercase tracking-wider">Membre #1,234 sur KOTBO SERVER</span>
                          </div>
                        </div>
                      {/if}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          {:else}
            <p class="text-xs text-on-surface-variant/50 italic text-center py-6">Les messages d'accueil sont désactivés.</p>
          {/if}
        </section>
      {/if}

      <!-- Leave Tab -->
      {#if activeTab === 'leave'}
        <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6 max-w-4xl">
          <div class="flex items-center justify-between border-b border-outline-variant/15 pb-4">
            <h3 class="text-xl font-semibold flex items-center gap-3">
              <Papicon icon="Logout" size={20} class="text-secondary" />
              Message de Départ
            </h3>
            <ToggleSwitch 
              checked={config.leaveEnabled} 
              onToggle={(v: boolean) => config.leaveEnabled = v} 
              disabled={!canManageSettings}
            />
          </div>

          {#if config.leaveEnabled}
            <div class="space-y-4 animate-in fade-in duration-300">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-1.5">
                  <label for="lChannel" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Salon de diffusion</label>
                  <SearchableSelect 
                    id="lChannel"
                    bind:value={config.leaveChannelId} 
                    options={availableChannels.map(c => ({ id: c.id, name: `#${c.name}` }))} 
                    placeholder="Sélectionner le salon" 
                    className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all"
                    disabled={!canManageSettings}
                  />
                </div>
              </div>

              <div class="space-y-1.5">
                <div class="flex items-center justify-between ml-2 mb-1">
                  <label for="lMsg" class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">Contenu du message</label>
                  <button
                    onclick={() => showLeavePresets = !showLeavePresets}
                    class="text-[10px] font-bold text-primary/70 hover:text-primary flex items-center gap-1.5 transition-colors"
                    disabled={!canManageSettings}
                  >
                    <Papicon icon="Sparkles" size={12} />
                    <span>Presets</span>
                    <span class="transition-transform duration-200 {showLeavePresets ? 'rotate-180' : ''}">▾</span>
                  </button>
                </div>
                {#if showLeavePresets}
                  <div class="flex flex-wrap gap-2 pb-2 animate-in fade-in duration-200">
                    {#each leavePresets as preset}
                      <button
                        onclick={() => { config.leaveMessage = preset.text; showLeavePresets = false; }}
                        class="text-[10px] font-bold px-3 py-1.5 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/15 text-primary transition-all hover: flex items-center gap-1.5"
                        disabled={!canManageSettings}
                      >
                        <Papicon icon={preset.icon} size={12} />
                        {preset.label}
                      </button>
                    {/each}
                  </div>
                {/if}
                <textarea 
                  id="lMsg"
                  bind:value={config.leaveMessage} 
                  class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none h-28 resize-none"
                  placeholder="Écrivez le message de départ..."
                  disabled={!canManageSettings}
                ></textarea>
              </div>

              <div class="space-y-1.5 pt-4">
                <span class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Aperçu du rendu Discord</span>
                <div class="p-5 rounded-lg bg-surface-container-high/35 border border-outline-variant/15 text-sm text-on-surface font-semibold font-sans whitespace-pre-wrap select-none relative overflow-hidden">
                  <div class="flex items-start gap-4">
                    <div class="w-10 h-10 rounded-full bg-outline-variant/30 flex items-center justify-center text-xs font-semibold text-on-surface-variant/60">BOT</div>
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="font-bold text-primary">Kotbo</span>
                        <span class="bg-primary/20 text-primary text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase leading-none">BOT</span>
                        <span class="text-[11px] text-on-surface-variant/40">Aujourd'hui à 12:05</span>
                      </div>
                      <div class="mt-1 text-on-surface-variant/90 leading-relaxed text-sm font-medium font-sans">
                        {previewText(config.leaveMessage)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          {:else}
            <p class="text-xs text-on-surface-variant/50 italic text-center py-6">Les messages de départ sont désactivés.</p>
          {/if}
        </section>
      {/if}

      <!-- Boost Tab -->
      {#if activeTab === 'boost'}
        <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6 max-w-4xl">
          <div class="flex items-center justify-between border-b border-outline-variant/15 pb-4">
            <h3 class="text-xl font-semibold flex items-center gap-3">
              <Papicon icon="Zap" size={20} class="text-primary" />
              Annonces de Boost Custom
            </h3>
            <ToggleSwitch 
              checked={config.boostEnabled} 
              onToggle={(v: boolean) => config.boostEnabled = v} 
              disabled={!canManageSettings}
            />
          </div>

          {#if config.boostEnabled}
            <div class="space-y-4 animate-in fade-in duration-300">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-1.5">
                  <label for="bChannel" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Salon de diffusion</label>
                  <SearchableSelect 
                    id="bChannel"
                    bind:value={config.boostChannelId} 
                    options={availableChannels.map(c => ({ id: c.id, name: `#${c.name}` }))} 
                    placeholder="Sélectionner le salon" 
                    className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all"
                    disabled={!canManageSettings}
                  />
                </div>
              </div>

              <div class="space-y-1.5">
                <div class="flex items-center justify-between ml-2 mb-1">
                  <label for="bMsg" class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">Contenu du message de Boost</label>
                  <button
                    onclick={() => showBoostPresets = !showBoostPresets}
                    class="text-[10px] font-bold text-primary/70 hover:text-primary flex items-center gap-1.5 transition-colors"
                    disabled={!canManageSettings}
                  >
                    <Papicon icon="Sparkles" size={12} />
                    <span>Presets</span>
                    <span class="transition-transform duration-200 {showBoostPresets ? 'rotate-180' : ''}">▾</span>
                  </button>
                </div>
                {#if showBoostPresets}
                  <div class="flex flex-wrap gap-2 pb-2 animate-in fade-in duration-200">
                    {#each boostPresets as preset}
                      <button
                        onclick={() => { config.boostMessage = preset.text; showBoostPresets = false; }}
                        class="text-[10px] font-bold px-3 py-1.5 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/15 text-primary transition-all hover: flex items-center gap-1.5"
                        disabled={!canManageSettings}
                      >
                        <Papicon icon={preset.icon} size={12} />
                        {preset.label}
                      </button>
                    {/each}
                  </div>
                {/if}
                <textarea 
                  id="bMsg"
                  bind:value={config.boostMessage} 
                  class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none h-28 resize-none"
                  placeholder="Écrivez le message à envoyer lorsqu'un membre booste..."
                  disabled={!canManageSettings}
                ></textarea>
              </div>

              <div class="p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 space-y-3">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm font-bold">Activer l'image de boost</p>
                    <p class="text-[10px] text-on-surface-variant/50">Génère un bandeau spécial de boost</p>
                  </div>
                  <ToggleSwitch 
                    checked={config.boostImageEnabled} 
                    onToggle={(v: boolean) => config.boostImageEnabled = v} 
                    disabled={!canManageSettings}
                  />
                </div>

                {#if config.boostImageEnabled}
                  <div class="space-y-1.5 pt-2 animate-in fade-in duration-300">
                    <label for="bImgUrl" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">URL de fond d'image de boost (Optionnel)</label>
                    <input 
                      id="bImgUrl"
                      type="url" 
                      bind:value={config.boostImageUrl} 
                      placeholder="https://example.com/boost-background.png"
                      class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
                      disabled={!canManageSettings}
                    />
                  </div>
                {/if}
              </div>

              <div class="space-y-1.5">
                <span class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Aperçu du rendu Discord</span>
                <div class="p-5 rounded-lg bg-surface-container-high/35 border border-outline-variant/15 text-sm text-on-surface font-semibold font-sans whitespace-pre-wrap select-none relative overflow-hidden">
                  <div class="flex items-start gap-4">
                    <div class="w-10 h-10 rounded-full bg-outline-variant/30 flex items-center justify-center text-xs font-semibold text-on-surface-variant/60">BOT</div>
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="font-bold text-primary">Kotbo</span>
                        <span class="bg-primary/20 text-primary text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase leading-none">BOT</span>
                        <span class="text-[11px] text-on-surface-variant/40">Aujourd'hui à 12:10</span>
                      </div>
                      <div class="mt-1 text-on-surface-variant/90 leading-relaxed text-sm font-medium font-sans">
                        {previewText(config.boostMessage)}
                      </div>
                      {#if config.boostImageEnabled}
                        <div class="mt-3 w-full max-w-sm aspect-5/2 rounded-xl bg-[#0b0e14] flex items-center justify-center border border-[#5865f2]/30 relative overflow-hidden">
                          {#if config.boostImageUrl}
                            <img src={config.boostImageUrl} alt="Background" class="absolute inset-0 w-full h-full object-cover opacity-50" />
                          {/if}
                          <div class="relative flex flex-col items-center gap-1.5 z-10 p-4 text-center">
                            <div class="w-12 h-12 rounded-full border border-primary/20 bg-surface-container/85 flex items-center justify-center text-sm font-semibold text-primary">JD</div>
                            <span class="text-xs font-semibold text-white leading-none drop-shadow-sm">MERCI !</span>
                            <span class="text-[10px] font-bold text-[#57f287] leading-none font-sans">JEANDUPONT</span>
                            <span class="text-[11px] text-[#b8bcc8] font-medium uppercase tracking-wider">Membre #1,234 · 18 BOOSTS</span>
                          </div>
                        </div>
                      {/if}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          {:else}
            <p class="text-xs text-on-surface-variant/50 italic text-center py-6">Les messages d'annonce de boost sont désactivés.</p>
          {/if}
        </section>
      {/if}

      <!-- Auto-Roles Tab -->
      {#if activeTab === 'autoroles'}
        <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-8 max-w-4xl">
          
          <!-- Join Auto-role -->
          <div class="space-y-4 border-b border-outline-variant/15 pb-6">
            <h3 class="text-lg font-semibold flex items-center gap-3">
              <Papicon icon="User" size={20} class="text-primary" />
              Auto-Rôle à l'arrivée (Join Auto-Role)
            </h3>
            <p class="text-xs text-on-surface-variant/70 font-medium">Attribue automatiquement un rôle spécifique à tout nouvel utilisateur qui rejoint le serveur.</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div class="space-y-1.5">
                <label for="joinRole" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Rôle attribué</label>
                <SearchableSelect 
                  id="joinRole"
                  bind:value={config.joinRoleId} 
                  options={[
                    { id: null, name: 'Aucun (Désactivé)' },
                    ...availableRoles.map(r => ({ id: r.id, name: r.name }))
                  ]} 
                  placeholder="Choisir le rôle" 
                  className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all"
                  disabled={!canManageSettings}
                />
              </div>
            </div>
          </div>

          <!-- Tag Auto-role -->
          <div class="space-y-4 pt-2">
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold flex items-center gap-3">
                <Papicon icon="Bookmark" size={20} class="text-primary" />
                Auto-Rôle Tag Clan du Serveur
              </h3>
              <ToggleSwitch 
                checked={config.tagAutoRoleEnabled} 
                onToggle={(v: boolean) => config.tagAutoRoleEnabled = v} 
                disabled={!canManageSettings}
              />
            </div>
            <p class="text-xs text-on-surface-variant/70 font-medium">
              Attribue automatiquement un rôle aux membres qui affichent le tag clan de ce serveur dans leur pseudo ou nom global Discord.
              Le rôle est également retiré automatiquement si le membre supprime le tag.
            </p>
            <div class="flex items-start gap-2 p-3 rounded-lg bg-surface-container-high/20 border border-outline-variant/10">
              <span class="text-primary mt-0.5 shrink-0"><Papicon icon="Info" size={14} /></span>
              <p class="text-[11px] text-on-surface-variant/70 font-medium leading-relaxed">
                Le tag clan Discord s'affiche entre crochets à côté du pseudo d'un membre (ex : <code class="font-mono text-primary bg-primary/10 px-1 rounded">KOTBO</code> → membre affiché comme <code class="font-mono text-primary bg-primary/10 px-1 rounded">[KOTBO] JeanDupont</code>). Saisis ici le tag exact sans crochets.
              </p>
            </div>
            
            {#if config.tagAutoRoleEnabled}
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 animate-in fade-in duration-300">
                <div class="space-y-1.5">
                  <label for="tagWord" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Tag clan à détecter</label>
                  <input 
                    id="tagWord"
                    type="text" 
                    bind:value={config.tagAutoRoleWord} 
                    placeholder="Ex : KOTBO (sans les crochets)"
                    class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
                    disabled={!canManageSettings}
                  />
                </div>

                <div class="space-y-1.5">
                  <label for="tagRole" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Rôle à attribuer</label>
                  <SearchableSelect 
                    id="tagRole"
                    bind:value={config.tagAutoRoleId} 
                    options={availableRoles.map(r => ({ id: r.id, name: r.name }))} 
                    placeholder="Sélectionner le rôle" 
                    className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all"
                    disabled={!canManageSettings}
                  />
                </div>
              </div>
            {/if}
          </div>

        </section>
      {/if}

    </div>
  {/if}
</div>
