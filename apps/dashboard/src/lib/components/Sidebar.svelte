<script lang="ts">
  import { fade } from 'svelte/transition';
  import { router } from 'tinro';
  import Papicon from './Papicon.svelte';
  import { authStore } from '../stores/auth.svelte';
  import { dashboardStore } from '../stores/dashboard.svelte';
  import { notificationsStore } from '../stores/notifications.svelte';
  import { sidebarStore } from '../stores/sidebar.svelte';
  import { updateSidebarFavorites } from '../api';
  import { portal } from '../actions/portal';
  import {
    generalItems,
    moderationItems,
    communityItems,
    staffItems,
    configItems,
    isPageBeta,
    isPageWip,
    type PageConfig,
  } from '../config/pages';
  import { resolveUserAvatarSrc } from '../discordMedia';
  import { unsavedChanges } from '../stores/unsavedChanges.svelte';

  type NavGroup = { key: string; label: string; items: PageConfig[] };

  let isDesktop = $state(
    typeof window !== 'undefined'
      ? window.matchMedia('(min-width: 1024px)').matches
      : true,
  );

  $effect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => { isDesktop = e.matches; };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  });

  const collapsed  = $derived(sidebarStore.collapsed);
  const mobileOpen = $derived(sidebarStore.mobileOpen ?? false);
  const isCollapsed = $derived(collapsed && isDesktop); // only desk

  $effect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('overflow-hidden', !isDesktop && mobileOpen);
    return () => document.body.classList.remove('overflow-hidden');
  });

  // autoclose
  $effect(() => {
    $router.path;
    if (!isDesktop) sidebarStore.closeMobile?.();
  });

  let activeTooltip = $state<{ text: string; top: number } | null>(null);

  function showTooltip(e: MouseEvent, text: string): void {
    if (!isCollapsed) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    activeTooltip = { text, top: rect.top + rect.height / 2 };
  }

  const hideTooltip = (): void => { activeTooltip = null; };

  $effect(() => { if (!isCollapsed) activeTooltip = null; });

  const featureAccess = $derived(dashboardStore.state.featureAccess ?? {});
  const currentGuild  = $derived(
    authStore.guilds.find((g) => g.id === authStore.selectedGuildId),
  );

  const canViewFeature = (featureKey?: string): boolean => {
    if (!featureKey) return true;
    const feature = (featureAccess as Record<string, any>)[featureKey];
    if (feature?.canView !== undefined) return feature.canView;
    return currentGuild?.accessLevel !== 'none';
  };

  const isModuleDisabled = (featureKey?: string): boolean => {
    if (!featureKey) return false;
    if (featureKey === 'economy') return !dashboardStore.state.economyEnabled;
    if (featureKey === 'fun') return !dashboardStore.state.funEnabled;
    if (featureKey === 'daily_algo') return !dashboardStore.state.dailyAlgoEnabled;
    if (featureKey === 'auto_thread') return !dashboardStore.state.autoThreadEnabled;
    if (featureKey === 'translation') return !dashboardStore.state.translationEnabled;
    if (featureKey === 'codepolice') return !dashboardStore.state.codePoliceEnabled;
    return false;
  };

  const isAdmin      = $derived(currentGuild?.accessLevel === 'admin');
  const isModerator  = $derived(currentGuild?.accessLevel === 'moderator');
  const isTutor      = $derived(dashboardStore.state.isTutor);
  const isApprentice = $derived(!!dashboardStore.state.apprenticeProgress);
  const isStaff      = $derived(!!authStore.member);

  const visibleGeneral    = $derived(generalItems.filter((i) => canViewFeature(i.featureKey)));
  const visibleCommunity  = $derived(communityItems.filter((i) => canViewFeature(i.featureKey)));
  const visibleModeration = $derived(
    isStaff || isModerator || isAdmin
      ? moderationItems.filter((i) => canViewFeature(i.featureKey))
      : [],
  );
  const visibleConfig = $derived(
    isAdmin ? configItems.filter((i) => canViewFeature(i.featureKey)) : [],
  );

  const visibleStaff = $derived.by((): PageConfig[] => {
    if (isAdmin) return staffItems.filter((i) => canViewFeature(i.featureKey));
    return staffItems
      .filter(({ href }) => {
        if (href === '/tutoring') return isTutor || isApprentice || isModerator;
        if (['/planning', '/absences', '/meetings', '/tickets', '/recruitment'].includes(href)) {
          return isStaff || isModerator;
        }
        return false;
      })
      .filter((i) => canViewFeature(i.featureKey));
  });

  const navGroups = $derived.by((): NavGroup[] =>
    ([
      { key: 'general',    label: 'Général',       items: visibleGeneral    },
      { key: 'moderation', label: 'Modération',     items: visibleModeration },
      { key: 'community',  label: 'Communauté',     items: visibleCommunity  },
      { key: 'staff',      label: 'Staff',          items: visibleStaff      },
      { key: 'config',     label: 'Configuration',  items: visibleConfig     },
    ] satisfies NavGroup[]).filter((g) => g.items.length > 0),
  );

  const itemLabel = (item: PageConfig): string => {
    if (isPageWip(item))  return `${item.name} (WIP)`;
    if (isPageBeta(item)) return `${item.name} (Bêta)`;
    return item.name;
  };

  function loadGroupStates(): Record<string, boolean> {
    try {
      const s = typeof localStorage !== 'undefined' && localStorage.getItem('sidebar_groups');
      return s ? (JSON.parse(s) as Record<string, boolean>) : {};
    } catch { return {}; }
  }

  let groupStates = $state<Record<string, boolean>>(loadGroupStates());

  const isGroupCollapsed = (key: string): boolean => {
    if (navGroups.find((g) => g.key === key)?.items.some((i) => isActiveNavItem(i.href))) {
      return false;
    }
    return groupStates[key] === true;
  };

  function toggleGroup(key: string): void {
    groupStates = { ...groupStates, [key]: !isGroupCollapsed(key) };
    try { localStorage.setItem('sidebar_groups', JSON.stringify(groupStates)); } catch {}
  }
  let searchQuery       = $state('');
  let showOnlyFavorites = $state(false);

  const sanitizeFavorites = (entries: unknown): string[] => {
    if (!Array.isArray(entries)) return [];
    return [
      ...new Set(
        entries
          .filter((e): e is string => typeof e === 'string' && e.startsWith('/'))
          .map((e) => e.trim())
          .filter(Boolean),
      ),
    ].slice(0, 80);
  };

  const readLegacyFavorites = (): string[] => {
    try {
      const s = typeof localStorage !== 'undefined' && localStorage.getItem('sidebar_favorites');
      return sanitizeFavorites(s ? JSON.parse(s) : []);
    } catch { return []; }
  };

  let favorites         = $state<string[]>([]);
  let favoritesHydrated = $state(false);
  let hydratedGuildId   = $state<string | null>(null);
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const guildId    = authStore.selectedGuildId ?? null;
    const serverFavs = sanitizeFavorites((dashboardStore.state as any).sidebarFavorites ?? []);

    if (hydratedGuildId !== guildId) {
      hydratedGuildId   = guildId;
      favoritesHydrated = false;
    }

    if (!favoritesHydrated) {
      const legacy = readLegacyFavorites();
      favorites    = serverFavs.length > 0 ? serverFavs : legacy;
      if (legacy.length > 0 && !serverFavs.length && guildId) void persistFavorites(legacy);
      favoritesHydrated = true;
      return;
    }

    if (JSON.stringify(serverFavs) !== JSON.stringify(favorites)) {
      favorites = serverFavs;
    }
  });

  async function persistFavorites(next: string[]): Promise<void> {
    const guildId = authStore.selectedGuildId;
    if (!guildId) return;
    const sanitized = sanitizeFavorites(next);
    (dashboardStore.state as any).sidebarFavorites = sanitized;
    try { localStorage.setItem('sidebar_favorites', JSON.stringify(sanitized)); } catch {}
    await updateSidebarFavorites(sanitized, guildId);
  }

  function queuePersist(next: string[]): void {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => void persistFavorites(next), 250);
  }

  function toggleFavorite(href: string, e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    favorites = favorites.includes(href)
      ? favorites.filter((h) => h !== href)
      : [...favorites, href];
    queuePersist(favorites);
  }

  const filteredGroups = $derived.by((): NavGroup[] => {
    let groups = showOnlyFavorites
      ? navGroups
          .map((g) => ({ ...g, items: g.items.filter((i) => favorites.includes(i.href)) }))
          .filter((g) => g.items.length > 0)
      : navGroups;

    const q = searchQuery.trim().toLowerCase();
    if (!q) return groups;

    return groups
      .map((g) => ({ ...g, items: g.items.filter((i) => i.name.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length > 0);
  });

  function isActiveNavItem(href: string): boolean {
    const r = $router;
    if (href === '/') return r.path === '/';

    const [path, query] = href.split('?');
    if (query) return r.path === path && r.url.includes(query);

    return r.path === path || r.path.startsWith(`${path}/`);
  }

  let swipeStartX = 0;
  let swipeStartY = 0;

  function onTouchStart(e: TouchEvent): void {
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
  }

  function onTouchEnd(e: TouchEvent): void {
    const dx = swipeStartX - e.changedTouches[0].clientX;
    const dy = Math.abs(swipeStartY - e.changedTouches[0].clientY);

    if (dx > 60 && dy < 80) sidebarStore.closeMobile?.();
  }

  const profileHref = $derived(
    authStore.user?.id ? `/profile/${authStore.user.id}` : '/profile',
  );

  const userAvatar = $derived(
    resolveUserAvatarSrc(authStore.user?.id, authStore.user?.avatar),
  );

  const LOGO_URL = '/favicon.svg';
</script>

{#if !isDesktop && mobileOpen}
  <div
    role="presentation"
    class="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
    transition:fade={{ duration: 200 }}
    onclick={() => sidebarStore.closeMobile?.()}
  ></div>
{/if}

<aside
  ontouchstart={onTouchStart}
  ontouchend={onTouchEnd}
  class="
    fixed left-0 top-0 h-dvh flex flex-col z-50
    bg-surface-container-low/90 backdrop-blur-3xl
    border-r border-outline-variant/30
    will-change-transform transition-[transform,width] duration-300 ease-in-out
    w-72
    {!isDesktop && mobileOpen ? 'translate-x-0 shadow-2xl' : ''}
    {!isDesktop && !mobileOpen ? '-translate-x-full' : ''}
    lg:translate-x-0 lg:shadow-none
    {isCollapsed ? 'lg:w-[4.5rem]' : 'lg:w-64'}
  "
>

  <button
    type="button"
    onclick={() => sidebarStore.toggle()}
    class="
      absolute -right-3.5 top-16 z-10
      w-7 h-7 rounded-full border border-outline-variant/30
      bg-surface-container-low shadow-md
      hidden lg:flex items-center justify-center
      transition-all duration-300
      hover:bg-primary/10 hover:border-primary/40 hover:scale-110
      text-on-surface-variant hover:text-primary
    "
    aria-label={isCollapsed ? 'Étendre la sidebar' : 'Réduire la sidebar'}
  >
    <div class="transition-transform duration-300 {isCollapsed ? 'rotate-180' : ''}">
      <Papicon icon="chevrons-left" size={13} />
    </div>
  </button>

  <div class="flex items-center gap-3 px-4 pt-5 pb-4 {isCollapsed ? 'lg:justify-center' : ''}">
    <div class="relative w-9 h-9 shrink-0">
      <div class="absolute inset-0 bg-primary/20 rounded-xl blur-md animate-pulse" aria-hidden="true"></div>
      <img alt="Kotbo" src={LOGO_URL} class="relative w-full h-full object-cover rounded-xl" />
    </div>

    {#if !isCollapsed}
      <div class="flex flex-col min-w-0 flex-1">
        <span class="text-[15px] font-black tracking-tight text-on-surface leading-none">Kotbo</span>
        <span class="text-[10px] text-on-surface-variant/50 mt-0.5">Dashboard</span>
      </div>

      <!-- Mobile close btn -->
      <button
        type="button"
        onclick={() => sidebarStore.closeMobile?.()}
        class="flex items-center justify-center w-9 h-9 rounded-xl text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container/60 transition-colors lg:hidden"
        aria-label="Fermer la navigation"
      >
        <Papicon icon="x" size={16} />
      </button>
    {/if}
  </div>

  {#if !isCollapsed}
    <div class="px-3 pb-3 flex items-center gap-1.5">
      <!-- Search input -->
      <div class="relative flex-1">
        <input
          type="search"
          placeholder="Rechercher..."
          bind:value={searchQuery}
          autocomplete="off"
          autocorrect="off"
          spellcheck={false}
          class="
            w-full pl-9 pr-10 py-2.5 lg:py-2 text-xs rounded-xl
            bg-surface-container/40 border border-outline-variant/20
            text-on-surface placeholder:text-on-surface-variant/35
            focus:outline-none focus:border-primary/40 focus:bg-surface-container/60
            transition-all duration-200
          "
        />
        <div class="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/35 pointer-events-none">
          <Papicon icon="search" size={13} />
        </div>
        {#if searchQuery}
          <button
            type="button"
            onclick={() => (searchQuery = '')}
            class="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-on-surface-variant/40 hover:text-on-surface transition-colors"
            aria-label="Effacer la recherche"
          >
            <Papicon icon="x" size={11} />
          </button>
        {:else}
          <kbd class="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-on-surface/8 border border-outline-variant/10 text-[9px] font-black font-mono leading-none text-on-surface-variant/35 pointer-events-none hidden lg:block">
            ⌘K
          </kbd>
        {/if}
      </div>

      <button
        type="button"
        onclick={() => (showOnlyFavorites = !showOnlyFavorites)}
        aria-label="Filtrer par favoris"
        aria-pressed={showOnlyFavorites}
        title={showOnlyFavorites ? 'Afficher tout le menu' : 'Afficher les favoris'}
        class="
          flex items-center justify-center w-9 h-9 lg:w-8 lg:h-8 rounded-xl border
          transition-all duration-200 shrink-0
          {showOnlyFavorites
            ? 'bg-amber-500/10 border-amber-500/35 text-amber-500 hover:bg-amber-500/20'
            : 'bg-surface-container/40 border-outline-variant/20 text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container/60'}
        "
      >
        <Papicon icon="star" size={14} class={showOnlyFavorites ? 'fill-amber-500 text-amber-500' : ''} />
      </button>
    </div>
  {/if}

  <nav
    class="flex-1 overflow-y-auto overscroll-contain scrollbar-hide pb-2 {isCollapsed ? 'lg:px-2' : 'px-3'}"
    aria-label="Navigation principale"
  >
    {#each filteredGroups as group, gi (group.key)}

      {#if isCollapsed}
        {#if gi > 0}<div class="h-2" aria-hidden="true"></div>{/if}

        {#each group.items as item (item.href)}
          <a
            href={item.href}
            onmouseenter={(e) => showTooltip(e, itemLabel(item))}
            onmouseleave={hideTooltip}
            aria-label={itemLabel(item)}
            aria-current={isActiveNavItem(item.href) ? 'page' : undefined}
            class="
              relative flex items-center justify-center w-full py-2.5 rounded-xl
              transition-all duration-200 group
              {isActiveNavItem(item.href)
                ? 'text-primary bg-primary/8'
                : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container/60'}
              {isModuleDisabled(item.featureKey) ? 'opacity-50 grayscale' : ''}
            "
          >
            {#if isActiveNavItem(item.href)}
              <div class="absolute left-0 top-2 bottom-2 w-1 bg-primary rounded-full" aria-hidden="true"></div>
            {/if}

            <div class="relative">
              <Papicon
                icon={item.icon}
                size={19}
                class="transition-transform duration-200 {isActiveNavItem(item.href) ? '' : 'group-hover:scale-110'}"
              />
              {#if isPageWip(item)}
                <span class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-surface-container-low" aria-label="WIP"></span>
              {:else if isPageBeta(item)}
                <span class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-purple-500 ring-2 ring-surface-container-low" aria-label="Bêta"></span>
              {/if}
            </div>

            {#if item.name === 'Inbox' && notificationsStore.unreadCount > 0}
              <div
                class="absolute top-1 right-1 min-w-[14px] h-[14px] px-0.5 bg-primary text-white text-[8px] font-black rounded-full flex items-center justify-center"
                aria-label="{notificationsStore.unreadCount} notifications non lues"
              >
                {notificationsStore.unreadCount > 9 ? '9+' : notificationsStore.unreadCount}
              </div>
            {/if}
          </a>
        {/each}

      {:else}
        {#if gi > 0}
          <div class="my-1 border-t border-outline-variant/20" role="separator"></div>
        {/if}

        <button
          type="button"
          onclick={() => toggleGroup(group.key)}
          aria-expanded={!isGroupCollapsed(group.key)}
          aria-controls="nav-group-{group.key}"
          class="
            w-full flex items-center gap-2 px-2 py-2 mb-0.5 rounded-lg
            transition-colors hover:bg-surface-container/40
            group/label sticky top-0 z-10
            bg-surface-container-low/95 backdrop-blur-md
          "
        >
          <span class="flex-1 text-left text-[10px] font-bold text-on-surface-variant/55 uppercase tracking-[0.18em]">
            {group.label}
          </span>
          <div
            aria-hidden="true"
            class="text-on-surface-variant/30 group-hover/label:text-on-surface-variant/60 transition-transform duration-200 {isGroupCollapsed(group.key) ? '-rotate-90' : ''}"
          >
            <Papicon icon="chevron-down" size={11} />
          </div>
        </button>

        <!-- Group items -->
        {#if !isGroupCollapsed(group.key)}
          <div id="nav-group-{group.key}" class="space-y-0.5 mb-1">
            {#each group.items as item (item.href)}
              <div
                class="
                  relative flex items-center rounded-xl
                  transition-all duration-200 group
                  {isActiveNavItem(item.href)
                    ? 'text-primary bg-primary/7 font-semibold'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container/50'}
                  {isModuleDisabled(item.featureKey) ? 'opacity-50' : ''}
                "
              >
                {#if isActiveNavItem(item.href)}
                  <div class="absolute left-0 top-2 bottom-2 w-[3px] bg-primary rounded-full" aria-hidden="true"></div>
                {/if}

                <a
                  href={item.href}
                  aria-current={isActiveNavItem(item.href) ? 'page' : undefined}
                  class="flex-1 flex items-center gap-3 pl-3 pr-2 py-3 lg:py-2.5 min-w-0"
                >
                  <Papicon
                    icon={item.icon}
                    size={17}
                    class="shrink-0 transition-colors duration-200 {isActiveNavItem(item.href) ? 'text-primary' : 'text-on-surface-variant/50 group-hover:text-on-surface/80'}"
                  />
                  <span class="flex-1 min-w-0 text-[13px] leading-none truncate">{item.name}</span>
                </a>

                <!-- badges + fav -->
                <div class="flex items-center gap-1.5 pr-3 shrink-0">
                  {#if isPageWip(item)}
                    <span class="px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold tracking-wider uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20">
                      WIP
                    </span>
                  {:else if isPageBeta(item)}
                    <span class="px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold tracking-wider uppercase bg-purple-500/10 text-purple-500 border border-purple-500/20">
                      BETA
                    </span>
                  {/if}

                  {#if item.name === 'Inbox' && notificationsStore.unreadCount > 0}
                    <div
                      class="min-w-[18px] h-[18px] px-1 bg-primary text-white text-[9px] font-black rounded-full flex items-center justify-center"
                      aria-label="{notificationsStore.unreadCount} messages non lus"
                    >
                      {notificationsStore.unreadCount > 99 ? '99+' : notificationsStore.unreadCount}
                    </div>
                  {/if}

                  <button
                    type="button"
                    onclick={(e) => toggleFavorite(item.href, e)}
                    aria-label={favorites.includes(item.href) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                    aria-pressed={favorites.includes(item.href)}
                    class="
                      flex items-center justify-center w-7 h-7 rounded-lg
                      transition-all duration-200
                      text-on-surface-variant/30 hover:text-amber-500 hover:bg-amber-500/10
                      {favorites.includes(item.href)
                        ? 'opacity-100 text-amber-500'
                        : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}
                    "
                  >
                    <Papicon icon="star" size={13} class={favorites.includes(item.href) ? 'fill-amber-500 text-amber-500' : ''} />
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {/if}

    {:else}
      <!-- Empty state -->
      {#if !isCollapsed}
        <div class="flex flex-col items-center py-10 text-center text-on-surface-variant/40 px-4">
          {#if showOnlyFavorites}
            <Papicon icon="star" size={24} class="mb-3 text-amber-500/50" />
            <p class="text-xs leading-relaxed">
              Aucun favori enregistré. Cliquez sur l'étoile d'un menu pour l'ajouter.
            </p>
          {:else}
            <Papicon icon="search" size={24} class="mb-3" />
            <p class="text-xs">
              Aucun résultat pour <span class="font-semibold">"{searchQuery}"</span>
            </p>
          {/if}
        </div>
      {/if}
    {/each}
  </nav>

  <div class="border-t border-outline-variant/20 {isCollapsed ? 'lg:px-2 py-3' : 'px-3 py-3'} space-y-1">

    <!-- Bot admin link -->
    {#if authStore.isBotAdmin}
      <a
        href="/admin"
        onmouseenter={(e) => showTooltip(e, 'Administration')}
        onmouseleave={hideTooltip}
        aria-label={isCollapsed ? 'Administration' : undefined}
        aria-current={isActiveNavItem('/admin') ? 'page' : undefined}
        class="
          relative flex items-center rounded-xl
          transition-all duration-200 group
          {isCollapsed ? 'lg:justify-center py-2.5' : 'gap-3 px-3 py-3 lg:py-2'}
          {isActiveNavItem('/admin')
            ? 'text-amber-400 bg-amber-400/8'
            : 'text-on-surface-variant/50 hover:text-amber-400 hover:bg-amber-400/8'}
        "
      >
        <Papicon icon="lock" size={isCollapsed ? 19 : 17} class="shrink-0" />
        {#if !isCollapsed}
          <span class="text-[13px]">Administration</span>
        {/if}
      </a>
    {/if}

    <!-- User profile -->
    <a
      href={profileHref}
      onmouseenter={(e) => showTooltip(e, authStore.user?.username ?? 'Mon Profil')}
      onmouseleave={hideTooltip}
      aria-current={isActiveNavItem(profileHref) ? 'page' : undefined}
      class="flex items-center {isCollapsed ? 'lg:justify-center py-2' : 'gap-3 px-2 py-2'} rounded-xl transition-all duration-200 hover:bg-surface-container/60 group"
    >
      <div class="relative shrink-0 w-8 h-8">
        <img
          src={userAvatar}
          alt="Avatar de {authStore.user?.username ?? 'utilisateur'}"
          referrerpolicy="no-referrer"
          class="w-full h-full rounded-lg object-cover ring-1 ring-outline-variant/30 transition-transform duration-200 group-hover:scale-105"
        />
        {#if isActiveNavItem(profileHref)}
          <div class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-primary rounded-full border-2 border-surface-container-low" aria-hidden="true"></div>
        {/if}
      </div>
      {#if !isCollapsed}
        <div class="flex flex-col min-w-0">
          <span class="text-[12px] font-semibold text-on-surface truncate leading-none">
            {authStore.user?.username ?? '…'}
          </span>
          <span class="text-[10px] text-on-surface-variant/50 mt-0.5">Mon profil</span>
        </div>
      {/if}
    </a>

  </div>
</aside>

{#if activeTooltip && isCollapsed}
  <div
    use:portal
    role="tooltip"
    class="fixed z-[100] -translate-y-1/2 pointer-events-none bg-surface-container-high text-on-surface border border-outline-variant/40 rounded-lg px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap shadow-lg tooltip-arrow animate-in fade-in"
    style="left: calc(4.5rem + 8px); top: {activeTooltip.top}px"
  >
    {activeTooltip.text}
  </div>
{/if}

<style>
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

  .tooltip-arrow::before {
    content: '';
    position: absolute;
    left: -5px;
    top: 50%;
    transform: translateY(-50%) rotate(45deg);
    width: 8px;
    height: 8px;
    background: var(--surface-container-high);
    border-left: 1px solid color-mix(in srgb, var(--outline-variant) 40%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--outline-variant) 40%, transparent);
  }
</style>