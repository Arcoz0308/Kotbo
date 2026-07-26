<script lang="ts">
  const {
    options = [],
    selected,
    onSelect,
    getCount = null,
    containerClass = 'flex items-center p-1 bg-surface-container-low rounded-xl',
    activeClass = 'bg-white shadow-sm text-primary',
    inactiveClass = 'text-on-surface-variant hover:text-primary',
    buttonClass = 'px-5 py-2 text-xs font-bold rounded-lg transition-all',
    showCount = false,
    countClass = 'ml-2 text-[10px] opacity-70'
  } = $props();
</script>

<div class={containerClass}>
  {#each options as option}
    {@const count = getCount ? getCount(option) : undefined}
    <button
      type="button"
      onclick={() => onSelect(option)}
      class="{buttonClass} {selected === option ? activeClass : inactiveClass}"
    >
      {option}
      {#if showCount}
        <span class={countClass}>{count ?? 0}</span>
      {/if}
    </button>
  {/each}
</div>
