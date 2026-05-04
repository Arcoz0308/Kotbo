<script lang="ts">
  import { onMount } from 'svelte';
  import { API_BASE_URL, fetchManagerNotes } from '../lib/api';
  import { authStore } from '../lib/stores/auth.svelte';
  import { router } from 'tinro';
  import ManagerNotesPane from '../lib/components/ManagerNotesPane.svelte';
  import type { StaffManagerNote } from '../lib/types';
  import Papicon from '../lib/components/Papicon.svelte';
  import MetricCard from '../lib/components/MetricCard.svelte';

  interface Props {
    userId: string;
  }
  let { userId }: Props = $props();

  let profile: any = $state(null);
  let notes = $state<StaffManagerNote[]>([]);
  let loading = $state(true);
  let error = $state('');
  let activeTab = $state('overview');

  const isAdmin = $derived(
    authStore.guilds.find((g) => g.id === authStore.selectedGuildId)?.accessLevel === 'admin'
  );

  const tabs = $derived([
    { id: 'overview', label: 'Vue d\'ensemble', icon: 'Grid' },
    { id: 'activity', label: 'Algorithmique', icon: 'Terminal' },
    ...(isAdmin ? [{ id: 'management', label: 'Management', icon: 'ShieldCheck' }] : [])
  ]);

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
    const t = tier?.toLowerCase();
    if (t?.includes('légende') || t?.includes('legende')) return 'text-rose-500';
    if (t?.includes('maître') || t?.includes('maitre')) return 'text-purple-500';
    if (t?.includes('expert')) return 'text-amber-500';
    if (t?.includes('apprenti')) return 'text-blue-500';
    return 'text-on-surface-variant/40';
  }

  function getTierBg(tier: string) {
    const t = tier?.toLowerCase();
    if (t?.includes('légende') || t?.includes('legende')) return 'bg-rose-500/10';
    if (t?.includes('maître') || t?.includes('maitre')) return 'bg-purple-500/10';
    if (t?.includes('expert')) return 'bg-amber-500/10';
    if (t?.includes('apprenti')) return 'bg-blue-500/10';
    return 'bg-on-surface/5';
  }

  const getRankSuffix = (rank: number) => {
    if (rank === 1) return 'er';
    return 'e';
  };
</script>

