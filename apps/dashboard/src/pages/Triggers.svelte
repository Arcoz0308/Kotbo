<script lang="ts">
  import { channelDisplayName } from '../lib/channelUtils';
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import { confirmDialog } from '../lib/stores/confirmDialog.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';
  import SearchableSelect from '../lib/components/SearchableSelect.svelte';
  import LoadingHint from '../lib/components/LoadingHint.svelte';
  import MultiSelect from '../lib/components/MultiSelect.svelte';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import EmojiPicker from '../lib/components/EmojiPicker.svelte';
  import { API_BASE_URL } from '../lib/api';
  import {
    fetchAutoResponses,
    createAutoResponse,
    updateAutoResponse,
    deleteAutoResponse,
    fetchTriggerEmojis,
    type GuildCustomEmoji
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
    closeTicket?: boolean;
    rejectForm?: boolean;
    allowedRoleIds: string[];
    bannedRoleIds: string[];
    allowedChannelIds: string[];
    bannedChannelIds: string[];
    triggerType?: string;
    formId?: string | null;
    formQuestionLabel?: string | null;
    ticketTypeId?: string | null;
    ticketQuestionLabel?: string | null;
    reactions?: string[];
    actions?: any;
    responseDestination?: string;
    responseChannelId?: string | null;
    relayToStaffServer?: boolean;
    createdAt: string;
  }>>([]);

  let availableForms = $state<any[]>([]);
  let ticketTypes = $state<any[]>([]);
  let customEmojis = $state<GuildCustomEmoji[]>([]);

  interface ResponseEntry {
    message: string;
    weight: number;
  }

  // Form states
  let formTrigger = $state('');
  let formResponses = $state<ResponseEntry[]>([{ message: '', weight: 100 }]);
  let formMatchType = $state('CONTAINS');
  let formEnabled = $state(true);
  let formRoleIdToAdd = $state<string | null>(null);
  let formRoleIdToRemove = $state<string | null>(null);
  let formDeleteTrigger = $state(false);
  let formAllowedRoleIds = $state<string[]>([]);
  let formBannedRoleIds = $state<string[]>([]);
  let formAllowedChannelIds = $state<string[]>([]);
  let formBannedChannelIds = $state<string[]>([]);
  let formResponseDestination = $state('DM'); // DM, CHANNEL, SPECIFIC_CHANNEL
  let formResponseChannelId = $state<string | null>(null);
  let formRelayToStaffServer = $state(false);

  // New trigger types configurations
  let formTriggerType = $state('MESSAGE'); // MESSAGE, FORM, TICKET
  let formFormId = $state<string | null>(null);
  let formFormQuestionLabel = $state('');
  let formTicketTypeId = $state<string | null>(null);
  let formTicketQuestionLabel = $state('reason');
  let formCloseTicket = $state(false);
  let formRejectForm = $state(false);

  // Emojis & Advanced Actions states
  let activeTab = $state('trigger'); // trigger, actions, advanced, filters
  let formReactionsRaw = $state('');
  let pickerEmoji = $state('');
  let showCustomEmojiPicker = $state(false);
  let customEmojiPickerEl = $state<HTMLDivElement | null>(null);

  const reactionTokens = $derived(
    formReactionsRaw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
  );

  function addReactionEmoji(token: string) {
    if (!token || reactionTokens.includes(token)) return;
    formReactionsRaw = [...reactionTokens, token].join(', ');
  }

  function removeReactionEmoji(token: string) {
    formReactionsRaw = reactionTokens.filter((t) => t !== token).join(', ');
  }

  function reactionTokenDisplay(token: string): { isCustom: boolean; url?: string; label: string } {
    const match = token.match(/^<a?:(\w+):(\d+)>$/);
    if (match) {
      const animated = token.startsWith('<a:');
      return { isCustom: true, url: `https://cdn.discordapp.com/emojis/${match[2]}.${animated ? 'gif' : 'webp'}?size=32`, label: match[1] };
    }
    return { isCustom: false, label: token };
  }

  $effect(() => {
    if (pickerEmoji) {
      addReactionEmoji(pickerEmoji);
      pickerEmoji = '';
    }
  });

  $effect(() => {
    if (!showCustomEmojiPicker) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (customEmojiPickerEl && !customEmojiPickerEl.contains(event.target as Node)) {
        showCustomEmojiPicker = false;
      }
    };
    document.addEventListener('click', handleOutsideClick, true);
    return () => document.removeEventListener('click', handleOutsideClick, true);
  });

  let formActionCreateThread = $state(false);
  let formActionCreateThreadTemplate = $state('');
  
  let formActionSendDm = $state(false);
  let formActionSendDmText = $state('');
  
  let formActionTimeout = $state(false);
  let formActionTimeoutDuration = $state(300);
  
  let formActionAddXp = $state(false);
  let formActionAddXpValue = $state(50);
  
  let formActionCreateChannel = $state(false);
  let formActionCreateChannelName = $state('');
  let formActionCreateChannelType = $state('text');
  let formActionCreateChannelCategoryId = $state<string | null>(null);
  
  let formActionDeleteChannel = $state(false);
  let formActionDeleteChannelId = $state<string | null>(null);
  
  let formActionCreateRole = $state(false);
  let formActionCreateRoleName = $state('');
  let formActionCreateRoleColor = $state('#3498db');
  
  let formActionDeleteRole = $state(false);
  let formActionDeleteRoleId = $state<string | null>(null);

  onMount(async () => {
    loading = true;
    try {
      await dashboardStore.refresh();
      const res = await fetchAutoResponses();
      if (res && res.list) {
        list = res.list;
      }

      // Fetch custom forms
      const formsRes = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${dashboardStore.state.selectedGuildId}/custom-forms`, {
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      });
      if (formsRes.ok) {
        const formsData = await formsRes.json();
        availableForms = formsData.forms || [];
      }

      // Fetch ticket configuration
      const ticketsRes = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${dashboardStore.state.selectedGuildId}/tickets`, {
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      });
      if (ticketsRes.ok) {
        const ticketsData = await ticketsRes.json();
        ticketTypes = ticketsData.config?.ticketTypes || [];
      }

      // Fetch guild's custom emojis (for the reactions picker)
      const emojisRes = await fetchTriggerEmojis();
      if (emojisRes && emojisRes.emojis) {
        customEmojis = emojisRes.emojis;
      }
    } catch (err) {
      console.error(err);
    } finally {
      loading = false;
    }
  });

  function responsesToPayload(entries: ResponseEntry[]): string | null {
    const valid = entries.filter(e => e.message.trim());
    if (valid.length === 0) return null;
    if (valid.length === 1 && valid[0].weight === 100) return valid[0].message;
    return JSON.stringify(valid.map(e => ({ message: e.message, weight: e.weight })));
  }

  function payloadToResponses(response: string | null): ResponseEntry[] {
    if (!response || !response.trim()) return [{ message: '', weight: 100 }];
    try {
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].message !== undefined) {
        return parsed.map((m: any) => ({ message: m.message || '', weight: m.weight || 0 }));
      }
    } catch {}
    return [{ message: response, weight: 100 }];
  }

  function addResponseEntry() {
    formResponses = [...formResponses, { message: '', weight: 0 }];
  }

  function removeResponseEntry(index: number) {
    if (formResponses.length <= 1) return;
    formResponses = formResponses.filter((_, i) => i !== index);
  }

  const totalWeight = $derived(formResponses.reduce((sum, r) => sum + r.weight, 0));

  function openCreateModal() {
    isEditing = false;
    editingId = null;
    formTrigger = '';
    formResponses = [{ message: '', weight: 100 }];
    formMatchType = 'CONTAINS';
    formEnabled = true;
    formRoleIdToAdd = null;
    formRoleIdToRemove = null;
    formDeleteTrigger = false;
    formAllowedRoleIds = [];
    formBannedRoleIds = [];
    formAllowedChannelIds = [];
    formBannedChannelIds = [];
    formResponseDestination = 'DM';
    formResponseChannelId = null;
    formRelayToStaffServer = false;
    formTriggerType = 'MESSAGE';
    formFormId = null;
    formFormQuestionLabel = '';
    formTicketTypeId = null;
    formTicketQuestionLabel = 'reason';
    formCloseTicket = false;
    formRejectForm = false;
    
    activeTab = 'trigger';
    formReactionsRaw = '';
    formActionCreateThread = false;
    formActionCreateThreadTemplate = '';
    formActionSendDm = false;
    formActionSendDmText = '';
    formActionTimeout = false;
    formActionTimeoutDuration = 300;
    formActionAddXp = false;
    formActionAddXpValue = 50;
    formActionCreateChannel = false;
    formActionCreateChannelName = '';
    formActionCreateChannelType = 'text';
    formActionCreateChannelCategoryId = null;
    formActionDeleteChannel = false;
    formActionDeleteChannelId = null;
    formActionCreateRole = false;
    formActionCreateRoleName = '';
    formActionCreateRoleColor = '#3498db';
    formActionDeleteRole = false;
    formActionDeleteRoleId = null;

    actionState.clearFeedback();
    showModal = true;
  }

  function openEditModal(item: typeof list[0]) {
    isEditing = true;
    editingId = item.id;
    formTrigger = item.trigger;
    formResponses = payloadToResponses(item.response);
    formMatchType = item.matchType;
    formEnabled = item.enabled;
    formRoleIdToAdd = item.roleIdToAdd;
    formRoleIdToRemove = item.roleIdToRemove;
    formDeleteTrigger = item.deleteTrigger;
    formAllowedRoleIds = item.allowedRoleIds || [];
    formBannedRoleIds = item.bannedRoleIds || [];
    formAllowedChannelIds = item.allowedChannelIds || [];
    formBannedChannelIds = item.bannedChannelIds || [];
    formResponseDestination = item.responseDestination || 'DM';
    formResponseChannelId = item.responseChannelId || null;
    formRelayToStaffServer = item.relayToStaffServer || false;
    formTriggerType = item.triggerType || 'MESSAGE';
    formFormId = item.formId || null;
    formFormQuestionLabel = item.formQuestionLabel || '';
    formTicketTypeId = item.ticketTypeId || null;
    formTicketQuestionLabel = item.ticketQuestionLabel || 'reason';
    formCloseTicket = item.closeTicket || false;
    formRejectForm = item.rejectForm || false;

    activeTab = 'trigger';
    formReactionsRaw = item.reactions ? item.reactions.join(', ') : '';
    const acts = item.actions || {};
    formActionCreateThread = !!acts.createThread;
    formActionCreateThreadTemplate = typeof acts.createThread === 'string' ? acts.createThread : '';
    formActionSendDm = !!acts.sendDm;
    formActionSendDmText = acts.sendDm || '';
    formActionTimeout = !!acts.timeoutSeconds;
    formActionTimeoutDuration = acts.timeoutSeconds || 300;
    formActionAddXp = !!acts.addXp;
    formActionAddXpValue = acts.addXp || 50;
    formActionCreateChannel = !!acts.createChannel;
    formActionCreateChannelName = acts.createChannel?.name || '';
    formActionCreateChannelType = acts.createChannel?.type || 'text';
    formActionCreateChannelCategoryId = acts.createChannel?.categoryId || null;
    formActionDeleteChannel = !!acts.deleteChannelId;
    formActionDeleteChannelId = acts.deleteChannelId || null;
    formActionCreateRole = !!acts.createRole;
    formActionCreateRoleName = acts.createRole?.name || '';
    formActionCreateRoleColor = acts.createRole?.color || '#3498db';
    formActionDeleteRole = !!acts.deleteRoleId;
    formActionDeleteRoleId = acts.deleteRoleId || null;

    actionState.clearFeedback();
    showModal = true;
  }

  async function handleSubmit() {
    if (!canManageSettings || !formTrigger) return;
    const computedResponse = responsesToPayload(formResponses);
    
    const finalReactions = formReactionsRaw
      ? formReactionsRaw.split(/[\s,]+/).map(r => r.trim()).filter(Boolean)
      : [];

    const finalActions: any = {};
    if (formActionCreateThread) {
      finalActions.createThread = formActionCreateThreadTemplate.trim() || true;
    }
    if (formActionSendDm && formActionSendDmText.trim()) {
      finalActions.sendDm = formActionSendDmText.trim();
    }
    if (formActionTimeout && formActionTimeoutDuration > 0) {
      finalActions.timeoutSeconds = formActionTimeoutDuration;
    }
    if (formActionAddXp && formActionAddXpValue > 0) {
      finalActions.addXp = formActionAddXpValue;
    }
    if (formActionCreateChannel && formActionCreateChannelName.trim()) {
      finalActions.createChannel = {
        name: formActionCreateChannelName.trim(),
        type: formActionCreateChannelType,
        categoryId: formActionCreateChannelCategoryId,
      };
    }
    if (formActionDeleteChannel && formActionDeleteChannelId) {
      finalActions.deleteChannelId = formActionDeleteChannelId;
    }
    if (formActionCreateRole && formActionCreateRoleName.trim()) {
      finalActions.createRole = {
        name: formActionCreateRoleName.trim(),
        color: formActionCreateRoleColor,
      };
    }
    if (formActionDeleteRole && formActionDeleteRoleId) {
      finalActions.deleteRoleId = formActionDeleteRoleId;
    }

    const hasActions = Object.keys(finalActions).length > 0;

    if (!computedResponse && !formRoleIdToAdd && !formRoleIdToRemove && !formDeleteTrigger && !formCloseTicket && !formRejectForm && finalReactions.length === 0 && !hasActions) {
      actionState.setError("Veuillez configurer au moins une action (réponse, ajout/retrait de rôle, suppression du message, fermeture de ticket, rejet de candidature, réaction, ou action avancée).");
      return;
    }
    
    await actionState.run(async () => {
      const payload = {
        trigger: formTrigger,
        response: computedResponse,
        matchType: formMatchType,
        enabled: formEnabled,
        roleIdToAdd: formRoleIdToAdd,
        roleIdToRemove: formRoleIdToRemove,
        deleteTrigger: formDeleteTrigger,
        allowedRoleIds: formAllowedRoleIds,
        bannedRoleIds: formBannedRoleIds,
        allowedChannelIds: formAllowedChannelIds,
        bannedChannelIds: formBannedChannelIds,
        responseDestination: formResponseDestination,
        responseChannelId: formResponseDestination === 'SPECIFIC_CHANNEL' ? formResponseChannelId : null,
        relayToStaffServer: formRelayToStaffServer,
        triggerType: formTriggerType,
        formId: formFormId,
        formQuestionLabel: formFormQuestionLabel,
        ticketTypeId: formTicketTypeId,
        ticketQuestionLabel: formTicketQuestionLabel,
        closeTicket: formCloseTicket,
        rejectForm: formRejectForm,
        reactions: finalReactions,
        actions: hasActions ? finalActions : null,
      };

      if (isEditing && editingId) {
        const res = await updateAutoResponse(editingId, payload as any);
        if (!res || !res.autoResponse) throw new Error('Erreur de modification');
        list = list.map(item => item.id === editingId ? res.autoResponse : item);
      } else {
        const res = await createAutoResponse(payload as any);
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
    if (!(await confirmDialog.danger('Supprimer ce déclencheur ?'))) return;
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

  function getFormName(formId: string | null) {
    if (!formId) return 'Formulaire inconnu';
    const form = availableForms.find(f => f.id === formId);
    return form ? form.name : `Formulaire (${formId})`;
  }

  function getDestinationLabel(item: typeof list[0]) {
    const destination = item.responseDestination || 'DM';
    if (destination === 'CHANNEL') return 'Salon du déclencheur';
    if (destination === 'SPECIFIC_CHANNEL') {
      const channel = availableChannels.find((c) => c.id === item.responseChannelId);
      return channel ? channelDisplayName(channel) : 'Salon spécifique';
    }
    return 'MP';
  }

  function getTicketTypeName(ticketTypeId: string | null) {
    if (!ticketTypeId) return 'Tous les tickets';
    const type = ticketTypes.find(t => t.id === ticketTypeId);
    return type ? type.label : `Ticket Type (${ticketTypeId})`;
  }

  const matchTypeLabels: Record<string, string> = {
    'EXACT': 'Mot Exact',
    'CONTAINS': 'Contient',
    'REGEX': 'Expression Régulière (Regex)'
  };

  // Multiple selection states
  let selectedIds = $state<Set<string>>(new Set());
  let lastSelectedIndex = $state<number | null>(null);

  const allSelected = $derived(list.length > 0 && selectedIds.size === list.length);

  function toggleSelect(id: string, index: number, event: MouseEvent) {
    const newSelected = new Set(selectedIds);
    if (event.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      for (let i = start; i <= end; i++) {
        newSelected.add(list[i].id);
      }
    } else {
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }
    }
    selectedIds = newSelected;
    lastSelectedIndex = index;
  }

  function toggleSelectAll() {
    if (allSelected) {
      selectedIds = new Set();
    } else {
      selectedIds = new Set(list.map(item => item.id));
    }
    lastSelectedIndex = null;
  }

  async function bulkToggle(enabled: boolean) {
    if (!canManageSettings || selectedIds.size === 0) return;
    await actionState.run(async () => {
      const ids = Array.from(selectedIds);
      let successCount = 0;
      for (const id of ids) {
        const ok = await updateAutoResponse(id, { enabled });
        if (ok) {
          successCount++;
          list = list.map(item => item.id === id ? { ...item, enabled } : item);
        }
      }
      selectedIds = new Set();
      lastSelectedIndex = null;
      return successCount > 0;
    }, { successMessage: `${enabled ? 'Activation' : 'Désactivation'} effectuée sur les déclencheurs sélectionnés.` });
  }

  async function bulkDelete() {
    if (!canManageSettings || selectedIds.size === 0) return;
    if (!(await confirmDialog.danger(`Supprimer ${selectedIds.size} déclencheurs ?`, 'Les déclencheurs sélectionnés seront supprimés définitivement.'))) return;
    await actionState.run(async () => {
      const ids = Array.from(selectedIds);
      let successCount = 0;
      for (const id of ids) {
        const ok = await deleteAutoResponse(id);
        if (ok) {
          successCount++;
          list = list.filter(item => item.id !== id);
        }
      }
      selectedIds = new Set();
      lastSelectedIndex = null;
      return successCount > 0;
    }, { successMessage: `Suppression effectuée.` });
  }
</script>

<ModulePage
  title="Déclencheurs d'actions (Triggers)"
  description="Configurez des actions instantanées (envoi de messages, attribution/retrait de rôles ou modération) basées sur des mots-clés, des formulaires ou des tickets."
  icon="message"
  featureKey="triggers"
>
  {#snippet actions()}
    {#if canManageSettings}
      <button 
        onclick={openCreateModal}
        class="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-on-primary font-semibold uppercase tracking-widest text-[10px] rounded-xl transition-all cursor-pointer"
      >
        <Papicon icon="add" size={16} />
        Nouveau déclencheur
      </button>
    {/if}
  {/snippet}

  <div class="space-y-6">
    <InlineFeedback state={actionState} />

    {#if loading}
      <div class="space-y-4">
        <Skeleton height="100px" radius="2rem" />
        <Skeleton height="100px" radius="2rem" />
        <Skeleton height="100px" radius="2rem" />
      </div>
      <div class="flex justify-center mt-4">
        <LoadingHint context="config" />
      </div>
    {:else}
      <div class="space-y-6">
        <!-- Title & Actions Bar -->
        <div class="flex items-center justify-between gap-4 flex-wrap">
          <div class="flex items-center gap-4">
            <h3 class="text-lg font-semibold flex items-center gap-3 font-headline">
              <Papicon icon="list" size={20} class="text-secondary" />
              Liste des Déclencheurs ({list.length})
            </h3>
            {#if list.length > 0}
              <button 
                onclick={toggleSelectAll}
                class="text-[10px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-xl bg-surface-container-high/40 hover:bg-surface-container-high/80 border border-outline-variant/5 text-on-surface-variant transition-all cursor-pointer select-none"
              >
                {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
              </button>
            {/if}
          </div>
        </div>

        <!-- Triggers Grid -->
        <div class="grid grid-cols-1 gap-4">
          {#each list as item, index}
            <div class="bg-surface-container-low/30 border border-outline-variant/10 p-6 rounded-xl space-y-4 hover:bg-surface-container-low/50 transition-all flex items-start gap-4 {selectedIds.has(item.id) ? 'border-primary/40 bg-primary/5! dark:bg-primary/10!' : ''}">
              <!-- Checkbox -->
              <div class="pt-1 select-none shrink-0">
                <input
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onchange={(e) => toggleSelect(item.id, index, e as any)}
                  class="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary/30 transition-all cursor-pointer accent-primary"
                />
              </div>
              
              <div class="flex-1 min-w-0 space-y-4">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <!-- Trigger details -->
                  <div class="flex items-center gap-3 flex-wrap">
                    <span class="text-[13px] font-medium px-3 py-1 rounded-xl bg-primary/10 text-primary border border-primary/25">
                      {matchTypeLabels[item.matchType] || item.matchType}
                    </span>

                    {#if !item.triggerType || item.triggerType === 'MESSAGE'}
                      <span class="text-[11px] text-on-surface-variant/50 font-bold uppercase tracking-wider">Message :</span>
                      <code class="text-sm font-semibold font-mono bg-surface-container-high/65 px-3 py-1 rounded-xl text-secondary border border-outline-variant/5">{item.trigger}</code>
                    {:else if item.triggerType === 'FORM'}
                      <span class="text-[11px] text-on-surface-variant/50 font-bold uppercase tracking-wider">Formulaire :</span>
                      <span class="text-xs font-semibold bg-surface-container-high/65 px-3 py-1 rounded-xl text-on-surface border border-outline-variant/5">
                        {getFormName(item.formId)} (Question: <code>{item.formQuestionLabel}</code>)
                      </span>
                      <span class="text-[11px] text-on-surface-variant/50 font-bold uppercase tracking-wider">Réponse :</span>
                      <code class="text-sm font-semibold font-mono bg-surface-container-high/65 px-3 py-1 rounded-xl text-secondary border border-outline-variant/5">{item.trigger}</code>
                    {:else if item.triggerType === 'TICKET'}
                      <span class="text-[11px] text-on-surface-variant/50 font-bold uppercase tracking-wider">Ticket :</span>
                      <span class="text-xs font-semibold bg-surface-container-high/65 px-3 py-1 rounded-xl text-on-surface border border-outline-variant/5">
                        {getTicketTypeName(item.ticketTypeId)} (Champ: <code>{item.ticketQuestionLabel === 'description' ? 'Description' : 'Raison'}</code>)
                      </span>
                      <span class="text-[11px] text-on-surface-variant/50 font-bold uppercase tracking-wider">Valeur :</span>
                      <code class="text-sm font-semibold font-mono bg-surface-container-high/65 px-3 py-1 rounded-xl text-secondary border border-outline-variant/5">{item.trigger}</code>
                    {/if}
                  </div>

                  <!-- Status & Card Action Buttons -->
                  <div class="flex items-center gap-4 self-end sm:self-auto">
                    <div class="flex items-center gap-2 bg-surface-container-high/40 px-3 py-1.5 rounded-lg border border-outline-variant/5">
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
                          <Papicon icon="edit" size={16} />
                        </button>
                        <button 
                          onclick={() => handleDelete(item.id)}
                          class="p-2 text-error hover:bg-error/10 rounded-xl transition-all cursor-pointer"
                          title="Supprimer"
                        >
                          <Papicon icon="delete" size={16} />
                        </button>
                      </div>
                    {/if}
                  </div>
                </div>

                <!-- Optional Response text box -->
                {#if item.response}
                  {@const responses = payloadToResponses(item.response)}
                  <div class="space-y-1">
                    <span class="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest block ml-1">
                      {responses.length > 1 ? `Messages de réponse (${getDestinationLabel(item)}) — ${responses.length} variantes :` : `Message de réponse (${getDestinationLabel(item)}) :`}
                    </span>
                    {#each responses as resp, ri}
                      <div class="p-4 bg-surface-container-high/30 border border-outline-variant/5 rounded-lg text-sm font-medium text-on-surface-variant/90 leading-relaxed whitespace-pre-wrap flex items-start gap-3">
                        <span class="flex-1">{resp.message}</span>
                        {#if responses.length > 1}
                          <span class="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">{resp.weight}%</span>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/if}

                <!-- Badges representing actions -->
                <div class="flex flex-wrap gap-2 pt-3 border-t border-outline-variant/10">
                  {#if item.response}
                    {@const badgeResponses = payloadToResponses(item.response)}
                    <span class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/10">
                      <Papicon icon="message" size={10} /> {badgeResponses.length > 1 ? `${badgeResponses.length} Messages` : 'Message'} · {getDestinationLabel(item)}
                    </span>
                  {/if}
                  {#if item.relayToStaffServer}
                    <span class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/10">
                      <Papicon icon="server" size={10} /> Relayé au staff
                    </span>
                  {/if}
                  {#if item.roleIdToAdd}
                    <span class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/10">
                      <Papicon icon="add" size={10} /> Ajouter {getRoleName(item.roleIdToAdd)}
                    </span>
                  {/if}
                  {#if item.roleIdToRemove}
                    <span class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-xl bg-red-500/10 text-red-500 border border-red-500/10">
                      <Papicon icon="delete" size={10} /> Retirer {getRoleName(item.roleIdToRemove)}
                    </span>
                  {/if}
                  {#if item.deleteTrigger && (!item.triggerType || item.triggerType === 'MESSAGE')}
                    <span class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/10">
                      <Papicon icon="close" size={10} /> Supprimer le message
                    </span>
                  {/if}
                  {#if item.closeTicket}
                    <span class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-xl bg-purple-500/10 text-purple-500 border border-purple-500/10">
                      <Papicon icon="close" size={10} /> Fermer le ticket
                    </span>
                  {/if}
                  {#if item.rejectForm}
                    <span class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/10">
                      <Papicon icon="block" size={10} /> Rejeter la candidature
                    </span>
                  {/if}
                  {#if item.allowedRoleIds?.length}
                    <span class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/10">
                      <Papicon icon="shield" size={10} /> Rôles autorisés ({item.allowedRoleIds.length})
                    </span>
                  {/if}
                  {#if item.bannedRoleIds?.length}
                    <span class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/10">
                      <Papicon icon="block" size={10} /> Rôles interdits ({item.bannedRoleIds.length})
                    </span>
                  {/if}
                  {#if item.allowedChannelIds?.length}
                    <span class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/10">
                      <Papicon icon="tag" size={10} /> Salons autorisés ({item.allowedChannelIds.length})
                    </span>
                  {/if}
                  {#if item.bannedChannelIds?.length}
                    <span class="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/10">
                      <Papicon icon="block" size={10} /> Salons interdits ({item.bannedChannelIds.length})
                    </span>
                  {/if}
                </div>
              </div>
            </div>
          {:else}
            <div class="flex flex-col items-center justify-center py-20 bg-surface-container-low/20 border border-outline-variant/10 rounded-xl text-center">
              <Papicon icon="info" size={32} class="text-on-surface-variant/20 mb-3" />
              <p class="text-sm text-on-surface-variant/60 font-medium font-sans">Aucun déclencheur enregistré.</p>
            </div>
          {/each}
        </div>
        <!-- Floating Action Bar for Bulk Actions -->
        {#if selectedIds.size > 0}
          <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-surface-container-high/90 border border-outline-variant/30 px-6 py-4 rounded-xl shadow-sm flex items-center gap-6 animate-in slide-in-from-bottom-6 duration-300 select-none">
            <span class="text-xs font-semibold text-on-surface font-sans">
              {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
            </span>
            <div class="h-6 w-px bg-outline-variant/30"></div>
            <div class="flex items-center gap-2">
              <button 
                onclick={() => bulkToggle(true)}
                class="flex items-center gap-1.5 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/20 text-emerald-500 dark:text-emerald-400 font-semibold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer"
              >
                <Papicon icon="check" size={10} /> Activer
              </button>
              <button 
                onclick={() => bulkToggle(false)}
                class="flex items-center gap-1.5 px-4 py-2 bg-amber-500/10 hover:bg-amber-500/25 border border-amber-500/20 text-amber-500 dark:text-amber-400 font-semibold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer"
              >
                <Papicon icon="block" size={10} /> Désactiver
              </button>
              <button 
                onclick={bulkDelete}
                class="flex items-center gap-1.5 px-4 py-2 bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 text-red-500 dark:text-red-400 font-semibold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer"
              >
                <Papicon icon="delete" size={10} /> Supprimer
              </button>
            </div>
            <div class="h-6 w-px bg-outline-variant/30"></div>
            <button 
              onclick={() => { selectedIds = new Set(); lastSelectedIndex = null; }}
              class="text-[10px] text-on-surface-variant/60 hover:text-on-surface font-semibold uppercase tracking-wider transition-colors cursor-pointer font-sans"
            >
              Annuler
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</ModulePage>

<!-- Modal Creation / Edition -->
{#if showModal}
  <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" transition:fade={{ duration: 150 }}>
    <!-- Modal container -->
    <div class="bg-surface border border-outline-variant/20 max-w-2xl w-full rounded-xl p-8 space-y-6 shadow-sm relative max-h-[92vh] overflow-y-auto" transition:scale={{ start: 0.97, duration: 150 }}>
      
      <!-- Close button -->
      <button 
        onclick={() => showModal = false}
        class="absolute top-6 right-6 p-2 rounded-full hover:bg-rose-500/15 hover:text-rose-500 text-on-surface-variant transition-colors cursor-pointer"
        title="Fermer"
      >
        <Papicon icon="close" size={20} />
      </button>

      <!-- Modal Header -->
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center text-primary shadow-inner">
          <Papicon icon={isEditing ? 'edit' : 'add'} size={24} />
        </div>
        <div>
          <h3 class="text-xl font-semibold tracking-tight font-headline">{isEditing ? 'Modifier le déclencheur' : 'Ajouter un déclencheur'}</h3>
          <p class="text-xs text-on-surface-variant/80 font-medium font-sans">Configurez les conditions et les actions à exécuter.</p>
        </div>
      </div>

      <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-5 pt-2">
        <!-- Tabs Header -->
        <div class="flex border-b border-outline-variant/10 font-headline text-[10px] font-semibold uppercase tracking-wider mb-6">
          <button
            type="button"
            class="tab-button {activeTab === 'trigger' ? 'active' : ''}"
            onclick={() => activeTab = 'trigger'}
          >
            <span class="flex items-center justify-center gap-1.5">
              <Papicon icon="message" size={12} />
              Déclencheur
            </span>
          </button>
          <button
            type="button"
            class="tab-button {activeTab === 'actions' ? 'active' : ''}"
            onclick={() => activeTab = 'actions'}
          >
            <span class="flex items-center justify-center gap-1.5">
              <Papicon icon="list" size={12} />
              Actions de Base
            </span>
          </button>
          <button
            type="button"
            class="tab-button {activeTab === 'advanced' ? 'active' : ''}"
            onclick={() => activeTab = 'advanced'}
          >
            <span class="flex items-center justify-center gap-1.5">
              <Papicon icon="add" size={12} />
              Réactions & Avancé
            </span>
          </button>
          <button
            type="button"
            class="tab-button {activeTab === 'filters' ? 'active' : ''}"
            onclick={() => activeTab = 'filters'}
          >
            <span class="flex items-center justify-center gap-1.5">
              <Papicon icon="shield" size={12} />
              Filtres
            </span>
          </button>
        </div>

        {#if activeTab === 'trigger'}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <label for="modal-trigger-type" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest font-sans">Type de déclencheur</label>
              <select 
                id="modal-trigger-type"
                bind:value={formTriggerType}
                class="w-full bg-surface-container rounded-lg px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/30 border border-outline-variant/10 focus:outline-none cursor-pointer font-sans"
                disabled={!canManageSettings}
              >
                <option value="MESSAGE">Message Discord (Mot-clé)</option>
                <option value="FORM">Soumission de Formulaire</option>
                <option value="TICKET">Ouverture de Ticket</option>
              </select>
            </div>

            <div class="space-y-1.5">
              <label for="modal-matchType" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest font-sans">Type de correspondance</label>
              <select 
                id="modal-matchType"
                bind:value={formMatchType}
                class="w-full bg-surface-container rounded-lg px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/30 border border-outline-variant/10 focus:outline-none cursor-pointer font-sans"
                disabled={!canManageSettings}
              >
                <option value="CONTAINS">Contient le texte</option>
                <option value="EXACT">Correspondance exacte</option>
                <option value="REGEX">Expression régulière (Regex)</option>
              </select>
            </div>
          </div>

          <!-- Si type MESSAGE -->
          {#if formTriggerType === 'MESSAGE'}
            <div class="space-y-1.5">
              <label for="modal-trigger" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest font-sans">Mot-clé / Déclencheur</label>
              <input 
                id="modal-trigger"
                type="text" 
                bind:value={formTrigger} 
                placeholder="Ex: !ip ou bonjour"
                class="w-full bg-surface-container rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 border border-outline-variant/10 text-on-surface focus:outline-none font-sans"
                required
                disabled={!canManageSettings}
              />
            </div>
          {/if}

          <!-- Si type FORM -->
          {#if formTriggerType === 'FORM'}
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div class="space-y-1.5 sm:col-span-1">
                <label for="modal-form-select" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest font-sans">Formulaire</label>
                <select
                  id="modal-form-select"
                  bind:value={formFormId}
                  class="w-full bg-surface-container rounded-lg px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/30 border border-outline-variant/10 focus:outline-none cursor-pointer font-sans"
                  disabled={!canManageSettings}
                  required
                >
                  <option value={null} disabled>— Choisir un formulaire —</option>
                  {#each availableForms as f}
                    <option value={f.id}>{f.name}</option>
                  {/each}
                </select>
              </div>
              <div class="space-y-1.5 sm:col-span-1">
                <label for="modal-form-question" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest font-sans">Question (Libellé / ID)</label>
                <input 
                  id="modal-form-question"
                  type="text" 
                  bind:value={formFormQuestionLabel} 
                  placeholder="Ex: Nom / Pseudo ou age"
                  class="w-full bg-surface-container rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 border border-outline-variant/10 text-on-surface focus:outline-none font-sans"
                  required
                  disabled={!canManageSettings}
                />
              </div>
              <div class="space-y-1.5 sm:col-span-1">
                <label for="modal-form-answer-trigger" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest font-sans">Valeur à faire correspondre</label>
                <input 
                  id="modal-form-answer-trigger"
                  type="text" 
                  bind:value={formTrigger} 
                  placeholder="Ex: xavier ou Oui"
                  class="w-full bg-surface-container rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 border border-outline-variant/10 text-on-surface focus:outline-none font-sans"
                  required
                  disabled={!canManageSettings}
                />
              </div>
            </div>
          {/if}

          <!-- Si type TICKET -->
          {#if formTriggerType === 'TICKET'}
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div class="space-y-1.5 sm:col-span-1">
                <label for="modal-ticket-type" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest font-sans">Type de Ticket</label>
                <select
                  id="modal-ticket-type"
                  bind:value={formTicketTypeId}
                  class="w-full bg-surface-container rounded-lg px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/30 border border-outline-variant/10 focus:outline-none cursor-pointer font-sans"
                  disabled={!canManageSettings}
                >
                  <option value={null}>— Tous les types —</option>
                  {#each ticketTypes as t}
                    <option value={t.id}>{t.label}</option>
                  {/each}
                </select>
              </div>
              <div class="space-y-1.5 sm:col-span-1">
                <label for="modal-ticket-field" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest font-sans">Champ à vérifier</label>
                <select
                  id="modal-ticket-field"
                  bind:value={formTicketQuestionLabel}
                  class="w-full bg-surface-container rounded-lg px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/30 border border-outline-variant/10 focus:outline-none cursor-pointer font-sans"
                  disabled={!canManageSettings}
                >
                  <option value="reason">Raison (Titre)</option>
                  <option value="description">Description (Détails)</option>
                </select>
              </div>
              <div class="space-y-1.5 sm:col-span-1">
                <label for="modal-ticket-value-trigger" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest font-sans">Valeur à faire correspondre</label>
                <input 
                  id="modal-ticket-value-trigger"
                  type="text" 
                  bind:value={formTrigger} 
                  placeholder="Ex: plainte ou partenariat"
                  class="w-full bg-surface-container rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 border border-outline-variant/10 text-on-surface focus:outline-none font-sans"
                  required
                  disabled={!canManageSettings}
                />
              </div>
            </div>
          {/if}
        {/if}

        {#if activeTab === 'actions'}
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest font-sans">
                Réponse(s) du Bot (Optionnelle{formResponses.length > 1 ? 's' : ''})
              </span>
              {#if formResponses.length > 1}
                <span class="text-[10px] font-semibold px-2.5 py-1 rounded-lg {totalWeight === 100 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'} font-sans">
                  Total : {totalWeight}%
                </span>
              {/if}
            </div>

            {#each formResponses as entry, i}
              <div class="flex gap-3 items-start">
                <div class="flex-1">
                  <textarea
                    bind:value={entry.message}
                    placeholder="Texte envoyé par le bot..."
                    class="w-full bg-surface-container rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 border border-outline-variant/10 text-on-surface focus:outline-none h-20 resize-none font-sans"
                    disabled={!canManageSettings}
                  ></textarea>
                </div>
                {#if formResponses.length > 1}
                  <div class="flex flex-col items-center gap-1 shrink-0 w-20">
                    <label for="weight-{i}" class="text-[9px] font-bold text-on-surface-variant/40 uppercase tracking-wider font-sans">Taux %</label>
                    <input
                      id="weight-{i}"
                      type="number"
                      min="0"
                      max="100"
                      bind:value={entry.weight}
                      class="w-full bg-surface-container rounded-lg px-2 py-2 text-sm text-center focus:ring-2 focus:ring-primary/30 border border-outline-variant/10 text-on-surface focus:outline-none font-sans"
                      disabled={!canManageSettings}
                    />
                  </div>
                  <button
                    type="button"
                    onclick={() => removeResponseEntry(i)}
                    class="mt-6 p-1.5 text-error/60 hover:text-error hover:bg-error/10 rounded-lg transition-all cursor-pointer shrink-0"
                    title="Retirer ce message"
                    disabled={!canManageSettings}
                  >
                    <Papicon icon="close" size={14} />
                  </button>
                {/if}
              </div>
            {/each}

            <button
              type="button"
              onclick={addResponseEntry}
              class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary hover:text-primary-hover px-3 py-2 rounded-lg hover:bg-primary/10 transition-all cursor-pointer font-sans"
              disabled={!canManageSettings}
            >
              <Papicon icon="add" size={12} />
              Ajouter une réponse alternative
            </button>

            {#if formResponses.length > 1 && totalWeight !== 100}
              <p class="text-[10px] text-amber-500 font-medium ml-2 font-sans">
                Le total des taux d'apparition devrait idéalement être de 100% (actuellement {totalWeight}%).
              </p>
            {/if}
          </div>

          <div class="space-y-2 font-sans">
            <span class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest block">Destination du message</span>
            <div class="grid grid-cols-3 gap-2">
              <button
                type="button"
                onclick={() => formResponseDestination = 'DM'}
                disabled={!canManageSettings}
                class="flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all cursor-pointer disabled:cursor-not-allowed {formResponseDestination === 'DM' ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/10 bg-surface-container-high/20 text-on-surface-variant hover:bg-surface-container-high/40'}"
              >
                <Papicon icon="mail" size={18} />
                <span class="text-[10px] font-semibold uppercase tracking-wide">Message Privé</span>
              </button>
              <button
                type="button"
                onclick={() => formResponseDestination = 'CHANNEL'}
                disabled={!canManageSettings}
                class="flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all cursor-pointer disabled:cursor-not-allowed {formResponseDestination === 'CHANNEL' ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/10 bg-surface-container-high/20 text-on-surface-variant hover:bg-surface-container-high/40'}"
              >
                <Papicon icon="hashtag" size={18} />
                <span class="text-[10px] font-semibold uppercase tracking-wide">Salon actuel</span>
              </button>
              <button
                type="button"
                onclick={() => formResponseDestination = 'SPECIFIC_CHANNEL'}
                disabled={!canManageSettings}
                class="flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all cursor-pointer disabled:cursor-not-allowed {formResponseDestination === 'SPECIFIC_CHANNEL' ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/10 bg-surface-container-high/20 text-on-surface-variant hover:bg-surface-container-high/40'}"
              >
                <Papicon icon="send" size={18} />
                <span class="text-[10px] font-semibold uppercase tracking-wide">Salon précis</span>
              </button>
            </div>

            {#if formTriggerType === 'FORM' && formResponseDestination === 'CHANNEL'}
              <p class="text-[10px] text-amber-500 ml-2">Un formulaire n'a pas de salon d'origine : le message sera envoyé en MP.</p>
            {/if}

            {#if formResponseDestination === 'SPECIFIC_CHANNEL'}
              <SearchableSelect
                id="modal-response-channel"
                bind:value={formResponseChannelId}
                options={availableChannels.map(c => ({ id: c.id, name: channelDisplayName(c) }))}
                placeholder="— Choisir un salon —"
                className="w-full rounded-lg bg-surface-container px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/30 transition-all font-sans"
                disabled={!canManageSettings}
              />
            {/if}

            <div class="flex items-center justify-between p-3 rounded-lg bg-surface-container-high/20 border border-outline-variant/5">
              <div class="flex items-center gap-2.5">
                <Papicon icon="server" size={16} class="text-on-surface-variant/60" />
                <div>
                  <p class="text-sm font-bold">Relayer sur le serveur staff</p>
                  <p class="text-[10px] text-on-surface-variant/50">Envoie aussi une copie sur le salon de logs du serveur staff lié (si configuré)</p>
                </div>
              </div>
              <ToggleSwitch
                checked={formRelayToStaffServer}
                onToggle={(v: boolean) => formRelayToStaffServer = v}
                disabled={!canManageSettings}
              />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <label for="modal-roleIdToAdd" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest font-sans">Rôle à ajouter (Optionnel)</label>
              <SearchableSelect 
                id="modal-roleIdToAdd"
                bind:value={formRoleIdToAdd}
                options={availableRoles.map(r => ({ id: r.id, name: `@${r.name}` }))}
                placeholder="— Aucun rôle —"
                className="w-full rounded-lg bg-surface-container px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/30 transition-all font-sans"
                disabled={!canManageSettings}
              />
            </div>

            <div class="space-y-1.5">
              <label for="modal-roleIdToRemove" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest font-sans">Rôle à retirer (Optionnel)</label>
              <SearchableSelect 
                id="modal-roleIdToRemove"
                bind:value={formRoleIdToRemove}
                options={availableRoles.map(r => ({ id: r.id, name: `@${r.name}` }))}
                placeholder="— Aucun rôle —"
                className="w-full rounded-lg bg-surface-container px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/30 transition-all font-sans"
                disabled={!canManageSettings}
              />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 font-sans">
            {#if !formTriggerType || formTriggerType === 'MESSAGE'}
              <div class="flex items-center justify-between p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5">
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
            {/if}

            {#if formTriggerType === 'TICKET' || formTriggerType === 'MESSAGE'}
              <div class="flex items-center justify-between p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5">
                <div>
                  <p class="text-sm font-bold">Fermer le ticket</p>
                  <p class="text-[10px] text-on-surface-variant/50">Ferme automatiquement le ticket</p>
                </div>
                <ToggleSwitch 
                  checked={formCloseTicket} 
                  onToggle={(v: boolean) => formCloseTicket = v} 
                  disabled={!canManageSettings}
                />
              </div>
            {/if}

            {#if formTriggerType === 'FORM'}
              <div class="flex items-center justify-between p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5">
                <div>
                  <p class="text-sm font-bold">Rejeter la candidature</p>
                  <p class="text-[10px] text-on-surface-variant/50">Rejette automatiquement la candidature ou le formulaire</p>
                </div>
                <ToggleSwitch 
                  checked={formRejectForm} 
                  onToggle={(v: boolean) => formRejectForm = v} 
                  disabled={!canManageSettings}
                />
              </div>
            {/if}

            <div class="flex items-center justify-between p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5">
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
        {/if}

        {#if activeTab === 'advanced'}
          <!-- Emojis Reactions -->
          <div class="space-y-1.5 font-sans">
            <label for="modal-reactions" class="text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest font-sans flex items-center gap-1.5">
              <Papicon icon="emoji" size={12} /> Réactions (Optionnel)
            </label>
            <div class="flex gap-2 items-start">
              <input
                id="modal-reactions"
                type="text"
                bind:value={formReactionsRaw}
                placeholder="Séparées par des virgules ou espaces"
                class="flex-1 bg-surface-container rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 border border-outline-variant/10 text-on-surface focus:outline-none font-sans"
                disabled={!canManageSettings}
              />
              <EmojiPicker bind:value={pickerEmoji} disabled={!canManageSettings} />
              <div class="relative shrink-0" bind:this={customEmojiPickerEl}>
                <button
                  type="button"
                  onclick={() => showCustomEmojiPicker = !showCustomEmojiPicker}
                  disabled={!canManageSettings || customEmojis.length === 0}
                  class="flex h-11 w-11 items-center justify-center rounded-lg bg-surface-container-high/60 border border-outline-variant/10 hover:bg-surface-container-high hover:border-outline-variant/35 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Émojis personnalisés du serveur"
                >
                  <Papicon icon="grid" size={18} class="text-on-surface-variant" />
                </button>
                {#if showCustomEmojiPicker}
                  <div class="absolute right-0 bottom-full mb-2 z-100 w-64 bg-surface border border-outline-variant/20 rounded-xl p-3 shadow-sm">
                    <div class="grid grid-cols-6 gap-1 max-h-40 overflow-y-auto pr-1">
                      {#each customEmojis as ce}
                        <button
                          type="button"
                          onclick={() => { addReactionEmoji(`<${ce.animated ? 'a' : ''}:${ce.name}:${ce.id}>`); showCustomEmojiPicker = false; }}
                          class="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-primary/10 transition-all cursor-pointer"
                          title={ce.name}
                        >
                          <img src={ce.url} alt={ce.name} class="h-6 w-6 object-contain" />
                        </button>
                      {/each}
                      {#if customEmojis.length === 0}
                        <div class="col-span-6 text-center text-[10px] text-on-surface-variant/40 italic py-4">Aucun émoji personnalisé</div>
                      {/if}
                    </div>
                  </div>
                {/if}
              </div>
            </div>

            {#if reactionTokens.length > 0}
              <div class="flex flex-wrap gap-1.5 pt-1">
                {#each reactionTokens as token}
                  {@const disp = reactionTokenDisplay(token)}
                  <span class="inline-flex items-center gap-1.5 text-xs pl-2 pr-1.5 py-1 rounded-lg bg-surface-container-high/50 border border-outline-variant/10">
                    {#if disp.isCustom}
                      <img src={disp.url} alt={disp.label} class="h-4 w-4 object-contain" />
                    {:else}
                      <span>{disp.label}</span>
                    {/if}
                    <button
                      type="button"
                      onclick={() => removeReactionEmoji(token)}
                      disabled={!canManageSettings}
                      class="text-on-surface-variant/40 hover:text-error cursor-pointer disabled:cursor-not-allowed"
                      title="Retirer"
                    >
                      <Papicon icon="close" size={10} />
                    </button>
                  </span>
                {/each}
              </div>
            {/if}
            <p class="text-[10px] text-on-surface-variant/50 ml-2">Le bot réagira automatiquement au message avec ces émojis.</p>
          </div>

          <!-- Advanced actions listing -->
          <div class="space-y-4 pt-2 font-sans max-h-[40vh] overflow-y-auto pr-1">
            <p class="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest ml-1">Actions avancées</p>

            <!-- Action: Create Thread -->
            <div class="p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-bold flex items-center gap-1.5">
                    <Papicon icon="message" size={16} />
                    Créer un Fil de discussion (Thread)
                  </p>
                  <p class="text-[10px] text-on-surface-variant/50">Crée automatiquement un fil public rattaché au message</p>
                </div>
                <ToggleSwitch 
                  checked={formActionCreateThread} 
                  onToggle={(v: boolean) => formActionCreateThread = v} 
                  disabled={!canManageSettings}
                />
              </div>
              {#if formActionCreateThread}
                <div class="space-y-1 pt-1">
                  <label for="thread-template" class="text-[10px] font-semibold text-on-surface-variant/60 uppercase">Modèle de nom du fil (Optionnel)</label>
                  <input 
                    id="thread-template"
                    type="text" 
                    bind:value={formActionCreateThreadTemplate} 
                    placeholder="Ex: Forum de {user} - {content}"
                    class="w-full bg-surface-container rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-primary/30 border border-outline-variant/10 text-on-surface focus:outline-none font-sans"
                    disabled={!canManageSettings}
                  />
                  <p class="text-[9px] text-on-surface-variant/40">Variables utilisables: <code>{`{user}`}</code> (nom d'auteur), <code>{`{content}`}</code> (début du message)</p>
                </div>
              {/if}
            </div>

            <!-- Action: Send DM -->
            <div class="p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-bold flex items-center gap-1.5">
                    <Papicon icon="message" size={16} />
                    Envoyer un message privé (DM)
                  </p>
                  <p class="text-[10px] text-on-surface-variant/50">Envoie un message direct à l'utilisateur qui a déclenché le trigger</p>
                </div>
                <ToggleSwitch 
                  checked={formActionSendDm} 
                  onToggle={(v: boolean) => formActionSendDm = v} 
                  disabled={!canManageSettings}
                />
              </div>
              {#if formActionSendDm}
                <div class="space-y-1 pt-1">
                  <label for="dm-text" class="text-[10px] font-semibold text-on-surface-variant/60 uppercase">Message à envoyer</label>
                  <textarea 
                    id="dm-text"
                    bind:value={formActionSendDmText} 
                    placeholder="Votre message secret ou d'avertissement..."
                    class="w-full bg-surface-container rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-primary/30 border border-outline-variant/10 text-on-surface focus:outline-none h-16 resize-none font-sans"
                    disabled={!canManageSettings}
                    required
                  ></textarea>
                </div>
              {/if}
            </div>

            <!-- Action: Timeout -->
            <div class="p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-bold flex items-center gap-1.5">
                    <Papicon icon="block" size={16} />
                    Exclusion Temporaire (Timeout)
                  </p>
                  <p class="text-[10px] text-on-surface-variant/50">Exclut (mute) temporairement le membre du serveur</p>
                </div>
                <ToggleSwitch 
                  checked={formActionTimeout} 
                  onToggle={(v: boolean) => formActionTimeout = v} 
                  disabled={!canManageSettings}
                />
              </div>
              {#if formActionTimeout}
                <div class="space-y-1 pt-1 flex items-center gap-4">
                  <div class="flex-1">
                    <label for="timeout-duration" class="text-[10px] font-semibold text-on-surface-variant/60 uppercase">Durée du Timeout (en secondes)</label>
                    <input 
                      id="timeout-duration"
                      type="number" 
                      min="5"
                      bind:value={formActionTimeoutDuration} 
                      class="w-full bg-surface-container rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-primary/30 border border-outline-variant/10 text-on-surface focus:outline-none font-sans"
                      disabled={!canManageSettings}
                      required
                    />
                  </div>
                  <div class="pt-4 text-xs font-semibold text-on-surface-variant/50">
                    = {Math.round(formActionTimeoutDuration / 60)} minutes
                  </div>
                </div>
              {/if}
            </div>

            <!-- Action: Add XP -->
            <div class="p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-bold flex items-center gap-1.5">
                    <Papicon icon="add" size={16} />
                    Attribuer des points d'XP
                  </p>
                  <p class="text-[10px] text-on-surface-variant/50">Donne de l'XP de progression au membre</p>
                </div>
                <ToggleSwitch 
                  checked={formActionAddXp} 
                  onToggle={(v: boolean) => formActionAddXp = v} 
                  disabled={!canManageSettings}
                />
              </div>
              {#if formActionAddXp}
                <div class="space-y-1 pt-1">
                  <label for="xp-value" class="text-[10px] font-semibold text-on-surface-variant/60 uppercase">Nombre d'XP à attribuer</label>
                  <input 
                    id="xp-value"
                    type="number" 
                    min="1"
                    bind:value={formActionAddXpValue} 
                    class="w-full bg-surface-container rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-primary/30 border border-outline-variant/10 text-on-surface focus:outline-none font-sans"
                    disabled={!canManageSettings}
                    required
                  />
                </div>
              {/if}
            </div>

            <!-- Action: Create Channel -->
            <div class="p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-bold flex items-center gap-1.5">
                    <Papicon icon="add" size={16} />
                    Créer un salon / catégorie
                  </p>
                  <p class="text-[10px] text-on-surface-variant/50">Crée un nouveau salon Discord dynamique</p>
                </div>
                <ToggleSwitch 
                  checked={formActionCreateChannel} 
                  onToggle={(v: boolean) => formActionCreateChannel = v} 
                  disabled={!canManageSettings}
                />
              </div>
              {#if formActionCreateChannel}
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div class="space-y-1">
                    <label for="create-chan-name" class="text-[10px] font-semibold text-on-surface-variant/60 uppercase">Nom du salon</label>
                    <input 
                      id="create-chan-name"
                      type="text" 
                      bind:value={formActionCreateChannelName} 
                      placeholder="nom-du-salon"
                      class="w-full bg-surface-container rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-primary/30 border border-outline-variant/10 text-on-surface focus:outline-none font-sans"
                      disabled={!canManageSettings}
                      required
                    />
                  </div>
                  <div class="space-y-1">
                    <label for="create-chan-type" class="text-[10px] font-semibold text-on-surface-variant/60 uppercase">Type</label>
                    <select 
                      id="create-chan-type"
                      bind:value={formActionCreateChannelType}
                      class="w-full bg-surface-container rounded-lg px-3 py-2 text-xs text-on-surface focus:ring-2 focus:ring-primary/30 border border-outline-variant/10 focus:outline-none cursor-pointer font-sans"
                      disabled={!canManageSettings}
                    >
                      <option value="text">Texte</option>
                      <option value="voice">Vocal</option>
                      <option value="category">Catégorie</option>
                    </select>
                  </div>
                  <div class="space-y-1">
                    <label for="create-chan-cat" class="text-[10px] font-semibold text-on-surface-variant/60 uppercase">Catégorie parente</label>
                    <SearchableSelect 
                      id="create-chan-cat"
                      bind:value={formActionCreateChannelCategoryId}
                      options={availableChannels.filter(c => c.type === 4 || c.type === 'category').map(c => ({ id: c.id, name: c.name }))}
                      placeholder="— Aucune —"
                      className="w-full rounded-lg bg-surface-container px-3 py-2 text-xs text-on-surface focus:ring-2 focus:ring-primary/30 transition-all font-sans"
                      disabled={!canManageSettings}
                    />
                  </div>
                </div>
              {/if}
            </div>

            <!-- Action: Delete Channel -->
            <div class="p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-bold flex items-center gap-1.5">
                    <Papicon icon="delete" size={16} />
                    Supprimer un salon / catégorie
                  </p>
                  <p class="text-[10px] text-on-surface-variant/50">Supprime le salon ou la catégorie cible</p>
                </div>
                <ToggleSwitch 
                  checked={formActionDeleteChannel} 
                  onToggle={(v: boolean) => formActionDeleteChannel = v} 
                  disabled={!canManageSettings}
                />
              </div>
              {#if formActionDeleteChannel}
                <div class="space-y-1 pt-1">
                  <label for="delete-chan-select" class="text-[10px] font-semibold text-on-surface-variant/60 uppercase">Salon à supprimer</label>
                  <SearchableSelect 
                    id="delete-chan-select"
                    bind:value={formActionDeleteChannelId}
                    options={availableChannels.map(c => ({ id: c.id, name: channelDisplayName(c) }))}
                    placeholder="— Sélectionner un salon —"
                    className="w-full rounded-lg bg-surface-container px-3 py-2 text-xs text-on-surface focus:ring-2 focus:ring-primary/30 transition-all font-sans"
                    disabled={!canManageSettings}
                  />
                </div>
              {/if}
            </div>

            <!-- Action: Create Role -->
            <div class="p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-bold flex items-center gap-1.5">
                    <Papicon icon="shield" size={16} />
                    Créer un rôle
                  </p>
                  <p class="text-[10px] text-on-surface-variant/50">Crée un nouveau rôle sur le serveur</p>
                </div>
                <ToggleSwitch 
                  checked={formActionCreateRole} 
                  onToggle={(v: boolean) => formActionCreateRole = v} 
                  disabled={!canManageSettings}
                />
              </div>
              {#if formActionCreateRole}
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div class="space-y-1">
                    <label for="create-role-name" class="text-[10px] font-semibold text-on-surface-variant/60 uppercase">Nom du rôle</label>
                    <input 
                      id="create-role-name"
                      type="text" 
                      bind:value={formActionCreateRoleName} 
                      placeholder="Nouveau Rôle"
                      class="w-full bg-surface-container rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-primary/30 border border-outline-variant/10 text-on-surface focus:outline-none font-sans"
                      disabled={!canManageSettings}
                      required
                    />
                  </div>
                  <div class="space-y-1">
                    <label for="create-role-color" class="text-[10px] font-semibold text-on-surface-variant/60 uppercase">Couleur</label>
                    <div class="flex gap-2 items-center">
                      <input 
                        id="create-role-color"
                        type="color" 
                        bind:value={formActionCreateRoleColor} 
                        class="w-8 h-8 rounded border-none cursor-pointer bg-transparent"
                        disabled={!canManageSettings}
                      />
                      <input 
                        type="text" 
                        bind:value={formActionCreateRoleColor} 
                        placeholder="#3498db"
                        class="flex-1 bg-surface-container rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/30 border border-outline-variant/10 text-on-surface focus:outline-none font-mono"
                        disabled={!canManageSettings}
                        required
                      />
                    </div>
                  </div>
                </div>
              {/if}
            </div>

            <!-- Action: Delete Role -->
            <div class="p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-bold flex items-center gap-1.5">
                    <Papicon icon="delete" size={16} />
                    Supprimer un rôle
                  </p>
                  <p class="text-[10px] text-on-surface-variant/50">Supprime définitivement un rôle du serveur</p>
                </div>
                <ToggleSwitch 
                  checked={formActionDeleteRole} 
                  onToggle={(v: boolean) => formActionDeleteRole = v} 
                  disabled={!canManageSettings}
                />
              </div>
              {#if formActionDeleteRole}
                <div class="space-y-1 pt-1">
                  <label for="delete-role-select" class="text-[10px] font-semibold text-on-surface-variant/60 uppercase">Rôle à supprimer</label>
                  <SearchableSelect 
                    id="delete-role-select"
                    bind:value={formActionDeleteRoleId}
                    options={availableRoles.map(r => ({ id: r.id, name: `@${r.name}` }))}
                    placeholder="— Sélectionner un rôle —"
                    className="w-full rounded-lg bg-surface-container px-3 py-2 text-xs text-on-surface focus:ring-2 focus:ring-primary/30 transition-all font-sans"
                    disabled={!canManageSettings}
                  />
                </div>
              {/if}
            </div>
          </div>
        {/if}

        {#if activeTab === 'filters'}
          <div class="space-y-4 font-sans">
            <p class="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest ml-1">Limiter le déclenchement aux salons/rôles spécifiques</p>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label class="text-[10px] font-bold text-violet-400/80 ml-1 uppercase tracking-widest flex items-center gap-1.5">
                  <Papicon icon="shield" size={11} /> Rôles autorisés
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

              <div class="space-y-1.5">
                <label class="text-[10px] font-bold text-rose-400/80 ml-1 uppercase tracking-widest flex items-center gap-1.5">
                  <Papicon icon="block" size={11} /> Rôles interdits
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

              <div class="space-y-1.5">
                <label class="text-[10px] font-bold text-sky-400/80 ml-1 uppercase tracking-widest flex items-center gap-1.5">
                  <Papicon icon="tag" size={11} /> Salons autorisés
                  <span class="text-on-surface-variant/30 normal-case font-normal">— vide = tous</span>
                </label>
                <MultiSelect
                  id="filter-allowed-channels"
                  bind:values={formAllowedChannelIds}
                  options={availableChannels.map(c => ({ id: c.id, name: channelDisplayName(c) }))}
                  placeholder="Rechercher un salon…"
                  accentClass="bg-sky-500/20 text-sky-300 border-sky-500/40"
                  disabled={!canManageSettings}
                />
              </div>

              <div class="space-y-1.5">
                <label class="text-[10px] font-bold text-orange-400/80 ml-1 uppercase tracking-widest flex items-center gap-1.5">
                  <Papicon icon="block" size={11} /> Salons interdits
                </label>
                <MultiSelect
                  id="filter-banned-channels"
                  bind:values={formBannedChannelIds}
                  options={availableChannels.map(c => ({ id: c.id, name: channelDisplayName(c) }))}
                  placeholder="Rechercher un salon…"
                  accentClass="bg-orange-500/20 text-orange-300 border-orange-500/40"
                  disabled={!canManageSettings}
                />
              </div>
            </div>
          </div>
        {/if}

        <div class="flex justify-end gap-3 pt-4 border-t border-outline-variant/10 font-sans">
          <button 
            type="button"
            onclick={() => showModal = false}
            class="px-6 py-3 bg-outline-variant/20 hover:bg-outline-variant/30 text-on-surface text-[13px] font-medium rounded-lg transition-all cursor-pointer"
          >
            Annuler
          </button>
          {#if canManageSettings}
            <button 
              type="submit"
              class="px-8 py-3 bg-primary text-on-primary font-medium text-[13px] rounded-lg transition-all cursor-pointer"
            >
              Enregistrer
            </button>
          {/if}
        </div>
      </form>
    </div>
  </div>
{/if}
