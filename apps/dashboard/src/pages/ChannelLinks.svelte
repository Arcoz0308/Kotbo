<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { toast } from '../lib/stores/toast.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import {
    fetchChannelLinks,
    fetchChannelLinkOtherGuilds,
    createDirectChannelLink,
    generateChannelLinkInvite,
    updateChannelLink,
    deleteChannelLink,
  } from '../lib/api';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import Modal from '../lib/components/Modal.svelte';

  let links = $state<any[]>([]);
  let loading = $state(true);

  // Other guilds for direct linking
  let otherGuilds = $state<any[]>([]);
  let loadingGuilds = $state(false);

  // Create link modal
  let showCreateModal = $state(false);
  let newSourceChannelId = $state('');
  let newTargetGuildId = $state('');
  let newTargetChannelId = $state('');
  let newDirection = $state('BIDIRECTIONAL');
  let newRelayMode = $state('WEBHOOK');
  let newCreateServerInvite = $state(false);
  let createdInviteUrl = $state<string | null>(null);

  // Config modal
  let showConfigModal = $state(false);
  let configLink = $state<any>(null);
  let configInviteUrl = $state<string | null>(null);
  let generatingInvite = $state(false);

  // Delete confirm
  let showDeleteModal = $state(false);
  let deleteTargetId = $state('');

  const saveAction = createAsyncActionState();

  const channels = $derived(dashboardStore.state.discordChannels ?? []);

  const targetGuildChannels = $derived.by(() => {
    const channels = otherGuilds.find((g: any) => g.id === newTargetGuildId)?.channels ?? [];
    if (newTargetGuildId === authStore.selectedGuildId && newSourceChannelId) {
      return channels.filter((c: any) => c.id !== newSourceChannelId);
    }
    return channels;
  });

  async function loadData() {
    loading = true;
    try {
      links = (await fetchChannelLinks()) ?? [];
    } catch (err) {
      toast.error('Erreur lors du chargement des liens');
    } finally {
      loading = false;
    }
  }

  async function loadOtherGuilds() {
    loadingGuilds = true;
    try {
      otherGuilds = (await fetchChannelLinkOtherGuilds()) ?? [];
    } catch (err) {
      toast.error('Erreur lors du chargement des serveurs');
    } finally {
      loadingGuilds = false;
    }
  }

  onMount(() => {
    dashboardStore.refresh();
    loadData();
  });

  function openCreateModal() {
    newSourceChannelId = '';
    newTargetGuildId = '';
    newTargetChannelId = '';
    newDirection = 'BIDIRECTIONAL';
    newRelayMode = 'WEBHOOK';
    newCreateServerInvite = false;
    createdInviteUrl = null;
    showCreateModal = true;
    if (otherGuilds.length === 0) loadOtherGuilds();
  }

  async function handleCreateDirect() {
    if (!newSourceChannelId) {
      toast.error('Sélectionnez un salon source');
      return;
    }
    if (!newTargetGuildId || !newTargetChannelId) {
      toast.error('Sélectionnez un serveur et un salon cible');
      return;
    }
    await saveAction.run(async () => {
      const result = await createDirectChannelLink({
        sourceChannelId: newSourceChannelId,
        targetGuildId: newTargetGuildId,
        targetChannelId: newTargetChannelId,
        direction: newDirection,
        relayMode: newRelayMode,
        createServerInvite: newCreateServerInvite,
      });
      if (result) {
        if (result.serverInviteUrl) {
          createdInviteUrl = result.serverInviteUrl;
        } else {
          showCreateModal = false;
        }
        await loadData();
        return true;
      }
      return false;
    }, { successMessage: 'Lien créé avec succès' });
  }

  async function handleToggleLink(linkId: string, enabled: boolean) {
    await updateChannelLink(linkId, { enabled });
    await loadData();
  }

  async function handleUpdateConfig() {
    if (!configLink) return;
    await saveAction.run(async () => {
      const updated = await updateChannelLink(configLink.id, {
        relayText: configLink.relayText,
        relayImages: configLink.relayImages,
        relayEmbeds: configLink.relayEmbeds,
        relayReactions: configLink.relayReactions,
        relayEdits: configLink.relayEdits,
        relayDeletes: configLink.relayDeletes,
        direction: configLink.direction,
        sourceRelayMode: configLink.sourceRelayMode,
        targetRelayMode: configLink.targetRelayMode,
      });
      if (updated) {
        showConfigModal = false;
        await loadData();
        return true;
      }
      return false;
    }, { successMessage: 'Configuration mise à jour' });
  }

  let configInviteTopicUpdated = $state(false);

  async function handleGenerateInvite(linkId: string) {
    generatingInvite = true;
    configInviteTopicUpdated = false;
    try {
      const result = await generateChannelLinkInvite(linkId);
      if (result?.inviteUrl) {
        configInviteUrl = result.inviteUrl;
        configInviteTopicUpdated = !!result.topicUpdated;
        toast.success(result.topicUpdated ? 'Invitation ajoutée dans la description du salon' : 'Invitation générée');
      }
    } catch {
      toast.error('Erreur lors de la génération');
    } finally {
      generatingInvite = false;
    }
  }

  async function handleDelete() {
    if (!deleteTargetId) return;
    const ok = await deleteChannelLink(deleteTargetId);
    if (ok) {
      showDeleteModal = false;
      await loadData();
    }
  }

  function openConfig(link: any) {
    configLink = { ...link };
    configInviteUrl = null;
    showConfigModal = true;
  }

  function confirmDelete(id: string) {
    deleteTargetId = id;
    showDeleteModal = true;
  }

  function directionLabel(d: string) {
    return d === 'BIDIRECTIONAL' ? 'Bidirectionnel' : 'Unidirectionnel';
  }

  function modeLabel(m: string) {
    return m === 'WEBHOOK' ? 'Webhook' : 'Embed';
  }
