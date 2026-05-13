<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import FormSelect from '../lib/components/FormSelect.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';
  import { updateGlobalSettings } from '../lib/api';

  const saveAction = createAsyncActionState();
  let loading = $state(false);
  const canManageSettings = $derived(
    !!dashboardStore.state.featureAccess?.settings?.canConfigure
      || !!dashboardStore.state.access?.canManageSettings
  );

  const availableChannels = $derived(dashboardStore.state.discordChannels || []);
  const availableRoles = $derived(dashboardStore.state.discordRoles || []);

  let guildSettings = $state({
    configChannelId: '',
    publicChannelId: '',
    digestChannelId: '',
    meetingVoiceChannelId: '',
    baseStaffRoleId: '',
    testStaffRoleId: '',
    translationEnabled: false,
    codePoliceEnabled: false,
    dailyAlgoEnabled: false,
    githubReleasesEnabled: false,
  });

  onMount(async () => {
    loading = true;
    try {
      await dashboardStore.refresh();
      const s = dashboardStore.state as any;
      guildSettings = {
        configChannelId: s.configChannelId || '',
        publicChannelId: s.publicChannelId || '',
        digestChannelId: s.digestChannelId || '',
        meetingVoiceChannelId: s.meetingVoiceChannelId || '',
        baseStaffRoleId: s.baseStaffRoleId || '',
        testStaffRoleId: s.testStaffRoleId || '',
        translationEnabled: s.translationEnabled || false,
        codePoliceEnabled: s.codePoliceEnabled || false,
        dailyAlgoEnabled: s.dailyAlgoEnabled || false,
        githubReleasesEnabled: s.githubReleasesEnabled || false,
      };
    } finally {
      loading = false;
    }
  });

  async function handleSave() {
    if (!canManageSettings) {
      saveAction.setError('Accès refusé: permissions insuffisantes.');
      return;
    }
    await saveAction.run(async () => {
      const ok = await updateGlobalSettings(guildSettings);
      if (!ok) throw new Error('Erreur API');
      await dashboardStore.refresh();
      return true;
    }, { successMessage: 'Paramètres globaux enregistrés.' });
  }

  const channelFields = [
    { key: 'meetingVoiceChannelId', label: 'Vocal Réunions', desc: 'Salon vocal par défaut' },
    { key: 'digestChannelId', label: 'Salon Digest', desc: 'Publication du digest de news' },
    { key: 'publicChannelId', label: 'Salon Public', desc: 'Salon public général' },
    { key: 'configChannelId', label: 'Salon Config', desc: 'Salon de configuration interne' },
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
  ];
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <header class="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-surface-container-low/40 backdrop-blur-3xl p-8 rounded-4xl border border-outline-variant/30">
    <div class="flex items-center gap-6">
      <div class="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-inner">
        <Papicon icon="Gear" size={32} />
      </div>
      <div>
        <h1 class="text-3xl font-black tracking-tight leading-tight">Paramètres Généraux</h1>
        <p class="text-on-surface-variant/80 font-medium">Configuration globale du serveur et des intégrations.</p>
      </div>
    </div>
    <button 
      onclick={handleSave}
      disabled={saveAction.loading || loading || !canManageSettings}
      class="px-8 py-3 bg-primary text-on-primary font-black uppercase tracking-widest text-xs rounded-2xl shadow-lg shadow-primary/20 hover:scale-105 transition-all disabled:opacity-50"
    >
      Enregistrer les modifications
    </button>
  </header>

  <InlineFeedback state={saveAction} />

  {#if loading}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {#each Array(2) as _}
        <div class="p-8 rounded-[2.5rem] bg-surface-container-low/30 border border-outline-variant/10 space-y-6">
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
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Discord Configuration -->
      <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-8">
        <div class="space-y-6">
          <h3 class="text-xl font-black flex items-center gap-3">
            <Papicon icon="Hash" size={20} class="text-primary" />
            Canaux Discord
          </h3>
          <div class="space-y-4">
            {#each channelFields as field}
              <div class="space-y-1.5">
                <label for={field.key} class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">{field.label}</label>
                <FormSelect id={field.key} bind:value={guildSettings[field.key]} className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all">
                  <option value="">— Aucun —</option>
                  {#each availableChannels as c}<option value={c.id}>#{c.name}</option>{/each}
                </FormSelect>
                <p class="text-[9px] text-on-surface-variant/40 ml-2">{field.desc}</p>
              </div>
            {/each}
          </div>
        </div>
      </section>

      <div class="space-y-8">
        <!-- Roles Configuration -->
        <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-8">
          <h3 class="text-xl font-black flex items-center gap-3">
            <Papicon icon="Shield" size={20} class="text-secondary" />
            Rôles Staff
          </h3>
          <div class="space-y-4">
            {#each roleFields as field}
              <div class="space-y-1.5">
                <label for={field.key} class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">{field.label}</label>
                <FormSelect id={field.key} bind:value={guildSettings[field.key]} className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all">
                  <option value="">— Aucun —</option>
                  {#each availableRoles as r}<option value={r.id}>@{r.name}</option>{/each}
                </FormSelect>
                <p class="text-[9px] text-on-surface-variant/40 ml-2">{field.desc}</p>
              </div>
            {/each}
          </div>
        </section>

        <!-- Integrations Toggles -->
        <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-8">
          <h3 class="text-xl font-black flex items-center gap-3">
            <Papicon icon="Link" size={20} class="text-tertiary" />
            Intégrations
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {#each toggleFields as toggle}
              <div class="flex items-center justify-between p-4 rounded-2xl bg-surface-container-high/20 border border-outline-variant/5 hover:bg-surface-container-high/40 transition-colors">
                <div>
                  <p class="text-sm font-bold">{toggle.label}</p>
                  <p class="text-[10px] text-on-surface-variant/50">{toggle.desc}</p>
                </div>
                <ToggleSwitch checked={guildSettings[toggle.key]} onToggle={(v) => { guildSettings[toggle.key] = v; guildSettings = {...guildSettings}; }} />
              </div>
            {/each}
          </div>
        </section>
      </div>
    </div>
  {/if}
</div>

