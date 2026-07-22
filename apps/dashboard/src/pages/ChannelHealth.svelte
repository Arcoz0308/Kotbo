<script lang="ts">
import { onMount } from 'svelte';
import { router } from 'tinro';
import { resolveTabFromUrl, gotoTab } from '../lib/tabRouting';
import { authStore } from '../lib/stores/auth.svelte';
import Papicon from '../lib/components/Papicon.svelte';
import {
  fetchChannelHealth,
  fetchChannelHealthAnalysis,
  updateChannelHealthConfig,
  resolveChannelHealthAlert,
  splitChannel,
  archiveChannel,
} from '../lib/api';
import { toast } from '../lib/stores/toast.svelte';
import ModulePage from '../lib/components/ModulePage.svelte';

let loading = $state(true);
let error = $state('');
let data: any = $state(null);
let analysis: any = $state(null);
let analysisLoading = $state(false);
let configDraft: any = $state(null);
let savingConfig = $state(false);
const healthTabs = ['overview', 'alerts', 'config'] as const;
let activeTab = $state<'overview' | 'alerts' | 'config'>('overview');

$effect(() => {
  const _path = $router.path;
  activeTab = resolveTabFromUrl('/channel-health', healthTabs, 'overview') as typeof activeTab;
});

const statusLabels: Record<string, { label: string; color: string; icon: string }> = {
  HEALTHY:    { label: 'Sain',          color: '#57f287', icon: 'check-circle' },
  OVERLOADED: { label: 'Surchargé',     color: '#ed4245', icon: 'alert-triangle' },
  UNDERUSED:  { label: 'Sous-utilisé',  color: '#fee75c', icon: 'alert-circle' },
  DEAD:       { label: 'Mort',          color: '#747f8d', icon: 'x-circle' },
};

const alertTypeLabels: Record<string, string> = {
  SPLIT_SUGGESTED: 'Split suggéré',
  SPLIT_AUTO: 'Split automatique',
  ARCHIVE_SUGGESTED: 'Archivage suggéré',
  ARCHIVE_AUTO: 'Archivage automatique',
  MERGE_SUGGESTED: 'Fusion suggérée',
};

const alertStatusLabels: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'En attente', color: '#fee75c' },
  APPLIED: { label: 'Appliqué', color: '#57f287' },
  DISMISSED: { label: 'Ignoré', color: '#747f8d' },
  EXPIRED: { label: 'Expiré', color: '#747f8d' },
};

async function load() {
  loading = true;
  error = '';
  try {
    data = await fetchChannelHealth();
    if (data?.config) {
      configDraft = { ...data.config };
    }
  } catch (e: any) {
    error = e.message || 'Erreur lors du chargement';
  } finally {
    loading = false;
  }
}

async function runAnalysis() {
  analysisLoading = true;
  try {
    analysis = await fetchChannelHealthAnalysis();
  } catch (e: any) {
    toast.error(e.message || "Erreur lors de l'analyse");
  } finally {
    analysisLoading = false;
  }
}

async function saveConfig() {
  if (!configDraft) return;
  savingConfig = true;
  try {
    const result = await updateChannelHealthConfig(configDraft);
    if (result) {
      toast.success('Configuration sauvegardée');
      data.config = result;
    }
  } catch (e: any) {
    toast.error(e.message || 'Erreur lors de la sauvegarde');
  } finally {
    savingConfig = false;
  }
}

async function handleResolve(alertId: string, action: 'APPLIED' | 'DISMISSED') {
  try {
    await resolveChannelHealthAlert(alertId, action);
    toast.success(action === 'APPLIED' ? 'Alerte appliquée' : 'Alerte ignorée');
    await load();
  } catch (e: any) {
    toast.error(e.message || 'Erreur');
  }
}

async function handleSplit(channelId: string) {
  try {
    const result = await splitChannel(channelId);
    if (result?.ok) {
      toast.success('Salon créé avec succès');
      await load();
    }
  } catch (e: any) {
    toast.error(e.message || 'Erreur lors du split');
  }
}

