<script lang="ts">
  import { onMount } from 'svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';
  import { fetchPublicLeveling } from '../lib/api';

  interface Props {
    serverId: string;
  }
  const { serverId }: Props = $props();

  let loading = $state(true);
  let errorMsg = $state<string | null>(null);
  let guildName = $state('Kotbo Server');
  let guildIcon = $state<string | null>(null);
  let enabled = $state(false);
  let levels = $state<Array<{ userId: string; xp: number; level: number; username?: string; displayName?: string; avatarUrl?: string }>>([]);
  let searchQuery = $state('');
  let highlightedUserId = $state<string | null>(null);

  onMount(async () => {
    try {
      const res = await fetchPublicLeveling(serverId);
      if (res) {
        enabled = res.enabled ?? false;
        guildName = res.guildName ?? 'Kotbo Server';
        guildIcon = res.guildIcon ?? null;
        levels = res.levels || [];
      }
    } catch (err: any) {
      console.error(err);
      errorMsg = err.message || 'Erreur lors du chargement des données.';
    } finally {
      loading = false;
    }
  });

  function getXpForLevel(level: number): number {
    if (level < 0) return 0;
    return 100 * Math.pow(level, 2) + 200 * level;
  }

  const filteredLevels = $derived(
    levels.filter(u => {
      const q = searchQuery.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
      const name = u.displayName?.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '') || '';
      const username = u.username?.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '') || '';
      return name.includes(q) || username.includes(q) || u.userId.includes(searchQuery);
    })
  );

  // Stats globales
  const totalXp = $derived(levels.reduce((sum, u) => sum + u.xp, 0));
  const avgLevel = $derived(levels.length > 0 ? Math.round(levels.reduce((sum, u) => sum + u.level, 0) / levels.length) : 0);
  const maxLevel = $derived(levels.length > 0 ? levels[0]?.level ?? 0 : 0);

  function formatXp(xp: number): string {
    if (xp >= 1_000_000) return `${(xp / 1_000_000).toFixed(1)}M`;
    if (xp >= 1_000) return `${(xp / 1_000).toFixed(1)}k`;
    return xp.toLocaleString();
  }

  function getRankColor(index: number) {
    if (index === 0) return 'amber';
    if (index === 1) return 'silver';
    if (index === 2) return 'bronze';
    return 'default';
  }
</script>

<svelte:head>
  <title>Classement Leveling — {guildName}</title>
  <meta name="description" content="Classement XP et niveaux des membres de {guildName} sur Discord." />
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800;900&family=JetBrains+Mono:wght@700&display=swap" rel="stylesheet" />
</svelte:head>

