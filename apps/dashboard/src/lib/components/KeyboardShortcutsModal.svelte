<script lang="ts">
  import Papicon from './Papicon.svelte';

  interface Shortcut {
    keys: string[];
    description: string;
    category: string;
  }

  const shortcuts: Shortcut[] = [
    { keys: ['G', 'D', 'ou', 'Ctrl', 'Shift', 'D'], description: 'Aller au Dashboard / Vue d\'ensemble', category: 'Navigation' },
    { keys: ['G', 'M', 'ou', 'Ctrl', 'Shift', 'M'], description: 'Aller à la gestion des Membres / Modération', category: 'Navigation' },
    { keys: ['G', 'C', 'ou', 'Ctrl', 'Shift', 'C'], description: 'Aller à la Configuration / Paramètres du bot', category: 'Navigation' },
    { keys: ['G', 'L', 'ou', 'Ctrl', 'Shift', 'L'], description: 'Consulter les Logs d\'activité', category: 'Navigation' },
    { keys: ['Ctrl', 'Shift', 'N'], description: 'Ouvrir ce menu des raccourcis clavier', category: 'Système' },
  ];

  let { isOpen = false, onClose = () => {} }: { isOpen?: boolean; onClose?: () => void } = $props();

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    }
  }
</script>

{#if isOpen}
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="keyboard-shortcuts-title"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    onclick={handleBackdropClick}
    onkeydown={handleKeyDown}
    tabindex="-1"
  >
    <div class="bg-surface-container-low border border-outline-variant/20 rounded-3xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-outline-variant/10">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Papicon icon="Keyboard" size={20} class="text-primary" />
          </div>
          <div>
            <h2 id="keyboard-shortcuts-title" class="text-xl font-black">Raccourcis clavier</h2>
            <p class="text-sm text-on-surface-variant/60">Navigation rapide dans le dashboard</p>
          </div>
        </div>
        <button
          onclick={onClose}
          class="w-8 h-8 rounded-lg bg-surface-container-high/20 hover:bg-surface-container-high/40 flex items-center justify-center transition-colors"
        >
          <Papicon icon="X" size={18} class="text-on-surface-variant" />
        </button>
      </div>

      <!-- Content -->
      <div class="p-6 overflow-y-auto max-h-[60vh]">
        {#each ['Navigation', 'Système'] as category}
          <div class="mb-6 last:mb-0">
            <h3 class="text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest mb-3">{category}</h3>
            <div class="space-y-2">
              {#each shortcuts.filter(s => s.category === category) as shortcut}
                <div class="flex items-center justify-between p-3 rounded-xl bg-surface-container-high/10 hover:bg-surface-container-high/20 transition-colors">
                  <p class="text-sm font-medium text-on-surface">{shortcut.description}</p>
                  <div class="flex items-center gap-1">
                    {#each shortcut.keys as key}
                      {#if key === 'ou'}
                        <span class="text-xs font-bold text-on-surface-variant/60 mx-1">ou</span>
                      {:else}
                        <kbd class="px-2 py-1 rounded-lg bg-surface-container-high border border-outline-variant/20 text-xs font-bold text-on-surface-variant shadow-sm">
                          {key}
                        </kbd>
                      {/if}
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <!-- Footer -->
      <div class="p-4 border-t border-outline-variant/10 bg-surface-container-high/10">
        <p class="text-xs text-center text-on-surface-variant/50">
          Appuyez sur <kbd class="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/20 text-xs font-bold">Escape</kbd> pour fermer
        </p>
      </div>
    </div>
  </div>
{/if}
