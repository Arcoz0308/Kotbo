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
    return xp.toString();
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
</svelte:head>

<!-- Fond cosmique animé -->
<div class="min-h-screen bg-[#07090f] text-white relative overflow-x-hidden">
  <!-- Décoration de fond -->
  <div class="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
    <div class="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] bg-indigo-600/10 rounded-full blur-[120px]"></div>
    <div class="absolute top-[30%] right-[-15%] w-[50vw] h-[50vw] bg-violet-600/8 rounded-full blur-[150px]"></div>
    <div class="absolute bottom-[-10%] left-[20%] w-[40vw] h-[40vw] bg-cyan-600/6 rounded-full blur-[100px]"></div>
  </div>

  <div class="relative z-10 w-full max-w-4xl mx-auto px-4 sm:px-8 py-10 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">

    <!-- ─── En-tête ─── -->
    <header class="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white/3 backdrop-blur-2xl p-7 sm:p-8 rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
      <!-- Shimmer accent -->
      <div class="absolute top-0 left-0 w-full h-px bg-linear-to-r from-transparent via-indigo-400/40 to-transparent"></div>

      <div class="flex items-center gap-5">
        {#if guildIcon}
          <div class="relative">
            <div class="absolute inset-0 bg-indigo-500/30 rounded-2xl blur-lg scale-110"></div>
            <img src={guildIcon} alt="{guildName} Logo" class="relative w-16 h-16 rounded-2xl border border-white/10 shadow-xl object-cover" />
          </div>
        {:else}
          <div class="w-16 h-16 bg-indigo-500/20 rounded-2xl flex items-center justify-center font-black text-xl text-indigo-300 border border-indigo-500/20 shadow-lg">
            {guildName.slice(0, 2).toUpperCase()}
          </div>
        {/if}
        <div>
          <h1 class="text-2xl sm:text-3xl font-black tracking-tight bg-linear-to-r from-indigo-300 via-violet-300 to-cyan-300 bg-clip-text text-transparent">
            {guildName}
          </h1>
          <p class="text-white/40 font-medium text-sm mt-0.5">Classement Leveling & Expérience</p>
        </div>
      </div>

      <div class="flex items-center gap-2 self-start sm:self-auto px-4 py-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span class="text-xs font-black uppercase tracking-widest text-emerald-400">Live</span>
      </div>
    </header>

    {#if loading}
      <!-- Skeletons -->
      <div class="space-y-4">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {#each Array(4) as _}
            <Skeleton height="90px" radius="1.5rem" />
          {/each}
        </div>
        <Skeleton height="220px" radius="2rem" />
        <Skeleton height="400px" radius="2rem" />
      </div>

    {:else if errorMsg}
      <div class="bg-red-500/10 border border-red-500/20 p-10 rounded-3xl text-center space-y-3">
        <div class="text-4xl">⚠️</div>
        <p class="text-red-400 font-black text-lg">Une erreur est survenue</p>
        <p class="text-white/50 text-sm font-medium">{errorMsg}</p>
      </div>

    {:else if !enabled}
      <div class="bg-white/3 border border-white/8 p-16 rounded-3xl text-center flex flex-col items-center space-y-5">
        <div class="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center text-4xl">🔒</div>
        <h2 class="text-2xl font-black text-white/70">Classement Inactif</h2>
        <p class="text-white/40 font-medium text-sm max-w-sm">
          Le module Leveling & XP n'est pas activé pour ce serveur ou le classement a été désactivé par un administrateur.
        </p>
      </div>

    {:else}

      <!-- ─── Stats globales ─── -->
      {#if levels.length > 0}
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div class="bg-white/3 border border-white/8 rounded-2xl p-5 text-center space-y-1.5 hover:border-indigo-500/30 transition-colors group">
            <p class="text-2xl sm:text-3xl font-black text-indigo-300 group-hover:scale-110 transition-transform inline-block">{levels.length}</p>
            <p class="text-[10px] font-bold text-white/30 uppercase tracking-widest">Membres classés</p>
          </div>
          <div class="bg-white/3 border border-white/8 rounded-2xl p-5 text-center space-y-1.5 hover:border-amber-500/30 transition-colors group">
            <p class="text-2xl sm:text-3xl font-black text-amber-300 group-hover:scale-110 transition-transform inline-block">{maxLevel}</p>
            <p class="text-[10px] font-bold text-white/30 uppercase tracking-widest">Niveau max</p>
          </div>
          <div class="bg-white/3 border border-white/8 rounded-2xl p-5 text-center space-y-1.5 hover:border-violet-500/30 transition-colors group">
            <p class="text-2xl sm:text-3xl font-black text-violet-300 group-hover:scale-110 transition-transform inline-block">{avgLevel}</p>
            <p class="text-[10px] font-bold text-white/30 uppercase tracking-widest">Niveau moyen</p>
          </div>
          <div class="bg-white/3 border border-white/8 rounded-2xl p-5 text-center space-y-1.5 hover:border-cyan-500/30 transition-colors group">
            <p class="text-2xl sm:text-3xl font-black text-cyan-300 group-hover:scale-110 transition-transform inline-block">{formatXp(totalXp)}</p>
            <p class="text-[10px] font-bold text-white/30 uppercase tracking-widest">XP Total</p>
          </div>
        </div>
      {/if}

      <!-- ─── Classement principal ─── -->
      <section class="bg-white/3 border border-white/8 rounded-3xl overflow-hidden shadow-2xl">
        <!-- Titre + Recherche -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 sm:p-8 border-b border-white/8">
          <h2 class="text-xl font-black flex items-center gap-3 text-white">
            <span class="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/20 flex items-center justify-center text-indigo-300">
              <Papicon icon="Grades" size={18} />
            </span>
            Top {levels.length} Leaderboard
          </h2>

          <div class="relative w-full sm:w-72">
            <input
              type="text"
              id="leaderboard-search"
              placeholder="Rechercher un membre..."
              bind:value={searchQuery}
              class="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 pl-10 text-sm text-white focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 placeholder:text-white/25 transition-all"
            />
            <div class="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 text-xs">🔍</div>
            {#if searchQuery}
              <button
                onclick={() => searchQuery = ''}
                class="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-red-400 text-xs font-bold transition-colors"
              >✕</button>
            {/if}
          </div>
        </div>

        <!-- ─── Podium Top 3 ─── -->
        {#if !searchQuery && levels.length > 0}
          <div class="relative px-6 py-10 border-b border-white/8 bg-linear-to-b from-indigo-950/20 to-transparent overflow-hidden">
            <!-- Étoiles décoratives -->
            <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
              {#each Array(12) as _, i}
                <div
                  class="absolute w-1 h-1 rounded-full bg-white/20 animate-pulse"
                  style="top: {10 + (i * 7) % 80}%; left: {5 + (i * 8.3) % 90}%; animation-delay: {i * 0.4}s"
                ></div>
              {/each}
            </div>

            <div class="grid grid-cols-3 gap-6 items-end max-w-2xl mx-auto">
              <!-- 2ème Place -->
              {#if levels[1]}
                <div class="flex flex-col items-center text-center gap-3">
                  <div class="relative">
                    <div class="absolute -top-5 left-1/2 -translate-x-1/2 text-xl leading-none">🥈</div>
                    <div class="absolute inset-0 bg-slate-400/20 rounded-full blur-md scale-150"></div>
                    <img
                      src={levels[1].avatarUrl || 'https://cdn.discordapp.com/embed/avatars/1.png'}
                      alt=""
                      class="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-slate-300/50 shadow-xl object-cover"
                    />
                    <div class="absolute -bottom-2 -right-1.5 w-6 h-6 rounded-full bg-slate-300 text-slate-900 flex items-center justify-center font-black text-xs shadow-lg">2</div>
                  </div>
                  <div class="min-w-0 w-full">
                    <p class="text-sm font-black text-white truncate" title={levels[1].displayName}>{levels[1].displayName || 'Inconnu'}</p>
                    <p class="text-[10px] text-white/40 font-bold mt-0.5">Niv. {levels[1].level}</p>
                    <p class="text-[11px] text-slate-400 font-black">{formatXp(levels[1].xp)} XP</p>
                  </div>
                </div>
              {/if}

              <!-- 1ère Place -->
              {#if levels[0]}
                <div class="flex flex-col items-center text-center gap-3 -translate-y-5">
                  <div class="relative">
                    <div class="absolute -top-7 left-1/2 -translate-x-1/2 text-2xl leading-none animate-bounce">👑</div>
                    <div class="absolute inset-0 bg-amber-400/25 rounded-full blur-xl scale-[1.8]"></div>
                    <div class="absolute inset-0 rounded-full ring-4 ring-amber-400/30 blur-md scale-125"></div>
                    <img
                      src={levels[0].avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                      alt=""
                      class="relative w-20 h-20 sm:w-28 sm:h-28 rounded-full border-4 border-amber-400/80 shadow-2xl shadow-amber-400/30 object-cover"
                    />
                    <div class="absolute -bottom-2 -right-1.5 w-7 h-7 rounded-full bg-amber-400 text-amber-950 flex items-center justify-center font-black text-sm shadow-xl">1</div>
                  </div>
                  <div class="min-w-0 w-full">
                    <p class="text-base font-black text-white truncate" title={levels[0].displayName}>{levels[0].displayName || 'Inconnu'}</p>
                    <p class="text-[10px] text-amber-400/80 font-extrabold uppercase tracking-wider mt-0.5">Niv. {levels[0].level}</p>
                    <p class="text-xs text-amber-300 font-black">{formatXp(levels[0].xp)} XP</p>
                  </div>
                </div>
              {/if}

              <!-- 3ème Place -->
              {#if levels[2]}
                <div class="flex flex-col items-center text-center gap-3">
                  <div class="relative">
                    <div class="absolute -top-5 left-1/2 -translate-x-1/2 text-xl leading-none">🥉</div>
                    <div class="absolute inset-0 bg-amber-700/20 rounded-full blur-md scale-150"></div>
                    <img
                      src={levels[2].avatarUrl || 'https://cdn.discordapp.com/embed/avatars/2.png'}
                      alt=""
                      class="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-amber-700/50 shadow-xl object-cover"
                    />
                    <div class="absolute -bottom-2 -right-1.5 w-6 h-6 rounded-full bg-amber-700 text-amber-100 flex items-center justify-center font-black text-xs shadow-lg">3</div>
                  </div>
                  <div class="min-w-0 w-full">
                    <p class="text-sm font-black text-white truncate" title={levels[2].displayName}>{levels[2].displayName || 'Inconnu'}</p>
                    <p class="text-[10px] text-white/40 font-bold mt-0.5">Niv. {levels[2].level}</p>
                    <p class="text-[11px] text-amber-600 font-black">{formatXp(levels[2].xp)} XP</p>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- ─── Liste complète ─── -->
        <div class="divide-y divide-white/5">
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
              class="flex w-full items-center gap-4 px-5 sm:px-7 py-4 text-left
                {highlightedUserId === userLvl.userId ? 'bg-indigo-500/10' : 'hover:bg-white/3'}
                {index < 3 ? 'hover:bg-white/5' : ''}
                transition-colors group"
            >
              <!-- Rang -->
              <div class="w-9 h-9 rounded-full shrink-0 flex items-center justify-center font-black text-sm
                {color === 'amber' ? 'bg-amber-400/15 text-amber-400 ring-1 ring-amber-400/30' :
                 color === 'silver' ? 'bg-slate-300/15 text-slate-300 ring-1 ring-slate-300/30' :
                 color === 'bronze' ? 'bg-amber-700/15 text-amber-600 ring-1 ring-amber-700/30' :
                 'bg-white/5 text-white/40'}">
                {index + 1}
              </div>

              <!-- Avatar -->
              <div class="relative shrink-0">
                <img
                  src={userLvl.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                  alt=""
                  class="w-10 h-10 rounded-full border object-cover
                    {color === 'amber' ? 'border-amber-400/40' :
                     color === 'silver' ? 'border-slate-300/40' :
                     color === 'bronze' ? 'border-amber-700/40' :
                     'border-white/10'}"
                />
              </div>

              <!-- Nom & Progression -->
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-2 mb-1.5">
                  <p class="text-sm font-black text-white truncate">{userLvl.displayName || userLvl.username || 'Inconnu'}</p>
                  {#if userLvl.username && userLvl.displayName !== userLvl.username}
                    <span class="text-[10px] text-white/25 font-semibold font-mono truncate">@{userLvl.username}</span>
                  {/if}
                </div>
                <!-- Barre de progression -->
                <div class="flex items-center gap-2.5">
                  <div class="flex-1 h-1.5 bg-white/8 rounded-full overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all duration-700
                        {color === 'amber' ? 'bg-linear-to-r from-amber-400 to-yellow-300' :
                         color === 'silver' ? 'bg-linear-to-r from-slate-300 to-slate-400' :
                         color === 'bronze' ? 'bg-linear-to-r from-amber-700 to-amber-500' :
                         'bg-linear-to-r from-indigo-500 to-violet-500'}"
                      style="width: {percent}%"
                    ></div>
                  </div>
                  <span class="text-[9px] font-bold text-white/25 whitespace-nowrap tabular-nums">{formatXp(userLvl.xp)} / {formatXp(nextLvlXp)}</span>
                </div>
              </div>

              <!-- Niveau badge -->
              <div class="shrink-0 text-right">
                <span class="text-[11px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full border whitespace-nowrap
                  {color === 'amber' ? 'bg-amber-400/10 text-amber-300 border-amber-400/25' :
                   color === 'silver' ? 'bg-slate-300/10 text-slate-300 border-slate-300/25' :
                   color === 'bronze' ? 'bg-amber-700/10 text-amber-600 border-amber-700/25' :
                   'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'}">
                  Lvl {userLvl.level}
                </span>
              </div>
            </button>
          {:else}
            <div class="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div class="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-3xl">
                {#if searchQuery}🔍{:else}🏆{/if}
              </div>
              <div>
                <p class="text-white/60 font-black text-base">
                  {#if searchQuery}Aucun résultat pour "{searchQuery}"{:else}Aucun membre dans le classement.{/if}
                </p>
                {#if searchQuery}
                  <button onclick={() => searchQuery = ''} class="text-indigo-400 text-xs font-bold mt-1 hover:underline">Effacer la recherche</button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </section>

      <!-- ─── Footer Kotbo ─── -->
      <footer class="flex flex-col sm:flex-row items-center justify-between gap-3 py-4 border-t border-white/5 text-center">
        <p class="text-xs text-white/20 font-medium">
          Propulsé par <span class="text-indigo-400 font-black">Kotbo</span> · Données mises à jour en temps réel
        </p>
        <a
          href="/"
          class="text-xs font-black text-white/20 hover:text-indigo-400 transition-colors tracking-widest uppercase"
        >
          Dashboard →
        </a>
      </footer>

    {/if}
  </div>
</div>
