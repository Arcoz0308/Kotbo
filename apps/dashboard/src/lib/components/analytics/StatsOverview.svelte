<script lang="ts">
  import Papicon from '../Papicon.svelte';
  import Chart from '../charts/Chart.svelte';

  let { data, chartLabels } = $props<{ data: any; chartLabels: any[] }>();

  const fmt = (n: number) => n?.toLocaleString('fr-FR') ?? '0';

  const stats = $derived([
    { label: 'Messages', value: fmt(data?.totals?.messages), icon: 'ChatCircleDots', color: '#6366f1' },
    { label: 'Vocal (min)', value: fmt(Math.round(data?.totals?.voiceMinutes || 0)), icon: 'Microphone', color: '#ec4899' },
    { label: 'Activité', value: `${fmt(data?.totals?.activeDays || 0)}j`, icon: 'Calendar', color: '#10b981' },
    { label: 'Sanctions', value: fmt(data?.totals?.sanctions), icon: 'ShieldWarning', color: '#f43f5e' }
  ]);
</script>

<div class="space-y-8">
  <!-- Stats Grid -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    {#each stats as stat}
      <div class="premium-card p-6 rounded-[2rem] group transition-all hover:scale-[1.02] relative overflow-hidden">
        <div class="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
          <Papicon icon={stat.icon} size={80} />
        </div>
        <div class="flex justify-between items-start mb-4 relative z-10">
          <div class="p-3 rounded-2xl transition-transform group-hover:rotate-12" style="background: {stat.color}15; color: {stat.color}">
            <Papicon icon={stat.icon} size={24} />
          </div>
          <span class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Total</span>
        </div>
        <div class="space-y-1 relative z-10">
          <h4 class="text-3xl font-black text-on-surface">{stat.value}</h4>
          <p class="text-xs font-bold text-on-surface-variant/60">{stat.label}</p>
        </div>
      </div>
    {/each}
  </div>

  <!-- Main Chart Section -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <div class="lg:col-span-2 premium-card p-8 rounded-[2.5rem] space-y-8">
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-4">
          <div class="bg-primary/10 p-3 rounded-2xl text-primary">
            <Papicon icon="ChartLineUp" size={24} />
          </div>
          <div>
            <h3 class="text-xl font-black text-on-surface">Tendance Globale</h3>
            <p class="text-xs font-bold text-on-surface-variant/40">Messages & Sessions Vocales</p>
          </div>
        </div>
      </div>
      
      <div class="h-[300px]">
        <Chart 
          data={{
            labels: chartLabels.map(l => l.label),
            datasets: [
              {
                label: 'Messages',
                data: chartLabels.map(l => l.messages),
                borderColor: '#6366f1',
                borderWidth: 3,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#6366f1',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 3,
                fill: true,
                tension: 0.4,
                gradient: {
                  backgroundColor: {
                    axis: 'y',
                    colors: { 0: 'rgba(99, 102, 241, 0)', 100: 'rgba(99, 102, 241, 0.2)' }
                  }
                }
              },
              {
                label: 'Vocal',
                data: chartLabels.map(l => l.voiceMinutes),
                borderColor: '#ec4899',
                borderWidth: 3,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#ec4899',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 3,
                fill: true,
                tension: 0.4,
                gradient: {
                  backgroundColor: {
                    axis: 'y',
                    colors: { 0: 'rgba(236, 72, 153, 0)', 100: 'rgba(236, 72, 153, 0.2)' }
                  }
                }
              }
            ]
          }}
          height={300}
        />
      </div>
    </div>

    <!-- Live Snapshots -->
    <div class="premium-card p-8 rounded-[2.5rem] space-y-8 flex flex-col">
      <div class="flex items-center gap-3">
        <div class="p-2 rounded-lg bg-amber-500/10 text-amber-500">
          <Papicon icon="Lightning" size={20} />
        </div>
        <h3 class="text-lg font-black text-on-surface">En Direct</h3>
      </div>
      
      <div class="space-y-4 flex-grow">
        <div class="p-6 rounded-3xl bg-surface-container-high/30 border border-outline-variant/10 hover:border-primary/20 transition-all group">
          <p class="text-[9px] font-black uppercase tracking-[0.2em] text-on-surface-variant/40 mb-3">Salon le plus actif</p>
          <div class="flex items-center justify-between">
            <span class="text-base font-black text-primary group-hover:translate-x-1 transition-transform">
              #{data?.topChannels?.[0]?.channelName || 'général'}
            </span>
          </div>
        </div>
        
        <div class="p-6 rounded-3xl bg-surface-container-high/30 border border-outline-variant/10 hover:border-secondary/20 transition-all group">
          <p class="text-[9px] font-black uppercase tracking-[0.2em] text-on-surface-variant/40 mb-3">Pic d'activité (Période)</p>
          <div class="flex items-center justify-between">
            <span class="text-base font-black text-on-surface group-hover:translate-x-1 transition-transform">
              {(() => {
                const max = [...(data?.dailyTrend || [])].sort((a, b) => b.peakOnline - a.peakOnline)[0];
                return max ? max.dateKey : 'Aujourd\'hui';
              })()}
            </span>
            <span class="text-[10px] font-black {data?.summary?.messagesTrend >= 0 ? 'text-emerald-500 bg-emerald-500/10' : 'text-rose-500 bg-rose-500/10'} px-2 py-1 rounded-lg">
              {data?.summary?.messagesTrend >= 0 ? '+' : ''}{data?.summary?.messagesTrend ?? 0}%
            </span>
          </div>
        </div>
      </div>

      <div class="pt-6 border-t border-outline-variant/5">
         <div class="flex items-center gap-4 px-2">
            <div class="flex -space-x-2">
               {#each Array(Math.min(4, data?.live?.onlineMembers || 1)) as _}
                 <div class="w-8 h-8 rounded-full border-2 border-surface bg-surface-container-highest shadow-sm flex items-center justify-center">
                    <Papicon icon="User" size={14} class="opacity-20" />
                 </div>
               {/each}
            </div>
            <p class="text-[10px] font-bold text-on-surface-variant/50">
              {fmt(data?.live?.onlineMembers || 0)} membres en ligne actuellement
            </p>
         </div>
      </div>
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
</style>
