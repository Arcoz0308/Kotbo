<script lang="ts">
  import { onMount } from 'svelte';
  import { Route as RouteLegacy, router } from 'tinro';
  const Route = RouteLegacy as any;
  import MainLayout from './lib/components/MainLayout.svelte';
  import { authStore } from './lib/stores/auth.svelte';
  import { dashboardStore } from './lib/stores/dashboard.svelte';
  import { themeStore } from './lib/stores/theme.svelte';
  import { toast } from './lib/stores/toast.svelte';
  import ToastContainer from './lib/components/ToastContainer.svelte';
  import NotFound from './pages/NotFound.svelte';
  
  
  import Login from './pages/Login.svelte';
  import Overview from './pages/Overview.svelte';
  import Analytics from './pages/Analytics.svelte';
  import ModuleCatalog from './pages/ModuleCatalog.svelte';

  import ActivityLog from './pages/ActivityLog.svelte';
  import Logs from './pages/Logs.svelte';
  import NotificationsSettings from './pages/NotificationsSettings.svelte';
  import CommandAccess from './pages/CommandAccess.svelte';
  import Sanctions from './pages/Sanctions.svelte';
  import Regulation from './pages/Regulation.svelte';
  import AdminOverview from './pages/AdminOverview.svelte';
  import Profile from './pages/Profile.svelte';
  import PublicProfile from './pages/PublicProfile.svelte';
  import StaffManagement from './pages/StaffManagement.svelte';
  import Members from './pages/Members.svelte';
  import Recruitment from './pages/Recruitment.svelte';
  import Meetings from './pages/Meetings.svelte';
  import Absences from './pages/Absences.svelte';
  import Inbox from './pages/Inbox.svelte';
  import Tutoring from './pages/Tutoring.svelte';
  import DoubleAccounts from './pages/DoubleAccounts.svelte';
  import GeneralSettings from './pages/GeneralSettings.svelte';
  import DailyAlgo from './pages/DailyAlgo.svelte';
  import DailyAlgoIDE from './pages/DailyAlgoIDE.svelte';
  import Events from './pages/Events.svelte';
  import EventEditor from './pages/EventEditor.svelte';
  import EventControl from './pages/EventControl.svelte';

  const isPublicPage = $derived($router.path.startsWith('/profile/'));

  const featureAccess = $derived(dashboardStore.state.featureAccess || {});
  const fallbackCanView = $derived(
    authStore.guilds.find((guild) => guild.id === authStore.selectedGuildId)?.accessLevel !== 'none'
  );

  function canViewFeature(featureKey: string) {
    if (!featureKey) return true;
    const feature = featureAccess?.[featureKey];
    if (feature?.canView !== undefined) return feature.canView;
    return fallbackCanView;
  }

  function resolveRouteFeatureKey(path: string): string | null {
    if (path === '/' || path.startsWith('/profile')) return 'dashboard';
    if (path.startsWith('/analytics')) return 'analytics';
    if (path.startsWith('/inbox')) return 'inbox';
    if (path.startsWith('/dailyalgo')) return 'daily_algo';
    if (path.startsWith('/events')) return 'events';
    if (path.startsWith('/members')) return 'members';
    if (path.startsWith('/sanctions')) return 'sanctions';
    if (path.startsWith('/double-accounts')) return 'double_accounts';
    if (path.startsWith('/logs')) return 'logs';
    if (path.startsWith('/activity')) return 'activity';
    if (path.startsWith('/recruitment')) return 'recruitment';
    if (path.startsWith('/tutoring')) return 'tutoring';
    if (path.startsWith('/meetings')) return 'meetings';
    if (path.startsWith('/absences')) return 'absences';
    if (path.startsWith('/staff-management')) {
      const tab = new URLSearchParams(window.location.search).get('tab');
      if (tab === 'roles') return 'staff_roles';
      if (tab === 'polls') return 'polls';
      if (tab === 'warnings') return 'discipline';
      if (tab === 'leadership') return 'staff_directory';
      return 'staff_directory';
    }
    if (path.startsWith('/modules')) return 'modules';
    if (path.startsWith('/command-access')) return 'commands';
    if (path.startsWith('/settings')) return 'settings';
    if (path.startsWith('/regulation')) return 'regulation';
    if (path.startsWith('/admin')) return 'centralized_config';
    return null;
  }

  function navigate(node: HTMLElement, path: string) {
    router.goto(path);
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

    // Global error handling
    const handleError = (event: ErrorEvent | PromiseRejectionEvent) => {
      const message = 'message' in event ? event.message : (event as PromiseRejectionEvent).reason?.message || 'Une erreur est survenue';
      console.error('Global error:', event);
      toast.error(message);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleError);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleError);
    };
  });

  
  $effect(() => {
    if (!authStore.isAuthenticated && $router.path !== '/login' && !isPublicPage) {
      router.goto('/login');
      return;
    }

    if (authStore.isAuthenticated && !isPublicPage) {
      const featureKey = resolveRouteFeatureKey($router.path);
      if (featureKey && !canViewFeature(featureKey)) {
        router.goto('/');
      }
    }
  });