</script>

<ModulePage
  title="Liens de salons"
  description="Reliez des salons entre serveurs pour synchroniser les messages"
  icon="link"
  featureKey="channel_links"
>
  {#snippet actions()}
    <RefreshButton onclick={loadData} />
  {/snippet}

  {#snippet children()}
    <InlineFeedback state={saveAction} />

    <div class="flex flex-col gap-6">
      <!-- Actions bar -->
      <div class="flex items-center justify-between">
        <p class="text-sm text-on-surface-variant">{links.length} lien(s) configuré(s)</p>
        <button
          onclick={openCreateModal}
          class="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          <Papicon icon="plus" size={16} />
          Créer un lien
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
            <Papicon icon="link" size={32} class="text-on-surface-variant/40" />
          </div>
          <h3 class="text-lg font-semibold text-on-surface mb-1">Aucun lien configuré</h3>
          <p class="text-sm text-on-surface-variant/60 max-w-sm">
            Créez un lien pour synchroniser les messages entre un salon de ce serveur et un salon d'un autre serveur.
          </p>
        </div>
      {:else}
        <div class="grid gap-4">
          {#each links as link}
            <div class="bg-surface-container-low/40 rounded-xl border border-outline-variant/30 p-5 hover:border-primary/20 transition-all group">
              <div class="flex items-start justify-between gap-4">
                <!-- Left: info -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-3 mb-2">
                    {#if link.remoteGuildIcon}
                      <img src={link.remoteGuildIcon} alt="" class="w-8 h-8 rounded-lg" />
                    {:else}
                      <div class="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center">
                        <Papicon icon="server" size={16} class="text-on-surface-variant/50" />
                      </div>
                    {/if}
                    <div>
                      <h4 class="text-sm font-semibold text-on-surface">{link.remoteGuildName}</h4>
                      <p class="text-xs text-on-surface-variant/60">#{link.remoteChannelName}</p>
                    </div>
                  </div>

                  <div class="flex items-center gap-2 text-xs text-on-surface-variant/70 mb-2">
                    <span class="font-medium">#{link.localChannelName}</span>
                    <span>{link.direction === 'BIDIRECTIONAL' ? '↔' : '→'}</span>
                    <span class="font-medium">#{link.remoteChannelName}</span>
                  </div>

                  <div class="flex flex-wrap gap-1.5">
                    <span class="text-[10px] px-2 py-0.5 rounded-full bg-surface-container border border-outline-variant/15 text-on-surface-variant">
                      {directionLabel(link.direction)}
                    </span>
                    <span class="text-[10px] px-2 py-0.5 rounded-full bg-surface-container border border-outline-variant/15 text-on-surface-variant">
                      {modeLabel(link.isSource ? link.targetRelayMode : link.sourceRelayMode)}
                    </span>
                    {#if link.relayText}<span class="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">Texte</span>{/if}
                    {#if link.relayImages}<span class="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">Images</span>{/if}
                    {#if link.relayEdits}<span class="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">Éditions</span>{/if}
                    {#if link.relayDeletes}<span class="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">Suppressions</span>{/if}
                  </div>
                </div>

                <!-- Right: actions -->
                <div class="flex items-center gap-3">
                  <ToggleSwitch
                    checked={link.enabled}
                    onToggle={(v) => handleToggleLink(link.id, v)}
                  />
                  <button
                    onclick={() => openConfig(link)}
                    class="p-2 rounded-lg hover:bg-surface-container transition-colors"
                    title="Configurer"
                  >
                    <Papicon icon="settings" size={16} class="text-on-surface-variant" />
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
          {/each}
        </div>
      {/if}
    </div>

    <!-- Create Link Modal -->
    <Modal bind:open={showCreateModal} title="Créer un lien de salon">
      <div class="flex flex-col gap-5 p-4">
        <!-- Step 1: Source channel -->
        <div>
          <label class="block text-sm font-medium text-on-surface mb-1.5">Salon sur ce serveur</label>
          <select
            bind:value={newSourceChannelId}
            class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface text-sm outline-none"
          >
            <option value="">Sélectionner un salon</option>
            {#each channels as ch}
              <option value={ch.id}>#{ch.name}</option>
            {/each}
          </select>
        </div>

        <!-- Step 2: Target server -->
        <div>
          <label class="block text-sm font-medium text-on-surface mb-1.5">Serveur cible</label>
          {#if loadingGuilds}
            <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30">
              <div class="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full"></div>
              <span class="text-sm text-on-surface-variant">Chargement des serveurs...</span>
            </div>
          {:else if otherGuilds.length === 0}
            <div class="px-3 py-3 rounded-lg bg-surface-container/40 border border-outline-variant/20 text-center">
              <p class="text-sm text-on-surface-variant/60">Aucun serveur disponible.</p>
              <p class="text-xs text-on-surface-variant/40 mt-1">Le bot doit être présent et vous devez être admin sur le serveur cible.</p>
            </div>
          {:else}
            <div class="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
              {#each otherGuilds as guild}
                <button
                  type="button"
                  onclick={() => { newTargetGuildId = guild.id; newTargetChannelId = ''; }}
                  class="flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left w-full {newTargetGuildId === guild.id ? 'bg-primary/10 border-primary/40' : 'bg-surface-container/40 border-outline-variant/20 hover:border-outline-variant/40'}"
                >
                  {#if guild.icon}
                    <img src={guild.icon} alt="" class="w-8 h-8 rounded-lg shrink-0" />
                  {:else}
                    <div class="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
                      <Papicon icon="server" size={16} class="text-on-surface-variant/50" />
                    </div>
                  {/if}
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-on-surface truncate">{guild.name}</p>
                    <p class="text-xs text-on-surface-variant/50">{guild.channels.length} salon(s)</p>
                  </div>
                  {#if newTargetGuildId === guild.id}
                    <Papicon icon="check" size={16} class="text-primary shrink-0" />
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Step 3: Target channel (only if server selected) -->
        {#if newTargetGuildId}
          <div>
            <label class="block text-sm font-medium text-on-surface mb-1.5">Salon sur le serveur cible</label>
            <select
              bind:value={newTargetChannelId}
              class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface text-sm outline-none"
            >
              <option value="">Sélectionner un salon</option>
              {#each targetGuildChannels as ch}
                <option value={ch.id}>#{ch.name}</option>
              {/each}
            </select>
          </div>
        {/if}

        <!-- Options -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-on-surface mb-1.5">Direction</label>
            <select
              bind:value={newDirection}
              class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface text-sm outline-none"
            >
              <option value="BIDIRECTIONAL">Bidirectionnel</option>
              <option value="UNIDIRECTIONAL">Unidirectionnel</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-on-surface mb-1.5">Mode de relay</label>
            <select
              bind:value={newRelayMode}
              class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface text-sm outline-none"
            >
              <option value="WEBHOOK">Webhook (miroir)</option>
              <option value="EMBED">Embed</option>
            </select>
          </div>
        </div>

        <!-- Server invite option -->
        <div class="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface-container/40 border border-outline-variant/10">
          <div>
            <span class="text-sm text-on-surface">Générer une invitation Discord</span>
            <p class="text-xs text-on-surface-variant/50 mt-0.5">Crée un lien d'invitation à mettre dans la description du serveur cible</p>
          </div>
          <ToggleSwitch checked={newCreateServerInvite} onToggle={(v) => newCreateServerInvite = v} size="sm" />
        </div>

        <!-- Visual summary -->
        {#if newSourceChannelId && newTargetGuildId && newTargetChannelId}
          {@const sourceChannel = channels.find((c) => c.id === newSourceChannelId)}
          {@const targetGuild = otherGuilds.find((g) => g.id === newTargetGuildId)}
          {@const targetChannel = targetGuildChannels.find((c) => c.id === newTargetChannelId)}
          <div class="flex items-center justify-center gap-3 px-4 py-3 rounded-lg bg-primary/5 border border-primary/20">
            <span class="text-sm font-medium text-on-surface">#{sourceChannel?.name}</span>
            <span class="text-primary">{newDirection === 'BIDIRECTIONAL' ? '↔' : '→'}</span>
            <span class="text-sm font-medium text-on-surface">#{targetChannel?.name}</span>
            <span class="text-xs text-on-surface-variant/50">({targetGuild?.name})</span>
          </div>
        {/if}

        <!-- Created invite URL result -->
        {#if createdInviteUrl}
          <div class="flex flex-col gap-2 px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/30">
            <div class="flex items-center gap-2">
              <Papicon icon="check-circle" size={16} class="text-green-400" />
              <span class="text-sm font-semibold text-green-400">Lien créé avec invitation</span>
            </div>
            <p class="text-xs text-on-surface-variant/70">Copiez ce lien et ajoutez-le dans la description du serveur cible :</p>
            <div class="flex items-center gap-2">
              <code class="flex-1 text-sm font-mono bg-surface-container px-3 py-1.5 rounded-lg text-on-surface select-all break-all">{createdInviteUrl}</code>
              <button
                type="button"
                onclick={() => { navigator.clipboard.writeText(createdInviteUrl ?? ''); toast.success('Lien copié !'); }}
                class="p-2 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors"
                title="Copier"
              >
                <Papicon icon="copy" size={16} class="text-on-surface-variant" />
              </button>
            </div>
            <button
              onclick={() => { showCreateModal = false; createdInviteUrl = null; }}
              class="w-full mt-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
            >
              Fermer
            </button>
          </div>
        {:else}
          <button
            onclick={handleCreateDirect}
            disabled={saveAction.state.loading || !newSourceChannelId || !newTargetGuildId || !newTargetChannelId}
            class="w-full px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {saveAction.state.loading ? 'Création...' : 'Créer le lien'}
          </button>
        {/if}
      </div>
    </Modal>

    <!-- Config Modal -->
    <Modal bind:open={showConfigModal} title="Configuration du lien">
      {#if configLink}
        <div class="flex flex-col gap-5 p-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-on-surface mb-1.5">Direction</label>
              <select
                bind:value={configLink.direction}
                class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface text-sm outline-none"
              >
                <option value="BIDIRECTIONAL">Bidirectionnel</option>
                <option value="UNIDIRECTIONAL">Unidirectionnel</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-on-surface mb-1.5">Mode relay (cible)</label>
              <select
                bind:value={configLink.targetRelayMode}
                class="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface text-sm outline-none"
              >
                <option value="WEBHOOK">Webhook</option>
                <option value="EMBED">Embed</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-on-surface mb-2">Contenu relayé</label>
            <div class="grid grid-cols-2 gap-3">
              {#each [
                { label: 'Texte', key: 'relayText' },
                { label: 'Images', key: 'relayImages' },
                { label: 'Embeds', key: 'relayEmbeds' },
                { label: 'Réactions', key: 'relayReactions' },
                { label: 'Éditions', key: 'relayEdits' },
                { label: 'Suppressions', key: 'relayDeletes' },
              ] as toggle}
                <div class="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-container/40 border border-outline-variant/10">
                  <span class="text-sm text-on-surface">{toggle.label}</span>
                  <ToggleSwitch checked={configLink[toggle.key]} onToggle={(v) => { configLink[toggle.key] = v; }} size="sm" />
                </div>
              {/each}
            </div>
          </div>

          <!-- Invitation Discord -->
          <div class="border-t border-outline-variant/20 pt-4">
            <label class="block text-sm font-medium text-on-surface mb-2">Invitation Discord</label>
            <p class="text-xs text-on-surface-variant/50 mb-3">Générez un lien d'invitation permanent pour ce salon, à mettre dans la description du serveur lié.</p>

            {#if configInviteUrl}
              <div class="flex flex-col gap-2 px-3 py-3 rounded-lg bg-green-500/10 border border-green-500/30">
                <div class="flex items-center gap-2">
                  <Papicon icon="check-circle" size={14} class="text-green-400" />
                  <span class="text-xs font-semibold text-green-400">
                    {configInviteTopicUpdated ? 'Invitation ajoutée dans la description du salon distant' : 'Invitation générée'}
                  </span>
                </div>
                {#if !configInviteTopicUpdated}
                  <p class="text-xs text-on-surface-variant/60">Le bot n'a pas pu modifier la description du salon distant. Copiez le lien manuellement :</p>
                {/if}
                <div class="flex items-center gap-2">
                  <code class="flex-1 text-xs font-mono bg-surface-container px-2.5 py-1.5 rounded-lg text-on-surface select-all break-all">{configInviteUrl}</code>
                  <button
                    type="button"
                    onclick={() => { navigator.clipboard.writeText(configInviteUrl ?? ''); toast.success('Lien copié !'); }}
                    class="p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors"
                    title="Copier"
                  >
                    <Papicon icon="copy" size={14} class="text-on-surface-variant" />
                  </button>
                </div>
              </div>
            {:else}
              <button
                type="button"
                onclick={() => handleGenerateInvite(configLink.id)}
                disabled={generatingInvite}
                class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30 text-on-surface text-sm hover:bg-surface-container-high transition-colors disabled:opacity-50"
              >
                {#if generatingInvite}
                  <div class="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full"></div>
                  Génération...
                {:else}
                  <Papicon icon="link" size={14} class="text-on-surface-variant" />
                  Générer une invitation
                {/if}
              </button>
            {/if}
          </div>

          <button
            onclick={handleUpdateConfig}
            disabled={saveAction.state.loading}
            class="w-full px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {saveAction.state.loading ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      {/if}
    </Modal>

    <!-- Delete Confirm Modal -->
    <Modal bind:open={showDeleteModal} title="Confirmer la suppression">
      <div class="flex flex-col gap-4 p-4">
        <p class="text-sm text-on-surface-variant">
          Êtes-vous sûr de vouloir supprimer ce lien ? Les messages ne seront plus relayés entre les deux salons.
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
