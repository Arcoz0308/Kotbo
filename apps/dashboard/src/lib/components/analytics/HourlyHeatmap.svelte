<script lang="ts">
  import Papicon from '../Papicon.svelte';

  let { data, metric = 'messages' } = $props<{
    data: Record<number, Record<number, { messages: number; voice: number; active: number }>>;
    metric?: 'messages' | 'voice' | 'active';
  }>();

  const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const dayNamesFull = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  let showValues = $state(false);
  let hoveredDow = $state<number | null>(null);
  let hoveredHour = $state<number | null>(null);

  const metricConfig = {
    messages: { label: 'Messages', icon: 'ChatCircleDots', unit: 'msg', color1: '#312e81', color2: '#4f46e5', color3: '#818cf8', colorPeak: '#c7d2fe' },
    voice: { label: 'Vocal', icon: 'Microphone', unit: 'min', color1: '#701a75', color2: '#a21caf', color3: '#e879f9', colorPeak: '#fae8ff' },
    active: { label: 'Membres actifs', icon: 'Users', unit: 'membres', color1: '#064e3b', color2: '#059669', color3: '#34d399', colorPeak: '#d1fae5' },
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

  const totalValue = $derived.by(() => {
    let total = 0;
    for (let dow = 0; dow < 7; dow++) {
      for (let hour = 0; hour < 24; hour++) {
        total += data[dow]?.[hour]?.[metric] || 0;
      }
    }
    return total;
  });

  // Find the peak cell
  const peakCell = $derived.by(() => {
    let peak = { dow: 0, hour: 0, val: 0 };
    for (let dow = 0; dow < 7; dow++) {
      for (let hour = 0; hour < 24; hour++) {
        const val = data[dow]?.[hour]?.[metric] || 0;
        if (val > peak.val) peak = { dow, hour, val };
      }
    }
    return peak;
  });

  // Day sums for row totals
  const dayTotals = $derived.by(() => {
    return Array.from({ length: 7 }, (_, dow) =>
      Array.from({ length: 24 }).reduce((sum, _, h) => sum + (data[dow]?.[h]?.[metric] || 0), 0) as number
    );
  });

  // Hour sums for column totals
  const hourTotals = $derived.by(() => {
    return Array.from({ length: 24 }, (_, h) =>
      Array.from({ length: 7 }).reduce((sum, _, dow) => sum + (data[dow]?.[h]?.[metric] || 0), 0) as number
    );
  });

  const maxDayTotal = $derived(Math.max(...dayTotals, 1));
  const maxHourTotal = $derived(Math.max(...hourTotals, 1));

  function getCellStyle(val: number, max: number): string {
    if (max === 0 || val === 0) return 'background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.04);';
    const t = val / max;
    const cfg = metricConfig[metric];
    if (t < 0.15) return `background: ${cfg.color1}25; border-color: ${cfg.color1}40;`;
    if (t < 0.35) return `background: ${cfg.color1}60; border-color: ${cfg.color2}50;`;
    if (t < 0.55) return `background: ${cfg.color2}80; border-color: ${cfg.color2}70;`;
    if (t < 0.75) return `background: ${cfg.color2}cc; border-color: ${cfg.color3}80;`;
    if (t < 0.9) return `background: ${cfg.color3}dd; border-color: ${cfg.color3}; box-shadow: 0 0 8px ${cfg.color3}40;`;
    return `background: ${cfg.colorPeak}; border-color: ${cfg.colorPeak}; color: #0f172a; box-shadow: 0 0 12px ${cfg.color3}80;`;
  }

  function getCellTextColor(val: number, max: number): string {
    if (max === 0 || val === 0) return 'rgba(255,255,255,0.15)';
    const t = val / max;
    if (t < 0.55) return 'rgba(255,255,255,0.5)';
    if (t < 0.9) return 'rgba(255,255,255,0.95)';
    return '#0f172a';
  }

  function formatVal(v: number): string {
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return v.toString();
  }

  const cfg = $derived(metricConfig[metric]);

  // Best time slot description
  const bestSlot = $derived(
    peakCell.val > 0
      ? `${dayNamesFull[peakCell.dow]} à ${String(peakCell.hour).padStart(2, '0')}h`
      : 'Aucune donnée'
  );
</script>

<div class="space-y-6">
  <!-- Header Card -->
  <div class="premium-card p-6 md:p-8 rounded-[2.5rem] space-y-6">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div class="flex items-center gap-4">
        <div class="bg-primary/10 p-3 rounded-2xl text-primary">
          <Papicon icon="fire" size={24} />
        </div>
        <div>
          <h3 class="text-xl font-black text-on-surface">Carte Thermique d'Activité</h3>
          <p class="text-xs font-bold text-on-surface-variant/40">Moyennes par jour de la semaine × heure</p>
        </div>
      </div>

      <!-- Controls -->
      <div class="flex flex-wrap items-center gap-2">
        <!-- Metric selector -->
        {#each (['messages', 'voice', 'active'] as const) as m}
          <button
            onclick={() => metric = m}
            class="flex items-center gap-1.5 px-3 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all duration-200 border {metric === m
              ? 'bg-primary text-on-primary border-primary shadow-lg shadow-primary/25'
              : 'bg-surface-container-high/40 text-on-surface-variant/60 border-outline-variant/10 hover:bg-surface-container-high hover:text-on-surface'}"
          >
            <Papicon icon={metricConfig[m].icon} size={12} />
            {metricConfig[m].label}
          </button>
        {/each}

        <!-- Show values toggle -->
        <button
          onclick={() => showValues = !showValues}
          class="flex items-center gap-1.5 px-3 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all duration-200 border {showValues
            ? 'bg-surface-container-high text-on-surface border-outline-variant/30'
            : 'text-on-surface-variant/40 border-outline-variant/10 hover:bg-surface-container-high'}"
          title="Afficher les valeurs"
        >
          <Papicon icon="Hash" size={12} />
          Valeurs
        </button>
      </div>
    </div>

    <!-- Summary stats -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div class="bg-surface-container-high/30 rounded-2xl p-4 border border-outline-variant/5">
        <p class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-1">Total période</p>
        <p class="text-lg font-black text-on-surface">{totalValue.toLocaleString('fr-FR')} <span class="text-xs font-bold text-on-surface-variant/40">{cfg.unit}</span></p>
      </div>
      <div class="bg-surface-container-high/30 rounded-2xl p-4 border border-outline-variant/5">
        <p class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-1">Pic absolu</p>
        <p class="text-lg font-black text-on-surface">{peakCell.val.toLocaleString('fr-FR')} <span class="text-xs font-bold text-on-surface-variant/40">{cfg.unit}</span></p>
      </div>
      <div class="bg-surface-container-high/30 rounded-2xl p-4 border border-outline-variant/5 md:col-span-2">
        <p class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-1">Heure de pointe</p>
        <p class="text-base font-black text-on-surface flex items-center gap-2">
          <Papicon icon="Lightning" size={14} class="text-amber-400" />
          {bestSlot}
        </p>
      </div>
    </div>
  </div>

  <!-- Heatmap Grid Card -->
  <div class="premium-card p-4 md:p-8 rounded-[2.5rem] overflow-hidden">
    <div class="overflow-x-auto">
      <div class="min-w-[700px]">
        <!-- Hour axis labels -->
        <div class="flex items-center mb-1 pl-14 pr-14">
          {#each hours as hour}
            <div class="flex-1 text-center">
              {#if hour % 3 === 0}
                <span class="text-[9px] font-black text-on-surface-variant/40">{String(hour).padStart(2, '0')}h</span>
              {/if}
            </div>
          {/each}
        </div>

        <!-- Heatmap rows -->
        {#each { length: 7 } as _, dow}
          {@const isHovDow = hoveredDow === dow}
          <div class="flex items-center gap-1 mb-0.5 group/row">
            <!-- Day label -->
            <div
              class="w-12 flex-shrink-0 flex items-center justify-end pr-2 cursor-default"
              onmouseenter={() => { hoveredDow = dow; hoveredHour = null; }}
              onmouseleave={() => hoveredDow = null}
              role="button"
              tabindex="-1"
            >
              <span class="text-[10px] font-black uppercase tracking-wider transition-colors duration-150 {isHovDow ? 'text-on-surface' : 'text-on-surface-variant/50'}">{dayNames[dow]}</span>
            </div>

            <!-- Cells -->
            {#each hours as hour}
              {@const val = data[dow]?.[hour]?.[metric] || 0}
              {@const isHovHour = hoveredHour === hour}
              {@const isPeak = dow === peakCell.dow && hour === peakCell.hour && peakCell.val > 0}
              <div
                class="flex-1 aspect-square rounded-lg border transition-all duration-150 flex items-center justify-center cursor-default relative group/cell
                  {(isHovDow || isHovHour) ? 'scale-[1.12] z-10 shadow-lg' : ''}
                  {isPeak ? 'ring-1 ring-amber-400/60' : ''}"
                style="{getCellStyle(val, maxValue)}"
                onmouseenter={() => { hoveredDow = dow; hoveredHour = hour; }}
                onmouseleave={() => { hoveredDow = null; hoveredHour = null; }}
                role="button"
                tabindex="-1"
                aria-label="{dayNamesFull[dow]} {String(hour).padStart(2,'0')}h: {val} {cfg.unit}"
              >
                <!-- Value text -->
                {#if showValues && val > 0}
                  <span class="text-[8px] font-black leading-none select-none" style="color: {getCellTextColor(val, maxValue)}">
                    {formatVal(val)}
                  </span>
                {:else if isPeak && !showValues}
                  <div class="w-1 h-1 rounded-full bg-amber-400/60"></div>
                {/if}

                <!-- Tooltip -->
                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-surface-container-highest/95 backdrop-blur-sm text-on-surface rounded-xl text-[10px] font-bold
                  opacity-0 group-hover/cell:opacity-100 transition-all duration-150 pointer-events-none whitespace-nowrap z-50
                  border border-outline-variant/20 shadow-xl shadow-black/40">
                  <div class="font-black text-[11px]">{dayNamesFull[dow]} {String(hour).padStart(2, '0')}h–{String(hour + 1).padStart(2, '0')}h</div>
                  <div class="text-primary font-black mt-0.5">{val.toLocaleString('fr-FR')} {cfg.unit}</div>
                  {#if maxValue > 0}
                    <div class="text-on-surface-variant/40 text-[9px] mt-0.5">{Math.round((val / maxValue) * 100)}% du pic</div>
                  {/if}
                </div>
              </div>
            {/each}

            <!-- Row total bar -->
            <div class="w-12 flex-shrink-0 pl-1.5 flex items-center" title="Total {dayNamesFull[dow]}: {dayTotals[dow]} {cfg.unit}">
              <div class="h-3 rounded-full bg-surface-container-high overflow-hidden w-full">
                <div class="h-full rounded-full transition-all duration-500" style="width: {Math.round((dayTotals[dow] / maxDayTotal) * 100)}%; background: {cfg.color2}"></div>
              </div>
            </div>
          </div>
        {/each}

        <!-- Column total bars -->
        <div class="flex items-end mt-2 pl-14 pr-14">
          {#each hours as hour}
            <div class="flex-1 flex flex-col items-center gap-0.5" title="{String(hour).padStart(2,'0')}h: {hourTotals[hour]} {cfg.unit}">
              <div class="w-full max-w-[16px] mx-auto">
                <div class="rounded-t transition-all duration-500" style="height: {Math.round((hourTotals[hour] / maxHourTotal) * 28)}px; background: {cfg.color2}40; min-height: 2px;"></div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <!-- Legend -->
    <div class="flex items-center justify-center gap-3 pt-6 mt-2 border-t border-outline-variant/10 flex-wrap">
      <span class="text-[9px] font-black text-on-surface-variant/40 uppercase tracking-widest">Intensité</span>
      <div class="flex items-center gap-1.5">
        <div class="w-3 h-3 rounded border border-white/5" style="background: rgba(255,255,255,0.04)"></div>
        <div class="w-5 h-4 rounded" style="background: {cfg.color1}60"></div>
        <div class="w-5 h-4 rounded" style="background: {cfg.color2}80"></div>
        <div class="w-5 h-4 rounded" style="background: {cfg.color2}cc"></div>
        <div class="w-5 h-4 rounded" style="background: {cfg.color3}dd"></div>
        <div class="w-5 h-5 rounded border" style="background: {cfg.colorPeak}; border-color: {cfg.colorPeak}"></div>
      </div>
      <div class="flex items-center gap-3 text-[9px] font-bold text-on-surface-variant/40">
        <span>Faible</span>
        <span class="w-8 h-px bg-outline-variant/20"></span>
        <span>Élevée</span>
      </div>
      {#if peakCell.val > 0}
        <div class="flex items-center gap-1.5 text-[9px] font-bold text-amber-400/70 border border-amber-400/20 px-2 py-1 rounded-lg">
          <div class="w-2 h-2 rounded-full border border-amber-400/60"></div>
          Pic d'activité
        </div>
      {/if}
    </div>
  </div>

  <!-- Hour breakdown -->
  <div class="premium-card p-6 md:p-8 rounded-[2.5rem] space-y-4">
    <div class="flex items-center gap-3">
      <div class="bg-primary/10 p-2.5 rounded-xl text-primary">
        <Papicon icon="Clock" size={18} />
      </div>
      <div>
        <h4 class="text-base font-black text-on-surface">Répartition par Tranche Horaire</h4>
        <p class="text-[10px] font-bold text-on-surface-variant/40">Cumul toutes journées confondues</p>
      </div>
    </div>
    <div class="grid grid-cols-4 md:grid-cols-6 gap-2">
      {#each [
        { label: 'Nuit', range: '00h–05h', hours: [0,1,2,3,4,5] },
        { label: 'Matin', range: '06h–11h', hours: [6,7,8,9,10,11] },
        { label: 'Midi', range: '12h–14h', hours: [12,13,14] },
        { label: 'Après-midi', range: '15h–17h', hours: [15,16,17] },
        { label: 'Soirée', range: '18h–21h', hours: [18,19,20,21] },
        { label: 'Nuit tardive', range: '22h–23h', hours: [22,23] },
      ] as slot}
        {@const slotTotal = slot.hours.reduce((s, h) => s + hourTotals[h], 0)}
        {@const slotPct = totalValue > 0 ? Math.round((slotTotal / totalValue) * 100) : 0}
        <div class="bg-surface-container-high/20 rounded-2xl p-4 border border-outline-variant/5 text-center space-y-2">
          <p class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/50">{slot.label}</p>
          <p class="text-[9px] text-on-surface-variant/30">{slot.range}</p>
          <p class="text-base font-black text-on-surface">{slotPct}%</p>
          <div class="h-1 bg-surface-container-high rounded-full overflow-hidden">
            <div class="h-full rounded-full" style="width: {slotPct}%; background: {cfg.color2}"></div>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
