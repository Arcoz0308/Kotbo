<script lang="ts">
  import { authStore } from '../stores/auth.svelte';
  import Papicon from './Papicon.svelte';
  import ModuleSettingsModal from './management/ModuleSettingsModal.svelte';

  let { 
    title = '', 
    description = '', 
    icon = 'Grid', 
    featureKey = '', 
    children,
    actions
  } = $props();

  let settingsModalOpen = $state(false);

  const canManageSettings = $derived(
    authStore.guilds.find(g => g.id === authStore.selectedGuildId)?.accessLevel === 'admin'
  );
</script>

<div class="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <!-- Header -->
  <header class="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-surface-container-low/40 backdrop-blur-3xl p-8 rounded-4xl border border-outline-variant/30 relative overflow-hidden group">
    <div class="absolute -top-24 -right-24 w-64 h-64 bg-primary/10 rounded-full blur-[80px] group-hover:bg-primary/20 transition-all duration-700"></div>
    
    <div class="flex items-center gap-6 relative">
      <div class="w-16 h-16 bg-linear-to-br from-primary to-primary-container rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
        <Papicon {icon} size={32} class="text-white" />
      </div>
      <div>
        <h1 class="text-3xl font-black tracking-tight text-on-surface font-headline leading-tight">{title}</h1>
        <p class="text-on-surface-variant/80 font-medium tracking-wide">{description}</p>
      </div>
    </div>

    <div class="flex items-center gap-3 relative">
      {#if canManageSettings && featureKey}
        <button 
          onclick={() => settingsModalOpen = true}
          class="w-12 h-12 rounded-2xl bg-surface-container-high/50 border border-outline-variant/20 flex items-center justify-center text-on-surface-variant hover:bg-primary hover:text-on-primary transition-all duration-300 shadow-sm hover:shadow-primary/20"
          title="Paramètres du module"
        >
          <Papicon icon="Gear" size={20} />
        </button>
      {/if}
      {#if actions}
        {@render actions()}
      {/if}
    </div>
  </header>

  <main class="flex-1">
    {@render children()}
  </main>

  {#if featureKey}
    <ModuleSettingsModal 
      show={settingsModalOpen} 
      onClose={() => settingsModalOpen = false} 
      {featureKey} 
    />
  {/if}
</div>
