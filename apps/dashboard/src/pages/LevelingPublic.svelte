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
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800;900&family=Architects+Daughter&family=Caveat:wght@600;700&family=JetBrains+Mono:wght@700&display=swap" rel="stylesheet" />
</svelte:head>

<div class="min-h-screen whiteboard-container relative overflow-x-hidden selection:bg-yellow-200 dark:selection:bg-slate-700 selection:text-slate-900 dark:selection:text-slate-100 py-12 px-4 sm:px-6 z-10">
  
  <!-- Tableau blanc / Tableau noir - Fond quadrillé de gribouillage -->
  <div class="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
    <!-- Ligne de marge rouge/rose sur le côté gauche -->
    <div class="absolute top-0 bottom-0 left-[6%] sm:left-[10%] w-[2px] bg-red-400/35 dark:bg-pink-500/20 hidden md:block"></div>
    
    <!-- Quelques petits gribouillages ou taches de feutre en arrière-plan -->
    <div class="absolute top-16 left-[12%] text-blue-500/10 dark:text-sky-400/15 rotate-[15deg] hidden lg:block">
      <!-- Flèche dessinée à la main -->
      <svg class="w-24 h-24" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <path d="M10,20 C30,35 45,15 75,55" />
        <path d="M55,52 L75,55 L70,35" />
      </svg>
    </div>
    
    <div class="absolute top-48 right-[10%] text-red-500/10 dark:text-red-400/15 rotate-[-12deg] hidden lg:block">
      <!-- Étoile dessinée à la main -->
      <svg class="w-20 h-20" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M50,10 L60,35 L85,35 L65,55 L75,80 L50,65 L25,80 L35,55 L15,35 L40,35 Z" />
      </svg>
    </div>

    <div class="absolute bottom-24 left-[8%] text-emerald-500/10 dark:text-emerald-400/15 rotate-[20deg] hidden lg:block">
      <!-- Checkmark dessiné à la main -->
      <svg class="w-16 h-16" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <path d="M20,50 L40,75 L80,25" />
      </svg>
    </div>
  </div>

  <div class="relative z-10 w-full max-w-4xl mx-auto space-y-10 animate-in fade-in duration-500">

    <!-- ─── En-tête style Feuille scotchée ─── -->
    <header class="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white dark:bg-[#1c2b25] border-2 border-slate-800 dark:border-slate-300 p-8 rounded-[15px_30px_12px_25px/25px_12px_30px_15px] shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(241,245,249,0.9)] overflow-hidden group rotate-[-0.5deg]">
      <!-- Tapes (masking tape) aux coins -->
      <div class="absolute -top-3 left-8 w-24 h-6 bg-yellow-200/60 dark:bg-yellow-950/40 rotate-[-12deg] border-x border-dashed border-yellow-400/40 dark:border-yellow-750/20 shadow-sm pointer-events-none z-20"></div>
      <div class="absolute -top-3 right-8 w-24 h-6 bg-yellow-200/60 dark:bg-yellow-950/40 rotate-[15deg] border-x border-dashed border-yellow-400/40 dark:border-yellow-750/20 shadow-sm pointer-events-none z-20"></div>
      
      <div class="flex items-center gap-6">
        {#if guildIcon}
          <div class="relative shrink-0">
            <!-- Cadre Polaroid pour l'image -->
            <div class="bg-white dark:bg-[#121e1a] p-2 border-2 border-slate-800 dark:border-slate-400 shadow-md rotate-[-3deg] group-hover:rotate-[3deg] transition-transform duration-300">
              <img src={guildIcon} alt="{guildName} Logo" class="w-16 h-16 object-cover border border-slate-200 dark:border-slate-700" />
              <div class="h-4"></div>
            </div>
          </div>
        {:else}
          <div class="relative w-16 h-16 bg-sky-100 dark:bg-sky-950/30 border-2 border-slate-800 dark:border-slate-300 rounded-xl flex items-center justify-center font-bold text-xl text-slate-800 dark:text-slate-100 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] dark:shadow-[2px_2px_0px_0px_rgba(241,245,249,0.9)] shrink-0 rotate-[3deg]">
            <span>{guildName.slice(0, 2).toUpperCase()}</span>
          </div>
        {/if}
        
        <div class="space-y-1 relative">
          <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100 marker-font">
            {guildName}
          </h1>
          <div class="relative flex items-center gap-2 text-slate-600 dark:text-slate-350 font-semibold text-sm handwritten text-lg">
            <span class="text-amber-600 dark:text-amber-400 flex items-center"><Papicon icon="Trophy" size={16} /></span>
            <span class="relative">
              Classement XP & Niveaux
              <!-- Soulignement au feutre rouge/rose -->
              <svg class="absolute -bottom-1 left-0 w-full h-2 text-red-500/80 dark:text-red-400/90" viewBox="0 0 100 10" preserveAspectRatio="none">
                <path d="M0,5 Q50,2 100,5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
              </svg>
            </span>
          </div>
        </div>
      </div>

      <!-- Badge "Live" feutre vert -->
      <div class="flex items-center gap-2 self-start sm:self-auto px-4 py-2 rounded-full border-2 border-emerald-800 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-805 dark:text-emerald-300 shadow-[2px_2px_0px_0px_rgba(6,95,70,1)] dark:shadow-[2px_2px_0px_0px_rgba(16,185,129,0.8)] rotate-[1deg]">
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
        <span class="w-2 h-2 rounded-full bg-emerald-500 absolute"></span>
        <span class="text-xs font-black uppercase tracking-widest marker-font">Temps Réel</span>
      </div>
    </header>

    {#if loading}
      <!-- Loading Skeleton simple et propre -->
      <div class="space-y-6">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {#each Array(4) as _}
            <Skeleton height="95px" radius="1.25rem" />
          {/each}
        </div>
        <Skeleton height="260px" radius="1.5rem" />
        <Skeleton height="500px" radius="1.5rem" />
      </div>

    {:else if errorMsg}
      <!-- Style erreur surligné rouge -->
      <div class="bg-red-50 dark:bg-red-950/20 border-2 border-red-800 dark:border-red-500 p-12 rounded-2xl text-center space-y-4 shadow-[4px_4px_0px_0px_rgba(220,38,38,1)] dark:shadow-[4px_4px_0px_0px_rgba(239,68,68,0.8)] rotate-[-1deg]">
        <div class="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center text-red-800 dark:text-red-300 mx-auto border-2 border-red-805 dark:border-red-500">
          <Papicon icon="AlertTriangle" size={24} />
        </div>
        <div class="space-y-1.5">
          <p class="text-red-800 dark:text-red-300 font-extrabold text-xl marker-font">Une erreur est survenue</p>
          <p class="text-slate-700 dark:text-slate-300 text-sm max-w-md mx-auto leading-relaxed">{errorMsg}</p>
        </div>
      </div>

    {:else if !enabled}
      <!-- Style module désactivé -->
      <div class="bg-slate-100 dark:bg-[#1a2622] border-2 border-slate-800 dark:border-slate-400 p-16 rounded-2xl text-center flex flex-col items-center space-y-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(241,245,249,0.9)] rotate-[0.5deg]">
        <div class="w-20 h-20 rounded-full bg-slate-200 dark:bg-slate-800 border-2 border-slate-800 dark:border-slate-400 flex items-center justify-center text-slate-850 dark:text-slate-100">
          <Papicon icon="Lock" size={32} />
        </div>
        <div class="space-y-2 max-w-sm">
          <h2 class="text-2xl font-black text-slate-800 dark:text-slate-100 marker-font">Classement Inactif</h2>
          <p class="text-slate-600 dark:text-slate-400 font-medium text-sm leading-relaxed">
            Le module de Leveling n'est pas activé sur ce serveur ou le classement a été masqué par les administrateurs.
          </p>
        </div>
      </div>

    {:else}

      <!-- ─── Mini post-its de statistiques globales ─── -->
      {#if levels.length > 0}
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-6">
          
          <!-- Sticky Vert (Membres Classés) -->
          <div class="bg-[#ecfccb] dark:bg-[#202d24] border border-[#d9f99d] dark:border-[#15803d] rounded-sm p-5 text-center space-y-1 shadow-[3px_6px_10px_rgba(0,0,0,0.06)] dark:shadow-[3px_6px_10px_rgba(0,0,0,0.3)] hover:scale-105 transition-all rotate-[-1.5deg] relative group">
            <div class="absolute -top-2.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-red-500/80 dark:bg-red-400/80 border border-red-700 dark:border-red-500 shadow-sm pointer-events-none"></div>
            <p class="text-3.5xl font-black text-slate-800 dark:text-slate-205 marker-font tabular-nums">{levels.length}</p>
            <p class="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest marker-font">Membres Classés</p>
          </div>
          
          <!-- Sticky Jaune (Niveau Max) -->
          <div class="bg-[#fef9c3] dark:bg-[#3f3920] border border-[#fef08a] dark:border-[#854d0e] rounded-sm p-5 text-center space-y-1 shadow-[3px_6px_10px_rgba(0,0,0,0.06)] dark:shadow-[3px_6px_10px_rgba(0,0,0,0.3)] hover:scale-105 transition-all rotate-[1deg] relative group">
            <div class="absolute -top-2.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-blue-500/80 dark:bg-blue-400/80 border border-blue-700 dark:border-blue-500 shadow-sm pointer-events-none"></div>
            <p class="text-3.5xl font-black text-slate-800 dark:text-slate-205 marker-font tabular-nums">{maxLevel}</p>
            <p class="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest marker-font">Niveau Max</p>
          </div>
          
          <!-- Sticky Bleu (Niveau Moyen) -->
          <div class="bg-[#e0f2fe] dark:bg-[#1e2e38] border border-[#bae6fd] dark:border-[#0369a1] rounded-sm p-5 text-center space-y-1 shadow-[3px_6px_10px_rgba(0,0,0,0.06)] dark:shadow-[3px_6px_10px_rgba(0,0,0,0.3)] hover:scale-105 transition-all rotate-[-1deg] relative group">
            <div class="absolute -top-2.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-emerald-500/80 dark:bg-emerald-400/80 border border-emerald-700 dark:border-emerald-500 shadow-sm pointer-events-none"></div>
            <p class="text-3.5xl font-black text-slate-800 dark:text-slate-205 marker-font tabular-nums">{avgLevel}</p>
            <p class="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest marker-font">Niveau Moyen</p>
          </div>
          
          <!-- Sticky Rose (XP Cumulé) -->
          <div class="bg-[#fce7f3] dark:bg-[#341d26] border border-[#fbcfe8] dark:border-[#be185d] rounded-sm p-5 text-center space-y-1 shadow-[3px_6px_10px_rgba(0,0,0,0.06)] dark:shadow-[3px_6px_10px_rgba(0,0,0,0.3)] hover:scale-105 transition-all rotate-[2deg] relative group">
            <div class="absolute -top-2.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-amber-500/80 dark:bg-amber-400/80 border border-amber-700 dark:border-amber-500 shadow-sm pointer-events-none"></div>
            <p class="text-3.5xl font-black text-slate-800 dark:text-slate-205 marker-font tabular-nums">{formatXp(totalXp)}</p>
            <p class="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest marker-font">XP Cumulé</p>
          </div>
          
        </div>
      {/if}

      <!-- ─── Section Top 3 Post-its ─── -->
      {#if !searchQuery && levels.length > 0}
        <div class="space-y-4">
          <h3 class="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-2 ml-2 marker-font">
            <span class="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
            <span>Le Trio de Tête</span>
          </h3>
          
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 relative z-10">
            
            <!-- Rank 2 Post-it (Blue) -->
            {#if levels[1]}
              <div class="relative bg-[#e0f2fe] dark:bg-[#1e2e38] border-2 border-slate-800 dark:border-slate-300 rounded-sm p-6 flex flex-col justify-between hover:scale-[1.03] transition-all duration-300 group shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(241,245,249,0.9)] order-2 sm:order-1 rotate-[-2deg]">
                <!-- Scotch de fixation -->
                <div class="absolute -top-3 left-1/2 -translate-x-1/2 w-20 h-5 bg-yellow-200/50 dark:bg-yellow-950/30 border-x border-dashed border-yellow-400/40 dark:border-yellow-750/20 shadow-sm pointer-events-none z-10 rotate-[2deg]"></div>
                
                <div class="flex items-start justify-between">
                  <div class="relative">
                    <!-- Polaroid avatar -->
                    <div class="bg-white dark:bg-[#121e1a] p-2 border-2 border-slate-800 dark:border-slate-400 shadow-sm rotate-[-3deg] group-hover:rotate-[3deg] transition-transform">
                      <img
                        src={levels[1].avatarUrl || 'https://cdn.discordapp.com/embed/avatars/1.png'}
                        alt=""
                        class="w-16 h-16 object-cover border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                    <!-- Numéro entouré feutre bleu/cyan -->
                    <div class="absolute -bottom-2.5 -right-2.5 w-8 h-8 flex items-center justify-center text-blue-800 dark:text-sky-400 font-black text-sm pointer-events-none">
                      <svg class="absolute inset-0 w-full h-full text-blue-500 dark:text-sky-400" viewBox="0 0 40 40">
                        <path d="M 20 4 C 30 4, 37 10, 36 20 C 35 30, 27 36, 18 36 C 9 35, 4 28, 4 18 C 4 9, 11 4, 23 5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
                      </svg>
                      <span class="relative z-10 marker-font">2</span>
                    </div>
                  </div>
                  <!-- Medal Icon -->
                  <div class="text-slate-655 dark:text-slate-400">
                    <Papicon icon="Medal" size={22} />
                  </div>
                </div>
                
                <div class="mt-6 space-y-4">
                  <div class="space-y-0.5">
                    <p class="font-black text-slate-800 dark:text-slate-100 truncate marker-font text-base" title={levels[1].displayName}>
                      {levels[1].displayName || levels[1].username || 'Inconnu'}
                    </p>
                    {#if levels[1].username && levels[1].displayName !== levels[1].username}
                      <p class="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">@{levels[1].username}</p>
                    {/if}
                  </div>
                  
                  <div class="flex items-center justify-between border-t border-dashed border-slate-800 dark:border-slate-600 pt-3 text-xs">
                    <span class="text-slate-800 dark:text-slate-205 font-bold marker-font">Niveau {levels[1].level}</span>
                    <span class="text-slate-600 dark:text-slate-400 font-mono font-medium">{formatXp(levels[1].xp)} XP</span>
                  </div>
                </div>
              </div>
            {/if}

            <!-- Rank 1 Post-it (Yellow Highlighted) -->
            {#if levels[0]}
              <div class="relative bg-[#fef9c3] dark:bg-[#3f3920] border-2 border-slate-800 dark:border-slate-300 rounded-sm p-6 flex flex-col justify-between hover:scale-[1.04] transition-all duration-300 group shadow-[5px_5px_0px_0px_rgba(15,23,42,1)] dark:shadow-[5px_5px_0px_0px_rgba(241,245,249,0.9)] order-1 sm:order-2 rotate-[1.5deg]">
                <!-- Scotch de fixation -->
                <div class="absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-5 bg-yellow-200/60 dark:bg-yellow-950/30 border-x border-dashed border-yellow-400/40 dark:border-yellow-750/20 shadow-sm pointer-events-none z-10 rotate-[-2deg]"></div>
                
                <div class="flex items-start justify-between mt-1">
                  <div class="relative">
                    <!-- Polaroid avatar -->
                    <div class="bg-white dark:bg-[#121e1a] p-2 border-2 border-slate-800 dark:border-slate-400 shadow-md rotate-[-2deg] group-hover:rotate-[2deg] transition-transform">
                      <img
                        src={levels[0].avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                        alt=""
                        class="w-18 h-18 object-cover border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                    <!-- Numéro entouré feutre rouge -->
                    <div class="absolute -bottom-2.5 -right-2.5 w-9 h-9 flex items-center justify-center text-red-800 dark:text-red-400 font-black text-sm pointer-events-none">
                      <svg class="absolute inset-0 w-full h-full text-red-500 dark:text-red-400" viewBox="0 0 40 40">
                        <path d="M 20 4 C 30 4, 37 10, 36 20 C 35 30, 27 36, 18 36 C 9 35, 4 28, 4 18 C 4 9, 11 4, 23 5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" />
                      </svg>
                      <span class="relative z-10 marker-font text-base">1</span>
                    </div>
                  </div>
                  <!-- Crown Icon -->
                  <div class="text-amber-500 dark:text-amber-400 filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.1)]">
                    <Papicon icon="Crown" size={26} />
                  </div>
                </div>
                
                <div class="mt-6 space-y-4">
                  <div class="space-y-0.5">
                    <p class="font-black text-slate-800 dark:text-slate-100 text-lg truncate marker-font" title={levels[0].displayName}>
                      {levels[0].displayName || levels[0].username || 'Inconnu'}
                    </p>
                    {#if levels[0].username && levels[0].displayName !== levels[0].username}
                      <p class="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">@{levels[0].username}</p>
                    {/if}
                  </div>
                  
                  <div class="flex items-center justify-between border-t border-dashed border-slate-800 dark:border-slate-600 pt-3 text-sm">
                    <span class="text-slate-800 dark:text-slate-205 font-black marker-font text-base">Niveau {levels[0].level}</span>
                    <span class="text-slate-600 dark:text-slate-400 font-mono font-bold">{formatXp(levels[0].xp)} XP</span>
                  </div>
                </div>
              </div>
            {/if}

            <!-- Rank 3 Post-it (Pink) -->
            {#if levels[2]}
              <div class="relative bg-[#fce7f3] dark:bg-[#341d26] border-2 border-slate-800 dark:border-slate-300 rounded-sm p-6 flex flex-col justify-between hover:scale-[1.03] transition-all duration-300 group shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(241,245,249,0.9)] order-3 rotate-[2deg]">
                <!-- Scotch de fixation -->
                <div class="absolute -top-3 left-1/2 -translate-x-1/2 w-20 h-5 bg-yellow-200/50 dark:bg-yellow-950/30 border-x border-dashed border-yellow-400/40 dark:border-yellow-750/20 shadow-sm pointer-events-none z-10 rotate-[-1deg]"></div>
                
                <div class="flex items-start justify-between">
                  <div class="relative">
                    <!-- Polaroid avatar -->
                    <div class="bg-white dark:bg-[#121e1a] p-2 border-2 border-slate-800 dark:border-slate-400 shadow-sm rotate-[-1deg] group-hover:rotate-[1deg] transition-transform">
                      <img
                        src={levels[2].avatarUrl || 'https://cdn.discordapp.com/embed/avatars/2.png'}
                        alt=""
                        class="w-16 h-16 object-cover border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                    <!-- Numéro entouré feutre rose -->
                    <div class="absolute -bottom-2.5 -right-2.5 w-8 h-8 flex items-center justify-center text-slate-700 dark:text-pink-400 font-black text-sm pointer-events-none">
                      <svg class="absolute inset-0 w-full h-full text-slate-500 dark:text-pink-400" viewBox="0 0 40 40">
                        <path d="M 20 4 C 30 4, 37 10, 36 20 C 35 30, 27 36, 18 36 C 9 35, 4 28, 4 18 C 4 9, 11 4, 23 5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
                      </svg>
                      <span class="relative z-10 marker-font">3</span>
                    </div>
                  </div>
                  <!-- Medal Icon -->
                  <div class="text-amber-800 dark:text-amber-500">
                    <Papicon icon="Medal" size={22} />
                  </div>
                </div>
                
                <div class="mt-6 space-y-4">
                  <div class="space-y-0.5">
                    <p class="font-black text-slate-800 dark:text-slate-100 truncate marker-font text-base" title={levels[2].displayName}>
                      {levels[2].displayName || levels[2].username || 'Inconnu'}
                    </p>
                    {#if levels[2].username && levels[2].displayName !== levels[2].username}
                      <p class="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">@{levels[2].username}</p>
                    {/if}
                  </div>
                  
                  <div class="flex items-center justify-between border-t border-dashed border-slate-800 dark:border-slate-600 pt-3 text-xs">
                    <span class="text-slate-800 dark:text-slate-205 font-bold marker-font">Niveau {levels[2].level}</span>
                    <span class="text-slate-600 dark:text-slate-400 font-mono font-medium">{formatXp(levels[2].xp)} XP</span>
                  </div>
                </div>
              </div>
            {/if}

          </div>
        </div>
      {/if}

      <!-- ─── Liste Principale Tableau Blanc / Noir ─── -->
      <section class="bg-white dark:bg-[#1a2622] border-2 border-slate-800 dark:border-slate-300 rounded-[20px_10px_25px_12px/20px_25px_12px_20px] p-6 sm:p-8 space-y-6 shadow-[5px_5px_0px_0px_rgba(15,23,42,1)] dark:shadow-[5px_5px_0px_0px_rgba(241,245,249,0.9)] relative">
        
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <h3 class="text-lg font-black flex items-center gap-3 marker-font text-slate-800 dark:text-slate-100">
            <span class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-850 border-2 border-slate-800 dark:border-slate-400 flex items-center justify-center text-slate-800 dark:text-slate-200 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] dark:shadow-[2px_2px_0px_0px_rgba(241,245,249,0.9)]">
              <Papicon icon="Grades" size={18} />
            </span>
            <span>Membres du Serveur</span>
          </h3>

          <!-- Barre de recherche style croquis -->
          <div class="relative w-full sm:w-80">
            <input
              type="text"
              id="leaderboard-search"
              placeholder="Rechercher un membre..."
              bind:value={searchQuery}
              class="w-full bg-slate-50 dark:bg-[#121e1a] border-2 border-slate-800 dark:border-slate-400 rounded-xl px-4 py-3 pl-11 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:bg-white dark:focus:bg-[#15231e] focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 transition-all font-semibold"
            />
            <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 flex items-center">
              <Papicon icon="Search" size={14} />
            </div>
            {#if searchQuery}
              <button
                onclick={() => searchQuery = ''}
                class="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 hover:bg-red-100 dark:hover:bg-red-950/45 hover:text-red-700 dark:hover:text-red-300 text-slate-600 dark:text-slate-350 flex items-center justify-center text-[10px] font-bold transition-all"
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
              class="flex w-full items-center gap-4 p-4 rounded-xl border-2 transition-all duration-300 text-left
                {highlightedUserId === userLvl.userId ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-600 dark:border-amber-400 shadow-[3px_3px_0px_0px_rgba(217,119,6,1)] scale-[1.01]' : 'bg-white dark:bg-[#121e1a] border-slate-800 dark:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/40 hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:hover:shadow-[3px_3px_0px_0px_rgba(241,245,249,0.9)]'}"
            >
              <!-- Rang entouré au feutre / craie -->
              <div class="relative w-10 h-10 shrink-0 flex items-center justify-center font-extrabold text-sm pointer-events-none">
                {#if color === 'amber'}
                  <svg class="absolute inset-0 w-full h-full text-amber-500" viewBox="0 0 40 40">
                    <path d="M 20 4 C 30 4, 37 10, 36 20 C 35 30, 27 36, 18 36 C 9 35, 4 28, 4 18 C 4 9, 11 4, 23 5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
                  </svg>
                  <span class="relative z-10 marker-font text-amber-700 dark:text-yellow-405 text-base">{index + 1}</span>
                {:else if color === 'silver'}
                  <svg class="absolute inset-0 w-full h-full text-slate-500 dark:text-sky-400" viewBox="0 0 40 40">
                    <path d="M 20 4 C 30 4, 37 10, 36 20 C 35 30, 27 36, 18 36 C 9 35, 4 28, 4 18 C 4 9, 11 4, 23 5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                  </svg>
                  <span class="relative z-10 marker-font text-slate-700 dark:text-sky-300 text-base">{index + 1}</span>
                {:else if color === 'bronze'}
                  <svg class="absolute inset-0 w-full h-full text-amber-700 dark:text-pink-400" viewBox="0 0 40 40">
                    <path d="M 20 4 C 30 4, 37 10, 36 20 C 35 30, 27 36, 18 36 C 9 35, 4 28, 4 18 C 4 9, 11 4, 23 5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                  </svg>
                  <span class="relative z-10 marker-font text-amber-800 dark:text-pink-300 text-base">{index + 1}</span>
                {:else}
                  <svg class="absolute inset-0 w-full h-full text-slate-400 dark:text-slate-600" viewBox="0 0 40 40">
                    <path d="M 20 4 C 30 4, 37 10, 36 20 C 35 30, 27 36, 18 36 C 9 35, 4 28, 4 18 C 4 9, 11 4, 23 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                  </svg>
                  <span class="relative z-10 marker-font text-slate-600 dark:text-slate-400 text-base">{index + 1}</span>
                {/if}
              </div>

              <!-- Avatar Polaroid -->
              <div class="relative shrink-0 rotate-[-1deg] group-hover:rotate-[1deg] transition-transform">
                <img
                  src={userLvl.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                  alt=""
                  class="w-11 h-11 rounded-lg object-cover border-2 border-slate-800 dark:border-slate-400 shadow-sm"
                />
              </div>

              <!-- Nom & Progression -->
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-2 mb-1.5">
                  <p class="text-sm font-extrabold text-slate-800 dark:text-slate-105 truncate marker-font">{userLvl.displayName || userLvl.username || 'Inconnu'}</p>
                  {#if userLvl.username && userLvl.displayName !== userLvl.username}
                    <span class="text-[10px] text-slate-500 dark:text-slate-405 font-bold font-mono truncate">@{userLvl.username}</span>
                  {/if}
                </div>
                
                <!-- Barre de progression style surligneur feutre / craie -->
                <div class="flex items-center gap-3">
                  <div class="flex-1 h-3.5 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden p-[2px] border-2 border-slate-800 dark:border-slate-400">
                    <div
                      class="h-full rounded-md transition-all duration-700
                        {color === 'amber' ? 'bg-[#fef08a] dark:bg-[#fef08a]/75' :
                         color === 'silver' ? 'bg-[#bae6fd] dark:bg-[#bae6fd]/75' :
                         color === 'bronze' ? 'bg-[#fbcfe8] dark:bg-[#fbcfe8]/75' :
                         'bg-[#e0f2fe] dark:bg-emerald-500/40'}"
                      style="width: {percent}%"
                    ></div>
                  </div>
                  <span class="text-[9px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap font-mono tracking-wide">{formatXp(userLvl.xp)} / {formatXp(nextLvlXp)} XP</span>
                </div>
              </div>

              <!-- Niveau badge -->
              <div class="shrink-0 text-right">
                <span class="text-xs font-black uppercase tracking-wider px-3.5 py-2 rounded-xl border-2 border-slate-800 dark:border-slate-300 whitespace-nowrap shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] dark:shadow-[2px_2px_0px_0px_rgba(241,245,249,0.9)]
                  {color === 'amber' ? 'bg-[#fef9c3] dark:bg-[#3f3920] text-amber-800 dark:text-yellow-200 border-slate-800 dark:border-slate-300' :
                   color === 'silver' ? 'bg-[#e0f2fe] dark:bg-[#1e2e38] text-blue-800 dark:text-sky-205 border-slate-800 dark:border-slate-300' :
                   color === 'bronze' ? 'bg-[#fce7f3] dark:bg-[#341d26] text-pink-800 dark:text-pink-200 border-slate-800 dark:border-slate-300' :
                   'bg-[#ecfccb] dark:bg-[#202d24] text-slate-800 dark:text-emerald-200 border-slate-800 dark:border-slate-300'}">
                  Lvl {userLvl.level}
                </span>
              </div>
            </button>
          {:else}
            <!-- Aucun résultat -->
            <div class="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div class="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 border-2 border-slate-800 dark:border-slate-400 flex items-center justify-center text-slate-800 dark:text-slate-200 animate-bounce">
                {#if searchQuery}
                  <Papicon icon="Search" size={24} />
                {:else}
                  <Papicon icon="Trophy" size={24} />
                {/if}
              </div>
              <div class="space-y-1">
                <p class="text-slate-800 dark:text-slate-100 font-extrabold text-base marker-font">
                  {#if searchQuery}Aucun membre trouvé pour "{searchQuery}"{:else}Le classement est vide.{/if}
                </p>
                {#if searchQuery}
                  <button onclick={() => searchQuery = ''} class="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-205 text-xs font-bold underline">Effacer le filtre</button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </section>

      <!-- ─── Footer Kotbo style tableau de bord ─── -->
      <footer class="flex flex-col sm:flex-row items-center justify-between gap-4 py-6 border-t-2 border-dashed border-slate-800 dark:border-slate-450 text-center relative z-10">
        <p class="text-xs text-slate-600 dark:text-slate-400 marker-font text-base">
          Propulsé par le bot Discord <span class="text-slate-800 dark:text-slate-100 font-extrabold underline decoration-wavy decoration-yellow-450 dark:decoration-yellow-500">Kotbo</span> · Données synchronisées
        </p>
        <a
          href="/"
          class="text-xs font-black text-slate-800 dark:text-slate-100 hover:text-slate-500 dark:hover:text-slate-300 hover:underline transition-colors tracking-widest uppercase flex items-center gap-1.5 marker-font text-base"
        >
          <span>Dashboard</span>
          <span>→</span>
        </a>
      </footer>

    {/if}
  </div>
</div>

<style>
  /* Styles pour isoler le style du tableau blanc */
  .whiteboard-container {
    background-color: #faf9f5 !important;
    background-image: 
      radial-gradient(#cbd5e1 1.5px, transparent 1.5px) !important;
    background-size: 24px 24px !important;
    color: #0f172a !important;
    font-family: 'Outfit', sans-serif;
  }

  /* Mode sombre : Tableau noir / Ardoise de classe */
  :global(.dark) .whiteboard-container {
    background-color: #121e1a !important; /* Vert d'ardoise d'école */
    background-image: radial-gradient(#2d3c36 1.5px, transparent 1.5px) !important;
    color: #f1f5f9 !important;
  }

  .marker-font {
    font-family: 'Architects Daughter', sans-serif !important;
  }

  .handwritten {
    font-family: 'Caveat', cursive !important;
  }

  /* Custom scrollbar pour le style tableau blanc / ardoise */
  ::-webkit-scrollbar {
    width: 8px;
  }
  ::-webkit-scrollbar-track {
    background: #f1f5f9;
    border-radius: 4px;
    border: 1px solid #cbd5e1;
  }
  :global(.dark) ::-webkit-scrollbar-track {
    background: #172420;
    border: 1px solid #2d3c36;
  }
  ::-webkit-scrollbar-thumb {
    background: #94a3b8;
    border-radius: 4px;
    border: 1px solid #f1f5f9;
  }
  :global(.dark) ::-webkit-scrollbar-thumb {
    background: #2d4c40;
    border: 1px solid #172420;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: #64748b;
  }
  :global(.dark) ::-webkit-scrollbar-thumb:hover {
    background: #3a5e50;
  }
</style>
