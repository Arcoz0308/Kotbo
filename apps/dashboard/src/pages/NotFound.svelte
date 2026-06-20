<script lang="ts">
  import { router } from 'tinro';
  import Papicon from '../lib/components/Papicon.svelte';
</script>

<div class="min-h-screen flex flex-col items-center justify-center p-6 text-center">
  <div class="mb-8 p-6 rounded-full bg-surface-variant/20">
    <Papicon name="warning" size={64} class="text-primary" />
  </div>
  
  <h1 class="text-lg font-bold mb-4">404 - Page Introuvable</h1>
  <p class="text-on-surface-variant mb-8 max-w-md">
    Désolé, la page que vous recherchez n'existe pas ou a été déplacée.
  </p>

  <button 
    onclick={() => router.goto('/')}
    class="flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-xl font-semibold hover:opacity-90 transition-opacity"
  >
    <Papicon name="home" size={20} />
    Retour à l'accueil
  </button>
</div>
