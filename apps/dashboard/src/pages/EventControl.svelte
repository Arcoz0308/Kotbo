<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { router } from 'tinro';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import { toast } from '../lib/stores/toast.svelte';
  import { API_BASE_URL } from '../lib/api';

  const { eventId } = $props<{ eventId: string }>();

  let event = $state<any>(null);
  let stats = $state<any>(null);
  let isFetching = $state(false);
  let interval: any;

  let activeTab = $state<'stats' | 'participants'>('stats');

  const currentQuestion = $derived(event?.questions?.find((q: any) => q.id === stats?.questionId) || event?.questions?.[event?.questions?.length - 1]);
  const currentQIdx = $derived(event?.questions?.findIndex((q: any) => q.id === stats?.questionId) + 1);
  const totalQ = $derived(event?.questions?.length || 0);

  onMount(async () => {
    await loadEvent();
    await loadStats();
    interval = setInterval(loadStats, 3000); // Refresh stats every 3s
  });

  onDestroy(() => {
    if (interval) clearInterval(interval);
  });

  async function loadEvent() {
    try {
      const guildId = authStore.selectedGuildId;
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/events/${eventId}`, {
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      });
      const data = await res.json();
      event = data.event;
    } catch (err) {
      toast.error('Erreur chargement événement');
    }
  }

  async function loadStats() {
    try {
      const guildId = authStore.selectedGuildId;
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/events/${eventId}/stats`, {
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      });
      const data = await res.json();
      stats = data.stats;
    } catch (err) {
      console.error('Stats error:', err);
    }
  }

  async function nextQuestion() {
    try {
      const guildId = authStore.selectedGuildId;
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/events/${eventId}/next`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'completed') {
          toast.success('Événement terminé !');
          router.goto('/events');
        } else {
          toast.success('Question suivante lancée !');
          await loadStats();
        }
      } else {
        const data = await res.json();
        toast.error(data.error || 'Erreur');
      }
    } catch (err) {
      toast.error('Erreur réseau');
    }
  }

  async function prevQuestion() {
    try {
      const guildId = authStore.selectedGuildId;
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/events/${eventId}/prev`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      });
      if (res.ok) {
        toast.success('Question précédente rétablie !');
        await loadStats();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Erreur');
      }
    } catch (err) {
      toast.error('Erreur réseau');
    }
  }

  async function finishEvent() {
    if (!confirm('Voulez-vous vraiment terminer cet événement ?')) return;
    try {
      const guildId = authStore.selectedGuildId;
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/events/${eventId}/finish`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      });
      if (res.ok) {
        toast.success('Événement terminé !');
        router.goto('/events');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Erreur');
      }
    } catch (err) {
      toast.error('Erreur réseau');
    }
  }
</script>

<ModulePage 
  title="Pilotage Événement" 
  description="Contrôlez le déroulement du quiz et visualisez les résultats en direct." 
  icon="Activity"
  featureKey="events"
>
  {#snippet actions()}
    <div class="flex gap-3">
      <button 
        onclick={() => router.goto('/events')}
        class="px-5 py-2.5 bg-surface-container-high rounded-xl font-black text-[10px] uppercase tracking-widest border border-outline-variant/10 hover:bg-surface-container-highest transition-colors"
      >
        Retour
      </button>
      {#if event && event.type !== 'CTF'}
        <button
          onclick={prevQuestion}
          class="px-5 py-2.5 bg-surface-container-high rounded-xl font-black text-[10px] uppercase tracking-widest border border-outline-variant/10 hover:bg-surface-container-highest transition-colors flex items-center gap-2 disabled:opacity-30"
          disabled={currentQIdx <= 1}
        >
          <Papicon icon="SkipBack" size={12} /> Précédente
        </button>
        <button
          onclick={nextQuestion}
          class="px-5 py-2.5 bg-emerald-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:scale-105 transition-transform flex items-center gap-2"
        >
          <Papicon icon="SkipForward" size={12} /> {currentQIdx === totalQ ? 'Terminer Quiz' : 'Question Suivante'}
        </button>
      {/if}
      <button
        onclick={finishEvent}
        class="px-5 py-2.5 bg-red-500/10 text-red-500 rounded-xl font-black text-[10px] uppercase tracking-widest border border-red-500/20 hover:bg-red-500/20 transition-colors"
      >
        Terminer
      </button>
    </div>
  {/snippet}

  {#if event}
    <div class="space-y-10 pb-20">
      <section class="bg-primary/5 rounded-[3rem] p-10 border border-primary/10">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-8">
            <div>
              <span class="text-[10px] font-black uppercase tracking-widest text-primary">Événement en cours</span>
              <h3 class="text-3xl font-black text-on-surface mt-2">{event.title}</h3>
            </div>
            <div class="h-12 w-px bg-outline-variant/20 hidden md:block"></div>
            {#if event.type === 'CTF'}
              <div class="hidden md:block">
                <span class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Type</span>
                <p class="text-2xl font-black text-emerald-500 mt-1">Capture The Flag</p>
              </div>
              <div class="h-12 w-px bg-outline-variant/20 hidden md:block"></div>
              <div class="hidden md:block">
                <span class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Défis</span>
                <p class="text-2xl font-black text-on-surface mt-1">{event.ctfChallenges?.length || 0}</p>
              </div>
            {:else}
              <div class="hidden md:block">
                <span class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Progression</span>
                <p class="text-2xl font-black text-on-surface mt-1">Question {currentQIdx || 1} / {totalQ}</p>
              </div>
            {/if}
          </div>
          <div class="text-right">
            <span class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Participants</span>
            <p class="text-3xl font-black text-on-surface mt-1">{event.participants?.length || 0}</p>
          </div>
        </div>
      </section>

      <div class="flex gap-2 bg-surface-container-low/50 p-1.5 rounded-2xl w-fit border border-outline-variant/10">
        <button 
          onclick={() => activeTab = 'stats'}
          class="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all {activeTab === 'stats' ? 'bg-surface-container-highest text-on-surface shadow-sm' : 'text-on-surface-variant/40 hover:text-on-surface-variant/60'}"
        >
          {event.type === 'CTF' ? 'Défis' : 'Graphique'}
        </button>
        <button 
          onclick={() => activeTab = 'participants'}
          class="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all {activeTab === 'participants' ? 'bg-surface-container-highest text-on-surface shadow-sm' : 'text-on-surface-variant/40 hover:text-on-surface-variant/60'}"
        >
          Participants
        </button>
      </div>

      {#if activeTab === 'stats'}
        {#if event.type === 'CTF'}
          <div class="space-y-6">
            {#if stats && stats.challenges}
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                {#each stats.challenges as challenge}
                  <div class="bg-surface-container-low/30 rounded-[2.5rem] border border-outline-variant/10 p-8 space-y-6 relative overflow-hidden group">
                    <div class="absolute top-0 left-0 w-2 h-full bg-emerald-500/30"></div>
                    
                    <div class="flex items-center justify-between">
                      <div>
                        <h4 class="text-xl font-black text-on-surface">{challenge.title}</h4>
                        <p class="text-[10px] font-bold text-on-surface-variant/40 mt-1 uppercase tracking-widest">
                          {challenge.points} pts | {challenge.xpReward} XP
                          {#if challenge.roleIdReward}
                            | Rôle: {challenge.roleIdReward}
                          {/if}
                        </p>
                      </div>
                      <div class="text-right">
                        <span class="px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-lg text-[10px] font-black uppercase tracking-widest">
                          {challenge.solveCount} résolutions
                        </span>
                      </div>
                    </div>

                    <div class="space-y-3">
                      <span class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Dernières résolutions</span>
                      {#if challenge.solves && challenge.solves.length > 0}
                        <div class="max-h-36 overflow-y-auto space-y-2 pr-2">
                          {#each challenge.solves as solve}
                            <div class="flex justify-between items-center bg-surface-container-high/30 rounded-xl px-4 py-2 border border-outline-variant/5">
                              <span class="text-xs font-bold text-on-surface">{solve.username}</span>
                              <span class="text-[9px] text-on-surface-variant/40">{new Date(solve.solvedAt).toLocaleTimeString()}</span>
                            </div>
                          {/each}
                        </div>
                      {:else}
                        <p class="text-xs text-on-surface-variant/30 italic">Aucune résolution pour le moment.</p>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="py-20 text-center bg-surface-container-low/20 rounded-[3rem] border border-dashed border-outline-variant/20">
                <div class="w-16 h-16 bg-on-surface/5 rounded-full flex items-center justify-center mx-auto mb-6 text-on-surface-variant/20">
                  <Papicon icon="Flag" size={32} />
                </div>
                <p class="text-on-surface-variant/40 font-bold italic">En attente de statistiques...</p>
              </div>
            {/if}
          </div>
        {:else}
          <div class="bg-surface-container-low/30 rounded-[3rem] border border-outline-variant/10 p-10 min-h-[500px] flex flex-col items-center justify-center relative overflow-hidden">
            <div class="absolute top-0 right-0 p-8 opacity-10">
              <Papicon icon="PieChart" size={120} />
            </div>
            
            {#if stats}
              {@const total = Object.values(stats.distribution).reduce((a, b) => Number(a) + Number(b), 0) || 1}
              {@const colors = [
                '#6366f1', '#ec4899', '#06b6d4', '#f59e0b', '#10b981', '#8b5cf6', 
                '#f43f5e', '#f97316', '#84cc16', '#14b8a6', '#3b82f6', '#d946ef',
                '#a855f7', '#0ea5e9', '#facc15', '#fb923c', '#4ade80', '#2dd4bf',
                '#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#fb7185'
              ]}
              {@const bgColors = [
                'bg-indigo-500', 'bg-pink-500', 'bg-cyan-500', 'bg-amber-500', 'bg-emerald-500', 'bg-violet-500',
                'bg-rose-500', 'bg-orange-500', 'bg-lime-500', 'bg-teal-500', 'bg-blue-500', 'bg-fuchsia-500',
                'bg-purple-500', 'bg-sky-500', 'bg-yellow-500', 'bg-orange-400', 'bg-green-400', 'bg-teal-400',
                'bg-sky-400', 'bg-indigo-400', 'bg-purple-400', 'bg-pink-400', 'bg-rose-400'
              ]}

              <div class="text-center mb-12">
                <div class="flex items-center justify-center gap-3 mb-4">
                  <span class="px-3 py-1 bg-primary/10 text-primary rounded-lg text-[9px] font-black uppercase tracking-widest">En direct</span>
                </div>
                <h4 class="text-2xl font-black text-on-surface">{stats.questionText}</h4>
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-2 gap-16 w-full max-w-5xl items-center">
                <!-- Pie Chart (SVG) -->
                <div class="flex justify-center">
                  <div class="relative w-64 h-64">
                    <svg viewBox="0 0 100 100" class="w-full h-full -rotate-90">
                      {#each Object.entries(stats.distribution) as [idx, count], i}
                        {@const value = Number(count)}
                        {@const percentage = (value / total) * 100}
                        {@const prevValues = Object.values(stats.distribution).slice(0, i).reduce((a, b) => Number(a) + Number(b), 0)}
                        {@const offset = (prevValues / total) * 100}
                        {@const isCorrect = i === currentQuestion?.correctOptionIndex}
                        
                        {#if percentage > 0}
                          <circle
                            r="40"
                            cx="50"
                            cy="50"
                            fill="transparent"
                            stroke={isCorrect ? '#10b981' : colors[i % colors.length]}
                            stroke-width="20"
                            stroke-dasharray="{percentage * 2.51} 251.2"
                            stroke-dashoffset="-{offset * 2.51}"
                            class="transition-all duration-1000 ease-out hover:opacity-80 cursor-pointer"
                          />
                        {/if}
                      {/each}
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span class="text-3xl font-black text-on-surface">{total}</span>
                      <span class="text-[8px] font-black uppercase tracking-widest text-on-surface-variant/40">Réponses</span>
                    </div>
                  </div>
                </div>

                <!-- Legend / Bars -->
                <div class="space-y-6">
                  {#each Object.entries(stats.distribution) as [idx, count], i}
                    {@const value = Number(count)}
                    {@const percentage = Math.round((value / total) * 100)}
                    {@const optionText = (currentQuestion?.options as string[])?.[i] || `Option ${i + 1}`}
                    {@const isCorrect = i === currentQuestion?.correctOptionIndex}
                    
                    <div class="space-y-2">
                      <div class="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                        <div class="flex items-center gap-2">
                          {#if isCorrect}
                            <div class="w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                              <Papicon icon="Check" size={10} class="text-white" />
                            </div>
                          {/if}
                          <span class={isCorrect ? 'text-emerald-500' : 'text-on-surface'}>{optionText}</span>
                        </div>
                        <span class="text-on-surface-variant/60">{value} ({percentage}%)</span>
                      </div>
                      <div class="h-3 w-full bg-surface-container-highest/20 rounded-full overflow-hidden">
                        <div 
                          class="h-full {isCorrect ? 'bg-emerald-500' : bgColors[i % bgColors.length]} rounded-full transition-all duration-1000 ease-out" 
                          style="width: {percentage}%"
                        ></div>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {:else}
              <div class="text-center space-y-4">
                <div class="w-16 h-16 bg-surface-container-high rounded-3xl flex items-center justify-center mx-auto mb-6 animate-pulse">
                  <Papicon icon="Activity" size={32} class="text-on-surface-variant/20" />
                </div>
                <p class="text-on-surface-variant/40 font-bold italic">En attente des premières réponses...</p>
              </div>
            {/if}
          </div>
        {/if}
      {:else}
        <div class="bg-surface-container-low/30 rounded-[2.5rem] border border-outline-variant/10 overflow-hidden">
          <table class="w-full text-left">
            <thead class="bg-surface-container-high/50 border-b border-outline-variant/10">
              <tr>
                <th class="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Utilisateur</th>
                <th class="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Score</th>
                <th class="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">
                  {event.type === 'CTF' ? 'Dernière résolution' : 'Dernière réponse'}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-outline-variant/5">
              {#each event.participants || [] as p}
                {@const lastResp = stats?.latestResponses?.find((r: any) => r.userId === p.userId) ?? stats?.responses?.find((r: any) => r.userId === p.userId)}
                <tr class="hover:bg-surface-container-low/50 transition-colors">
                  <td class="px-8 py-5">
                    <button 
                      onclick={() => router.goto(`/profile/${p.userId}`)}
                      class="font-black text-on-surface hover:text-primary transition-colors text-left bg-transparent border-none p-0 cursor-pointer"
                    >
                      {p.userTag || p.userId}
                    </button>
                  </td>
                  <td class="px-8 py-5">
                    <span class="font-black text-primary">{p.score} pts</span>
                  </td>
                  <td class="px-8 py-5">
                    {#if event.type === 'CTF'}
                      {#if p.lastSolveAt}
                        <span class="text-xs text-on-surface-variant/60">
                          {new Date(p.lastSolveAt).toLocaleString()}
                        </span>
                      {:else}
                        <span class="text-[10px] text-on-surface-variant/40">Aucune résolution</span>
                      {/if}
                    {:else}
                      {#if lastResp}
                        {@const respText = lastResp.optionLabel || (currentQuestion?.options as string[])?.[lastResp.optionIndex] || `Option ${lastResp.optionIndex + 1}`}
                        <span class="px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest {lastResp.isCorrect ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}">
                          {respText}
                        </span>
                      {:else}
                        <span class="text-[10px] text-on-surface-variant/40">Pas encore répondu</span>
                      {/if}
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {:else}
    <div class="flex items-center justify-center py-40">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
  {/if}
</ModulePage>
