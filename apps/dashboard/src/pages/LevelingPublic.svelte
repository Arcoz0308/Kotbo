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

<div class="min-h-screen whiteboard-container relative overflow-x-hidden selection:bg-yellow-100 dark:selection:bg-slate-850 py-12 px-4 sm:px-6 z-10">
  
  <div class="relative z-10 w-full max-w-4xl mx-auto space-y-10 animate-in fade-in duration-300">

    <!-- ─── En-tête style Feuille Index épuré ─── -->
    <header class="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white dark:bg-[#111a2e] border border-slate-200 dark:border-slate-800 p-8 rounded-2xl shadow-sm overflow-hidden group">
      <!-- Ruban adhésif subtil (masking tape) aux coins -->
      <div class="tape-accent"></div>
      
      <div class="flex items-center gap-5">
        {#if guildIcon}
          <div class="relative shrink-0">
            <img src={guildIcon} alt="{guildName} Logo" class="w-16 h-16 rounded-xl object-cover border border-slate-200 dark:border-slate-800" />
          </div>
        {:else}
          <div class="relative w-16 h-16 bg-slate-50 dark:bg-[#0c1322] border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-center font-bold text-xl text-slate-800 dark:text-slate-100 shrink-0">
            <span>{guildName.slice(0, 2).toUpperCase()}</span>
          </div>
        {/if}
        
        <div class="space-y-1 relative">
          <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
            {guildName}
          </h1>
          <div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-semibold text-xs uppercase tracking-wider">
            <span class="text-amber-500"><Papicon icon="Trophy" size={14} /></span>
            <span>Classement XP & Niveaux</span>
          </div>
        </div>
      </div>

      <!-- Badge "Live" -->
      <div class="flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 rounded-full border border-emerald-500/20 dark:border-emerald-500/10 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 absolute"></span>
        <span class="ml-2.5 uppercase tracking-wider text-[10px]">Temps Réel</span>
      </div>
    </header>

    {#if loading}
      <!-- Loading Skeleton épuré -->
      <div class="space-y-6">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {#each Array(4) as _}
            <Skeleton height="85px" radius="1rem" />
          {/each}
        </div>
        <Skeleton height="200px" radius="1.25rem" />
        <Skeleton height="450px" radius="1.25rem" />
      </div>

    {:else if errorMsg}
      <!-- Erreur épurée -->
      <div class="bg-white dark:bg-[#111a2e] border border-red-200 dark:border-red-950 p-12 rounded-2xl text-center space-y-4 shadow-sm">
        <div class="w-12 h-12 bg-red-50 dark:bg-red-950/35 rounded-full flex items-center justify-center text-red-500 dark:text-red-400 mx-auto">
          <Papicon icon="AlertTriangle" size={20} />
        </div>
        <div class="space-y-1.5">
          <p class="text-slate-800 dark:text-slate-100 font-extrabold text-lg">Une erreur est survenue</p>
          <p class="text-slate-500 dark:text-slate-400 text-sm max-w-md mx-auto">{errorMsg}</p>
        </div>
      </div>

    {:else if !enabled}
      <!-- Module désactivé -->
      <div class="bg-white dark:bg-[#111a2e] border border-slate-200 dark:border-slate-800 p-16 rounded-2xl text-center flex flex-col items-center space-y-4 shadow-sm">
        <div class="w-14 h-14 rounded-full bg-slate-50 dark:bg-[#0c1322] flex items-center justify-center text-slate-400">
          <Papicon icon="Lock" size={24} />
        </div>
        <div class="space-y-1.5 max-w-sm">
          <h2 class="text-xl font-bold text-slate-800 dark:text-slate-100">Classement Inactif</h2>
          <p class="text-slate-505 dark:text-slate-400 text-sm leading-relaxed">
            Le module de Leveling n'est pas activé sur ce serveur ou le classement a été masqué par les administrateurs.
          </p>
        </div>
      </div>

    {:else}

      <!-- ─── Cartes de statistiques globales épurées ─── -->
      {#if levels.length > 0}
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div class="clean-card rounded-xl p-5 text-center space-y-1">
            <p class="text-2xl font-black text-slate-800 dark:text-slate-100">{levels.length}</p>
            <p class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Membres Classés</p>
          </div>
          <div class="clean-card rounded-xl p-5 text-center space-y-1">
            <p class="text-2xl font-black text-slate-800 dark:text-slate-100">{maxLevel}</p>
            <p class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Niveau Max</p>
          </div>
          <div class="clean-card rounded-xl p-5 text-center space-y-1">
            <p class="text-2xl font-black text-slate-800 dark:text-slate-100">{avgLevel}</p>
            <p class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Niveau Moyen</p>
          </div>
          <div class="clean-card rounded-xl p-5 text-center space-y-1">
            <p class="text-2xl font-black text-slate-800 dark:text-slate-100">{formatXp(totalXp)}</p>
            <p class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">XP Cumulé</p>
          </div>
        </div>
      {/if}

      <!-- ─── Section Top 3 Épuré ─── -->
      {#if !searchQuery && levels.length > 0}
        <div class="space-y-4">
          <h3 class="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-550 flex items-center gap-2 ml-1">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span>
            <span>Le Trio de Tête</span>
          </h3>
          
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 relative z-10">
            
            <!-- Rank 2 Card (Silver Border Accent) -->
            {#if levels[1]}
              <div class="relative clean-card border-t-2 border-slate-300 dark:border-slate-600 rounded-xl p-6 flex flex-col justify-between order-2 sm:order-1">
                <div class="flex items-start justify-between">
                  <div class="space-y-3 w-full">
                    <span class="text-xl font-black text-slate-400/80">2nd</span>
                    <div class="flex items-center gap-3">
                      <img
                        src={levels[1].avatarUrl || 'https://cdn.discordapp.com/embed/avatars/1.png'}
                        alt=""
                        class="w-12 h-12 rounded-full object-cover border border-slate-200 dark:border-slate-800"
                      />
                      <div class="min-w-0 flex-1">
                        <p class="font-bold text-slate-800 dark:text-slate-100 truncate text-sm" title={levels[1].displayName}>
                          {levels[1].displayName || levels[1].username || 'Inconnu'}
                        </p>
                        <p class="text-xs text-slate-400 dark:text-slate-500">Niveau {levels[1].level}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="mt-4 text-xs font-mono text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800/80 pt-3 flex justify-between">
                  <span>XP Total :</span>
                  <span class="font-bold text-slate-700 dark:text-slate-300">{formatXp(levels[1].xp)}</span>
                </div>
              </div>
            {/if}

            <!-- Rank 1 Card (Gold Border Accent) -->
            {#if levels[0]}
              <div class="relative clean-card border-t-2 border-amber-400 dark:border-amber-500 rounded-xl p-6 flex flex-col justify-between order-1 sm:order-2">
                <div class="flex items-start justify-between">
                  <div class="space-y-3 w-full">
                    <span class="text-2xl font-black text-amber-500 flex items-center gap-1.5">
                      <span>1st</span>
                      <span class="text-amber-500"><Papicon icon="Crown" size={18} /></span>
                    </span>
                    <div class="flex items-center gap-3.5">
                      <img
                        src={levels[0].avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                        alt=""
                        class="w-14 h-14 rounded-full object-cover border border-slate-200 dark:border-slate-800"
                      />
                      <div class="min-w-0 flex-1">
                        <p class="font-black text-slate-800 dark:text-slate-100 truncate text-base" title={levels[0].displayName}>
                          {levels[0].displayName || levels[0].username || 'Inconnu'}
                        </p>
                        <p class="text-xs text-amber-500 dark:text-amber-400 font-bold">Niveau {levels[0].level}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="mt-4 text-xs font-mono text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800/80 pt-3 flex justify-between">
                  <span>XP Total :</span>
                  <span class="font-bold text-amber-500 dark:text-amber-400">{formatXp(levels[0].xp)}</span>
                </div>
              </div>
            {/if}

            <!-- Rank 3 Card (Bronze/Copper Border Accent) -->
            {#if levels[2]}
              <div class="relative clean-card border-t-2 border-amber-600 dark:border-amber-700/80 rounded-xl p-6 flex flex-col justify-between order-3">
                <div class="flex items-start justify-between">
                  <div class="space-y-3 w-full">
                    <span class="text-xl font-black text-amber-700/80 dark:text-amber-600">3rd</span>
                    <div class="flex items-center gap-3">
                      <img
                        src={levels[2].avatarUrl || 'https://cdn.discordapp.com/embed/avatars/2.png'}
                        alt=""
                        class="w-12 h-12 rounded-full object-cover border border-slate-200 dark:border-slate-800"
                      />
                      <div class="min-w-0 flex-1">
                        <p class="font-bold text-slate-800 dark:text-slate-100 truncate text-sm" title={levels[2].displayName}>
                          {levels[2].displayName || levels[2].username || 'Inconnu'}
                        </p>
                        <p class="text-xs text-slate-400 dark:text-slate-500">Niveau {levels[2].level}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="mt-4 text-xs font-mono text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800/80 pt-3 flex justify-between">
                  <span>XP Total :</span>
                  <span class="font-bold text-slate-700 dark:text-slate-300">{formatXp(levels[2].xp)}</span>
                </div>
              </div>
            {/if}

          </div>
        </div>
      {/if}

      <!-- ─── Liste Principale Tableau Épuré ─── -->
      <section class="bg-white dark:bg-[#111a2e] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
        
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <h3 class="text-base font-extrabold text-slate-800 dark:text-slate-100">
            Membres du Serveur
          </h3>

          <!-- Barre de recherche -->
          <div class="relative w-full sm:w-80">
            <input
              type="text"
              id="leaderboard-search"
              placeholder="Rechercher un membre..."
              bind:value={searchQuery}
              class="w-full bg-slate-50 dark:bg-[#0c1322] border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 pl-10 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:bg-white dark:focus:bg-[#111a2e] focus:border-slate-300 dark:focus:border-slate-700 transition-all font-semibold"
            />
            <div class="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 flex items-center">
              <Papicon icon="Search" size={14} />
            </div>
            {#if searchQuery}
              <button
                onclick={() => searchQuery = ''}
                class="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-750 hover:bg-red-100 dark:hover:bg-red-950/45 hover:text-red-750 dark:hover:text-red-300 text-slate-500 dark:text-slate-400 flex items-center justify-center text-[9px] font-bold transition-all"
              >✕</button>
            {/if}
          </div>
        </div>

        <!-- Tableau des joueurs -->
        <div class="border border-slate-150 dark:border-slate-800/80 rounded-xl overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-slate-50 dark:bg-[#0c1322] border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <th class="px-5 py-3.5 w-16 text-center">Rang</th>
                <th class="px-6 py-3.5">Membre</th>
                <th class="px-6 py-3.5 w-24">Niveau</th>
                <th class="px-6 py-3.5 w-24">XP</th>
                <th class="px-6 py-3.5 w-48">Progression</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-[#111a2e]">
              {#each filteredLevels as userLvl}
                {@const index = levels.findIndex(l => l.userId === userLvl.userId)}
                {@const nextLvlXp = getXpForLevel(userLvl.level)}
                {@const prevLvlXp = getXpForLevel(userLvl.level - 1)}
                {@const progress = nextLvlXp - prevLvlXp > 0 ? ((userLvl.xp - prevLvlXp) / (nextLvlXp - prevLvlXp)) * 100 : 0}
                {@const percent = Math.min(100, Math.max(0, progress))}
                {@const color = getRankColor(index)}

                <tr
                  class="group hover:bg-slate-50/50 dark:hover:bg-[#142036]/30 transition-colors duration-150 cursor-pointer
                    {highlightedUserId === userLvl.userId ? 'bg-indigo-50/30 dark:bg-indigo-950/10' : ''}"
                  onclick={() => highlightedUserId = highlightedUserId === userLvl.userId ? null : userLvl.userId}
                >
                  <!-- Rang -->
                  <td class="px-5 py-4 text-center font-bold text-slate-500 dark:text-slate-400 font-mono text-sm">
                    {#if index === 0}
                      <span class="text-amber-500">1</span>
                    {:else if index === 1}
                      <span class="text-slate-400">2</span>
                    {:else if index === 2}
                      <span class="text-amber-700">3</span>
                    {:else}
                      {index + 1}
                    {/if}
                  </td>

                  <!-- Membre -->
                  <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                      <img
                        src={userLvl.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                        alt=""
                        class="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-800"
                      />
                      <div class="min-w-0">
                        <span class="font-bold text-slate-800 dark:text-slate-100 text-sm truncate block">{userLvl.displayName || userLvl.username || 'Inconnu'}</span>
                        {#if userLvl.username && userLvl.displayName !== userLvl.username}
                          <span class="text-[10px] text-slate-400 dark:text-slate-500 font-mono">@{userLvl.username}</span>
                        {/if}
                      </div>
                    </div>
                  </td>

                  <!-- Niveau -->
                  <td class="px-6 py-4 font-bold text-slate-700 dark:text-slate-300 text-sm">
                    {userLvl.level}
                  </td>

                  <!-- XP -->
                  <td class="px-6 py-4 font-mono text-slate-600 dark:text-slate-400 text-xs">
                    {formatXp(userLvl.xp)}
                  </td>

                  <!-- Progression -->
                  <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                      <div class="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          class="h-full rounded-full transition-all duration-700
                            {color === 'amber' ? 'bg-amber-450 dark:bg-amber-400' :
                             color === 'silver' ? 'bg-slate-400 dark:bg-slate-500' :
                             color === 'bronze' ? 'bg-amber-600 dark:bg-amber-500' :
                             'bg-indigo-500 dark:bg-indigo-400'}"
                          style="width: {percent}%"
                        ></div>
                      </div>
                      <span class="text-[10px] font-mono text-slate-400 dark:text-slate-500 whitespace-nowrap">{Math.round(percent)}%</span>
                    </div>
                  </td>
                </tr>
              {:else}
                <tr>
                  <td colspan="5" class="px-6 py-20 text-center">
                    <div class="flex flex-col items-center justify-center space-y-3">
                      <div class="text-slate-400 dark:text-slate-600"><Papicon icon="Search" size={20} /></div>
                      <p class="text-slate-500 dark:text-slate-400 font-semibold text-sm">
                        {#if searchQuery}Aucun membre trouvé pour "{searchQuery}"{:else}Le classement est vide.{/if}
                      </p>
                      {#if searchQuery}
                        <button onclick={() => searchQuery = ''} class="text-indigo-500 dark:text-indigo-400 text-xs font-bold underline">Effacer le filtre</button>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>

      <!-- ─── Footer épuré ─── -->
      <footer class="flex flex-col sm:flex-row items-center justify-between gap-4 py-6 border-t border-slate-200 dark:border-slate-800 text-center relative z-10 text-xs text-slate-400 dark:text-slate-500">
        <p>
          Propulsé par le bot Discord <span class="text-slate-700 dark:text-slate-350 font-semibold">Kotbo</span> · Données synchronisées
        </p>
        <a
          href="/"
          class="font-bold text-slate-750 dark:text-slate-300 hover:text-slate-500 dark:hover:text-slate-400 transition-colors uppercase tracking-wider flex items-center gap-1"
        >
          <span>Dashboard</span>
          <span>→</span>
        </a>
      </footer>

    {/if}
  </div>
</div>

<style>
  /* Styles pour isoler le style du tableau blanc épuré */
  .whiteboard-container {
    background-color: #faf9f6;
    background-image: 
      radial-gradient(#cbd5e1 1.2px, transparent 1.2px);
    background-size: 24px 24px;
    color: #0f172a;
    font-family: 'Outfit', sans-serif;
    transition: background-color 0.3s ease, color 0.3s ease;
  }

  /* Mode sombre épuré - pas de tableau vert ardoise, juste du marine/anthracite premium */
  :global(.dark) .whiteboard-container {
    background-color: #090d16 !important;
    background-image: radial-gradient(#1e293b 1.2px, transparent 1.2px) !important;
    color: #f8fafc !important;
  }

  .clean-card {
    background-color: #ffffff;
    border: 1px solid #e2e8f0;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -2px rgba(0, 0, 0, 0.02);
    transition: all 0.2s ease;
  }
  :global(.dark) .clean-card {
    background-color: #111a2e !important;
    border-color: #1e293b !important;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.15), 0 2px 4px -2px rgba(0, 0, 0, 0.15) !important;
  }

  .clean-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 12px -3px rgba(0, 0, 0, 0.04), 0 3px 6px -3px rgba(0, 0, 0, 0.04);
  }
  :global(.dark) .clean-card:hover {
    box-shadow: 0 8px 12px -3px rgba(0, 0, 0, 0.25), 0 3px 6px -3px rgba(0, 0, 0, 0.25) !important;
  }

  .tape-accent {
    position: absolute;
    top: -8px;
    right: 24px;
    width: 80px;
    height: 20px;
    background-color: rgba(251, 191, 36, 0.22);
    border-left: 1px dashed rgba(0,0,0,0.1);
    border-right: 1px dashed rgba(0,0,0,0.1);
    transform: rotate(3deg);
    z-index: 10;
  }
  :global(.dark) .tape-accent {
    background-color: rgba(251, 191, 36, 0.1) !important;
    border-left: 1px dashed rgba(255,255,255,0.08) !important;
    border-right: 1px dashed rgba(255,255,255,0.08) !important;
  }

  /* Custom scrollbar */
  ::-webkit-scrollbar {
    width: 6px;
  }
  ::-webkit-scrollbar-track {
    background: #f1f5f9;
    border-radius: 4px;
  }
  :global(.dark) ::-webkit-scrollbar-track {
    background: #0c1322;
  }
  ::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 4px;
  }
  :global(.dark) ::-webkit-scrollbar-thumb {
    background: #1e293b;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }
  :global(.dark) ::-webkit-scrollbar-thumb:hover {
    background: #334155;
  }
</style>
