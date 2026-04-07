<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../stores/auth.svelte';
  import { dashboardStore } from '../stores/dashboard.svelte';
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

  const switchGuild = (guildId) => {
    authStore.setGuild(guildId);
    dashboardStore.refresh();
  };

  const logout = () => {
    authStore.logout();
  };

  const getUserAvatar = () => {
    if (!authStore.user || !authStore.user.id || !authStore.user.avatar) {
      return 'https://cdn.discordapp.com/embed/avatars/0.png';
    }
    return `https://cdn.discordapp.com/avatars/${authStore.user.id}/${authStore.user.avatar}.png`;
  };

  const inviteBot = (guildId) => {
    if (!config.discordClientId) return;
    window.open(`https://discord.com/api/oauth2/authorize?client_id=${config.discordClientId}&permissions=8&scope=bot%20applications.commands&guild_id=${guildId}&disable_guild_select=true`, '_blank');
  };

  let showGuilds = $state(false);
  let searchQuery = $state('');

  const filteredGuilds = $derived(
    authStore.guilds.filter(g => 
      g.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const installedGuilds = $derived(filteredGuilds.filter(g => g.botPresent));
  const availableGuilds = $derived(filteredGuilds.filter(g => !g.botPresent));

  
  function handleKeydown(e) {
    if (e.key === '/' && !showGuilds) {
      e.preventDefault();
      showGuilds = true;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#snippet guildItem(guild)}
  <div class="flex items-center justify-between px-2">
    <button 
      onclick={() => { if(guild.botPresent) { switchGuild(guild.id); showGuilds = false; searchQuery = ''; } }}
      class="flex-1 flex items-center gap-3.5 px-3 py-2.5 rounded-2xl transition-all duration-300 group hover:bg-primary/5 {guild.botPresent ? 'cursor-pointer opacity-100' : 'cursor-not-allowed opacity-50'}"
    >
      <div class="relative w-10 h-10 shrink-0">
        <div class="absolute -inset-0.5 bg-linear-to-tr from-primary/20 to-secondary/20 rounded-xl blur opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div class="relative w-full h-full rounded-xl bg-surface-container-high flex items-center justify-center overflow-hidden border border-outline-variant/30 group-hover:scale-105 transition-transform duration-300">
          {#if guild.icon}
            <img src="https://cdn.discordapp.com/icons/{guild.id}/{guild.icon}.png" alt={guild.name} class="w-full h-full object-cover"/>
          {:else}
            <span class="text-xs font-black text-primary">{guild.name.charAt(0)}</span>
          {/if}
        </div>
      </div>
      <div class="flex flex-col min-w-0 text-left">
        <span class="text-[13px] font-bold truncate transition-colors {guild.id === authStore.selectedGuildId ? 'text-primary' : 'text-on-surface group-hover:text-primary'}">{guild.name}</span>
        <span class="text-[9px] font-bold opacity-40 uppercase tracking-widest">{guild.botPresent ? 'Instance active' : 'Bot absent'}</span>
      </div>
    </button>
    
    {#if !guild.botPresent}
      <button 
        onclick={() => inviteBot(guild.id)}
        class="mr-3 p-2.5 bg-primary/10 hover:bg-primary text-primary hover:text-on-primary rounded-xl transition-all shadow-sm group/invite active:scale-90"
        title="Inviter le bot"
      >
        <span class="material-symbols-outlined text-lg group-hover/invite:rotate-12 transition-transform">add_circle</span>
      </button>
    {/if}

    {#if guild.id === authStore.selectedGuildId && guild.botPresent}
      <div class="mr-4 flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary animate-in zoom-in duration-300">
        <span class="material-symbols-outlined text-base font-bold">check</span>
      </div>
    {/if}
  </div>
{/snippet}

<header class="flex items-center justify-between px-10 bg-surface/40 backdrop-blur-3xl w-[calc(100%-16rem)] h-20 fixed top-0 right-0 z-40 border-b border-outline-variant/30 transition-all duration-300">
  <div class="flex items-center gap-6">
    <div class="relative">
      <button 
        onclick={() => showGuilds = !showGuilds}
        class="flex items-center gap-3 bg-surface-container-low hover:bg-surface-container-high px-5 py-2.5 rounded-2xl text-xs font-bold text-on-surface-variant border border-outline-variant/30 transition-all duration-300 shadow-sm hover:shadow-xl active:scale-95 group"
      >
        <div class="w-2.5 h-2.5 rounded-full {authStore.guilds.find(g => g.id === authStore.selectedGuildId)?.botPresent ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400 opacity-50'}"></div>
        <span class="tracking-tight">{authStore.guilds.find(g => g.id === authStore.selectedGuildId)?.name || 'Sélectionner un serveur'}</span>
        <span class="material-symbols-outlined text-lg transition-transform duration-300 {showGuilds ? 'rotate-180' : 'group-hover:translate-y-0.5'}">expand_more</span>
      </button>

      {#if showGuilds}
        <div 
          role="menu"
          tabindex="-1"
          class="absolute top-full left-0 mt-4 w-96 bg-surface/95 backdrop-blur-3xl rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] border border-outline-variant/20 z-50 overflow-hidden animate-in fade-in slide-in-from-top-4 zoom-in-95 duration-500"
        >
          
          <div class="p-5 pb-3 border-b border-outline-variant/10">
            <div class="relative group/search">
              <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/40 group-focus-within/search:text-primary transition-colors">search</span>
              <input 
                type="text" 
                bind:value={searchQuery}
                placeholder="Rechercher un serveur..."
                class="w-full bg-surface-container-highest/30 border border-outline-variant/20 rounded-2xl py-3 pl-12 pr-4 text-sm font-medium focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-on-surface-variant/30"
              />
              <div class="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-40 pointer-events-none">
                <span class="text-[10px] font-black border border-outline-variant/50 px-1.5 py-0.5 rounded-md">ESC</span>
              </div>
            </div>
          </div>

          <div class="max-h-120 overflow-y-auto scrollbar-hide py-3 space-y-6">
            {#if installedGuilds.length > 0}
              <div>
                <div class="px-7 mb-2 text-[10px] font-black text-primary/60 uppercase tracking-[0.25em]">Serveurs configurés</div>
                <div class="px-3 space-y-1">
                  {#each installedGuilds as guild}
                    {@render guildItem(guild)}
                  {/each}
                </div>
              </div>
            {/if}

            {#if availableGuilds.length > 0}
              <div>
                <div class="px-7 mb-2 text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.25em]">Autres serveurs</div>
                <div class="px-3 space-y-1">
                  {#each availableGuilds as guild}
                    {@render guildItem(guild)}
                  {/each}
                </div>
              </div>
            {/if}

            {#if filteredGuilds.length === 0}
              <div class="px-6 py-12 flex flex-col items-center justify-center text-center">
                <div class="w-16 h-16 bg-surface-container-high rounded-3xl flex items-center justify-center mb-4 text-on-surface-variant/20">
                  <span class="material-symbols-outlined text-4xl">search_off</span>
                </div>
                <p class="text-sm font-bold text-on-surface">Aucun serveur trouvé</p>
                <p class="text-[11px] text-on-surface-variant/60 max-w-[200px] mt-1">Essayez un autre mot-clé ou vérifiez vos accès Discord.</p>
              </div>
            {/if}
          </div>

          
          <div class="p-4 bg-surface-container-low/50 border-t border-outline-variant/10 flex items-center justify-between">
            <button 
              onclick={() => { authStore.fetchGuilds(); }}
              class="flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/5 transition-all active:scale-95 group/refresh"
            >
              <span class="material-symbols-outlined text-sm group-active/refresh:rotate-180 transition-transform duration-500">sync</span>
              Actualiser la liste
            </button>
            <span class="text-[9px] font-bold text-on-surface-variant/30">{filteredGuilds.length} serveurs au total</span>
          </div>
        </div>
        
        
        <div 
          aria-hidden="true"
          class="fixed inset-0 z-40 bg-transparent" 
          onclick={() => { showGuilds = false; searchQuery = ''; }}
        ></div>
      {/if}
    </div>
  </div>

  <div class="flex items-center gap-8">
    <div class="hidden md:flex items-center gap-2 bg-emerald-500/10 px-4 py-2 rounded-full border border-emerald-500/20">
      <div class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
      <span class="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Connecté</span>
    </div>

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
