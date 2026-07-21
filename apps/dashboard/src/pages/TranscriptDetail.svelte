<script lang="ts">
  import { onMount } from 'svelte';
  import { API_BASE_URL } from '../lib/api';
  import { authStore } from '../lib/stores/auth.svelte';
  import Papicon from '../lib/components/Papicon.svelte';

  const { transcriptId } = $props<{ transcriptId: string }>();

  let iframeUrl = $state('');
  let error = $state('');
  let needsLogin = $state(false);

  const loginUrl = `${API_BASE_URL}/api/auth/discord/login?returnTo=${encodeURIComponent(`/transcripts/${transcriptId}`)}`;

  onMount(async () => {
    await authStore.initialize();

    if (!authStore.isAuthenticated) {
      needsLogin = true;
      return;
    }

    try {
      const guildId = authStore.selectedGuildId;
      const response = await fetch(
        `${API_BASE_URL}/api/dashboard/guilds/${guildId}/tickets/transcripts/${transcriptId}/signed-url`,
        { headers: { Authorization: `Bearer ${authStore.token}` }, credentials: 'include' },
      );
      if (response.status === 401) {
        needsLogin = true;
      } else if (response.ok) {
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
  {#if needsLogin}
    <div class="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
      <p class="text-white/70 text-sm">
        Vous devez être connecté au dashboard pour voir cette transcription.
      </p>
      <a
        href={loginUrl}
        class="flex items-center justify-center gap-2.5 py-2.5 px-4 bg-primary text-on-primary rounded-lg font-medium text-sm hover:opacity-90 transition-opacity"
      >
        <Papicon icon="discord" size={18} />
        Se connecter avec Discord
      </a>
    </div>
  {:else if error}
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
