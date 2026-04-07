<script lang="ts">
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { updateGlobalSettings, updateNotificationsSettings } from '../lib/api';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import { refreshDashboardOnMount } from '../lib/dashboardLifecycle';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';

  const availableChannels = $derived(dashboardStore.state.discordChannels || []);

  refreshDashboardOnMount();

  const saveAction = createAsyncActionState();

  let notificationsDraft = $state({
    discordChannel: '#alertes-redaction',
    email: '',
    emailEnabled: false,
    cloudBackup: true,
    debugLog: false,
    killSwitchEnabled: false,
    severityByModule: []
  });

  $effect(() => {
    if (!dashboardStore.state.loading) {
      notificationsDraft = {
        discordChannel: dashboardStore.state.notifications?.discordChannel || '#alertes-redaction',
        email: dashboardStore.state.notifications?.email || '',
        emailEnabled: !!dashboardStore.state.notifications?.emailEnabled,
        cloudBackup: !!dashboardStore.state.notifications?.cloudBackup,
        debugLog: !!dashboardStore.state.notifications?.debugLog,
        killSwitchEnabled: !!dashboardStore.state.notifications?.killSwitchEnabled,
        severityByModule: dashboardStore.state.notifications?.severityByModule || []
      };
    }
  });

  async function saveNotifications() {
    await saveAction.run(
      async () => {
        const success = await updateNotificationsSettings(notificationsDraft);
        if (!success) return false;
        await dashboardStore.refresh();
        return true;
      },
      {
        successMessage: 'Paramètres enregistrés avec succès.',
        failureMessage: 'Impossible d\'enregistrer les paramètres pour le moment.'
      }
    );
  }

  async function persistDiscordChannel() {
    const success = await updateGlobalSettings({
      discordChannel: notificationsDraft.discordChannel
    });

    if (success) {
      dashboardStore.state.notifications.discordChannel = notificationsDraft.discordChannel;
      return;
    }

    saveAction.setError('Impossible de sauvegarder le salon d\'alertes.');
  }

  function resetNotifications() {
    notificationsDraft = {
      discordChannel: '#alertes-redaction',
      email: '',
      emailEnabled: false,
      cloudBackup: true,
      debugLog: false,
      killSwitchEnabled: false,
      severityByModule: []
    };
    saveAction.clearFeedback();
  }

  async function resetAndSaveFactory() {
    resetNotifications();
    await saveNotifications();
  }
</script>


<div class="mb-12 font-inter">
  <h2 class="text-4xl font-extrabold text-primary tracking-tight font-headline">Paramètres & Notifications</h2>
  <p class="text-on-surface-variant mt-2 text-lg">Configurez les alertes système et les préférences globales pour {dashboardStore.state.guildName}.</p>
</div>


