<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchEvaluations, generateEvaluation } from '../lib/api';
  import { toast } from '../lib/stores/toast.svelte';
  import Papicon from '../lib/components/Papicon.svelte';

  let loading = $state(true);
  let generating = $state(false);
  let data: any = $state(null);

  async function load() {
    loading = true;
    try {
      data = await fetchEvaluations();
    } catch {
      toast.error('Erreur lors du chargement');
    } finally {
      loading = false;
    }
  }

  async function handleGenerateAll() {
    generating = true;
    try {
      const result = await generateEvaluation(undefined, 30);
      toast.success(`${result.count} évaluations générées`);
      await load();
    } catch {
      toast.error('Erreur lors de la génération');
    } finally {
      generating = false;
    }
  }

  function getScoreColor(score: number): string {
    if (score >= 80) return 'var(--color-success)';
    if (score >= 60) return 'var(--color-primary)';
    if (score >= 40) return 'var(--color-warning)';
    return 'var(--color-danger)';
  }

  function getTrendIcon(trend: string): string {
    if (trend === 'UP') return 'trending-up';
    if (trend === 'DOWN') return 'trending-down';
    return 'minus';
  }

  onMount(load);
</script>

<div class="page-header">
  <div class="header-left">
    <h1><Papicon name="award" size={24} /> Évaluations Staff</h1>
    <p class="subtitle">Rapports de performance automatisés</p>
  </div>
  <button class="btn btn-primary" onclick={handleGenerateAll} disabled={generating}>
    <Papicon name="zap" size={16} /> {generating ? 'Génération...' : 'Générer toutes'}
  </button>
</div>

{#if loading}
  <div class="loading-container"><div class="spinner"></div></div>
{:else if data}
  {#if data.averageScore > 0}
    <div class="card overview-card">
      <div class="overview-grid">
        <div class="overview-item">
          <span class="overview-value" style="color: {getScoreColor(data.averageScore)}">{data.averageScore}</span>
          <span class="overview-label">Score moyen</span>
        </div>
        <div class="overview-item">
          <span class="overview-value">{data.latestByStaff.length}</span>
          <span class="overview-label">Staff évalués</span>
        </div>
        <div class="overview-item">
          <span class="overview-value">{data.evaluations.length}</span>
          <span class="overview-label">Évaluations totales</span>
        </div>
      </div>
    </div>
  {/if}

  {#if data.latestByStaff.length > 0}
    <div class="card evals-card">
      <h3>Dernières évaluations par staff</h3>
      <div class="evals-table">
        <div class="table-header">
          <span>Staff</span>
          <span>Activité</span>
          <span>Modération</span>
          <span>Présence</span>
          <span>Global</span>
          <span>Tendance</span>
          <span>Période</span>
        </div>
        {#each data.latestByStaff as ev}
          <div class="table-row">
            <span class="staff-id">{ev.staffUserId}</span>
            <span style="color: {getScoreColor(ev.activityScore)}">{ev.activityScore}</span>
            <span style="color: {getScoreColor(ev.moderationScore)}">{ev.moderationScore}</span>
            <span style="color: {getScoreColor(ev.presenceScore)}">{ev.presenceScore}</span>
            <span class="overall" style="color: {getScoreColor(ev.overallScore)}">{ev.overallScore}</span>
            <span class="trend" class:trend-up={ev.trend === 'UP'} class:trend-down={ev.trend === 'DOWN'}>
              <Papicon name={getTrendIcon(ev.trend)} size={14} />
              {ev.trendDelta > 0 ? '+' : ''}{ev.trendDelta}
            </span>
            <span class="period">{new Date(ev.periodStart).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} — {new Date(ev.periodEnd).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="empty-state">
      <Papicon name="award" size={48} />
      <p>Aucune évaluation générée. Cliquez sur "Générer toutes" pour créer les premières évaluations.</p>
    </div>
  {/if}

  {#if data.evaluations.length > data.latestByStaff.length}
    <div class="card history-card">
      <h3>Historique complet</h3>
      <div class="history-list">
        {#each data.evaluations as ev}
          <div class="history-row">
            <span class="staff-id">{ev.staffUserId}</span>
            <span class="score" style="color: {getScoreColor(ev.overallScore)}">{ev.overallScore}/100</span>
            <span class="details">
              {ev.totalMessages} msg, {Math.round(ev.totalVoiceMinutes / 60)}h vocal, {ev.sanctionsHandled} sanctions, {ev.ticketsResolved} tickets
            </span>
            <span class="date">{new Date(ev.createdAt).toLocaleDateString('fr-FR')}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
{/if}

<style>
  .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; }
  .header-left h1 { display: flex; align-items: center; gap: 0.5rem; font-size: 1.5rem; margin: 0; }
  .subtitle { color: var(--color-text-muted); margin: 0.25rem 0 0; font-size: 0.875rem; }

  .card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem; }
  .card h3 { margin: 0 0 1rem; font-size: 0.95rem; color: var(--color-text-secondary); }

  .overview-card { margin-bottom: 1rem; }
  .overview-grid { display: flex; gap: 2rem; justify-content: center; }
  .overview-item { display: flex; flex-direction: column; align-items: center; }
  .overview-value { font-size: 2rem; font-weight: 700; }
  .overview-label { font-size: 0.8rem; color: var(--color-text-muted); }

  .table-header, .table-row { display: grid; grid-template-columns: 1fr 70px 80px 70px 60px 80px 120px; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.85rem; }
  .table-header { font-weight: 600; color: var(--color-text-muted); font-size: 0.8rem; border-bottom: 1px solid var(--color-border); }
  .table-row { border-bottom: 1px solid var(--color-border); }
  .table-row:last-child { border-bottom: none; }
  .table-row:hover { background: var(--color-bg); border-radius: 6px; }
  .staff-id { font-family: monospace; font-size: 0.8rem; }
  .overall { font-weight: 700; }

  .trend { display: flex; align-items: center; gap: 0.25rem; }
  .trend-up { color: var(--color-success); }
  .trend-down { color: var(--color-danger); }
  .period { font-size: 0.8rem; color: var(--color-text-muted); }

  .history-list { display: flex; flex-direction: column; gap: 0.25rem; }
  .history-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.4rem 0; font-size: 0.85rem; border-bottom: 1px solid var(--color-border); }
  .history-row:last-child { border-bottom: none; }
  .score { font-weight: 600; }
  .details { flex: 1; color: var(--color-text-muted); font-size: 0.8rem; }
  .date { color: var(--color-text-muted); font-size: 0.8rem; }

  .loading-container, .empty-state { display: flex; flex-direction: column; align-items: center; padding: 4rem; color: var(--color-text-muted); gap: 1rem; }
</style>