<div class="min-h-screen bg-surface-container-lowest/50 pb-24">
  <div class="max-w-7xl mx-auto px-6 pt-12">
    
    {#if loading}
      <div class="space-y-10 animate-pulse">
        <div class="h-64 bg-surface-container-high rounded-[3.5rem]"></div>
        <div class="flex justify-center h-16 max-w-xl mx-auto bg-surface-container-high rounded-full"></div>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div class="h-32 bg-surface-container-high rounded-3xl"></div>
          <div class="h-32 bg-surface-container-high rounded-3xl"></div>
          <div class="h-32 bg-surface-container-high rounded-3xl"></div>
          <div class="h-32 bg-surface-container-high rounded-3xl"></div>
        </div>
      </div>
    {:else if error}
      <div class="flex flex-col items-center justify-center py-32 text-center">
        <div class="w-24 h-24 rounded-[2.5rem] bg-rose-500/10 text-rose-500 flex items-center justify-center mb-8">
          <Papicon icon="AlertTriangle" size={48} />
        </div>
        <h3 class="text-4xl font-black tracking-tighter text-on-surface font-headline">Profil Introuvable</h3>
        <p class="mt-4 max-w-md text-lg font-bold text-on-surface-variant/60">{error}</p>
        <button onclick={() => router.goto('/')} class="mt-12 inline-flex items-center gap-3 rounded-2xl bg-surface-container-high px-10 py-5 text-sm font-black uppercase tracking-widest text-on-surface border border-outline-variant/10 hover:bg-surface-container-highest transition-all">
          <Papicon icon="ArrowLeft" size={20} />
          Retour
        </button>
      </div>
    {:else if profile}
      
      <!-- ── Hero Section ──────────────────────────────────────── -->
      <div class="relative overflow-hidden rounded-[3.5rem] border border-outline-variant/10 bg-surface-container-lowest shadow-2xl mb-10">
        <!-- Banner -->
        <div class="relative h-48 md:h-72 overflow-hidden bg-surface-container-high">
          {#if profile.banner}
            <img src={profile.banner} alt="Banner" class="w-full h-full object-cover" />
          {:else}
            <div class="absolute inset-0 bg-linear-to-br from-primary/20 via-primary/5 to-transparent blur-3xl scale-150"></div>
          {/if}
          <div class="absolute inset-0 bg-linear-to-b from-transparent to-surface-container-lowest"></div>
          
          <div class="absolute top-6 right-6 z-20">
            <span class="inline-flex items-center gap-2 rounded-full bg-surface-container-lowest/40 backdrop-blur-xl border border-white/10 px-5 py-2.5 text-[10px] font-black text-white uppercase tracking-[0.2em] shadow-2xl">
              <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Profil Vérifié
            </span>
          </div>
        </div>

        <!-- Identity -->
        <div class="relative px-10 pb-12 -mt-20 md:-mt-24">
          <div class="flex flex-col md:flex-row items-end justify-between gap-8">
            <div class="flex flex-col md:flex-row items-end gap-8">
              <!-- Avatar -->
              <div class="relative shrink-0">
                <div class="absolute -inset-4 bg-primary/20 rounded-[3rem] blur-2xl opacity-50"></div>
                <div class="relative w-40 h-40 md:w-48 md:h-48 rounded-[3rem] border-[8px] border-surface-container-lowest shadow-2xl overflow-hidden bg-surface-container-low">
                  <img src={profile.avatar} alt={profile.username} class="w-full h-full object-cover" />
                </div>
                {#if profile.rank === 0}
                  <div class="absolute -top-4 -right-4 w-16 h-16 bg-amber-500 text-white rounded-2xl flex items-center justify-center shadow-2xl rotate-12 animate-bounce">
                    <Papicon icon="Trophy" size={32} />
                  </div>
                {/if}
              </div>

              <div class="space-y-3 pb-2 text-center md:text-left">
                <div class="flex flex-wrap items-center justify-center md:justify-start gap-4">
                  <h1 class="text-4xl md:text-6xl font-black text-on-surface tracking-tighter font-headline leading-none">
                    {profile.displayName || profile.username}
                  </h1>
                </div>
                <div class="flex flex-wrap items-center justify-center md:justify-start gap-3">
                  <p class="text-xl text-on-surface-variant/60 font-bold">@{profile.username}</p>
                  <div class="flex gap-2">
                    {#each profile.roles || [] as role}
                      <span class="inline-flex items-center gap-2 rounded-xl bg-primary/5 border border-primary/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary">
                        {role.name}
                      </span>
                    {/each}
                  </div>
                </div>
              </div>
            </div>

            {#if authStore.user?.id === userId}
              <div class="pb-2">
                <a href="/profile" class="inline-flex items-center gap-3 rounded-2xl bg-primary px-8 py-4 text-xs font-black uppercase tracking-widest text-on-primary shadow-xl shadow-primary/30 transition-all hover:scale-[1.05] active:scale-[0.95]">
                  <Papicon icon="ShieldUser" size={20} />
                  Mon Espace Staff
                </a>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- ── Tabs Navigation ──────────────────────────────────── -->
      <div class="sticky top-6 z-40 flex justify-center mb-12">
        <div class="flex gap-1 bg-surface-container-lowest/80 backdrop-blur-2xl p-2 rounded-[2.5rem] border border-outline-variant/10 shadow-2xl shadow-surface/5">
          {#each tabs as tab}
            <button 
              onclick={() => activeTab = tab.id} 
              class="flex items-center gap-3 px-8 py-4 rounded-[2rem] text-[11px] font-black uppercase tracking-widest transition-all duration-500 group {activeTab === tab.id ? 'bg-on-surface text-surface shadow-xl scale-[1.05]' : 'text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container-high'}"
            >
              <Papicon icon={tab.icon} size={18} class={activeTab === tab.id ? 'text-primary' : 'text-primary/40'} />
              {tab.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- ── Tab Content ──────────────────────────────────────── -->
      <div class="animate-in fade-in slide-in-from-bottom-6 duration-1000">
        
        {#if activeTab === 'overview'}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <!-- Summary Stats -->
            <MetricCard 
              label="Points" 
              value={profile.points?.toLocaleString() || '0'} 
              note="Score global" 
              icon="Trophy" 
              toneClass="bg-amber-500/10 text-amber-500" 
            />
            <MetricCard 
              label="Tier" 
              value={profile.tier || 'Nouveau'} 
              note="Niveau actuel" 
              icon="Zap" 
              toneClass={`${getTierBg(profile.tier)} ${getTierColor(profile.tier)}`} 
            />
            <MetricCard 
              label="Streak" 
              value={`${profile.streak || 0}j`} 
              note="Série actuelle" 
              icon="Flame" 
              toneClass="bg-orange-500/10 text-orange-500" 
            />
            <MetricCard 
              label="Classement" 
              value={`${(profile.rank || 0) + 1}${getRankSuffix((profile.rank || 0) + 1)}`} 
              note="Position serveur" 
              icon="Medal" 
              toneClass="bg-purple-500/10 text-purple-500" 
            />

            <!-- Bio / Info Bento -->
            <div class="md:col-span-2 lg:col-span-3 rounded-[3rem] bg-surface-container-low/40 p-10 border border-outline-variant/10 shadow-sm relative overflow-hidden group">
              <div class="absolute -right-20 -bottom-20 opacity-[0.03] rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
                <Papicon icon="Fingerprint" size={300} />
              </div>
              
              <div class="flex items-center gap-4 mb-8">
                <div class="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  <Papicon icon="User" size={28} />
                </div>
                <div>
                  <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Informations</p>
                  <h4 class="text-2xl font-black text-on-surface">Dossier Public</h4>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-10">
                <div class="space-y-2">
                  <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Identifiant Unique</p>
                  <p class="text-lg font-mono font-bold text-on-surface-variant">{userId}</p>
                </div>
                <div class="space-y-2">
                  <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Date d'enregistrement</p>
                  <p class="text-lg font-bold text-on-surface">Donnée chiffrée</p>
                </div>
                <div class="sm:col-span-2 space-y-4">
                  <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Badges de contribution</p>
                  <div class="flex flex-wrap gap-3">
                    {#each profile.roles || [] as role}
                      <div class="px-5 py-3 rounded-2xl bg-surface-container-high/60 border border-outline-variant/10 flex items-center gap-3 group/badge hover:border-primary/30 transition-colors">
                        <div class="w-8 h-8 rounded-lg bg-primary/5 text-primary flex items-center justify-center group-hover/badge:scale-110 transition-transform">
                          <Papicon icon="Award" size={16} />
                        </div>
                        <span class="text-xs font-black text-on-surface-variant">{role.name}</span>
                      </div>
                    {:else}
                      <p class="text-xs font-bold text-on-surface-variant/30 italic">Aucun badge spécifique pour le moment.</p>
                    {/each}
                  </div>
                </div>
              </div>
            </div>

            <!-- Achievement Preview -->
            <div class="rounded-[3rem] bg-linear-to-br from-primary to-primary-container p-10 text-on-primary shadow-2xl shadow-primary/20 relative overflow-hidden flex flex-col justify-between">
              <div class="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
              <div class="relative z-10">
                <Papicon icon="Sparkles" size={48} class="mb-6 opacity-40" />
                <h4 class="text-2xl font-black tracking-tight leading-tight mb-4">Progression Kotbo</h4>
                <p class="text-sm font-bold opacity-70 leading-relaxed">
                  Chaque défi relevé rapproche {profile.displayName || profile.username} du rang de Légende.
                </p>
              </div>
              <div class="relative z-10 mt-10">
                 <div class="w-full h-2 bg-black/10 rounded-full overflow-hidden">
                   <div class="h-full bg-white/40" style="width: 65%"></div>
                 </div>
                 <p class="mt-3 text-[10px] font-black uppercase tracking-widest opacity-60 text-right">Prochain Tier : 65%</p>
              </div>
            </div>
          </div>

        {:else if activeTab === 'activity'}
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <!-- Algo History -->
            <div class="lg:col-span-2 rounded-[3.5rem] bg-surface-container-low/40 p-12 border border-outline-variant/10 shadow-sm">
              <div class="flex items-center gap-4 mb-12">
                <div class="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  <Papicon icon="Activity" size={28} />
                </div>
                <div>
                  <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Algorithmique</p>
                  <h4 class="text-2xl font-black text-on-surface font-headline">Derniers Défis Validés</h4>
                </div>
              </div>

              <div class="space-y-4">
                {#each profile.recentAlgos || [] as algo}
                  <div class="group flex items-center justify-between p-6 rounded-3xl bg-surface-container-low/60 border border-outline-variant/5 hover:border-primary/20 hover:bg-surface-container-high transition-all">
                    <div class="flex items-center gap-5">
                      <div class="w-12 h-12 rounded-xl bg-on-surface/5 text-on-surface-variant/40 flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                        <Papicon icon="Terminal" size={20} />
                      </div>
                      <div>
                        <p class="text-base font-black text-on-surface">{algo.title}</p>
                        <p class="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest mt-0.5">Solution optimisée • Kotbo Engine</p>
                      </div>
                    </div>
                    <div class="text-right">
                      <p class="text-xs font-black text-on-surface-variant">
                        {new Date(algo.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                      </p>
                      <p class="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mt-0.5">Validé</p>
                    </div>
                  </div>
                {:else}
                  <div class="py-24 flex flex-col items-center justify-center text-center opacity-30">
                    <Papicon icon="Inbox" size={64} class="mb-4" />
                    <p class="text-lg font-black uppercase tracking-widest">Aucune activité récente</p>
                  </div>
                {/each}
              </div>
            </div>

            <!-- Side Bento -->
            <div class="space-y-8">
              <div class="rounded-[2.5rem] bg-surface-container-low/50 p-8 border border-outline-variant/10 shadow-sm">
                <h5 class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-8">Statistiques de participation</h5>
                <div class="space-y-8">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4">
                      <div class="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                        <Papicon icon="CheckCircle" size={20} />
                      </div>
                      <span class="text-sm font-bold text-on-surface-variant">Taux de succès</span>
                    </div>
                    <span class="text-xl font-black text-on-surface">94%</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4">
                      <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                        <Papicon icon="Clock" size={20} />
                      </div>
                      <span class="text-sm font-bold text-on-surface-variant">Temps moy.</span>
                    </div>
                    <span class="text-xl font-black text-on-surface">12m</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4">
                      <div class="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                        <Papicon icon="Target" size={20} />
                      </div>
                      <span class="text-sm font-bold text-on-surface-variant">Précision</span>
                    </div>
                    <span class="text-xl font-black text-on-surface">Haut</span>
                  </div>
                </div>
              </div>

              <div class="rounded-[2.5rem] bg-surface-container-high/40 p-8 border border-outline-variant/10 shadow-sm text-center">
                 <div class="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-6">
                   <Papicon icon="Lock" size={28} />
                 </div>
                 <h5 class="text-sm font-black text-on-surface mb-2">Données Privées</h5>
                 <p class="text-xs font-bold text-on-surface-variant/40 leading-relaxed">
                   Seuls les administrateurs peuvent consulter le code source des solutions soumises.
                 </p>
              </div>
            </div>
          </div>

        {:else if activeTab === 'management'}
          <div class="animate-in fade-in zoom-in duration-700">
            <div class="flex items-center gap-4 mb-10">
              <div class="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                <Papicon icon="ShieldCheck" size={28} />
              </div>
              <div>
                <p class="text-[10px] font-black uppercase tracking-[0.25em] text-rose-500">Administration</p>
                <h4 class="text-2xl font-black text-on-surface font-headline">Notes de Management & Suivi</h4>
              </div>
            </div>

            <div class="bg-surface-container-low/40 rounded-[3.5rem] border border-outline-variant/10 p-12 shadow-2xl">
              <ManagerNotesPane 
                {userId} 
                {notes} 
                onNoteAdded={async () => { notes = await fetchManagerNotes(userId); }}
                onNoteDeleted={async () => { notes = await fetchManagerNotes(userId); }}
              />
            </div>
          </div>
        {/if}

      </div>

      <!-- Footer -->
      <div class="mt-24 pt-10 border-t border-outline-variant/5 text-center">
        <p class="text-[10px] font-black uppercase tracking-[0.4em] text-on-surface-variant/20 italic">
          Kotbo Intelligent Ecosystem • Secure Verified Profile Dossier
        </p>
      </div>

    {/if}
  </div>
</div>

<style>
  :global(.font-headline) {
    font-family: 'Outfit', 'Inter', sans-serif;
  }
</style>
