<script lang="ts">
  import type { Snippet } from 'svelte';

  type SelectValue = string | string[];

  let {
    id = '',
    value = $bindable<SelectValue>(''),
    multiple = false,
    disabled = false,
    className = '',
    onchange,
    children,
  }: {
    id?: string;
    value?: SelectValue;
    multiple?: boolean;
    disabled?: boolean;
    className?: string;
    onchange?: (event: Event) => void;
    children?: Snippet;
  } = $props();
</script>

{#if multiple}
  <select
    {id}
    bind:value
    multiple
    {disabled}
    onchange={onchange}
    class={className}
  >
    {#if children}
      {@render children()}
    {/if}
  </select>
{:else}
  <select
    {id}
    bind:value
    {disabled}
    onchange={onchange}
    class={className}
  >
    {#if children}
      {@render children()}
    {/if}
  </select>
{/if}
