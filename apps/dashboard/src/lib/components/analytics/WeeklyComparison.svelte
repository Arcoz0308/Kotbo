<script lang="ts">
  import Papicon from '../Papicon.svelte';
  import Chart from '../charts/Chart.svelte';

  let { data } = $props<{
    data: {
      thisWeek: { messages: number; voiceMinutes: number; joins: number; leaves: number; sanctions: number };
      lastWeek: { messages: number; voiceMinutes: number; joins: number; leaves: number; sanctions: number };
      changes: { messagesChange: number; voiceChange: number; joinsChange: number; leavesChange: number; sanctionsChange: number };
    };
  }>();

  const getChangeColor = (change: number) => {
    if (change > 0) return 'text-emerald-500 bg-emerald-500/10';
    if (change < 0) return 'text-red-500 bg-red-500/10';
    return 'text-on-surface-variant/40 bg-surface-container-high';
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return 'TrendingUp';
    if (change < 0) return 'TrendingDown';
    return 'Minus';
  };

  const metrics = $derived([
    { label: 'Messages', key: 'messages', icon: 'ChatCircleDots', color: '#6366f1', change: data.changes.messagesChange },
    { label: 'Temps vocal', key: 'voiceMinutes', icon: 'Microphone', color: '#ec4899', change: data.changes.voiceChange, suffix: 'min' },
    { label: 'Arrivées', key: 'joins', icon: 'LogIn', color: '#10b981', change: data.changes.joinsChange },
    { label: 'Départs', key: 'leaves', icon: 'LogOut', color: '#f97316', change: data.changes.leavesChange },
    { label: 'Sanctions', key: 'sanctions', icon: 'Hammer', color: '#ef4444', change: data.changes.sanctionsChange }
  ]);

  const getChartData = (metric: any) => ({
    labels: ['S-1', 'S-0'],
    datasets: [
      {
        label: metric.label,
        data: [
          data.lastWeek[metric.key as keyof typeof data.lastWeek],
          data.thisWeek[metric.key as keyof typeof data.thisWeek]
        ],
        backgroundColor: [
          'rgba(148, 163, 184, 0.15)',
          metric.color
        ],
        borderRadius: 12,
        borderSkipped: false,
        barPercentage: 0.6,
        categoryPercentage: 0.8
      }
    ]
  });

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        padding: 12,
        cornerRadius: 12,
        titleFont: { family: 'Inter', size: 10, weight: 'bold' },
        bodyFont: { family: 'Inter', size: 12, weight: '900' },
        callbacks: {
          title: (items: any) => items[0].label === 'S-1' ? 'Semaine dernière' : 'Cette semaine',
          label: (context: any) => {
            const val = context.parsed.y;
            // Find metric suffix
            const metric = metrics.find(m => m.key === context.dataset.label || m.label === context.dataset.label);
            const suffix = metric?.suffix || '';
            return ` ${val.toLocaleString('fr-FR')}${suffix ? ' ' + suffix : ''}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { 
          font: { family: 'Inter', size: 10, weight: '800' },
          color: 'rgba(148, 163, 184, 0.6)'
        }
      },
      y: {
        beginAtZero: true,
        display: false,
        grid: { display: false }
      }
    }
  };
</script>

<div class="space-y-8">
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
    <div class="flex items-center gap-4">
      <div class="bg-primary/10 p-4 rounded-3xl text-primary shadow-inner">
        <Papicon icon="calendar" size={28} />
      </div>
      <div>
        <h3 class="text-2xl font-black text-on-surface tracking-tight">Comparaison Hebdomadaire</h3>
        <p class="text-sm font-bold text-on-surface-variant/50">Performance de l'activité par rapport à la semaine précédente</p>
      </div>
    </div>

    <div class="flex items-center gap-2 bg-surface-container-high/40 p-1.5 rounded-2xl border border-outline-variant/10">
       <div class="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-400/10 text-[10px] font-black uppercase text-slate-500">
          <div class="w-2 h-2 rounded-full bg-slate-400/40"></div>
          Semaine dernière (S-1)
       </div>
       <div class="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/10 text-[10px] font-black uppercase text-primary">
          <div class="w-2 h-2 rounded-full bg-primary"></div>
          Cette semaine (S-0)
       </div>
    </div>
  </div>

  <!-- Metrics Grid -->
  <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
    {#each metrics as metric}
      <div class="premium-card p-6 rounded-[2.5rem] border border-outline-variant/10 bg-linear-to-br from-surface-container-low/50 to-surface-container-high/20 hover:border-primary/20 transition-all duration-500 group">
        <div class="flex items-start justify-between mb-8">
          <div class="flex items-center gap-3">
            <div class="p-2.5 rounded-xl border border-outline-variant/10 bg-surface group-hover:scale-110 transition-transform duration-500" style="color: {metric.color}">
              <Papicon icon={metric.icon} size={20} />
            </div>
            <div>
              <p class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">{metric.label}</p>
              <div class="flex items-baseline gap-2 mt-0.5">
                <span class="text-2xl font-black text-on-surface tracking-tighter">
                  {data.thisWeek[metric.key as keyof typeof data.thisWeek].toLocaleString('fr-FR')}
                  {#if metric.suffix}
                    <span class="text-xs font-bold text-on-surface-variant/40 ml-1">{metric.suffix}</span>
                  {/if}
                </span>
              </div>
            </div>
          </div>

          <div class={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm ${getChangeColor(metric.change)}`}>
            <Papicon icon={getChangeIcon(metric.change)} size={14} />
            <span class="text-xs font-black tracking-tight">{metric.change > 0 ? '+' : ''}{metric.change}%</span>
          </div>
        </div>
        
        <div class="grid grid-cols-2 gap-4 mb-8">
          <div class="p-4 rounded-2xl bg-surface-container-low/40 border border-outline-variant/5">
            <p class="text-[9px] font-black text-on-surface-variant/30 uppercase tracking-widest mb-1">S-1</p>
            <p class="text-base font-bold text-on-surface-variant/60">
              {data.lastWeek[metric.key as keyof typeof data.lastWeek].toLocaleString('fr-FR')}
              {#if metric.suffix}
                <span class="text-[10px] ml-0.5 opacity-50">{metric.suffix}</span>
              {/if}
            </p>
          </div>
          <div class="p-4 rounded-2xl bg-surface-container-high/40 border border-outline-variant/5">
            <p class="text-[9px] font-black text-on-surface-variant/30 uppercase tracking-widest mb-1">S-0</p>
            <p class="text-base font-bold text-on-surface">
              {data.thisWeek[metric.key as keyof typeof data.thisWeek].toLocaleString('fr-FR')}
              {#if metric.suffix}
                <span class="text-[10px] ml-0.5 opacity-50">{metric.suffix}</span>
              {/if}
            </p>
          </div>
        </div>

        <div class="h-32 -mx-2">
          <Chart data={getChartData(metric)} type="bar" height={128} options={chartOptions} />
        </div>
      </div>
    {/each}

    <!-- Growth Summary Card -->
    <div class="premium-card p-8 rounded-[2.5rem] bg-linear-to-br from-primary/10 via-primary/5 to-transparent border border-primary/10 flex flex-col justify-center">
       <div class="space-y-4">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary text-[10px] font-black uppercase tracking-widest">
             <Papicon icon="TrendingUp" size={12} />
             Analyse de Croissance
          </div>
          <h4 class="text-2xl font-black text-on-surface leading-tight">Progression de la communauté</h4>
          <p class="text-sm font-medium text-on-surface-variant/60 leading-relaxed">
             Ces graphiques comparent l'activité brute de votre serveur. Une progression positive dans les messages et le vocal indique une communauté engagée.
          </p>
          <div class="pt-4 border-t border-primary/10">
             <div class="flex items-center justify-between text-xs font-bold text-primary">
                <span>Rétention Estimée</span>
                <span>{Math.round(100 - (data.thisWeek.leaves / (data.thisWeek.joins || 1) * 100))}%</span>
             </div>
          </div>
       </div>
    </div>
  </div>
</div>
