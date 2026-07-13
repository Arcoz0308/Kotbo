<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Modal from '../Modal.svelte';
  import Papicon from '../Papicon.svelte';
  import { fetchTranscripts, type TranscriptSummary } from '../../api';

  let {
    open = $bindable(false),
    onAttach
  } = $props<{
    open: boolean;
    onAttach: (url: string) => void;
  }>();

  let query = $state('');
  let transcripts = $state<TranscriptSummary[]>([]);
  let loading = $state(false);
  let total = $state(0);
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  async function load() {
    loading = true;
    try {
      const res = await fetchTranscripts({ q: query.trim() || undefined, limit: 15 });
      transcripts = res.transcripts;
      total = res.total;
    } catch (err) {
      console.error(err);
      transcripts = [];
      total = 0;
    } finally {
      loading = false;
    }
  }

  function handleSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => load(), 300);
  }

  function selectTranscript(t: TranscriptSummary) {
    const url = `${window.location.origin}/transcripts/${t.id}`;
    onAttach(url);
    open = false;
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  $effect(() => {
    if (open) {
      untrack(() => {
        query = '';
        load();
      });
    }
  });
</script>

<Modal bind:open title="Attacher une transcription existante" size="lg">
  <div class="flex flex-col gap-5 p-6">
    <div class="text-xs text-on-surface-variant/70 leading-relaxed">
      Sélectionnez une transcription de salon précédemment enregistrée pour l'ajouter comme preuve.
    </div>

    <!-- Search input -->
    <div class="relative">
      <div class="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50">
        <Papicon icon="search" size={16} />
      </div>
      <input
        type="text"
        bind:value={query}
        oninput={handleSearchInput}
        placeholder="Rechercher par nom de salon ou ID…"
        class="w-full pl-10 pr-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/60 transition-colors"
      />
    </div>

    <!-- List -->
    <div class="max-h-[300px] overflow-y-auto space-y-2 pr-1">
      {#if loading}
        <div class="flex items-center justify-center py-8">
          <div class="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full"></div>
        </div>
      {:else if transcripts.length === 0}
        <div class="text-center py-8 text-xs text-on-surface-variant/50">
          Aucune transcription trouvée.
        </div>
      {:else}
        {#each transcripts as t (t.id)}
          <div class="flex items-center justify-between p-3 bg-surface-container-high/20 border border-outline-variant/15 rounded-lg hover:border-outline-variant/30 transition-colors">
            <div class="min-w-0 flex-1 pr-4">
              <div class="flex items-center gap-1.5 text-xs font-semibold text-on-surface truncate">
                <span class="text-primary font-bold">#</span>
                <span>{t.channelName}</span>
              </div>
              <div class="text-[10px] text-on-surface-variant/50 mt-0.5">
                Générée le {formatDate(t.createdAt)} · ID : <span class="font-mono">{t.id}</span>
              </div>
            </div>
            <button
              type="button"
              onclick={() => selectTranscript(t)}
              class="px-3.5 py-1.5 text-xs font-medium bg-primary/10 text-primary hover:bg-primary hover:text-on-primary rounded-lg transition-all active:scale-95"
            >
              Attacher
            </button>
          </div>
        {/each}
      {/if}
    </div>

    <div class="flex justify-end gap-2 border-t border-outline-variant/10 pt-4">
      <button
        type="button"
        onclick={() => (open = false)}
        class="px-4 py-2.5 text-xs font-medium text-on-surface-variant/60 hover:text-on-surface transition-colors"
      >
        Annuler
      </button>
    </div>
  </div>
</Modal>
