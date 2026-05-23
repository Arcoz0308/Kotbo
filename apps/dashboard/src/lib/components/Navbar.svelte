<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../stores/auth.svelte';
  import { dashboardStore } from '../stores/dashboard.svelte';
  import { themeStore } from '../stores/theme.svelte';
  import { API_BASE_URL } from '../api';
  import NotificationBell from './NotificationBell.svelte';
  import Papicon from './Papicon.svelte';

  let config = $state({ discordClientId: '' });
  let userMenuOpen = $state(false);
  let serverDropdownOpen = $state(false);
  let searchQuery = $state('');

  onMount(() => {
    // Fire async fetch without making the onMount callback async
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/config`);
        if (res.ok) {
          config = await res.json();
        }
      } catch (err) {
        console.error('Fetch config error:', err);
      }
    })();

    // Close dropdown on outside click
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.user-menu-container')) {
        userMenuOpen = false;
      }
      if (!target.closest('.server-selector-container')) {
        serverDropdownOpen = false;
        searchQuery = '';
      }
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  });

  function toggleServerDropdown(e: MouseEvent) {
    e.stopPropagation();
    serverDropdownOpen = !serverDropdownOpen;
    if (!serverDropdownOpen) {
      searchQuery = '';
    }
  }

  const logout = () => {
    authStore.logout();
  };

  const getUserAvatar = () => {
    if (!authStore.user || !authStore.user.id || !authStore.user.avatar) {
      return 'https://cdn.discordapp.com/embed/avatars/0.png';
    }
    return `https://cdn.discordapp.com/avatars/${authStore.user.id}/${authStore.user.avatar}.png`;
  };

  const selectedGuild = $derived(
    authStore.guilds.find((guild) => guild.id === authStore.selectedGuildId)
  );

  const filteredGuilds = $derived(
    authStore.guilds.filter((guild) =>
      guild.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const highestRole = $derived.by(() => {
    const roles = authStore.member?.roles;
    if (!roles) return '...';

    const sortedRoles = [...roles]
      .filter(r => r.name !== '@everyone' && !r.managed)
      .sort((a, b) => b.position - a.position);

    if (sortedRoles.length === 0) return 'Membre';

    let topRole = sortedRoles[0];
    if (topRole.name === 'Gérant' && sortedRoles.length > 1) {
      topRole = sortedRoles[1];
    }

    return topRole?.name || 'Membre';
  });

  const guildIconUrl = $derived(
    selectedGuild?.icon 
      ? `https://cdn.discordapp.com/icons/${selectedGuild.id}/${selectedGuild.icon}.png`
      : null
  );

  function toggleUserMenu(e: MouseEvent) {
    e.stopPropagation();
    userMenuOpen = !userMenuOpen;
  }
</script>

<svelte:window />

<header class="flex items-center justify-between px-10 bg-surface/40 backdrop-blur-3xl w-[calc(100%-16rem)] h-20 fixed top-0 right-0 z-40 border-b border-outline-variant/30 transition-all duration-300">
  <div class="flex items-center gap-6 server-selector-container relative">
    <button 
      onclick={toggleServerDropdown}
      disabled={authStore.guilds.length <= 1}
      class="flex items-center gap-3 bg-surface-container-low hover:bg-surface-container-high/80 px-5 py-2.5 rounded-2xl text-xs font-bold text-on-surface border border-outline-variant/30 hover:border-primary/30 transition-all duration-300 shadow-sm hover:shadow-md cursor-pointer disabled:cursor-default disabled:hover:bg-surface-container-low disabled:border-outline-variant/30 group"
    >
      {#if guildIconUrl}
        <img src={guildIconUrl} alt="Server Logo" class="w-6 h-6 rounded-lg object-cover transition-transform duration-300 group-hover:scale-105">
      {:else}
        <div class="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-[10px] font-black text-primary border border-primary/20 transition-transform duration-300 group-hover:scale-105">
          {selectedGuild?.name?.charAt(0) || '?'}
        </div>
      {/if}
      <span class="tracking-tight text-on-surface-variant font-bold transition-colors group-hover:text-primary">
        {#if selectedGuild?.name}
          {selectedGuild.name}
        {:else}
          <div class="h-4 w-24 bg-surface-variant/50 rounded animate-pulse inline-block align-middle"></div>
        {/if}
      </span>
      {#if authStore.guilds.length > 1}
        <Papicon icon="chevron-down" size={14} class="text-on-surface-variant/50 group-hover:text-primary transition-transform duration-300 {serverDropdownOpen ? 'rotate-180 text-primary' : ''}" />
      {/if}
    </button>

    {#if serverDropdownOpen && authStore.guilds.length > 1}
      <div class="absolute left-0 top-14 w-64 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest/95 backdrop-blur-2xl shadow-2xl shadow-black/15 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50 py-1.5">
        <div class="px-4 py-2 border-b border-outline-variant/20 mb-1.5 space-y-2">
          <p class="text-[10px] font-black text-on-surface-variant/60 uppercase tracking-widest">Sélectionner un serveur</p>
          <div class="relative flex items-center">
            <span class="absolute left-3 text-on-surface-variant/40">
              <Papicon icon="search" size={12} />
            </span>
            <input
              type="text"
              placeholder="Rechercher..."
              bind:value={searchQuery}
              class="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface/50 border border-outline-variant/30 text-[11px] font-medium text-on-surface placeholder:text-on-surface-variant/30 focus:outline-hidden focus:border-primary/50 transition-colors"
            />
          </div>
        </div>
        <div class="max-h-60 overflow-y-auto pr-1">
          {#if filteredGuilds.length === 0}
            <div class="px-4 py-3 text-center text-xs text-on-surface-variant/50 font-bold">
              Aucun serveur trouvé
            </div>
          {:else}
            {#each filteredGuilds as guild}
              <button
                onclick={() => {
                  authStore.setGuild(guild.id);
                  serverDropdownOpen = false;
                  searchQuery = '';
                  window.location.reload();
                }}
                class="w-full flex items-center gap-3 px-4 py-2.5 text-left text-xs font-bold transition-all hover:bg-primary/8 {guild.id === authStore.selectedGuildId ? 'text-primary bg-primary/4' : 'text-on-surface-variant hover:text-primary'}"
              >
                {#if guild.icon}
                  <img src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`} alt={guild.name} class="w-5 h-5 rounded-md object-cover">
                {:else}
                  <div class="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center text-[8px] font-black text-primary border border-primary/20">
                    {guild.name.charAt(0)}
                  </div>
                {/if}
                <span class="truncate flex-1">{guild.name}</span>
                {#if guild.id === authStore.selectedGuildId}
                  <Papicon icon="check" size={14} class="text-primary shrink-0" />
                {/if}
              </button>
            {/each}
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <div class="flex items-center gap-8">
    {#if !authStore.member || !authStore.member.roles}
      <div class="hidden md:flex items-center gap-2 bg-slate-500/5 px-4 py-2 rounded-full border border-slate-500/10 animate-pulse">
        <div class="w-5 h-5 bg-slate-500/20 rounded-full"></div>
        <div class="w-16 h-3 bg-slate-500/20 rounded-md"></div>
      </div>
    {:else}
      <div class="hidden md:flex items-center gap-2 bg-slate-500/10 px-4 py-2 rounded-full border border-slate-500/20">
        <Papicon icon={selectedGuild?.accessLevel === 'moderator' ? 'user' : selectedGuild?.accessLevel === 'admin' ? 'crown' : 'none'} size={24} class="text-slate-500" />
        <span class="text-[12px] font-black text-slate-600 uppercase tracking-widest">{highestRole}</span>
      </div>
    {/if}

        <button
      onclick={() => themeStore.toggle()}
      class="relative w-10 h-10 rounded-2xl border border-outline-variant/30 bg-surface-container-low flex items-center justify-center transition-all duration-500 hover:scale-110 hover:shadow-lg hover:shadow-primary/10 group/theme overflow-hidden"
      aria-label="Changer de th\u00e8me"
      id="theme-toggle"
    >
      <div class="absolute inset-0 bg-linear-to-tr from-amber-400/0 to-indigo-500/0 group-hover/theme:from-amber-400/10 group-hover/theme:to-indigo-500/10 transition-all duration-500"></div>
      {#if themeStore.dark}
        <Papicon icon="sun" size={18} class="text-amber-400 transition-all duration-500 group-hover/theme:rotate-[360deg] group-hover/theme:scale-110" />
      {:else}
        <Papicon icon="moon" size={18} class="text-indigo-400 transition-all duration-500 group-hover/theme:-rotate-[20deg] group-hover/theme:scale-110" />
      {/if}
    </button>

    <NotificationBell />

    <div class="flex items-center gap-4 group user-menu-container relative">
      <div class="flex flex-col items-end">
        <span class="text-xs font-black text-on-surface font-headline leading-none">
          {#if authStore.user?.username}
            {authStore.user?.username}
          {:else}
            <div class="h-3 w-20 bg-surface-variant/50 rounded animate-pulse"></div>
          {/if}
        </span>
        <button onclick={logout} class="text-[9px] font-black text-error/60 uppercase tracking-widest hover:text-error hover:underline transition-colors mt-1">Déconnexion</button>
      </div>
      <button 
        onclick={toggleUserMenu}
        class="flex items-center gap-2 hover:bg-surface-container-high/50 p-1.5 rounded-2xl transition-all duration-300 group/avatar"
      >
        <div class="relative w-10 h-10 shrink-0">
          <div class="absolute -inset-1 bg-linear-to-tr from-primary/40 to-secondary/40 rounded-xl blur-md opacity-0 group-hover/avatar:opacity-100 transition-opacity duration-500"></div>
          <div class="relative w-full h-full rounded-xl border-2 border-white/50 shadow-lg overflow-hidden transition-transform duration-500 group-hover/avatar:scale-105">
            {#if !authStore.user}
              <div class="w-full h-full bg-slate-500/20 animate-pulse"></div>
            {:else}
              <img class="w-full h-full object-cover" src={getUserAvatar()} alt="Avatar"/>
            {/if}
          </div>
        </div>
        <Papicon icon="chevron-down" size={14} class="text-on-surface-variant/50 transition-transform duration-300 {userMenuOpen ? 'rotate-180' : ''}" />
      </button>

      {#if userMenuOpen}
        <div class="absolute right-0 top-16 w-56 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest/95 backdrop-blur-2xl shadow-2xl shadow-black/15 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
          <div class="p-4 border-b border-outline-variant/20">
            <p class="text-xs font-black text-on-surface truncate">{authStore.user?.username}</p>
            <p class="text-[10px] text-on-surface-variant/60 mt-0.5">ID: {authStore.user?.id?.slice(0, 10)}...</p>
          </div>
          <div class="py-1.5">
            <a 
              href="/profile/{authStore.user?.id}" 
              class="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-on-surface-variant transition-all hover:bg-primary/8 hover:text-primary"
              onclick={() => userMenuOpen = false}
            >
              <Papicon icon="user" size={18} />
              Mon Profil
            </a>
            <a 
              href="/activity" 
              class="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-on-surface-variant transition-all hover:bg-primary/8 hover:text-primary"
              onclick={() => userMenuOpen = false}
            >
              <Papicon icon="history" size={18} />
              Mon Activité
            </a>
            <a 
              href="/settings" 
              class="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-on-surface-variant transition-all hover:bg-primary/8 hover:text-primary"
              onclick={() => userMenuOpen = false}
            >
              <Papicon icon="settings" size={18} />
              Paramètres
            </a>
          </div>
          <div class="border-t border-outline-variant/20 py-1.5">
            <button 
              type="button"
              onclick={logout} 
              class="flex items-center gap-3 px-4 py-2.5 w-full text-left text-sm font-black text-rose-600 transition-all hover:bg-rose-500/8"
            >
              <Papicon icon="log-out" size={18} />
              Déconnexion
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</header>
<div class="h-20"></div> 
