<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { API_BASE_URL } from '../lib/api';
  import MemberCaseModal from '../lib/components/MemberCaseModal.svelte';
  import MetricCard from '../lib/components/MetricCard.svelte';

  let members = $state<any[]>([]);
  let searchQuery = $state('');
  let loadingSearch = $state(false);
  let totalFound = $state(0);

  // For MemberCaseModal
  let modalOpen = $state(false);
  let selectedUserId = $state<string | null>(null);
  let selectedUserName = $state('');
  let caseData = $state<any>(null);
  let loadingCase = $state(false);
  let caseError = $state('');

  async function search(q = '') {
    if (!authStore.selectedGuildId) return;
    loadingSearch = true;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/members/search?q=${encodeURIComponent(q)}&limit=24`, {
        headers: {
          'Authorization': `Bearer ${authStore.token}`
        }
      });
      if (!res.ok) throw new Error('Erreur de recherche');
      const data = await res.json();
      members = data.members || [];
      totalFound = members.length;
    } catch (err) {
      console.error(err);
    } finally {
      loadingSearch = false;
    }
  }

  let searchTimeout: any;
  function handleSearchInput() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      search(searchQuery);
    }, 500);
  }

  async function openMemberCase(member: any) {
    selectedUserId = member.id;
    selectedUserName = member.displayName || member.username;
    modalOpen = true;
    loadingCase = true;
    caseError = '';
    caseData = null;

    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/staff/member-case/${member.id}`, {
        headers: {
          'Authorization': `Bearer ${authStore.token}`
        }
      });
      if (!res.ok) throw new Error('Impossible de charger le dossier');
      caseData = await res.json();
    } catch (err: any) {
      caseError = err.message;
    } finally {
      loadingCase = false;
    }
  }

  onMount(() => {
    search();
  });

  function formatDate(date: string | null) {
    if (!date) return 'Jamais';
    return new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }
</script>

<div class="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000">
  
  <!-- Header & Search -->
  <div class="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
    <div>
      <h2 class="text-3xl font-black text-on-surface tracking-tighter font-headline">Membres du serveur</h2>
      <p class="text-sm text-on-surface-variant/60 font-medium">Rechercher et gérer les profils des utilisateurs</p>
    </div>

    <div class="relative w-full md:w-96 group">
      <div class="absolute inset-y-0 left-4 flex items-center pointer-events-none text-on-surface-variant/40 group-focus-within:text-primary transition-colors">
        <span class="material-symbols-outlined">search</span>
      </div>
      <input
        type="text"
        placeholder="Rechercher par nom, tag ou ID..."
        bind:value={searchQuery}
        oninput={handleSearchInput}
        class="w-full bg-surface-container-low/50 border border-outline-variant/20 rounded-2xl py-3.5 pl-12 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:outline-hidden focus:border-primary/50 focus:bg-surface-container transition-all shadow-sm"
      />
      {#if loadingSearch}
        <div class="absolute inset-y-0 right-4 flex items-center">
          <span class="material-symbols-outlined animate-spin text-primary/40 text-sm">progress_activity</span>
        </div>
      {/if}
    </div>
  </div>

  <!-- Content -->
  {#if loadingSearch && members.length === 0}
     <div class="flex flex-col items-center justify-center py-32 text-on-surface-variant/20">
        <span class="material-symbols-outlined text-6xl animate-spin">progress_activity</span>
        <p class="mt-4 text-xs font-black uppercase tracking-[0.3em]">Initialisation de l'annuaire</p>
     </div>
  {:else if members.length === 0}
     <div class="flex flex-col items-center justify-center py-32 text-on-surface-variant/30 border-2 border-dashed border-outline-variant/10 rounded-[3rem]">
        <div class="w-20 h-20 rounded-4xl bg-surface-container flex items-center justify-center mb-6">
          <span class="material-symbols-outlined text-4xl">person_search</span>
        </div>
        <h3 class="text-xl font-black tracking-tight text-on-surface/50">Aucun membre trouvé</h3>
        <p class="mt-2 text-sm max-w-xs text-center">Affinez votre recherche ou vérifiez l'orthographe.</p>
     </div>
  {:else}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {#each members as member (member.id)}
        <button
          onclick={() => openMemberCase(member)}
          class="group relative flex flex-col p-6 rounded-[2.5rem] bg-surface-container-low/40 border border-outline-variant/10 hover:border-primary/30 hover:bg-surface-container-low hover:shadow-2xl hover:shadow-primary/5 transition-all duration-500 text-left"
        >
          <!-- Background accent -->
          <div class="absolute inset-0 bg-linear-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-[2.5rem]"></div>
          
          <div class="relative flex items-center gap-4 mb-6">
            <div class="relative">
              <div class="w-14 h-14 rounded-2xl overflow-hidden border-2 border-outline-variant/20 group-hover:border-primary/50 transition-all shadow-lg">
                <img src={member.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'} alt="Avatar" class="w-full h-full object-cover" />
              </div>
              {#if member.isBot}
                <div class="absolute -bottom-1 -right-1 bg-primary text-white text-[8px] font-black px-1.5 py-0.5 rounded-lg shadow-sm border border-surface-container">BOT</div>
              {/if}
            </div>
            <div class="min-w-0">
              <h4 class="font-black text-on-surface tracking-tight truncate font-headline">{member.displayName}</h4>
              <p class="text-[10px] font-bold text-on-surface-variant/40 tracking-wider font-mono truncate">@{member.username}</p>
            </div>
          </div>

          <div class="relative mt-auto space-y-3">
             <div class="flex items-center justify-between">
                <span class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Dernière vue</span>
                <span class="text-xs font-bold text-on-surface-variant/80">{formatDate(member.lastSeenAt)}</span>
             </div>
             <div class="flex items-center justify-between">
                <span class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">ID</span>
                <span class="text-[10px] font-mono text-on-surface-variant/40">{member.id.substring(0, 12)}...</span>
             </div>
          </div>

          <div class="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
             <span class="material-symbols-outlined text-primary">arrow_forward</span>
          </div>
        </button>
      {/each}
    </div>
  {/if}

  <!-- Total counter -->
  {#if members.length > 0}
    <div class="flex justify-center pt-6">
      <div class="px-6 py-2 rounded-full bg-surface-container/50 border border-outline-variant/10 text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant/40">
        {totalFound} Membres affichés
      </div>
    </div>
  {/if}
</div>

<!-- Dossier Modal -->
<MemberCaseModal
  open={modalOpen}
  userId={selectedUserId}
  userName={selectedUserName}
  {caseData}
  loading={loadingCase}
  error={caseError}
  onClose={() => modalOpen = false}
/>
