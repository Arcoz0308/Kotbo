<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';
  import { 
    fetchAutoResponses, 
    createAutoResponse, 
    updateAutoResponse, 
    deleteAutoResponse 
  } from '../lib/api';

  const actionState = createAsyncActionState();
  let loading = $state(false);

  const canManageSettings = $derived(
    !!dashboardStore.state.featureAccess?.auto_responses?.canConfigure
      || !!dashboardStore.state.access?.canManageSettings
  );

  let list = $state<Array<{
    id: string;
    trigger: string;
    response: string;
    matchType: string;
    enabled: boolean;
    createdAt: string;
  }>>([]);

  // Create form states
  let newTrigger = $state('');
  let newResponse = $state('');
  let newMatchType = $state('CONTAINS');
  let newEnabled = $state(true);

  // Edit states
  let editingId = $state<string | null>(null);
  let editTrigger = $state('');
  let editResponse = $state('');
  let editMatchType = $state('CONTAINS');
  let editEnabled = $state(true);

  onMount(async () => {
    loading = true;
    try {
      await dashboardStore.refresh();
      const res = await fetchAutoResponses();
      if (res && res.list) {
        list = res.list;
      }
    } catch (err) {
      console.error(err);
    } finally {
      loading = false;
    }
  });

  async function handleCreate() {
    if (!canManageSettings || !newTrigger || !newResponse) return;
    await actionState.run(async () => {
      const res = await createAutoResponse({
        trigger: newTrigger,
        response: newResponse,
        matchType: newMatchType,
        enabled: newEnabled
      });

      if (!res || !res.autoResponse) throw new Error('Erreur de création');
      list = [res.autoResponse, ...list];
      newTrigger = '';
      newResponse = '';
      newMatchType = 'CONTAINS';
      newEnabled = true;
      return true;
    }, { successMessage: 'Auto-réponse créée avec succès !' });
  }

  async function handleToggle(id: string, currentStatus: boolean) {
    if (!canManageSettings) return;
    const ok = await updateAutoResponse(id, { enabled: !currentStatus });
    if (ok) {
      list = list.map(item => item.id === id ? { ...item, enabled: !currentStatus } : item);
    }
  }

  function startEdit(item: typeof list[0]) {
    if (!canManageSettings) return;
    editingId = item.id;
    editTrigger = item.trigger;
    editResponse = item.response;
    editMatchType = item.matchType;
    editEnabled = item.enabled;
  }

  function cancelEdit() {
    editingId = null;
  }

  async function handleSaveEdit() {
    if (!canManageSettings || !editingId || !editTrigger || !editResponse) return;
    await actionState.run(async () => {
      const res = await updateAutoResponse(editingId!, {
        trigger: editTrigger,
        response: editResponse,
        matchType: editMatchType,
        enabled: editEnabled
      });

      if (!res || !res.autoResponse) throw new Error('Erreur de modification');
      list = list.map(item => item.id === editingId ? res.autoResponse : item);
      editingId = null;
      return true;
    }, { successMessage: 'Auto-réponse modifiée !' });
  }

  async function handleDelete(id: string) {
    if (!canManageSettings) return;
    if (!confirm('Supprimer cette auto-réponse ?')) return;
    await actionState.run(async () => {
      const ok = await deleteAutoResponse(id);
      if (!ok) throw new Error('Erreur de suppression');
      list = list.filter(item => item.id !== id);
      return true;
    }, { successMessage: 'Auto-réponse supprimée.' });
  }

  const matchTypeLabels: Record<string, string> = {
    'EXACT': 'Mot Exact',
    'CONTAINS': 'Contient',
    'REGEX': 'Expression Régulière (Regex)'
  };
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <header class="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-surface-container-low/40 backdrop-blur-3xl p-8 rounded-4xl border border-outline-variant/30">
    <div class="flex items-center gap-6">
      <div class="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-inner">
        <Papicon icon="MessageSquare" size={32} />
      </div>
      <div>
        <h1 class="text-3xl font-black tracking-tight leading-tight">Auto-Réponses</h1>
        <p class="text-on-surface-variant/80 font-medium">Automatisez des réponses textuelles instantanées basées sur des mots-clés ou des déclencheurs.</p>
      </div>
    </div>
  </header>

  <InlineFeedback state={actionState} />

  {#if loading}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <Skeleton height="450px" radius="2.5rem" />
      <div class="lg:col-span-2 space-y-4">
        <Skeleton height="120px" radius="2rem" />
        <Skeleton height="120px" radius="2rem" />
      </div>
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <!-- Create Trigger Section -->
      <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-6 h-fit">
        <h3 class="text-xl font-black flex items-center gap-3">
          <Papicon icon="Add" size={20} class="text-primary" />
          Ajouter un déclencheur
        </h3>

        <form onsubmit={(e) => { e.preventDefault(); handleCreate(); }} class="space-y-4">
          <div class="space-y-1.5">
            <label for="trigger" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Mot-clé / Déclencheur</label>
            <input 
              id="trigger"
              type="text" 
              bind:value={newTrigger} 
              placeholder="Ex: !ip ou bonjour"
              class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
              required
              disabled={!canManageSettings}
            />
          </div>

          <div class="space-y-1.5">
            <label for="matchType" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Type de correspondance</label>
            <select 
              id="matchType"
              bind:value={newMatchType}
              class="w-full bg-surface-container-high/45 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/30 transition-all focus:outline-none"
              disabled={!canManageSettings}
            >
              <option value="CONTAINS">Contient le mot-clé</option>
              <option value="EXACT">Correspondance exacte</option>
              <option value="REGEX">Expression régulière (Regex)</option>
            </select>
          </div>

          <div class="space-y-1.5">
            <label for="response" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Réponse du Bot</label>
            <textarea 
              id="response"
              bind:value={newResponse} 
              placeholder="Texte à renvoyer automatiquement par le bot..."
              class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none h-28 resize-none"
              required
              disabled={!canManageSettings}
            ></textarea>
          </div>

          <div class="flex items-center justify-between p-4 rounded-2xl bg-surface-container-high/20 border border-outline-variant/5">
            <div>
              <p class="text-sm font-bold">Activer le déclencheur</p>
              <p class="text-[10px] text-on-surface-variant/50">Actif dès le déploiement</p>
            </div>
            <ToggleSwitch 
              checked={newEnabled} 
              onToggle={(v) => newEnabled = v} 
              disabled={!canManageSettings}
            />
          </div>

          {#if canManageSettings}
            <button 
              type="submit"
              class="w-full py-4 mt-2 bg-primary text-on-primary font-black uppercase tracking-widest text-xs rounded-2xl shadow-lg shadow-primary/20 hover:scale-105 transition-all"
            >
              Enregistrer
            </button>
          {/if}
        </form>
      </section>

      <!-- Triggers List Section -->
      <section class="lg:col-span-2 space-y-6">
        <h3 class="text-xl font-black flex items-center gap-3">
          <Papicon icon="List" size={20} class="text-secondary" />
          Liste des Déclencheurs ({list.length})
        </h3>

        <div class="space-y-4">
          {#each list as item}
            {#if editingId === item.id}
              <!-- Editing Mode -->
              <div class="bg-surface-container-low/40 border border-primary/30 p-6 rounded-3xl space-y-4 animate-in zoom-in duration-200">
                <h4 class="text-sm font-black uppercase text-primary tracking-wider">Modifier l'auto-réponse</h4>
                
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div class="space-y-1.5">
                    <label for="editTrigger" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Mot-clé / Déclencheur</label>
                    <input 
                      id="editTrigger"
                      type="text" 
                      bind:value={editTrigger} 
                      class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-2 text-sm focus:outline-none"
                    />
                  </div>
                  <div class="space-y-1.5">
                    <label for="editMatchType" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Type de correspondance</label>
                    <select 
                      id="editMatchType"
                      bind:value={editMatchType}
                      class="w-full bg-surface-container-high/45 border border-outline-variant/10 rounded-2xl px-4 py-2 text-sm focus:outline-none text-on-surface"
                    >
                      <option value="CONTAINS">Contient le mot-clé</option>
                      <option value="EXACT">Correspondance exacte</option>
                      <option value="REGEX">Expression régulière (Regex)</option>
                    </select>
                  </div>
                </div>

                <div class="space-y-1.5">
                  <label for="editResponse" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Réponse du Bot</label>
                  <textarea 
                    id="editResponse"
                    bind:value={editResponse} 
                    class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-2 text-sm focus:outline-none h-20 resize-none"
                  ></textarea>
                </div>

                <div class="flex items-center justify-between p-3 bg-surface-container-high/20 rounded-2xl">
                  <span class="text-xs font-bold">Activer le déclencheur</span>
                  <ToggleSwitch checked={editEnabled} onToggle={(v) => editEnabled = v} />
                </div>

                <div class="flex justify-end gap-3">
                  <button 
                    onclick={cancelEdit}
                    class="px-5 py-2.5 bg-outline-variant/30 text-on-surface text-xs font-bold rounded-xl hover:bg-outline-variant/40 transition-colors"
                  >
                    Annuler
                  </button>
                  <button 
                    onclick={handleSaveEdit}
                    class="px-5 py-2.5 bg-primary text-on-primary text-xs font-black uppercase tracking-wider rounded-xl shadow shadow-primary/10 hover:scale-105 transition-all"
                  >
                    Enregistrer
                  </button>
                </div>
              </div>
            {:else}
              <!-- Normal View Mode -->
              <div class="bg-surface-container-low/30 border border-outline-variant/10 p-6 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-surface-container-low/50 transition-all">
                <div class="space-y-2 flex-1">
                  <div class="flex items-center gap-3">
                    <span class="text-xs font-black uppercase tracking-wider px-3 py-0.5 rounded bg-primary/10 text-primary border border-primary/10">
                      {matchTypeLabels[item.matchType] || item.matchType}
                    </span>
                    <span class="text-[10px] text-on-surface-variant/50 font-medium">Déclencheur :</span>
                    <code class="text-xs font-black font-mono bg-surface-container px-2 py-0.5 rounded text-secondary dark:text-cyan-300">{item.trigger}</code>
                  </div>
                  <div class="p-3 bg-surface-container-high/25 border border-outline-variant/5 rounded-2xl text-sm font-medium text-on-surface-variant/90 leading-relaxed whitespace-pre-wrap">
                    {item.response}
                  </div>
                </div>

                <div class="flex items-center gap-4">
                  <div class="flex items-center gap-2" title="Module Actif/Inactif">
                    <span class="text-[10px] font-bold text-on-surface-variant/50 uppercase">Statut</span>
                    <ToggleSwitch 
                      checked={item.enabled} 
                      onToggle={() => handleToggle(item.id, item.enabled)} 
                      disabled={!canManageSettings}
                    />
                  </div>

                  {#if canManageSettings}
                    <div class="flex items-center gap-1 border-l border-outline-variant/20 pl-4">
                      <button 
                        onclick={() => startEdit(item)}
                        class="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                        title="Modifier"
                      >
                        <Papicon icon="Edit" size={16} />
                      </button>
                      <button 
                        onclick={() => handleDelete(item.id)}
                        class="p-2 text-error hover:bg-error/10 rounded-xl transition-all"
                        title="Supprimer"
                      >
                        <Papicon icon="Trash" size={16} />
                      </button>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          {:else}
            <div class="flex flex-col items-center justify-center py-20 bg-surface-container-low/20 border border-outline-variant/10 rounded-[2.5rem] text-center">
              <Papicon icon="Info" size={32} class="text-on-surface-variant/20 mb-3" />
              <p class="text-sm text-on-surface-variant/60 font-medium">Aucune auto-réponse enregistrée.</p>
            </div>
          {/each}
        </div>
      </section>
    </div>
  {/if}
</div>
