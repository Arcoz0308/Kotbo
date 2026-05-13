<script lang="ts">
  import Papicon from '../Papicon.svelte';

  let { data = [] } = $props();

  const totalCount = $derived(data.reduce((acc: number, curr: any) => acc + curr.count, 0));
</script>

<div class="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Summary Card -->
    <div class="lg:col-span-1 bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] flex flex-col justify-center items-center text-center space-y-4">
      <div class="w-16 h-16 bg-primary/10 rounded-3xl flex items-center justify-center text-primary shadow-inner">
        <Papicon icon="Code" size={32} />
      </div>
      <div>
        <h3 class="text-4xl font-black">{totalCount.toLocaleString()}</h3>
        <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">Commandes Exécutées</p>
      </div>
      <p class="text-xs text-on-surface-variant/40 max-w-[200px]">
        Utilisation globale des commandes du bot sur la période sélectionnée.
      </p>
    </div>

    <!-- Usage List -->
    <div class="lg:col-span-2 bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-6">
      <h3 class="text-xl font-black flex items-center gap-3">
        <Papicon icon="ChartBar" size={20} class="text-primary" />
        Répartition des Commandes
      </h3>

      <div class="space-y-4 max-h-[400px] overflow-y-auto pr-2 no-scrollbar">
        {#each data as cmd}
          {@const percent = (cmd.count / totalCount) * 100}
          <div class="space-y-2">
            <div class="flex justify-between items-end">
              <div class="flex items-center gap-2">
                <span class="text-sm font-bold text-on-surface">/{cmd.name}</span>
                <span class="text-[10px] font-bold text-on-surface-variant/30">{percent.toFixed(1)}%</span>
              </div>
              <span class="text-xs font-black text-primary">{cmd.count.toLocaleString()}</span>
            </div>
            <div class="h-2 w-full bg-surface-container-high rounded-full overflow-hidden">
              <div 
                class="h-full bg-primary rounded-full transition-all duration-1000 ease-out" 
                style="width: {percent}%"
              ></div>
            </div>
          </div>
        {:else}
          <div class="flex flex-col items-center justify-center py-12 text-on-surface-variant/30 space-y-3">
            <Papicon icon="Ghost" size={48} />
            <p class="text-sm font-bold">Aucune commande enregistrée</p>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>
