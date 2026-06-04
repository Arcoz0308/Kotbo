<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import { router } from 'tinro';
  import Sidebar from './Sidebar.svelte';
  import Navbar from './Navbar.svelte';
  import Breadcrumbs from './Breadcrumbs.svelte';
  import ServerSwitcherModal from './ServerSwitcherModal.svelte';
  import { dashboardLifecycle } from '../dashboardLifecycle';
  import { sidebarStore } from '../stores/sidebar.svelte';
  import { feedbackModal } from '../stores/feedbackModal.svelte';
  import { getPageStatus } from '../config/pages';
  import { historyStore } from '../stores/history.svelte';
  import { serverSwitcherStore } from '../stores/serverSwitcher.svelte';
  import { searchStore } from '../stores/search.svelte';

  let { children }: { children?: Snippet } = $props();

  onMount(() => {
    dashboardLifecycle.init();
    return () => dashboardLifecycle.destroy();
  });

  const collapsed = $derived(sidebarStore.collapsed);
  
  // Reactively calculate the status of the current page
  const pageStatus = $derived(getPageStatus($router.path, $router.url));

  // Local state to keep track of dismissed beta banners in the current session
  let dismissedBanners = $state<Record<string, boolean>>({});

  function dismissBanner(pageName: string) {
    dismissedBanners = { ...dismissedBanners, [pageName]: true };
  }

  function handleGlobalKeyDown(e: KeyboardEvent) {
    const activeEl = document.activeElement;
    const isEditing = activeEl && (
      activeEl.tagName === 'INPUT' || 
      activeEl.tagName === 'TEXTAREA' || 
      activeEl.getAttribute('contenteditable') === 'true'
    );

    function close() {
      searchStore.close();
      serverSwitcherStore.close();
      feedbackModal.close();
    }

    // Ctrl+G: Sélecteur de serveur
    const isG = e.key === 'g' || e.key === 'G';
    if ((e.ctrlKey || e.metaKey) && isG) {
      e.preventDefault();
      close();
      serverSwitcherStore.toggle();
      return;
    } 

    if (isEditing) return;

    const isZ = e.key === 'z' || e.key === 'Z';
    const isY = e.key === 'y' || e.key === 'Y';

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && isZ) {
      e.preventDefault();
      historyStore.undo();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && isZ) {
      e.preventDefault();
      historyStore.redo();
    } else if ((e.ctrlKey || e.metaKey) && isY) {
      e.preventDefault();
      historyStore.redo();
    }
  }
</script>

<svelte:window onkeydown={handleGlobalKeyDown} />

<div class="flex min-h-screen bg-background text-on-background transition-colors duration-500 relative">
  
  <div class="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.07] overflow-hidden">
    <div class="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-primary rounded-full blur-[150px] animate-mesh"></div>
    <div class="absolute top-[40%] right-[-10%] w-[50%] h-[50%] bg-secondary rounded-full blur-[120px] animate-mesh" style="animation-delay: -7s"></div>
  </div>

  
  <div class="absolute inset-0 pointer-events-none opacity-[0.015] dark:opacity-[0.03]"></div>

  <Sidebar />
  
  <div class="flex-1 flex flex-col transition-all duration-300 {collapsed ? 'ml-18' : 'ml-64'}">
    <Navbar />
    
    <main class="p-12 pb-24 max-w-[1600px] w-full mx-auto relative">
      <Breadcrumbs />
      {#if pageStatus?.wip}
        <!-- Render WIP Overlay over blurred content -->
        <div class="relative w-full min-h-[500px]">
          <div class="filter blur-md pointer-events-none select-none opacity-20 transition-all duration-500">
            {@render children?.()}
          </div>
          
          <!-- Glassmorphic WIP Overlay Card -->
          <div class="absolute inset-0 flex items-center justify-center p-6 z-10">
            <div class="max-w-md w-full bg-surface-container/60 backdrop-blur-xl border border-outline-variant/30 rounded-2xl p-8 text-center shadow-2xl relative overflow-hidden group">
              <!-- Animated subtle gradient border glow -->
              <div class="absolute inset-0 bg-linear-to-r from-amber-500/10 to-orange-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              
              <div class="relative z-10 flex flex-col items-center">
                <!-- Construction/WIP Icon -->
                <div class="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/20 text-amber-500 flex items-center justify-center mb-6 shadow-inner animate-pulse">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                
                <h2 class="text-xl font-bold text-on-surface mb-2 tracking-tight">Fonctionnalité en développement</h2>
                <p class="text-sm text-on-surface-variant/70 mb-6 leading-relaxed">
                  La page <strong>{pageStatus.name}</strong> est actuellement en cours de développement (Work In Progress) et n'est pas encore disponible.
                </p>
                
                <a href="/" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:bg-primary/95 hover:scale-[1.02] transition-all shadow-md">
                  <span>Retour à l'accueil</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      {:else}
        {#if pageStatus?.beta && !dismissedBanners[pageStatus.name]}
          <!-- Beta Banner -->
          <div class="mb-6 p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 backdrop-blur-md flex items-start gap-3 shadow-sm relative overflow-hidden group transition-all duration-300">
            <!-- Subtle background blur glow -->
            <div class="absolute -top-12 -right-12 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl"></div>
            
            <div class="shrink-0 text-purple-500 mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            
            <div class="flex-1 min-w-0">
              <h4 class="text-xs font-bold uppercase tracking-wider text-purple-400 mb-0.5">Version Bêta</h4>
              <p class="text-xs text-on-surface-variant/80 leading-relaxed">
                La fonctionnalité <strong>{pageStatus.name}</strong> est actuellement en phase bêta. Si vous rencontrez un bug ou avez des suggestions d'amélioration, n'hésitez pas à <button type="button" onclick={() => feedbackModal.show()} class="text-purple-400 font-bold hover:underline cursor-pointer">nous en faire part</button>.
              </p>
            </div>

            <button 
              type="button" 
              onclick={() => dismissBanner(pageStatus.name)}
              class="shrink-0 p-1 text-on-surface-variant/40 hover:text-on-surface-variant/80 transition-colors ml-auto rounded-lg hover:bg-surface-container/50"
              aria-label="Fermer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        {/if}
        
        {@render children?.()}
      {/if}
    </main>
  </div>
  <ServerSwitcherModal />
</div>
