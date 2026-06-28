<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchSeasonsData, createSeason, startSeason, endSeason } from '../lib/api';
  import { toast } from '../lib/stores/toast.svelte';
  import Papicon from '../lib/components/Papicon.svelte';

  let loading = $state(true);
  let data: any = $state(null);
  let showCreate = $state(false);
  let newSeason = $state({ name: '', startDate: '', endDate: '' });

  async function load() {
    loading = true;
    try {
      data = await fetchSeasonsData();
    } catch {
      toast.error('Erreur lors du chargement');
    } finally {
      loading = false;
    }
  }

  async function handleCreate() {
    if (!newSeason.name || !newSeason.startDate || !newSeason.endDate) {
      toast.error('Tous les champs sont requis');
      return;
    }
    try {
      await createSeason(newSeason);
      showCreate = false;
      newSeason = { name: '', startDate: '', endDate: '' };
      await load();
    } catch {
      toast.error('Erreur lors de la création');
    }
  }

  async function handleStart(seasonId: string) {
    try {
      await startSeason(seasonId);
      await load();
    } catch {
      toast.error('Erreur lors du demarrage');
    }
  }

  async function handleEnd(seasonId: string) {
    try {
      await endSeason(seasonId);
      await load();
    } catch {
      toast.error('Erreur lors de la cloture');
    }
  }

  function getStatusBadge(status: string) {
    const map: Record<string, { label: string; cls: string }> = {
      UPCOMING: { label: 'A venir', cls: 'badge-info' },
      ACTIVE: { label: 'En cours', cls: 'badge-success' },
      ENDED: { label: 'Terminee', cls: 'badge-warning' },
      ARCHIVED: { label: 'Archivee', cls: 'badge-muted' },
    };
    return map[status] ?? { label: status, cls: '' };
  }

  function getMedal(index: number): string {
    if (index === 0) return '\u{1F947}';
    if (index === 1) return '\u{1F948}';
    if (index === 2) return '\u{1F949}';
    return '';
  }

  onMount(load);
</script>

<div class="page-header">
  <div class="header-left">
    <h1><Papicon name="flag" size={24} /> Saisons de Leveling</h1>
    <p class="subtitle">Classements competitifs avec recompenses de fin de saison</p>
  </div>
  <button class="btn btn-primary" onclick={() => showCreate = !showCreate}>
    <Papicon name="plus" size={16} /> Nouvelle saison
  </button>
</div>

