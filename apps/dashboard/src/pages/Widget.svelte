<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchWidgetData, activateWidget, deactivateWidget, refreshWidget, refreshAllWidgets } from '../lib/api';
  import { toast } from '../lib/stores/toast.svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import Papicon from '../lib/components/Papicon.svelte';

  let loading = $state(true);
  let acting = $state(false);
  let copyingScript = $state(false);
  let data: any = $state(null);

  const isActive = $derived(data?.mySubscription?.enabled === true);
  const subscriptionCount = $derived(data?.subscriptions?.length ?? 0);

  async function load() {
    loading = true;
    try {
      data = await fetchWidgetData();
    } catch {
      toast.error('Erreur lors du chargement');
    } finally {
      loading = false;
    }
  }

  async function handleActivate() {
    acting = true;
    try {
      const result = await activateWidget();
      if (result?.pushResult?.ok === false) {
        toast.warning(result.pushResult.error || 'Widget activé mais la synchronisation Discord a échoué.');
      } else {
        toast.success('Données synchronisées. Copie maintenant le script Vencord pour ajouter le widget à ton profil.');
      }
      await load();
    } catch {
      toast.error('Erreur lors de l\'activation');
    } finally {
      acting = false;
    }
  }

  async function handleCopyVencordScript() {
    copyingScript = true;
    try {
      const response = await fetch('/kotbo-widget-discord-v2.js', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await navigator.clipboard.writeText(await response.text());
      toast.success('Script copié. Colle-le dans la console DevTools de Discord/Vencord.');
    } catch {
      toast.error('Impossible de copier le script. Ouvre le fichier avec le lien puis copie son contenu.');
    } finally {
      copyingScript = false;
    }
  }

  async function handleDeactivate() {
    acting = true;
    try {
      await deactivateWidget();
      toast.success('Widget désactivé avec succès.');
      await load();
    } catch {
      toast.error('Erreur lors de la désactivation');
    } finally {
      acting = false;
    }
  }

  async function handleRefresh() {
    acting = true;
    try {
      const result = await refreshWidget();
      if (result?.pushResult?.ok) {
        toast.success('Widget rafraîchi !');
      }
    } catch {
      toast.error('Erreur lors du rafraîchissement');
    } finally {
      acting = false;
    }
  }

  async function handleRefreshAll() {
    acting = true;
    try {
      const result = await refreshAllWidgets();
      const failures = Array.isArray(result?.failures) ? result.failures : [];
      if (failures.length > 0) {
        toast.warning(`Widgets : ${result?.success ?? 0} OK, ${result?.failed ?? 0} échoués — ${failures.map((f: any) => `${f.userId}: ${f.error}`).join(' · ')}`);
      } else {
        toast.success(`Widgets rafraîchis : ${result?.success ?? 0} OK`);
      }
    } catch {
      toast.error('Erreur lors du rafraîchissement global');
    } finally {
      acting = false;
    }
  }

  onMount(load);
</script>

<!-- ======================== HEADER ======================== -->
<div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
  <div>
    <h1 class="text-lg font-semibold flex items-center gap-2.5">
      <Papicon icon="layout" size={24} />
      Widget Profil
    </h1>
    <p class="text-xs text-on-surface-variant/60 mt-1">Affiche tes stats staff directement sur ton profil Discord</p>
  </div>
</div>

<!-- ======================== CONTENT ======================== -->
{#if loading}
  <div class="flex flex-col items-center justify-center py-16 text-on-surface-variant/50 gap-4">
    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    <p class="text-sm">Chargement...</p>
  </div>
{:else}
  <!-- ======================== STATS ROW ======================== -->
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
    <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-4 flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl flex items-center justify-center {isActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-surface-container-high/30 text-on-surface-variant/50'}">
        <Papicon icon={isActive ? 'check-circle' : 'x-circle'} size={20} />
      </div>
      <div class="flex flex-col">
        <span class="text-2xl font-bold">{isActive ? 'Actif' : 'Inactif'}</span>
        <span class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 mt-0.5">Ton widget</span>
      </div>
    </div>
    <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-4 flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 text-primary">
        <Papicon icon="users" size={20} />
      </div>
      <div class="flex flex-col">
        <span class="text-2xl font-bold">{subscriptionCount}</span>
        <span class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 mt-0.5">Widgets actifs</span>
      </div>
    </div>
  </div>

  <!-- ======================== GRID ======================== -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

    <!-- Actions card -->
    <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-6 space-y-4">
      <h3 class="text-base font-semibold flex items-center gap-2.5">
        <Papicon icon="zap" size={18} />
        Actions
      </h3>
      <div class="flex flex-col gap-3">
        {#if isActive}
          <button
            class="px-5 py-2.5 bg-primary text-on-primary text-xs font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
            onclick={handleRefresh}
            disabled={acting}
          >
            <Papicon icon="refresh-cw" size={14} />
            Rafraîchir mon widget
          </button>
          <button
            class="px-5 py-2.5 bg-rose-500 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-rose-500/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
            onclick={handleDeactivate}
            disabled={acting}
          >
            <Papicon icon="x" size={14} />
            Désactiver
          </button>
        {:else}
          <button
            class="px-5 py-2.5 bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
            onclick={handleActivate}
            disabled={acting}
          >
            <Papicon icon="check" size={14} />
            Activer le widget
          </button>
        {/if}

        <button
          class="px-5 py-2.5 bg-surface-container-high/40 text-on-surface-variant hover:bg-surface-container-high/60 text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-2"
          onclick={handleRefreshAll}
          disabled={acting}
        >
          <Papicon icon="refresh-cw" size={14} />
          Rafraîchir tous les widgets
        </button>
      </div>
    </div>

    <!-- How it works card -->
    <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-6 space-y-4">
      <h3 class="text-base font-semibold flex items-center gap-2.5">
        <Papicon icon="info" size={18} />
        Fonctionnement
      </h3>
      <div class="flex flex-col gap-4">
        <div class="flex items-start gap-3">
          <span class="shrink-0 w-7 h-7 bg-primary text-on-primary rounded-full flex items-center justify-center text-xs font-bold">1</span>
          <span class="text-sm text-on-surface-variant leading-relaxed">Connecte-toi au dashboard — l'autorisation widget est incluse automatiquement lors de la connexion Discord</span>
        </div>
        <div class="flex items-start gap-3">
          <span class="shrink-0 w-7 h-7 bg-primary text-on-primary rounded-full flex items-center justify-center text-xs font-bold">2</span>
          <span class="text-sm text-on-surface-variant leading-relaxed">Active le widget ici ou avec <code class="bg-surface-container-high/50 px-1.5 py-0.5 rounded text-xs">/widget activer</code> pour synchroniser tes statistiques.</span>
        </div>
        <div class="flex items-start gap-3">
          <span class="shrink-0 w-7 h-7 bg-primary text-on-primary rounded-full flex items-center justify-center text-xs font-bold">3</span>
          <span class="text-sm text-on-surface-variant leading-relaxed">Copie le script ci-dessous, exécute-le une fois dans Discord/Vencord, puis recharge avec <kbd class="font-mono text-xs">Ctrl+R</kbd>.</span>
        </div>
      </div>
    </div>

    {#if isActive}
      <section class="lg:col-span-2 relative overflow-hidden rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-6">
        <div class="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-amber-400/10 blur-3xl pointer-events-none"></div>
        <div class="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div class="space-y-3">
            <div class="flex items-center gap-2 text-amber-400">
              <Papicon icon="terminal" size={18} />
              <span class="text-[10px] font-bold uppercase tracking-[0.18em]">Installation locale · Discord/Vencord</span>
            </div>
            <h3 class="text-base font-semibold text-on-surface">Ajouter Kotbo à ton Profile Board</h3>
            <p class="max-w-2xl text-sm leading-relaxed text-on-surface-variant">
              Discord refuse cette modification via OAuth. Le script utilise uniquement ta session locale Discord,
              conserve tes widgets actuels et n’extrait aucun token.
            </p>
            <ol class="grid gap-2 text-xs text-on-surface-variant sm:grid-cols-2 lg:grid-cols-4">
              <li><span class="mr-1.5 font-mono text-amber-400">01</span> Ouvre Discord/Vencord</li>
              <li><span class="mr-1.5 font-mono text-amber-400">02</span> DevTools avec Ctrl+Shift+I</li>
              <li><span class="mr-1.5 font-mono text-amber-400">03</span> Si demandé, tape « allow pasting »</li>
              <li><span class="mr-1.5 font-mono text-amber-400">04</span> Colle le script dans Console</li>
            </ol>
          </div>
          <div class="flex min-w-56 flex-col gap-2">
            <button
              class="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-400 px-5 py-3 text-xs font-bold uppercase tracking-wider text-black transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
              onclick={handleCopyVencordScript}
              disabled={copyingScript}
            >
              <Papicon icon={copyingScript ? 'loader' : 'copy'} size={15} />
              {copyingScript ? 'Copie…' : 'Copier le script'}
            </button>
            <a
              href="/kotbo-widget-discord-v2.js"
              target="_blank"
              rel="noreferrer"
              class="text-center text-[11px] text-on-surface-variant/70 underline decoration-outline-variant underline-offset-4 hover:text-on-surface"
            >Voir le fichier avant de l’exécuter</a>
          </div>
        </div>
      </section>
    {/if}

    <!-- Active staff list card -->
    {#if data?.subscriptions?.length > 0}
      <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-xl p-6 space-y-4">
        <h3 class="text-base font-semibold flex items-center gap-2.5">
          <Papicon icon="users" size={18} />
          Staff avec widget actif
        </h3>
        <div class="flex flex-col divide-y divide-outline-variant/10">
          {#each data.subscriptions.filter((s: any) => s.enabled) as sub}
            <div class="flex items-center gap-4 py-3">
              <span class="flex-1 font-mono text-sm text-on-surface">{sub.userId}</span>
              <span class="text-xs text-on-surface-variant/60">{new Date(sub.createdAt).toLocaleDateString('fr-FR')}</span>
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/15">Actif</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

  </div>
{/if}
