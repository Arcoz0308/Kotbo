<script lang="ts">
  import Papicon from './Papicon.svelte';

  let {
    label,
    value,
    note = '',
    icon = 'activity',
    toneClass = 'bg-primary/10 text-primary',
    cardClass = '',
    loading = false
  } = $props();
</script>

<div class="premium-card rounded-[2.25rem] p-6 flex items-center gap-5 group {cardClass}">
  <div class="w-14 h-14 rounded-[1.25rem] {toneClass} flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner shrink-0">
    <Papicon {icon} size={24} />
  </div>
  <div class="flex-1 min-w-0">
    <p class="text-[10px] font-black uppercase tracking-[0.25em] text-on-surface-variant/40 truncate">{label}</p>
    {#if loading}
      <div class="mt-2.5 mb-1.5 h-8 w-16 animate-pulse bg-on-surface/10 rounded-lg"></div>
    {:else}
      <p class="text-3xl font-black font-headline text-on-surface mt-1 tracking-tighter truncate">{value}</p>
    {/if}
    {#if note}
      <p class="text-xs font-medium text-on-surface-variant/60 mt-1 truncate">{note}</p>
    {/if}
  </div>
</div>
