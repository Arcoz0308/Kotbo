<script lang="ts">
  import Papicon from '../Papicon.svelte';

  let { data, metric = 'messages' } = $props<{ 
    data: Record<number, Record<number, { messages: number; voice: number; active: number }>>;
    metric?: 'messages' | 'voice' | 'active';
  }>();

  const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const getColorIntensity = (value: number, max: number) => {
    if (max === 0) return 'bg-surface-container-high/20';
    const intensity = value / max;
    if (intensity === 0) return 'bg-surface-container-high/20';
    if (intensity < 0.25) return 'bg-primary/20';
    if (intensity < 0.5) return 'bg-primary/40';
    if (intensity < 0.75) return 'bg-primary/60';
    return 'bg-primary/80';
  };

  const maxValue = $derived.by(() => {
    let max = 0;
    for (let dow = 0; dow < 7; dow++) {
      for (let hour = 0; hour < 24; hour++) {
        const val = data[dow]?.[hour]?.[metric] || 0;
        if (val > max) max = val;
      }
    }
    return max;
  });

  const metricLabel = $derived({
    messages: 'Messages',
    voice: 'Temps vocal (min)',
    active: 'Membres actifs'
  }[metric]);

  const metricIcon = $derived({
    messages: 'ChatCircleDots',
    voice: 'Microphone',
    active: 'Users'
  }[metric]);
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="premium-card p-8 rounded-[2.5rem] space-y-6">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <div class="bg-primary/10 p-3 rounded-2xl text-primary">
          <Papicon icon="fire" size={24} />
        </div>
        <div>
          <h3 class="text-xl font-black text-on-surface">Heatmap d'activité horaire</h3>
          <p class="text-xs font-bold text-on-surface-variant/40">Moyennes par jour et heure</p>
        </div>
      </div>
    </div>

    <!-- Metric Selector -->
    <div class="flex gap-2">
      {#each ['messages', 'voice', 'active'] as m}
        <button
          onclick={() => metric = m as any}
          class="px-4 py-2 rounded-xl font-bold text-xs transition-all {metric === m 
            ? 'bg-primary text-primary-on' 
            : 'bg-surface-container-high/40 text-on-surface-variant hover:bg-surface-container-high'}"
        >
          <Papicon icon={({ messages: 'ChatCircleDots', voice: 'Microphone', active: 'Users' }[m] as any)} size={14} class="inline mr-2" />
          {{
            messages: 'Messages',
            voice: 'Vocal',
            active: 'Activité'
          }[m]}
        </button>
      {/each}
    </div>

    <!-- Heatmap -->
    <div class="overflow-x-auto">
      <div class="min-w-full inline-block">
        <!-- Header with hours -->
        <div class="flex gap-1 mb-2">
          <div class="w-12 flex-shrink-0"></div>
          {#each hours as hour}
            {#if hour % 3 === 0}
              <div class="flex-1 text-center text-[10px] font-bold text-on-surface-variant/40">{String(hour).padStart(2, '0')}h</div>
            {:else}
              <div class="flex-1"></div>
            {/if}
          {/each}
        </div>

        <!-- Heatmap cells -->
        {#each { length: 7 } as _, dow}
          <div class="flex gap-1 mb-1">
            <div class="w-12 flex-shrink-0 flex items-center justify-end pr-3">
              <span class="text-[10px] font-bold text-on-surface-variant">{dayNames[dow]}</span>
            </div>
            {#each hours as hour}
              {@const val = data[dow]?.[hour]?.[metric] || 0}
              {@const bgColor = getColorIntensity(val, maxValue)}
              <div
                class="flex-1 aspect-square rounded-lg {bgColor} border border-outline-variant/10 flex items-center justify-center cursor-help relative group transition-all hover:border-primary/50"
                title="{metricLabel}: {val}"
              >
                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 bg-on-surface text-surface rounded-lg text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                  {val} {metric === 'voice' ? 'min' : metric === 'messages' ? 'msg' : 'actifs'}
                </div>
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </div>

    <!-- Legend -->
    <div class="flex items-center justify-center gap-4 pt-4 border-t border-outline-variant/10">
      <span class="text-[9px] font-bold text-on-surface-variant/60">Intensité:</span>
      <div class="flex gap-2">
        {#each [0.2, 0.4, 0.6, 0.8] as intensity}
          <div class="w-4 h-4 rounded" style="background: rgba(var(--color-primary), {intensity})"></div>
        {/each}
      </div>
      <span class="text-[9px] font-bold text-on-surface-variant/60 ml-2">Élevée</span>
    </div>
  </div>
</div>
