<script lang="ts">
  import { onMount } from 'svelte';
  import { API_BASE_URL } from '../lib/api';
  
  const { transcriptId } = $props<{ transcriptId: string }>();
  
  let iframeUrl = $state('');
  
  onMount(() => {
    iframeUrl = `${API_BASE_URL}/api/public/transcripts/${transcriptId}`;
  });
</script>

<div class="fixed inset-0 w-full h-full bg-[#313338] overflow-hidden flex flex-col">
  {#if iframeUrl}
    <iframe
      src={iframeUrl}
      title="Transcription de Ticket Discord"
      class="w-full h-full border-none"
    ></iframe>
  {/if}
</div>
