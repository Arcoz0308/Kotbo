<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let id: string = '';
  export let value: string | null = null;
  export let options: Array<{ id: string; name: string }> = [];
  export let placeholder: string = '';
  export let className: string = '';
  export let clearable: boolean = true;

  const dispatch = createEventDispatcher();

  let open = false;
  let query = '';

  function normalize(text: string) {
    return (text || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  }

  $: filtered = options.filter((o) => normalize(o.name).includes(normalize(query)) || o.id.includes(query));

  function select(opt: { id: string; name: string }) {
    value = opt.id;
    query = opt.name;
    open = false;
    dispatch('change', { value });
    dispatch('input', { value });
  }

  function clear() {
    value = null;
    query = '';
    dispatch('change', { value });
    dispatch('input', { value });
  }

  // Synchronise le texte affiché dès que `value` ou `options` changent.
  // onMount ne suffit pas car les options peuvent arriver après le montage (chargement asynchrone).
  $: {
    if (value && options.length > 0) {
      const sel = options.find((o) => o.id === value);
      if (sel && query !== sel.name) query = sel.name;
    } else if (!value) {
      // Si la valeur est vidée de l'extérieur, on efface aussi le texte affiché
      if (query && !open) query = '';
    }
  }
</script>

<div class={className} style="position:relative">
  <input
    {id}
    type="text"
    placeholder={placeholder}
    bind:value={query}
    on:input={() => (open = true)}
    on:focus={() => (open = true)}
    on:blur={() => setTimeout(() => (open = false), 150)}
    class="w-full bg-surface-container-high text-sm px-4 py-2.5 rounded-xl border border-outline-variant/10 outline-none"
    autocomplete="off"
  />

  {#if clearable && query}
    <button type="button" class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant" on:click|preventDefault={clear}>✕</button>
  {/if}

  {#if open}
    <div class="absolute left-0 right-0 mt-2 z-20 rounded-2xl border border-outline-variant/20 bg-surface-container-high p-2 shadow-2xl max-h-56 overflow-auto">
      {#if filtered.length === 0}
        <div class="px-4 py-2 text-xs text-on-surface-variant">Aucun résultat</div>
      {/if}
      {#each filtered as opt (opt.id)}
        <button type="button" class="w-full text-left px-4 py-2 rounded-xl hover:bg-surface-container-low transition-colors flex justify-between" on:click={() => select(opt)}>
          <span class="font-bold">{opt.name}</span>
          <span class="text-xs text-on-surface-variant">{opt.id}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  :global(.rounded-2xl) { border-radius: 1rem; }
</style>
