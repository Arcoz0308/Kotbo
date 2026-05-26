<script lang="ts">
  import { router } from 'tinro';
  import Papicon from './Papicon.svelte';
  import { authStore } from '../stores/auth.svelte';
  import { dashboardStore } from '../stores/dashboard.svelte';
  import { notificationsStore } from '../stores/notifications.svelte';

  const dashboardItems = $derived.by(() => [
    { name: "Vue d'ensemble", icon: "grid", href: "/", featureKey: "dashboard" },
    {
      name: "Mon Profil",
      icon: "user",
      href: authStore.user?.id ? `/profile/${authStore.user.id}` : '/profile',
      featureKey: "dashboard",
    },
    { name: "Inbox", icon: "inbox", href: "/inbox", featureKey: "inbox" },
    { name: "Analytics", icon: "pie-chart", href: "/analytics", featureKey: "analytics" },
  ]);

  const moderationItems = [
    { name: "Daily Algo", icon: "code", href: "/dailyalgo", featureKey: "daily_algo" },
    { name: "Membres", icon: "user", href: "/members", featureKey: "members" },
    { name: "Sanctions", icon: "alert-triangle", href: "/sanctions", featureKey: "sanctions" },
    { name: "Pseudos", icon: "filter", href: "/nickname-moderation", featureKey: "nickname_moderation" },
    { name: "Doubles Comptes", icon: "users", href: "/double-accounts", featureKey: "double_accounts" },
    { name: "Détections", icon: "bell", href: "/detections", featureKey: "double_accounts" },
    { name: "Invitations", icon: "link", href: "/invitations", featureKey: "members" },
    { name: "Logs Discord", icon: "file-text", href: "/logs", featureKey: "logs" },
    { name: "Journal d'activité", icon: "history", href: "/activity", featureKey: "activity" },
    { name: "Événements", icon: "zap", href: "/events", featureKey: "events" },
  ];

  const managementItems = [
    { name: "Règlement", icon: "book", href: "/regulation", featureKey: "regulation" },
    { name: "Actualités & RSS", icon: "rss", href: "/news", featureKey: "news" },
  ];

  const staffManagementItems = [
    { name: "Recrutement", icon: "user-plus", href: "/recruitment", featureKey: "recruitment" },
    { name: "Tickets Support", icon: "message-square", href: "/tickets", featureKey: "tickets" },
    { name: "Annuaire Staff", icon: "users", href: "/staff-management?tab=members", featureKey: "staff_directory" },
    { name: "Hiérarchie & Rôles", icon: "shield", href: "/staff-management?tab=roles", featureKey: "staff_roles" },
    { name: "Tutorat & Formation", icon: "book-open", href: "/tutoring", featureKey: "tutoring" },
    { name: "Réunions", icon: "calendar", href: "/meetings", featureKey: "meetings" },
    { name: "Planning", icon: "sun", href: "/absences", featureKey: "absences" },
    { name: "Sondages", icon: "bar-chart", href: "/staff-management?tab=polls", featureKey: "polls" },
    { name: "Discipline", icon: "alert-circle", href: "/staff-management?tab=warnings", featureKey: "discipline" },
  ];

  const configItems = [
    { name: "Modules", icon: "package", href: "/modules", featureKey: "modules" },
    { name: "Auto-Thread", icon: "chat", href: "/auto-thread", featureKey: "auto_thread" },
    { name: "Commandes", icon: "terminal", href: "/command-access", featureKey: "commands" },
    { name: "Paramètres", icon: "settings", href: "/settings", featureKey: "settings" },
  ];

  const adminItems = [
    { name: "Global Admin", icon: "lock", href: "/admin" },
  ];

  const featureAccess = $derived(dashboardStore.state.featureAccess || {});
  const fallbackCanView = $derived(
    authStore.guilds.find((guild) => guild.id === authStore.selectedGuildId)?.accessLevel !== 'none'
  );

  const canViewFeature = (featureKey: string) => {
    if (!featureKey) return true;
    const feature = featureAccess?.[featureKey];
    if (feature?.canView !== undefined) return feature.canView;
    return fallbackCanView;
  };

  const canManageSettings = $derived(
    !!featureAccess?.settings?.canConfigure
      || authStore.guilds.find((guild) => guild.id === authStore.selectedGuildId)?.accessLevel !== 'moderator'
  );

  const isAdmin = $derived(
    authStore.guilds.find((guild) => guild.id === authStore.selectedGuildId)?.accessLevel === 'admin'
  );

  const isTutor = $derived(dashboardStore.state.isTutor);
  const isApprentice = $derived(!!dashboardStore.state.apprenticeProgress);
  const isStaff = $derived(!!authStore.member);
  const isModerator = $derived(
    authStore.guilds.find((guild) => guild.id === authStore.selectedGuildId)?.accessLevel === 'moderator'
  );

  // Modérateurs ne voient pas Modules, Règlement, Commandes, Paramètres
  const visibleModerationItems = $derived(
    moderationItems.filter((item) => (isStaff || isModerator || isAdmin) && canViewFeature(item.featureKey))
  );
  const visibleManagementItems = $derived(
    managementItems.filter((item) => canViewFeature(item.featureKey))
  );
  const visibleStaffItems = $derived.by(() => {
    if (isAdmin) return staffManagementItems;
    return staffManagementItems.filter(item => {
      if (item.href === '/tutoring') return isTutor || isApprentice || isModerator;
      if (['/absences', '/meetings', '/tickets', '/recruitment'].includes(item.href)) return isStaff || isModerator;
      return false;
    }).filter((item) => canViewFeature(item.featureKey));
  });
  const visibleConfigItems = $derived(
    configItems.filter((item) => canViewFeature(item.featureKey))
  );

  function isActiveNavItem(href: string) {
    const r = $router;
    if (href === '/') return r.path === '/';
    // Handle query params for tabs
    const [path, query] = href.split('?');
    if (query) {
      return r.path === path && r.url.includes(query);
    }
    return r.path === path || r.path.startsWith(`${path}/`);
  }

  function isGroupActive(items: any[]) {
    return items.some(item => isActiveNavItem(item.href));
  }

  const LOGO_URL = "/favicon.svg";

  type NavGroup = {
    label: string;
    items: any[];
  };

  const navGroups = $derived.by((): NavGroup[] => {
    const groups: NavGroup[] = [
      { label: 'Tableau de bord', items: dashboardItems },
    ];
    if (visibleModerationItems.length > 0) groups.push({ label: "Modération", items: visibleModerationItems });
    if (visibleManagementItems.length > 0) groups.push({ label: "Gestion", items: visibleManagementItems });
    if (visibleStaffItems.length > 0) groups.push({ label: "Staff", items: visibleStaffItems });
    if (visibleConfigItems.length > 0) groups.push({ label: "Configuration", items: visibleConfigItems });
    if (authStore.isBotAdmin) groups.push({ label: "Administration", items: adminItems });

    return groups;
  });

  let searchQuery = $state("");

  const filteredNavGroups = $derived.by((): NavGroup[] => {
    if (!searchQuery.trim()) return navGroups;
    const query = searchQuery.toLowerCase().trim();
    return navGroups
      .map(group => ({
        ...group,
        items: group.items.filter(item => item.name.toLowerCase().includes(query))
      }))
      .filter(group => group.items.length > 0);
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

  <div class="px-4 py-2">
    <div class="relative flex items-center">
      <input
        type="text"
        placeholder="Rechercher..."
        bind:value={searchQuery}
        class="w-full pl-10 pr-8 py-2 text-xs rounded-xl bg-surface-container/30 border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/45 focus:bg-surface-container/60 transition-all duration-300"
      />
      <div class="absolute left-3.5 flex items-center justify-center text-on-surface-variant/40">
        <Papicon icon="search" size={14} />
      </div>
      {#if searchQuery}
        <button
          type="button"
          onclick={() => searchQuery = ""}
          class="absolute right-3 flex items-center justify-center p-1 rounded-lg text-on-surface-variant/40 hover:text-on-surface hover:bg-surface-variant/20 transition-all duration-200"
        >
          <Papicon icon="x" size={12} />
        </button>
      {/if}
    </div>
  </div>

  <nav class="flex-1 mt-2 px-4 pb-8 space-y-1 overflow-y-auto scrollbar-hide">
    {#each filteredNavGroups as group, groupIdx}
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
          
          {#if item.name === 'Inbox' && notificationsStore.unreadCount > 0}
            <div class="ml-auto min-w-5 h-5 px-1 bg-primary text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(var(--color-primary),0.3)] animate-in zoom-in duration-300">
              {notificationsStore.unreadCount > 99 ? '99+' : notificationsStore.unreadCount}
            </div>
          {/if}
        </a>
      {/each}
    {:else}
      <div class="flex flex-col items-center justify-center py-8 px-4 text-center">
        <Papicon icon="info" size={24} class="text-on-surface-variant/40 mb-2" />
        <p class="text-xs text-on-surface-variant/60">Aucun résultat trouvé</p>
      </div>
    {/each}
  </nav>
</aside>

<style>
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
</style>
