<script lang="ts">
  let {
    label,
    value,
    note = '',
    icon = 'query_stats',
    toneClass = 'bg-primary/10 text-primary',
    cardClass = ''
  } = $props();
</script>

<div class="premium-card rounded-[2.25rem] p-6 flex items-center gap-5 group {cardClass}">
  <div class="w-14 h-14 rounded-[1.25rem] {toneClass} flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner">
    <span class="material-symbols-outlined text-2xl">{icon}</span>
  </div>
  <div>
    <p class="text-[10px] font-black uppercase tracking-[0.25em] text-on-surface-variant/40">{label}</p>
    <p class="text-3xl font-black font-headline text-on-surface mt-1 tracking-tighter">{value}</p>
    {#if note}
      <p class="text-xs font-medium text-on-surface-variant/60 mt-1">{note}</p>
    {/if}
  </div>
</div>
