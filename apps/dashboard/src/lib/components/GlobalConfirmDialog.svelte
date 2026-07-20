<script lang="ts">
  import ConfirmModal from './ConfirmModal.svelte';
  import { confirmDialog } from '../stores/confirmDialog.svelte';
</script>

<ConfirmModal
  bind:open={confirmDialog.open}
  title={confirmDialog.options.title ?? 'Confirmation requise'}
  description={confirmDialog.options.description ?? ''}
  confirmLabel={confirmDialog.options.confirmLabel ?? 'Confirmer'}
  cancelLabel={confirmDialog.options.cancelLabel ?? 'Annuler'}
  variant={confirmDialog.options.variant ?? 'default'}
  requireInput={confirmDialog.options.requireInput ?? ''}
  onConfirm={() => confirmDialog.resolve(true)}
  onCancel={() => confirmDialog.resolve(false)}
/>
