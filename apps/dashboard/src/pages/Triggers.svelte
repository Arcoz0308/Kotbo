<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';
  import SearchableSelect from '../lib/components/SearchableSelect.svelte';
  import MultiSelect from '../lib/components/MultiSelect.svelte';
  import { 
    fetchAutoResponses, 
    createAutoResponse, 
    updateAutoResponse, 
    deleteAutoResponse 
  } from '../lib/api';

  const actionState = createAsyncActionState();
  let loading = $state(false);
  let showModal = $state(false);
  let isEditing = $state(false);
  let editingId = $state<string | null>(null);

  const canManageSettings = $derived(
    !!dashboardStore.state.featureAccess?.auto_responses?.canConfigure
      || !!dashboardStore.state.access?.canManageSettings
  );

  const availableRoles = $derived(dashboardStore.state.discordRoles || []);
  const availableChannels = $derived(dashboardStore.state.discordChannels || []);

  let list = $state<Array<{
    id: string;
    trigger: string;
    response: string | null;
    matchType: string;
    enabled: boolean;
    roleIdToAdd: string | null;
    roleIdToRemove: string | null;
    deleteTrigger: boolean;
    allowedRoleIds: string[];
    bannedRoleIds: string[];
    allowedChannelIds: string[];
    bannedChannelIds: string[];
    createdAt: string;
  }>>([]);

  // Form states
  let formTrigger = $state('');
  let formResponse = $state('');
  let formMatchType = $state('CONTAINS');
  let formEnabled = $state(true);
  let formRoleIdToAdd = $state<string | null>(null);
  let formRoleIdToRemove = $state<string | null>(null);
  let formDeleteTrigger = $state(false);
  let formAllowedRoleIds = $state<string[]>([]);
  let formBannedRoleIds = $state<string[]>([]);
  let formAllowedChannelIds = $state<string[]>([]);
  let formBannedChannelIds = $state<string[]>([]);

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

  function openCreateModal() {
    isEditing = false;
    editingId = null;
    formTrigger = '';
    formResponse = '';
    formMatchType = 'CONTAINS';
    formEnabled = true;
    formRoleIdToAdd = null;
    formRoleIdToRemove = null;
    formDeleteTrigger = false;
    formAllowedRoleIds = [];
    formBannedRoleIds = [];
    formAllowedChannelIds = [];
    formBannedChannelIds = [];
    actionState.clearFeedback();
    showModal = true;
  }

  function openEditModal(item: typeof list[0]) {
    isEditing = true;
    editingId = item.id;
    formTrigger = item.trigger;
    formResponse = item.response || '';
    formMatchType = item.matchType;
    formEnabled = item.enabled;
    formRoleIdToAdd = item.roleIdToAdd;
    formRoleIdToRemove = item.roleIdToRemove;
    formDeleteTrigger = item.deleteTrigger;
    formAllowedRoleIds = item.allowedRoleIds || [];
    formBannedRoleIds = item.bannedRoleIds || [];
    formAllowedChannelIds = item.allowedChannelIds || [];
    formBannedChannelIds = item.bannedChannelIds || [];
    actionState.clearFeedback();
    showModal = true;
  }

  async function handleSubmit() {
    if (!canManageSettings || !formTrigger) return;
    if (!formResponse.trim() && !formRoleIdToAdd && !formRoleIdToRemove && !formDeleteTrigger) {
      actionState.setError("Veuillez configurer au moins une action (réponse, ajout/retrait de rôle, ou suppression du message).");
      return;
    }
    
    await actionState.run(async () => {
      if (isEditing && editingId) {
        const res = await updateAutoResponse(editingId, {
          trigger: formTrigger,
          response: formResponse.trim() || null,
          matchType: formMatchType,
          enabled: formEnabled,
          roleIdToAdd: formRoleIdToAdd,
          roleIdToRemove: formRoleIdToRemove,
          deleteTrigger: formDeleteTrigger,
          allowedRoleIds: formAllowedRoleIds,
          bannedRoleIds: formBannedRoleIds,
          allowedChannelIds: formAllowedChannelIds,
          bannedChannelIds: formBannedChannelIds,
        } as any);

        if (!res || !res.autoResponse) throw new Error('Erreur de modification');
        list = list.map(item => item.id === editingId ? res.autoResponse : item);
      } else {
        const res = await createAutoResponse({
          trigger: formTrigger,
          response: formResponse.trim() || null,
          matchType: formMatchType,
          enabled: formEnabled,
          roleIdToAdd: formRoleIdToAdd,
          roleIdToRemove: formRoleIdToRemove,
          deleteTrigger: formDeleteTrigger,
          allowedRoleIds: formAllowedRoleIds,
          bannedRoleIds: formBannedRoleIds,
          allowedChannelIds: formAllowedChannelIds,
          bannedChannelIds: formBannedChannelIds,
        } as any);

        if (!res || !res.autoResponse) throw new Error('Erreur de création');
        list = [res.autoResponse, ...list];
      }

      showModal = false;
      return true;
    }, { successMessage: isEditing ? 'Déclencheur modifié avec succès !' : 'Déclencheur créé avec succès !' });
  }

  async function handleToggle(id: string, currentStatus: boolean) {
    if (!canManageSettings) return;
    const ok = await updateAutoResponse(id, { enabled: !currentStatus });
    if (ok) {
      list = list.map(item => item.id === id ? { ...item, enabled: !currentStatus } : item);
    }
  }

  async function handleDelete(id: string) {
    if (!canManageSettings) return;
    if (!confirm('Supprimer ce déclencheur ?')) return;
    await actionState.run(async () => {
      const ok = await deleteAutoResponse(id);
      if (!ok) throw new Error('Erreur de suppression');
      list = list.filter(item => item.id !== id);
      return true;
    }, { successMessage: 'Déclencheur supprimé.' });
  }

  function getRoleName(roleId: string | null) {
    if (!roleId) return '';
    const role = availableRoles.find(r => r.id === roleId);
    return role ? `@${role.name}` : `Rôle inconnu (${roleId})`;
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
        <h1 class="text-3xl font-black tracking-tight leading-tight">Déclencheurs d'actions (Triggers)</h1>
        <p class="text-on-surface-variant/80 font-medium">Configurez des actions instantanées (envoi de messages, attribution/retrait de rôles ou modération) basées sur des mots-clés.</p>
      </div>
    </div>
  </header>

  <InlineFeedback state={actionState} />

  {#if loading}
    <div class="space-y-4">
      <Skeleton height="100px" radius="2rem" />
      <Skeleton height="100px" radius="2rem" />
      <Skeleton height="100px" radius="2rem" />
    </div>
  {:else}
    <div class="space-y-6">
      <!-- Title & Actions Bar -->
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <h3 class="text-xl font-black flex items-center gap-3">
          <Papicon icon="List" size={20} class="text-secondary" />
          Liste des Déclencheurs ({list.length})
        </h3>
        
        {#if canManageSettings}
          <button 
            onclick={openCreateModal}
            class="flex items-center gap-2 px-6 py-3.5 bg-primary hover:bg-primary-hover text-on-primary font-black uppercase tracking-widest text-xs rounded-2xl shadow-lg shadow-primary/20 hover:scale-[1.03] transition-all cursor-pointer"
          >
            <Papicon icon="Add" size={16} />
            Nouveau déclencheur
          </button>
        {/if}
      </div>

      <!-- Triggers Grid -->
      <div class="grid grid-cols-1 gap-4">
        {#each list as item}
          <div class="bg-surface-container-low/30 border border-outline-variant/10 p-6 rounded-3xl space-y-4 hover:bg-surface-container-low/50 transition-all">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <!-- Trigger details -->
              <div class="flex items-center gap-3 flex-wrap">
                <span class="text-xs font-black uppercase tracking-wider px-3 py-1 rounded-xl bg-primary/10 text-primary border border-primary/25">
                  {matchTypeLabels[item.matchType] || item.matchType}
                </span>
                <span class="text-[11px] text-on-surface-variant/50 font-bold uppercase tracking-wider">Déclencheur :</span>
                <code class="text-sm font-black font-mono bg-surface-container-high/65 px-3 py-1 rounded-xl text-secondary dark:text-cyan-300 border border-outline-variant/5">{item.trigger}</code>
              </div>

              <!-- Status & Card Action Buttons -->
              <div class="flex items-center gap-4 self-end sm:self-auto">
                <div class="flex items-center gap-2 bg-surface-container-high/40 px-3 py-1.5 rounded-2xl border border-outline-variant/5">
                  <span class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-wider">Actif</span>
                  <ToggleSwitch 
                    checked={item.enabled} 
                    onToggle={() => handleToggle(item.id, item.enabled)} 
                    disabled={!canManageSettings}
                  />
                </div>

                {#if canManageSettings}
                  <div class="flex items-center gap-1 border-l border-outline-variant/25 pl-4">
                    <button 
                      onclick={() => openEditModal(item)}
                      class="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/10 rounded-xl transition-all cursor-pointer"
                      title="Modifier"
                    >
                      <Papicon icon="Edit" size={16} />
                    </button>
                    <button 
                      onclick={() => handleDelete(item.id)}
                      class="p-2 text-error hover:bg-error/10 rounded-xl transition-all cursor-pointer"
                      title="Supprimer"
                    >
                      <Papicon icon="Trash" size={16} />
                    </button>
                  </div>
                {/if}
              </div>
            </div>

            <!-- Optional Response text box -->
            {#if item.response}
              <div class="space-y-1">
                <span class="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest block ml-1">Message de réponse :</span>
                <div class="p-4 bg-surface-container-high/30 border border-outline-variant/5 rounded-2xl text-sm font-medium text-on-surface-variant/90 leading-relaxed whitespace-pre-wrap">
                  {item.response}
                </div>
              </div>
            {/if}

            <!-- Badges representing actions -->
            <div class="flex flex-wrap gap-2 pt-3 border-t border-outline-variant/10">
              {#if item.response}
                <span class="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/10">
                  <Papicon icon="MessageSquare" size={10} /> Message
                </span>
              {/if}
              {#if item.roleIdToAdd}
                <span class="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/10">
                  <Papicon icon="Add" size={10} /> Ajouter {getRoleName(item.roleIdToAdd)}
                </span>
              {/if}
              {#if item.roleIdToRemove}
                <span class="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-xl bg-red-500/10 text-red-500 border border-red-500/10">
                  <Papicon icon="Trash" size={10} /> Retirer {getRoleName(item.roleIdToRemove)}
                </span>
              {/if}
              {#if item.deleteTrigger}
                <span class="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/10">
                  <Papicon icon="Cross" size={10} /> Supprimer le message
                </span>
              {/if}
              {#if item.allowedRoleIds?.length}
                <span class="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/10">
                  <Papicon icon="Shield" size={10} /> Rôles autorisés ({item.allowedRoleIds.length})
                </span>
              {/if}
              {#if item.bannedRoleIds?.length}
                <span class="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/10">
                  <Papicon icon="Block" size={10} /> Rôles interdits ({item.bannedRoleIds.length})
                </span>
              {/if}
              {#if item.allowedChannelIds?.length}
                <span class="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/10">
                  <Papicon icon="Hash" size={10} /> Salons autorisés ({item.allowedChannelIds.length})
                </span>
              {/if}
              {#if item.bannedChannelIds?.length}
                <span class="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/10">
                  <Papicon icon="Block" size={10} /> Salons interdits ({item.bannedChannelIds.length})
                </span>
              {/if}
            </div>
          </div>
        {:else}
          <div class="flex flex-col items-center justify-center py-20 bg-surface-container-low/20 border border-outline-variant/10 rounded-[2.5rem] text-center">
            <Papicon icon="Info" size={32} class="text-on-surface-variant/20 mb-3" />
            <p class="text-sm text-on-surface-variant/60 font-medium">Aucun déclencheur enregistré.</p>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<!-- Modal Creation / Edition -->
{#if showModal}
  <div class="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4" transition:fade={{ duration: 150 }}>
    <!-- Modal container -->
    <div class="bg-surface-container-low/95 border border-outline-variant/20 max-w-2xl w-full rounded-[2.5rem] p-8 space-y-6 shadow-2xl relative max-h-[92vh] overflow-y-auto" transition:scale={{ start: 0.97, duration: 150 }}>
      
      <!-- Close button -->
      <button 
        onclick={() => showModal = false}
        class="absolute top-6 right-6 p-2 rounded-full bg-surface-container-high/40 hover:bg-rose-500/15 hover:text-rose-500 text-on-surface-variant transition-colors cursor-pointer"
        title="Fermer"
      >
        <Papicon icon="Cross" size={20} />
      </button>

      <!-- Modal Header -->
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-inner">
          <Papicon icon={isEditing ? 'Edit' : 'Add'} size={24} />
        </div>
        <div>
          <h3 class="text-2xl font-black tracking-tight">{isEditing ? 'Modifier le déclencheur' : 'Ajouter un déclencheur'}</h3>
          <p class="text-xs text-on-surface-variant/80 font-medium">Configurez le mot-clé et les actions à exécuter.</p>
        </div>
      </div>

      <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-5 pt-2">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="space-y-1.5">
            <label for="modal-trigger" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Mot-clé / Déclencheur</label>
            <input 
              id="modal-trigger"
              type="text" 
              bind:value={formTrigger} 
              placeholder="Ex: !ip ou bonjour"
              class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
              required
              disabled={!canManageSettings}
            />
          </div>

          <div class="space-y-1.5">
            <label for="modal-matchType" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Type de correspondance</label>
            <select 
              id="modal-matchType"
              bind:value={formMatchType}
              class="w-full bg-surface-container-high/45 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/30 transition-all focus:outline-none cursor-pointer"
              disabled={!canManageSettings}
            >
              <option value="CONTAINS">Contient le mot-clé</option>
              <option value="EXACT">Correspondance exacte</option>
              <option value="REGEX">Expression régulière (Regex)</option>
            </select>
          </div>
        </div>

        <div class="space-y-1.5">
          <label for="modal-response" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Réponse du Bot (Optionnelle)</label>
          <textarea 
            id="modal-response"
            bind:value={formResponse} 
            placeholder="Texte à renvoyer automatiquement par le bot..."
            class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none h-24 resize-none"
            disabled={!canManageSettings}
          ></textarea>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="space-y-1.5">
            <label for="modal-roleIdToAdd" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Rôle à ajouter (Optionnel)</label>
            <SearchableSelect 
              id="modal-roleIdToAdd"
              bind:value={formRoleIdToAdd}
              options={availableRoles.map(r => ({ id: r.id, name: `@${r.name}` }))}
              placeholder="— Aucun rôle —"
              className="w-full rounded-2xl bg-surface-container-high/40 border border-outline-variant/10 px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/30 transition-all"
              disabled={!canManageSettings}
            />
          </div>

          <div class="space-y-1.5">
            <label for="modal-roleIdToRemove" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Rôle à retirer (Optionnel)</label>
            <SearchableSelect 
              id="modal-roleIdToRemove"
              bind:value={formRoleIdToRemove}
              options={availableRoles.map(r => ({ id: r.id, name: `@${r.name}` }))}
              placeholder="— Aucun rôle —"
              className="w-full rounded-2xl bg-surface-container-high/40 border border-outline-variant/10 px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/30 transition-all"
              disabled={!canManageSettings}
            />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="flex items-center justify-between p-4 rounded-2xl bg-surface-container-high/20 border border-outline-variant/5">
            <div>
              <p class="text-sm font-bold">Supprimer le message</p>
              <p class="text-[10px] text-on-surface-variant/50">Supprime le message de l'utilisateur</p>
            </div>
            <ToggleSwitch 
              checked={formDeleteTrigger} 
              onToggle={(v: boolean) => formDeleteTrigger = v} 
              disabled={!canManageSettings}
            />
          </div>

          <div class="flex items-center justify-between p-4 rounded-2xl bg-surface-container-high/20 border border-outline-variant/5">
            <div>
              <p class="text-sm font-bold">Activer le déclencheur</p>
              <p class="text-[10px] text-on-surface-variant/50">Actif dès l'enregistrement</p>
            </div>
            <ToggleSwitch 
              checked={formEnabled} 
              onToggle={(v: boolean) => formEnabled = v} 
              disabled={!canManageSettings}
            />
          </div>
        </div>

        <!-- ── Filtres avancés ──────────────────────────────────────────── -->
        <div class="space-y-4 pt-1 border-t border-outline-variant/10">
          <p class="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest ml-1 mt-3">Filtres de déclenchement <span class="normal-case font-normal text-on-surface-variant/30">(optionnel)</span></p>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <!-- Rôles autorisés -->
            <div class="space-y-1.5">
              <label class="text-[10px] font-bold text-violet-400/80 ml-1 uppercase tracking-widest flex items-center gap-1.5">
                <Papicon icon="Shield" size={11} /> Rôles autorisés
                <span class="text-on-surface-variant/30 normal-case font-normal">— vide = tous</span>
              </label>
              <MultiSelect
                id="filter-allowed-roles"
                bind:values={formAllowedRoleIds}
                options={availableRoles.map(r => ({ id: r.id, name: `@${r.name}` }))}
                placeholder="Rechercher un rôle…"
                accentClass="bg-violet-500/20 text-violet-300 border-violet-500/40"
                disabled={!canManageSettings}
              />
            </div>

            <!-- Rôles interdits -->
            <div class="space-y-1.5">
              <label class="text-[10px] font-bold text-rose-400/80 ml-1 uppercase tracking-widest flex items-center gap-1.5">
                <Papicon icon="Block" size={11} /> Rôles interdits
              </label>
              <MultiSelect
                id="filter-banned-roles"
                bind:values={formBannedRoleIds}
                options={availableRoles.map(r => ({ id: r.id, name: `@${r.name}` }))}
                placeholder="Rechercher un rôle…"
                accentClass="bg-rose-500/20 text-rose-300 border-rose-500/40"
                disabled={!canManageSettings}
              />
            </div>

            <!-- Salons autorisés -->
            <div class="space-y-1.5">
              <label class="text-[10px] font-bold text-sky-400/80 ml-1 uppercase tracking-widest flex items-center gap-1.5">
                <Papicon icon="Hash" size={11} /> Salons autorisés
                <span class="text-on-surface-variant/30 normal-case font-normal">— vide = tous</span>
              </label>
              <MultiSelect
                id="filter-allowed-channels"
                bind:values={formAllowedChannelIds}
                options={availableChannels.map(c => ({ id: c.id, name: `#${c.name}` }))}
                placeholder="Rechercher un salon…"
                accentClass="bg-sky-500/20 text-sky-300 border-sky-500/40"
                disabled={!canManageSettings}
              />
            </div>

            <!-- Salons interdits -->
            <div class="space-y-1.5">
              <label class="text-[10px] font-bold text-orange-400/80 ml-1 uppercase tracking-widest flex items-center gap-1.5">
                <Papicon icon="Block" size={11} /> Salons interdits
              </label>
              <MultiSelect
                id="filter-banned-channels"
                bind:values={formBannedChannelIds}
                options={availableChannels.map(c => ({ id: c.id, name: `#${c.name}` }))}
                placeholder="Rechercher un salon…"
                accentClass="bg-orange-500/20 text-orange-300 border-orange-500/40"
                disabled={!canManageSettings}
              />
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-3 pt-4 border-t border-outline-variant/10">
          <button 
            type="button"
            onclick={() => showModal = false}
            class="px-6 py-3 bg-outline-variant/20 hover:bg-outline-variant/30 text-on-surface text-xs font-black uppercase tracking-wider rounded-2xl transition-all cursor-pointer"
          >
            Annuler
          </button>
          {#if canManageSettings}
            <button 
              type="submit"
              class="px-8 py-3 bg-primary text-on-primary font-black uppercase tracking-widest text-xs rounded-2xl shadow-lg shadow-primary/20 hover:scale-[1.03] transition-all cursor-pointer"
            >
              Enregistrer
            </button>
          {/if}
        </div>
      </form>
    </div>
  </div>
{/if}
