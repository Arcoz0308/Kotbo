<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { toast } from '../lib/stores/toast.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import {
    fetchStaffServerLinks,
    createStaffServerLink,
    updateStaffServerLink,
    deleteStaffServerLink,
    addStaffServerRoleMapping,
    deleteStaffServerRoleMapping,
    syncStaffServerRoles,
    fetchStaffServerChannels,
  } from '../lib/api';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import Modal from '../lib/components/Modal.svelte';

  let links = $state<any[]>([]);
  let loading = $state(true);

  // Create link modal
  let showCreateModal = $state(false);
  let newStaffGuildId = $state('');
  let newSyncMode = $state('MAIN_TO_STAFF');
  let newSimpleStaffRoleId = $state('');
  let newMainLogChannelId = $state('');

  // Mapping modal
  let showMappingModal = $state(false);
  let mappingLinkId = $state('');
  let newMainRoleId = $state('');
  let newStaffRoleId = $state('');

  // Sync state
  let syncingLinkId = $state('');

  // Delete confirm
  let showDeleteModal = $state(false);
  let deleteTargetId = $state('');

  // Expanded link details
  let expandedLinkId = $state<string | null>(null);

  const saveAction = createAsyncActionState();

  const channels = $derived(
    dashboardStore.state.discordChannels?.filter((c: any) => c.type === 'text') ?? []
  );
  const roles = $derived(
    dashboardStore.state.discordRoles ?? []
  );

  const syncModeLabels: Record<string, string> = {
    MAIN_TO_STAFF: 'Principal → Staff',
    STAFF_TO_MAIN: 'Staff → Principal',
    BIDIRECTIONAL: 'Bidirectionnel',
  };

  const syncModeDescriptions: Record<string, string> = {
    MAIN_TO_STAFF: 'La hiérarchie est gérée ici, un rôle simple est donné sur le serveur staff',
    STAFF_TO_MAIN: 'La hiérarchie est gérée sur le serveur staff, un rôle simple est donné ici',
    BIDIRECTIONAL: 'La hiérarchie est synchronisée sur les deux serveurs',
  };

  async function loadData() {
    loading = true;
    try {
      const data = await fetchStaffServerLinks();
      links = data ?? [];
    } catch (err) {
      toast.error('Erreur lors du chargement');
    } finally {
      loading = false;
    }
  }

  // Salons du serveur staff lié, pour les pickers de notifications cross-serveur
  let staffChannels = $state<any[]>([]);
  let staffCategories = $state<any[]>([]);
  let staffGuildChannelsName = $state<string | null>(null);

  async function loadStaffChannels() {
    try {
      const data = await fetchStaffServerChannels();
      if (data?.staffGuildId) {
        staffChannels = data.channels ?? [];
        staffCategories = data.categories ?? [];
        staffGuildChannelsName = data.staffGuildName ?? data.staffGuildId;
      }
    } catch {
      // pas de lien actif côté principal
    }
  }

  async function handleConfigChange(linkId: string, field: string, value: unknown) {
    try {
      await updateStaffServerLink(linkId, { [field]: value });
      toast.success('Configuration enregistrée');
      await loadData();
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    }
  }

  onMount(() => {
    dashboardStore.refresh();
    loadData();
    loadStaffChannels();
  });

  async function handleCreate() {
    if (!newStaffGuildId) {
      toast.error('Entrez l\'ID du serveur staff');
      return;
    }
    await saveAction.run(async () => {
      const result = await createStaffServerLink({
        staffGuildId: newStaffGuildId,
        syncMode: newSyncMode,
        simpleStaffRoleId: newSimpleStaffRoleId || null,
        mainLogChannelId: newMainLogChannelId || null,
      });
      if (result) {
        showCreateModal = false;
        newStaffGuildId = '';
        await loadData();
        return true;
      }
      return false;
    }, { successMessage: 'Serveur staff lié avec succès' });
  }

  async function handleToggle(linkId: string, enabled: boolean) {
    await updateStaffServerLink(linkId, { enabled });
    await loadData();
  }

  async function handleAddMapping() {
    if (!newMainRoleId && !newStaffRoleId) {
      toast.error('Spécifiez au moins un rôle');
      return;
    }
    await saveAction.run(async () => {
      const result = await addStaffServerRoleMapping(mappingLinkId, {
        mainDiscordRoleId: newMainRoleId || null,
        staffDiscordRoleId: newStaffRoleId || null,
      });
      if (result) {
        showMappingModal = false;
        newMainRoleId = '';
        newStaffRoleId = '';
        await loadData();
        return true;
      }
      return false;
    }, { successMessage: 'Mapping ajouté' });
  }

  async function handleDeleteMapping(linkId: string, mappingId: string) {
    const ok = await deleteStaffServerRoleMapping(linkId, mappingId);
    if (ok) await loadData();
  }

  async function handleSync(linkId: string) {
    syncingLinkId = linkId;
    try {
      const result = await syncStaffServerRoles(linkId);
      if (result) {
        toast.success(`Sync terminée : ${result.synced} action(s), ${result.errors} erreur(s)`);
      }
    } catch {
      toast.error('Erreur lors de la synchronisation');
    } finally {
      syncingLinkId = '';
    }
  }

  async function handleDelete() {
    if (!deleteTargetId) return;
    const ok = await deleteStaffServerLink(deleteTargetId);
    if (ok) {
      showDeleteModal = false;
      await loadData();
    }
  }

  function openMappingModal(linkId: string) {
    mappingLinkId = linkId;
    showMappingModal = true;
  }

  function confirmDelete(id: string) {
    deleteTargetId = id;
    showDeleteModal = true;
  }

  function toggleExpanded(linkId: string) {
    expandedLinkId = expandedLinkId === linkId ? null : linkId;
  }