<div class="min-h-screen bg-[#060813] text-slate-100 relative overflow-x-hidden font-sans selection:bg-indigo-500/30 selection:text-white" style="font-family: 'Outfit', sans-serif;">
  
  <!-- Fond dynamique avec effets lumineux cosmiques -->
  <div class="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
    <div class="absolute top-[-25%] left-[-15%] w-[80vw] h-[80vw] rounded-full blur-[140px]" style="background: radial-gradient(circle, rgba(79, 70, 229, 0.15) 0%, rgba(79, 70, 229, 0.03) 50%, transparent 100%);"></div>
    <div class="absolute top-[25%] right-[-20%] w-[70vw] h-[70vw] rounded-full blur-[160px]" style="background: radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, rgba(139, 92, 246, 0.02) 50%, transparent 100%);"></div>
    <div class="absolute bottom-[-15%] left-[10%] w-[60vw] h-[60vw] rounded-full blur-[120px]" style="background: radial-gradient(circle, rgba(6, 182, 212, 0.1) 0%, rgba(6, 182, 212, 0.02) 50%, transparent 100%);"></div>
    
    <!-- Grille de points subtile de style moderne -->
    <div class="absolute inset-0 opacity-[0.03]" style="background-image: linear-gradient(to right, #808080 1px, transparent 1px), linear-gradient(to bottom, #808080 1px, transparent 1px); background-size: 24px 24px;"></div>
  </div>

  <div class="relative z-10 w-full max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">

    <!-- ─── En-tête de page premium ─── -->
    <header class="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-slate-900/40 backdrop-blur-2xl p-8 rounded-4xl border border-white/10 shadow-2xl overflow-hidden group">
      <!-- Ligne d'accent lumineuse supérieure -->
      <div class="absolute top-0 left-0 w-full h-[2px] bg-linear-to-r from-transparent via-indigo-500/50 to-transparent group-hover:via-indigo-400 transition-all duration-700"></div>
      
      <div class="flex items-center gap-6">
        {#if guildIcon}
          <div class="relative group">
            <div class="absolute inset-0 bg-indigo-500/30 rounded-2xl blur-lg scale-110 group-hover:scale-125 transition-transform duration-500"></div>
            <img src={guildIcon} alt="{guildName} Logo" class="relative w-20 h-20 rounded-2xl border border-white/10 shadow-2xl object-cover transform group-hover:rotate-3 transition-transform duration-500" />
          </div>
        {:else}
          <div class="relative w-20 h-20 bg-linear-to-br from-indigo-500/20 to-violet-500/20 rounded-2xl flex items-center justify-center font-black text-2xl text-indigo-300 border border-indigo-500/30 shadow-2xl shrink-0">
            <div class="absolute inset-0 bg-indigo-500/10 rounded-2xl blur-md"></div>
            <span class="relative z-10">{guildName.slice(0, 2).toUpperCase()}</span>
          </div>
        {/if}
        
        <div class="space-y-1">
          <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight bg-linear-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
            {guildName}
          </h1>
          <div class="flex items-center gap-2 text-indigo-300/60 font-semibold text-sm">
            <Papicon icon="Trophy" size={14} class="text-indigo-400" />
            <span>Classement XP & Niveaux</span>
          </div>
        </div>
      </div>

      <!-- Badge "Live" vibrant -->
      <div class="flex items-center gap-2.5 self-start sm:self-auto px-4.5 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 shadow-lg shadow-emerald-500/5 hover:bg-emerald-500/15 transition-colors">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
        <span class="w-2 h-2 rounded-full bg-emerald-400 absolute"></span>
        <span class="text-[10px] font-black uppercase tracking-widest text-emerald-400">Temps Réel</span>
      </div>
    </header>

    {#if loading}
      <!-- Skeletons animés premiums -->
      <div class="space-y-6">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {#each Array(4) as _}
            <Skeleton height="95px" radius="1.5rem" />
          {/each}
        </div>
        <Skeleton height="260px" radius="2rem" />
        <Skeleton height="500px" radius="2rem" />
      </div>

    {:else if errorMsg}
      <!-- Interface d'erreur élégante -->
      <div class="bg-red-500/5 border border-red-500/20 p-12 rounded-4xl text-center space-y-4 shadow-2xl relative overflow-hidden">
        <div class="absolute inset-0 blur-xl" style="background: radial-gradient(circle, rgba(239, 68, 68, 0.05) 0%, transparent 70%);"></div>
        <div class="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-400 mx-auto border border-red-500/20 shadow-lg shadow-red-500/5">
          <Papicon icon="AlertTriangle" size={24} />
        </div>
        <div class="space-y-1.5 relative z-10">
          <p class="text-red-400 font-extrabold text-xl">Une erreur est survenue</p>
          <p class="text-slate-400 text-sm max-w-md mx-auto leading-relaxed">{errorMsg}</p>
        </div>
      </div>

    {:else if !enabled}
      <!-- Interface module désactivé -->
      <div class="bg-slate-900/20 border border-white/5 p-16 rounded-4xl text-center flex flex-col items-center space-y-6 shadow-2xl relative overflow-hidden">
        <div class="absolute inset-0 blur-2xl" style="background: radial-gradient(circle, rgba(99, 102, 241, 0.05) 0%, transparent 70%);"></div>
        <div class="w-20 h-20 rounded-full bg-slate-800/60 border border-white/10 flex items-center justify-center text-indigo-400 shadow-inner animate-pulse">
          <Papicon icon="Lock" size={32} />
        </div>
        <div class="space-y-2 max-w-sm relative z-10">
          <h2 class="text-2xl font-black text-slate-200">Classement Inactif</h2>
          <p class="text-slate-400/80 font-medium text-sm leading-relaxed">
            Le module de Leveling n'est pas activé sur ce serveur ou le classement a été masqué par les administrateurs.
          </p>
        </div>
      </div>

    {:else}

      <!-- ─── Stats globales en verres translucides ─── -->
      {#if levels.length > 0}
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div class="bg-slate-900/40 border border-white/10 rounded-3xl p-5 text-center space-y-2 hover:border-indigo-500/30 transition-all hover:bg-slate-900/60 shadow-xl group">
            <p class="text-3xl font-extrabold text-indigo-300 group-hover:scale-105 transition-transform duration-300 tabular-nums">{levels.length}</p>
            <p class="text-[10px] font-extrabold text-slate-400/60 uppercase tracking-widest">Membres Classés</p>
          </div>
          <div class="bg-slate-900/40 border border-white/10 rounded-3xl p-5 text-center space-y-2 hover:border-amber-500/30 transition-all hover:bg-slate-900/60 shadow-xl group">
            <p class="text-3xl font-extrabold text-amber-300 group-hover:scale-105 transition-transform duration-300 tabular-nums">{maxLevel}</p>
            <p class="text-[10px] font-extrabold text-slate-400/60 uppercase tracking-widest">Niveau Max</p>
          </div>
          <div class="bg-slate-900/40 border border-white/10 rounded-3xl p-5 text-center space-y-2 hover:border-violet-500/30 transition-all hover:bg-slate-900/60 shadow-xl group">
            <p class="text-3xl font-extrabold text-violet-300 group-hover:scale-105 transition-transform duration-300 tabular-nums">{avgLevel}</p>
            <p class="text-[10px] font-extrabold text-slate-400/60 uppercase tracking-widest">Niveau Moyen</p>
          </div>
          <div class="bg-slate-900/40 border border-white/10 rounded-3xl p-5 text-center space-y-2 hover:border-cyan-500/30 transition-all hover:bg-slate-900/60 shadow-xl group">
            <p class="text-3xl font-extrabold text-cyan-300 group-hover:scale-105 transition-transform duration-300 tabular-nums">{formatXp(totalXp)}</p>
            <p class="text-[10px] font-extrabold text-slate-400/60 uppercase tracking-widest">XP Total Cumulé</p>
          </div>
        </div>
      {/if}

      <!-- ─── Section Top 3 Sleek Cards ─── -->
      {#if !searchQuery && levels.length > 0}
        <div class="space-y-4">
          <h3 class="text-xs font-black uppercase tracking-widest text-slate-400/50 flex items-center gap-2 ml-2">
            <Papicon icon="Trophy" size={14} class="text-amber-500" />
            <span>Le Trio de Tête</span>
          </h3>
          
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 relative z-10">
            
            <!-- Rank 2 Card -->
            {#if levels[1]}
              <div class="relative bg-slate-900/30 border border-white/5 rounded-3xl p-6 flex flex-col justify-between hover:border-slate-500/20 transition-all duration-300 group shadow-lg order-2 sm:order-1">
                <div class="flex items-start justify-between">
                  <div class="relative">
                    <img
                      src={levels[1].avatarUrl || 'https://cdn.discordapp.com/embed/avatars/1.png'}
                      alt=""
                      class="w-16 h-16 rounded-2xl object-cover border border-white/10"
                    />
                    <!-- Rank indicator -->
                    <div class="absolute -bottom-2 -right-2 bg-slate-800 text-slate-300 border border-white/10 w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs font-mono">
                      2
                    </div>
                  </div>
                  <!-- Badge or Medal Icon -->
                  <div class="text-slate-400">
                    <Papicon icon="Medal" size={20} />
                  </div>
                </div>
                
                <div class="mt-6 space-y-4">
                  <div class="space-y-0.5">
                    <p class="font-bold text-slate-100 truncate group-hover:text-white" title={levels[1].displayName}>
                      {levels[1].displayName || levels[1].username || 'Inconnu'}
                    </p>
                    {#if levels[1].username && levels[1].displayName !== levels[1].username}
                      <p class="text-xs text-slate-500 font-medium truncate">@{levels[1].username}</p>
                    {/if}
                  </div>
                  
                  <div class="flex items-center justify-between border-t border-white/5 pt-3 text-xs">
                    <span class="text-slate-400 font-semibold">Niveau {levels[1].level}</span>
                    <span class="text-slate-400 font-mono font-medium">{formatXp(levels[1].xp)} XP</span>
                  </div>
                </div>
              </div>
            {/if}

            <!-- Rank 1 Card (Highlighted) -->
            {#if levels[0]}
              <div class="relative bg-slate-900/50 border border-amber-500/20 rounded-3xl overflow-hidden p-6 flex flex-col justify-between hover:border-amber-500/35 transition-all duration-300 group shadow-xl ring-1 ring-amber-500/10 order-1 sm:order-2">
                <!-- Top accent bar -->
                <div class="absolute top-0 inset-x-0 h-1 bg-linear-to-r from-amber-500 to-yellow-450"></div>
                
                <div class="flex items-start justify-between mt-1">
                  <div class="relative">
                    <img
                      src={levels[0].avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                      alt=""
                      class="w-20 h-20 rounded-2xl object-cover border border-amber-500/30"
                    />
                    <!-- Rank indicator -->
                    <div class="absolute -bottom-2 -right-2 bg-amber-500 text-amber-950 w-7 h-7 rounded-lg flex items-center justify-center font-black text-sm font-mono shadow-md">
                      1
                    </div>
                  </div>
                  <!-- Crown Icon -->
                  <div class="text-amber-450 filter drop-shadow-[0_0_8px_rgba(245,158,11,0.3)]">
                    <Papicon icon="Crown" size={24} />
                  </div>
                </div>
                
                <div class="mt-6 space-y-4">
                  <div class="space-y-0.5">
                    <p class="font-extrabold text-white text-lg truncate group-hover:text-amber-200" title={levels[0].displayName}>
                      {levels[0].displayName || levels[0].username || 'Inconnu'}
                    </p>
                    {#if levels[0].username && levels[0].displayName !== levels[0].username}
                      <p class="text-xs text-amber-500/70 font-medium truncate">@{levels[0].username}</p>
                    {/if}
                  </div>
                  
                  <div class="flex items-center justify-between border-t border-amber-500/10 pt-3 text-sm">
                    <span class="text-amber-300 font-extrabold">Niveau {levels[0].level}</span>
                    <span class="text-amber-450 font-mono font-bold">{formatXp(levels[0].xp)} XP</span>
                  </div>
                </div>
              </div>
            {/if}

            <!-- Rank 3 Card -->
            {#if levels[2]}
              <div class="relative bg-slate-900/30 border border-white/5 rounded-3xl p-6 flex flex-col justify-between hover:border-slate-500/20 transition-all duration-300 group shadow-lg order-3">
                <div class="flex items-start justify-between">
                  <div class="relative">
                    <img
                      src={levels[2].avatarUrl || 'https://cdn.discordapp.com/embed/avatars/2.png'}
                      alt=""
                      class="w-16 h-16 rounded-2xl object-cover border border-white/10"
                    />
                    <!-- Rank indicator -->
                    <div class="absolute -bottom-2 -right-2 bg-slate-800 text-amber-600/80 border border-white/10 w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs font-mono">
                      3
                    </div>
                  </div>
                  <!-- Badge or Medal Icon -->
                  <div class="text-amber-700/80">
                    <Papicon icon="Medal" size={20} />
                  </div>
                </div>
                
                <div class="mt-6 space-y-4">
                  <div class="space-y-0.5">
                    <p class="font-bold text-slate-100 truncate group-hover:text-white" title={levels[2].displayName}>
                      {levels[2].displayName || levels[2].username || 'Inconnu'}
                    </p>
                    {#if levels[2].username && levels[2].displayName !== levels[2].username}
                      <p class="text-xs text-slate-500 font-medium truncate">@{levels[2].username}</p>
                    {/if}
                  </div>
                  
                  <div class="flex items-center justify-between border-t border-white/5 pt-3 text-xs">
                    <span class="text-slate-400 font-semibold">Niveau {levels[2].level}</span>
                    <span class="text-slate-400 font-mono font-medium">{formatXp(levels[2].xp)} XP</span>
                  </div>
                </div>
              </div>
            {/if}

          </div>
        </div>
      {/if}

      <!-- ─── Liste Principale & Barre de Recherche ─── -->
      <section class="bg-slate-900/30 border border-white/10 rounded-[2.5rem] p-6 sm:p-8 space-y-6 shadow-2xl backdrop-blur-3xl">
        
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <h3 class="text-lg font-extrabold flex items-center gap-3">
            <span class="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-inner">
              <Papicon icon="Grades" size={18} />
            </span>
            <span>Membres du Serveur</span>
          </h3>

          <!-- Recherche premium -->
          <div class="relative w-full sm:w-80">
            <input
              type="text"
              id="leaderboard-search"
              placeholder="Rechercher un membre..."
              bind:value={searchQuery}
              class="w-full bg-slate-950/50 border border-white/10 rounded-2xl px-4 py-3 pl-11 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/15 transition-all shadow-inner"
            />
            <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 flex items-center">
              <Papicon icon="Search" size={14} />
            </div>
            {#if searchQuery}
              <button
                onclick={() => searchQuery = ''}
                class="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/5 hover:bg-red-500/10 hover:text-red-400 text-slate-400 flex items-center justify-center text-[10px] font-bold transition-all"
              >✕</button>
            {/if}
          </div>
        </div>

        <!-- Cartes du classement -->
        <div class="space-y-3 max-h-[650px] overflow-y-auto pr-1">
          {#each filteredLevels as userLvl}
            {@const index = levels.findIndex(l => l.userId === userLvl.userId)}
            {@const nextLvlXp = getXpForLevel(userLvl.level)}
            {@const prevLvlXp = getXpForLevel(userLvl.level - 1)}
            {@const progress = nextLvlXp - prevLvlXp > 0 ? ((userLvl.xp - prevLvlXp) / (nextLvlXp - prevLvlXp)) * 100 : 0}
            {@const percent = Math.min(100, Math.max(0, progress))}
            {@const color = getRankColor(index)}

            <button
              type="button"
              onclick={() => highlightedUserId = highlightedUserId === userLvl.userId ? null : userLvl.userId}
              class="flex w-full items-center gap-4 p-4 rounded-2xl border transition-all duration-300 text-left
                {highlightedUserId === userLvl.userId ? 'bg-indigo-500/10 border-indigo-500/30 shadow-lg' : 'bg-slate-900/20 border-white/5 hover:bg-slate-900/40 hover:border-white/10'}
                relative overflow-hidden group"
            >
              <!-- Effet de lueur hover -->
              <div class="absolute -right-16 top-1/2 -translate-y-1/2 w-32 h-32 bg-indigo-500/5 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>

              <!-- Rang -->
              <div class="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center font-extrabold text-sm font-mono
                {color === 'amber' ? 'bg-amber-400/15 text-amber-400 border border-amber-400/30' :
                 color === 'silver' ? 'bg-slate-300/15 text-slate-200 border border-slate-300/30' :
                 color === 'bronze' ? 'bg-amber-700/15 text-amber-600 border border-amber-700/30' :
                 'bg-slate-950/40 text-slate-400/60 border border-white/5'}">
                {index + 1}
              </div>

              <!-- Avatar -->
              <div class="relative shrink-0">
                <img
                  src={userLvl.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                  alt=""
                  class="w-11 h-11 rounded-xl object-cover border
                    {color === 'amber' ? 'border-amber-400/40 shadow-lg shadow-amber-400/5' :
                     color === 'silver' ? 'border-slate-300/40 shadow-lg shadow-slate-300/5' :
                     color === 'bronze' ? 'border-amber-700/40 shadow-lg shadow-amber-700/5' :
                     'border-white/10'}"
                />
              </div>

              <!-- Nom & Progression -->
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-2 mb-1.5">
                  <p class="text-sm font-extrabold text-slate-100 truncate group-hover:text-white transition-colors">{userLvl.displayName || userLvl.username || 'Inconnu'}</p>
                  {#if userLvl.username && userLvl.displayName !== userLvl.username}
                    <span class="text-[10px] text-slate-500 font-bold font-mono truncate">@{userLvl.username}</span>
                  {/if}
                </div>
                
                <!-- Barre de progression -->
                <div class="flex items-center gap-3">
                  <div class="flex-1 h-2 bg-slate-950/60 rounded-full overflow-hidden p-[2px] border border-white/5">
                    <div
                      class="h-full rounded-full transition-all duration-700
                        {color === 'amber' ? 'bg-linear-to-r from-amber-400 to-yellow-300' :
                         color === 'silver' ? 'bg-linear-to-r from-slate-200 to-slate-400' :
                         color === 'bronze' ? 'bg-linear-to-r from-amber-700 to-amber-500' :
                         'bg-linear-to-r from-indigo-500 to-cyan-400'}"
                      style="width: {percent}%"
                    ></div>
                  </div>
                  <span class="text-[9px] font-bold text-slate-400/50 whitespace-nowrap font-mono tracking-wide">{formatXp(userLvl.xp)} / {formatXp(nextLvlXp)} XP</span>
                </div>
              </div>

              <!-- Niveau badge -->
              <div class="shrink-0 text-right">
                <span class="text-xs font-black uppercase tracking-wider px-3.5 py-2 rounded-xl border whitespace-nowrap shadow-sm
                  {color === 'amber' ? 'bg-amber-400/10 text-amber-300 border-amber-400/20' :
                   color === 'silver' ? 'bg-slate-300/10 text-slate-200 border-slate-300/20' :
                   color === 'bronze' ? 'bg-amber-700/10 text-amber-600 border-amber-700/20' :
                   'bg-indigo-500/10 text-indigo-300 border-indigo-500/15'}">
                  Lvl {userLvl.level}
                </span>
              </div>
            </button>
          {:else}
            <!-- Aucun résultat de recherche -->
            <div class="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div class="w-16 h-16 rounded-full bg-slate-900/50 border border-white/5 flex items-center justify-center text-indigo-400 animate-bounce">
                {#if searchQuery}
                  <Papicon icon="Search" size={24} />
                {:else}
                  <Papicon icon="Trophy" size={24} />
                {/if}
              </div>
              <div class="space-y-1">
                <p class="text-slate-300 font-extrabold text-base">
                  {#if searchQuery}Aucun membre trouvé pour "{searchQuery}"{:else}Le classement est vide.{/if}
                </p>
                {#if searchQuery}
                  <button onclick={() => searchQuery = ''} class="text-indigo-400 text-xs font-semibold hover:underline">Effacer le filtre</button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </section>

      <!-- ─── Footer Kotbo ─── -->
      <footer class="flex flex-col sm:flex-row items-center justify-between gap-4 py-6 border-t border-white/5 text-center relative z-10">
        <p class="text-xs text-slate-500 font-semibold">
          Propulsé par le bot Discord <span class="text-indigo-400 font-extrabold">Kotbo</span> · Données synchronisées
        </p>
        <a
          href="/"
          class="text-xs font-black text-slate-500 hover:text-indigo-300 transition-colors tracking-widest uppercase flex items-center gap-1.5"
        >
          <span>Dashboard</span>
          <span>→</span>
        </a>
      </footer>

    {/if}
  </div>
</div>
