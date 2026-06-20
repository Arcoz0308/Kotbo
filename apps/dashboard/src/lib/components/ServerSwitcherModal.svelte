<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import Papicon from './Papicon.svelte';
  import { authStore } from '../stores/auth.svelte';
  import { serverSwitcherStore } from '../stores/serverSwitcher.svelte';
  import { resolveGuildIconSrc } from '../discordMedia';

  let query = $state('');
  let selectedIndex = $state(0);
  let inputEl = $state<HTMLInputElement>();

  const open = $derived(serverSwitcherStore.open);

  const filteredGuilds = $derived.by(() => {
    const q = query.toLowerCase().trim();
    return authStore.guilds.filter(guild =>
      guild.name.toLowerCase().includes(q)
    );
  });

  $effect(() => {
    if (open) {
      query = '';
      selectedIndex = 0;
      setTimeout(() => inputEl?.focus(), 50);
    }
  });

  function close() {
    serverSwitcherStore.close();
  }

  function selectGuild(guildId: string) {
    if (guildId === authStore.selectedGuildId) {
      close();
      return;
    }
    authStore.setGuild(guildId);
    close();
    window.location.reload();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!open) return;
    const items = filteredGuilds;

    if (e.key === 'Escape') {
      close();
      return;
    }
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
      selectGuild(items[selectedIndex].id);
    }
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-100 flex items-start justify-center pt-[15vh] px-4"
    role="dialog"
    aria-modal="true"
    aria-label="Sélecteur de serveurs"
    tabindex="-1"
    onkeydown={(e) => { if (e.key === 'Escape') close(); }}
  >
    <button
      type="button"
      class="absolute inset-0 bg-black/40 border-none cursor-default w-full h-full text-left p-0"
      onclick={close}
      aria-label="Fermer"
      transition:fade={{ duration: 100 }}
    ></button>

    <div
      class="relative z-10 w-full max-w-md bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg overflow-hidden"
      role="document"
      transition:scale={{ start: 0.98, duration: 150 }}
    >
      <div class="flex items-center gap-2.5 px-3 py-2.5 border-b border-outline-variant">
        <Papicon icon="Search" size={15} class="text-on-surface-variant/40 shrink-0" />
        <input
          bind:this={inputEl}
          bind:value={query}
          oninput={() => selectedIndex = 0}
          onkeydown={handleKeydown}
          type="text"
          placeholder="Rechercher un serveur..."
          class="flex-1 bg-transparent text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none"
        />
        <kbd class="hidden sm:flex px-1.5 py-0.5 rounded bg-surface-container border border-outline-variant text-[10px] font-medium text-on-surface-variant/40 leading-none">
          ESC
        </kbd>
      </div>

      <div class="max-h-[50vh] overflow-y-auto py-1">
        <p class="text-[10px] font-medium uppercase tracking-wider text-on-surface-variant px-3 py-1.5">
          Serveurs ({filteredGuilds.length})
        </p>

        {#each filteredGuilds as guild, idx}
          {@const isSelected = idx === selectedIndex}
          {@const isActive = guild.id === authStore.selectedGuildId}
          {@const iconUrl = resolveGuildIconSrc(guild.id, guild.icon)}

          <button
            onclick={() => selectGuild(guild.id)}
            onmouseenter={() => selectedIndex = idx}
            class="w-full flex items-center gap-2.5 px-3 py-2 mx-1 rounded-lg text-left transition-colors duration-100
              {isSelected ? 'bg-primary/8 text-primary' : 'text-on-surface-variant hover:bg-surface-container'}"
            style="width: calc(100% - 0.5rem)"
          >
            {#if iconUrl}
              <img
                src={iconUrl}
                alt={guild.name}
                referrerpolicy="no-referrer"
                class="w-6 h-6 rounded object-cover"
              />
            {:else}
              <div class="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-[10px] font-medium text-primary">
                {guild.name.charAt(0)}
              </div>
            {/if}

            <div class="flex-1 min-w-0">
              <p class="text-sm leading-none truncate flex items-center gap-1.5">
                {guild.name}
                {#if isActive}
                  <span class="text-[9px] font-medium uppercase tracking-wide px-1 py-0.5 rounded bg-primary/10 text-primary">Actuel</span>
                {/if}
              </p>
              <p class="text-[10px] text-on-surface-variant mt-0.5 truncate">
                {guild.accessLevel === 'admin' ? 'Admin' : guild.accessLevel === 'moderator' ? 'Modérateur' : 'Membre'}
              </p>
            </div>

            {#if isSelected}
              <kbd class="text-[9px] text-primary/50 leading-none">↵</kbd>
            {/if}
          </button>
        {:else}
          <div class="flex flex-col items-center py-8 gap-1.5 text-center">
            <Papicon icon="SearchX" size={24} class="text-on-surface-variant/30" />
            <p class="text-sm text-on-surface-variant/50">Aucun serveur trouvé</p>
          </div>
        {/each}
      </div>

      <div class="flex items-center gap-3 px-3 py-2 border-t border-outline-variant bg-surface-container">
        <div class="flex items-center gap-1 text-[10px] text-on-surface-variant/40">
          <kbd class="px-1 py-0.5 rounded bg-surface-container-highest border border-outline-variant font-mono text-[9px]">↑↓</kbd>
          Naviguer
        </div>
        <div class="flex items-center gap-1 text-[10px] text-on-surface-variant/40">
          <kbd class="px-1 py-0.5 rounded bg-surface-container-highest border border-outline-variant font-mono text-[9px]">↵</kbd>
          Sélectionner
        </div>
      </div>
    </div>
  </div>
{/if}
