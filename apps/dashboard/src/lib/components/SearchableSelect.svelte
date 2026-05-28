<script lang="ts">
  import { onMount } from 'svelte';

  export let id: string = '';
  export let value: string = '';
  export let options: Array<{ id: string; name: string }> = [];
  export let placeholder: string = '';
  export let className: string = '';
  export let multiple: boolean = false;

  let input = '';
  let open = false;
  let filtered: Array<{ id: string; name: string }> = [];
  let focusedIndex = -1;

  $: filtered = input.trim()
    ? options.filter(o => o.name.toLowerCase().includes(input.toLowerCase()) || o.id.includes(input))
    : options.slice(0, 200);

  onMount(() => {
    // initialize input label from value
    if (value) {
      const found = options.find(o => o.id === value);
      if (found) input = found.name;
    }
  });

  function openList() {
    open = true;
    focusedIndex = -1;
  }

  function closeList() {
    setTimeout(() => { open = false; }, 150);
  }

  function selectOption(opt: { id: string; name: string }) {
    value = opt.id;
    input = opt.name;
    open = false;
  }

  function onKeydown(e: KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      open = true; e.preventDefault(); return;
    }
    if (e.key === 'ArrowDown') {
      focusedIndex = Math.min(filtered.length - 1, focusedIndex + 1);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      focusedIndex = Math.max(0, focusedIndex - 1);
      e.preventDefault();
    } else if (e.key === 'Enter' && focusedIndex >= 0 && filtered[focusedIndex]) {
      selectOption(filtered[focusedIndex]);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      open = false;
    }
  }
</script>

<div class="relative" class:className>
  <input
    id={id}
    type="text"
    bind:value={input}
    placeholder={placeholder}
    class="w-full rounded-2xl px-4 py-2 text-sm bg-surface-container-high outline-none"
    on:focus={openList}
    on:blur={closeList}
    on:keydown={onKeydown}
    on:input={() => { open = true; }}
    autocomplete="off"
  />

  {#if open}
    <div class="absolute z-50 left-0 right-0 mt-2 max-h-64 overflow-auto rounded-2xl border border-outline-variant/20 bg-surface-container-high p-1 shadow-2xl">
      {#if filtered.length === 0}
        <div class="px-4 py-2 text-xs text-on-surface-variant">Aucun résultat</div>
      {/if}
      {#each filtered as opt, idx (opt.id)}
        <button
          type="button"
          class="w-full text-left px-4 py-2 rounded-xl hover:bg-surface-container-low transition-colors {focusedIndex === idx ? 'bg-surface-container-low' : ''}"
          on:mousedown={() => selectOption(opt)}
        >
          <div class="font-bold text-sm">{opt.name}</div>
          <div class="text-xs text-on-surface-variant">{opt.id}</div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  :global(.bg-surface-container-high) { background-color: rgba(255,255,255,0.02); }
</style>
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';

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

  onMount(() => {
    if (value) {
      const sel = options.find((o) => o.id === value);
      if (sel) query = sel.name;
    }
  });
</script>

<div class="relative" class:={className}>
  <input
    {id}
    type="text"
    placeholder={placeholder}
    bind:value={query}
    on:input={() => (open = true)}
    on:focus={() => (open = true)}
    on:blur={() => setTimeout(() => (open = false), 150)}
    class="w-full bg-surface-container-high text-sm px-4 py-2.5 rounded-xl border border-outline-variant/10 outline-none"
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