async function handleArchive(channelId: string) {
  try {
    const result = await archiveChannel(channelId);
    if (result?.ok) {
      toast.success('Salon archivé avec succès');
      await load();
    }
  } catch (e: any) {
    toast.error(e.message || "Erreur lors de l'archivage");
  }
}

onMount(load);
</script>

<ModulePage
  title="Santé des Salons"
  description="Analyse automatique de l'activité et alertes sur vos salons."
  icon="activity"
  featureKey="channel_health"
>
  {#snippet actions()}
    <button
      class="px-4 py-2 bg-surface-container-high/40 text-on-surface-variant rounded-xl text-xs font-bold hover:bg-surface-container-high/60 transition-all flex items-center gap-2"
      onclick={runAnalysis}
      disabled={analysisLoading}
    >
      <Papicon icon="refresh-cw" size={16} />
      {analysisLoading ? 'Analyse…' : 'Lancer une analyse'}
    </button>
  {/snippet}

<!-- ======================== TABS ======================== -->
<div class="tab-group w-fit mb-6">
  <button
    class="tab-button {activeTab === 'overview' ? 'active' : ''}"
    onclick={() => gotoTab('/channel-health', 'overview', 'overview')}
  >
    <Papicon icon="pie-chart" size={15} /> Vue d'ensemble
  </button>
  <button
    class="tab-button {activeTab === 'alerts' ? 'active' : ''}"
    onclick={() => gotoTab('/channel-health', 'alerts', 'overview')}
  >
    <Papicon icon="bell" size={15} /> Alertes
    {#if data?.pendingAlerts?.length > 0}
      <span class="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full leading-none">{data.pendingAlerts.length}</span>
    {/if}
  </button>
  <button
    class="tab-button {activeTab === 'config' ? 'active' : ''}"
    onclick={() => gotoTab('/channel-health', 'config', 'overview')}
  >
    <Papicon icon="settings" size={15} /> Configuration
  </button>
</div>

<!-- ======================== CONTENT ======================== -->
{#if loading}
  <div class="flex flex-col items-center justify-center py-16 text-on-surface-variant/50 gap-4">
    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    <p class="text-sm">Chargement...</p>
  </div>
{:else if error}
  <div class="flex flex-col items-center justify-center py-16 text-on-surface-variant/50 gap-4">
    <Papicon icon="alert-circle" size={32} />
    <p class="text-sm">{error}</p>
    <button class="px-4 py-2 bg-primary text-on-primary text-[13px] font-medium rounded-xl shadow-sm active:scale-[0.98] transition-all flex items-center gap-2" onclick={load}>Réessayer</button>
  </div>
{:else}

  <!-- ==================== TAB: OVERVIEW ==================== -->
  {#if activeTab === 'overview'}
    {#if !data?.config?.enabled}
      <!-- Disabled state -->
      <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-10 flex flex-col items-center justify-center text-center gap-4">
        <Papicon icon="activity" size={48} />
        <h3 class="text-base font-semibold text-on-surface">Moniteur de santé désactivé</h3>
        <p class="text-sm text-on-surface-variant/60 max-w-md">Activez le moniteur pour analyser automatiquement l'activité de vos salons et recevoir des recommandations.</p>
        <button
          class="px-4 py-2 bg-primary text-on-primary text-[13px] font-medium rounded-xl shadow-sm active:scale-[0.98] transition-all flex items-center gap-2"
          onclick={() => { gotoTab('/channel-health', 'config', 'overview'); if (configDraft) configDraft.enabled = true; }}
        >
          Activer le moniteur
        </button>
      </div>
    {:else if analysis}
      <!-- Summary Cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {#each Object.entries(statusLabels) as [status, info]}
          {@const count = analysis[status.toLowerCase()]?.length ?? 0}
          <div class="flex items-center gap-4 p-4 bg-surface-container-low/30 border border-outline-variant/10 rounded-xl" style="border-left: 3px solid {info.color}">
            <div style="color: {info.color}">
              <Papicon icon={info.icon} size={20} />
            </div>
            <div>
              <span class="text-2xl font-bold text-on-surface block">{count}</span>
              <span class="text-xs font-medium text-on-surface-variant/60">{info.label}</span>
            </div>
          </div>
        {/each}
      </div>

      <!-- Channel List -->
      <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-6 space-y-4">
        <h3 class="text-base font-semibold flex items-center gap-2.5">
          <Papicon icon="hash" size={18} />
          Tous les salons analysés
        </h3>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-outline-variant/10">
                <th class="px-3 py-2.5 text-left text-xs font-medium text-on-surface-variant/60">Salon</th>
                <th class="px-3 py-2.5 text-left text-xs font-medium text-on-surface-variant/60">Statut</th>
                <th class="px-3 py-2.5 text-left text-xs font-medium text-on-surface-variant/60">Msg/jour</th>
                <th class="px-3 py-2.5 text-left text-xs font-medium text-on-surface-variant/60">Users</th>
                <th class="px-3 py-2.5 text-left text-xs font-medium text-on-surface-variant/60">Total msgs</th>
                <th class="px-3 py-2.5 text-left text-xs font-medium text-on-surface-variant/60">Tendance</th>
                <th class="px-3 py-2.5 text-left text-xs font-medium text-on-surface-variant/60">Confiance</th>
                <th class="px-3 py-2.5 text-left text-xs font-medium text-on-surface-variant/60">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each analysis.channels ?? [] as ch}
                {@const info = statusLabels[ch.status] ?? statusLabels.HEALTHY}
                <tr class="border-b border-outline-variant/5 hover:bg-surface-container-high/10 transition-colors">
                  <td class="px-3 py-2.5 text-sm font-semibold">#{ch.channelName}</td>
                  <td class="px-3 py-2.5 text-sm">
                    <span class="px-2.5 py-0.5 rounded-full text-xs font-medium" style="background: color-mix(in srgb, {info.color} 15%, transparent); color: {info.color}">{info.label}</span>
                  </td>
                  <td class="px-3 py-2.5 text-sm">{ch.avgMsgPerDay.toFixed(1)}</td>
                  <td class="px-3 py-2.5 text-sm">{ch.uniqueUsersAvg.toFixed(0)}</td>
                  <td class="px-3 py-2.5 text-sm">{ch.totalMessages.toLocaleString()}</td>
                  <td class="px-3 py-2.5 text-sm">
                    {#if ch.trend === 'UP'}↗️
                    {:else if ch.trend === 'DOWN'}↘️
                    {:else}➡️
                    {/if}
                  </td>
                  <td class="px-3 py-2.5 text-sm">{ch.confidence}%</td>
                  <td class="px-3 py-2.5 text-sm whitespace-nowrap">
                    {#if ch.status === 'OVERLOADED'}
                      <button class="px-3 py-1.5 bg-amber-500/10 text-amber-500 rounded-lg text-xs font-bold hover:bg-amber-500/20 transition-all" onclick={() => handleSplit(ch.channelId)}>Split</button>
                    {:else if ch.status === 'DEAD'}
                      <button class="px-3 py-1.5 bg-surface-container-high/40 text-on-surface-variant rounded-lg text-xs font-bold hover:bg-surface-container-high/60 transition-all" onclick={() => handleArchive(ch.channelId)}>Archiver</button>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {:else}
      <!-- No analysis yet -->
      <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-10 flex flex-col items-center justify-center text-center gap-4">
        <Papicon icon="bar-chart" size={48} />
        <h3 class="text-base font-semibold text-on-surface">Aucune analyse disponible</h3>
        <p class="text-sm text-on-surface-variant/60 max-w-md">Cliquez sur "Lancer une analyse" pour évaluer la santé de vos salons.</p>
      </div>
    {/if}
  {/if}

  <!-- ==================== TAB: ALERTS ==================== -->
  {#if activeTab === 'alerts'}
    {#if data?.pendingAlerts?.length === 0 && data?.history?.length === 0}
      <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-10 flex flex-col items-center justify-center text-center gap-4">
        <Papicon icon="check-circle" size={48} />
        <h3 class="text-base font-semibold text-on-surface">Aucune alerte</h3>
        <p class="text-sm text-on-surface-variant/60 max-w-md">Tous vos salons sont en bonne santé. Les alertes apparaîtront ici lorsque des recommandations seront détectées.</p>
      </div>
    {:else}
      {#if data?.pendingAlerts?.length > 0}
        <h3 class="text-base font-semibold flex items-center gap-2.5 mb-4">
          <Papicon icon="bell" size={18} />
          Alertes en attente ({data.pendingAlerts.length})
        </h3>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {#each data.pendingAlerts as alert}
            <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-5 space-y-3 border-l-[3px]" style="border-left-color: #fee75c">
              <div class="flex justify-between items-center">
                <span class="text-xs font-medium text-amber-400">{alertTypeLabels[alert.type] ?? alert.type}</span>
                <span class="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary">{alert.confidence}%</span>
              </div>
              <h4 class="text-sm font-semibold text-on-surface">#{alert.channelName ?? alert.channelId}</h4>
              <p class="text-xs text-on-surface-variant/60">{alert.reason}</p>
              <div class="flex gap-4 text-xs font-medium text-on-surface-variant/60">
                <span>{alert.avgMsgPerDay?.toFixed(1)} msg/jour</span>
                <span>{alert.uniqueUsersAvg?.toFixed(0)} users</span>
                <span>{alert.analysisPeriod}j d'analyse</span>
              </div>
              <div class="flex gap-2 pt-1">
                <button class="px-4 py-2 bg-primary text-on-primary text-[13px] font-medium rounded-xl shadow-sm active:scale-[0.98] transition-all flex items-center gap-2" onclick={() => handleResolve(alert.id, 'APPLIED')}>
                  Appliquer
                </button>
                <button class="px-4 py-2 bg-surface-container-high/40 text-on-surface-variant rounded-xl text-xs font-bold hover:bg-surface-container-high/60 transition-all flex items-center gap-2" onclick={() => handleResolve(alert.id, 'DISMISSED')}>
                  Ignorer
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      {#if data?.history?.length > 0}
        <h3 class="text-base font-semibold flex items-center gap-2.5 mb-4 mt-8">
          <Papicon icon="clock" size={18} />
          Historique
        </h3>
        <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-6">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b border-outline-variant/10">
                  <th class="px-3 py-2.5 text-left text-xs font-medium text-on-surface-variant/60">Date</th>
                  <th class="px-3 py-2.5 text-left text-xs font-medium text-on-surface-variant/60">Salon</th>
                  <th class="px-3 py-2.5 text-left text-xs font-medium text-on-surface-variant/60">Type</th>
                  <th class="px-3 py-2.5 text-left text-xs font-medium text-on-surface-variant/60">Statut</th>
                  <th class="px-3 py-2.5 text-left text-xs font-medium text-on-surface-variant/60">Confiance</th>
                </tr>
              </thead>
              <tbody>
                {#each data.history as alert}
                  {@const statusInfo = alertStatusLabels[alert.status] ?? { label: alert.status, color: '#747f8d' }}
                  <tr class="border-b border-outline-variant/5 hover:bg-surface-container-high/10 transition-colors">
                    <td class="px-3 py-2.5 text-sm">{new Date(alert.createdAt).toLocaleDateString('fr-FR')}</td>
                    <td class="px-3 py-2.5 text-sm">#{alert.channelName ?? alert.channelId}</td>
                    <td class="px-3 py-2.5 text-sm">{alertTypeLabels[alert.type] ?? alert.type}</td>
                    <td class="px-3 py-2.5 text-sm">
                      <span class="px-2.5 py-0.5 rounded-full text-xs font-medium" style="background: color-mix(in srgb, {statusInfo.color} 15%, transparent); color: {statusInfo.color}">{statusInfo.label}</span>
                    </td>
                    <td class="px-3 py-2.5 text-sm">{alert.confidence}%</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}
    {/if}
  {/if}

  <!-- ==================== TAB: CONFIG ==================== -->
  {#if activeTab === 'config' && configDraft}
    <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-6 space-y-6">
      <h3 class="text-base font-semibold flex items-center gap-2.5">
        <Papicon icon="settings" size={18} />
        Configuration du moniteur
      </h3>

      <div class="space-y-5">
        <!-- General -->
        <label class="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" class="w-[18px] h-[18px] accent-primary" bind:checked={configDraft.enabled} />
          <span class="text-sm text-on-surface">Moniteur activé</span>
        </label>

        <div class="space-y-1.5">
          <label for="analysis-period" class="field-label">Période d'analyse (jours)</label>
          <input id="analysis-period" type="number" class="w-full max-w-[300px] px-3 py-2 bg-surface-container-high/30 border border-outline-variant/10 rounded-lg text-on-surface text-sm focus:border-primary focus:outline-none" bind:value={configDraft.analysisPeriodDays} min={7} max={90} />
        </div>

        <div class="space-y-1.5">
          <label for="split-mode" class="field-label">Mode surcharge (split)</label>
          <select id="split-mode" class="w-full max-w-[300px] px-3 py-2 bg-surface-container-high/30 border border-outline-variant/10 rounded-lg text-on-surface text-sm" bind:value={configDraft.splitMode}>
            <option value="NOTIFY">Notification seulement</option>
            <option value="AUTO">Automatique</option>
          </select>
        </div>

        <div class="space-y-1.5">
          <label for="archive-mode" class="field-label">Mode inactivité (archivage)</label>
          <select id="archive-mode" class="w-full max-w-[300px] px-3 py-2 bg-surface-container-high/30 border border-outline-variant/10 rounded-lg text-on-surface text-sm" bind:value={configDraft.archiveMode}>
            <option value="NOTIFY">Notification seulement</option>
            <option value="AUTO">Automatique</option>
          </select>
        </div>

        <!-- Divider: Overload thresholds -->
        <hr class="border-outline-variant/10" />

        <h4 class="text-sm font-semibold text-on-surface flex items-center gap-2">
          <Papicon icon="alert-triangle" size={16} />
          Seuils de surcharge
        </h4>

        <div class="space-y-1.5">
          <label for="overload-msg-hour" class="field-label">Messages/heure (moyenne)</label>
          <input id="overload-msg-hour" type="number" class="w-full max-w-[300px] px-3 py-2 bg-surface-container-high/30 border border-outline-variant/10 rounded-lg text-on-surface text-sm focus:border-primary focus:outline-none" bind:value={configDraft.overloadMsgPerHour} min={10} />
        </div>

        <div class="space-y-1.5">
          <label for="overload-unique-users" class="field-label">Utilisateurs uniques (moyenne)</label>
          <input id="overload-unique-users" type="number" class="w-full max-w-[300px] px-3 py-2 bg-surface-container-high/30 border border-outline-variant/10 rounded-lg text-on-surface text-sm focus:border-primary focus:outline-none" bind:value={configDraft.overloadUniqueUsers} min={5} />
        </div>

        <!-- Divider: Underuse thresholds -->
        <hr class="border-outline-variant/10" />

        <h4 class="text-sm font-semibold text-on-surface flex items-center gap-2">
          <Papicon icon="alert-circle" size={16} />
          Seuils de sous-utilisation
        </h4>

        <div class="space-y-1.5">
          <label for="underused-msg-day" class="field-label">Messages/jour (max pour sous-utilisé)</label>
          <input id="underused-msg-day" type="number" class="w-full max-w-[300px] px-3 py-2 bg-surface-container-high/30 border border-outline-variant/10 rounded-lg text-on-surface text-sm focus:border-primary focus:outline-none" bind:value={configDraft.underusedMsgPerDay} min={1} />
        </div>

        <div class="space-y-1.5">
          <label for="underused-unique-users" class="field-label">Utilisateurs uniques (max)</label>
          <input id="underused-unique-users" type="number" class="w-full max-w-[300px] px-3 py-2 bg-surface-container-high/30 border border-outline-variant/10 rounded-lg text-on-surface text-sm focus:border-primary focus:outline-none" bind:value={configDraft.underusedUniqueUsers} min={1} />
        </div>

        <div class="space-y-1.5">
          <label for="dead-msg-week" class="field-label">Messages/semaine (max pour mort)</label>
          <input id="dead-msg-week" type="number" class="w-full max-w-[300px] px-3 py-2 bg-surface-container-high/30 border border-outline-variant/10 rounded-lg text-on-surface text-sm focus:border-primary focus:outline-none" bind:value={configDraft.deadMsgPerWeek} min={0} />
        </div>

        <!-- Divider: Weekly digest -->
        <hr class="border-outline-variant/10" />

        <h4 class="text-sm font-semibold text-on-surface flex items-center gap-2">
          <Papicon icon="mail" size={16} />
          Digest hebdomadaire
        </h4>

        <label class="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" class="w-[18px] h-[18px] accent-primary" bind:checked={configDraft.weeklyDigestEnabled} />
          <span class="text-sm text-on-surface">Rapport hebdomadaire activé</span>
        </label>

        <div class="space-y-1.5">
          <label for="weekly-digest-day" class="field-label">Jour du rapport</label>
          <select id="weekly-digest-day" class="w-full max-w-[300px] px-3 py-2 bg-surface-container-high/30 border border-outline-variant/10 rounded-lg text-on-surface text-sm" bind:value={configDraft.weeklyDigestDay}>
            <option value={0}>Dimanche</option>
            <option value={1}>Lundi</option>
            <option value={2}>Mardi</option>
            <option value={3}>Mercredi</option>
            <option value={4}>Jeudi</option>
            <option value={5}>Vendredi</option>
            <option value={6}>Samedi</option>
          </select>
        </div>
      </div>

      <div class="flex justify-end pt-2">
        <button class="px-4 py-2 bg-primary text-on-primary text-[13px] font-medium rounded-xl shadow-sm active:scale-[0.98] transition-all flex items-center gap-2" onclick={saveConfig} disabled={savingConfig}>
          {savingConfig ? 'Sauvegarde...' : 'Sauvegarder'}
        </button>
      </div>
    </div>
  {:else if activeTab === 'config' && !configDraft}
    <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-6 space-y-4">
      <h3 class="text-base font-semibold flex items-center gap-2.5">
        <Papicon icon="settings" size={18} />
        Configuration du moniteur
      </h3>
      <p class="text-sm text-on-surface-variant/60">Le moniteur n'est pas encore configuré pour ce serveur.</p>
      <button
        class="px-4 py-2 bg-primary text-on-primary text-[13px] font-medium rounded-xl shadow-sm active:scale-[0.98] transition-all flex items-center gap-2"
        onclick={() => { configDraft = { enabled: true, analysisPeriodDays: 14, splitMode: 'NOTIFY', archiveMode: 'NOTIFY', overloadMsgPerHour: 120, overloadUniqueUsers: 80, underusedMsgPerDay: 5, underusedUniqueUsers: 3, deadMsgPerWeek: 2, weeklyDigestEnabled: true, weeklyDigestDay: 1 }; }}
      >
        Initialiser la configuration
      </button>
    </div>
  {/if}

{/if}
</ModulePage>
