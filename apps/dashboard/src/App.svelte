<script lang="ts">
  import { onMount } from 'svelte';
  import { Route, router } from 'tinro';
  import MainLayout from './lib/components/MainLayout.svelte';
  import { authStore } from './lib/stores/auth.svelte';
  
  
  import Login from './pages/Login.svelte';
  import Overview from './pages/Overview.svelte';
  import Analytics from './pages/Analytics.svelte';
  import ModuleCatalog from './pages/ModuleCatalog.svelte';
  import ContentDiffusion from './pages/ContentDiffusion.svelte';
  import ActivityLog from './pages/ActivityLog.svelte';
  import NotificationsSettings from './pages/NotificationsSettings.svelte';
  import ModuleSettings from './pages/ModuleSettings.svelte';

  onMount(() => {
    
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (token) {
      authStore.setToken(token);
      
      window.history.replaceState({}, document.title, window.location.pathname);
      router.goto('/');
    }

    
    if (!authStore.isAuthenticated && $router.path !== '/login') {
      router.goto('/login');
    }
  });

  
  $effect(() => {
    if (!authStore.isAuthenticated && $router.path !== '/login') {
      router.goto('/login');
    }
  });
</script>


<Route path="/login">
  <Login />
</Route>

<Route path="/*">
  {#if authStore.isAuthenticated}
    <MainLayout>
      <Route path="/">
        <Overview />
      </Route>
      <Route path="/modules">
        <ModuleCatalog />
      </Route>
      <Route path="/module-settings/:moduleId" let:meta>
        <ModuleSettings moduleId={meta.params.moduleId} />
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
      <Route path="/notifications">
        <NotificationsSettings />
      </Route>
      <Route path="/settings">
        <NotificationsSettings />
      </Route>
      <Route path="/activity">
        <ActivityLog />
      </Route>
      <Route path="/automations">
        <ModuleCatalog />
      </Route>
    </MainLayout>
  {/if}
</Route>

