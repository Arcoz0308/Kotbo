<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../stores/auth.svelte';
  import { dashboardStore } from '../stores/dashboard.svelte';
  import { themeStore } from '../stores/theme.svelte';
  import { feedbackModal } from '../stores/feedbackModal.svelte';
  import { onboardingStore } from '../stores/tutorial.svelte';
  import { API_BASE_URL } from '../api';
  import NotificationBell from './NotificationBell.svelte';
  import Papicon from './Papicon.svelte';
  import { sidebarStore } from '../stores/sidebar.svelte';
  import { resolveGuildIconSrc, resolveUserAvatarSrc } from '../discordMedia';
  import { serverSwitcherStore } from '../stores/serverSwitcher.svelte';
  import { isMobile } from '../stores/media.svelte';

  const collapsed = $derived(sidebarStore.collapsed);

  let config = $state({ discordClientId: '' });
  let userMenuOpen = $state(false);
  let searchQuery = $state('');

  onMount(() => {
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

  const getUserAvatar = () =>
    resolveUserAvatarSrc(authStore.user?.id, authStore.user?.avatar);

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
    selectedGuild
      ? resolveGuildIconSrc(selectedGuild.id, selectedGuild.icon)
      : null
  );

  function toggleUserMenu(e: MouseEvent) {
    e.stopPropagation();
    userMenuOpen = !userMenuOpen;
  }

  function startTutorial() {
    if (authStore.selectedGuildId) {
      onboardingStore.initialize(authStore.selectedGuildId);
    }
    onboardingStore.restart();
    userMenuOpen = false;
  }
</script>

<svelte:window />

<header class="flex items-center justify-between px-6 bg-surface-container-lowest border-b border-outline-variant h-14 fixed top-0 right-0 z-40 transition-all duration-200 {$isMobile ? 'w-full' : collapsed ? 'w-[calc(100%-4.5rem)]' : 'w-[calc(100%-15rem)]'}">
  <div class="flex items-center gap-4 server-selector-container relative">
    {#if $isMobile}
      <button
        onclick={sidebarStore.toggleMobile}
        class="flex items-center justify-center w-8 h-8 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
      >
        <Papicon icon="menu" size={18} />
      </button>
    {/if}
    <button
      onclick={serverSwitcherStore.show}
      disabled={authStore.guilds.length <= 1}
      class="flex items-center gap-2.5 bg-surface-container hover:bg-surface-container-high px-3 py-1.5 rounded-lg text-sm text-on-surface border border-outline-variant hover:border-outline transition-colors cursor-pointer disabled:cursor-default disabled:hover:bg-surface-container disabled:border-outline-variant group select-none"
    >
      {#if guildIconUrl}
        <img
          src={guildIconUrl}
          alt="Server Logo"
          referrerpolicy="no-referrer"
          class="w-5 h-5 rounded object-cover"
        >
      {:else}
        <div class="w-5 h-5 rounded bg-primary/10 flex items-center justify-center text-[10px] font-medium text-primary">
          {selectedGuild?.name?.charAt(0) || '?'}
        </div>
      {/if}
      <span class="text-on-surface-variant font-medium text-sm transition-colors group-hover:text-on-surface">
        {#if selectedGuild?.name}
          {selectedGuild.name}
        {:else}
          <div class="h-4 w-20 bg-surface-container-high rounded animate-pulse inline-block align-middle"></div>
        {/if}
      </span>
      {#if authStore.guilds.length > 1}
        <Papicon icon="chevron-down" size={12} class="text-on-surface-variant/40" />
      {/if}
    </button>
  </div>

  <div class="flex items-center gap-3">

    {#if authStore.member?.roles}
      <div class="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-container border border-outline-variant">
        <Papicon icon={selectedGuild?.accessLevel === 'moderator' ? 'user' : selectedGuild?.accessLevel === 'admin' ? 'crown' : 'none'} size={14} class="text-on-surface-variant" />
        <span class="text-[11px] font-medium text-on-surface-variant">{highestRole}</span>
      </div>
    {/if}

    <button
      onclick={themeStore.toggle}
      class="w-8 h-8 rounded-md border border-outline-variant bg-surface-container-lowest flex items-center justify-center transition-colors hover:bg-surface-container"
      aria-label="Changer de thème"
      id="theme-toggle"
    >
      {#if themeStore.dark}
        <Papicon icon="sun" size={16} class="text-amber-500" />
      {:else}
        <Papicon icon="moon" size={16} class="text-on-surface-variant" />
      {/if}
    </button>

    <NotificationBell />

    <div class="flex items-center gap-2 group user-menu-container relative">
      <button
        onclick={toggleUserMenu}
        class="flex items-center gap-2 hover:bg-surface-container p-1 rounded-lg transition-colors group/avatar"
      >
        <div class="w-8 h-8 shrink-0 rounded-md overflow-hidden ring-1 ring-outline-variant">
          {#if !authStore.user}
            <div class="w-full h-full bg-surface-container-high animate-pulse"></div>
          {:else}
            <img class="w-full h-full object-cover" src={getUserAvatar()} alt="Avatar"/>
          {/if}
        </div>
        <div class="hidden sm:flex flex-col items-start">
          <span class="text-xs font-medium text-on-surface leading-none">
            {#if authStore.user?.username}
              {authStore.user?.username}
            {:else}
              <div class="h-3 w-16 bg-surface-container-high rounded animate-pulse"></div>
            {/if}
          </span>
        </div>
        <Papicon icon="chevron-down" size={12} class="text-on-surface-variant/40 transition-transform duration-150 {userMenuOpen ? 'rotate-180' : ''}" />
      </button>

      {#if userMenuOpen}
        <div class="absolute right-0 top-12 w-52 rounded-lg border border-outline-variant bg-surface-container-lowest shadow-lg overflow-hidden animate-in fade-in slide-up duration-150 z-50">
          <div class="px-3 py-2.5 border-b border-outline-variant">
            <p class="text-xs font-medium text-on-surface truncate">{authStore.user?.username}</p>
            <p class="text-[10px] text-on-surface-variant mt-0.5">ID: {authStore.user?.id?.slice(0, 10)}...</p>
          </div>
          <div class="py-1">
            <button
              type="button"
              class="flex items-center gap-2.5 px-3 py-2 w-full text-left text-sm text-primary transition-colors hover:bg-surface-container cursor-pointer"
              onclick={startTutorial}
            >
              <Papicon icon="school" size={16} />
              Tutoriel
            </button>
            <a
              href={authStore.user?.id ? `/profile/${authStore.user.id}` : '/profile'}
              class="flex items-center gap-2.5 px-3 py-2 text-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
              onclick={() => userMenuOpen = false}
            >
              <Papicon icon="user" size={16} />
              Mon Profil
            </a>
            <a
              href="/activity"
              class="flex items-center gap-2.5 px-3 py-2 text-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
              onclick={() => userMenuOpen = false}
            >
              <Papicon icon="history" size={16} />
              Mon Activité
            </a>
            <a
              href="/userSettings"
              class="flex items-center gap-2.5 px-3 py-2 text-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
              onclick={() => userMenuOpen = false}
            >
              <Papicon icon="settings" size={16} />
              Paramètres
            </a>
          </div>
          <div class="border-t border-outline-variant py-1">
            <button
              type="button"
              class="flex items-center gap-2.5 px-3 py-2 w-full text-left text-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface cursor-pointer"
              onclick={() => {
                    userMenuOpen = false;
                    feedbackModal.show();
                  }
                }
            >
              <Papicon icon="bug_report" size={16} />
              Retour / Suggestion
            </button>
            <button
              type="button"
              onclick={logout}
              class="flex items-center gap-2.5 px-3 py-2 w-full text-left text-sm font-medium text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-500/8"
            >
              <Papicon icon="log-out" size={16} />
              Déconnexion
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</header>
<div class="h-14"></div>
