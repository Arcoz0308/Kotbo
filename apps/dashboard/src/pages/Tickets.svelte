<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import { 
    API_BASE_URL,
    fetchMemberCase,
    runMemberCaseAction
  } from '../lib/api';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import FormTextarea from '../lib/components/FormTextarea.svelte';
  import FormSelect from '../lib/components/FormSelect.svelte';
  import FormColorPicker from '../lib/components/FormColorPicker.svelte';
  import SearchableSelect from '../lib/components/SearchableSelect.svelte';
  import MemberCaseModal from '../lib/components/MemberCaseModal.svelte';

  // Navigation & Tabs
  let activeTab = $state<'tickets' | 'transcripts' | 'config'>('tickets');
  let ticketFilter = $state<'ALL' | 'OPEN' | 'CLAIMED' | 'CLOSED'>('ALL');
  
  // Data State
  let tickets = $state<any[]>([]);
  let transcripts = $state<any[]>([]);
  let config = $state<any>({});
  let selectedTicketId = $state<string | null>(null);
  let selectedTicketDetail = $state<any>(null);
  let messages = $state<any[]>([]);
  
  // Loading & Error State
  let loading = $state(true);
  let loadingDetail = $state(false);
  let error = $state('');
  
  // Forms & Actions State
  let chatInput = $state('');
  let closeReason = $state('');
  let ticketRenameName = $state('');
  let showCloseModal = $state(false);
  let showDeleteConfirmModal = $state(false);
  let chatScrollContainer = $state<HTMLDivElement | null>(null);
  let wsListener = $state<((e: any) => void) | null>(null);
  
  // Configuration Bindings
  let ticketCategoryId = $state('');
  let ticketLogChannelId = $state('');
  let ticketStaffRoleId = $state('');
  let ticketChannelId = $state('');
  let ticketEmbedTitle = $state('');
  let ticketEmbedDesc = $state('');
  let ticketEmbedButtonText = $state('');
  let ticketEmbedColor = $state('');
  let ticketAllowOverclaim = $state(true);
  let ticketOverclaimPermission = $state('ANY');
  let ticketTypes = $state<Array<{
    id: string;
    label: string;
    description: string;
    emoji: string;
    categoryId: string;
    staffRoleId: string;
    buttonStyle: 'PRIMARY' | 'SECONDARY' | 'SUCCESS' | 'DANGER';
  }>>([]);

  // Member Case Modal Integration
  let caseModalOpen = $state(false);
  let selectedCaseUser = $state<{ name: string; id: string | null } | null>(null);
  let selectedCaseData = $state<any>(null);
  let selectedCaseLoading = $state(false);
  let selectedCaseError = $state('');
  let memberActionReason = $state('Action lancée depuis le panel de Tickets.');
  let memberActionDuration = $state('30m');
  let memberActionBusy = $state(false);
  let memberActionFeedback = $state('');
  let memberActionIsError = $state(false);

  // Derived values from Dashboard Store
  const discordChannels = $derived(dashboardStore.state.discordChannels || []);
  const discordCategories = $derived(dashboardStore.state.discordCategories || []);
  const discordRoles = $derived(dashboardStore.state.discordRoles || []);

  const saveAction = createAsyncActionState();
  const sendEmbedAction = createAsyncActionState();
  const renameAction = createAsyncActionState();

  function createTicketTypeDraft(index = 0, legacy?: any) {
    return {
      id: legacy?.ticketTypeId || crypto.randomUUID(),
      label: legacy?.ticketEmbedButtonText || `Ticket ${index + 1}`,
      description: legacy?.ticketEmbedDesc || '',
      emoji: '📩',
      categoryId: legacy?.ticketCategoryId || ticketCategoryId || '',
      staffRoleId: legacy?.ticketStaffRoleId || ticketStaffRoleId || '',
      buttonStyle: 'PRIMARY' as const,
    };
  }

  function normalizeTicketTypes(config: any): Array<{
    id: string;
    label: string;
    description: string;
    emoji: string;
    categoryId: string;
    staffRoleId: string;
    buttonStyle: 'PRIMARY' | 'SECONDARY' | 'SUCCESS' | 'DANGER';
  }> {
    if (Array.isArray(config?.ticketTypes) && config.ticketTypes.length > 0) {
      return config.ticketTypes
        .filter((item) => item && typeof item === 'object')
        .map((item, index) => ({
          id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : crypto.randomUUID(),
          label: typeof item.label === 'string' && item.label.trim() ? item.label.trim().slice(0, 80) : `Ticket ${index + 1}`,
          description: typeof item.description === 'string' ? item.description.trim().slice(0, 200) : '',
          emoji: typeof item.emoji === 'string' && item.emoji.trim() ? item.emoji.trim().slice(0, 16) : '📩',
          categoryId: typeof item.categoryId === 'string' ? item.categoryId : '',
          staffRoleId: typeof item.staffRoleId === 'string' ? item.staffRoleId : '',
          buttonStyle: item.buttonStyle === 'SECONDARY' || item.buttonStyle === 'SUCCESS' || item.buttonStyle === 'DANGER'
            ? item.buttonStyle
            : 'PRIMARY',
        }));
    }

      return [createTicketTypeDraft(0, config)];
  }

  function addTicketType() {
    ticketTypes = [...ticketTypes, createTicketTypeDraft(ticketTypes.length)];
  }

  function removeTicketType(index: number) {
    ticketTypes = ticketTypes.filter((_, currentIndex) => currentIndex !== index);
    if (ticketTypes.length === 0) {
      ticketTypes = [createTicketTypeDraft(0)];
    }
  }

  // Filters tickets based on status tab
  const filteredTickets = $derived(
    tickets.filter(t => {
      if (ticketFilter === 'ALL') return true;
      return t.status === ticketFilter;
    })
  );

  // Fetch all tickets and config
  async function loadTicketsAndConfig() {
    if (!authStore.selectedGuildId) return;
    loading = true;
    error = '';
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/tickets`, {
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      });
      if (!res.ok) throw new Error('Impossible de charger le système de tickets');
      const data = await res.json();
      tickets = data.tickets || [];
      config = data.config || {};
      
      // Populate config bindings
      ticketCategoryId = config.ticketCategoryId || '';
      ticketLogChannelId = config.ticketLogChannelId || '';
      ticketStaffRoleId = config.ticketStaffRoleId || '';
      ticketChannelId = config.ticketChannelId || '';
      ticketEmbedTitle = config.ticketEmbedTitle || 'Support Technique';
      ticketEmbedDesc = config.ticketEmbedDesc || 'Cliquez sur le bouton ci-dessous pour ouvrir un ticket de support.';
      ticketEmbedButtonText = config.ticketEmbedButtonText || 'Ouvrir un ticket';
      ticketEmbedColor = config.ticketEmbedColor || '#5865F2';
      ticketAllowOverclaim = config.ticketAllowOverclaim !== undefined ? config.ticketAllowOverclaim : true;
      ticketOverclaimPermission = config.ticketOverclaimPermission || 'ANY';
      ticketTypes = normalizeTicketTypes(config);
    } catch (err: any) {
      error = err.message || 'Une erreur est survenue';
    } finally {
      loading = false;
    }
  }

  // Fetch transcripts for this guild
  async function loadTranscripts() {
    if (!authStore.selectedGuildId) return;
    loading = true;
    error = '';
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/tickets/transcripts`, {
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      });
      if (!res.ok) throw new Error('Impossible de charger les transcriptions');
      const data = await res.json();
      transcripts = data.transcripts || [];
    } catch (err: any) {
      error = err.message || 'Une erreur est survenue';
    } finally {
      loading = false;
    }
  }

  async function handleRefresh() {
    if (activeTab === 'transcripts') {
      await loadTranscripts();
    } else {
      await loadTicketsAndConfig();
    }
  }

  // Fetch details & messages for selected ticket
  async function loadTicketDetail(ticketId: string, autoScroll = true) {
    if (!authStore.selectedGuildId) return;
    loadingDetail = true;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/tickets/${ticketId}`, {
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      });
      if (!res.ok) throw new Error('Impossible de charger le détail du ticket');
      const data = await res.json();
      selectedTicketDetail = data.ticket;
      messages = data.messages || [];
      ticketRenameName = data.ticket?.channelName || '';
      
      if (autoScroll) {
        setTimeout(scrollToBottom, 50);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      loadingDetail = false;
    }
  }

  function selectTicket(ticketId: string) {
    selectedTicketId = ticketId;
    void loadTicketDetail(ticketId, true);
  }

  // Scroll chat window to bottom
  function scrollToBottom() {
    if (chatScrollContainer) {
      chatScrollContainer.scrollTop = chatScrollContainer.scrollHeight;
    }
  }

  // Send message from Svelte Panel to Discord
  async function sendMessage() {
    if (!chatInput.trim() || !selectedTicketId || !authStore.selectedGuildId) return;
    const textToSend = chatInput;
    chatInput = '';
    
    // Add locally immediately with a temp ID for high responsiveness
    const tempMsg = {
      id: `temp-${Date.now()}`,
      content: textToSend,
      authorName: authStore.user?.username || 'Staff',
      authorAvatar: authStore.user?.avatarUrl || '',
      isStaff: true,
      createdAt: new Date().toISOString()
    };
    messages = [...messages, tempMsg];
    setTimeout(scrollToBottom, 30);

    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/tickets/${selectedTicketId}/message`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authStore.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: textToSend })
      });
      if (!res.ok) throw new Error('Impossible d\'envoyer le message');
      // Reload actual messages
      await loadTicketDetail(selectedTicketId, false);
    } catch (err: any) {
      alert(err.message || 'Une erreur est survenue');
    }
  }

  // Claim Ticket
  async function claimTicket() {
    if (!selectedTicketId || !authStore.selectedGuildId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/tickets/${selectedTicketId}/claim`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      });
      if (!res.ok) throw new Error('Erreur lors du claim');
      await loadTicketDetail(selectedTicketId, false);
      await loadTicketsAndConfig();
    } catch (err: any) {
      alert(err.message);
    }
  }

  // Close Ticket
  async function closeTicket() {
    if (!selectedTicketId || !authStore.selectedGuildId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/tickets/${selectedTicketId}/close`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authStore.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: closeReason })
      });
      if (!res.ok) throw new Error('Erreur de fermeture');
      showCloseModal = false;
      closeReason = '';
      await loadTicketDetail(selectedTicketId, false);
      await loadTicketsAndConfig();
    } catch (err: any) {
      alert(err.message);
    }
  }

  // Rename Ticket
  async function renameTicket() {
    if (!selectedTicketId || !authStore.selectedGuildId || !ticketRenameName.trim()) return;
    await renameAction.run(async () => {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/tickets/${selectedTicketId}/rename`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authStore.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: ticketRenameName.trim() })
      });
      if (!res.ok) throw new Error('Erreur de renommage');
      const data = await res.json().catch(() => null);
      if (data?.channelName) {
        ticketRenameName = data.channelName;
      }
      await loadTicketDetail(selectedTicketId, false);
      await loadTicketsAndConfig();
      return true;
    }, { successMessage: 'Ticket renommé avec succès !' });
  }

  // Reopen Ticket
  async function reopenTicket() {
    if (!selectedTicketId || !authStore.selectedGuildId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/tickets/${selectedTicketId}/reopen`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      });
      if (!res.ok) throw new Error('Erreur de réouverture');
      await loadTicketDetail(selectedTicketId, false);
      await loadTicketsAndConfig();
    } catch (err: any) {
      alert(err.message);
    }
  }

  // Delete Ticket
  async function deleteTicket() {
    if (!selectedTicketId || !authStore.selectedGuildId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/tickets/${selectedTicketId}/delete`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      });
      if (!res.ok) throw new Error('Erreur de suppression');
      showDeleteConfirmModal = false;
      stopPolling();
      selectedTicketId = null;
      selectedTicketDetail = null;
      messages = [];
      await loadTicketsAndConfig();
    } catch (err: any) {
      alert(err.message);
    }
  }

  // Save Settings Config
  async function saveSettings() {
    await saveAction.run(async () => {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/tickets/config`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${authStore.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ticketCategoryId,
          ticketLogChannelId,
          ticketStaffRoleId,
          ticketChannelId,
          ticketEmbedTitle,
          ticketEmbedDesc,
          ticketEmbedButtonText,
          ticketEmbedColor,
          ticketTypes,
          ticketAllowOverclaim,
          ticketOverclaimPermission
        })
      });
      if (!res.ok) throw new Error('Erreur lors de la sauvegarde');
      await dashboardStore.refresh();
      await loadTicketsAndConfig();
      return true;
    }, { successMessage: 'Configuration enregistrée avec succès !' });
  }

  // Send Panel to Discord
  async function sendEmbedPanel() {
    if (!confirm('Voulez-vous envoyer le panel d\'ouverture de ticket dans le salon configuré ?')) return;
    await sendEmbedAction.run(async () => {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/tickets/config/send-embed`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      });
      if (!res.ok) throw new Error('Erreur d\'envoi du panel');
      return true;
    }, { successMessage: 'Panel de tickets envoyé avec succès !' });
  }

  // Member Case Logic
  async function loadMemberCaseDetails(userId: string) {
    selectedCaseLoading = true;
    selectedCaseError = '';
    try {
      selectedCaseData = await fetchMemberCase(userId);
    } catch (err: any) {
      selectedCaseError = err.message || 'Impossible de charger le dossier membre.';
      selectedCaseData = null;
    } finally {
      selectedCaseLoading = false;
    }
  }

  function openMemberCase(userId: string, userName: string) {
    selectedCaseUser = { name: userName, id: userId };
    selectedCaseData = null;
    selectedCaseError = '';
    memberActionReason = 'Action lancée depuis le panel de Tickets.';
    memberActionDuration = '30m';
    memberActionFeedback = '';
    memberActionIsError = false;
    caseModalOpen = true;
    if (userId) {
      void loadMemberCaseDetails(userId);
    }
  }

  function closeCaseModal() {
    caseModalOpen = false;
    selectedCaseUser = null;
    selectedCaseData = null;
    selectedCaseError = '';
  }

  async function executeMemberAction(action: 'WARN' | 'KICK' | 'TIMEOUT' | 'BAN') {
    if (!selectedCaseUser?.id) return;
    memberActionBusy = true;
    memberActionFeedback = '';
    memberActionIsError = false;
    try {
      const durationMs = action === 'TIMEOUT' ? 30 * 60 * 1000 : null;
      await runMemberCaseAction(selectedCaseUser.id, action, {
        reason: memberActionReason.trim() || 'Action lancée depuis Tickets.',
        durationMs: durationMs ?? undefined
      });
      memberActionFeedback = 'Action appliquée avec succès.';
      await loadMemberCaseDetails(selectedCaseUser.id);
    } catch (err: any) {
      memberActionIsError = true;
      memberActionFeedback = err.message || 'L’action a échoué.';
    } finally {
      memberActionBusy = false;
    }
  }

  function getStatusLabel(status: string) {
    switch (status) {
      case 'OPEN': return 'Ouvert';
      case 'CLAIMED': return 'Pris en charge';
      case 'CLOSED': return 'Fermé';
      default: return status;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'OPEN': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'CLAIMED': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'CLOSED': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      default: return 'bg-outline-variant/10 text-on-surface-variant border-outline-variant/20';
    }
  }

  $effect(() => {
    if (activeTab === 'transcripts') {
      void loadTranscripts();
    }
  });

  onMount(async () => {
    await loadTicketsAndConfig();

    wsListener = (e: CustomEvent) => {
      const payload = e.detail;
      if (payload?.type === 'new_ticket_message' && payload.ticketId === selectedTicketId) {
        if (!messages.some(m => m.id === payload.message.id)) {
          // Remplacer les messages temporaires par le message officiel Discord reçu en temps réel
          messages = [
            ...messages.filter(m => !m.id.startsWith('temp-') || m.content !== payload.message.content),
            payload.message
          ];
          setTimeout(scrollToBottom, 50);
        }
      }
    };

    window.addEventListener('kotbo-ws-message', wsListener as any);
  });

  onDestroy(() => {
    if (wsListener) {
      window.removeEventListener('kotbo-ws-message', wsListener as any);
    }
  });
</script>

<ModulePage 
  title="Système de Tickets" 
  description="Gérez les tickets de support en temps réel, communiquez avec les utilisateurs et gérez la configuration." 
  icon="message-square"
  featureKey="tickets"
>
  {#snippet actions()}
    <div class="flex items-center gap-3">
      <RefreshButton onClick={handleRefresh} loading={loading} label="Actualiser" />
      <button 
        onclick={() => activeTab = activeTab === 'config' ? 'tickets' : 'config'}
        class="p-3 rounded-xl bg-surface-container-high hover:bg-primary/10 hover:text-primary transition-all text-on-surface-variant/70"
        title="Paramètres de configuration"
      >
        <Papicon icon="settings" size={20} />
      </button>
    </div>
  {/snippet}

  <!-- Tab Switcher -->
  <div class="flex border-b border-outline-variant/10 mb-8">
    <button 
      onclick={() => activeTab = 'tickets'}
      class="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative {activeTab === 'tickets' ? 'text-primary' : 'text-on-surface-variant/40 hover:text-on-surface-variant'}"
    >
      Tickets Support
      {#if activeTab === 'tickets'}
        <div class="absolute bottom-0 left-0 w-full h-1 bg-primary rounded-t-full"></div>
      {/if}
    </button>
    <button 
      onclick={() => activeTab = 'transcripts'}
      class="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative {activeTab === 'transcripts' ? 'text-primary' : 'text-on-surface-variant/40 hover:text-on-surface-variant'}"
    >
      Transcriptions
      {#if activeTab === 'transcripts'}
        <div class="absolute bottom-0 left-0 w-full h-1 bg-primary rounded-t-full"></div>
      {/if}
    </button>
    <button 
      onclick={() => activeTab = 'config'}
      class="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative {activeTab === 'config' ? 'text-primary' : 'text-on-surface-variant/40 hover:text-on-surface-variant'}"
    >
      Configuration
      {#if activeTab === 'config'}
        <div class="absolute bottom-0 left-0 w-full h-1 bg-primary rounded-t-full"></div>
      {/if}
    </button>
  </div>

  {#if activeTab === 'tickets'}
    <!-- Tickets Main View -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[75vh]">
      
      <!-- Left Panel: Tickets Browser (col-span-4) -->
      <div class="lg:col-span-4 bg-surface-container-low/40 border border-outline-variant/10 rounded-[2.5rem] p-6 flex flex-col overflow-hidden h-full">
        <!-- Filter chips inside browser -->
        <div class="flex items-center gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
          {#each ['ALL', 'OPEN', 'CLAIMED', 'CLOSED'] as filterType}
            <button
              onclick={() => ticketFilter = filterType as any}
              class="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all {ticketFilter === filterType ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}"
            >
              {filterType === 'ALL' ? 'Tous' : getStatusLabel(filterType)}
            </button>
          {/each}
        </div>

        <!-- Ticket Cards List -->
        <div class="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-hide">
          {#if filteredTickets.length === 0}
            <div class="flex flex-col items-center justify-center py-20 text-on-surface-variant/30">
              <Papicon icon="inbox" size={32} class="opacity-50 mb-3" />
              <p class="text-xs font-bold">Aucun ticket trouvé</p>
            </div>
          {:else}
            {#each filteredTickets as ticket (ticket.id)}
              <button
                onclick={() => selectTicket(ticket.id)}
                class="w-full text-left p-4 rounded-2xl border transition-all duration-300 relative overflow-hidden group {selectedTicketId === ticket.id ? 'bg-primary/5 border-primary shadow-sm' : 'bg-surface-container/30 border-outline-variant/10 hover:border-outline-variant/40 hover:bg-surface-container/50'}"
              >
                <!-- Avatar & Header info -->
                <div class="flex items-start gap-3">
                  <div class="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-primary font-black text-sm shadow-sm group-hover:scale-105 transition-transform">
                    {ticket.username?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2">
                      <p class="text-sm font-black text-on-surface truncate">@{ticket.username || 'Anonyme'}</p>
                      <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border {getStatusColor(ticket.status)}">
                        {getStatusLabel(ticket.status)}
                      </span>
                    </div>
                    <p class="text-[10px] text-on-surface-variant/60 font-mono mt-0.5">ID: {ticket.id}</p>
                    <p class="text-[9px] text-on-surface-variant/50 mt-1">Créé le {new Date(ticket.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>

                <!-- Claimed By indicator -->
                {#if ticket.claimedByName}
                  <div class="mt-3 pt-3 border-t border-outline-variant/10 flex items-center gap-1.5 text-[10px] font-semibold text-primary/80">
                    <Papicon icon="user" size={12} /> Assigné à @{ticket.claimedByName}
                  </div>
                {/if}
              </button>
            {/each}
          {/if}
        </div>
      </div>

      <!-- Right Panel: Live Chat & Actions (col-span-8) -->
      <div class="lg:col-span-8 bg-surface-container-low/40 border border-outline-variant/10 rounded-[2.5rem] flex flex-col overflow-hidden h-full">
        {#if !selectedTicketId}
          <div class="flex-1 flex flex-col items-center justify-center text-on-surface-variant/30 py-32">
            <div class="w-20 h-20 rounded-[2.5rem] bg-surface-container flex items-center justify-center mb-6 shadow-inner">
              <Papicon icon="message-square" size={40} />
            </div>
            <h3 class="text-xl font-black text-on-surface/40 font-headline">Aucun ticket sélectionné</h3>
            <p class="text-xs opacity-60 mt-1">Sélectionnez un ticket dans la liste pour démarrer l'assistance en direct.</p>
          </div>
        {:else}
          <!-- Chat Header -->
          <div class="p-6 border-b border-outline-variant/10 bg-surface-container/20 flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black text-lg shadow-inner">
                {selectedTicketDetail?.username?.charAt(0).toUpperCase() || '?'}
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="text-base font-black text-on-surface">@{selectedTicketDetail?.username || 'Utilisateur'}</h3>
                  <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border {getStatusColor(selectedTicketDetail?.status)}">
                    {getStatusLabel(selectedTicketDetail?.status)}
                  </span>
                </div>
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                  <span class="text-[10px] font-mono text-on-surface-variant/60">ID: {selectedTicketDetail?.id}</span>
                  {#if selectedTicketDetail?.claimedByName}
                    <span class="text-[10px] text-primary/80 font-bold">• Assigné à @{selectedTicketDetail.claimedByName}</span>
                  {/if}
                </div>
              </div>
            </div>

            <!-- Header Quick Actions -->
            <div class="flex flex-wrap items-center gap-2">
              <button 
                onclick={() => openMemberCase(selectedTicketDetail.userId, selectedTicketDetail.username)}
                class="px-4 py-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-indigo-500 hover:text-white transition-all flex items-center gap-1.5 shadow-sm"
              >
                <Papicon icon="shield" size={14} /> Casier
              </button>

              {#if selectedTicketDetail?.status === 'OPEN'}
                {#if selectedTicketDetail.claimedBy !== authStore.user?.id}
                  <button 
                    onclick={claimTicket}
                    class="px-4 py-2 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-amber-500 hover:text-white transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <Papicon icon="user-check" size={14} /> S'assigner
                  </button>
                {/if}
                <button 
                  onclick={() => showCloseModal = true}
                  class="px-4 py-2 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-rose-500 hover:text-white transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <Papicon icon="x-circle" size={14} /> Fermer
                </button>
              {/if}
              
              {#if selectedTicketDetail?.status === 'CLAIMED' && selectedTicketDetail.claimedById !== authStore.user?.id && (config.ticketAllowOverclaim ?? true) && config.ticketOverclaimPermission !== 'NONE'}
                <button 
                  onclick={claimTicket}
                  class="px-4 py-2 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-amber-500 hover:text-white transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <Papicon icon="user-check" size={14} /> Sur-revendiquer
                </button>
              {/if}

              {#if selectedTicketDetail?.status === 'CLOSED'}
                {#if selectedTicketDetail.channelId}
                  <button 
                    onclick={reopenTicket}
                    class="px-4 py-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-emerald-500 hover:text-white transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <Papicon icon="refresh" size={14} /> Réouvrir
                  </button>
                  <button 
                    onclick={() => showDeleteConfirmModal = true}
                    class="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 shadow-md shadow-rose-600/20"
                  >
                    <Papicon icon="delete" size={14} /> Supprimer
                  </button>
                {/if}
                
                {#if selectedTicketDetail?.transcriptId}
                  <a 
                    href="/transcripts/{selectedTicketDetail.transcriptId}" 
                    target="_blank"
                    class="px-4 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-blue-500 hover:text-white transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <Papicon icon="external-link" size={14} /> Voir la transcription
                  </a>
                {/if}
              {/if}
            </div>

            {#if selectedTicketDetail?.channelId}
              <div class="mt-4 flex flex-col gap-3 rounded-2xl border border-outline-variant/10 bg-surface-container/30 p-4">
                <div class="flex flex-col gap-1">
                  <span class="text-[10px] font-black uppercase tracking-[0.22em] text-primary">Renommage du salon</span>
                  <p class="text-[11px] text-on-surface-variant/70">Le nom sera normalisé côté Discord pour rester compatible avec les règles des salons.</p>
                </div>
                <div class="flex flex-col gap-3 sm:flex-row">
                  <FormInput
                    type="text"
                    bind:value={ticketRenameName}
                    placeholder="ticket-nouveau-nom"
                    className="flex-1"
                  />
                  <button
                    onclick={renameTicket}
                    disabled={renameAction.state.loading || !ticketRenameName.trim()}
                    class="px-5 py-3 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-wider hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-primary/25 disabled:opacity-50 flex items-center gap-2"
                  >
                    <Papicon icon="edit" size={14} />
                    {renameAction.state.loading ? 'Renommage...' : 'Renommer'}
                  </button>
                </div>
              </div>
            {/if}
          </div>

          <!-- Chat Messages Container -->
          <div 
            bind:this={chatScrollContainer}
            class="flex-1 overflow-y-auto bg-[#313338] scrollbar-hide"
            class:p-6={!selectedTicketDetail?.transcriptId || messages.length > 0}
            class:space-y-4={!selectedTicketDetail?.transcriptId || messages.length > 0}
          >
            {#if loadingDetail && messages.length === 0}
              <div class="flex items-center justify-center h-full">
                <div class="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
              </div>
            {:else if messages.length === 0}
              {#if selectedTicketDetail?.transcriptId}
                <iframe
                  src={`${API_BASE_URL}/api/public/transcripts/${selectedTicketDetail.transcriptId}`}
                  title="Transcription du Ticket"
                  class="w-full h-full border-none bg-[#313338]"
                ></iframe>
              {:else}
                <div class="flex flex-col items-center justify-center text-white/30 h-full">
                  <Papicon icon="forum" size={32} class="opacity-50 mb-2" />
                  <p class="text-xs">Aucun message dans ce ticket.</p>
                </div>
              {/if}
            {:else}
              {#each messages as msg (msg.id)}
                <div class="flex items-start gap-4 p-2.5 rounded-xl hover:bg-white/5 transition-colors group">
                  <!-- Avatar -->
                  <div class="shrink-0 relative">
                    {#if msg.authorAvatar}
                      <img src={msg.authorAvatar} alt="Avatar" class="h-10 w-10 rounded-full object-cover border border-white/10" />
                    {:else}
                      <div class="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-sm font-black text-white/80">
                        {msg.authorName?.slice(0, 1).toUpperCase()}
                      </div>
                    {/if}
                  </div>

                  <!-- Content Block -->
                  <div class="min-w-0 flex-1">
                    <div class="flex items-baseline gap-2">
                      <span class="text-sm font-bold text-white hover:underline cursor-pointer">{msg.authorName || 'Anonyme'}</span>
                      {#if msg.isStaff}
                        <span class="bg-[#5865F2] text-white text-[9px] font-black uppercase px-1.5 py-0.5 rounded tracking-wider leading-none">Kotbo Staff</span>
                      {/if}
                      <span class="text-[10px] text-white/40">{new Date(msg.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {#if msg.htmlContent}
                      <div class="text-sm text-white/90 mt-1 whitespace-pre-wrap leading-relaxed select-text flex flex-wrap gap-x-1 items-center message-html-content">
                        {@html msg.htmlContent}
                      </div>
                    {:else if msg.content}
                      <p class="text-sm text-white/90 mt-1 whitespace-pre-wrap leading-relaxed select-text">{msg.content}</p>
                    {/if}

                    <!-- Handle Media URLs (extracted from content) -->
                    {#if msg.mediaUrls && msg.mediaUrls.length > 0}
                      <div class="mt-3 space-y-2">
                        {#each msg.mediaUrls.filter(media => {
                          if (msg.attachments?.some(att => att.url === media.url)) return false;
                          
                          const getFilename = (url) => {
                            if (!url) return '';
                            const clean = url.split('?')[0];
                            const parts = clean.split('/');
                            return parts[parts.length - 1] || '';
                          };
                          
                          const mediaFilename = getFilename(media.url);
                          
                          if (msg.embeds?.some(embed => {
                            const embedUrl = embed.url || '';
                            const embedImg = embed.image?.url || '';
                            const embedThumb = embed.thumbnail?.url || '';
                            const embedVid = embed.video?.url || '';
                            
                            if (embedUrl === media.url || embedImg === media.url || embedThumb === media.url || embedVid === media.url) {
                              return true;
                            }
                            
                            if (mediaFilename) {
                              if (getFilename(embedUrl).includes(mediaFilename) ||
                                  getFilename(embedImg).includes(mediaFilename) ||
                                  getFilename(embedThumb).includes(mediaFilename) ||
                                  getFilename(embedVid).includes(mediaFilename)) {
                                return true;
                              }
                            }
                            
                            const mediaIsGiphy = media.url.includes('giphy.com');
                            const embedIsGiphy = embedUrl.includes('giphy.com') || embedImg.includes('giphy.com') || embedVid.includes('giphy.com') || embedThumb.includes('giphy.com');
                            if (mediaIsGiphy && embedIsGiphy) return true;
                            
                            const mediaIsTenor = media.url.includes('tenor.com');
                            const embedIsTenor = embedUrl.includes('tenor.com') || embedImg.includes('tenor.com') || embedVid.includes('tenor.com') || embedThumb.includes('tenor.com');
                            if (mediaIsTenor && embedIsTenor) return true;
                            
                            return false;
                          })) return false;
                          
                          return true;
                        }) as media}
                          {#if media.type === 'image'}
                            <img src={media.url} alt="media-preview" class="max-w-xs md:max-w-md rounded-lg border border-white/10 hover:shadow-lg transition-shadow max-h-72 object-contain bg-[#1e1f22]" />
                          {:else if media.type === 'video'}
                            <!-- svelte-ignore a11y_media_has_caption -->
                            <video src={media.url} controls class="max-w-xs md:max-w-md rounded-lg border border-white/10 max-h-72 bg-[#1e1f22]"></video>
                          {:else if media.type === 'audio'}
                            <audio src={media.url} controls class="max-w-xs md:max-w-md"></audio>
                          {/if}
                        {/each}
                      </div>
                    {/if}

                    <!-- Handle Discord Stickers -->
                    {#if msg.stickers && msg.stickers.length > 0}
                      <div class="mt-3 space-y-2">
                        {#each msg.stickers as sticker}
                          <div class="relative group max-w-xs">
                            <img src={sticker.url} alt={sticker.name} class="h-40 w-auto rounded-lg object-contain hover:scale-105 transition-transform" />
                            <span class="absolute bottom-1 left-1 bg-black/60 text-white/70 text-[9px] px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">Autocollant : {sticker.name}</span>
                          </div>
                        {/each}
                      </div>
                    {/if}
                    
                    <!-- Handle Embeds -->
                    {#if msg.embeds && msg.embeds.length > 0}
                      <div class="mt-2 space-y-2">
                        {#each msg.embeds as embed}
                          <div class="bg-[#2b2d31] border-l-4 rounded-r-md p-3 max-w-lg" style="border-left-color: {embed.color || '#1e1f22'}">
                            {#if embed.title}
                              <div class="font-bold text-[#00a8fc] text-sm mb-1">{embed.title}</div>
                            {/if}
                            {#if embed.htmlDescription}
                              <div class="text-sm text-white/80 whitespace-pre-wrap leading-relaxed select-text message-html-content">{@html embed.htmlDescription}</div>
                            {:else if embed.description}
                              <div class="text-sm text-white/80 whitespace-pre-wrap leading-relaxed select-text">{embed.description}</div>
                            {/if}
                            {#if embed.fields && embed.fields.length > 0}
                              <div class="mt-2 flex flex-wrap gap-3">
                                {#each embed.fields as field}
                                  <div class="flex-1 min-w-[45%]">
                                    <div class="text-[11px] font-bold text-white/60 uppercase">{field.name}</div>
                                    {#if field.htmlValue}
                                      <div class="text-sm text-white/80 select-text message-html-content">{@html field.htmlValue}</div>
                                    {:else}
                                      <div class="text-sm text-white/80 select-text">{field.value}</div>
                                    {/if}
                                  </div>
                                {/each}
                              </div>
                            {/if}

                            <!-- Render Embed Image / Video / Thumbnail (Mutually Exclusive) -->
                            {#if embed.image && embed.image.url}
                              <div class="mt-2 relative group max-w-full">
                                <img src={embed.image.url} alt="embed-img" class="max-w-full rounded-lg border border-white/10 max-h-72 object-contain bg-[#1e1f22] hover:scale-[1.01] transition-transform" />
                              </div>
                            {:else if embed.video && embed.video.url}
                              <div class="mt-2">
                                {#if embed.video.url.includes('giphy.com') || embed.video.url.includes('tenor.com') || embed.video.url.includes('gifv')}
                                  <!-- svelte-ignore a11y_media_has_caption -->
                                  <video src={embed.video.url} autoplay loop muted playsinline class="max-w-full rounded-lg border border-white/10 max-h-72 bg-[#1e1f22]"></video>
                                {:else}
                                  <!-- svelte-ignore a11y_media_has_caption -->
                                  <video src={embed.video.url} controls class="max-w-full rounded-lg border border-white/10 max-h-72 bg-[#1e1f22]"></video>
                                {/if}
                              </div>
                            {:else if embed.thumbnail && embed.thumbnail.url}
                              <div class="mt-2 relative group max-w-full">
                                <img src={embed.thumbnail.url} alt="embed-thumbnail" class="max-w-full rounded-lg border border-white/10 max-h-40 object-contain bg-[#1e1f22]" />
                              </div>
                            {/if}
                          </div>
                        {/each}
                      </div>
                    {/if}

                    <!-- Handle Media Attachments -->
                    {#if msg.attachments && msg.attachments.length > 0}
                      <div class="mt-3 space-y-2">
                        {#each msg.attachments as att}
                          {#if att.contentType?.startsWith('image/')}
                            <img src={att.url} alt="discord-att" class="max-w-xs md:max-w-md rounded-lg border border-white/10 hover:shadow-lg transition-shadow max-h-72 object-cover" />
                          {:else if att.contentType?.startsWith('video/')}
                            <!-- svelte-ignore a11y_media_has_caption -->
                            <video src={att.url} controls class="max-w-xs md:max-w-md rounded-lg border border-white/10 max-h-72"></video>
                          {:else if att.contentType?.startsWith('audio/')}
                            <audio src={att.url} controls class="max-w-xs md:max-w-md"></audio>
                          {:else}
                            <a href={att.url} target="_blank" class="flex items-center gap-2 p-3 bg-white/5 border border-white/10 rounded-lg text-xs font-bold text-white hover:bg-white/10 transition-colors w-fit">
                              <Papicon icon="file" size={16} /> Télécharger la pièce jointe
                            </a>
                          {/if}
                        {/each}
                      </div>
                    {/if}
                  </div>
                </div>
              {/each}
            {/if}
          </div>

          <!-- Chat Input Bar -->
          {#if selectedTicketDetail?.status === 'OPEN' || selectedTicketDetail?.status === 'CLAIMED'}
            <div class="p-6 border-t border-outline-variant/10 bg-surface-container/20 flex gap-4">
              <input 
                type="text" 
                bind:value={chatInput}
                onkeydown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Écrire un message privé au candidat..."
                class="flex-1 bg-surface-container rounded-2xl px-6 py-4 focus:outline-hidden border-2 border-transparent focus:border-primary/50 text-sm font-medium"
              />
              <button 
                onclick={sendMessage}
                disabled={!chatInput.trim()}
                class="w-14 h-14 rounded-2xl bg-primary text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-50 shadow-lg shadow-primary/20"
              >
                <Papicon icon="send" size={20} />
              </button>
            </div>
          {:else}
            <div class="p-6 border-t border-outline-variant/10 bg-rose-500/10 text-rose-500 flex items-center justify-center text-xs font-black uppercase tracking-widest gap-2">
              <Papicon icon="lock" size={16} /> Ce ticket est fermé. Aucune modification ou envoi de message n'est possible.
            </div>
          {/if}
        {/if}
      </div>

    </div>
  {:else if activeTab === 'config'}
    <!-- Configuration Panel -->
    <div class="bg-surface-container-low/40 border border-outline-variant/10 rounded-[3rem] p-8 max-w-4xl mx-auto space-y-8 font-inter">
      <div class="border-b border-outline-variant/20 pb-4 flex items-center justify-between">
        <div>
          <h3 class="text-xl font-black text-on-surface">Configuration du Module</h3>
          <p class="text-on-surface-variant text-sm">Organisez les salons et personnalisez le bouton d'ouverture.</p>
        </div>
        <button 
          onclick={sendEmbedPanel} 
          disabled={sendEmbedAction.state.loading || !ticketChannelId}
          class="px-5 py-3 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-wider hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-primary/25 disabled:opacity-50 flex items-center gap-2"
        >
          <Papicon icon="send" size={14} /> 
          {sendEmbedAction.state.loading ? 'Envoi...' : 'Envoyer Embed sur Discord'}
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Salons -->
        <div class="space-y-4">
          <h4 class="text-xs font-black uppercase tracking-widest text-primary mb-2">Salons & Rôles Discord</h4>

          <label class="block">
            <span class="text-xs font-bold text-on-surface-variant/80 ml-1 mb-2 block">ID Catégorie Tickets (Création des salons)</span>
            <SearchableSelect bind:value={ticketCategoryId} options={discordCategories.map(c => ({ id: c.id, name: c.name }))} placeholder="Sélectionner une catégorie" className="w-full" />
          </label>

          <label class="block">
            <span class="text-xs font-bold text-on-surface-variant/80 ml-1 mb-2 block">Salon d'ouverture (Où envoyer le panel)</span>
            <SearchableSelect bind:value={ticketChannelId} options={discordChannels.map(c => ({ id: c.id, name: `#${c.name}` }))} placeholder="Sélectionner un salon" className="w-full" />
          </label>

          <label class="block">
            <span class="text-xs font-bold text-on-surface-variant/80 ml-1 mb-2 block">Salon des Logs (Envoi des Transcripts)</span>
            <SearchableSelect bind:value={ticketLogChannelId} options={discordChannels.map(c => ({ id: c.id, name: `#${c.name}` }))} placeholder="Sélectionner un salon" className="w-full" />
          </label>

          <label class="block">
            <span class="text-xs font-bold text-on-surface-variant/80 ml-1 mb-2 block">Rôle Staff Support</span>
            <SearchableSelect bind:value={ticketStaffRoleId} options={discordRoles.map(r => ({ id: r.id, name: `@${r.name}` }))} placeholder="Sélectionner un rôle" className="w-full" />
          </label>

          <div class="border-t border-outline-variant/10 pt-4 mt-4 space-y-3">
            <label class="flex items-center gap-3 cursor-pointer p-2 hover:bg-white/5 rounded-xl transition-colors">
              <input type="checkbox" bind:checked={ticketAllowOverclaim} class="w-4 h-4 rounded text-primary focus:ring-primary border-outline-variant/30" />
              <div>
                <span class="text-xs font-bold text-on-surface">Autoriser la sur-revendication</span>
                <p class="text-[10px] text-on-surface-variant/60">Permettre à un autre membre du personnel de reprendre un ticket déjà revendiqué.</p>
              </div>
            </label>

            {#if ticketAllowOverclaim}
              <label class="block mt-2">
                <span class="text-xs font-bold text-on-surface-variant/80 ml-1 mb-2 block">Qui peut sur-revendiquer ?</span>
                <FormSelect bind:value={ticketOverclaimPermission} className="w-full">
                  <option value="ANY">Tout le staff</option>
                  <option value="SUPERIOR_OR_EQUAL">Uniquement grade supérieur ou égal</option>
                </FormSelect>
              </label>
            {/if}
          </div>
        </div>

        <!-- Custom Embed -->
        <div class="space-y-4">
          <h4 class="text-xs font-black uppercase tracking-widest text-primary mb-2">Personnalisation de l'Embed</h4>

          <label class="block">
            <span class="text-xs font-bold text-on-surface-variant/80 ml-1 mb-2 block">Titre de l'Embed</span>
            <FormInput type="text" bind:value={ticketEmbedTitle} placeholder="Ex: Support Client" className="w-full" />
          </label>

          <label class="block">
            <span class="text-xs font-bold text-on-surface-variant/80 ml-1 mb-2 block">Description de l'Embed</span>
            <FormTextarea bind:value={ticketEmbedDesc} placeholder="Ex: Cliquez pour obtenir de l'aide..." className="w-full h-24" />
          </label>

          <label class="block">
            <span class="text-xs font-bold text-on-surface-variant/80 ml-1 mb-2 block">Texte du Bouton Discord</span>
            <FormInput type="text" bind:value={ticketEmbedButtonText} placeholder="Ex: Ouvrir un ticket" className="w-full" />
          </label>

          <label class="block">
            <span class="text-xs font-bold text-on-surface-variant/80 ml-1 mb-2 block">Couleur Hex de l'Embed</span>
            <FormColorPicker bind:value={ticketEmbedColor} />
          </label>
        </div>
      </div>

      <div class="rounded-4xl border border-outline-variant/10 bg-surface-container/30 p-6 space-y-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 class="text-xs font-black uppercase tracking-widest text-primary mb-1">Types de tickets</h4>
            <p class="text-sm text-on-surface-variant">Chaque type affiche son propre bouton, ping le bon rôle et ouvre le salon dans la bonne catégorie.</p>
          </div>
          <button
            onclick={addTicketType}
            class="px-4 py-2 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-primary/20 flex items-center gap-2"
          >
            <Papicon icon="plus" size={14} /> Ajouter un type
          </button>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {#each ticketTypes as ticketType, index}
            <div class="rounded-3xl border border-outline-variant/10 bg-surface-container-low/40 p-5 space-y-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-xs font-black uppercase tracking-widest text-on-surface-variant/70">Type #{index + 1}</p>
                  <p class="text-sm font-bold text-on-surface">Bouton visible dans l'embed</p>
                </div>
                <button
                  onclick={() => removeTicketType(index)}
                  class="px-3 py-2 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20 text-[10px] font-black uppercase tracking-wider hover:bg-rose-500 hover:text-white transition-colors"
                >
                  Supprimer
                </button>
              </div>

              <label class="block">
                <span class="text-xs font-bold text-on-surface-variant/80 ml-1 mb-2 block">Texte du bouton</span>
                <FormInput type="text" bind:value={ticketType.label} placeholder="Support technique" className="w-full" />
              </label>

              <label class="block">
                <span class="text-xs font-bold text-on-surface-variant/80 ml-1 mb-2 block">Description affichée dans l'embed</span>
                <FormTextarea bind:value={ticketType.description} placeholder="Explique ce que couvre ce type de ticket..." className="w-full h-24" />
              </label>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label class="block">
                  <span class="text-xs font-bold text-on-surface-variant/80 ml-1 mb-2 block">Emoji du bouton</span>
                  <FormInput type="text" bind:value={ticketType.emoji} placeholder="📩" className="w-full" />
                </label>

                <label class="block">
                  <span class="text-xs font-bold text-on-surface-variant/80 ml-1 mb-2 block">Style du bouton</span>
                  <FormSelect bind:value={ticketType.buttonStyle} className="w-full">
                    <option value="PRIMARY">Primaire</option>
                    <option value="SECONDARY">Secondaire</option>
                    <option value="SUCCESS">Succès</option>
                    <option value="DANGER">Danger</option>
                  </FormSelect>
                </label>
              </div>

              <label class="block">
                <span class="text-xs font-bold text-on-surface-variant/80 ml-1 mb-2 block">Catégorie de création</span>
                <SearchableSelect bind:value={ticketType.categoryId} options={discordCategories.map(c => ({ id: c.id, name: c.name }))} placeholder="Sélectionner une catégorie" className="w-full" />
              </label>

              <label class="block">
                <span class="text-xs font-bold text-on-surface-variant/80 ml-1 mb-2 block">Rôle staff notifié</span>
                <SearchableSelect bind:value={ticketType.staffRoleId} options={discordRoles.map(r => ({ id: r.id, name: `@${r.name}` }))} placeholder="Sélectionner un rôle" className="w-full" />
              </label>
            </div>
          {/each}
        </div>
      </div>

      <div class="pt-6 border-t border-outline-variant/10 flex justify-end gap-4">
        <button 
          onclick={saveSettings} 
          disabled={saveAction.state.loading}
          class="px-8 py-4 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-wider hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
        >
          {saveAction.state.loading ? 'Enregistrement...' : 'Sauvegarder les paramètres'}
        </button>
      </div>
    </div>
  {:else if activeTab === 'transcripts'}
    <div class="bg-surface-container-low/40 border border-outline-variant/10 rounded-[2.5rem] p-8 flex flex-col h-full min-h-[50vh] font-inter">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h3 class="text-xl font-black text-on-surface">Historique des Transcriptions</h3>
          <p class="text-on-surface-variant text-sm">Consultez l'historique complet des transcriptions de tickets et de salons.</p>
        </div>
      </div>

      {#if loading}
        <div class="flex items-center justify-center py-20">
          <div class="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
        </div>
      {:else if transcripts.length === 0}
        <div class="flex flex-col items-center justify-center py-20 text-on-surface-variant/30">
          <Papicon icon="inbox" size={48} class="opacity-50 mb-3" />
          <p class="text-sm font-bold">Aucune transcription disponible</p>
        </div>
      {:else}
        <div class="overflow-x-auto w-full">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-outline-variant/15 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/70">
                <th class="py-4 px-6">Salon</th>
                <th class="py-4 px-6">Type / Origine</th>
                <th class="py-4 px-6">Période des messages</th>
                <th class="py-4 px-6">Généré le</th>
                <th class="py-4 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {#each transcripts as t}
                <tr class="border-b border-outline-variant/10 hover:bg-white/5 transition-colors group">
                  <td class="py-4 px-6 font-mono text-sm font-bold text-on-surface">
                    <span class="text-primary/70">#</span>{t.channelName}
                  </td>
                  <td class="py-4 px-6">
                    {#if t.channelName.startsWith('ticket-')}
                      <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        Ticket Support
                      </span>
                    {:else}
                      <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Commande /transcript
                      </span>
                    {/if}
                  </td>
                  <td class="py-4 px-6 text-xs text-on-surface-variant">
                    {#if t.startTime && t.endTime}
                      <div class="flex flex-col gap-0.5">
                        <span>Du <strong class="text-on-surface/90">{new Date(t.startTime).toLocaleDateString('fr-FR')} à {new Date(t.startTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</strong></span>
                        <span>Au <strong class="text-on-surface/90">{new Date(t.endTime).toLocaleDateString('fr-FR')} à {new Date(t.endTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</strong></span>
                      </div>
                    {:else}
                      <span class="text-on-surface-variant/40 italic">Non spécifiée (Toutes)</span>
                    {/if}
                  </td>
                  <td class="py-4 px-6 text-xs text-on-surface-variant">
                    {new Date(t.createdAt).toLocaleDateString('fr-FR')} {new Date(t.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td class="py-4 px-6 text-right">
                    <a
                      href="/transcripts/{t.id}"
                      target="_blank"
                      class="px-4 py-2 bg-primary/10 text-primary border border-primary/20 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-primary hover:text-white transition-all inline-flex items-center gap-1.5 shadow-sm"
                    >
                      <Papicon icon="external-link" size={12} />
                      Consulter
                    </a>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/if}
</ModulePage>

<!-- ============================================== -->
<!-- MODALS -->
<!-- ============================================== -->

<!-- Ticket Close Modal -->
{#if showCloseModal}
  <div class="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
    <div class="bg-surface border border-outline-variant/30 rounded-[3rem] w-full max-w-lg shadow-2xl p-10 animate-in zoom-in-95 duration-300">
      <div class="flex items-center gap-4 mb-2 text-rose-500">
        <Papicon icon="x-circle" size={36} />
        <h3 class="text-2xl font-black">Clôturer le Ticket</h3>
      </div>
      <p class="text-sm text-on-surface-variant/80 mb-6">Cette action fermera le salon de ticket. Vous pourrez y ajouter un motif de fermeture.</p>
      
      <div>
        <label for="close-reason-input" class="text-xs font-bold uppercase tracking-widest text-primary mb-2 block">Raison de la fermeture (Optionnel)</label>
        <textarea id="close-reason-input" bind:value={closeReason} class="w-full h-32 bg-surface-container rounded-2xl p-4 focus:outline-hidden border-2 border-transparent focus:border-primary/50 text-sm" placeholder="Raison de la fermeture..."></textarea>
      </div>
      
      <div class="flex gap-4 mt-8 pt-6 border-t border-outline-variant/20">
        <button onclick={() => showCloseModal = false} class="flex-1 py-4 rounded-xl font-bold bg-surface-container hover:bg-surface-container-high transition-colors">Annuler</button>
        <button 
          onclick={closeTicket} 
          class="flex-1 py-4 rounded-xl font-bold bg-rose-600 text-white hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-rose-600/30"
        >
          Confirmer la fermeture
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Ticket Delete Confirm Modal -->
{#if showDeleteConfirmModal}
  <div class="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
    <div class="bg-surface border border-outline-variant/30 rounded-[3rem] w-full max-w-md shadow-2xl p-10 animate-in zoom-in-95 duration-300">
      <div class="flex items-center gap-4 mb-2 text-rose-500">
        <Papicon icon="delete" size={36} />
        <h3 class="text-2xl font-black">Supprimer définitivement ?</h3>
      </div>
      <p class="text-sm text-on-surface-variant/80 mb-6">Cette action va supprimer définitivement le salon sur Discord et générer une transcription autonome Kotbo.</p>
      
      <div class="flex gap-4 mt-8 pt-6 border-t border-outline-variant/20">
        <button onclick={() => showDeleteConfirmModal = false} class="flex-1 py-4 rounded-xl font-bold bg-surface-container hover:bg-surface-container-high transition-colors">Annuler</button>
        <button 
          onclick={deleteTicket} 
          class="flex-1 py-4 rounded-xl font-bold bg-rose-600 text-white hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-rose-600/30"
        >
          Confirmer la suppression
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Member Case Modal -->
<MemberCaseModal
  open={caseModalOpen}
  userId={selectedCaseUser?.id}
  userName={selectedCaseUser?.name || ''}
  caseData={selectedCaseData}
  loading={selectedCaseLoading}
  error={selectedCaseError}
  actionReason={memberActionReason}
  actionDuration={memberActionDuration}
  actionBusy={memberActionBusy}
  actionFeedback={memberActionFeedback}
  actionIsError={memberActionIsError}
  onClose={closeCaseModal}
  onAction={executeMemberAction}
/>

<style>
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
</style>
