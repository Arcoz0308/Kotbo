<script lang="ts">
  import { channelDisplayName } from '../lib/channelUtils';
  import { onMount, onDestroy, untrack } from 'svelte';
  import { unsavedChanges } from '../lib/stores/unsavedChanges.svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import FormSelect from '../lib/components/FormSelect.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import SearchableSelect from '../lib/components/SearchableSelect.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';
  import LoadingHint from '../lib/components/LoadingHint.svelte';
  import { updateGlobalSettings, updateFeatureConfiguration } from '../lib/api';
  import { historyStore } from '../lib/stores/history.svelte';

  const saveAction = createAsyncActionState();
  let loading = $state(false);
  const canManageSettings = $derived(
    !!dashboardStore.state.featureAccess?.settings?.canConfigure
      || !!dashboardStore.state.access?.canManageSettings
  );

  const availableChannels = $derived(dashboardStore.state.discordChannels || []);
  const availableVoiceChannels = $derived(dashboardStore.state.discordVoiceChannels || []);
  const availableRoles = $derived(dashboardStore.state.discordRoles || []);

  let guildSettings = $state<Record<string, any>>({
    configChannelId: '',
    publicChannelId: '',
    newsChannelId: '',
    dailyAlgoChannelId: '',
    meetingVoiceChannelId: '',
    baseStaffRoleId: '',
    testStaffRoleId: '',
    translationEnabled: false,
    codePoliceEnabled: false,
    dailyAlgoEnabled: false,
    githubReleasesEnabled: false,
    logChannelId: '',
    propagateSanctions: false,
    crossServerSanctionsEnabled: true,
  });

  let savedSettings = $state<Record<string, any>>({
    configChannelId: '',
    publicChannelId: '',
    newsChannelId: '',
    dailyAlgoChannelId: '',
    meetingVoiceChannelId: '',
    baseStaffRoleId: '',
    testStaffRoleId: '',
    translationEnabled: false,
    codePoliceEnabled: false,
    dailyAlgoEnabled: false,
    githubReleasesEnabled: false,
    logChannelId: '',
    propagateSanctions: false,
    crossServerSanctionsEnabled: true,
  });

  $effect(() => {
    const current = JSON.stringify(guildSettings);
    const saved = JSON.stringify(savedSettings);
    const dirty = current !== saved;

    if (dirty && canManageSettings) {
      untrack(() => {
        unsavedChanges.register({
          label: 'Paramètres Généraux',
          onSave: () => handleSave(),
          onReset: () => {
            guildSettings = { ...savedSettings };
          }
        });
      });
    } else if (!dirty) {
      untrack(() => {
        if (unsavedChanges.isDirty && unsavedChanges.pageLabel === 'Paramètres Généraux') {
          unsavedChanges.clear();
        }
      });
    }
  });

  onDestroy(() => {
    if (unsavedChanges.pageLabel === 'Paramètres Généraux') {
      unsavedChanges.clear();
    }
  });

  onMount(async () => {
    loading = true;
    try {
      await dashboardStore.refresh();
      const s = dashboardStore.state as any;
      const loaded = {
        configChannelId: s.configChannelId || '',
        publicChannelId: s.publicChannelId || '',
        newsChannelId: s.newsChannelId || '',
        dailyAlgoChannelId: s.dailyAlgoChannelId || '',
        meetingVoiceChannelId: s.meetingVoiceChannelId || '',
        baseStaffRoleId: s.baseStaffRoleId || '',
        testStaffRoleId: s.testStaffRoleId || '',
        translationEnabled: s.translationEnabled || false,
        codePoliceEnabled: s.codePoliceEnabled || false,
        dailyAlgoEnabled: s.dailyAlgoEnabled || false,
        githubReleasesEnabled: s.githubReleasesEnabled || false,
        logChannelId: s.logChannelId || '',
        propagateSanctions: s.propagateSanctions || false,
        crossServerSanctionsEnabled: s.crossServerSanctionsEnabled ?? true,
      };
      guildSettings = loaded;
      savedSettings = { ...loaded };
    } finally {
      loading = false;
    }
  });

  async function handleSave(): Promise<boolean> {
    if (!canManageSettings) {
      saveAction.setError('Accès refusé: permissions insuffisantes.');
      return false;
    }
    let success = false;
    await saveAction.run(async () => {
      const ok = await updateGlobalSettings(guildSettings);
      if (!ok) throw new Error('Erreur API');

      await dashboardStore.refresh();
      savedSettings = { ...guildSettings };
      success = true;
      return true;
    }, { successMessage: 'Paramètres globaux enregistrés.' });
    return success;
  }

  const channelFields = [
    { key: 'meetingVoiceChannelId', label: 'Vocal Réunions', desc: 'Salon vocal par défaut', isVoice: true },
    { key: 'dailyAlgoChannelId', label: 'Salon Daily Algo', desc: 'Salon de publication des exercices quotidiens' },
    { key: 'publicChannelId', label: 'Salon Public', desc: 'Salon public général' },
    { key: 'newsChannelId', label: 'Salon Actualités', desc: 'Salon de publication des annonces de patch notes / staff news' },
    { key: 'configChannelId', label: 'Salon Config', desc: 'Salon de configuration interne' },
    { key: 'logChannelId', label: 'Salon Logs', desc: 'Salon des logs d\'activité' },
  ];

  const roleFields = [
    { key: 'baseStaffRoleId', label: 'Rôle Staff Base', desc: 'Rôle de base du staff' },
    { key: 'testStaffRoleId', label: 'Rôle Staff Test', desc: 'Rôle pour les membres en période d\'essai' },
  ];

  const toggleFields = [

    { key: 'translationEnabled', label: 'Auto-traduction', desc: 'Contenus' },
    { key: 'codePoliceEnabled', label: 'Code Police', desc: 'Audit code' },
    { key: 'dailyAlgoEnabled', label: 'Daily Algo', desc: 'Défis quotidiens' },
    { key: 'githubReleasesEnabled', label: 'GitHub Releases', desc: 'Notifications releases' },
    { key: 'propagateSanctions', label: 'Propager les sanctions', desc: 'Synchronisation inter-serveurs' },
    { key: 'crossServerSanctionsEnabled', label: 'Casier inter-serveurs', desc: 'Partager/voir les sanctions des autres serveurs de l\'instance' },
  ];
