<script lang="ts">
  import Papicon from './Papicon.svelte';
  import FormSelect from './FormSelect.svelte';
  import FormTextarea from './FormTextarea.svelte';
  import ActionButton from './ActionButton.svelte';
  import Modal from './Modal.svelte';
  import { feedbackModal } from '../stores/feedbackModal.svelte';
  import { authStore } from '../stores/auth.svelte';
  import { toast } from '../stores/toast.svelte';
  import { reportFeedback } from '../api';

  let type = $state<'retour' | 'bloquage' | 'suggestion' | 'autre'>('retour');
  let message = $state('');
  let isSending = $state(false);

  const isOpen = $derived(feedbackModal.open);

  $effect(() => {
    if (isOpen) {
      type = 'retour';
      message = '';
    }
  });

  function closeModal() {
    feedbackModal.close();
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!message.trim()) {
      toast.warning('Veuillez saisir un message.');
      return;
    }
    if (message.length > 2000) {
      toast.warning('Le message ne doit pas dépasser 2000 caractères.');
      return;
    }

    isSending = true;
    try {
      await reportFeedback({
        type,
        message: message.trim(),
        url: window.location.href,
        guildId: authStore.selectedGuildId
      });
      toast.success('Votre retour a bien été transmis aux administrateurs. Merci !');
      closeModal();
    } catch (err: any) {
      toast.error(err?.message || 'Échec de l\'envoi du retour.');
    } finally {
      isSending = false;
    }
  }
</script>

<Modal
  open={isOpen}
  onClose={closeModal}
  title="Retour / Suggestion"
  subtitle="Aidez-nous à améliorer l'application"
  size="md"
>
  <!-- Premium background mesh glow -->
  <div class="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05] overflow-hidden">
    <div class="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-primary rounded-full blur-[100px]"></div>
    <div class="absolute bottom-[20%] right-[-10%] w-[50%] h-[50%] bg-secondary rounded-full blur-none hidden"></div>
  </div>

  <!-- Form Content -->
  <form onsubmit={handleSubmit} class="p-6 space-y-5 relative z-10">
    <!-- Type Selection -->
    <div class="space-y-2">
      <label for="feedback-type" class="text-xs font-semibold uppercase tracking-wider text-on-surface-variant/70">Type de retour</label>
      <FormSelect id="feedback-type" bind:value={type} className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-hidden focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all duration-300">
        <option value="retour">📬 Retour d'expérience</option>
        <option value="bloquage">🛑 Bloquage / Bug</option>
        <option value="suggestion">💡 Suggestion d'amélioration</option>
        <option value="autre">💬 Autre</option>
      </FormSelect>
    </div>

    <!-- Description Textarea -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <label for="feedback-message" class="text-xs font-semibold uppercase tracking-wider text-on-surface-variant/70">Message / Description</label>
        <span class="text-[10px] font-bold {message.length > 1900 ? 'text-error' : 'text-on-surface-variant/50'}">
          {message.length} / 2000
        </span>
      </div>
      <FormTextarea
        id="feedback-message"
        bind:value={message}
        rows={5}
        placeholder="Décrivez votre expérience, votre bug bloquant ou votre idée de fonctionnalité..."
        disabled={isSending}
        className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-hidden focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all duration-300 resize-none font-medium leading-relaxed placeholder:text-on-surface-variant/40"
      />
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-3 justify-end pt-3 border-t border-outline-variant/20">
      <ActionButton
        label="Annuler"
        variant="muted"
        size="md"
        onClick={closeModal}
        disabled={isSending}
      />
      <button
        type="submit"
        disabled={isSending || !message.trim()}
        class="px-5 py-2.5 text-xs rounded-xl font-semibold uppercase tracking-wide bg-primary text-on-primary border border-primary  hover:bg-primary-container active:scale-95 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 flex items-center gap-2"
      >
        {#if isSending}
          <div class="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin"></div>
          <span>Envoi en cours...</span>
        {:else}
          <Papicon icon="send" size={12} />
          <span>Transmettre</span>
        {/if}
      </button>
    </div>
  </form>
</Modal>
