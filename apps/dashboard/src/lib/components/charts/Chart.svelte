<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Chart, { type ChartConfiguration, type ChartTypeRegistry } from 'chart.js/auto';
  import gradient from 'chartjs-plugin-gradient';

  let { 
    data, 
    type = 'line', 
    options = {}, 
    height = 300,
    width = null as number | null
  } = $props<{
    data: any;
    type?: keyof ChartTypeRegistry;
    options?: any;
    height?: number;
    width?: number | null;
  }>();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let chart = $state<Chart | null>(null);

  function getCSSVar(name: string) {
    if (typeof window === 'undefined') return '';
    // If it's already a color (hex/rgba), return it
    if (name.startsWith('#') || name.startsWith('rgb') || !name.includes('--')) return name;
    
    // Extract variable name if it's in var(--name) format
    const match = name.match(/var\((--[^)]+)\)/);
    const varName = match ? match[1] : name;
    
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  function initChart() {
    if (!canvas) return;

    if (chart) {
      chart.destroy();
    }

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';

    // Pre-process data to resolve CSS variables for gradients
    const processedData = {
      ...data,
      datasets: data.datasets.map((dataset: any) => {
        const d = { ...dataset };
        if (d.gradient && d.gradient.backgroundColor && d.gradient.backgroundColor.colors) {
          const colors = { ...d.gradient.backgroundColor.colors };
          for (const key in colors) {
            colors[key] = getCSSVar(colors[key]);
          }
          d.gradient = {
            ...d.gradient,
            backgroundColor: {
              ...d.gradient.backgroundColor,
              colors
            }
          };
        }
        // Also resolve borderColor/backgroundColor if they are variables
        if (typeof d.borderColor === 'string') d.borderColor = getCSSVar(d.borderColor);
        if (typeof d.backgroundColor === 'string') d.backgroundColor = getCSSVar(d.backgroundColor);
        
        return d;
      })
    };

    const config: ChartConfiguration = {
      type: type as any,
      data: processedData,
      plugins: [gradient],
      options: {

        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index',
        },
        animation: {
          duration: 800,
          easing: 'easeOutQuart'
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              color: textColor,
              font: {
                family: 'Inter, sans-serif',
                size: 10,
                weight: 'bold'
              },
              autoSkip: true,
              maxRotation: 0
            }
          },
          y: {
            grid: {
              color: gridColor,
              drawTicks: false,
            },
            border: {
               dash: [4, 4],
               display: false
            },
            ticks: {
              color: textColor,
              font: {
                family: 'Inter, sans-serif',
                size: 10,
                weight: 'bold'
              },
              callback: (value: any) => {
                if (value >= 1000) return (value / 1000) + 'k';
                return value;
              }
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            enabled: true,
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)',
            titleColor: isDark ? '#f8fafc' : '#0f172a',
            bodyColor: isDark ? '#f8fafc' : '#0f172a',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 12,
            displayColors: true,
            usePointStyle: true,
            boxWidth: 6,
            boxHeight: 6,
            boxPadding: 6,
            titleFont: {
              family: 'Manrope, sans-serif',
              size: 12,
              weight: '800'
            },
            bodyFont: {
              family: 'Inter, sans-serif',
              size: 13,
              weight: '600'
            },
            callbacks: {
              label: (context) => {
                let label = context.dataset.label || '';
                if (label) label += ': ';
                if (context.parsed.y !== null) {
                  label += context.parsed.y.toLocaleString('fr-FR');
                }
                return label;
              }
            }
          }
        },
        ...options
      }
    };

    chart = new Chart(canvas, config);
  }

  $effect(() => {
    if (data && chart) {
      chart.data = data;
      chart.update();
    }
  });

  onMount(() => {
    initChart();
    
    // Watch for dark mode changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          initChart();
        }
      });
    });
    
    observer.observe(document.documentElement, { attributes: true });
    
    return () => observer.disconnect();
  });

  onDestroy(() => {
    if (chart) chart.destroy();
  });
</script>

<div class="chart-container" style="height: {height}px; width: {width ? width + 'px' : '100%'}">
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .chart-container {
    position: relative;
    width: 100%;
  }
</style>

