<script lang="ts">
  import Papicon from '../Papicon.svelte';
  import Chart from '../charts/Chart.svelte';

  let { data, onOpenMember } = $props<{ data: any; onOpenMember: (id: string, name: string) => void }>();

  const recentSanctions = $derived(data?.recentSanctions || []);
  const topModerators = $derived(data?.topModerators || []);
  const topSanctionedMembers = $derived(data?.topSanctionedMembers || []);
  const stats = $derived([
    { label: 'Avertissements', value: data?.totals?.warns || 0, color: '#f59e0b' },
    { label: 'Exclusions', value: data?.totals?.kicks || 0, color: '#f97316' },
    { label: 'Bannissements', value: data?.totals?.bans || 0, color: '#f43f5e' }
  ]);

  const distributionData = $derived({
    labels: stats.map(s => s.label),
    datasets: [{
      data: stats.map(s => s.value),
      backgroundColor: stats.map(s => s.color),
      borderWidth: 0,
      hoverOffset: 10,
      cutout: '75%',
      borderRadius: 4
    }]
  });

  const doughnutOptions = {
    plugins: {
      legend: { display: false }
    }
  };

  const getAvatar = (url: string | null) => url || 'https://cdn.discordapp.com/embed/avatars/0.png';

  let showAllMods = $state(false);
  let showAllSanctioned = $state(false);
</script>

