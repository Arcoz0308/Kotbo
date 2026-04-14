<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../stores/auth.svelte';
  import { dashboardStore } from '../stores/dashboard.svelte';
  import { themeStore } from '../stores/theme.svelte';
  import { API_BASE_URL } from '../api';

  let config = $state({ discordClientId: '' });

  onMount(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/config`);
      if (res.ok) {
        config = await res.json();
      }
    } catch (err) {
      console.error('Fetch config error:', err);
    }
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
</script>

<svelte:window />

<header class="flex items-center justify-between px-10 bg-surface/40 backdrop-blur-3xl w-[calc(100%-16rem)] h-20 fixed top-0 right-0 z-40 border-b border-outline-variant/30 transition-all duration-300">
  <div class="flex items-center gap-6">
    <div class="relative">
      <div class="flex items-center gap-3 bg-surface-container-low px-5 py-2.5 rounded-2xl text-xs font-bold text-on-surface-variant border border-outline-variant/30 transition-all duration-300 shadow-sm">
        <div class="w-2.5 h-2.5 rounded-full {authStore.guilds.find(g => g.id === authStore.selectedGuildId)?.botPresent ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400 opacity-50'}"></div>
        <span class="tracking-tight">{authStore.guilds.find(g => g.id === authStore.selectedGuildId)?.name || 'Chargement...'}</span>
      </div>
    </div>
  </div>

  <div class="flex items-center gap-8">
    <div class="hidden md:flex items-center gap-2 bg-slate-500/10 px-4 py-2 rounded-full border border-slate-500/20">
      <span class="material-symbols-outlined text-sm text-slate-500">verified_user</span>
      <span class="text-[10px] font-black text-slate-600 uppercase tracking-widest">{selectedGuildAccessLabel}</span>
    </div>

    <div class="hidden md:flex items-center gap-2 bg-emerald-500/10 px-4 py-2 rounded-full border border-emerald-500/20">
      <div class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
      <span class="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Connecté</span>
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
        <span class="text-xs font-black text-on-surface font-headline leading-none">{authStore.user?.username || 'Chargement...'}</span>
        <button onclick={logout} class="text-[9px] font-black text-error/60 uppercase tracking-widest hover:text-error hover:underline transition-colors mt-1">Déconnexion</button>
      </div>
      <div class="relative w-11 h-11 shrink-0">
        <div class="absolute -inset-1 bg-linear-to-tr from-primary/40 to-secondary/40 rounded-2xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
        <div class="relative w-full h-full rounded-2xl border-2 border-white/50 shadow-2xl shadow-primary/5 overflow-hidden group-hover:scale-105 transition-transform duration-500 cursor-pointer">
          <img class="w-full h-full object-cover" src={getUserAvatar()} alt="Avatar"/>
        </div>
      </div>
    </div>
  </div>
</header>
<div class="h-20"></div> 

<style>
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
</style>
