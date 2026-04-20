<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../stores/auth.svelte';
  import { dashboardStore } from '../stores/dashboard.svelte';
  import { themeStore } from '../stores/theme.svelte';
  import { API_BASE_URL } from '../api';

  let config = $state({ discordClientId: '' });
  let userMenuOpen = $state(false);

  onMount(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/config`);
      if (res.ok) {
        config = await res.json();
      }
    } catch (err) {
      console.error('Fetch config error:', err);
    }

    // Close dropdown on outside click
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.user-menu-container')) {
        userMenuOpen = false;
      }
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  });

  const logout = () => {
    authStore.logout();
  };

  const getUserAvatar = () => {
    if (!authStore.user || !authStore.user.id || !authStore.user.avatar) {
      return 'https://cdn.discordapp.com/embed/avatars/0.png';
    }
    return `https://cdn.discordapp.com/avatars/${authStore.user.id}/${authStore.user.avatar}.png`;
  };

  const selectedGuildAccessLabel = $derived(
    authStore.guilds.find((guild) => guild.id === authStore.selectedGuildId)?.accessLevel === 'moderator'
      ? 'Modérateur'
      : 'Administrateur'
  );

  function toggleUserMenu(e: MouseEvent) {
    e.stopPropagation();
    userMenuOpen = !userMenuOpen;
  }
</script>

<svelte:window />

<header class="flex items-center justify-between px-10 bg-surface/40 backdrop-blur-3xl w-[calc(100%-16rem)] h-20 fixed top-0 right-0 z-40 border-b border-outline-variant/30 transition-all duration-300">
  <div class="flex items-center gap-6">
    <div class="relative">
      <div class="flex items-center gap-3 bg-surface-container-low px-5 py-2.5 rounded-2xl text-xs font-bold text-on-surface-variant border border-outline-variant/30 transition-all duration-300 shadow-sm">
        <div class="w-2.5 h-2.5 rounded-full {authStore.guilds.find(g => g.id === authStore.selectedGuildId)?.botPresent ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400 opacity-50'}"></div>
        <span class="tracking-tight">
          {#if authStore.guilds.find(g => g.id === authStore.selectedGuildId)?.name}
            {authStore.guilds.find(g => g.id === authStore.selectedGuildId)?.name}
          {:else}
            <div class="h-4 w-24 bg-surface-variant/50 rounded animate-pulse inline-block align-middle"></div>
          {/if}
        </span>
      </div>
    </div>
  </div>

  <div class="flex items-center gap-8">
    <div class="hidden md:flex items-center gap-2 bg-slate-500/10 px-4 py-2 rounded-full border border-slate-500/20">
      <span class="material-symbols-outlined text-sm text-slate-500">verified_user</span>
      <span class="text-[10px] font-black text-slate-600 uppercase tracking-widest">{selectedGuildAccessLabel}</span>
    </div>

        <button
      onclick={() => themeStore.toggle()}
      class="relative w-10 h-10 rounded-2xl border border-outline-variant/30 bg-surface-container-low flex items-center justify-center transition-all duration-500 hover:scale-110 hover:shadow-lg hover:shadow-primary/10 group/theme overflow-hidden"
      aria-label="Changer de th\u00e8me"
      id="theme-toggle"
    >
      <div class="absolute inset-0 bg-linear-to-tr from-amber-400/0 to-indigo-500/0 group-hover/theme:from-amber-400/10 group-hover/theme:to-indigo-500/10 transition-all duration-500"></div>
      {#if themeStore.dark}
        <span class="material-symbols-outlined text-lg text-amber-400 transition-all duration-500 group-hover/theme:rotate-[360deg] group-hover/theme:scale-110" style="font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24">light_mode</span>
      {:else}
        <span class="material-symbols-outlined text-lg text-indigo-400 transition-all duration-500 group-hover/theme:-rotate-[20deg] group-hover/theme:scale-110" style="font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24">dark_mode</span>
      {/if}
    </button>

    <div class="flex items-center gap-4 group">
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
            <img class="w-full h-full object-cover" src={getUserAvatar()} alt="Avatar"/>
          </div>
        </div>
        <span class="material-symbols-outlined text-sm text-on-surface-variant/50 transition-transform duration-300 {userMenuOpen ? 'rotate-180' : ''}">expand_more</span>
      </button>

      {#if userMenuOpen}
        <div class="absolute right-0 top-16 w-56 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest/95 backdrop-blur-2xl shadow-2xl shadow-black/15 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
          <div class="p-4 border-b border-outline-variant/20">
            <p class="text-xs font-black text-on-surface truncate">{authStore.user?.username}</p>
            <p class="text-[10px] text-on-surface-variant/60 mt-0.5">ID: {authStore.user?.id?.slice(0, 10)}...</p>
          </div>
          <div class="py-1.5">
            <a 
              href="/profile" 
              class="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-on-surface-variant transition-all hover:bg-primary/8 hover:text-primary"
              onclick={() => userMenuOpen = false}
            >
              <span class="material-symbols-outlined text-lg">person</span>
              Mon Profil
            </a>
            <a 
              href="/activity" 
              class="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-on-surface-variant transition-all hover:bg-primary/8 hover:text-primary"
              onclick={() => userMenuOpen = false}
            >
              <span class="material-symbols-outlined text-lg">history</span>
              Mon Activité
            </a>
            <a 
              href="/settings" 
              class="flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-on-surface-variant transition-all hover:bg-primary/8 hover:text-primary"
              onclick={() => userMenuOpen = false}
            >
              <span class="material-symbols-outlined text-lg">settings</span>
              Paramètres
            </a>
          </div>
          <div class="border-t border-outline-variant/20 py-1.5">
            <button 
              type="button"
              onclick={logout} 
              class="flex items-center gap-3 px-4 py-2.5 w-full text-left text-sm font-black text-rose-600 transition-all hover:bg-rose-500/8"
            >
              <span class="material-symbols-outlined text-lg">logout</span>
              Déconnexion
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</header>
<div class="h-20"></div> 
