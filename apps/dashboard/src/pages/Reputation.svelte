<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchReputationData } from '../lib/api';
  import { toast } from '../lib/stores/toast.svelte';
  import Papicon from '../lib/components/Papicon.svelte';

  let loading = $state(true);
  let data: any = $state(null);

  let totalRepGiven = $derived(
    data?.recentVotes?.length ?? 0
  );

  function getMedal(index: number): string {
    if (index === 0) return '\u{1F947}';
    if (index === 1) return '\u{1F948}';
    if (index === 2) return '\u{1F949}';
    return '';
  }

  async function load() {
    loading = true;
    try {
      data = await fetchReputationData();
    } catch {
      toast.error('Erreur lors du chargement');
    } finally {
      loading = false;
    }
  }

  onMount(load);
</script>

<div class="page-header">
  <h1><Papicon name="star" size={24} /> Reputation</h1>
  <p class="subtitle">Reconnaissance communautaire par les pairs</p>
</div>

{#if loading}
  <div class="loading-container"><div class="spinner"></div></div>
{:else if data}
  <div class="stats-bar">
    <div class="stat stat-primary">
      <div class="stat-icon" style="color: var(--color-primary)">
        <Papicon name="heart" size={20} />
      </div>
      <div class="stat-content">
        <span class="stat-value">{data.totalVotes}</span>
        <span class="stat-label">Total de votes</span>
      </div>
    </div>
    <div class="stat stat-success">
      <div class="stat-icon" style="color: var(--color-success)">
        <Papicon name="users" size={20} />
      </div>
      <div class="stat-content">
        <span class="stat-value">{data.leaderboard.totalVoters}</span>
        <span class="stat-label">Votants uniques</span>
      </div>
    </div>
    <div class="stat stat-warning">
      <div class="stat-icon" style="color: var(--color-warning)">
        <Papicon name="star" size={20} />
      </div>
      <div class="stat-content">
        <span class="stat-value">{totalRepGiven}</span>
        <span class="stat-label">Total rep donne</span>
      </div>
    </div>
  </div>

  <div class="rep-grid">
    <div class="card leaderboard-card">
      <h3>
        <Papicon name="crown" size={16} />
        Classement Reputation
      </h3>
      {#if data.leaderboard.entries.length === 0}
        <div class="empty-state">
          <Papicon name="star" size={36} />
          <p>Aucun vote pour le moment.</p>
        </div>
      {:else}
        <div class="leaderboard">
          {#each data.leaderboard.entries as entry, i}
            {#if i < 3}
              <div class="lb-row lb-top">
                <span class="lb-medal">{getMedal(i)}</span>
                <span class="lb-rank">#{entry.rank}</span>
                <span class="lb-user">{entry.userId}</span>
                <div class="lb-rep-bar">
                  <div class="lb-rep-fill" style="width: {Math.min(100, (entry.totalRep / Math.max(data.leaderboard.entries[0]?.totalRep ?? 1, 1)) * 100)}%"></div>
                </div>
                <span class="lb-rep-count">+{entry.totalRep}</span>
              </div>
            {:else}
              <div class="lb-row">
                <span class="lb-medal"></span>
                <span class="lb-rank">#{entry.rank}</span>
                <span class="lb-user">{entry.userId}</span>
                <div class="lb-rep-bar">
                  <div class="lb-rep-fill" style="width: {Math.min(100, (entry.totalRep / Math.max(data.leaderboard.entries[0]?.totalRep ?? 1, 1)) * 100)}%"></div>
                </div>
                <span class="lb-rep-count">+{entry.totalRep}</span>
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>

    <div class="card recent-card">
      <h3>
        <Papicon name="clock" size={16} />
        Votes recents
      </h3>
      {#if data.recentVotes.length === 0}
        <div class="empty-state">
          <Papicon name="heart" size={36} />
          <p>Aucun vote recent.</p>
        </div>
      {:else}
        <div class="votes-list">
          {#each data.recentVotes.slice(0, 20) as vote}
            <div class="vote-card">
              <div class="vote-flow">
                <div class="vote-actor vote-giver-block">
                  <Papicon name="user" size={13} />
                  <span class="vote-actor-id">{vote.giverId}</span>
                </div>
                <div class="vote-arrow">
                  <Papicon name="arrow-right" size={14} />
                </div>
                <div class="vote-actor vote-receiver-block">
                  <Papicon name="star" size={13} />
                  <span class="vote-actor-id vote-receiver-name">{vote.receiverId}</span>
                </div>
              </div>
              {#if vote.reason}
                <p class="vote-reason">{vote.reason}</p>
              {/if}
              <span class="vote-date">{new Date(vote.createdAt).toLocaleDateString('fr-FR')}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .page-header { margin-bottom: 1.5rem; }
  .page-header h1 { display: flex; align-items: center; gap: 0.5rem; font-size: 1.5rem; margin: 0; }
  .subtitle { color: var(--color-text-muted); margin: 0.25rem 0 0; font-size: 0.875rem; }

  /* Stats bar */
  .stats-bar { display: flex; gap: 1rem; margin-bottom: 1.25rem; }
  .stat {
    flex: 1; display: flex; align-items: center; gap: 0.75rem;
    background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 10px; padding: 0.85rem 1rem;
  }
  .stat-icon { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 8px; background: var(--color-bg); flex-shrink: 0; }
  .stat-content { display: flex; flex-direction: column; }
  .stat-value { font-size: 1.3rem; font-weight: 700; line-height: 1.2; }
  .stat-label { font-size: 0.72rem; color: var(--color-text-muted); }

  /* Grid layout */
  .rep-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }

  .card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 12px; padding: 1.25rem; }
  .card h3 { display: flex; align-items: center; gap: 0.4rem; margin: 0 0 1rem; font-size: 0.95rem; color: var(--color-text-secondary); }

  /* Leaderboard */
  .leaderboard { display: flex; flex-direction: column; gap: 0.3rem; }
  .lb-row {
    display: grid; grid-template-columns: 28px 36px 1fr 80px 60px;
    align-items: center; padding: 0.5rem 0.6rem; border-radius: 8px; font-size: 0.85rem;
    gap: 0.5rem;
  }
  .lb-row:hover { background: var(--color-bg); }
  .lb-top { background: rgba(255, 255, 255, 0.03); }
  .lb-medal { font-size: 1.1rem; line-height: 1; }
  .lb-rank { font-weight: 600; color: var(--color-text-secondary); }
  .lb-user { font-family: monospace; font-size: 0.78rem; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lb-rep-bar { height: 6px; background: var(--color-bg); border-radius: 3px; overflow: hidden; }
  .lb-rep-fill { height: 100%; background: var(--color-success); border-radius: 3px; transition: width 0.3s; }
  .lb-rep-count { font-weight: 700; color: var(--color-success); text-align: right; font-size: 0.85rem; }

  /* Votes */
  .votes-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .vote-card {
    background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 10px;
    padding: 0.75rem 1rem;
  }
  .vote-flow { display: flex; align-items: center; gap: 0.5rem; }
  .vote-actor { display: flex; align-items: center; gap: 0.3rem; }
  .vote-actor-id { font-family: monospace; font-size: 0.78rem; color: var(--color-text-muted); }
  .vote-receiver-name { color: var(--color-success); font-weight: 500; }
  .vote-arrow { color: var(--color-primary); display: flex; align-items: center; }
  .vote-reason { margin: 0.4rem 0 0; font-size: 0.82rem; color: var(--color-text-muted); font-style: italic; }
  .vote-date { display: block; margin-top: 0.3rem; font-size: 0.72rem; color: var(--color-text-muted); }

  /* Empty states */
  .empty-state { display: flex; flex-direction: column; align-items: center; padding: 2rem; color: var(--color-text-muted); gap: 0.5rem; text-align: center; }
  .empty-state p { margin: 0; font-size: 0.85rem; }

  .loading-container { display: flex; justify-content: center; padding: 4rem; }

  @media (max-width: 768px) {
    .stats-bar { flex-direction: column; }
    .rep-grid { grid-template-columns: 1fr; }
    .lb-row { grid-template-columns: 24px 30px 1fr 50px 50px; font-size: 0.8rem; }
    .vote-flow { flex-wrap: wrap; }
  }
</style>