</script>

<ModulePage
  title="Paramètres Généraux"
  description="Configuration globale du serveur et des intégrations."
  icon="settings"
  featureKey="settings"
>
  <InlineFeedback state={saveAction} />

  {#if loading}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {#each Array(2) as _}
        <div class="p-8 rounded-xl bg-surface-container-low/30 border border-outline-variant/10 space-y-6">
          <Skeleton width="40%" height="24px" />
          <div class="space-y-4">
            {#each Array(4) as _}
              <div class="space-y-2">
                <Skeleton width="20%" height="12px" />
                <Skeleton width="100%" height="48px" radius="16px" />
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
    <div class="flex justify-center mt-4">
      <LoadingHint context="config" />
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Discord Configuration -->
      <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-8">
        <div class="space-y-6">
          <h3 class="text-xl font-semibold flex items-center gap-3">
            <Papicon icon="Hash" size={20} class="text-primary" />
            Canaux Discord
          </h3>
          <div class="space-y-4">
            {#each channelFields as field}
              <div class="space-y-1.5">
                <label for={field.key} class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">{field.label}</label>
                {#if field.isVoice}
                  <SearchableSelect id={field.key} bind:value={guildSettings[field.key]} options={availableVoiceChannels.map(c => ({ id: c.id, name: `🔊 ${c.name}` }))} placeholder="— Aucun —" className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all" />
                {:else}
                  <SearchableSelect id={field.key} bind:value={guildSettings[field.key]} options={availableChannels.map(c => ({ id: c.id, name: channelDisplayName(c) }))} placeholder="— Aucun —" className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all" />
                {/if}
                <p class="text-[11px] text-on-surface-variant/40 ml-2">{field.desc}</p>
              </div>
            {/each}
          </div>
        </div>
      </section>

      <div class="space-y-8">
        <!-- Roles Configuration -->
        <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-8">
          <h3 class="text-xl font-semibold flex items-center gap-3">
            <Papicon icon="Shield" size={20} class="text-secondary" />
            Rôles Staff
          </h3>
          <div class="space-y-4">
            {#each roleFields as field}
              <div class="space-y-1.5">
                <label for={field.key} class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">{field.label}</label>
                <SearchableSelect id={field.key} bind:value={guildSettings[field.key]} options={availableRoles.map(r => ({ id: r.id, name: `@${r.name}` }))} placeholder="— Aucun —" className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all" />
                <p class="text-[11px] text-on-surface-variant/40 ml-2">{field.desc}</p>
              </div>
            {/each}
          </div>
        </section>

        <!-- Integrations Toggles -->
        <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-8">
          <h3 class="text-xl font-semibold flex items-center gap-3">
            <Papicon icon="Link" size={20} class="text-tertiary" />
            Intégrations
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {#each toggleFields as toggle}
              <div class="flex items-center justify-between p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 hover:bg-surface-container-high/40 transition-colors">
                <div>
                  <p class="text-sm font-bold">{toggle.label}</p>
                  <p class="text-[10px] text-on-surface-variant/50">{toggle.desc}</p>
                </div>
                <ToggleSwitch checked={guildSettings[toggle.key]} onToggle={(v: boolean) => {
                  const previousValue = guildSettings[toggle.key];
                  const key = toggle.key;
                  guildSettings[key] = v;
                  guildSettings = {...guildSettings};
                  historyStore.push({
                    label: `Modifier ${toggle.label}`,
                    undo: () => {
                      guildSettings[key] = previousValue;
                      guildSettings = {...guildSettings};
                    },
                    redo: () => {
                      guildSettings[key] = v;
                      guildSettings = {...guildSettings};
                    }
                  });
                }} />
              </div>
            {/each}
          </div>
        </section>
      </div>
    </div>
  {/if}
</ModulePage>

