<script lang="ts">
  import Papicon from '../Papicon.svelte';
  import Chart from '../charts/Chart.svelte';

  let { data } = $props<{
    data: {
      growthTrend: Array<{
        dateKey: string;
        netGrowth: number;
        cumulativeGrowth: number;
        activeMembers: number;
        totalMembers: number;
        retentionRate: number;
      }>;
      metrics: {
        totalJoins: number;
        totalLeaves: number;
        netGrowth: number;
        avgActiveMembers: number;
        currentRetention: number;
      };
    };
  }>();

  const chartLabels = $derived(data.growthTrend.map(d => d.dateKey.slice(5)));

  const growthChartData = $derived({
    labels: chartLabels,
    datasets: [
      {
        label: 'Croissance nette',
        data: data.growthTrend.map(d => d.netGrowth),
        borderColor: data.growthTrend.some(d => d.netGrowth > 0) ? '#10b981' : '#ef4444',
        backgroundColor: data.growthTrend.some(d => d.netGrowth > 0) ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        gradient: {
          backgroundColor: {
            axis: 'y',
            colors: {
              0: data.growthTrend.some(d => d.netGrowth > 0) ? 'rgba(16, 185, 129, 0)' : 'rgba(239, 68, 68, 0)',
              100: data.growthTrend.some(d => d.netGrowth > 0) ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'
            }
          }
        }
      },
      {
        label: 'Croissance cumulative',
        data: data.growthTrend.map(d => d.cumulativeGrowth),
        borderColor: '#6366f1',
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 0,
        yAxisID: 'y1'
      }
    ]
  });

  const retentionChartData = $derived({
    labels: chartLabels,
    datasets: [
      {
        label: 'Taux de rétention (%)',
        data: data.growthTrend.map(d => d.retentionRate),
        borderColor: '#ec4899',
        backgroundColor: 'rgba(236, 72, 153, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        gradient: {
          backgroundColor: {
            axis: 'y',
            colors: {
              0: 'rgba(236, 72, 153, 0)',
              100: 'rgba(236, 72, 153, 0.2)'
            }
          }
        }
      }
    ]
  });

  const activityChartData = $derived({
    labels: chartLabels,
    datasets: [
      {
        label: 'Membres actifs',
        data: data.growthTrend.map(d => d.activeMembers),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        gradient: {
          backgroundColor: {
            axis: 'y',
            colors: {
              0: 'rgba(16, 185, 129, 0)',
              100: 'rgba(16, 185, 129, 0.2)'
            }
          }
        }
      }
    ]
  });

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' as const }
    },
    scales: {
      x: { grid: { color: 'rgba(0,0,0,0.05)' } },
      y: { beginAtZero: true }
    }
  };
</script>

<div class="space-y-6">
  <!-- Key Metrics -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
    <div class="premium-card p-6 rounded-4xl space-y-3">
      <div class="flex items-center justify-between">
        <Papicon icon="LogIn" size={20} class="text-emerald-500" />
        <span class="text-[9px] font-bold text-on-surface-variant/40 uppercase">Arrivées</span>
      </div>
      <p class="text-2xl font-black text-on-surface">{data.metrics.totalJoins}</p>
      <p class="text-[9px] font-bold text-on-surface-variant/60">membres rejoints</p>
    </div>

    <div class="premium-card p-6 rounded-4xl space-y-3">
      <div class="flex items-center justify-between">
        <Papicon icon="LogOut" size={20} class="text-red-500" />
        <span class="text-[9px] font-bold text-on-surface-variant/40 uppercase">Départs</span>
      </div>
      <p class="text-2xl font-black text-on-surface">{data.metrics.totalLeaves}</p>
      <p class="text-[9px] font-bold text-on-surface-variant/60">membres partis</p>
    </div>

    <div class="premium-card p-6 rounded-4xl space-y-3 {data.metrics.netGrowth > 0 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}">
      <div class="flex items-center justify-between">
        <Papicon icon={data.metrics.netGrowth > 0 ? 'TrendingUp' : 'TrendingDown'} size={20} class={data.metrics.netGrowth > 0 ? 'text-emerald-500' : 'text-red-500'} />
        <span class="text-[9px] font-bold text-on-surface-variant/40 uppercase">Croissance</span>
      </div>
      <p class="text-2xl font-black {data.metrics.netGrowth > 0 ? 'text-emerald-500' : 'text-red-500'}">{data.metrics.netGrowth > 0 ? '+' : ''}{data.metrics.netGrowth}</p>
      <p class="text-[9px] font-bold text-on-surface-variant/60">croissance nette</p>
    </div>

    <div class="premium-card p-6 rounded-4xl space-y-3">
      <div class="flex items-center justify-between">
        <Papicon icon="Users" size={20} class="text-blue-500" />
        <span class="text-[9px] font-bold text-on-surface-variant/40 uppercase">Moyenne</span>
      </div>
      <p class="text-2xl font-black text-on-surface">{data.metrics.avgActiveMembers}</p>
      <p class="text-[9px] font-bold text-on-surface-variant/60">membres actifs/jour</p>
    </div>

    <div class="premium-card p-6 rounded-4xl space-y-3">
      <div class="flex items-center justify-between">
        <Papicon icon="percent" size={20} class="text-purple-500" />
        <span class="text-[9px] font-bold text-on-surface-variant/40 uppercase">Actuellement</span>
      </div>
      <p class="text-2xl font-black text-on-surface">{data.metrics.currentRetention}%</p>
      <p class="text-[9px] font-bold text-on-surface-variant/60">taux de rétention</p>
    </div>
  </div>

  <!-- Charts -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Growth Chart -->
    <div class="premium-card p-8 rounded-[2.5rem] space-y-6">
      <div class="flex items-center gap-4">
        <div class="bg-primary/10 p-3 rounded-2xl text-primary">
          <Papicon icon="Chart" size={24} />
        </div>
        <div>
          <h4 class="font-black text-on-surface">Croissance sur temps</h4>
          <p class="text-[9px] font-bold text-on-surface-variant/40">Rejoins - Départs</p>
        </div>
      </div>
      <div class="h-[300px]">
        <Chart data={growthChartData} type="line" height={300} options={chartOptions} />
      </div>
    </div>

    <!-- Retention Chart -->
    <div class="premium-card p-8 rounded-[2.5rem] space-y-6">
      <div class="flex items-center gap-4">
        <div class="bg-secondary/10 p-3 rounded-2xl text-secondary">
          <Papicon icon="Target" size={24} />
        </div>
        <div>
          <h4 class="font-black text-on-surface">Taux de rétention</h4>
          <p class="text-[9px] font-bold text-on-surface-variant/40">% de membres actifs quotidiens</p>
        </div>
      </div>
      <div class="h-[300px]">
        <Chart data={retentionChartData} type="line" height={300} options={chartOptions} />
      </div>
    </div>
  </div>

  <!-- Activity Chart -->
  <div class="premium-card p-8 rounded-[2.5rem] space-y-6">
    <div class="flex items-center gap-4">
      <div class="bg-emerald-500/10 p-3 rounded-2xl text-emerald-500">
        <Papicon icon="Activity" size={24} />
      </div>
      <div>
        <h4 class="font-black text-on-surface">Activité des membres</h4>
        <p class="text-[9px] font-bold text-on-surface-variant/40">Membres actifs par jour</p>
      </div>
    </div>
    <div class="h-[300px]">
      <Chart data={activityChartData} type="line" height={300} options={chartOptions} />
    </div>
  </div>
</div>

