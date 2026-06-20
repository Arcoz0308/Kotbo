<script lang="ts">
  import Papicon from '../lib/components/Papicon.svelte';

  let { 
    error = 'Une erreur inattendue est survenue.',
    code = '500'
  } = $props();
</script>

<div class="min-h-screen flex flex-col items-center justify-center p-6 text-center">
  <div class="mb-8 p-6 rounded-full bg-red-500/10">
    <Papicon name="error" size={64} class="text-red-500" />
  </div>
  
  <h1 class="text-lg font-bold mb-2">Erreur {code}</h1>
  <h2 class="text-xl font-medium mb-4">Oups ! Quelque chose s'est mal passé.</h2>
  <p class="text-on-surface-variant mb-8 max-w-md">
    {error}
  </p>

  <button 
    onclick={() => window.location.reload()}
    class="flex items-center gap-2 px-6 py-3 bg-surface-variant text-on-surface rounded-xl font-semibold hover:bg-surface-variant/80 transition-colors"
  >
    <Papicon name="refresh" size={20} />
    Actualiser la page
  </button>
</div>
