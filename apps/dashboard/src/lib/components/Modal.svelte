<script lang="ts">
  import { onMount } from 'svelte';
  import { portal } from '../actions/portal';
  import Papicon from './Papicon.svelte';

  let {
    open = false,
    onClose = () => {},
    title = '',
    subtitle = '',
    size = 'md', // sm, md, lg, xl, full
    showCloseButton = true,
    closeOnBackdropClick = true,
    closeOnEscape = true,
    children
  } = $props<{
    open?: boolean;
    onClose?: (e?: any) => void;
    title?: string;
    subtitle?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
    showCloseButton?: boolean;
    closeOnBackdropClick?: boolean;
    closeOnEscape?: boolean;
    children?: any;
  }>();

  const sizeClasses: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-6xl'
  };

  function handleBackdropClick(e: MouseEvent) {
    if (closeOnBackdropClick && e.currentTarget === e.target) {
      onClose(e);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (closeOnEscape && e.key === 'Escape') {
      onClose(e);
    }
  }

  $effect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  });
</script>

{#if open}
  <div
    use:portal
    class="fixed inset-0 z-[9999] flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
  >
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-black/60 backdrop-blur-sm"
      onclick={handleBackdropClick}
      onkeydown={handleKeydown}
      onkeypress={(e) => e.key === 'Enter' && handleBackdropClick(e as any)}
      tabindex="-1"
      role="button"
      aria-label="Fermer la fenêtre"
    ></div>

    <!-- Modal Panel -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="relative w-full {sizeClasses[size]} bg-surface-container-lowest rounded-[2rem] shadow-2xl overflow-hidden border border-outline-variant/30 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      {#if title || showCloseButton}
        <header class="p-6 border-b border-outline-variant/30 flex items-center justify-between relative z-10">
          <div class="flex-1">
            {#if title}
              <h3 id="modal-title" class="text-xl font-black text-on-surface">{title}</h3>
            {/if}
            {#if subtitle}
              <p class="text-sm text-on-surface-variant/80 mt-1">{subtitle}</p>
            {/if}
          </div>
          {#if showCloseButton}
            <button
              type="button"
              onclick={onClose}
              class="ml-4 h-9 w-9 flex items-center justify-center rounded-xl bg-surface-container-high/60 hover:bg-surface-container-high hover:scale-105 transition-all text-on-surface-variant hover:text-on-surface"
              aria-label="Fermer"
            >
              <Papicon icon="x" size={16} />
            </button>
          {/if}
        </header>
      {/if}

      <!-- Content -->
      <div class="flex-1 overflow-y-auto">
        {@render children?.()}
      </div>
    </div>
  </div>
{/if}
