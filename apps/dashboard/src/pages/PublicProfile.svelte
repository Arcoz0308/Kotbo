<script lang="ts">
  import { onMount } from 'svelte';
  import { API_BASE_URL } from '../lib/api';
  import { router } from 'tinro';

  interface Props {
    userId: string;
  }
  let { userId }: Props = $props();

  let profile: any = $state(null);
  let loading = $state(true);
  let error = $state('');

  onMount(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/public/profile/${userId}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error('Utilisateur introuvable');
        throw new Error('Erreur lors de la récupération du profil');
      }
      profile = await res.json();
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  });

  function getTierColor(tier: string) {
    switch (tier) {
      case 'Légende': return '#ff006e';
      case 'Maître': return '#8338ec';
      case 'Apprenti': return '#3a86ff';
      default: return '#8b949e';
    }
  }
</script>

<div class="public-profile">
  {#if loading}
    <div class="status-box">
        <div class="spinner"></div>
        <p>Chargement du profil scout...</p>
    </div>
  {:else if error}
    <div class="status-box error">
        <div class="icon">⚠️</div>
        <p>{error}</p>
        <button onclick={() => router.goto('/')}>Retour à l'accueil</button>
    </div>
  {:else if profile}
    <div class="profile-card">
        <div class="banner" style="background: linear-gradient(135deg, {getTierColor(profile.algo?.tier || 'Débutant')} 0%, #0f1219 100%)">
            <div class="badge-overlay">PROFIL PUBLIC</div>
        </div>
        
        <div class="header">
            <div class="avatar-container">
                <img src={profile.user.avatarUrl} alt={profile.user.username} class="avatar" />
                {#if profile.algo?.tier === 'Légende'}
                    <div class="crown">👑</div>
                {/if}
            </div>
            
            <div class="user-info">
                <h1>{profile.user.globalName || profile.user.username}</h1>
                <p class="tag">@{profile.user.username}</p>
                <div class="badges">
                    {#if profile.algo}
                        <span class="badge tier" style="background: {getTierColor(profile.algo.tier)}">{profile.algo.tier}</span>
                    {/if}
                    {#if profile.stats.scoutedArticles > 50}
                        <span class="badge contributor">Scout Élite</span>
                    {/if}
                </div>
            </div>
        </div>

        <div class="stats-grid">
            <div class="stat-item">
                <span class="value">{profile.algo?.totalPoints || 0}</span>
                <span class="label">Points Algo</span>
            </div>
            <div class="stat-item">
                <span class="value">{profile.algo?.currentStreak || 0}</span>
                <span class="label">Série actuelle</span>
            </div>
            <div class="stat-item">
                <span class="value">{profile.stats.scoutedArticles}</span>
                <span class="label">News validées</span>
            </div>
            <div class="stat-item">
                <span class="value">{profile.algo?.rank || '—'}</span>
                <span class="label">Rang Global</span>
            </div>
        </div>

        {#if profile.recentAlgos && profile.recentAlgos.length > 0}
            <div class="section">
                <h3>Derniers Défis Réalisés</h3>
                <div class="algo-list">
                    {#each profile.recentAlgos as algo}
                        <div class="algo-card">
                            <div class="algo-header">
                                <span class="difficulty {algo.run.problem.difficulty.toLowerCase()}"></span>
                                <span class="title">{algo.run.problem.title}</span>
                            </div>
                            <div class="algo-footer">
                                <span>Note: {algo.scoreFinal}/5</span>
                                <span>{new Date(algo.submittedAt).toLocaleDateString('fr')}</span>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

        <div class="footer">
            <p>Kotbo Community Profile • Données vérifiées sur la blockchain Kotbo</p>
        </div>
    </div>
  {/if}
</div>

<style>
  .public-profile {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    background: radial-gradient(circle at top right, #161b25 0%, #0f1219 100%);
    padding: 1rem;
    font-family: 'Inter', sans-serif;
    color: #ffffff;
  }

  .status-box {
    text-align: center;
    background: rgba(255, 255, 255, 0.05);
    padding: 3rem;
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .profile-card {
    width: 100%;
    max-width: 600px;
    background: #11141d;
    border-radius: 24px;
    overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .banner {
    height: 120px;
    position: relative;
  }

  .badge-overlay {
    position: absolute;
    top: 20px;
    right: 20px;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(10px);
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 0.7rem;
    font-weight: 900;
    letter-spacing: 1px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .header {
    margin-top: -50px;
    padding: 0 2rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .avatar-container {
    position: relative;
    margin-bottom: 1rem;
  }

  .avatar {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    border: 6px solid #11141d;
    background: #11141d;
  }

  .crown {
    position: absolute;
    top: -10px;
    right: -10px;
    font-size: 2rem;
    filter: drop-shadow(0 0 10px rgba(255, 215, 0, 0.5));
  }

  .user-info h1 {
    margin: 0;
    font-size: 1.8rem;
    font-weight: 800;
  }

  .tag {
    color: #8b949e;
    margin: 0.2rem 0 1rem 0;
  }

  .badges {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
  }

  .badge {
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  .contributor {
    background: rgba(87, 242, 135, 0.1);
    color: #57f287;
    border: 1px solid rgba(87, 242, 135, 0.2);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
    padding: 2rem;
  }

  .stat-item {
    background: rgba(255, 255, 255, 0.03);
    padding: 1.5rem;
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    border: 1px solid rgba(255, 255, 255, 0.05);
    transition: transform 0.2s;
  }

  .stat-item:hover {
    transform: translateY(-5px);
    background: rgba(255, 255, 255, 0.05);
  }

  .stat-item .value {
    font-size: 1.5rem;
    font-weight: 800;
    color: #ffffff;
  }

  .stat-item .label {
    font-size: 0.8rem;
    color: #8b949e;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 0.4rem;
  }

  .section {
    padding: 0 2rem 2rem 2rem;
  }

  .section h3 {
    font-size: 1rem;
    color: #8b949e;
    text-transform: uppercase;
    margin-bottom: 1rem;
    letter-spacing: 1px;
  }

  .algo-list {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }

  .algo-card {
    background: rgba(255, 255, 255, 0.02);
    padding: 1rem;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .algo-header {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    margin-bottom: 0.5rem;
  }

  .difficulty {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .difficulty.facile { background: #57f287; }
  .difficulty.moyen { background: #fee75c; }
  .difficulty.difficile { background: #ed4245; }

  .algo-header .title {
    font-weight: 600;
    font-size: 0.9rem;
  }

  .algo-footer {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: #8b949e;
  }

  .footer {
    padding: 1rem 2rem;
    text-align: center;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    font-size: 0.7rem;
    color: #4e5563;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid rgba(255, 255, 255, 0.1);
    border-top: 4px solid #5865f2;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem auto;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
</style>
