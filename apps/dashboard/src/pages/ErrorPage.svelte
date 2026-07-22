<script lang="ts">
  import Papicon from '../lib/components/Papicon.svelte';
  import { m } from '../lib/i18n';

  let { 
    error = m.err_unexpected(),
    code = '500'
  } = $props();
</script>

<div class="min-h-screen flex flex-col items-center justify-center p-6 text-center">
  <div class="mb-8 p-6 rounded-full bg-red-500/10">
    <Papicon name="error" size={64} class="text-red-500" />
  </div>
  
  <h1 class="text-lg font-bold mb-2">{m.err_title({ code })}</h1>
  <h2 class="text-xl font-medium mb-4">{m.err_oops()}</h2>
  <p class="text-on-surface-variant mb-8 max-w-md">
    {error}
  </p>

  <button 
    onclick={() => window.location.reload()}
    class="flex items-center gap-2 px-6 py-3 bg-surface-variant text-on-surface rounded-xl font-semibold hover:bg-surface-variant/80 transition-colors"
  >
    <Papicon name="refresh" size={20} />
    {m.err_refresh_page()}
  </button>
</div>
