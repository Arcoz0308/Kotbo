<script lang="ts">
  import { router } from 'tinro';
  import Papicon from './Papicon.svelte';

  interface Props {
    open?: boolean;
  }

  let { open = $bindable(false) }: Props = $props();

  interface PaletteItem {
    id: string;
    label: string;
    sublabel?: string;
    icon: string;
    group: string;
    action: () => void;
  }

  let query = $state('');
  let selectedIndex = $state(0);
  let inputEl: HTMLInputElement;

  const navItems: PaletteItem[] = [
    { id: 'go-overview',    label: "Vue d'ensemble",      sublabel: 'Admin',                     icon: 'activity',    group: 'Navigation', action: () => router.goto('/admin') },
    { id: 'go-servers',    label: 'Serveurs',             sublabel: 'Admin',                     icon: 'Server',      group: 'Navigation', action: () => router.goto('/admin/servers') },
    { id: 'go-shards',     label: 'Shards',               sublabel: 'Admin',                     icon: 'Zap',         group: 'Navigation', action: () => router.goto('/admin/shards') },
    { id: 'go-modules',    label: 'Modules',              sublabel: 'Admin',                     icon: 'Box',         group: 'Navigation', action: () => router.goto('/admin/modules') },
    { id: 'go-security',   label: 'Sécurité',             sublabel: 'Admin · Admins & Blacklist', icon: 'ShieldCheck', group: 'Navigation', action: () => router.goto('/admin/security') },
    { id: 'go-content',    label: 'Mots globaux',         sublabel: 'Admin',                     icon: 'filter',      group: 'Navigation', action: () => router.goto('/admin/content') },
    { id: 'go-activation', label: "Codes d'activation",  sublabel: 'Admin',                     icon: 'Key',         group: 'Navigation', action: () => router.goto('/admin/activation') },
    { id: 'go-config',     label: 'Avancé',               sublabel: 'Admin · Configuration',     icon: 'Settings',    group: 'Navigation', action: () => router.goto('/admin/config') },
    { id: 'go-dashboard',  label: 'Dashboard',            sublabel: 'Retour au dashboard',       icon: 'ArrowLeft',   group: 'Navigation', action: () => router.goto('/') },
  ];

  const filteredItems = $derived(() => {
    const q = query.toLowerCase().trim();
    const matched = q
      ? navItems.filter(item =>
          item.label.toLowerCase().includes(q) ||
          item.sublabel?.toLowerCase().includes(q) ||
          item.group.toLowerCase().includes(q)
        )
      : navItems;

    // Group by group label
    const groups: Record<string, PaletteItem[]> = {};
    for (const item of matched) {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    }
    return groups;
  });

  const flatItems = $derived(() => Object.values(filteredItems()).flat());

  $effect(() => {
    if (open) {
      query = '';
      selectedIndex = 0;
      setTimeout(() => inputEl?.focus(), 50);
    }
  });

  function close() {
    open = false;
  }

  function runItem(item: PaletteItem) {
    item.action();
    close();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!open) return;
    const items = flatItems();

    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    }
    if (e.key === 'Enter' && items[selectedIndex]) {
      e.preventDefault();
      runItem(items[selectedIndex]);
    }
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      open = !open;
    }
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

{#if open}
  <div
    class="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4"
    onclick={close}
    role="dialog"
    aria-modal="true"
    aria-label="Palette de commandes"
  >
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/70 backdrop-blur-md animate-in fade-in duration-150"></div>

    <!-- Palette panel -->
    <div
      class="relative z-10 w-full max-w-xl bg-surface-container border border-outline-variant/20 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      onclick={(e) => e.stopPropagation()}
      onkeydown={handleKeydown}
      role="document"
    >
      <!-- Search input -->
      <div class="flex items-center gap-3 px-4 py-3.5 border-b border-outline-variant/10">
        <Papicon icon="Search" size={16} class="text-on-surface-variant/40 shrink-0" />
        <input
          bind:this={inputEl}
          bind:value={query}
          oninput={() => selectedIndex = 0}
          type="text"
          placeholder="Chercher une page, une action..."
          class="flex-1 bg-transparent text-sm text-on-surface placeholder-on-surface-variant/30 focus:outline-none font-medium"
        />
        <kbd class="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-on-surface/5 border border-outline-variant/10 text-[10px] font-black text-on-surface-variant/40 leading-none">
          ESC
        </kbd>
      </div>

      <!-- Results -->
      <div class="max-h-[60vh] overflow-y-auto py-2">
        {#each Object.entries(filteredItems()) as [group, items]}
          <div class="px-2 pb-1">
            <p class="text-[9px] font-black uppercase tracking-[0.2em] text-on-surface-variant/30 px-3 py-2">{group}</p>
            {#each items as item}
              {@const globalIdx = flatItems().indexOf(item)}
              {@const isSelected = globalIdx === selectedIndex}
              <button
                onclick={() => runItem(item)}
                onmouseenter={() => selectedIndex = globalIdx}
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-100
                  {isSelected ? 'bg-primary/10 text-primary' : 'text-on-surface-variant/70 hover:bg-on-surface/5 hover:text-on-surface'}"
              >
                <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors
                  {isSelected ? 'bg-primary/20 text-primary' : 'bg-on-surface/5 text-on-surface-variant/40'}">
                  <Papicon icon={item.icon} size={14} />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-bold leading-none truncate">{item.label}</p>
                  {#if item.sublabel}
                    <p class="text-[10px] text-on-surface-variant/40 mt-0.5 truncate">{item.sublabel}</p>
                  {/if}
                </div>
                {#if isSelected}
                  <kbd class="text-[9px] font-black text-primary/50 leading-none">↵</kbd>
                {/if}
              </button>
            {/each}
          </div>
        {/each}

        {#if flatItems().length === 0}
          <div class="flex flex-col items-center py-10 gap-2 text-center">
            <Papicon icon="SearchX" size={28} class="text-on-surface-variant/20" />
            <p class="text-sm text-on-surface-variant/40 font-medium">Aucun résultat pour «{query}»</p>
          </div>
        {/if}
      </div>

      <!-- Footer hint -->
      <div class="flex items-center gap-4 px-4 py-2.5 border-t border-outline-variant/10 bg-on-surface/2">
        <div class="flex items-center gap-1.5 text-[10px] text-on-surface-variant/30 font-medium">
          <kbd class="px-1.5 py-0.5 rounded bg-on-surface/8 border border-outline-variant/10 font-mono">↑↓</kbd>
          Naviguer
        </div>
        <div class="flex items-center gap-1.5 text-[10px] text-on-surface-variant/30 font-medium">
          <kbd class="px-1.5 py-0.5 rounded bg-on-surface/8 border border-outline-variant/10 font-mono">↵</kbd>
          Ouvrir
        </div>
        <div class="flex items-center gap-1.5 text-[10px] text-on-surface-variant/30 font-medium">
          <kbd class="px-1.5 py-0.5 rounded bg-on-surface/8 border border-outline-variant/10 font-mono">Esc</kbd>
          Fermer
        </div>
      </div>
    </div>
  </div>
{/if}