</script>

{#snippet handleLegacyRedirect(moduleId: string)}
  {@const mapping: Record<string, string> = {
    'regulation': '/regulation',
    'sanctions': '/sanctions',
    'logs': '/logs',
    'recruitment': '/recruitment',
    'meetings': '/meetings',
    'dailyalgo': $router.query.submissionId ? `/dailyalgo/ide?submissionId=${$router.query.submissionId}` : '/dailyalgo'
  }}
  {@const target = mapping[moduleId] || '/modules'}
  <div use:navigate={target}></div>
{/snippet}

{#if isPublicPage}
  <Route path="/profile/:userId" let:meta>
    <PublicProfile userId={meta.params.userId} />
  </Route>
  <Route fallback>
    <NotFound />
  </Route>
{:else}
  <Route path="/login">
    <Login />
  </Route>

  {#if authStore.isAuthenticated}
    {#if $router.path === '/dailyalgo/ide'}
      <Route path="/dailyalgo/ide">
        <DailyAlgoIDE />
      </Route>
    {:else}
      <MainLayout>
      <Route path="/">
        <Overview />
      </Route>

      <Route path="/analytics">
        <Analytics />
      </Route>
      <Route path="/activity">
        <ActivityLog />
      </Route>
      {#if authStore.isBotAdmin}
        <Route path="/admin">
          <AdminOverview />
        </Route>
      {/if}
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
      {#if canManageSettings}
        <Route path="/modules">
          <ModuleCatalog />
        </Route>
        <Route path="/module-settings/:moduleId" let:meta>
          <!-- Simple redirect logic for legacy URLs -->
          {@render handleLegacyRedirect(meta.params.moduleId)}
        </Route>
        <Route path="/notifications">
          <NotificationsSettings />
        </Route>
        <Route path="/command-access">
          <CommandAccess />
        </Route>
        <Route path="/settings">
          <GeneralSettings />
        </Route>
        <Route path="/automations">
          <ModuleCatalog />
        </Route>
        <Route path="/staff-management">
          <StaffManagement />
        </Route>
      {/if}

      <Route path="/dailyalgo">
        <DailyAlgo />
      </Route>
      <Route path="/members/*">
        <Members />
      </Route>
      <Route path="/recruitment">
        <Recruitment />
      </Route>
      <Route path="/meetings">
        <Meetings />
      </Route>
      <Route path="/absences">
        <Absences />
      </Route>
      <Route path="/inbox">
        <Inbox />
      </Route>
      <Route path="/tutoring">
        <Tutoring />
      </Route>
      <Route path="/double-accounts">
        <DoubleAccounts />
      </Route>

      <Route path="/events">
        <Events />
      </Route>
      <Route path="/events/edit/:eventId" let:meta>
        <EventEditor eventId={meta.params.eventId} />
      </Route>
      <Route path="/events/control/:eventId" let:meta>
        <EventControl eventId={meta.params.eventId} />
      </Route>
      
      <!-- Fallback for authenticated users -->
      <Route fallback>
        <NotFound />
      </Route>
    </MainLayout>
    {/if}
  {:else if $router.path !== '/login'}
    <!-- Fallback for unauthenticated users -->
    <Route path="/*">
      <div class="flex items-center justify-center min-h-screen">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    </Route>
  {/if}
{/if}

<ToastContainer />
