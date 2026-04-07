<script lang="ts">
  import { router } from 'tinro';
  import Papicon from './Papicon.svelte';
  import { authStore } from '../stores/auth.svelte';

  const navItems = [
    { name: "Vue d'ensemble", icon: "grid", href: "/" },
    { name: "Modules", icon: "sparkles", href: "/modules" },
    { name: "Contenu", icon: "newspaper", href: "/content" },
    { name: "Analytics", icon: "pie", href: "/analytics" },
  ];

  const canManageSettings = $derived(
    authStore.guilds.find((guild) => guild.id === authStore.selectedGuildId)?.accessLevel !== 'moderator'
  );

  const visibleNavItems = $derived(
    canManageSettings ? navItems : navItems.filter((item) => item.href !== '/modules')
  );

  function isActiveNavItem(href) {
    if (href === '/') return $router.path === '/';
    return $router.path === href || $router.path.startsWith(`${href}/`);
  }

  const secondaryItems = [
    { name: "Paramètres globaux", icon: "gears", href: "/settings" },
    { name: "Journal d'activité", icon: "grades", href: "/activity" },
  ];

  const visibleSecondaryItems = $derived(
    canManageSettings ? secondaryItems : secondaryItems.filter((item) => item.href !== '/settings')
  );

  const LOGO_URL = "/favicon.svg";
</script>

<aside class="flex flex-col fixed left-0 top-0 h-screen w-64 bg-surface-container-low/80 backdrop-blur-3xl border-r border-outline-variant/30 z-50 transition-all duration-500 hover:shadow-[20px_0_40px_rgba(0,0,0,0.05)]">
  <div class="p-8 flex items-center gap-4">
    <div class="relative w-11 h-11">
      <div class="absolute inset-0 bg-primary/20 rounded-2xl blur-lg animate-pulse"></div>
      <div class="relative w-full h-full rounded-2xl bg-white shadow-xl shadow-primary/10 p-1.5 overflow-hidden">
        <img alt="Logo" src={LOGO_URL} class="w-full h-full object-cover rounded-xl"/>
      </div>
    </div>
    <div class="flex flex-col">
      <h1 class="text-xl font-black tracking-tighter text-on-surface font-headline leading-none">Kotbo</h1>
      <span class="text-[9px] uppercase tracking-[0.3em] font-bold text-primary opacity-60">Dashboard</span>
    </div>
  </div>

  <nav class="flex-1 mt-6 px-4 space-y-1.5 overflow-y-auto scrollbar-hide">
    <div class="px-3 mb-2 text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-[0.2em]">Menu Principal</div>
    {#each visibleNavItems as item}
      <a 
        href={item.href}
        class="flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all duration-300 group relative overflow-hidden {isActiveNavItem(item.href) ? 'text-primary bg-primary/5 font-bold' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-hover/50'}"
      >
        {#if isActiveNavItem(item.href)}
          <div class="absolute left-0 top-3 bottom-3 w-1.5 bg-primary rounded-full animate-in slide-in-from-left-2 duration-300"></div>
        {/if}
        <Papicon icon={item.icon} size={22} class="transition-all duration-300 {isActiveNavItem(item.href) ? 'scale-110' : 'opacity-60 group-hover:opacity-100 group-hover:scale-110'}" />
        <span class="text-[13px] tracking-tight">{item.name}</span>
      </a>
    {/each}

    <div class="pt-6 mt-6 border-t border-outline-variant/30 px-3 flex flex-col gap-1.5">
      <div class="mb-2 text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-[0.2em]">Configuration</div>
      {#each visibleSecondaryItems as item}
        <a 
          href={item.href}
          class="flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all duration-300 group {$router.path === item.href ? 'text-primary bg-primary/5 font-bold' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-hover/50'}"
        >
          <Papicon icon={item.icon} size={20} class="transition-all duration-300 {$router.path === item.href ? 'scale-110' : 'opacity-60 group-hover:opacity-100'}" />
          <span class="text-[13px] tracking-tight">{item.name}</span>
        </a>
      {/each}
    </div>
  </nav>

  
  <div class="p-6">
    <div class="bg-gradient-to-br from-primary to-primary-container p-5 rounded-3xl text-on-primary shadow-2xl shadow-primary/20 relative overflow-hidden group">
      <div class="absolute -top-12 -right-12 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
      <p class="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1">Status</p>
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 bg-white rounded-full animate-pulse shadow-[0_0_8px_white]"></span>
        <span class="text-xs font-bold font-headline">Système Actif</span>
      </div>
    </div>
  </div>
</aside>

<style>
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
</style>
