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
    <!-- Backdrop -->
    <button
      type="button"
      class="absolute inset-0 bg-black/70 backdrop-blur-md border-none cursor-default w-full h-full text-left p-0"
      onclick={close}
      aria-label="Fermer"
      transition:fade={{ duration: 150 }}
    ></button>

    <!-- Switcher panel -->
    <div
      class="relative z-10 w-full max-w-md bg-surface-container border border-outline-variant/20 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
      role="document"
      transition:scale={{ start: 0.97, duration: 150 }}
    >
      <!-- Search input -->
      <div class="flex items-center gap-3 px-4 py-3.5 border-b border-outline-variant/10">
        <Papicon icon="Search" size={16} class="text-on-surface-variant/40 shrink-0" />
        <input
          bind:this={inputEl}
          bind:value={query}
          oninput={() => selectedIndex = 0}
          onkeydown={handleKeydown}
          type="text"
          placeholder="Rechercher un serveur..."
          class="flex-1 bg-transparent text-sm text-on-surface placeholder-on-surface-variant/30 focus:outline-none font-medium"
        />
        <kbd class="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-on-surface/5 border border-outline-variant/10 text-[10px] font-black text-on-surface-variant/40 leading-none">
          ESC
        </kbd>
      </div>

      <!-- Results list -->
      <div class="max-h-[50vh] overflow-y-auto py-2">
        <p class="text-[9px] font-black uppercase tracking-[0.2em] text-on-surface-variant/30 px-4 py-2">
          Serveurs ({filteredGuilds.length})
        </p>

        {#each filteredGuilds as guild, idx}
          {@const isSelected = idx === selectedIndex}
          {@const isActive = guild.id === authStore.selectedGuildId}
          {@const iconUrl = resolveGuildIconSrc(guild.id, guild.icon)}
          
          <button
            onclick={() => selectGuild(guild.id)}
            onmouseenter={() => selectedIndex = idx}
            class="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-all duration-100
              {isSelected ? 'bg-primary/10 text-primary' : 'text-on-surface-variant/70 hover:bg-on-surface/5 hover:text-on-surface'}"
          >
            <!-- Guild Icon -->
            {#if iconUrl}
              <img
                src={iconUrl}
                alt={guild.name}
                referrerpolicy="no-referrer"
                class="w-7 h-7 rounded-lg object-cover border border-outline-variant/10"
              />
            {:else}
              <div class="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-[10px] font-black text-primary border border-primary/20">
                {guild.name.charAt(0)}
              </div>
            {/if}

            <!-- Guild Details -->
            <div class="flex-1 min-w-0">
              <p class="text-sm font-bold leading-none truncate flex items-center gap-2">
                {guild.name}
                {#if isActive}
                  <span class="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">Actuel</span>
                {/if}
              </p>
              <p class="text-[10px] text-on-surface-variant/40 mt-0.5 truncate">
                Rôle : {guild.accessLevel === 'admin' ? 'Propriétaire / Admin' : guild.accessLevel === 'moderator' ? 'Modérateur' : 'Membre'}
              </p>
            </div>

            <!-- Arrow indicators -->
            {#if isSelected}
              <kbd class="text-[9px] font-black text-primary/50 leading-none">↵</kbd>
            {/if}
          </button>
        {:else}
          <div class="flex flex-col items-center py-10 gap-2 text-center">
            <Papicon icon="SearchX" size={28} class="text-on-surface-variant/20" />
            <p class="text-sm text-on-surface-variant/40 font-medium">Aucun serveur trouvé</p>
          </div>
        {/each}
      </div>

      <!-- Footer hint -->
      <div class="flex items-center gap-4 px-4 py-2.5 border-t border-outline-variant/10 bg-on-surface/2">
        <div class="flex items-center gap-1.5 text-[10px] text-on-surface-variant/30 font-medium">
          <kbd class="px-1.5 py-0.5 rounded bg-on-surface/8 border border-outline-variant/10 font-mono">↑↓</kbd>
          Naviguer
        </div>
        <div class="flex items-center gap-1.5 text-[10px] text-on-surface-variant/30 font-medium">
          <kbd class="px-1.5 py-0.5 rounded bg-on-surface/8 border border-outline-variant/10 font-mono">↵</kbd>
          Sélectionner
        </div>
      </div>
    </div>
  </div>
{/if}
