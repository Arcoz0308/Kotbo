<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { 
    updateGlobalSettings, 
    updateNotificationsSettings,
    fetchFeatureConfigurations,
    updateFeatureConfiguration
  } from '../lib/api';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import FormSelect from '../lib/components/FormSelect.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import ManagementNotifications from '../lib/components/management/ManagementNotifications.svelte';

  const availableChannels = $derived(dashboardStore.state.discordChannels || []);
  const availableRoles = $derived(dashboardStore.state.discordRoles || []);
  const canManageSettings = $derived(!!dashboardStore.state.access?.canManageSettings);

  const saveAction = createAsyncActionState();

  let notificationsDraft = $state({
    discordChannel: '#alertes-redaction',
    logChannelId: '',
    email: '',
    emailEnabled: false
  });

  let featureConfigs = $state<any[]>([]);

  async function loadFeatureConfigs() {
    try {
      const data = await fetchFeatureConfigurations();
      featureConfigs = data?.features || [];
    } catch (err) {
      console.error('Failed to load feature configs:', err);
    }
  }

  $effect(() => {
    if (!dashboardStore.state.loading) {
      notificationsDraft = {
        discordChannel: dashboardStore.state.notifications?.discordChannel || '#alertes-redaction',
        logChannelId: dashboardStore.state.logChannelId || '',
        email: dashboardStore.state.notifications?.email || '',
        emailEnabled: !!dashboardStore.state.notifications?.emailEnabled
      };
    }
  });

  onMount(() => {
    loadFeatureConfigs();
  });

  async function saveGeneralNotifications() {
    if (!canManageSettings) {
      saveAction.setError('Seuls les administrateurs peuvent modifier ces paramètres.');
      return;
    }

    await saveAction.run(
      async () => {
        const notificationsPayload = {
          discordChannel: notificationsDraft.discordChannel,
          email: notificationsDraft.email,
          emailEnabled: notificationsDraft.emailEnabled,
          // preserve other unchanged settings to prevent overriding
          cloudBackup: dashboardStore.state.notifications?.cloudBackup ?? true,
          debugLog: dashboardStore.state.notifications?.debugLog ?? false,
          killSwitchEnabled: dashboardStore.state.notifications?.killSwitchEnabled ?? false,
          severityByModule: dashboardStore.state.notifications?.severityByModule || []
        };

        const notificationsSaved = await updateNotificationsSettings(notificationsPayload);
        if (!notificationsSaved) return false;

        const settingsSaved = await updateGlobalSettings({
          discordChannel: notificationsDraft.discordChannel,
          logChannelId: notificationsDraft.logChannelId || null
        });

        if (!settingsSaved) return false;

        await dashboardStore.refresh();
        return true;
      },
      {
        successMessage: 'Configuration des alertes sauvegardée.',
        failureMessage: 'Erreur lors de la sauvegarde.'
      }
    );
  }

  async function handleSaveFeatureConfig(featureKey: string) {
    const configToSave = featureConfigs.find(c => c.featureKey === featureKey);
    if (!configToSave) return;

    try {
      const payload = {
        enabled: configToSave.enabled,
        channelId: configToSave.channelId || null,
        secondaryChannelId: configToSave.secondaryChannelId || null,
        requiredRoleId: configToSave.requiredRoleId || null,
        notificationRoleId: configToSave.notificationRoleId || null,
        notifyViaDiscordChannel: configToSave.notifyViaDiscordChannel,
        notifyViaDM: configToSave.notifyViaDM,
        loggingEnabled: configToSave.loggingEnabled,
        userActivityTracking: configToSave.userActivityTracking,
        metadata: configToSave.metadata || {},
      };
      await updateFeatureConfiguration(featureKey, payload);
    } catch (err) {
      console.error(`Failed to save feature config ${featureKey}:`, err);
    }
  }
</script>

<div class="mb-12 font-inter">
  <h2 class="text-4xl font-extrabold text-primary tracking-tight font-headline">Centre de Notifications</h2>
  <p class="text-on-surface-variant mt-2 text-lg">Configurez les alertes et relais d'actions vers vos salons ou webhooks Discord.</p>
</div>

<div class="grid grid-cols-1 lg:grid-cols-12 gap-8 font-inter">
  <!-- General alerts card -->
  <div class="lg:col-span-4 space-y-6">
    <div class="bg-surface-container-low/40 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-6">
      <div>
        <h3 class="text-xl font-bold flex items-center gap-3">
          <Papicon icon="discord" size={20} class="text-primary" />
          Alertes Générales
        </h3>
        <p class="text-xs text-on-surface-variant/50 mt-1">Configurez les alertes système fondamentales.</p>
      </div>

      <div class="space-y-4">
        <div class="space-y-2">
          <label class="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest ml-1" for="discord-channel">Salon d'alertes principal</label>
          <FormSelect
            id="discord-channel"
            bind:value={notificationsDraft.discordChannel}
            disabled={!canManageSettings}
            className="w-full px-6 py-4 bg-surface-container-high border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 transition-all font-bold"
          >
            <option value="">Sélectionner un salon</option>
            {#each availableChannels as channel}
              <option value={channel.mention}>#{channel.name}</option>
            {/each}
          </FormSelect>
        </div>

        <div class="space-y-2">
          <label class="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest ml-1" for="log-channel">Salon des embeds de logs (optionnel)</label>
          <FormSelect
            id="log-channel"
            bind:value={notificationsDraft.logChannelId}
            disabled={!canManageSettings}
            className="w-full px-6 py-4 bg-surface-container-high border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 transition-all font-bold"
          >
            <option value="">Ne pas envoyer d'embed</option>
            {#each availableChannels as channel}
              <option value={channel.id}>#{channel.name}</option>
            {/each}
          </FormSelect>
        </div>

        <div class="pt-4 border-t border-outline-variant/10 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-800 dark:text-slate-200">Alertes Email</span>
            <ToggleSwitch
              size="sm"
              checked={notificationsDraft.emailEnabled}
              onToggle={(checked) => (notificationsDraft.emailEnabled = checked)}
            />
          </div>
          {#if notificationsDraft.emailEnabled}
            <FormInput
              type="email"
              bind:value={notificationsDraft.email}
              placeholder="admin@exemple.fr"
              className="w-full px-4 py-2.5 bg-surface-container-high border border-outline-variant/15 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-primary/20 transition-all"
            />
          {/if}
        </div>

        <div class="flex items-center justify-between pt-4 border-t border-outline-variant/10">
          <InlineFeedback
            message={saveAction.state.message}
            error={saveAction.state.error}
          />
          <button
            type="button"
            onclick={saveGeneralNotifications}
            disabled={saveAction.state.loading || !canManageSettings}
            class="px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider shadow-lg hover:opacity-90 disabled:opacity-50"
          >
            Sauvegarder
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Module-specific custom webhooks / alerts accordion -->
  <div class="lg:col-span-8">
    <ManagementNotifications
      bind:features={featureConfigs}
      availableChannels={availableChannels}
      availableRoles={availableRoles}
      onSave={handleSaveFeatureConfig}
    />
  </div>
</div>
