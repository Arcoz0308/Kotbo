<script lang="ts">
  import { channelDisplayName } from '../lib/channelUtils';
  import { onMount, onDestroy, untrack } from 'svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import { unsavedChanges } from '../lib/stores/unsavedChanges.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import SearchableSelect from '../lib/components/SearchableSelect.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';
  import LoadingHint from '../lib/components/LoadingHint.svelte';
  import { fetchWelcomeConfig, updateWelcomeConfig } from '../lib/api';

  const actionState = createAsyncActionState();
  let loading = $state(false);

  const canManageSettings = $derived(
    !!dashboardStore.state.featureAccess?.welcome_goodbye?.canConfigure
      || !!dashboardStore.state.access?.canManageSettings
  );

  const availableChannels = $derived(dashboardStore.state.discordChannels || []);

  // The current (possibly-modified) config
  let config = $state({
    welcomeEnabled: false,
    welcomeChannelId: null as string | null,
    welcomeMessage: 'Bienvenue {user} sur notre serveur ! 🎉',
    welcomeImageEnabled: false,
    welcomeImageUrl: null as string | null,
    leaveEnabled: false,
    leaveChannelId: null as string | null,
    leaveMessage: 'Au revoir {user}... 😢'
  });

  // Snapshot of the last-saved config – used to detect dirty state & reset
  let savedConfig = $state({
    welcomeEnabled: false,
    welcomeChannelId: null as string | null,
    welcomeMessage: 'Bienvenue {user} sur notre serveur ! 🎉',
    welcomeImageEnabled: false,
    welcomeImageUrl: null as string | null,
    leaveEnabled: false,
    leaveChannelId: null as string | null,
    leaveMessage: 'Au revoir {user}... 😢'
  });

  // Detect changes and register/deregister with the global bar
  $effect(() => {
    // Read all fields to make this reactive
    const current = JSON.stringify(config);
    const saved = JSON.stringify(savedConfig);
    const dirty = current !== saved;

    if (dirty && canManageSettings) {
      untrack(() => {
        unsavedChanges.register({
          label: 'Accueil & Départ',
          onSave: () => handleSave(),
          onReset: () => { config = { ...savedConfig }; }
        });
      });
    } else if (!dirty) {
      untrack(() => {
        if (unsavedChanges.isDirty && unsavedChanges.pageLabel === 'Accueil & Départ') {
          unsavedChanges.clear();
        }
      });
    }
  });

  // Clear bar when page is unmounted
  onDestroy(() => {
    if (unsavedChanges.pageLabel === 'Accueil & Départ') {
      unsavedChanges.clear();
    }
  });

  onMount(async () => {
    loading = true;
    try {
      await dashboardStore.refresh();
      const res = await fetchWelcomeConfig();
      if (res && res.config) {
        const loaded = {
          welcomeEnabled: res.config.welcomeEnabled ?? false,
          welcomeChannelId: res.config.welcomeChannelId ?? null,
          welcomeMessage: res.config.welcomeMessage ?? '',
          welcomeImageEnabled: res.config.welcomeImageEnabled ?? false,
          welcomeImageUrl: res.config.welcomeImageUrl ?? null,
          leaveEnabled: res.config.leaveEnabled ?? false,
          leaveChannelId: res.config.leaveChannelId ?? null,
          leaveMessage: res.config.leaveMessage ?? ''
        };
        config = loaded;
        savedConfig = { ...loaded };
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
        leaveMessage: res.config.leaveMessage ?? ''
      };
      config = saved;
      savedConfig = { ...saved };
      success = true;
      return true;
    }, { successMessage: 'Configuration Accueil/Départ enregistrée !' });
    return success;
  }

  // Preview helper
  function previewText(template: string) {
    return template
      .replace(/{user}/g, '@JeanDupont')
      .replace(/{username}/g, 'JeanDupont')
      .replace(/{server}/g, 'Kotbo Server')
      .replace(/{memberCount}/g, '1,234');
  }
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <header class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-container-low/40 p-5 rounded-xl border border-outline-variant/30">
    <div class="flex items-center gap-4">
      <div class="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
        <Papicon icon="DoorOpen" size={20} />
      </div>
      <div>
        <h1 class="text-lg font-semibold tracking-tight leading-tight">Accueil & Départ</h1>
        <p class="text-sm text-on-surface-variant/70 font-medium">Configurez des messages automatiques lors de l'arrivée ou du départ des membres.</p>
      </div>
    </div>
  </header>

  <InlineFeedback state={actionState} />

  {#if loading}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <Skeleton height="450px" radius="2.5rem" />
      <Skeleton height="450px" radius="2.5rem" />
    </div>
    <div class="flex justify-center mt-4">
      <LoadingHint context="config" />
    </div>
  {:else}
    <!-- Guide and Variable Reference -->
    <section class="bg-surface-container-low/30 border border-outline-variant/10 p-6 rounded-xl space-y-2">
      <h4 class="text-sm font-bold text-on-surface flex items-center gap-2">
        <Papicon icon="Info" size={16} class="text-primary" />
        Guide des variables éligibles
      </h4>
      <p class="text-xs text-on-surface-variant/80 font-medium">
        Vous pouvez insérer les balises suivantes dans vos messages d'accueil et de départ pour les dynamiser :
      </p>
      <div class="flex flex-wrap gap-3 pt-2">
        <span class="text-[11px] font-mono bg-surface-container-high px-2.5 py-1.5 rounded-xl border border-outline-variant/10 font-bold"><code class="text-primary dark:text-blue-300">{`{user}`}</code> : Mentionne l'utilisateur</span>
        <span class="text-[11px] font-mono bg-surface-container-high px-2.5 py-1.5 rounded-xl border border-outline-variant/10 font-bold"><code class="text-primary dark:text-blue-300">{`{username}`}</code> : Nom simple</span>
        <span class="text-[11px] font-mono bg-surface-container-high px-2.5 py-1.5 rounded-xl border border-outline-variant/10 font-bold"><code class="text-primary dark:text-blue-300">{`{server}`}</code> : Nom du serveur</span>
        <span class="text-[11px] font-mono bg-surface-container-high px-2.5 py-1.5 rounded-xl border border-outline-variant/10 font-bold"><code class="text-primary dark:text-blue-300">{`{memberCount}`}</code> : Nombre total de membres</span>
      </div>
    </section>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Welcome Panel -->
      <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6">
        <div class="flex items-center justify-between border-b border-outline-variant/15 pb-4">
          <h3 class="text-xl font-semibold flex items-center gap-3">
            <Papicon icon="Add" size={20} class="text-primary" />
            Message de Bienvenue
          </h3>
          <ToggleSwitch 
            checked={config.welcomeEnabled} 
            onToggle={(v) => config.welcomeEnabled = v} 
            disabled={!canManageSettings}
          />
        </div>

        {#if config.welcomeEnabled}
          <div class="space-y-4 animate-in fade-in duration-300">
            <div class="space-y-1.5">
              <label for="wChannel" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Salon de diffusion</label>
              <SearchableSelect 
                id="wChannel"
                bind:value={config.welcomeChannelId} 
                options={availableChannels.map(c => ({ id: c.id, name: channelDisplayName(c) }))} 
                placeholder="Sélectionner le salon" 
                className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all"
                disabled={!canManageSettings}
              />
            </div>

            <div class="space-y-1.5">
              <label for="wMsg" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Contenu du message</label>
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
                  onToggle={(v) => config.welcomeImageEnabled = v} 
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

            <!-- Preview box -->
            <div class="space-y-1.5">
              <span class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Aperçu du rendu Discord</span>
              <div class="p-5 rounded-lg bg-surface-container-high/35 border border-outline-variant/15 text-sm text-on-surface font-semibold font-sans whitespace-pre-wrap select-none relative overflow-hidden">
                <div class="flex items-start gap-4">
                  <div class="w-10 h-10 rounded-full bg-outline-variant/30 flex items-center justify-center text-xs font-semibold text-on-surface-variant/60">
                    BOT
                  </div>
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
                          <span class="text-[10px] font-bold text-[#57f287] leading-none">JEANDUPONT</span>
                          <span class="text-[11px] text-[#b8bcc8] font-medium uppercase tracking-wider">Membre #1,235 sur KOTBO SERVER</span>
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

      <!-- Leave Panel -->
      <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6">
        <div class="flex items-center justify-between border-b border-outline-variant/15 pb-4">
          <h3 class="text-xl font-semibold flex items-center gap-3">
            <Papicon icon="LogOut" size={20} class="text-secondary" />
            Message de Départ
          </h3>
          <ToggleSwitch 
            checked={config.leaveEnabled} 
            onToggle={(v) => config.leaveEnabled = v} 
            disabled={!canManageSettings}
          />
        </div>

        {#if config.leaveEnabled}
          <div class="space-y-4 animate-in fade-in duration-300">
            <div class="space-y-1.5">
              <label for="lChannel" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Salon de diffusion</label>
              <SearchableSelect 
                id="lChannel"
                bind:value={config.leaveChannelId} 
                options={availableChannels.map(c => ({ id: c.id, name: channelDisplayName(c) }))} 
                placeholder="Sélectionner le salon" 
                className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all"
                disabled={!canManageSettings}
              />
            </div>

            <div class="space-y-1.5">
              <label for="lMsg" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Contenu du message</label>
              <textarea 
                id="lMsg"
                bind:value={config.leaveMessage} 
                class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none h-28 resize-none"
                placeholder="Écrivez le message de départ..."
                disabled={!canManageSettings}
              ></textarea>
            </div>

            <!-- Preview box -->
            <div class="space-y-1.5 pt-4">
              <span class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Aperçu du rendu Discord</span>
              <div class="p-5 rounded-lg bg-surface-container-high/35 border border-outline-variant/15 text-sm text-on-surface font-semibold font-sans whitespace-pre-wrap select-none relative overflow-hidden">
                <div class="flex items-start gap-4">
                  <div class="w-10 h-10 rounded-full bg-outline-variant/30 flex items-center justify-center text-xs font-semibold text-on-surface-variant/60">
                    BOT
                  </div>
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
    </div>
  {/if}
</div>
