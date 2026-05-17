<script lang="ts">
  import { onMount } from 'svelte';
  import { inviteDetailsModal } from '../lib/stores/inviteDetailsModal.svelte';
  import Invitations from './Invitations.svelte';

  interface Props {
    code?: string;
  }

  let { code = '' }: Props = $props();

  onMount(() => {
    if (code) {
      inviteDetailsModal.show(code);
    }
  });
</script>

<Invitations />
