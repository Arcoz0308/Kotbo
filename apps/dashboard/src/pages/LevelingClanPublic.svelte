<script lang="ts">
  import { onMount } from 'svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';
  import { fetchPublicClans } from '../lib/api';

  interface Props {
    serverId: string;
  }
  const { serverId }: Props = $props();

  let loading = $state(true);
  let errorMsg = $state<string | null>(null);
  let guildName = $state('Kotbo Server');
  let guildIcon = $state<string | null>(null);
  let enabled = $state(false);
  let currentClanSeason = $state(1);
  
  interface Participant {
    userId: string;
    xp: number;
    displayName: string;
    avatarUrl: string | null;
  }

  interface ClanData {
    id: string;
    name: string;
    description: string | null;
    roleId: string;
    roleColor: string | null;
    totalXp: number;
    memberCount: number;
    topParticipants: Participant[];
  }

  interface RecentScore {
    id: string;
    amount: number;
    source: string; // 'XP' | 'ADMIN'
    isClan: boolean;
    displayName: string;
    avatarUrl: string | null;
    clanName: string | null;
    clanColor: string | null;
    createdAt: string;
  }

  let clans = $state<ClanData[]>([]);
  let recentScores = $state<RecentScore[]>([]);
  let searchQuery = $state('');

  // Grille : autant de colonnes que de clans (responsive, se replie si trop étroit)
  const clansGridStyle = $derived(
    clans.length > 0
      ? `grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));`
      : ''
  );

  onMount(async () => {
    try {
      const res = await fetchPublicClans(serverId);
      if (res) {
        enabled = res.enabled ?? false;
        guildName = res.guildName ?? 'Kotbo Server';
        guildIcon = res.guildIcon ?? null;
        currentClanSeason = res.currentClanSeason ?? 1;
        clans = res.clans || [];
        recentScores = res.recentScores || [];
      }
    } catch (err: any) {
      console.error(err);
      errorMsg = err.message || 'Erreur lors du chargement des données des clans.';
    } finally {
      loading = false;
    }
  });

  // Filter participants in each clan based on search query
  function getFilteredParticipants(clan: ClanData): Participant[] {
    if (!searchQuery) return clan.topParticipants;
    const q = searchQuery.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    return clan.topParticipants.filter(p => {
      const name = p.displayName.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
      return name.includes(q) || p.userId.includes(searchQuery);
    });
  }

  function formatXp(xp: number): string {
    if (xp >= 1_000_000) return `${(xp / 1_000_000).toFixed(1)}M`;
    if (xp >= 1_000) return `${(xp / 1_000).toFixed(1)}k`;
    return xp.toLocaleString();
  }

  // Temps relatif en français (ex: « il y a 2 heures »)
  function formatRelativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const diffMs = Date.now() - then;
    const sec = Math.max(0, Math.floor(diffMs / 1000));
    if (sec < 60) return "à l'instant";
    const min = Math.floor(sec / 60);
    if (min < 60) return `il y a ${min} minute${min > 1 ? 's' : ''}`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `il y a ${hours} heure${hours > 1 ? 's' : ''}`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `il y a ${days} jour${days > 1 ? 's' : ''}`;
    const months = Math.floor(days / 30);
    if (months < 12) return `il y a ${months} mois`;
    const years = Math.floor(days / 365);
    return `il y a ${years} an${years > 1 ? 's' : ''}`;
  }

  function getRankBadgeColor(rank: number) {
    if (rank === 1) return 'bg-amber-500/10 text-amber-500 border border-amber-500/20';
    if (rank === 2) return 'bg-slate-400/10 text-slate-400 border border-slate-400/20';
    if (rank === 3) return 'bg-amber-700/10 text-amber-700 border border-amber-700/20';
    return 'bg-slate-100 dark:bg-slate-800 text-slate-500';
  }
</script>

<svelte:head>
  <title>Classement des Clans — {guildName}</title>
  <meta name="description" content="Classement compétitif et scores des clans de {guildName} sur Discord." />
</svelte:head>

