<script lang="ts">
  import { onMount } from 'svelte';
  import { inviteDetailsModal } from '../lib/stores/inviteDetailsModal.svelte';

  interface Props {
    code?: string;
  }

  const { code = '' }: Props = $props();

  const invitationTabPaths = new Set(['sources', 'top', 'suspensions']);

  onMount(() => {
    // Tinro also matches tab URLs such as /invitations/sources against
    // /invitations/:code. Only open the detail modal for actual invite codes.
    if (code && !invitationTabPaths.has(code)) {
      inviteDetailsModal.show(code);
    }
  });
</script>
