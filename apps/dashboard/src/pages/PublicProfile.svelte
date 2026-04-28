<script lang="ts">
  import { onMount } from 'svelte';
  import { API_BASE_URL, fetchManagerNotes, addManagerNote } from '../lib/api';
  import { authStore } from '../lib/stores/auth.svelte';
  import { router } from 'tinro';
  import ManagerNotesPane from '../lib/components/ManagerNotesPane.svelte';
  import type { StaffManagerNote } from '../lib/types';
  import Papicon from '../lib/components/Papicon.svelte';

  interface Props {
    userId: string;
  }
  let { userId }: Props = $props();

  let profile: any = $state(null);
  let notes = $state<StaffManagerNote[]>([]);
  let loading = $state(true);
  let error = $state('');

  const isAdmin = $derived(
    authStore.guilds.find((g) => g.id === authStore.selectedGuildId)?.accessLevel === 'admin'
  );

  onMount(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/public/profile/${userId}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error('Utilisateur introuvable');
        throw new Error('Erreur lors de la récupération du profil');
      }
      profile = await res.json();
      
      if (isAdmin) {
        notes = await fetchManagerNotes(userId);
      }
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
    <div class="flex flex-col items-center justify-center py-32 text-on-surface-variant/20">
      <Papicon icon="progress_activity" size={60} class="animate-spin" />
      <p class="mt-4 text-xs font-black uppercase tracking-[0.3em]">Chargement du profil...</p>
    </div>
  {:else if error}
    <div class="max-w-xl text-center">
      <Papicon icon="error" size={60} class="text-rose-500 mb-6" />
      <h2 class="text-3xl font-black text-on-surface mb-2">{error}</h2>
      <p class="text-on-surface-variant font-medium mb-8">L'utilisateur a peut-être rejoint une autre sphère.</p>
      <button onclick={() => router.goto('/')} class="px-8 py-3 rounded-2xl bg-surface-container text-on-surface font-black uppercase tracking-widest text-xs border border-outline-variant/10">Retour</button>
    </div>
  {:else if profile}
    <div class="profile-card">
        <div class="banner">
           {#if profile.banner}
             <img src={profile.banner} alt="Banner" class="w-full h-full object-cover" />
           {/if}
           <div class="badge-overlay">Profile Vérifié</div>
        </div>

        <div class="header">
            <div class="avatar-container">
               <img src={profile.avatar} alt={profile.username} class="avatar" />
               {#if profile.rank === 0}
                 <div class="crown">
                   <Papicon icon="workspace_premium" size={56} />
                 </div>
               {/if}
            </div>
            <div class="user-info">
               <h1>{profile.displayName || profile.username}</h1>
               <p class="tag">@{profile.username}</p>
               
               <div class="badges">
                 {#each profile.roles || [] as role}
                   <span class="badge contributor">{role.name}</span>
                 {/each}
               </div>

               {#if authStore.user?.id === userId}
                 <div class="mt-6">
                   <a href="/profile" class="inline-flex items-center gap-2 px-6 py-2 rounded-xl bg-primary text-on-primary text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform shadow-lg shadow-primary/20">
                     <Papicon icon="shield_person" size={14} />
                     Espace Personnel Staff
                   </a>
                 </div>
               {/if}
            </div>
        </div>

        <div class="stats-grid">
            <div class="stat-item">
               <span class="value">{profile.points || 0}</span>
               <span class="label">Points</span>
            </div>
            <div class="stat-item">
               <span class="value" style="color: {getTierColor(profile.tier)}">{profile.tier || 'Nouveau'}</span>
               <span class="label">Tier</span>
            </div>
            <div class="stat-item">
               <span class="value">{profile.streak || 0}j</span>
               <span class="label">Streak</span>
            </div>
            <div class="stat-item">
               <span class="value">#{(profile.rank || 0) + 1}</span>
               <span class="label">Rang</span>
            </div>
        </div>

        <div class="section">
            <h3>Activités Récentes</h3>
            <div class="algo-list">
                {#each profile.recentAlgos || [] as algo}
                   <div class="algo-card">
                      <div class="flex items-center gap-3">
                         <Papicon icon="terminal" size={18} class="text-primary" />
                         <p class="text-sm font-black text-on-surface">{algo.title}</p>
                      </div>
                      <p class="text-[10px] text-on-surface-variant font-medium">Validé le {new Date(algo.date).toLocaleDateString()}</p>
                   </div>
                {/each}
                {#if (profile.recentAlgos?.length || 0) === 0}
                   <p class="col-span-2 text-center text-[10px] text-on-surface-variant/40 italic">Aucune donnée algorithmique enregistrée.</p>
                {/if}
            </div>
        </div>

        {#if isAdmin}
          <div class="p-8 border-t border-outline-variant/10 bg-linear-to-b from-rose-500/[0.02] to-transparent">
            <div class="flex items-center gap-3 mb-8">
              <div class="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-600 flex items-center justify-center">
                <Papicon icon="privacy_tip" size={24} />
              </div>
              <div>
                <p class="text-[10px] font-black uppercase tracking-[0.2em] text-rose-500/60">Espace Administration</p>
                <h3 class="text-xl font-black tracking-tighter text-on-surface" style="margin-bottom: 0; opacity: 1; text-align: left;">Notes de Management</h3>
              </div>
            </div>

            <ManagerNotesPane 
              {userId} 
              {notes} 
              onNoteAdded={async () => { notes = await fetchManagerNotes(userId); }}
              onNoteDeleted={async () => { notes = await fetchManagerNotes(userId); }}
            />
          </div>
        {/if}

        <div class="p-8 border-t border-outline-variant/5 text-center">
            <p class="text-[10px] font-bold uppercase tracking-[0.3em] text-on-surface-variant/20 italic">
              Kotbo Intelligent Ecosystem • Verified Core Profile
            </p>
        </div>
    </div>
  {/if}
</div>

<style>
  .public-profile {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    min-height: 100vh;
    background: radial-gradient(circle at top right, var(--surface-container-high), var(--surface-container-lowest));
    padding: 6rem 1.5rem;
    color: var(--on-surface);
  }

  .profile-card {
    width: 100%;
    max-width: 720px;
    background: var(--surface-container-low);
    border-radius: 4rem;
    overflow: hidden;
    box-shadow: var(--shadow-xl);
    border: 1px solid var(--outline-variant);
    animation: slide-up 0.8s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes slide-up {
    from { opacity: 0; transform: translateY(40px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  .banner {
    height: 240px;
    position: relative;
    overflow: hidden;
  }

  .banner::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, transparent 40%, var(--surface-container-low));
  }

  .badge-overlay {
    position: absolute;
    top: 2rem;
    right: 2rem;
    background: rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(20px);
    padding: 0.5rem 1.25rem;
    border-radius: 1.5rem;
    font-size: 0.65rem;
    font-weight: 900;
    letter-spacing: 0.2em;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: white;
    text-transform: uppercase;
    z-index: 20;
  }

  .header {
    margin-top: -120px;
    padding: 0 3rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    position: relative;
    z-index: 10;
  }

  .avatar-container {
    position: relative;
    margin-bottom: 2rem;
  }

  .avatar {
    width: 180px;
    height: 180px;
    border-radius: 4rem;
    border: 8px solid var(--surface-container-low);
    background: var(--surface-container-low);
    box-shadow: var(--shadow-2xl);
    object-fit: cover;
  }

  .crown {
    position: absolute;
    top: -20px;
    right: -20px;
    font-size: 3.5rem;
    filter: drop-shadow(0 0 20px rgba(255, 215, 0, 0.5));
    animation: float 4s ease-in-out infinite;
  }

  @keyframes float {
    0%, 100% { transform: translateY(0) rotate(5deg); }
    50% { transform: translateY(-10px) rotate(-5deg); }
  }

  .user-info h1 {
    font-size: 2.5rem;
    font-weight: 900;
    letter-spacing: -0.04em;
    line-height: 1;
    font-family: var(--font-headline);
  }

  .tag {
    color: var(--on-surface-variant);
    opacity: 0.5;
    font-weight: 700;
    font-size: 1.1rem;
    margin: 0.5rem 0 1.5rem;
  }

  .badges {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
  }

  .badge {
    padding: 0.5rem 1.25rem;
    border-radius: 1rem;
    font-size: 0.7rem;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .contributor {
    background: rgba(87, 242, 135, 0.1);
    color: #57f287;
    border: 1px solid rgba(87, 242, 135, 0.2);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1.5rem;
    padding: 3rem;
  }

  .stat-item {
    background: var(--surface-container);
    padding: 2rem 1rem;
    border-radius: 2.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    border: 1px solid var(--outline-variant);
    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .stat-item:hover {
    transform: translateY(-12px);
    background: var(--surface-container-high);
    border-color: var(--primary);
    box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.3);
  }

  .stat-item .value {
    font-size: 1.75rem;
    font-weight: 950;
    color: var(--on-surface);
  }

  .stat-item .label {
    font-size: 0.6rem;
    color: var(--on-surface-variant);
    opacity: 0.4;
    text-transform: uppercase;
    font-weight: 900;
    letter-spacing: 0.15em;
    margin-top: 0.5rem;
  }

  .section {
    padding: 0 3rem 3rem;
  }

  .section h3 {
    font-size: 0.8rem;
    color: var(--on-surface-variant);
    opacity: 0.3;
    text-transform: uppercase;
    font-weight: 900;
    margin-bottom: 2rem;
    letter-spacing: 0.2em;
    text-align: center;
  }

  .algo-list {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }

  .algo-card {
    background: var(--surface-container-low);
    padding: 1.5rem;
    border-radius: 2rem;
    border: 1px solid var(--outline-variant);
    display: flex;
    flex-direction: column;
    gap: 1rem;
    transition: all 0.3s ease;
  }

  .algo-card:hover {
    background: var(--surface-container);
    border-color: var(--primary);
  }

  @media (max-width: 640px) {
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
    .algo-list { grid-template-columns: 1fr; }
    .header { margin-top: -80px; padding: 0 1.5rem; }
    .avatar { width: 140px; height: 140px; border-radius: 3rem; }
    .user-info h1 { font-size: 2rem; }
  }
</style>
