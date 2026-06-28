<script lang="ts">
import { onMount } from 'svelte';
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

let loading = $state(true);
let error = $state('');
let data: any = $state(null);
let analysis: any = $state(null);
let analysisLoading = $state(false);
let configDraft: any = $state(null);
let savingConfig = $state(false);
let activeTab = $state<'overview' | 'alerts' | 'config'>('overview');

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

<div class="channel-health">
  <div class="page-header">
    <div class="header-left">
      <Papicon name="activity" size={24} />
      <h1>Santé des Salons</h1>
      <span class="beta-badge">BETA</span>
    </div>
    <div class="header-actions">
      <button class="btn btn-secondary" onclick={runAnalysis} disabled={analysisLoading}>
        <Papicon name="refresh-cw" size={16} />
        {analysisLoading ? 'Analyse...' : 'Lancer une analyse'}
      </button>
    </div>
  </div>

  <div class="tabs">
    <button class="tab" class:active={activeTab === 'overview'} onclick={() => activeTab = 'overview'}>
      <Papicon name="pie-chart" size={16} /> Vue d'ensemble
    </button>
    <button class="tab" class:active={activeTab === 'alerts'} onclick={() => activeTab = 'alerts'}>
      <Papicon name="bell" size={16} /> Alertes
      {#if data?.pendingAlerts?.length > 0}
        <span class="badge">{data.pendingAlerts.length}</span>
      {/if}
    </button>
    <button class="tab" class:active={activeTab === 'config'} onclick={() => activeTab = 'config'}>
      <Papicon name="settings" size={16} /> Configuration
    </button>
  </div>

  {#if loading}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Chargement...</p>
    </div>
  {:else if error}
    <div class="error-state">
      <Papicon name="alert-circle" size={32} />
      <p>{error}</p>
      <button class="btn btn-primary" onclick={load}>Réessayer</button>
    </div>
  {:else}

    {#if activeTab === 'overview'}
      <div class="overview-grid">
        {#if !data?.config?.enabled}
          <div class="empty-state card">
            <Papicon name="activity" size={48} />
            <h3>Moniteur de santé désactivé</h3>
            <p>Activez le moniteur pour analyser automatiquement l'activité de vos salons et recevoir des recommandations.</p>
            <button class="btn btn-primary" onclick={() => { activeTab = 'config'; if (configDraft) configDraft.enabled = true; }}>
              Activer le moniteur
            </button>
          </div>
        {:else if analysis}
          <!-- Summary Cards -->
          <div class="summary-cards">
            {#each Object.entries(statusLabels) as [status, info]}
              {@const count = analysis[status.toLowerCase()]?.length ?? 0}
              <div class="summary-card" style="--accent: {info.color}">
                <div class="card-icon">
                  <Papicon name={info.icon} size={20} />
                </div>
                <div class="card-content">
                  <span class="card-value">{count}</span>
                  <span class="card-label">{info.label}</span>
                </div>
              </div>
            {/each}
          </div>

          <!-- Channel List -->
          <div class="card channels-list">
            <h3>Tous les salons analysés</h3>
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Salon</th>
                    <th>Statut</th>
                    <th>Msg/jour</th>
                    <th>Users</th>
                    <th>Total msgs</th>
                    <th>Tendance</th>
                    <th>Confiance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {#each analysis.channels ?? [] as ch}
                    {@const info = statusLabels[ch.status] ?? statusLabels.HEALTHY}
                    <tr>
                      <td class="channel-name">#{ch.channelName}</td>
                      <td>
                        <span class="status-badge" style="--color: {info.color}">{info.label}</span>
                      </td>
                      <td>{ch.avgMsgPerDay.toFixed(1)}</td>
                      <td>{ch.uniqueUsersAvg.toFixed(0)}</td>
                      <td>{ch.totalMessages.toLocaleString()}</td>
                      <td>
                        {#if ch.trend === 'UP'}↗️
                        {:else if ch.trend === 'DOWN'}↘️
                        {:else}➡️
                        {/if}
                      </td>
                      <td>{ch.confidence}%</td>
                      <td class="actions-cell">
                        {#if ch.status === 'OVERLOADED'}
                          <button class="btn btn-sm btn-warning" onclick={() => handleSplit(ch.channelId)}>Split</button>
                        {:else if ch.status === 'DEAD'}
                          <button class="btn btn-sm btn-secondary" onclick={() => handleArchive(ch.channelId)}>Archiver</button>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {:else}
          <div class="empty-state card">
            <Papicon name="bar-chart" size={48} />
            <h3>Aucune analyse disponible</h3>
            <p>Cliquez sur "Lancer une analyse" pour évaluer la santé de vos salons.</p>
          </div>
        {/if}
      </div>
    {/if}

    {#if activeTab === 'alerts'}
      <div class="alerts-section">
        {#if data?.pendingAlerts?.length === 0 && data?.history?.length === 0}
          <div class="empty-state card">
            <Papicon name="check-circle" size={48} />
            <h3>Aucune alerte</h3>
            <p>Tous vos salons sont en bonne santé. Les alertes apparaîtront ici lorsque des recommandations seront détectées.</p>
          </div>
        {:else}
          {#if data?.pendingAlerts?.length > 0}
            <h3 class="section-title">Alertes en attente ({data.pendingAlerts.length})</h3>
            <div class="alerts-grid">
              {#each data.pendingAlerts as alert}
                <div class="alert-card card">
                  <div class="alert-header">
                    <span class="alert-type">{alertTypeLabels[alert.type] ?? alert.type}</span>
                    <span class="confidence-badge">{alert.confidence}%</span>
                  </div>
                  <h4>#{alert.channelName ?? alert.channelId}</h4>
                  <p class="alert-reason">{alert.reason}</p>
                  <div class="alert-metrics">
                    <span>{alert.avgMsgPerDay?.toFixed(1)} msg/jour</span>
                    <span>{alert.uniqueUsersAvg?.toFixed(0)} users</span>
                    <span>{alert.analysisPeriod}j d'analyse</span>
                  </div>
                  <div class="alert-actions">
                    <button class="btn btn-sm btn-primary" onclick={() => handleResolve(alert.id, 'APPLIED')}>
                      Appliquer
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick={() => handleResolve(alert.id, 'DISMISSED')}>
                      Ignorer
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          {#if data?.history?.length > 0}
            <h3 class="section-title" style="margin-top: 2rem;">Historique</h3>
            <div class="table-wrapper card">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Salon</th>
                    <th>Type</th>
                    <th>Statut</th>
                    <th>Confiance</th>
                  </tr>
                </thead>
                <tbody>
                  {#each data.history as alert}
                    {@const statusInfo = alertStatusLabels[alert.status] ?? { label: alert.status, color: '#747f8d' }}
                    <tr>
                      <td>{new Date(alert.createdAt).toLocaleDateString('fr-FR')}</td>
                      <td>#{alert.channelName ?? alert.channelId}</td>
                      <td>{alertTypeLabels[alert.type] ?? alert.type}</td>
                      <td>
                        <span class="status-badge" style="--color: {statusInfo.color}">{statusInfo.label}</span>
                      </td>
                      <td>{alert.confidence}%</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        {/if}
      </div>
    {/if}

    {#if activeTab === 'config' && configDraft}
      <div class="config-section card">
        <h3>Configuration du moniteur</h3>

        <div class="config-grid">
          <div class="config-group">
            <label class="toggle-label">
              <input type="checkbox" bind:checked={configDraft.enabled} />
              <span>Moniteur activé</span>
            </label>
          </div>

          <div class="config-group">
            <label>Période d'analyse (jours)</label>
            <input type="number" bind:value={configDraft.analysisPeriodDays} min={7} max={90} />
          </div>

          <div class="config-group">
            <label>Mode surcharge (split)</label>
            <select bind:value={configDraft.splitMode}>
              <option value="NOTIFY">Notification seulement</option>
              <option value="AUTO">Automatique</option>
            </select>
          </div>

          <div class="config-group">
            <label>Mode inactivité (archivage)</label>
            <select bind:value={configDraft.archiveMode}>
              <option value="NOTIFY">Notification seulement</option>
              <option value="AUTO">Automatique</option>
            </select>
          </div>

          <hr class="divider" />

          <h4>Seuils de surcharge</h4>

          <div class="config-group">
            <label>Messages/heure (moyenne)</label>
            <input type="number" bind:value={configDraft.overloadMsgPerHour} min={10} />
          </div>

          <div class="config-group">
            <label>Utilisateurs uniques (moyenne)</label>
            <input type="number" bind:value={configDraft.overloadUniqueUsers} min={5} />
          </div>

          <hr class="divider" />

          <h4>Seuils de sous-utilisation</h4>

          <div class="config-group">
            <label>Messages/jour (max pour sous-utilisé)</label>
            <input type="number" bind:value={configDraft.underusedMsgPerDay} min={1} />
          </div>

          <div class="config-group">
            <label>Utilisateurs uniques (max)</label>
            <input type="number" bind:value={configDraft.underusedUniqueUsers} min={1} />
          </div>

          <div class="config-group">
            <label>Messages/semaine (max pour mort)</label>
            <input type="number" bind:value={configDraft.deadMsgPerWeek} min={0} />
          </div>

          <hr class="divider" />

          <h4>Digest hebdomadaire</h4>

          <div class="config-group">
            <label class="toggle-label">
              <input type="checkbox" bind:checked={configDraft.weeklyDigestEnabled} />
              <span>Rapport hebdomadaire activé</span>
            </label>
          </div>

          <div class="config-group">
            <label>Jour du rapport</label>
            <select bind:value={configDraft.weeklyDigestDay}>
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

        <div class="config-actions">
          <button class="btn btn-primary" onclick={saveConfig} disabled={savingConfig}>
            {savingConfig ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    {:else if activeTab === 'config' && !configDraft}
      <div class="config-section card">
        <h3>Configuration du moniteur</h3>
        <p>Le moniteur n'est pas encore configuré pour ce serveur.</p>
        <button class="btn btn-primary" onclick={() => { configDraft = { enabled: true, analysisPeriodDays: 14, splitMode: 'NOTIFY', archiveMode: 'NOTIFY', overloadMsgPerHour: 120, overloadUniqueUsers: 80, underusedMsgPerDay: 5, underusedUniqueUsers: 3, deadMsgPerWeek: 2, weeklyDigestEnabled: true, weeklyDigestDay: 1 }; }}>
          Initialiser la configuration
        </button>
      </div>
    {/if}

  {/if}
</div>

<style>
.channel-health {
  padding: 1.5rem;
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.header-left h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary, #fff);
  margin: 0;
}

.beta-badge {
  background: linear-gradient(135deg, #5865f2, #7289da);
  color: white;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  letter-spacing: 0.05em;
}

.tabs {
  display: flex;
  gap: 0.25rem;
  background: rgba(255,255,255,0.04);
  border-radius: 12px;
  padding: 4px;
  margin-bottom: 1.5rem;
}

.tab {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #b5bac1);
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.2s;
}

.tab:hover { background: rgba(255,255,255,0.06); }
.tab.active {
  background: rgba(88, 101, 242, 0.2);
  color: #5865f2;
}

.badge {
  background: #ed4245;
  color: white;
  font-size: 0.7rem;
  padding: 1px 6px;
  border-radius: 999px;
  font-weight: 700;
}

.card {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  padding: 1.5rem;
  backdrop-filter: blur(12px);
}

.empty-state {
  text-align: center;
  padding: 3rem 2rem;
  color: var(--text-secondary, #b5bac1);
}

.empty-state h3 {
  margin: 1rem 0 0.5rem;
  color: var(--text-primary, #fff);
}

.loading-state, .error-state {
  text-align: center;
  padding: 3rem;
  color: var(--text-secondary, #b5bac1);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(255,255,255,0.1);
  border-top-color: #5865f2;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin { to { transform: rotate(360deg); } }

.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.summary-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  border-left: 3px solid var(--accent);
}

.card-icon { color: var(--accent); }
.card-value { font-size: 1.5rem; font-weight: 700; color: var(--text-primary, #fff); display: block; }
.card-label { font-size: 0.8rem; color: var(--text-secondary, #b5bac1); }

.channels-list h3 {
  margin: 0 0 1rem;
  color: var(--text-primary, #fff);
}

.table-wrapper {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th, td {
  padding: 0.625rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  font-size: 0.85rem;
}

th {
  color: var(--text-secondary, #b5bac1);
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

td { color: var(--text-primary, #fff); }

.channel-name { font-weight: 600; }

.status-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: color-mix(in srgb, var(--color) 20%, transparent);
  color: var(--color);
}

.actions-cell { white-space: nowrap; }

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  transition: all 0.2s;
}

.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: #5865f2; color: white; }
.btn-primary:hover:not(:disabled) { background: #4752c4; }
.btn-secondary { background: rgba(255,255,255,0.08); color: var(--text-primary, #fff); }
.btn-secondary:hover:not(:disabled) { background: rgba(255,255,255,0.12); }
.btn-warning { background: #fee75c; color: #1e1e1e; }
.btn-sm { padding: 0.25rem 0.625rem; font-size: 0.75rem; }

.section-title {
  color: var(--text-primary, #fff);
  font-size: 1rem;
  margin-bottom: 1rem;
}

.alerts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1rem;
}

.alert-card {
  border-left: 3px solid #fee75c;
}

.alert-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.alert-type {
  font-size: 0.75rem;
  font-weight: 600;
  color: #fee75c;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.confidence-badge {
  background: rgba(88, 101, 242, 0.2);
  color: #5865f2;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
}

.alert-card h4 {
  margin: 0 0 0.5rem;
  color: var(--text-primary, #fff);
}

.alert-reason {
  color: var(--text-secondary, #b5bac1);
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
}

.alert-metrics {
  display: flex;
  gap: 1rem;
  font-size: 0.75rem;
  color: var(--text-secondary, #b5bac1);
  margin-bottom: 1rem;
}

.alert-actions {
  display: flex;
  gap: 0.5rem;
}

.config-section h3 {
  margin: 0 0 1.5rem;
  color: var(--text-primary, #fff);
}

.config-section h4 {
  margin: 1rem 0 0.75rem;
  color: var(--text-primary, #fff);
  font-size: 0.9rem;
}

.config-grid {
  display: grid;
  gap: 1rem;
}

.config-group label {
  display: block;
  font-size: 0.8rem;
  color: var(--text-secondary, #b5bac1);
  margin-bottom: 0.375rem;
}

.config-group input[type="number"],
.config-group select {
  width: 100%;
  max-width: 300px;
  padding: 0.5rem 0.75rem;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  color: var(--text-primary, #fff);
  font-size: 0.85rem;
}

.config-group select option {
  background: #2b2d31;
  color: #fff;
}

.toggle-label {
  display: flex !important;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
}

.toggle-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: #5865f2;
}

.toggle-label span {
  font-size: 0.875rem;
  color: var(--text-primary, #fff);
}

.divider {
  border: none;
  border-top: 1px solid rgba(255,255,255,0.06);
  margin: 0.5rem 0;
}

.config-actions {
  margin-top: 1.5rem;
  display: flex;
  justify-content: flex-end;
}
</style>
