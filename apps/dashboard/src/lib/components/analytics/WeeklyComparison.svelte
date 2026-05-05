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

  const comparisonChartData = $derived({
    labels: metrics.map(m => m.label),
    datasets: [
      {
        label: 'Semaine dernière',
        data: metrics.map(m => data.lastWeek[m.key as keyof typeof data.lastWeek]),
        backgroundColor: 'rgba(107, 114, 128, 0.5)',
        borderRadius: 8,
        borderSkipped: false
      },
      {
        label: 'Cette semaine',
        data: metrics.map(m => data.thisWeek[m.key as keyof typeof data.thisWeek]),
        backgroundColor: '#6366f1',
        borderRadius: 8,
        borderSkipped: false
      }
    ]
  });

  const chartOptions = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
      tooltip: { mode: 'index' }
    },
    scales: {
      x: { beginAtZero: true, stacked: false }
    }
  };
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="premium-card p-8 rounded-[2.5rem] space-y-6">
    <div class="flex items-center gap-4">
      <div class="bg-secondary/10 p-3 rounded-2xl text-secondary">
        <Papicon icon="calendar" size={24} />
      </div>
      <div>
        <h3 class="text-xl font-black text-on-surface">Comparaison semaine/semaine</h3>
        <p class="text-xs font-bold text-on-surface-variant/40">Performance cette semaine vs. la semaine dernière</p>
      </div>
    </div>

    <!-- Metrics Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {#each metrics as metric}
        <div class="p-4 rounded-2xl bg-surface-container-high/20 border border-outline-variant/5 space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">{metric.label}</p>
            <div class={`px-2 py-1 rounded-lg flex items-center gap-1 ${getChangeColor(metric.change)}`}>
              <Papicon icon={getChangeIcon(metric.change)} size={12} />
              <span class="text-xs font-bold">{metric.change > 0 ? '+' : ''}{metric.change}%</span>
            </div>
          </div>
          
          <div class="space-y-2">
            <div>
              <p class="text-[9px] font-bold text-on-surface-variant/40 mb-1">Cette semaine</p>
              <p class="text-lg font-black text-on-surface">{data.thisWeek[metric.key as keyof typeof data.thisWeek]}{metric.suffix ? ' ' + metric.suffix : ''}</p>
            </div>
            <div class="border-t border-outline-variant/10 pt-2">
              <p class="text-[9px] font-bold text-on-surface-variant/40 mb-1">Semaine dernière</p>
              <p class="text-sm font-bold text-on-surface-variant/60">{data.lastWeek[metric.key as keyof typeof data.lastWeek]}{metric.suffix ? ' ' + metric.suffix : ''}</p>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Comparison Chart -->
    <div class="h-[300px] pt-4 border-t border-outline-variant/10">
      <Chart data={comparisonChartData} type="bar" height={300} options={chartOptions} />
    </div>
  </div>
</div>
