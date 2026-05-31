<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import SearchableSelect from '../lib/components/SearchableSelect.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';
  import { fetchReactionRoleMenus, createReactionRoleMenu, deleteReactionRoleMenu } from '../lib/api';

  const actionState = createAsyncActionState();
  let loading = $state(false);

  const canManageSettings = $derived(
    !!dashboardStore.state.featureAccess?.reaction_roles?.canConfigure
      || !!dashboardStore.state.access?.canManageSettings
  );

  const availableChannels = $derived(dashboardStore.state.discordChannels || []);
  const availableRoles = $derived(dashboardStore.state.discordRoles || []);

  let menus = $state<Array<{
    id: string;
    channelId: string;
    messageId: string | null;
    title: string;
    options: any; // Array of { emoji?: string; label: string; roleId: string }
    createdAt: string;
  }>>([]);

  // Create form states
  let newTitle = $state('');
  let newChannelId = $state('');
  let panelOptions = $state<Array<{ emoji: string; label: string; roleId: string }>>([
    { emoji: '', label: '', roleId: '' }
  ]);

  onMount(async () => {
    loading = true;
    try {
      await dashboardStore.refresh();
      const res = await fetchReactionRoleMenus();
      if (res && res.menus) {
        menus = res.menus;
      }
    } catch (err) {
      console.error(err);
    } finally {
      loading = false;
    }
  });

  function addOption() {
    if (panelOptions.length >= 20) return; // Discord button row limit is 5 per row, max 5 rows (25 total), keep 20 for safety
    panelOptions = [...panelOptions, { emoji: '', label: '', roleId: '' }];
  }

  function removeOption(idx: number) {
    if (panelOptions.length === 1) return;
    panelOptions = panelOptions.filter((_, i) => i !== idx);
  }

  async function handleDeploy() {
    if (!canManageSettings || !newTitle || !newChannelId || panelOptions.length === 0) return;
    
    // Validate options
    const invalidOpt = panelOptions.some(o => !o.label || !o.roleId);
    if (invalidOpt) {
      actionState.setError('Tous les boutons doivent avoir un libellé et un rôle.');
      return;
    }

    await actionState.run(async () => {
      const res = await createReactionRoleMenu({
        title: newTitle,
        channelId: newChannelId,
        options: panelOptions
      });

      if (!res || !res.menu) throw new Error('Erreur de déploiement');
      menus = [res.menu, ...menus];
      newTitle = '';
      newChannelId = '';
      panelOptions = [{ emoji: '', label: '', roleId: '' }];
      return true;
    }, { successMessage: 'Menu de rôles déployé sur Discord !' });
  }

  async function handleDelete(id: string) {
    if (!canManageSettings) return;
    if (!confirm('Supprimer ce menu de rôles du dashboard ? (Le message Discord ne sera pas supprimé automatiquement)')) return;
    await actionState.run(async () => {
      const ok = await deleteReactionRoleMenu(id);
      if (!ok) throw new Error('Erreur de suppression');
      menus = menus.filter(m => m.id !== id);
      return true;
    }, { successMessage: 'Menu de rôles supprimé du dashboard.' });
  }

  function getChannelName(channelId: string) {
    const channel = availableChannels.find(c => c.id === channelId);
    return channel ? `#${channel.name}` : `Salon inconnu (${channelId})`;
  }

  function getRoleName(roleId: string) {
    const role = availableRoles.find(r => r.id === roleId);
    return role ? `@${role.name}` : `Rôle inconnu (${roleId})`;
  }
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
  <header class="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-surface-container-low/40 backdrop-blur-3xl p-8 rounded-4xl border border-outline-variant/30">
    <div class="flex items-center gap-6">
      <div class="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-inner">
        <Papicon icon="MousePointer" size={32} />
      </div>
      <div>
        <h1 class="text-3xl font-black tracking-tight leading-tight">Reaction Roles</h1>
        <p class="text-on-surface-variant/80 font-medium">Déployez des messages contenant des boutons interactifs pour attribuer des rôles aux membres.</p>
      </div>
    </div>
  </header>

  <InlineFeedback state={actionState} />

  {#if loading}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <Skeleton height="550px" radius="2.5rem" />
      <div class="lg:col-span-2 space-y-4">
        <Skeleton height="150px" radius="2rem" />
        <Skeleton height="150px" radius="2rem" />
      </div>
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <!-- Create Panel -->
      <section class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-6 h-fit">
        <h3 class="text-xl font-black flex items-center gap-3">
          <Papicon icon="Add" size={20} class="text-primary" />
          Déployer un Panel
        </h3>

        <form onsubmit={(e) => { e.preventDefault(); handleDeploy(); }} class="space-y-5">
          <div class="space-y-1.5">
            <label for="title" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Titre du Panel / Message</label>
            <input 
              id="title"
              type="text" 
              bind:value={newTitle} 
              placeholder="Ex: Sélectionnez vos rôles de notification"
              class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
              required
              disabled={!canManageSettings}
            />
          </div>

          <div class="space-y-1.5">
            <label for="channel" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Salon de destination</label>
            <SearchableSelect 
              id="channel"
              bind:value={newChannelId} 
              options={availableChannels.map(c => ({ id: c.id, name: `#${c.name}` }))} 
              placeholder="Sélectionner le salon" 
              className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all"
              disabled={!canManageSettings}
            />
          </div>

          <!-- Buttons configuration list -->
          <div class="space-y-3 pt-2">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Options / Rôles ({panelOptions.length})</span>
              <button 
                type="button" 
                onclick={addOption} 
                disabled={panelOptions.length >= 20 || !canManageSettings}
                class="text-xs font-bold text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
              >
                <Papicon icon="Plus" size={14} /> Ajouter
              </button>
            </div>

            <div class="space-y-3 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin">
              {#each panelOptions as opt, idx}
                <div class="p-4 rounded-2xl bg-surface-container-high/20 border border-outline-variant/5 space-y-3 relative group">
                  <div class="flex items-center gap-2">
                    <div class="w-16 space-y-1">
                      <label for={`emoji-${idx}`} class="text-[8px] font-bold text-on-surface-variant/50 ml-1 uppercase">Émoji</label>
                      <input 
                        id={`emoji-${idx}`}
                        type="text" 
                        bind:value={opt.emoji} 
                        placeholder="📢" 
                        class="w-full text-center bg-surface-container-high/40 border border-outline-variant/10 rounded-xl px-2 py-1.5 text-sm focus:outline-none"
                        disabled={!canManageSettings}
                      />
                    </div>
                    <div class="flex-1 space-y-1">
                      <label for={`label-${idx}`} class="text-[8px] font-bold text-on-surface-variant/50 ml-1 uppercase">Texte du bouton</label>
                      <input 
                        id={`label-${idx}`}
                        type="text" 
                        bind:value={opt.label} 
                        placeholder="Annonces" 
                        class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-xl px-3 py-1.5 text-sm focus:outline-none"
                        required
                        disabled={!canManageSettings}
                      />
                    </div>
                    {#if panelOptions.length > 1 && canManageSettings}
                      <button 
                        type="button"
                        onclick={() => removeOption(idx)}
                        class="self-end p-2 text-error hover:bg-error/10 rounded-lg transition-colors"
                        title="Retirer l'option"
                      >
                        <Papicon icon="Minus" size={14} />
                      </button>
                    {/if}
                  </div>

                  <div class="space-y-1">
                    <label for={`role-${idx}`} class="text-[8px] font-bold text-on-surface-variant/50 ml-1 uppercase">Rôle à attribuer</label>
                    <SearchableSelect 
                      id={`role-${idx}`}
                      bind:value={opt.roleId} 
                      options={availableRoles.map(r => ({ id: r.id, name: `@${r.name}` }))} 
                      placeholder="Choisir le rôle" 
                      className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-primary/20 transition-all"
                      disabled={!canManageSettings}
                    />
                  </div>
                </div>
              {/each}
            </div>
          </div>

          {#if canManageSettings}
            <button 
              type="submit"
              class="w-full py-4 mt-2 bg-primary text-on-primary font-black uppercase tracking-widest text-xs rounded-2xl shadow-lg shadow-primary/20 hover:scale-105 transition-all"
            >
              Déployer le Panel
            </button>
          {/if}
        </form>
      </section>

      <!-- Active Panels list -->
      <section class="lg:col-span-2 space-y-6">
        <h3 class="text-xl font-black flex items-center gap-3">
          <Papicon icon="List" size={20} class="text-secondary" />
          Panels Déployés ({menus.length})
        </h3>

        <div class="space-y-4">
          {#each menus as menu}
            <div class="bg-surface-container-low/30 border border-outline-variant/10 p-6 rounded-3xl space-y-4 hover:bg-surface-container-low/50 transition-all">
              <div class="flex items-start justify-between gap-6">
                <div class="space-y-1">
                  <h4 class="text-lg font-black text-on-surface">{menu.title}</h4>
                  <div class="flex items-center gap-3 text-xs text-on-surface-variant/60 font-semibold">
                    <span>Salon : {getChannelName(menu.channelId)}</span>
                    {#if menu.messageId}
                      <span>Message ID : {menu.messageId}</span>
                    {/if}
                  </div>
                </div>

                {#if canManageSettings}
                  <button 
                    onclick={() => handleDelete(menu.id)}
                    class="p-2.5 text-error hover:bg-error/10 border border-transparent rounded-xl transition-all"
                    title="Supprimer du dashboard"
                  >
                    <Papicon icon="Trash" size={18} />
                  </button>
                {/if}
              </div>

              <!-- Buttons listing -->
              <div class="flex flex-wrap gap-2 pt-2 border-t border-outline-variant/10">
                {#if Array.isArray(menu.options)}
                  {#each menu.options as opt}
                    <div class="flex items-center gap-2 px-3 py-1.5 bg-surface-container/60 border border-outline-variant/10 rounded-xl text-xs font-bold text-on-surface-variant">
                      {#if opt.emoji}<span>{opt.emoji}</span>{/if}
                      <span>{opt.label}</span>
                      <span class="text-primary font-bold">→ {getRoleName(opt.roleId)}</span>
                    </div>
                  {/each}
                {:else}
                  <p class="text-xs text-on-surface-variant/40 italic">Options de rôles invalides ou vides.</p>
                {/if}
              </div>
            </div>
          {:else}
            <div class="flex flex-col items-center justify-center py-20 bg-surface-container-low/20 border border-outline-variant/10 rounded-[2.5rem] text-center">
              <Papicon icon="Info" size={32} class="text-on-surface-variant/20 mb-3" />
              <p class="text-sm text-on-surface-variant/60 font-medium">Aucun menu de rôles déployé pour le moment.</p>
            </div>
          {/each}
        </div>
      </section>
    </div>
  {/if}
</div>
