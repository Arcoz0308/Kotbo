<script lang="ts">
  import { onMount } from 'svelte';
  import { Route as RouteLegacy, router } from 'tinro';
  const Route = RouteLegacy as any;
  import MainLayout from './lib/components/MainLayout.svelte';
  import { authStore } from './lib/stores/auth.svelte';
  import { themeStore } from './lib/stores/theme.svelte';
  
  
  import Login from './pages/Login.svelte';
  import Overview from './pages/Overview.svelte';
  import Analytics from './pages/Analytics.svelte';
  import ModuleCatalog from './pages/ModuleCatalog.svelte';
  import ContentDiffusion from './pages/ContentDiffusion.svelte';
  import ActivityLog from './pages/ActivityLog.svelte';
  import Logs from './pages/Logs.svelte';
  import NotificationsSettings from './pages/NotificationsSettings.svelte';
  import CommandAccess from './pages/CommandAccess.svelte';
  import ModuleSettings from './pages/ModuleSettings.svelte';
  import Sanctions from './pages/Sanctions.svelte';
  import Regulation from './pages/Regulation.svelte';
  import Profile from './pages/Profile.svelte';
  import PublicProfile from './pages/PublicProfile.svelte';
  import StaffManagement from './pages/StaffManagement.svelte';
  import Procedures from './pages/Procedures.svelte';
import News from './pages/News.svelte';

  const adminOnlyPrefixes = ['/modules', '/module-settings', '/settings', '/notifications', '/automations', '/command-access', '/regulation', '/staff-management'];

  const isPublicPage = $derived($router.path.startsWith('/news') || $router.path.startsWith('/profile/'));

  function isAdminOnlyRoute(path: string) {
    return adminOnlyPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  }

  function selectedGuildAccessLevel() {
    const selectedGuild = authStore.guilds.find((guild) => guild.id === authStore.selectedGuildId);
    return selectedGuild?.accessLevel || 'admin';
  }

  const canManageSettings = $derived(selectedGuildAccessLevel() !== 'moderator');

  onMount(() => {
    
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (token) {
      authStore.setToken(token);
      
      window.history.replaceState({}, document.title, window.location.pathname);
      router.goto('/');
    }

    
    if (!authStore.isAuthenticated && $router.path !== '/login' && !isPublicPage) {
      router.goto('/login');
    }
  });

  
  $effect(() => {
    if (!authStore.isAuthenticated && $router.path !== '/login' && !isPublicPage) {
      router.goto('/login');
      return;
    }

    if (authStore.isAuthenticated && selectedGuildAccessLevel() === 'moderator' && isAdminOnlyRoute($router.path)) {
      router.goto('/content');
    }
  });
</script>


{#if isPublicPage}
  <Route path="/profile/:userId" let:meta>
    <PublicProfile userId={meta.params.userId} />
  </Route>

  <Route path="/news">
    <News />
  </Route>
{:else}
  <Route path="/login">
    <Login />
  </Route>

  <Route path="/*">
    {#if authStore.isAuthenticated}
      <MainLayout>
        <Route path="/">
          <Overview />
        </Route>
        <Route path="/content/filtered">
          <ContentDiffusion initialFilter="Filtrées" />
        </Route>
        <Route path="/content">
          <ContentDiffusion />
        </Route>
        <Route path="/analytics">
          <Analytics />
        </Route>
        <Route path="/activity">
          <ActivityLog />
        </Route>
        <Route path="/logs">
          <Logs />
        </Route>
        <Route path="/sanctions">
          <Sanctions />
        </Route>
        <Route path="/regulation">
          <Regulation />
        </Route>
        <Route path="/profile">
          <Profile />
        </Route>
        <Route path="/procedures">
          <Procedures />
        </Route>
        {#if canManageSettings}
          <Route path="/modules">
            <ModuleCatalog />
          </Route>
          <Route path="/module-settings/:moduleId" let:meta>
            <ModuleSettings moduleId={meta.params.moduleId} />
          </Route>
          <Route path="/notifications">
            <NotificationsSettings />
          </Route>
          <Route path="/command-access">
            <CommandAccess />
          </Route>
          <Route path="/settings">
            <NotificationsSettings />
          </Route>
          <Route path="/automations">
            <ModuleCatalog />
          </Route>
          <Route path="/staff-management">
            <StaffManagement />
          </Route>
        {/if}
      </MainLayout>
    {:else if $router.path !== '/login'}
       <!-- Optional: Loader or nothing while redirecting -->
    {/if}
  </Route>
{/if}

