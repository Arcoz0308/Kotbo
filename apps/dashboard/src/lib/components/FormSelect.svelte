<script lang="ts">
  import type { Snippet } from 'svelte';

  type SelectValue = string | string[];

  let {
    id = '',
    value = $bindable<SelectValue>(),
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
    class="{className} custom-select"
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
    class="{className} custom-select"
  >
    {#if children}
      {@render children()}
    {/if}
  </select>
{/if}

<style>
  .custom-select {
    appearance: none;
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E");
    background-position: right 0.5rem center;
    background-repeat: no-repeat;
    background-size: 1.5em 1.5em;
  }
  :global(.custom-select option) {
    background-color: #1e1e24; /* Dark theme DA */
    color: #ffffff;
  }
</style>
