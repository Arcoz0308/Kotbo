<script lang="ts">
  import { onMount } from 'svelte';
  import { API_BASE_URL } from '../lib/api';
  import { authStore } from '../lib/stores/auth.svelte';

  const { transcriptId } = $props<{ transcriptId: string }>();

  let iframeUrl = $state('');
  let error = $state('');

  onMount(async () => {
    try {
      const guildId = authStore.selectedGuildId;
      const response = await fetch(
        `${API_BASE_URL}/api/dashboard/guilds/${guildId}/tickets/transcripts/${transcriptId}/signed-url`,
        { headers: { Authorization: `Bearer ${authStore.token}` } },
      );
      if (response.ok) {
        const data = await response.json();
        iframeUrl = `${API_BASE_URL}${data.signedUrl}`;
      } else {
        error = 'Impossible de charger la transcription.';
      }
    } catch {
      error = 'Erreur lors du chargement.';
    }
  });
</script>

<div class="fixed inset-0 w-full h-full bg-[#313338] overflow-hidden flex flex-col">
  {#if error}
    <div class="flex items-center justify-center h-full text-white/50 text-sm">{error}</div>
  {:else if iframeUrl}
    <iframe
      src={iframeUrl}
      title="Transcription de Ticket Discord"
      class="w-full h-full border-none"
    ></iframe>
  {:else}
    <div class="flex items-center justify-center h-full">
      <div class="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
    </div>
  {/if}
</div>