<div class="min-h-screen whiteboard-container relative overflow-x-hidden selection:bg-yellow-100 dark:selection:bg-slate-850 py-12 px-4 sm:px-6 z-10">
  
  <div class="relative z-10 w-full max-w-6xl mx-auto space-y-10 animate-in fade-in duration-300">

    <!-- ─── En-tête style Feuille Index épuré ─── -->
    <header class="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#111a2e] border border-slate-200 dark:border-slate-800 p-5 rounded-lg shadow-sm overflow-hidden group">
      <div class="tape-accent"></div>

      <div class="flex items-center gap-4">
        {#if guildIcon}
          <div class="relative shrink-0">
            <img src={guildIcon} alt="{guildName} Logo" class="w-11 h-11 rounded-lg object-cover border border-slate-200 dark:border-slate-800" />
          </div>
        {:else}
          <div class="relative w-11 h-11 bg-slate-50 dark:bg-[#0c1322] border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-center font-bold text-sm text-slate-800 dark:text-slate-100 shrink-0">
            <span>{guildName.slice(0, 2).toUpperCase()}</span>
          </div>
        {/if}

        <div class="relative">
          <h1 class="text-lg font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
            {guildName}
          </h1>
          <div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-semibold text-xs uppercase tracking-wider">
            <span class="text-amber-500"><Papicon icon="Shield" size={14} /></span>
            <span>Guerre des Clans — Saison {currentClanSeason}</span>
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
      <!-- Loading Skeletons -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Skeleton height="500px" radius="1.25rem" />
        <Skeleton height="500px" radius="1.25rem" />
      </div>
    {:else if errorMsg}
      <!-- Error Message -->
      <div class="bg-white dark:bg-[#111a2e] border border-red-200 dark:border-red-950 p-12 rounded-lg text-center space-y-4 shadow-sm">
        <div class="w-12 h-12 bg-red-50 dark:bg-red-950/35 rounded-full flex items-center justify-center text-red-500 dark:text-red-400 mx-auto">
          <Papicon icon="AlertTriangle" size={20} />
        </div>
        <div class="space-y-1.5">
          <p class="text-slate-800 dark:text-slate-100 font-extrabold text-lg">Une erreur est survenue</p>
          <p class="text-slate-505 dark:text-slate-400 text-sm max-w-md mx-auto">{errorMsg}</p>
        </div>
      </div>
    {:else if !enabled || clans.length === 0}
      <!-- Module disabled -->
      <div class="bg-white dark:bg-[#111a2e] border border-slate-200 dark:border-slate-800 p-16 rounded-lg text-center flex flex-col items-center space-y-4 shadow-sm">
        <div class="w-14 h-14 rounded-full bg-slate-50 dark:bg-[#0c1322] flex items-center justify-center text-slate-400">
          <Papicon icon="Lock" size={24} />
        </div>
        <div class="space-y-1.5 max-w-sm">
          <h2 class="text-xl font-bold text-slate-800 dark:text-slate-100">Classement Inactif</h2>
          <p class="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
            Le module de Clans n'est pas activé sur ce serveur ou aucun clan n'a été configuré par l'administration.
          </p>
        </div>
      </div>
    {:else}
      <!-- ─── Search Bar ─── -->
      <div class="relative max-w-md mx-auto group">
        <span class="absolute inset-y-0 left-4 flex items-center text-slate-400 group-focus-within:text-slate-500 transition-colors">
          <Papicon icon="Search" size={16} />
        </span>
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Rechercher un participant par pseudo..."
          class="w-full pl-11 pr-4 py-3 bg-white dark:bg-[#111a2e] border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/50 shadow-sm transition-all"
        />
      </div>

      <!-- ─── Side-by-side Clans Column Grid (une colonne par clan) ─── -->
      <div class="grid gap-8 items-start relative z-10" style={clansGridStyle}>
        
        {#each clans as clan}
          {@const pList = getFilteredParticipants(clan)}
          
          <div
            class="clean-card bg-white dark:bg-[#111a2e] border-t-4 border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm transition-transform hover:-translate-y-0.5 duration-300 overflow-hidden"
            style="border-top-color: {clan.roleColor || '#e2e8f0'};"
          >
            <!-- Clan Header -->
            <div class="p-6 border-b border-slate-100 dark:border-slate-800 space-y-4">
              <div class="flex items-center justify-between">
                <h2 class="text-xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <span class="inline-block w-3.5 h-3.5 rounded-full" style="background-color: {clan.roleColor || '#e2e8f0'};"></span>
                  {clan.name}
                </h2>
                
                <span class="px-3 py-1 bg-slate-50 dark:bg-[#0c1322] border border-slate-200/50 dark:border-slate-800 rounded-full text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  {clan.memberCount} membres
                </span>
              </div>

              {#if clan.description}
                <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed italic">
                  « {clan.description} »
                </p>
              {/if}

              <!-- Score Card -->
              <div class="flex items-center justify-between p-3.5 rounded-xl bg-slate-50/50 dark:bg-[#0c1322]/50 border border-slate-200/10">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">XP de Saison</span>
                <span class="text-lg font-black text-amber-500 tracking-tight">
                  {clan.totalXp.toLocaleString('fr-FR')} XP
                </span>
              </div>
            </div>

            <!-- Participants list -->
            <div class="p-4">
              {#if pList.length === 0}
                <div class="py-12 text-center text-xs text-slate-400 dark:text-slate-500 italic">
                  Aucun membre trouvé ou aucun point marqué.
                </div>
              {:else}
                <div class="space-y-1.5">
                  {#each pList as p, index}
                    <div class="flex items-center justify-between p-2.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 rounded-xl transition-all duration-200 group/item">
                      <div class="flex items-center gap-3 min-w-0">
                        
                        <!-- Rank Badge -->
                        <span class="w-6 h-6 rounded-md flex items-center justify-center text-xs font-black shrink-0 {getRankBadgeColor(index + 1)}">
                          {index + 1}
                        </span>

                        <!-- User avatar -->
                        {#if p.avatarUrl}
                          <img src={p.avatarUrl} alt={p.displayName} class="w-8 h-8 rounded-full border border-slate-200/50 dark:border-slate-800" />
                        {:else}
                          <div class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-500 uppercase shrink-0">
                            {p.displayName.slice(0, 2)}
                          </div>
                        {/if}

                        <span class="text-sm font-bold text-slate-700 dark:text-slate-350 truncate max-w-[160px] sm:max-w-xs group-hover/item:text-slate-900 dark:group-hover/item:text-slate-100 transition-colors">
                          {p.displayName}
                        </span>
                      </div>

                      <span class="text-xs font-extrabold text-amber-500 tracking-tight shrink-0 pl-2">
                        {p.xp.toLocaleString('fr-FR')} XP
                      </span>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

          </div>
        {/each}

      </div>

      <!-- ─── Section « Derniers Scores » ─── -->
      <section class="clean-card bg-white dark:bg-[#111a2e] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden relative">
        <div class="tape-accent"></div>

        <div class="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          <h2 class="text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <span class="text-emerald-500"><Papicon icon="Activity" size={16} /></span>
            Derniers Scores
          </h2>
          <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Les gains de points les plus récents, en temps réel.</p>
        </div>

        {#if recentScores.length === 0}
          <div class="py-14 text-center text-xs text-slate-400 dark:text-slate-500 italic">
            Aucun gain de points enregistré pour le moment.
          </div>
        {:else}
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  <th class="px-6 py-3">Date</th>
                  <th class="px-6 py-3">Utilisateur</th>
                  <th class="px-6 py-3">Source</th>
                  <th class="px-6 py-3 text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {#each recentScores as s, i}
                  <tr class="text-sm {i % 2 === 0 ? 'bg-slate-50/60 dark:bg-[#0c1322]/40' : ''}">
                    <td class="px-6 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatRelativeTime(s.createdAt)}</td>
                    <td class="px-6 py-3">
                      <div class="flex items-center gap-2.5 min-w-0">
                        {#if s.isClan}
                          <span class="inline-block w-3 h-3 rounded-full shrink-0" style="background-color: {s.clanColor || '#e2e8f0'};"></span>
                          <span class="font-bold text-slate-700 dark:text-slate-200 truncate">{s.displayName}</span>
                          <span class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">Clan</span>
                        {:else}
                          {#if s.avatarUrl}
                            <img src={s.avatarUrl} alt={s.displayName} class="w-6 h-6 rounded-full border border-slate-200/50 dark:border-slate-800 shrink-0" />
                          {:else}
                            <div class="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[9px] font-bold text-slate-500 uppercase shrink-0">{s.displayName.slice(0, 2)}</div>
                          {/if}
                          <span class="font-semibold text-orange-500 dark:text-orange-400 truncate">{s.displayName}</span>
                        {/if}
                      </div>
                    </td>
                    <td class="px-6 py-3">
                      {#if s.source === 'ADMIN'}
                        <span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-500 border border-violet-500/20">Admin</span>
                      {:else}
                        <span class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-500 border border-sky-500/20">XP</span>
                      {/if}
                    </td>
                    <td class="px-6 py-3 text-right whitespace-nowrap">
                      <span class="font-black tracking-tight {s.amount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}">
                        {s.amount >= 0 ? '+' : ''}{s.amount.toLocaleString('fr-FR')}
                      </span>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>
    {/if}

  </div>
</div>

<style>
  /* Accents de style Feuille Index */
  .whiteboard-container {
    background-color: #f8fafc;
    background-image: 
      radial-gradient(#cbd5e1 0.75px, transparent 0.75px), 
      radial-gradient(#cbd5e1 0.75px, #f8fafc 0.75px);
    background-size: 30px 30px;
    background-position: 0 0, 15px 15px;
  }
  
  :global(.dark) .whiteboard-container {
    background-color: #070d19;
    background-image: 
      radial-gradient(#1e293b 0.75px, transparent 0.75px), 
      radial-gradient(#1e293b 0.75px, #070d19 0.75px);
    background-size: 30px 30px;
    background-position: 0 0, 15px 15px;
  }

  .tape-accent {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 4px;
    background: linear-gradient(90deg, #f59e0b 0%, #10b981 50%, #3b82f6 100%);
    opacity: 0.85;
  }

  .clean-card {
    background-color: #ffffff;
    border: 1px solid #e2e8f0;
  }
  
  :global(.dark) .clean-card {
    background-color: #0e1626;
    border: 1px solid #1e293b;
  }
</style>
