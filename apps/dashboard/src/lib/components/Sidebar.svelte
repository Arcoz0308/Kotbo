<script lang="ts">
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
    type PageConfig
  } from '../config/pages';
  import { resolveUserAvatarSrc } from '../discordMedia';

  let activeTooltip = $state<{ text: string; top: number } | null>(null);

  function handleMouseEnter(event: MouseEvent, text: string) {
    if (!collapsed) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    activeTooltip = {
      text,
      top: rect.top + rect.height / 2
    };
  }

  function handleMouseLeave() {
    activeTooltip = null;
  }

  $effect(() => {
    if (!collapsed) {
      activeTooltip = null;
    }
  });

  // ─── Items de navigation (centralisés) ──────────────────────────────────────

  // ─── Accès / visibilité ───────────────────────────────────────────────────

  const featureAccess = $derived(dashboardStore.state.featureAccess || {});
  const fallbackCanView = $derived(
    authStore.guilds.find((g) => g.id === authStore.selectedGuildId)?.accessLevel !== 'none'
  );

  const canViewFeature = (featureKey: string | undefined) => {
    if (!featureKey) return true;
    const feature = (featureAccess as Record<string, any>)?.[featureKey];
    if (feature?.canView !== undefined) return feature.canView;
    return fallbackCanView;
  };

  const isAdmin = $derived(
    authStore.guilds.find((g) => g.id === authStore.selectedGuildId)?.accessLevel === 'admin'
  );
  const isTutor      = $derived(dashboardStore.state.isTutor);
  const isApprentice = $derived(!!dashboardStore.state.apprenticeProgress);
  const isStaff      = $derived(!!authStore.member);
  const isModerator  = $derived(
    authStore.guilds.find((g) => g.id === authStore.selectedGuildId)?.accessLevel === 'moderator'
  );

  const visibleGeneral = $derived(
    generalItems.filter((i) => canViewFeature(i.featureKey))
  );
  const visibleModeration = $derived(
    moderationItems.filter((i) => (isStaff || isModerator || isAdmin) && canViewFeature(i.featureKey))
  );
  const visibleCommunity = $derived(
    communityItems.filter((i) => canViewFeature(i.featureKey))
  );
  const visibleStaff = $derived.by(() => {
    if (isAdmin) return staffItems.filter((i) => canViewFeature(i.featureKey));
    return staffItems.filter((item) => {
      if (item.href === '/tutoring') return isTutor || isApprentice || isModerator;
      if (['/absences', '/meetings', '/tickets', '/recruitment'].includes(item.href)) return isStaff || isModerator;
      return false;
    }).filter((i) => canViewFeature(i.featureKey));
  });
  const visibleConfig = $derived(
    configItems.filter((i) => canViewFeature(i.featureKey))
  );

  // ─── Profil (bas de sidebar) ──────────────────────────────────────────────

  const profileHref = $derived(
    authStore.user?.id ? `/profile/${authStore.user.id}` : '/profile'
  );
  const userAvatar = $derived(
    resolveUserAvatarSrc(authStore.user?.id, authStore.user?.avatar)
  );

  // ─── Groupes de navigation ────────────────────────────────────────────────

  type NavGroup = { key: string; label: string; icon: string; items: PageConfig[] };

  function navItemStatusLabel(item: PageConfig): string {
    if (isPageWip(item)) return `${item.name} (WIP)`;
    if (isPageBeta(item)) return `${item.name} (Bêta)`;
    return item.name;
  }

  const navGroups = $derived.by((): NavGroup[] => {
    const groups: NavGroup[] = [];
    if (visibleGeneral.length > 0)
      groups.push({ key: 'general',    label: 'Général',     icon: 'home',    items: visibleGeneral });
    if (visibleModeration.length > 0)
      groups.push({ key: 'moderation', label: 'Modération',  icon: 'shield',  items: visibleModeration });
    if (visibleCommunity.length > 0)
      groups.push({ key: 'community',  label: 'Communauté',  icon: 'users',   items: visibleCommunity });
    if (visibleStaff.length > 0)
      groups.push({ key: 'staff',      label: 'Staff',       icon: 'briefcase', items: visibleStaff });
    if (visibleConfig.length > 0)
      groups.push({ key: 'config',     label: 'Configuration', icon: 'sliders', items: visibleConfig });
    return groups;
  });

  // ─── Sections repliables ──────────────────────────────────────────────────

  function loadGroupStates(): Record<string, boolean> {
    try {
      const s = typeof localStorage !== 'undefined' && localStorage.getItem('sidebar_groups');
      return s ? JSON.parse(s) : {};
    } catch { return {}; }
  }

  let groupStates = $state<Record<string, boolean>>(loadGroupStates());

  function isGroupCollapsed(key: string): boolean {
    // Si un item du groupe est actif, on force l'ouverture
    const group = navGroups.find((g) => g.key === key);
    if (group && group.items.some((i) => isActiveNavItem(i.href))) return false;
    return groupStates[key] === true;
  }

  function toggleGroup(key: string) {
    groupStates = { ...groupStates, [key]: !isGroupCollapsed(key) };
    try {
      localStorage.setItem('sidebar_groups', JSON.stringify(groupStates));
    } catch {}
  }

  // ─── Recherche ────────────────────────────────────────────────────────────

  let searchQuery = $state('');
  let showOnlyFavorites = $state(false);

  function sanitizeFavorites(entries: unknown): string[] {
    if (!Array.isArray(entries)) return [];
    return entries
      .filter((entry): entry is string => typeof entry === 'string' && entry.startsWith('/'))
      .map((entry) => entry.trim())
      .filter((entry, index, arr) => entry.length > 0 && arr.indexOf(entry) === index)
      .slice(0, 80);
  }

  function readLegacyFavorites(): string[] {
    try {
      const stored = typeof localStorage !== 'undefined' && localStorage.getItem('sidebar_favorites');
      return sanitizeFavorites(stored ? JSON.parse(stored) : []);
    } catch {
      return [];
    }
  }

  let favorites = $state<string[]>([]);
  let favoritesHydrated = $state(false);
  let hydratedGuildId = $state<string | null>(null);
  let favoritesPersistTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const guildId = authStore.selectedGuildId ?? null;
    const serverFavorites = sanitizeFavorites((dashboardStore.state as any).sidebarFavorites || []);

    if (hydratedGuildId !== guildId) {
      hydratedGuildId = guildId;
      favoritesHydrated = false;
    }

    if (!favoritesHydrated) {
      if (serverFavorites.length > 0) {
        favorites = serverFavorites;
      } else {
        const legacyFavorites = readLegacyFavorites();
        favorites = legacyFavorites;
        if (legacyFavorites.length > 0 && guildId) {
          void persistFavorites(legacyFavorites);
        }
      }
      favoritesHydrated = true;
      return;
    }

    const serializedServer = JSON.stringify(serverFavorites);
    const serializedLocal = JSON.stringify(favorites);
    if (serializedServer !== serializedLocal) {
      favorites = serverFavorites;
    }
  });

  async function persistFavorites(nextFavorites: string[]) {
    const guildId = authStore.selectedGuildId;
    if (!guildId) return;

    const sanitizedFavorites = sanitizeFavorites(nextFavorites);
    (dashboardStore.state as any).sidebarFavorites = sanitizedFavorites;

    try {
      localStorage.setItem('sidebar_favorites', JSON.stringify(sanitizedFavorites));
    } catch {
      // Ignore local storage failures.
    }

    await updateSidebarFavorites(sanitizedFavorites, guildId);
  }

  function queuePersistFavorites(nextFavorites: string[]) {
    if (favoritesPersistTimer) {
      clearTimeout(favoritesPersistTimer);
    }
    favoritesPersistTimer = setTimeout(() => {
      void persistFavorites(nextFavorites);
    }, 250);
  }

  function toggleFavorite(href: string, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (favorites.includes(href)) {
      favorites = favorites.filter((h) => h !== href);
    } else {
      favorites = [...favorites, href];
    }
    queuePersistFavorites(favorites);
  }

  const filteredGroups = $derived.by((): NavGroup[] => {
    let baseGroups = navGroups;
    if (showOnlyFavorites) {
      baseGroups = baseGroups
        .map((g) => ({
          ...g,
          items: g.items.filter((i) => favorites.includes(i.href))
        }))
        .filter((g) => g.items.length > 0);
    }
    if (!searchQuery.trim()) return baseGroups;
    const q = searchQuery.toLowerCase().trim();
    return baseGroups
      .map((g) => ({ ...g, items: g.items.filter((i) => i.name.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length > 0);
  });

  // ─── Active / collapsed state ─────────────────────────────────────────────

  function isActiveNavItem(href: string) {
    const r = $router;
    if (href === '/') return r.path === '/';
    const [path, query] = href.split('?');
    if (query) return r.path === path && r.url.includes(query);
    return r.path === path || r.path.startsWith(`${path}/`);
  }

  const collapsed = $derived(sidebarStore.collapsed);
  const LOGO_URL = '/favicon.svg';
</script>

<aside class="sidebar flex flex-col fixed left-0 top-0 h-screen bg-surface-container-low/80 backdrop-blur-3xl border-r border-outline-variant/30 z-50 transition-all duration-300 {collapsed ? 'sidebar--collapsed' : 'sidebar--expanded'}">

  <!-- ─── Bouton collapse (onglet flottant) ─── -->
  <button
    type="button"
    onclick={() => sidebarStore.toggle()}
    class="absolute -right-3.5 top-16 z-10 w-7 h-7 rounded-full border border-outline-variant/30 bg-surface-container-low shadow-md flex items-center justify-center transition-all duration-300 hover:bg-primary/10 hover:border-primary/40 hover:scale-110 text-on-surface-variant hover:text-primary"
    aria-label={collapsed ? 'Étendre' : 'Réduire'}
    title={collapsed ? 'Étendre la sidebar' : 'Réduire la sidebar'}
  >
    <div class="transition-transform duration-300 {collapsed ? 'rotate-180' : ''}">
      <Papicon icon="chevrons-left" size={13} />
    </div>
  </button>

  <!-- ─── Header ─── -->
  <div class="flex items-center gap-3 px-4 pt-6 pb-4 {collapsed ? 'justify-center' : ''}">
    <div class="relative w-10 h-10 shrink-0">
      <div class="absolute inset-0 bg-primary/20 rounded-xl blur-md animate-pulse"></div>
      <img alt="Logo" src={LOGO_URL} class="relative w-full h-full object-cover rounded-xl"/>
    </div>
    {#if !collapsed}
      <div class="flex flex-col min-w-0">
        <span class="text-[15px] font-black tracking-tight text-on-surface leading-none">Kotbo</span>
        <span class="text-[10px] text-on-surface-variant/50 mt-0.5">Dashboard</span>
      </div>
    {/if}
  </div>

  <!-- ─── Recherche ─── -->
  {#if !collapsed}
    <div class="px-3 pb-3 flex items-center gap-1.5">
      <div class="relative flex-1 flex items-center">
        <input
          type="text"
          placeholder="Rechercher..."
          bind:value={searchQuery}
          class="w-full pl-9 pr-7 py-2 text-xs rounded-xl bg-surface-container/40 border border-outline-variant/20 text-on-surface placeholder:text-on-surface-variant/35 focus:outline-none focus:border-primary/40 focus:bg-surface-container/60 transition-all duration-200"
        />
        <div class="absolute left-3 text-on-surface-variant/35">
          <Papicon icon="search" size={13} />
        </div>
        {#if searchQuery}
          <button
            type="button"
            onclick={() => searchQuery = ''}
            class="absolute right-2.5 text-on-surface-variant/40 hover:text-on-surface transition-colors"
          >
            <Papicon icon="x" size={11} />
          </button>
        {/if}
      </div>

      <!-- Bouton favoris -->
      <button
        type="button"
        onclick={() => showOnlyFavorites = !showOnlyFavorites}
        class="flex items-center justify-center w-8 h-8 rounded-xl border transition-all duration-200 shrink-0
          {showOnlyFavorites 
            ? 'bg-amber-500/10 border-amber-500/35 text-amber-500 hover:bg-amber-500/20' 
            : 'bg-surface-container/40 border-outline-variant/20 text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container/60'}"
        title={showOnlyFavorites ? "Afficher tout le menu" : "Afficher les favoris"}
        aria-label="Filtrer par favoris"
      >
        <Papicon icon="star" size={14} class={showOnlyFavorites ? "fill-amber-500 text-amber-500" : ""} />
      </button>
    </div>
  {/if}

  <!-- ─── Navigation (scrollable) ─── -->
  <nav class="flex-1 overflow-y-auto scrollbar-hide pb-2 {collapsed ? 'px-2' : 'px-3'}">
    {#each filteredGroups as group, gi}
      {#if gi > 0}
        <div class="my-1 border-t border-outline-variant/20"></div>
      {/if}

      {#if collapsed}
        <!-- Mode icônes : petit séparateur entre groupes -->
        {#if gi > 0}<div class="h-2"></div>{/if}
        {#each group.items as item}
          <a
            href={item.href}
            onmouseenter={(e) => handleMouseEnter(e, navItemStatusLabel(item))}
            onmouseleave={handleMouseLeave}
            class="relative flex items-center justify-center w-full py-2.5 rounded-xl transition-all duration-200 group
              {isActiveNavItem(item.href)
                ? 'text-primary bg-primary/8'
                : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container/60'}"
          >
            {#if isActiveNavItem(item.href)}
              <div class="absolute left-0 top-2 bottom-2 w-1 bg-primary rounded-full"></div>
            {/if}
            <div class="relative">
              <Papicon
                icon={item.icon}
                size={19}
                class="transition-transform duration-200 {isActiveNavItem(item.href) ? '' : 'group-hover:scale-110'}"
              />
              {#if isPageWip(item)}
                <span class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-surface-container-low" title="WIP"></span>
              {:else if isPageBeta(item)}
                <span class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-purple-500 ring-2 ring-surface-container-low" title="Bêta"></span>
              {/if}
            </div>
            {#if item.name === 'Inbox' && notificationsStore.unreadCount > 0}
              <div class="absolute top-1 right-1 min-w-[14px] h-[14px] px-0.5 bg-primary text-white text-[8px] font-black rounded-full flex items-center justify-center">
                {notificationsStore.unreadCount > 9 ? '9+' : notificationsStore.unreadCount}
              </div>
            {/if}
          </a>
        {/each}

      {:else}
        <!-- En-tête du groupe cliquable -->
        <button
          type="button"
          onclick={() => toggleGroup(group.key)}
          class="w-full flex items-center gap-2 px-2 py-1.5 mb-0.5 rounded-lg transition-colors hover:bg-surface-container/40 group/label"
        >
          <span class="flex-1 text-left text-[10px] font-bold text-on-surface-variant/55 uppercase tracking-[0.18em]">
            {group.label}
          </span>
          <div class="text-on-surface-variant/30 group-hover/label:text-on-surface-variant/60 transition-all duration-200 {isGroupCollapsed(group.key) ? '-rotate-90' : ''}">
            <Papicon icon="chevron-down" size={11} />
          </div>
        </button>

        <!-- Items du groupe -->
        {#if !isGroupCollapsed(group.key)}
          <div class="space-y-0.5 mb-1">
            {#each group.items as item}
              <div
                class="relative flex items-center rounded-xl transition-all duration-200 group
                  {isActiveNavItem(item.href)
                    ? 'text-primary bg-primary/7 font-semibold'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container/50'}"
              >
                {#if isActiveNavItem(item.href)}
                  <div class="absolute left-0 top-2 bottom-2 w-[3px] bg-primary rounded-full"></div>
                {/if}
                
                <a
                  href={item.href}
                  class="flex-1 flex items-center gap-3 pl-3 py-2.5 min-w-0 overflow-hidden"
                >
                  <Papicon
                    icon={item.icon}
                    size={17}
                    class="shrink-0 transition-all duration-200
                      {isActiveNavItem(item.href)
                        ? 'text-primary'
                        : 'text-on-surface-variant/50 group-hover:text-on-surface/80'}"
                  />
                  <span class="flex-1 min-w-0 text-[13px] leading-none truncate">{item.name}</span>
                </a>

                <!-- Badges statut + favori -->
                <div class="flex items-center gap-1.5 pr-3 shrink-0">
                  {#if isPageWip(item)}
                    <span class="px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold tracking-wider uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20">WIP</span>
                  {:else if isPageBeta(item)}
                    <span class="px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold tracking-wider uppercase bg-purple-500/10 text-purple-500 border border-purple-500/20">BETA</span>
                  {/if}
                  {#if item.name === 'Inbox' && notificationsStore.unreadCount > 0}
                    <div class="min-w-[18px] h-[18px] px-1 bg-primary text-white text-[9px] font-black rounded-full flex items-center justify-center">
                      {notificationsStore.unreadCount > 99 ? '99+' : notificationsStore.unreadCount}
                    </div>
                  {/if}
                  
                  <button
                    type="button"
                    onclick={(e) => toggleFavorite(item.href, e)}
                    class="flex items-center justify-center w-6 h-6 rounded-lg transition-all duration-200 text-on-surface-variant/30 hover:text-amber-500 hover:bg-amber-500/10
                      {favorites.includes(item.href) ? 'text-amber-500 opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}"
                    title={favorites.includes(item.href) ? "Retirer des favoris" : "Ajouter aux favoris"}
                  >
                    <Papicon icon="star" size={13} class={favorites.includes(item.href) ? "fill-amber-500 text-amber-500" : ""} />
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    {:else}
      {#if !collapsed}
        <div class="flex flex-col items-center py-8 text-center text-on-surface-variant/40">
          {#if showOnlyFavorites}
            <Papicon icon="star" size={20} class="mb-2 text-amber-500/60" />
            <p class="text-xs px-4">Aucun favori enregistré. Cliquez sur l'étoile d'un menu pour l'ajouter.</p>
          {:else}
            <Papicon icon="search" size={20} class="mb-2" />
            <p class="text-xs">Aucun résultat</p>
          {/if}
        </div>
      {/if}
    {/each}
  </nav>

  <!-- ─── Section basse : Admin + Profil ─── -->
  <div class="border-t border-outline-variant/20 {collapsed ? 'px-2 py-3' : 'px-3 py-3'} space-y-1">
    <!-- Admin (bot admin seulement) -->
    {#if authStore.isBotAdmin}
      <a
        href="/admin"
        onmouseenter={(e) => handleMouseEnter(e, 'Administration')}
        onmouseleave={handleMouseLeave}
        class="relative flex items-center {collapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2'} rounded-xl transition-all duration-200 group
          {isActiveNavItem('/admin')
            ? 'text-amber-400 bg-amber-400/8'
            : 'text-on-surface-variant/50 hover:text-amber-400 hover:bg-amber-400/8'}"
      >
        <Papicon icon="lock" size={collapsed ? 19 : 17} class="shrink-0" />
        {#if !collapsed}
          <span class="text-[13px]">Administration</span>
        {/if}
      </a>
    {/if}

    <!-- Profil utilisateur -->
    <a
      href={profileHref}
      onmouseenter={(e) => handleMouseEnter(e, authStore.user?.username ?? 'Mon Profil')}
      onmouseleave={handleMouseLeave}
      class="flex items-center {collapsed ? 'justify-center py-2' : 'gap-3 px-2 py-2'} rounded-xl transition-all duration-200 hover:bg-surface-container/60 group"
    >
      <div class="relative shrink-0 w-8 h-8">
        <img
          src={userAvatar}
          alt="Avatar"
          referrerpolicy="no-referrer"
          class="w-full h-full rounded-lg object-cover ring-1 ring-outline-variant/30 transition-transform duration-200 group-hover:scale-105"
        />
        <!-- Indicateur actif -->
        {#if isActiveNavItem(profileHref)}
          <div class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-primary rounded-full border-2 border-surface-container-low"></div>
        {/if}
      </div>
      {#if !collapsed}
        <div class="flex flex-col min-w-0">
          <span class="text-[12px] font-semibold text-on-surface truncate leading-none">
            {authStore.user?.username ?? '...'}
          </span>
          <span class="text-[10px] text-on-surface-variant/50 mt-0.5">Mon profil</span>
        </div>
      {/if}
    </a>
  </div>
</aside>

{#if activeTooltip && collapsed}
  <div
    use:portal
    class="fixed z-100 -translate-y-1/2 pointer-events-none bg-surface-container-high text-on-surface border border-outline-variant/40 rounded-lg px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap shadow-lg tooltip-arrow animate-in fade-in"
    style="left: calc(4.5rem + 8px); top: {activeTooltip.top}px"
  >
    {activeTooltip.text}
  </div>
{/if}

<style>
  .sidebar--expanded { width: 16rem; }
  .sidebar--collapsed { width: 4.5rem; }

  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

  /* Arrow style for the portal-based tooltip */
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
