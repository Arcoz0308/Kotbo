<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { fetchLinkedAccounts, updateLinkedAccountStatus, deleteLinkedAccount, fetchMemberCase, fetchFeatureConfigurations, updateFeatureConfiguration } from '../lib/api';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import MemberCaseModal from '../lib/components/MemberCaseModal.svelte';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import RolePermissionSettings from '../lib/components/RolePermissionSettings.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';

  let linkedAccounts = $state<any[]>([]);
  let loading = $state(true);
  let error = $state('');
  let filterStatus = $state<'ALL' | 'PENDING' | 'VALIDATED' | 'REJECTED'>('ALL');

  let modalOpen = $state(false);
  let selectedUserId = $state<string | null>(null);
  let selectedUserName = $state('');
  let caseData = $state<any>(null);
  let loadingCase = $state(false);
  let caseError = $state('');

  let doubleAccountsConfig = $state<any>(null);
  let loadingConfig = $state(false);
  const saveAction = createAsyncActionState();

  const filteredAccounts = $derived(
    Array.isArray(linkedAccounts) 
      ? (filterStatus === 'ALL' 
          ? linkedAccounts 
          : linkedAccounts.filter(a => a.status === filterStatus))
      : []
  );

  async function loadData() {
    loading = true;
    error = '';
    try {
      linkedAccounts = await fetchLinkedAccounts();
    } catch (err: any) {
      error = err.message || 'Erreur lors du chargement des comptes liés';
    } finally {
      loading = false;
    }
  }

  async function loadConfig() {
    loadingConfig = true;
    try {
      const configs = await fetchFeatureConfigurations();
      doubleAccountsConfig = configs?.features?.find((c: any) => c.featureKey === 'double_accounts') || null;
    } catch (err) {
      console.error('Error fetching double accounts config:', err);
    } finally {
      loadingConfig = false;
    }
  }

  async function handleUpdateStatus(id: string, status: 'VALIDATED' | 'REJECTED') {
    await saveAction.run(async () => {
      const updated = await updateLinkedAccountStatus(id, status);
      if (!updated) return false;
      await loadData();
      return true;
    }, { successMessage: 'Statut mis à jour.' });
  }

  async function handleDelete(id: string) {
    if (!confirm('Voulez-vous vraiment supprimer cette liaison ?')) return;
    await saveAction.run(async () => {
      const success = await deleteLinkedAccount(id);
      if (!success) return false;
      linkedAccounts = linkedAccounts.filter(a => a.id !== id);
      return true;
    }, { successMessage: 'Liaison supprimée.' });
  }

  async function openMemberCase(userId: string, userName?: string) {
    selectedUserId = userId;
    selectedUserName = userName || 'Membre';
    modalOpen = true;
    loadingCase = true;
    caseData = null;
    caseError = '';
    try {
      caseData = await fetchMemberCase(userId);
    } catch (err: any) {
      caseError = err.message || 'Erreur chargement dossier';
    } finally {
      loadingCase = false;
    }
  }

  onMount(() => {
    loadData();
    loadConfig();
  });
</script>

<ModulePage 
  title="Doubles Comptes" 
  description="Gérez les liaisons entre comptes et validez les déclarations." 
  icon="users"
  featureKey="double_accounts"
