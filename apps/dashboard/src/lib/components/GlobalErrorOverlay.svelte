<script lang="ts">
  import { reportDashboardError } from '../api';
  import { authStore } from '../stores/auth.svelte';
  import { toast } from '../stores/toast.svelte';

  let { errorMsg, errorStack } = $props<{ errorMsg: string; errorStack?: string }>();

  let isRefreshed = sessionStorage.getItem('error_refreshed') === 'true';
  let isSending = $state(false);
  let isSent = $state(false);

  function handleRefresh() {
    sessionStorage.setItem('error_refreshed', 'true');
    window.location.reload();
  }

  async function handleTransmitError() {
    isSending = true;
    try {
      await reportDashboardError({
        error: errorMsg,
        stack: errorStack,
        url: window.location.href,
        userAgent: navigator.userAgent,
        guildId: authStore.selectedGuildId
      });
      isSent = true;
      toast.success('Rapport d\'erreur envoyé avec succès !');
    } catch (err: any) {
      console.error(err);
      toast.error('Échec de l\'envoi du rapport d\'erreur.');
    } finally {
      isSending = false;
    }
  }
</script>

<div class="fixed inset-0 z-[10000] flex items-center justify-center bg-background p-6 md:p-12 overflow-y-auto">
  <!-- Dynamic mesh-like background grid to make it look premium -->
  <div class="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:24px_24px]"></div>
  
  <div class="relative w-full max-w-2xl bg-surface-container-lowest border border-outline-variant rounded-3xl p-8 md:p-12 shadow-2xl flex flex-col items-center text-center gap-6 animate-in fade-in">
    <!-- Icon Container -->
    <div class="w-16 h-16 rounded-2xl bg-error/10 text-error flex items-center justify-center">
      <span class="material-symbols-outlined text-3xl font-bold">warning</span>
    </div>

    <!-- Title and Subtitle -->
    <div>
      <h1 class="text-2xl md:text-3xl font-black font-headline text-on-surface tracking-tight">
        Une erreur est survenue
      </h1>
      <p class="text-on-surface-variant text-sm md:text-base mt-2 max-w-md mx-auto">
        L'application a rencontré un problème inattendu. Ne vous inquiétez pas, vous pouvez essayer de rafraîchir la page.
      </p>
    </div>

    <!-- Error Message Snippet -->
    <div class="w-full text-left bg-surface-container border border-outline-variant rounded-2xl p-5 overflow-hidden">
      <div class="flex items-center justify-between border-b border-outline-variant/50 pb-2 mb-3">
        <span class="text-xs font-black uppercase tracking-wider text-on-surface-variant">Détails de l'erreur</span>
        <span class="text-xs text-error font-semibold font-mono text-right">CRITICAL</span>
      </div>
      <p class="font-mono text-xs md:text-sm text-error break-words whitespace-pre-wrap font-semibold leading-relaxed">
        {errorMsg}
      </p>
      {#if errorStack}
        <div class="mt-4 pt-3 border-t border-outline-variant/30">
          <details class="group">
            <summary class="text-xs font-black uppercase tracking-wider text-on-surface-variant cursor-pointer select-none hover:text-on-surface transition-colors flex items-center gap-2">
              <span class="material-symbols-outlined text-sm transition-transform group-open:rotate-90">chevron_right</span>
              Stack Trace
            </summary>
            <pre class="mt-2 text-[10px] md:text-xs font-mono text-on-surface-variant/80 overflow-x-auto max-h-40 bg-surface-container-low border border-outline-variant/30 rounded-lg p-3 whitespace-pre scrollbar-thin">
              {errorStack}
            </pre>
          </details>
        </div>
      {/if}
    </div>

    <!-- Actions -->
    <div class="flex flex-col sm:flex-row items-center gap-4 w-full justify-center mt-4">
      <button 
        onclick={handleRefresh}
        class="w-full sm:w-auto px-8 py-3.5 bg-primary hover:bg-primary/95 text-on-primary font-bold text-sm tracking-wide rounded-2xl transition-all shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
      >
        <span class="material-symbols-outlined text-lg">refresh</span>
        Actualiser la page
      </button>

      {#if isRefreshed}
        {#if isSent}
          <button 
            disabled
            class="w-full sm:w-auto px-8 py-3.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-sm tracking-wide rounded-2xl cursor-default flex items-center justify-center gap-2"
          >
            <span class="material-symbols-outlined text-lg">check_circle</span>
            Signalé
          </button>
        {:else}
          <button 
            onclick={handleTransmitError}
            disabled={isSending}
            class="w-full sm:w-auto px-8 py-3.5 bg-surface-container hover:bg-surface-container-high border border-outline text-on-surface font-bold text-sm tracking-wide rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {#if isSending}
              <div class="w-4 h-4 border-2 border-on-surface border-t-transparent rounded-full animate-spin"></div>
              Envoi...
            {:else}
              <span class="material-symbols-outlined text-lg">send</span>
              Transmettre l'erreur
            {/if}
          </button>
        {/if}
      {/if}
    </div>
  </div>
</div>
