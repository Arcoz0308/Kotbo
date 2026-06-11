<script lang="ts">
  import Papicon from './Papicon.svelte';
  import { dashboardStore } from '../stores/dashboard.svelte';
  import ToggleSwitch from './ToggleSwitch.svelte';
  import { updateModuleStatus } from '../api';
  import { createAsyncActionState } from '../asyncAction.svelte';
  import InlineFeedback from './InlineFeedback.svelte';

  let { 
    title = '', 
    description = '', 
    icon = 'Grid', 
    featureKey = '', 
    children,
    actions = undefined
  } = $props();

  const saveAction = createAsyncActionState();

  const module = $derived((dashboardStore.state.modules as any[]).find((m) => m.id === featureKey));
  const isModuleEnabled = $derived(module?.status === 'active');
  const isFixed = $derived(module?.id === 'activity' || module?.id === 'dashboard');

  async function toggleModule() {
    if (!module || isFixed) return;
    const newStatus = isModuleEnabled ? 'inactive' : 'active';
    
    await saveAction.run(async () => {
      const ok = await updateModuleStatus(featureKey, newStatus);
      if (!ok) throw new Error('Erreur API');
      await dashboardStore.refresh();
      return true;
    }, { successMessage: `Module ${newStatus === 'active' ? 'activé' : 'désactivé'}.` });
  }
</script>

<div class="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <InlineFeedback state={saveAction} />
  
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

    <div class="flex items-center gap-4 relative">
      {#if actions}
        {@render actions()}
      {/if}

      {#if module && !isFixed}
        <div class="h-10 w-px bg-outline-variant/20 mx-2 hidden md:block"></div>
        <div class="flex items-center gap-3 px-4 py-2 bg-surface-container-low/40 rounded-2xl border border-outline-variant/10">
          <span class="text-[10px] font-black uppercase tracking-widest {isModuleEnabled ? 'text-primary' : 'text-on-surface-variant/40'}">
            {isModuleEnabled ? 'Activé' : 'Désactivé'}
          </span>
          <ToggleSwitch 
            checked={isModuleEnabled} 
            onToggle={toggleModule}
            disabled={saveAction.state.loading}
          />
        </div>
      {/if}
    </div>
  </header>

  <main class="flex-1 {isModuleEnabled || isFixed ? '' : 'opacity-40 pointer-events-none grayscale-[0.5] transition-all duration-500'}">
    {@render children()}
  </main>
</div>
