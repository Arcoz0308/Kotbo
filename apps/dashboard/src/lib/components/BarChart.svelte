<script lang="ts">
  import Chart from './charts/Chart.svelte';
  import { onMount } from 'svelte';

  let { data = [], labelKey = 'label', valueKey = 'value', color = '#6366f1', height = 200 }: {
    data: any[]; labelKey?: string; valueKey?: string; color?: string; height?: number;
  } = $props();

  function getResolvedColor(c: string) {
    if (typeof window === 'undefined') return c;
    if (c.startsWith('var(')) {
      const match = c.match(/var\((--[^)]+)\)/);
      if (match) return getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim();
    }
    return c;
  }

  let resolvedColor = $state(color);
  onMount(() => {
    resolvedColor = getResolvedColor(color);
  });

  const chartData = $derived({
    labels: data.map(d => d[labelKey]),
    datasets: [{
      label: 'Volume',
      data: data.map(d => d[valueKey]),
      backgroundColor: resolvedColor,
      borderRadius: 6,
      borderSkipped: false,
      hoverBackgroundColor: resolvedColor + 'dd',
      gradient: {
        backgroundColor: {
          axis: 'y',
          colors: {
            0: resolvedColor + '44',
            100: resolvedColor
          }
        }
      }
    }]
  });

  const options = {
    scales: {
      x: { display: data.length <= 15 },
      y: { display: true, beginAtZero: true }
    }
  };
</script>

<div class="w-full" style="height: {height}px">
  <Chart data={chartData} type="bar" {height} {options} />
</div>


