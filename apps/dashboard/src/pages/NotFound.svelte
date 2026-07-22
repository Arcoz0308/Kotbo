<script lang="ts">
  import { router } from 'tinro';
  import Papicon from '../lib/components/Papicon.svelte';
  import { m } from '../lib/i18n';
</script>

<div class="min-h-screen flex flex-col items-center justify-center p-6 text-center">
  <div class="mb-8 p-6 rounded-full bg-surface-variant/20">
    <Papicon name="warning" size={64} class="text-primary" />
  </div>
  
  <h1 class="text-lg font-bold mb-4">{m.nf_title()}</h1>
  <p class="text-on-surface-variant mb-8 max-w-md">
    {m.nf_desc()}
  </p>

  <button 
    onclick={() => router.goto('/')}
    class="flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-xl font-semibold hover:opacity-90 transition-opacity"
  >
    <Papicon name="home" size={20} />
    {m.nf_back_home()}
  </button>
</div>
