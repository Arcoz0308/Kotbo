<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchWidgetData, activateWidget, deactivateWidget, installWidgetOnProfile, refreshWidget, refreshAllWidgets } from '../lib/api';
  import { toast } from '../lib/stores/toast.svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import Papicon from '../lib/components/Papicon.svelte';

  let loading = $state(true);
  let acting = $state(false);
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
      } else if (result?.installResult?.ok === false) {
        toast.warning(result.installResult.error || 'Stats synchronisées, mais Discord a refusé l’ajout au profil.');
      } else {
        toast.success('Widget synchronisé et ajouté au profil Discord !');
      }
      await load();
    } catch {
      toast.error('Erreur lors de l\'activation');
    } finally {
      acting = false;
    }
  }

  async function handleInstall() {
    acting = true;
    try {
      const result = await installWidgetOnProfile();
      if (result?.installResult?.ok) {
        toast.success('Kotbo a été ajouté à ton Profile Board Discord !');
      } else {
        toast.warning(result?.installResult?.error || 'Discord a refusé l’ajout du widget au profil.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de l’ajout au profil Discord.');
    } finally {
      acting = false;
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
            class="px-5 py-2.5 bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
            onclick={handleInstall}
            disabled={acting}
          >
            <Papicon icon="external-link" size={14} />
            Ajouter à mon profil Discord
          </button>
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
          <span class="text-sm text-on-surface-variant leading-relaxed">Active le widget, puis utilise « Ajouter à mon profil Discord ». La commande <code class="bg-surface-container-high/50 px-1.5 py-0.5 rounded text-xs">/widget activer</code> synchronise les données mais ne possède pas ton autorisation web.</span>
        </div>
        <div class="flex items-start gap-3">
          <span class="shrink-0 w-7 h-7 bg-primary text-on-primary rounded-full flex items-center justify-center text-xs font-bold">3</span>
          <span class="text-sm text-on-surface-variant leading-relaxed">Tes stats staff s'affichent sur ton profil et se rafraîchissent automatiquement toutes les 30 minutes</span>
        </div>
      </div>
    </div>

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