{#if showCreate}
  <div class="card create-form">
    <h3>Creer une saison</h3>
    <div class="form-grid">
      <div class="form-group">
        <label>Nom</label>
        <input type="text" bind:value={newSeason.name} placeholder="Saison 1 --- Ete 2026" />
      </div>
      <div class="form-group">
        <label>Date de debut</label>
        <input type="date" bind:value={newSeason.startDate} />
      </div>
      <div class="form-group">
        <label>Date de fin</label>
        <input type="date" bind:value={newSeason.endDate} />
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick={() => showCreate = false}>Annuler</button>
      <button class="btn btn-primary" onclick={handleCreate}>Creer</button>
    </div>
  </div>
{/if}

{#if loading}
  <div class="loading-container"><div class="spinner"></div></div>
{:else if data}
  {#if data.activeSeason}
    <div class="hero-season">
      <div class="hero-content">
        <div class="hero-top">
          <div class="hero-title-area">
            <h2 class="hero-name">{data.activeSeason.name}</h2>
            <span class="badge badge-success">En cours</span>
          </div>
          <p class="hero-dates">
            <Papicon name="calendar" size={14} />
            {new Date(data.activeSeason.startDate).toLocaleDateString('fr-FR')}
            ---
            {new Date(data.activeSeason.endDate).toLocaleDateString('fr-FR')}
          </p>
        </div>

        {#if data.activeLeaderboard.length > 0}
          <div class="leaderboard">
            <h4>
              <Papicon name="crown" size={16} />
              Classement actuel
            </h4>
            <div class="lb-entries">
              {#each data.activeLeaderboard as entry, i}
                {#if i < 3}
                  <div class="lb-row lb-top">
                    <span class="lb-medal">{getMedal(i)}</span>
                    <span class="lb-rank">#{entry.rank}</span>
                    <span class="lb-user">{entry.userId}</span>
                    <span class="lb-level">Niv. {entry.level}</span>
                    <span class="lb-xp">{entry.xp.toLocaleString()} XP</span>
                  </div>
                {:else}
                  <div class="lb-row">
                    <span class="lb-medal"></span>
                    <span class="lb-rank">#{entry.rank}</span>
                    <span class="lb-user">{entry.userId}</span>
                    <span class="lb-level">Niv. {entry.level}</span>
                    <span class="lb-xp">{entry.xp.toLocaleString()} XP</span>
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {/if}

        <div class="hero-actions">
          <button class="btn btn-danger" onclick={() => handleEnd(data.activeSeason.id)}>
            <Papicon name="x" size={14} />
            Terminer la saison
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if data.seasons.length > 0}
    <div class="section-header">
      <h3>Toutes les saisons</h3>
    </div>

    <div class="timeline">
      {#each data.seasons as season}
        <div class="timeline-item">
          <div class="timeline-dot" class:dot-active={season.status === 'ACTIVE'} class:dot-upcoming={season.status === 'UPCOMING'} class:dot-ended={season.status === 'ENDED'} class:dot-archived={season.status === 'ARCHIVED'}></div>
          <div class="season-card">
            <div class="season-card-top">
              <div class="season-card-info">
                <h4>#{season.number} --- {season.name}</h4>
                {#if season.status === 'ACTIVE'}
                  <span class="badge badge-success">{getStatusBadge(season.status).label}</span>
                {:else if season.status === 'UPCOMING'}
                  <span class="badge badge-info">{getStatusBadge(season.status).label}</span>
                {:else if season.status === 'ENDED'}
                  <span class="badge badge-warning">{getStatusBadge(season.status).label}</span>
                {:else}
                  <span class="badge badge-muted">{getStatusBadge(season.status).label}</span>
                {/if}
              </div>
            </div>
            <div class="season-card-meta">
              <span class="season-date-range">
                <Papicon name="calendar" size={13} />
                {new Date(season.startDate).toLocaleDateString('fr-FR')} --- {new Date(season.endDate).toLocaleDateString('fr-FR')}
              </span>
              <span class="season-participants">
                <Papicon name="users" size={13} />
                {season._count?.snapshots ?? 0} participants
              </span>
            </div>
            {#if season.status === 'UPCOMING'}
              <div class="season-card-actions">
                <button class="btn btn-sm btn-primary" onclick={() => handleStart(season.id)}>
                  <Papicon name="zap" size={13} />
                  Demarrer
                </button>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="empty-state">
      <Papicon name="flag" size={48} />
      <p>Aucune saison creee. Cliquez sur "Nouvelle saison" pour commencer.</p>
    </div>
  {/if}
{/if}

<style>
  .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; }
  .header-left h1 { display: flex; align-items: center; gap: 0.5rem; font-size: 1.5rem; margin: 0; }
  .subtitle { color: var(--color-text-muted); margin: 0.25rem 0 0; font-size: 0.875rem; }

  .card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem; }
  .card h3 { margin: 0 0 1rem; font-size: 0.95rem; }

  .create-form { margin-bottom: 1rem; }
  .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
  .form-group label { display: block; font-size: 0.8rem; color: var(--color-text-muted); margin-bottom: 0.25rem; }
  .form-group input { width: 100%; padding: 0.5rem; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-bg); color: var(--color-text); }
  .form-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }

  /* Hero active season */
  .hero-season {
    background: var(--color-surface);
    border: 2px solid transparent;
    border-radius: 14px;
    padding: 2px;
    margin-bottom: 1.5rem;
    background-image: linear-gradient(var(--color-surface), var(--color-surface)),
                       linear-gradient(135deg, var(--color-primary), var(--color-success), var(--color-primary));
    background-origin: border-box;
    background-clip: padding-box, border-box;
  }
  .hero-content { padding: 1.5rem; }
  .hero-top { margin-bottom: 1.25rem; }
  .hero-title-area { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.35rem; }
  .hero-name { margin: 0; font-size: 1.25rem; font-weight: 700; }
  .hero-dates { display: flex; align-items: center; gap: 0.4rem; color: var(--color-text-muted); font-size: 0.85rem; margin: 0; }
  .hero-actions { margin-top: 1rem; }

  /* Leaderboard */
  .leaderboard h4 { display: flex; align-items: center; gap: 0.4rem; margin: 0 0 0.75rem; font-size: 0.9rem; color: var(--color-text-secondary); }
  .lb-entries { display: flex; flex-direction: column; gap: 0.25rem; }
  .lb-row {
    display: grid; grid-template-columns: 28px 40px 1fr 80px 100px;
    align-items: center; padding: 0.5rem 0.6rem; border-radius: 8px; font-size: 0.85rem;
  }
  .lb-row:hover { background: var(--color-bg); }
  .lb-top { background: rgba(255, 255, 255, 0.03); }
  .lb-medal { font-size: 1.1rem; line-height: 1; }
  .lb-rank { font-weight: 600; color: var(--color-text-secondary); }
  .lb-user { font-family: monospace; font-size: 0.8rem; color: var(--color-text-muted); }
  .lb-level { color: var(--color-primary); font-weight: 500; }
  .lb-xp { text-align: right; color: var(--color-text-muted); }

  /* Section header */
  .section-header { margin-bottom: 1rem; }
  .section-header h3 { margin: 0; font-size: 1rem; color: var(--color-text-secondary); }

  /* Timeline */
  .timeline { position: relative; padding-left: 24px; }
  .timeline::before {
    content: ''; position: absolute; left: 7px; top: 0; bottom: 0;
    width: 2px; background: var(--color-border);
  }

  .timeline-item { position: relative; margin-bottom: 0.75rem; }
  .timeline-dot {
    position: absolute; left: -20px; top: 18px;
    width: 12px; height: 12px; border-radius: 50%;
    background: var(--color-border); border: 2px solid var(--color-bg);
    z-index: 1;
  }
  .dot-active { background: var(--color-success); }
  .dot-upcoming { background: var(--color-primary); }
  .dot-ended { background: var(--color-warning); }
  .dot-archived { background: var(--color-text-muted); }

  .season-card {
    background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 12px;
    padding: 1rem 1.25rem;
  }
  .season-card:hover { border-color: var(--color-primary); }

  .season-card-top { display: flex; justify-content: space-between; align-items: center; }
  .season-card-info { display: flex; align-items: center; gap: 0.75rem; }
  .season-card-info h4 { margin: 0; font-size: 0.95rem; font-weight: 600; }

  .season-card-meta { display: flex; gap: 1.5rem; margin-top: 0.5rem; flex-wrap: wrap; }
  .season-date-range, .season-participants { display: flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; color: var(--color-text-muted); }

  .season-card-actions { margin-top: 0.75rem; }

  .badge { padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600; }
  .badge-success { background: rgba(87, 242, 135, 0.15); color: var(--color-success); }
  .badge-info { background: rgba(88, 101, 242, 0.15); color: var(--color-primary); }
  .badge-warning { background: rgba(254, 231, 92, 0.15); color: var(--color-warning); }
  .badge-muted { background: var(--color-border); color: var(--color-text-muted); }

  .loading-container, .empty-state { display: flex; flex-direction: column; align-items: center; padding: 4rem; color: var(--color-text-muted); gap: 1rem; }

  @media (max-width: 768px) {
    .lb-row { grid-template-columns: 28px 36px 1fr 60px 80px; font-size: 0.8rem; }
    .season-card-meta { flex-direction: column; gap: 0.35rem; }
    .hero-title-area { flex-wrap: wrap; }
  }
</style>
