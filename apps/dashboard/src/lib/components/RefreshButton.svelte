<script lang="ts">
  let {
    onClick,
    loading = false,
    label = 'Actualiser',
    iconOnly = false,
    ariaLabel = 'Actualiser',
    className = '',
    iconClass = 'text-sm'
  } = $props();

  function getBaseClass() {
    return iconOnly
      ? 'p-3 rounded-2xl bg-surface-container-low border border-outline-variant/30 text-on-surface-variant hover:text-primary hover:border-primary transition-all active:scale-95'
      : 'flex items-center gap-2 bg-primary text-white px-5 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-md';
  }
</script>

<button
  type="button"
  onclick={onClick}
  aria-label={ariaLabel}
  class="{getBaseClass()} {className}"
>
  <span class="material-symbols-outlined {iconClass} {loading ? 'animate-spin' : ''}">refresh</span>
  {#if !iconOnly}
    {label}
  {/if}
</button>
