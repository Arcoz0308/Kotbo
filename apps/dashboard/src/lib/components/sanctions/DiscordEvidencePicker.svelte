<script lang="ts">
  import Modal from '../Modal.svelte';
  import Papicon from '../Papicon.svelte';
  import DiscordMarkdownText from './DiscordMarkdownText.svelte';
  import DiscordEmbedPreview from './DiscordEmbedPreview.svelte';
  import { fetchDiscordChannels, fetchSanctionDiscordMessages, generateSanctionDiscordTranscripts } from '../../api';

  interface ParsedEmbed {
    color: string | null;
    authorName: string | null;
    authorIconUrl: string | null;
    authorUrl: string | null;
    title: string | null;
    url: string | null;
    description: string | null;
    fields: { name: string; value: string; inline: boolean }[];
    thumbnailUrl: string | null;
    imageUrl: string | null;
    footerText: string | null;
    footerIconUrl: string | null;
  }

  interface EvidenceMessage {
    id: string;
    content: string;
    createdAt: string;
    attachments: { url: string; name: string; contentType: string | null; size: number; kind: 'image' | 'video' | 'file' }[];
    embeds: ParsedEmbed[];
    stickers: { id: string; name: string; url: string }[];
  }

  interface EvidenceChannelResult {
    channelId: string;
    channelName?: string;
    error?: string;
    messages?: EvidenceMessage[];
    truncated?: boolean;
  }

  let {
    open = $bindable(false),
    guildId,
    sanctionId,
    onImport
  } = $props<{
    open?: boolean;
    guildId: string;
    sanctionId: string;
    onImport: (urls: string[]) => void;
  }>();

  type Step = 'channels' | 'messages' | 'generating' | 'done';

  let step = $state<Step>('channels');
  let loadingChannels = $state(false);
  let channelsError = $state('');
  let allChannels = $state<{ id: string; name: string }[]>([]);
  let channelSearch = $state('');
  let selectedChannelIds = $state<string[]>([]);

  let loadingMessages = $state(false);
  let messagesError = $state('');
  let targetTag = $state('');
  let channelResults = $state<EvidenceChannelResult[]>([]);
  let selectedMessageIds = $state<Record<string, string[]>>({});

  let generateErrors = $state<Array<{ channelId: string; error: string }>>([]);
  let generateSummary = $state('');

  const filteredChannels = $derived(
    channelSearch.trim()
      ? allChannels.filter((c) => c.name.toLowerCase().includes(channelSearch.trim().toLowerCase()))
      : allChannels
  );

  const totalSelectedCount = $derived(
    Object.values(selectedMessageIds).reduce((sum, ids) => sum + ids.length, 0)
  );

  $effect(() => {
    if (open) {
      resetState();
      loadChannels();
    }
  });

  function resetState() {
    step = 'channels';
    channelsError = '';
    selectedChannelIds = [];
    channelSearch = '';
    messagesError = '';
    targetTag = '';
    channelResults = [];
    selectedMessageIds = {};
    generateErrors = [];
    generateSummary = '';
  }

  async function loadChannels() {
    loadingChannels = true;
    channelsError = '';
    try {
      const data = await fetchDiscordChannels(guildId);
      allChannels = (data?.textChannels ?? []).filter((c: any) => c.type === 'text' || c.type === 'announcement');
    } catch {
      channelsError = 'Impossible de charger la liste des salons.';
    } finally {
      loadingChannels = false;
    }
  }

  function toggleChannelChoice(channelId: string) {
    selectedChannelIds = selectedChannelIds.includes(channelId)
      ? selectedChannelIds.filter((id) => id !== channelId)
      : [...selectedChannelIds, channelId];
  }

  async function loadMessages() {
    if (selectedChannelIds.length === 0) return;
    loadingMessages = true;
    messagesError = '';
    try {
      const data = await fetchSanctionDiscordMessages(sanctionId, selectedChannelIds, guildId);
      targetTag = data?.targetTag ?? '';
      channelResults = data?.channels ?? [];
      selectedMessageIds = {};
      step = 'messages';
    } catch (err: any) {
      messagesError = err?.message || 'Impossible de récupérer les messages Discord.';
    } finally {
      loadingMessages = false;
    }
  }

  function toggleMessage(channelId: string, messageId: string) {
    const current = selectedMessageIds[channelId] ?? [];
    const next = current.includes(messageId)
      ? current.filter((id) => id !== messageId)
      : [...current, messageId];
    selectedMessageIds = { ...selectedMessageIds, [channelId]: next };
  }

  function toggleSelectAll(channelId: string, messages: EvidenceMessage[]) {
    const current = selectedMessageIds[channelId] ?? [];
    const allSelected = current.length === messages.length && messages.length > 0;
    selectedMessageIds = { ...selectedMessageIds, [channelId]: allSelected ? [] : messages.map((m) => m.id) };
  }

  async function generateTranscripts() {
    const selections = Object.entries(selectedMessageIds)
      .filter(([, ids]) => ids.length > 0)
      .map(([channelId, messageIds]) => ({ channelId, messageIds }));

    if (selections.length === 0) return;

    step = 'generating';
    generateErrors = [];

    try {
      const data = await generateSanctionDiscordTranscripts(sanctionId, selections, guildId);
      const results = data?.results ?? [];
      generateErrors = data?.errors ?? [];

      if (results.length > 0) {
        onImport(results.map((r: any) => r.url));
      }

      generateSummary = results.length > 0
        ? `${results.length} transcription${results.length > 1 ? 's' : ''} ajoutée${results.length > 1 ? 's' : ''} aux preuves.`
        : '';
    } catch (err: any) {
      generateErrors = [{ channelId: '', error: err?.message || 'Erreur lors de la génération des transcriptions.' }];
    } finally {
      step = 'done';
    }
  }

  function formatTimestamp(iso: string) {
    return new Date(iso).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function closeModal() {
    open = false;
  }
</script>

<Modal bind:open title="Importer des messages depuis Discord" size="xl">
  <div class="flex flex-col gap-5 p-5">
    {#if step === 'channels'}
      <p class="text-xs font-semibold text-on-surface-variant/60">
        Sélectionnez un ou plusieurs salons pour retrouver les derniers messages de la personne sanctionnée.
      </p>

      {#if channelsError}
        <div class="rounded-lg bg-rose-500/10 border border-rose-500/20 p-4 text-xs font-semibold text-rose-500">
          {channelsError}
        </div>
      {:else if loadingChannels}
        <div class="flex items-center justify-center py-12">
          <div class="w-6 h-6 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
        </div>
      {:else}
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div class="flex-1 relative">
            <input
              type="text"
              bind:value={channelSearch}
              placeholder="Rechercher un salon..."
              class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-lg pl-11 pr-5 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all outline-none"
            />
            <div class="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50">
              <Papicon icon="search" size={16} />
            </div>
          </div>
          <div class="px-5 py-3 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 flex items-center gap-2 text-xs font-bold shrink-0">
            <span class="text-primary">{selectedChannelIds.length}</span>
            <span class="text-on-surface-variant/60">salon(s) sélectionné(s)</span>
          </div>
        </div>

        {#if filteredChannels.length > 0}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-2">
            {#each filteredChannels as channel (channel.id)}
              {@const isChecked = selectedChannelIds.includes(channel.id)}
              <button
                type="button"
                onclick={() => toggleChannelChoice(channel.id)}
                class="flex items-center justify-between p-4 rounded-lg border transition-all text-left group
                  {isChecked
                    ? 'bg-primary/5 border-primary/30 text-primary hover:bg-primary/10'
                    : 'bg-surface-container-high/10 border-outline-variant/5 hover:bg-surface-container-high/30'}"
              >
                <div class="flex items-center gap-3 min-w-0">
                  <span class="text-sm font-semibold opacity-60 shrink-0">#</span>
                  <span class="text-sm font-semibold truncate">{channel.name}</span>
                </div>
                <div class="w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all
                  {isChecked
                    ? 'bg-primary border-primary text-on-primary'
                    : 'border-outline-variant/30 group-hover:border-outline-variant/60'}"
                >
                  {#if isChecked}
                    <Papicon icon="check" size={12} class="text-white" />
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        {:else}
          <p class="text-xs font-semibold text-on-surface-variant/40 text-center py-8">Aucun salon trouvé.</p>
        {/if}
      {/if}

      {#if messagesError}
        <div class="rounded-lg bg-rose-500/10 border border-rose-500/20 p-4 text-xs font-semibold text-rose-500">
          {messagesError}
        </div>
      {/if}

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" onclick={closeModal} class="rounded-lg px-6 py-3 text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 hover:text-on-surface transition-all">
          Annuler
        </button>
        <button
          type="button"
          onclick={loadMessages}
          disabled={selectedChannelIds.length === 0 || loadingMessages}
          class="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-3 text-[11px] font-semibold text-on-primary uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
        >
          {#if loadingMessages}
            <div class="w-3.5 h-3.5 rounded-full border-2 border-on-primary border-t-transparent animate-spin"></div>
          {:else}
            <Papicon icon="search" size={14} />
          {/if}
          Charger les messages
        </button>
      </div>

    {:else if step === 'messages'}
      <p class="text-xs font-semibold text-on-surface-variant/60">
        Cochez les messages de <span class="text-on-surface font-bold">{targetTag}</span> à inclure dans la preuve. Une transcription distincte sera générée par salon.
      </p>

      <div class="flex flex-col gap-6 max-h-[420px] overflow-y-auto pr-2">
        {#each channelResults as result (result.channelId)}
          <div class="rounded-xl border border-outline-variant/10 overflow-hidden">
            <div class="flex items-center justify-between px-4 py-3 bg-surface-container-high/30">
              <span class="text-sm font-bold text-on-surface">#{result.channelName || result.channelId}</span>
              {#if result.messages && result.messages.length > 0}
                <button
                  type="button"
                  onclick={() => toggleSelectAll(result.channelId, result.messages ?? [])}
                  class="text-[10px] font-semibold uppercase tracking-widest text-primary hover:underline"
                >
                  Tout sélectionner
                </button>
              {/if}
            </div>

            {#if result.error}
              <p class="p-4 text-xs font-semibold text-rose-500">{result.error}</p>
            {:else if !result.messages || result.messages.length === 0}
              <p class="p-4 text-xs font-semibold text-on-surface-variant/40">
                Aucun message récent de {targetTag} trouvé dans ce salon.
              </p>
            {:else}
              <div class="flex flex-col divide-y divide-outline-variant/5">
                {#each result.messages as message (message.id)}
                  {@const isChecked = (selectedMessageIds[result.channelId] ?? []).includes(message.id)}
                  <button
                    type="button"
                    onclick={() => toggleMessage(result.channelId, message.id)}
                    class="flex items-start gap-3 p-4 text-left transition-all {isChecked ? 'bg-primary/5' : 'hover:bg-surface-container-high/20'}"
                  >
                    <div class="w-5 h-5 mt-0.5 rounded-md border flex items-center justify-center shrink-0 transition-all
                      {isChecked
                        ? 'bg-primary border-primary text-on-primary'
                        : 'border-outline-variant/30'}"
                    >
                      {#if isChecked}
                        <Papicon icon="check" size={12} class="text-white" />
                      {/if}
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/40 mb-1">
                        {formatTimestamp(message.createdAt)}
                      </p>
                      <div class="discord-bubble">
                        {#if message.content}
                          <p class="discord-bubble-text"><DiscordMarkdownText text={message.content} /></p>
                        {:else if message.attachments.length === 0 && message.embeds.length === 0 && message.stickers.length === 0}
                          <p class="discord-bubble-text discord-bubble-empty">(Pas de texte)</p>
                        {/if}

                        {#if message.attachments.length > 0}
                          <div class="flex flex-wrap gap-2 mt-2">
                            {#each message.attachments as attachment}
                              {#if attachment.kind === 'image'}
                                <img src={attachment.url} alt={attachment.name} class="discord-attachment-img" loading="lazy" />
                              {:else if attachment.kind === 'video'}
                                <!-- svelte-ignore a11y_media_has_caption -->
                                <video src={attachment.url} controls class="discord-attachment-video"></video>
                              {:else}
                                <span class="discord-attachment-file">📎 {attachment.name}</span>
                              {/if}
                            {/each}
                          </div>
                        {/if}

                        {#each message.embeds as embed, i (i)}
                          <DiscordEmbedPreview {embed} />
                        {/each}

                        {#if message.stickers.length > 0}
                          <div class="flex flex-wrap gap-2 mt-2">
                            {#each message.stickers as sticker (sticker.id)}
                              <img src={sticker.url} alt={sticker.name} title={sticker.name} class="discord-sticker" />
                            {/each}
                          </div>
                        {/if}
                      </div>
                    </div>
                  </button>
                {/each}
              </div>
              {#if result.truncated}
                <p class="px-4 py-3 text-[10px] font-semibold text-amber-600 bg-amber-500/5">
                  Recherche arrêtée après 400 messages parcourus — {targetTag} n'a peut-être pas écrit récemment ici.
                </p>
              {/if}
            {/if}
          </div>
        {/each}
      </div>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" onclick={() => (step = 'channels')} class="rounded-lg px-6 py-3 text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60 hover:text-on-surface transition-all">
          Retour
        </button>
        <button
          type="button"
          onclick={generateTranscripts}
          disabled={totalSelectedCount === 0}
          class="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-3 text-[11px] font-semibold text-on-primary uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
        >
          <Papicon icon="check-circle" size={14} />
          Générer la transcription et ajouter comme preuve
        </button>
      </div>

    {:else if step === 'generating'}
      <div class="flex flex-col items-center justify-center gap-4 py-16">
        <div class="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
        <p class="text-xs font-semibold uppercase tracking-widest text-on-surface-variant/60">
          Génération de la transcription en cours...
        </p>
      </div>

    {:else if step === 'done'}
      <div class="flex flex-col gap-4 py-4">
        {#if generateSummary}
          <div class="rounded-xl p-4 text-xs font-semibold uppercase tracking-widest bg-emerald-500/10 text-emerald-500">
            {generateSummary}
          </div>
        {/if}
        {#each generateErrors as error}
          <div class="rounded-xl p-4 text-xs font-semibold text-rose-500 bg-rose-500/10">
            {error.error}
          </div>
        {/each}
        <div class="flex justify-end pt-2">
          <button
            type="button"
            onclick={closeModal}
            class="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-3 text-[11px] font-semibold text-on-primary uppercase tracking-widest transition-all active:scale-95"
          >
            Terminé
          </button>
        </div>
      </div>
    {/if}
  </div>
</Modal>

<style>
  /* Palette alignée sur apps/bot/src/services/features/transcriptService.ts (thème Discord sombre) */
  .discord-bubble {
    background-color: #313338;
    color: #dbdee1;
    border-radius: 8px;
    padding: 10px 12px;
  }

  .discord-bubble-text {
    font-size: 13px;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
  }

  .discord-bubble-empty {
    color: #80848e;
    font-style: italic;
  }

  .discord-attachment-img {
    height: 4rem;
    width: 4rem;
    object-fit: cover;
    border-radius: 8px;
    border: 1px solid #1e1f22;
  }

  .discord-attachment-video {
    max-width: 220px;
    max-height: 140px;
    border-radius: 8px;
  }

  .discord-attachment-file {
    font-size: 10px;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 6px;
    background-color: #2b2d31;
    color: #949ba4;
  }

  .discord-sticker {
    width: 80px;
    height: 80px;
    object-fit: contain;
  }
</style>