<div class="grid grid-cols-12 gap-8 font-inter">
  
  <div class="col-span-12 lg:col-span-8 space-y-8">
    <div class="bg-white dark:bg-slate-900 p-8 rounded-4xl shadow-sm border border-slate-100 dark:border-slate-800">
      <div class="flex items-center justify-between mb-8">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shrink-0 transition-transform group-hover:scale-110">
            <span class="material-symbols-outlined text-2xl">discord</span>
          </div>
          <h3 class="text-xl font-bold font-headline">Configuration Discord</h3>
        </div>
      </div>

      <div class="space-y-6">
        <div class="space-y-2">
          <label class="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest ml-1" for="discord-channel">Salon d'alertes</label>
          <select
            id="discord-channel"
            bind:value={notificationsDraft.discordChannel}
            onchange={persistDiscordChannel}
            class="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 transition-all font-bold"
          >
            <option value="">Sélectionner un salon</option>
            {#each availableChannels as channel}
              <option value={channel.mention}>#{channel.name}</option>
            {/each}
          </select>
        </div>
        
        <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
          <div>
            <p class="font-bold text-slate-800 dark:text-slate-200">Kill-Switch de Sécurité</p>
            <p class="text-xs text-on-surface-variant">Désactive instantanément tous les modules en cas d'urgence.</p>
          </div>
          <ToggleSwitch
            checked={notificationsDraft.killSwitchEnabled}
            onToggle={(checked) => (notificationsDraft.killSwitchEnabled = checked)}
            activeClass="peer-checked:bg-red-500"
          />
        </div>
      </div>
    </div>

    
    <div class="bg-white dark:bg-slate-900 p-8 rounded-4xl shadow-sm border border-slate-100 dark:border-slate-800">
      <h3 class="text-xl font-bold font-headline mb-8 flex items-center gap-4">
        <span class="material-symbols-outlined text-primary">notifications_active</span>
        Préférences de Notifications
      </h3>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div class="flex items-start gap-4 p-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
          <div class="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-all">
            <span class="material-symbols-outlined">cloud_upload</span>
          </div>
          <div class="flex-1">
            <div class="flex items-center justify-between mb-1">
              <span class="font-bold text-slate-800 dark:text-slate-200">Backup Cloud</span>
              <ToggleSwitch
                size="sm"
                checked={notificationsDraft.cloudBackup}
                onToggle={(checked) => (notificationsDraft.cloudBackup = checked)}
              />
            </div>
            <p class="text-xs text-on-surface-variant">Synchronisation quotidienne de la base de données.</p>
          </div>
        </div>

        <div class="flex items-start gap-4 p-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
          <div class="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-all">
            <span class="material-symbols-outlined">bug_report</span>
          </div>
          <div class="flex-1">
            <div class="flex items-center justify-between mb-1">
              <span class="font-bold text-slate-800 dark:text-slate-200">Mode Débogage</span>
              <ToggleSwitch
                size="sm"
                checked={notificationsDraft.debugLog}
                onToggle={(checked) => (notificationsDraft.debugLog = checked)}
              />
            </div>
            <p class="text-xs text-on-surface-variant">Logs plus verbeux pour l'analyse des erreurs.</p>
          </div>
        </div>

        <div class="flex items-start gap-4 p-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
          <div class="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-all">
            <span class="material-symbols-outlined">mail</span>
          </div>
          <div class="flex-1">
            <div class="flex items-center justify-between mb-1">
              <span class="font-bold text-slate-800 dark:text-slate-200">Alertes Email</span>
              <ToggleSwitch
                size="sm"
                checked={notificationsDraft.emailEnabled}
                onToggle={(checked) => (notificationsDraft.emailEnabled = checked)}
              />
            </div>
            <p class="text-xs text-on-surface-variant">Recevoir un rapport par email si le bot crash.</p>
            {#if notificationsDraft.emailEnabled}
              <input
                type="email"
                bind:value={notificationsDraft.email}
                placeholder="admin@exemple.fr"
                class="mt-3 w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-primary/20 transition-all"
              />
            {/if}
          </div>
        </div>
      </div>

      <div class="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-6">
        <InlineFeedback
          message={saveAction.state.message}
          error={saveAction.state.error}
          idleText="Les changements ne sont pas enregistrés tant que vous ne validez pas."
        />
        <div class="flex items-center gap-3">
          <button
            type="button"
            onclick={resetNotifications}
            class="px-4 py-2.5 rounded-xl border border-outline-variant/30 text-xs font-black uppercase tracking-wider text-on-surface-variant hover:bg-surface-container-low"
          >
            Réinitialiser
          </button>
          <button
            type="button"
            onclick={saveNotifications}
            disabled={saveAction.state.loading}
            class="px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-primary/10 hover:opacity-90 disabled:opacity-50"
          >
            {saveAction.state.loading ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  </div>

  
  <div class="col-span-12 lg:col-span-4 space-y-8">
    <div class="bg-primary p-8 rounded-4xl text-white overflow-hidden relative group">
      <div class="relative z-10">
        <h4 class="text-xs font-black uppercase tracking-[0.2em] opacity-60 mb-6">Statut de Connexion</h4>
        <div class="flex items-center gap-6 mb-8">
          <div class="w-16 h-16 rounded-3xl bg-white/10 flex items-center justify-center backdrop-blur-md border border-white/20">
            <span class="material-symbols-outlined text-4xl {dashboardStore.state.error ? 'text-red-300' : 'text-green-300'}">
              {dashboardStore.state.error ? 'report_problem' : 'check_circle'}
            </span>
          </div>
          <div>
            <div class="text-3xl font-black font-headline">{dashboardStore.state.error ? 'Erreur' : 'Connecté'}</div>
            <div class="text-xs font-bold opacity-70">
              {dashboardStore.state.error ? 'API Bot inaccessible' : 'Communication API stable'}
            </div>
          </div>
        </div>
      </div>
      
      <div class="absolute -right-20 -bottom-20 w-64 h-64 bg-white/10 rounded-full blur-[80px] group-hover:scale-110 transition-transform duration-700"></div>
    </div>

    
    <div class="bg-white dark:bg-slate-900 p-8 rounded-4xl shadow-sm border border-slate-100 dark:border-slate-800">
      <h4 class="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] mb-6">Résumé Technique</h4>
      <div class="space-y-6">
        <div class="flex gap-4">
          <div class="w-8 h-8 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-slate-400 text-lg">extension</span>
          </div>
          <div>
            <p class="text-xs font-bold text-slate-800 dark:text-slate-200">{dashboardStore.state.modules.length} Modules Détectés</p>
          </div>
        </div>
        <div class="flex gap-4">
          <div class="w-8 h-8 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-slate-400 text-lg">rss_feed</span>
          </div>
          <div>
            <p class="text-xs font-bold text-slate-800 dark:text-slate-200">{dashboardStore.state.feeds.length} Flux RSS Configurés</p>
          </div>
        </div>
      </div>
    </div>

    
    <div class="bg-red-50 dark:bg-red-900/10 p-8 rounded-4xl border border-red-100 dark:border-red-900/20">
      <h4 class="text-[10px] font-black text-red-600 dark:text-red-400 uppercase tracking-[0.2em] mb-4">Zone Critique</h4>
      <p class="text-xs text-red-600/70 dark:text-red-400/70 mb-6 leading-relaxed font-medium">Réinitialiser les paramètres globaux désactivera tous les modules actifs et supprimera les flux.</p>
      <button onclick={resetAndSaveFactory} class="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black transition-all shadow-lg shadow-red-600/20 active:scale-[0.98]">
        Réinitialisation d'usine (UI)
      </button>
    </div>
  </div>
</div>