>
  {#if doubleAccountsConfig}
    <div class="bg-surface-container-low/30 p-8 rounded-[2.5rem] border border-outline-variant/10 mb-10 animate-in fade-in duration-500">
      <RolePermissionSettings 
        featureKey="double_accounts" 
        roleAccess={doubleAccountsConfig.roleAccessByRole} 
      />
    </div>
  {/if}

  {#snippet actions()}
    <RefreshButton onClick={loadData} loading={loading} label="Actualiser" />
  {/snippet}

  <div class="flex flex-wrap items-center justify-between gap-4 mb-8">
    <div class="flex flex-wrap items-center gap-2 rounded-2xl border border-outline-variant/10 bg-surface-container-low/70 p-1 w-fit">
      <button
        onclick={() => filterStatus = 'ALL'}
        class={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${filterStatus === 'ALL' ? 'bg-surface text-primary shadow-xs' : 'text-on-surface-variant/60 hover:text-on-surface'}`}
      >
        Tous
      </button>
      <button
        onclick={() => filterStatus = 'PENDING'}
        class={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${filterStatus === 'PENDING' ? 'bg-surface text-amber-500 shadow-xs' : 'text-on-surface-variant/60 hover:text-on-surface'}`}
      >
        En attente
      </button>
      <button
        onclick={() => filterStatus = 'VALIDATED'}
        class={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${filterStatus === 'VALIDATED' ? 'bg-surface text-emerald-500 shadow-xs' : 'text-on-surface-variant/60 hover:text-on-surface'}`}
      >
        Validés
      </button>
      <button
        onclick={() => filterStatus = 'REJECTED'}
        class={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${filterStatus === 'REJECTED' ? 'bg-surface text-rose-500 shadow-xs' : 'text-on-surface-variant/60 hover:text-on-surface'}`}
      >
        Rejetés
      </button>
    </div>

    {#if saveAction.state.message}
      <p class="text-xs font-bold text-emerald-600 animate-in fade-in duration-300">{saveAction.state.message}</p>
    {/if}
  </div>

  {#if loading}
    <div class="flex flex-col items-center justify-center py-24 gap-4">
      <div class="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      <p class="text-sm font-bold text-on-surface-variant/60">Chargement des données...</p>
    </div>
  {:else if error}
    <div class="rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-6 text-center">
      <p class="text-rose-500 font-bold">{error}</p>
      <button onclick={loadData} class="mt-4 text-xs font-black uppercase tracking-widest text-primary">Réessayer</button>
    </div>
  {:else if filteredAccounts.length === 0}
    <div class="flex flex-col items-center justify-center py-24 text-center">
      <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-container-low text-on-surface-variant/20">
        <Papicon icon="link-2-off" size={32} />
      </div>
      <h3 class="mt-6 text-xl font-bold text-on-surface">Aucune liaison trouvée</h3>
      <p class="mt-2 text-sm text-on-surface-variant/50 max-w-xs">
        {filterStatus === 'ALL' ? 'Aucun compte n’est actuellement lié sur ce serveur.' : `Aucune liaison avec le statut "${filterStatus}" n’a été trouvée.`}
      </p>
    </div>
  {:else}
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {#each filteredAccounts as link (link.id)}
        <div class="group relative rounded-3xl border border-outline-variant/10 bg-surface-container-low/40 p-5 transition-all duration-300 hover:border-primary/20 hover:bg-surface-container-low">
          <div class="flex items-center justify-between mb-4">
             <span class={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest 
                ${link.status === 'VALIDATED' ? 'bg-emerald-500/10 text-emerald-500' : 
                  link.status === 'PENDING' ? 'bg-amber-500/10 text-amber-500' : 'bg-rose-500/10 text-rose-500'}`}>
               {link.status}
             </span>
             <span class="text-[9px] font-bold text-on-surface-variant/30">{new Date(link.createdAt).toLocaleDateString('fr-FR')}</span>
          </div>

          <div class="flex items-center gap-3 bg-surface-container-low/50 rounded-2xl p-3 mb-4">
             <div class="flex-1 min-w-0">
                <button 
                  onclick={() => openMemberCase(link.user1Id, link.user1.tag)} 
                  class="flex items-center gap-2 text-sm font-black text-on-surface hover:text-primary transition-colors truncate w-full text-left"
                >
                  {#if link.user1.avatar}
                    <img src={link.user1.avatar} alt="" class="w-5 h-5 rounded-full shrink-0" />
                  {/if}
                  <span class="truncate">@{link.user1.tag}</span>
                </button>
             </div>
             <Papicon icon="link-2" size={14} class="text-on-surface-variant/20 shrink-0" />
             <div class="flex-1 min-w-0">
                <button 
                  onclick={() => openMemberCase(link.user2Id, link.user2.tag)} 
                  class="flex items-center justify-end gap-2 text-sm font-black text-on-surface hover:text-primary transition-colors truncate w-full text-right"
                >
                  <span class="truncate">@{link.user2.tag}</span>
                  {#if link.user2.avatar}
                    <img src={link.user2.avatar} alt="" class="w-5 h-5 rounded-full shrink-0" />
                  {/if}
                </button>
             </div>
          </div>

          {#if link.reason}
            <div class="mb-6 bg-surface-container-low/20 rounded-xl p-3 border border-outline-variant/5">
              <p class="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/30 mb-1">Raison</p>
              <p class="text-[11px] text-on-surface-variant/70 italic leading-relaxed">"{link.reason}"</p>
            </div>
          {/if}

          <div class="flex items-center gap-2 pt-4 border-t border-outline-variant/5">
            {#if link.status === 'PENDING'}
              <button 
                onclick={() => handleUpdateStatus(link.id, 'VALIDATED')}
                disabled={saveAction.state.loading}
                class="flex-1 py-2 rounded-xl bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Papicon icon="check" size={12} />
                Valider
              </button>
              <button 
                onclick={() => handleUpdateStatus(link.id, 'REJECTED')}
                disabled={saveAction.state.loading}
                class="flex-1 py-2 rounded-xl bg-rose-500/10 text-rose-500 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Papicon icon="x" size={12} />
                Rejeter
              </button>
            {:else}
              <div class="flex-1 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/20 italic">
                {link.type}
              </div>
              <button 
                onclick={() => handleDelete(link.id)}
                disabled={saveAction.state.loading}
                class="p-2 rounded-xl text-rose-500 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                title="Supprimer la liaison"
              >
                <Papicon icon="trash-2" size={16} />
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</ModulePage>

<MemberCaseModal
  open={modalOpen}
  userId={selectedUserId}
  userName={selectedUserName}
  {caseData}
  loading={loadingCase}
  error={caseError}
  onClose={() => modalOpen = false}
  onSelectUser={(newUserId) => {
    const foundNode = caseData?.interactionGraph?.nodes?.find((n: any) => n.id === newUserId);
    const label = foundNode?.label || 'Membre';
    openMemberCase(newUserId, label);
  }}
/>
