<script lang="ts">
  let {
    message = '',
    error = '',
    idleText = ''
  } = $props();

  const hasError = $derived(!!error);
  const hasMessage = $derived(!!message);
</script>

{#if hasError || hasMessage || idleText}
  <div class="text-xs font-semibold {hasError ? 'text-red-600' : hasMessage ? 'text-emerald-600' : 'text-on-surface-variant'}">
    {#if hasError}
      <span>{error}</span>
    {:else if hasMessage}
      <span>{message}</span>
    {:else}
      <span>{idleText}</span>
    {/if}
  </div>
{/if}