<div class="space-y-6">
  <!-- Moderation Stats -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <div class="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
      {#each stats as stat}
        <div class="premium-card p-6 rounded-[2rem] flex flex-col items-center text-center gap-2 group hover:scale-[1.02] transition-all">
          <div class="p-3 rounded-2xl mb-2" style="background: {stat.color}15; color: {stat.color}">
             <Papicon icon="Hammer" size={20} />
          </div>
          <span class="text-4xl font-black" style="color: {stat.color}">{stat.value}</span>
          <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">{stat.label}</p>
        </div>
      {/each}
    </div>

    <!-- Distribution Chart -->
    <div class="premium-card p-6 rounded-[2rem] flex flex-col items-center justify-center relative overflow-hidden group">
      <div class="h-32 w-32 relative z-10">
        <Chart data={distributionData} type="doughnut" height={128} options={doughnutOptions} />
        <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
           <span class="text-xl font-black text-on-surface">{stats.reduce((a, b) => a + b.value, 0)}</span>
           <span class="text-[8px] font-black uppercase tracking-widest text-on-surface-variant/40">Total</span>
        </div>
      </div>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Top Moderators -->
    <div class="premium-card p-8 rounded-[2.5rem] space-y-6 flex flex-col">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-xl bg-primary/10 text-primary">
            <Papicon icon="ShieldCheck" size={20} />
          </div>
          <h3 class="text-lg font-black text-on-surface">Top Modérateurs</h3>
        </div>
        <button 
          onclick={() => showAllMods = !showAllMods}
          class="p-2 rounded-xl bg-surface-container-high/40 hover:bg-surface-container-high text-on-surface-variant transition-colors"
        >
          <Papicon icon={showAllMods ? 'ArrowsIn' : 'ArrowsOut'} size={18} />
        </button>
      </div>
      <div class="space-y-3 {showAllMods ? 'max-h-[400px] overflow-y-auto custom-scrollbar pr-2' : ''}">
        {#each (showAllMods ? topModerators : topModerators.slice(0, 5)) as mod}
          <button 
            onclick={() => onOpenMember(mod.userId, mod.moderatorTag)}
            class="w-full flex items-center justify-between p-3 rounded-2xl bg-surface-container-high/20 hover:bg-surface-container-high/50 transition-all text-left"
          >
            <div class="flex items-center gap-3">
              <img src={getAvatar(mod.avatarUrl)} alt="" class="w-8 h-8 rounded-lg object-cover" />
              <div>
                <p class="text-sm font-black text-on-surface">@{mod.moderatorTag}</p>
                <p class="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest">Activité modération</p>
              </div>
            </div>
            <span class="text-sm font-black text-primary">{mod.count} actions</span>
          </button>
        {/each}
        {#if topModerators.length === 0}
          <p class="text-sm text-on-surface-variant/40 text-center py-4">Aucune donnée disponible</p>
        {/if}
      </div>
    </div>

    <!-- Top Sanctioned -->
    <div class="premium-card p-8 rounded-[2.5rem] space-y-6 flex flex-col">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-xl bg-rose-500/10 text-rose-500">
            <Papicon icon="UserFocus" size={20} />
          </div>
          <h3 class="text-lg font-black text-on-surface">Membres Sanctionnés</h3>
        </div>
        <button 
          onclick={() => showAllSanctioned = !showAllSanctioned}
          class="p-2 rounded-xl bg-surface-container-high/40 hover:bg-surface-container-high text-on-surface-variant transition-colors"
        >
          <Papicon icon={showAllSanctioned ? 'ArrowsIn' : 'ArrowsOut'} size={18} />
        </button>
      </div>
      <div class="space-y-3 {showAllSanctioned ? 'max-h-[400px] overflow-y-auto custom-scrollbar pr-2' : ''}">
        {#each (showAllSanctioned ? topSanctionedMembers : topSanctionedMembers.slice(0, 5)) as m}
          <button 
            onclick={() => onOpenMember(m.targetUserId, m.targetTag)}
            class="w-full flex items-center justify-between p-3 rounded-2xl bg-surface-container-high/20 hover:bg-surface-container-high/50 transition-all text-left"
          >
            <div class="flex items-center gap-3">
              <img src={getAvatar(m.avatarUrl)} alt="" class="w-8 h-8 rounded-lg object-cover" />
              <div>
                <p class="text-sm font-black text-on-surface">@{m.targetTag}</p>
                <p class="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest">Récidive</p>
              </div>
            </div>
            <span class="text-sm font-black text-rose-500">{m.count} sanctions</span>
          </button>
        {/each}
        {#if topSanctionedMembers.length === 0}
          <p class="text-sm text-on-surface-variant/40 text-center py-4">Aucun membre sanctionné</p>
        {/if}
      </div>
    </div>
  </div>

  <!-- Recent Sanctions -->
  <div class="premium-card p-8 rounded-[2.5rem] space-y-8">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <div class="bg-rose-500/10 p-3 rounded-2xl text-rose-500">
          <Papicon icon="Gavel" size={24} />
        </div>
        <div>
          <h3 class="text-xl font-black text-on-surface">Historique Récent</h3>
          <p class="text-xs font-bold text-on-surface-variant/40">Dernières actions enregistrées</p>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      {#each recentSanctions as sanction}
        <div class="flex flex-col md:flex-row md:items-center justify-between p-5 rounded-3xl bg-surface-container-high/30 border border-outline-variant/10 hover:bg-surface-container-high/50 transition-all group gap-4">
          <div class="flex items-center gap-4">
            <button 
              onclick={() => onOpenMember(sanction.targetUserId, sanction.targetTag)}
              class="w-12 h-12 rounded-2xl overflow-hidden bg-on-surface/5 flex items-center justify-center transition-transform group-hover:scale-105"
            >
              <img src={getAvatar(sanction.targetAvatarUrl)} alt="" class="w-full h-full object-cover" />
            </button>
            <div>
              <div class="flex items-center gap-2">
                <p class="text-sm font-black text-on-surface">@{sanction.targetTag}</p>
                <span class="px-2 py-0.5 rounded-lg text-[9px] font-black tracking-widest uppercase" style="background: {sanction.type === 'BAN' ? '#f43f5e20' : '#f59e0b20'}; color: {sanction.type === 'BAN' ? '#f43f5e' : '#f59e0b'}">{sanction.type}</span>
              </div>
              <p class="text-xs font-medium text-on-surface-variant/60 mt-0.5 line-clamp-1">{sanction.reason || 'Aucune raison spécifiée'}</p>
            </div>
          </div>
          <div class="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 border-outline-variant/5 pt-3 md:pt-0">
            <div class="text-right">
              <p class="text-[9px] font-black text-on-surface-variant/40 uppercase tracking-widest">Modérateur</p>
              <div class="flex items-center gap-2 mt-0.5">
                <img src={getAvatar(sanction.moderatorAvatarUrl)} alt="" class="w-5 h-5 rounded-md object-cover" />
                <p class="text-xs font-bold text-on-surface">@{sanction.moderatorTag}</p>
              </div>
            </div>
            <Papicon icon="CaretRight" size={16} class="text-on-surface-variant/20 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      {/each}
      {#if recentSanctions.length === 0}
        <div class="py-20 text-center opacity-40">
          <Papicon icon="ShieldCheck" size={48} class="mx-auto mb-4" />
          <p class="text-sm font-bold">Dossier de modération vierge</p>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .premium-card {
    background: rgba(var(--color-surface-container-low), 0.4);
    backdrop-filter: blur(24px);
    border: 1px solid rgba(var(--color-outline-variant), 0.1);
    transition: all 0.4s cubic-bezier(0.2, 1, 0.3, 1);
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(var(--color-outline-variant), 0.2);
    border-radius: 10px;
  }
</style>



