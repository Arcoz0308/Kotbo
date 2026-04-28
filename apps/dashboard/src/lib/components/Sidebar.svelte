<script lang="ts">
  import { router } from 'tinro';
  import Papicon from './Papicon.svelte';
  import { authStore } from '../stores/auth.svelte';

  const dashboardItems = $derived([
    { name: "Vue d'ensemble", icon: "grid", href: "/" },
    { name: "Mon Profil", icon: "user", href: "/profile/" + (authStore.user?.id || "") },
    { name: "Analytics", icon: "pie-chart", href: "/analytics" },
  ]);

  const moderationItems = [
    { name: "Contenu", icon: "file-text", href: "/content" },
    { name: "Daily Algo", icon: "code", href: "/module-settings/dailyalgo" },
    { name: "Membres", icon: "user", href: "/members" },
    { name: "Sanctions", icon: "alert-triangle", href: "/sanctions" },
    { name: "Logs Discord", icon: "file-text", href: "/logs" },
    { name: "Journal d'activité", icon: "history", href: "/activity" },
  ];

  const managementItems = [
    { name: "Recrutement", icon: "user-plus", href: "/recruitment" },
    { name: "Règlement", icon: "book", href: "/regulation" },
    { name: "Réunions", icon: "calendar", href: "/meetings" },
    { name: "Personnel", icon: "users", href: "/staff-management" },
  ];

  const configItems = [
    { name: "Modules", icon: "package", href: "/modules" },
    { name: "Commandes", icon: "terminal", href: "/command-access" },
    { name: "Paramètres", icon: "settings", href: "/settings" },
  ];

  const canManageSettings = $derived(
    authStore.guilds.find((guild) => guild.id === authStore.selectedGuildId)?.accessLevel !== 'moderator'
  );

  // Modérateurs ne voient pas Modules, Règlement, Commandes, Paramètres
  const visibleModerationItems = $derived(moderationItems);
  const visibleManagementItems = $derived(
    canManageSettings ? managementItems : managementItems.filter((item) => item.href !== '/regulation')
  );
  const visibleConfigItems = $derived(
    canManageSettings ? configItems : []
  );

  function isActiveNavItem(href: string) {
    if (href === '/') return $router.path === '/';
    return $router.path === href || $router.path.startsWith(`${href}/`);
  }

  const LOGO_URL = "/favicon.svg";

  type NavGroup = {
    label: string;
    items: typeof dashboardItems;
  };

  const navGroups = $derived.by((): NavGroup[] => {
    const groups: NavGroup[] = [
      { label: 'Tableau de bord', items: dashboardItems },
      { label: 'Modération', items: visibleModerationItems },
    ];
    if (visibleManagementItems.length > 0) {
      groups.push({ label: 'Gestion', items: visibleManagementItems });
    }
    if (visibleConfigItems.length > 0) {
      groups.push({ label: 'Configuration', items: visibleConfigItems });
    }
    return groups;
  });
</script>

<aside class="flex flex-col fixed left-0 top-0 h-screen w-64 bg-surface-container-low/80 backdrop-blur-3xl border-r border-outline-variant/30 z-50 transition-all duration-500 hover:shadow-[20px_0_40px_rgba(0,0,0,0.05)]">
  <div class="pl-8 pt-8 pb-2 flex items-center gap-4">
    <div class="relative w-11 h-11">
      <div class="absolute inset-0 bg-primary/20 rounded-2xl blur-lg animate-pulse"></div>
      <img alt="Logo" src={LOGO_URL} class="w-full h-full object-cover rounded-xl"/>
    </div>
    <div class="flex flex-col">
      <h1 class="text-xl font-black tracking-tighter text-on-surface font-headline leading-none">Kotbo</h1>
    </div>
  </div>

  <nav class="flex-1 mt-2 px-4 pb-8 space-y-1 overflow-y-auto scrollbar-hide">
    {#each navGroups as group, groupIdx}
      {#if groupIdx > 0}
        <div class="pt-4 mt-3 border-t border-outline-variant/30"></div>
      {/if}
      <div class="px-3 mb-2 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-[0.2em]">{group.label}</div>
      {#each group.items as item}
        <a 
          href={item.href}
          class="flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all duration-300 group relative overflow-hidden {isActiveNavItem(item.href) ? 'text-primary bg-primary/5 font-bold' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-hover/50'}"
        >
          {#if isActiveNavItem(item.href)}
            <div class="absolute left-0 top-3 bottom-3 w-1.5 bg-primary rounded-full animate-in slide-in-from-left-2 duration-300"></div>
          {/if}
          <Papicon 
            icon={item.icon} 
            size={20} 
            class="transition-all duration-300 {isActiveNavItem(item.href) ? 'scale-110' : 'opacity-60 group-hover:opacity-100 group-hover:scale-110'}" 
          />
          <span class="text-[13px] tracking-tight">{item.name}</span>
        </a>
      {/each}
    {/each}

    <!-- Mon Profil – en bas du nav -->
    <div class="pt-4 mt-3 border-t border-outline-variant/30">
      <div class="px-3 mb-2 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-[0.2em]">Espace Staff</div>
      <a 
        href="/profile"
        class="flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all duration-300 group relative overflow-hidden {isActiveNavItem('/profile') ? 'text-primary bg-primary/5 font-bold' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-hover/50'}"
      >
        {#if isActiveNavItem('/profile')}
          <div class="absolute left-0 top-3 bottom-3 w-1.5 bg-primary rounded-full animate-in slide-in-from-left-2 duration-300"></div>
        {/if}
        <Papicon 
          icon="shield" 
          size={20} 
          class="transition-all duration-300 {isActiveNavItem('/profile') ? 'scale-110' : 'opacity-60 group-hover:opacity-100 group-hover:scale-110'}" 
        />
        <span class="text-[13px] tracking-tight">Paramètres Staff</span>
      </a>
      <a 
        href="/absences"
        class="flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all duration-300 group relative overflow-hidden {isActiveNavItem('/absences') ? 'text-primary bg-primary/5 font-bold' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-hover/50'}"
      >
        {#if isActiveNavItem('/absences')}
          <div class="absolute left-0 top-3 bottom-3 w-1.5 bg-primary rounded-full animate-in slide-in-from-left-2 duration-300"></div>
        {/if}
        <Papicon 
          icon="calendar" 
          size={20} 
          class="transition-all duration-300 {isActiveNavItem('/absences') ? 'scale-110' : 'opacity-60 group-hover:opacity-100 group-hover:scale-110'}" 
        />
        <span class="text-[13px] tracking-tight">Mes Absences</span>
      </a>
    </div>
  </nav>
</aside>

<style>
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
</style>