</script>

<ModulePage
  title="Serveurs Staff"
  description="Liez des serveurs staff pour synchroniser automatiquement les rôles et la hiérarchie"
  icon="shield"
  featureKey="staff_server"
>
  {#snippet actions()}
    <RefreshButton onclick={loadData} />
  {/snippet}

  {#snippet children()}
    <InlineFeedback state={saveAction} />

    <div class="flex flex-col gap-6">
      <!-- Actions bar -->
      <div class="flex items-center justify-between">
        <p class="text-sm text-on-surface-variant">{links.length} serveur(s) staff lié(s)</p>
        <button
          onclick={() => { showCreateModal = true; }}
          class="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          <Papicon icon="plus" size={16} />
          Lier un serveur staff
        </button>
      </div>

      <!-- Links list -->
      {#if loading}
        <div class="flex items-center justify-center py-16">
          <div class="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full"></div>
        </div>
      {:else if links.length === 0}
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <div class="w-16 h-16 bg-surface-container-low rounded-2xl flex items-center justify-center mb-4">
            <Papicon icon="shield" size={32} class="text-on-surface-variant/40" />
          </div>
          <h3 class="text-lg font-semibold text-on-surface mb-1">Aucun serveur staff</h3>
          <p class="text-sm text-on-surface-variant/60 max-w-sm">
            Liez un serveur Discord dédié au staff pour synchroniser automatiquement les rôles et la hiérarchie.
          </p>
        </div>
      {:else}
        <div class="grid gap-4">
          {#each links as link}
            <div class="bg-surface-container-low/40 rounded-xl border border-outline-variant/30 overflow-hidden transition-all {expandedLinkId === link.id ? 'border-primary/30' : ''}">
              <!-- Header -->
              <div class="p-5">
                <div class="flex items-start justify-between gap-4">
                  <div class="flex items-center gap-3 flex-1 min-w-0">
                    {#if link.otherGuildIcon}
                      <img src={link.otherGuildIcon} alt="" class="w-10 h-10 rounded-lg" />
                    {:else}
                      <div class="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center">
                        <Papicon icon="server" size={20} class="text-on-surface-variant/50" />
                      </div>
                    {/if}
                    <div>
                      <h4 class="text-sm font-semibold text-on-surface">{link.otherGuildName}</h4>
                      <div class="flex items-center gap-2 mt-0.5">
                        <span class="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                          {link.isMain ? 'Serveur staff' : 'Serveur principal'}
                        </span>
                        <span class="text-xs px-2 py-0.5 rounded-full bg-surface-container border border-outline-variant/15 text-on-surface-variant">
                          {syncModeLabels[link.syncMode]}
                        </span>
                        {#if link.hierarchy}
                          <span class="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400">
                            {link.hierarchy.name}
                          </span>
                        {/if}
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    <ToggleSwitch
                      checked={link.enabled}
                      onToggle={(v) => handleToggle(link.id, v)}
                    />
                    <button
                      onclick={() => handleSync(link.id)}
                      disabled={syncingLinkId === link.id}
                      class="p-2 rounded-lg hover:bg-surface-container transition-colors disabled:opacity-50"
                      title="Synchroniser"
                    >
                      <Papicon icon="refresh-cw" size={16} class="text-on-surface-variant {syncingLinkId === link.id ? 'animate-spin' : ''}" />
                    </button>
                    <button
                      onclick={() => toggleExpanded(link.id)}
                      class="p-2 rounded-lg hover:bg-surface-container transition-colors"
                      title="Détails"
                    >
                      <Papicon icon={expandedLinkId === link.id ? 'chevron-up' : 'chevron-down'} size={16} class="text-on-surface-variant" />
                    </button>
                    <button
                      onclick={() => confirmDelete(link.id)}
                      class="p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                      title="Supprimer"
                    >
                      <Papicon icon="trash-2" size={16} class="text-red-400" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Expanded: Role Mappings -->
              {#if expandedLinkId === link.id}
                <div class="border-t border-outline-variant/20 bg-surface-container/20 p-5">
                  <div class="flex items-center justify-between mb-4">
                    <h5 class="text-sm font-semibold text-on-surface">Mappings de rôles</h5>
                    <button
                      onclick={() => openMappingModal(link.id)}
                      class="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors text-xs font-medium"
                    >
                      <Papicon icon="plus" size={14} />
                      Ajouter
                    </button>
                  </div>

                  {#if link.roleMappings.length === 0}
                    <p class="text-sm text-on-surface-variant/50 text-center py-4">
                      Aucun mapping configuré. Ajoutez des correspondances de rôles entre les deux serveurs.
                    </p>
                  {:else}
                    <div class="space-y-2">
                      {#each link.roleMappings as mapping}
                        <div class="flex items-center justify-between bg-surface-container-low/60 rounded-lg px-4 py-3 border border-outline-variant/10">
                          <div class="flex items-center gap-4">
                            <div class="flex items-center gap-2">
                              {#if mapping.mainRoleColor}
                                <span class="w-3 h-3 rounded-full" style="background-color: {mapping.mainRoleColor}"></span>
                              {/if}
                              <span class="text-sm font-medium text-on-surface">{mapping.mainRoleName ?? '—'}</span>
                            </div>
                            <Papicon icon="arrow-right" size={14} class="text-on-surface-variant/40" />
                            <div class="flex items-center gap-2">
                              {#if mapping.staffRoleColor}
                                <span class="w-3 h-3 rounded-full" style="background-color: {mapping.staffRoleColor}"></span>
                              {/if}
                              <span class="text-sm font-medium text-on-surface">{mapping.staffRoleName ?? '—'}</span>
                            </div>
                          </div>
                          <button
                            onclick={() => handleDeleteMapping(link.id, mapping.id)}
                            class="p-1.5 rounded-md hover:bg-red-500/10 transition-colors"
                          >
                            <Papicon icon="x" size={14} class="text-red-400" />
                          </button>
                        </div>
                      {/each}
                    </div>
                  {/if}

                  {#if link.isMain}
                    <div class="mt-5 pt-4 border-t border-outline-variant/10">
                      <h5 class="text-sm font-semibold text-on-surface mb-1">Notifications cross-serveur</h5>
                      <p class="text-xs text-on-surface-variant/50 mb-4">
                        Salons du serveur staff qui recevront les notifications de ce serveur principal.
                      </p>

                      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {#each [
                          { field: 'modlogMirrorChannelId', label: 'Miroir du modlog', hint: 'Copie des alertes automod, ghost ping et honeypot' },
                          { field: 'sanctionReportChannelId', label: 'Rapports de sanction', hint: 'Embed posté à chaque nouveau rapport' },
                          { field: 'recruitmentAlertChannelId', label: 'Alertes de candidatures', hint: 'Notification à chaque nouvelle candidature' },
                          { field: 'offboardingAlertChannelId', label: 'Alerte départ staff', hint: 'Alerte avec bouton d\'expulsion quand un membre perd tous ses rôles staff' },
                          { field: 'onboardingInviteChannelId', label: 'Salon d\'invitation onboarding', hint: 'Salon source des invitations envoyées aux nouveaux staff' },
                        ] as cfg}
                          <div>
                            <label class="block text-xs font-medium text-on-surface mb-1">{cfg.label}</label>
                            <select
                              value={link[cfg.field] ?? ''}
                              onchange={(e) => handleConfigChange(link.id, cfg.field, (e.target as HTMLSelectElement).value || null)}
                              class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface text-sm outline-none"
                            >
                              <option value="">Aucun</option>
                              {#each staffChannels as ch}
                                <option value={ch.id}>#{ch.name}</option>
                              {/each}
                            </select>
                            <p class="text-[10px] text-on-surface-variant/40 mt-1">{cfg.hint}</p>
                          </div>
                        {/each}

                        <div>
                          <label class="block text-xs font-medium text-on-surface mb-1">Catégorie des entretiens de recrutement</label>
                          <select
                            value={link.staffRecruitmentCategoryId ?? ''}
                            onchange={(e) => handleConfigChange(link.id, 'staffRecruitmentCategoryId', (e.target as HTMLSelectElement).value || null)}
                            class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface text-sm outline-none"
                          >
                            <option value="">Aucune</option>
                            {#each staffCategories as cat}
                              <option value={cat.id}>{cat.name}</option>
                            {/each}
                          </select>
                          <p class="text-[10px] text-on-surface-variant/40 mt-1">Catégorie du serveur staff où créer les salons d'entretien</p>
                        </div>
                      </div>

                      <div class="mt-4 space-y-3">
                        <div class="flex items-center justify-between">
                          <div>
                            <p class="text-xs font-medium text-on-surface">Invitation d'onboarding automatique</p>
                            <p class="text-[10px] text-on-surface-variant/40">Envoie une invitation au serveur staff en DM au premier rôle staff obtenu</p>
                          </div>
                          <ToggleSwitch
                            checked={!!link.onboardingInviteEnabled}
                            onToggle={(checked) => handleConfigChange(link.id, 'onboardingInviteEnabled', checked)}
                          />
                        </div>
                        <div class="flex items-center justify-between">
                          <div>
                            <p class="text-xs font-medium text-on-surface">Entretiens de recrutement sur le serveur staff</p>
                            <p class="text-[10px] text-on-surface-variant/40">Crée les salons d'entretien sur le serveur staff plutôt qu'ici</p>
                          </div>
                          <ToggleSwitch
                            checked={!!link.recruitmentOnStaffServer}
                            onToggle={(checked) => handleConfigChange(link.id, 'recruitmentOnStaffServer', checked)}
                          />
                        </div>
                      </div>
                    </div>
                  {/if}

                  <div class="mt-4 pt-3 border-t border-outline-variant/10">
                    <p class="text-xs text-on-surface-variant/50">
                      Mode : {syncModeDescriptions[link.syncMode]}
                    </p>
                    <p class="text-xs text-on-surface-variant/40 mt-1">
                      ID : <code class="font-mono">{link.id}</code>
                    </p>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Create Link Modal -->
      <Modal bind:open={showCreateModal} title="Lier un serveur staff">
        <div class="flex flex-col gap-5 p-1">
          <div>
            <label class="block text-sm font-medium text-on-surface mb-1.5">ID du serveur staff</label>
            <input
              type="text"
              bind:value={newStaffGuildId}
              placeholder="Ex: 123456789012345678"
              class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary/50 outline-none placeholder:text-on-surface-variant/30"
            />
            <p class="text-xs text-on-surface-variant/50 mt-1">Le bot doit être présent sur ce serveur.</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-on-surface mb-1.5">Mode de synchronisation</label>
            <select
              bind:value={newSyncMode}
              class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface text-sm outline-none"
            >
              <option value="MAIN_TO_STAFF">Principal → Staff</option>
              <option value="STAFF_TO_MAIN">Staff → Principal</option>
              <option value="BIDIRECTIONAL">Bidirectionnel</option>
            </select>
            <p class="text-xs text-on-surface-variant/50 mt-1">{syncModeDescriptions[newSyncMode]}</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-on-surface mb-1.5">Rôle staff simple (optionnel)</label>
            <select
              bind:value={newSimpleStaffRoleId}
              class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface text-sm outline-none"
            >
              <option value="">Aucun</option>
              {#each roles as role}
                <option value={role.id}>{role.name}</option>
              {/each}
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-on-surface mb-1.5">Salon de logs (optionnel)</label>
            <select
              bind:value={newMainLogChannelId}
              class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface text-sm outline-none"
            >
              <option value="">Aucun</option>
              {#each channels as ch}
                <option value={ch.id}>#{ch.name}</option>
              {/each}
            </select>
          </div>

          <button
            onclick={handleCreate}
            disabled={saveAction.state.loading}
            class="w-full px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {saveAction.state.loading ? 'Liaison...' : 'Lier le serveur'}
          </button>
        </div>
      </Modal>

    <!-- Mapping Modal -->
      <Modal bind:open={showMappingModal} title="Ajouter un mapping de rôle">
        <div class="flex flex-col gap-5 p-1">
          <div>
            <label class="block text-sm font-medium text-on-surface mb-1.5">Rôle sur ce serveur</label>
            <select
              bind:value={newMainRoleId}
              class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface text-sm outline-none"
            >
              <option value="">Sélectionner</option>
              {#each roles as role}
                <option value={role.id}>{role.name}</option>
              {/each}
            </select>
          </div>

          <div class="flex items-center justify-center">
            <Papicon icon="arrow-down" size={20} class="text-on-surface-variant/40" />
          </div>

          <div>
            <label class="block text-sm font-medium text-on-surface mb-1.5">ID du rôle sur le serveur staff</label>
            <input
              type="text"
              bind:value={newStaffRoleId}
              placeholder="Ex: 123456789012345678"
              class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary/50 outline-none placeholder:text-on-surface-variant/30"
            />
          </div>

          <button
            onclick={handleAddMapping}
            disabled={saveAction.state.loading}
            class="w-full px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {saveAction.state.loading ? 'Ajout...' : 'Ajouter le mapping'}
          </button>
        </div>
      </Modal>

    <!-- Delete Confirm Modal -->
      <Modal bind:open={showDeleteModal} title="Confirmer la suppression">
        <div class="flex flex-col gap-4 p-1">
          <p class="text-sm text-on-surface-variant">
            Êtes-vous sûr de vouloir supprimer ce lien ? Les rôles ne seront plus synchronisés entre les deux serveurs.
          </p>
          <div class="flex gap-3 justify-end">
            <button
              onclick={() => { showDeleteModal = false; }}
              class="px-4 py-2 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface text-sm hover:bg-surface-container-high transition-colors"
            >
              Annuler
            </button>
            <button
              onclick={handleDelete}
              class="px-4 py-2 rounded-lg bg-red-500 text-white text-sm hover:bg-red-600 transition-colors"
            >
              Supprimer
            </button>
          </div>
        </div>
      </Modal>
  {/snippet}
</ModulePage>
