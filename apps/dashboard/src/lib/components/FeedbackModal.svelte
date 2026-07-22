<script lang="ts">
  import Papicon from './Papicon.svelte';
  import FormSelect from './FormSelect.svelte';
  import FormTextarea from './FormTextarea.svelte';
  import FormInput from './FormInput.svelte';
  import ActionButton from './ActionButton.svelte';
  import Modal from './Modal.svelte';
  import { feedbackModal } from '../stores/feedbackModal.svelte';
  import { authStore } from '../stores/auth.svelte';
  import { toast } from '../stores/toast.svelte';
  import { reportFeedback, submitPartnershipApplication } from '../api';

  let type = $state<'retour' | 'bloquage' | 'suggestion' | 'autre' | 'partenariat' | 'beta'>('retour');
  let message = $state('');
  let isSending = $state(false);

  // Additional fields for Partnership / Beta test
  let projectName = $state('');
  let projectUrl = $state('');
  let memberCount = $state('');
  let description = $state('');
  let motivation = $state('');
  let experience = $state('');
  let availability = $state('');
  let contact = $state('');

  let successResult = $state<{
    alreadyMember: boolean;
    dmDelivered: boolean;
    inviteUrl: string | null;
  } | null>(null);

  const isOpen = $derived(feedbackModal.open);

  $effect(() => {
    if (isOpen) {
      type = 'retour';
      message = '';
      projectName = '';
      projectUrl = '';
      memberCount = '';
      description = '';
      motivation = '';
      experience = '';
      availability = '';
      contact = '';
      successResult = null;
    }
  });

  function closeModal() {
    feedbackModal.close();
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();

    if (type === 'partenariat' || type === 'beta') {
      if (!projectName.trim()) {
        toast.warning('Veuillez saisir le nom de votre projet.');
        return;
      }
      if (!description.trim()) {
        toast.warning('Veuillez décrire votre projet.');
        return;
      }
      if (!motivation.trim()) {
        toast.warning('Veuillez saisir vos motivations.');
        return;
      }

      isSending = true;
      try {
        const res = await submitPartnershipApplication({
          category: type,
          projectName: projectName.trim(),
          projectUrl: projectUrl.trim() || null,
          memberCount: memberCount.trim() || null,
          description: description.trim(),
          motivation: motivation.trim(),
          experience: experience.trim() || null,
          availability: availability.trim() || null,
          contact: contact.trim() || null
        });
        successResult = res;
        toast.success('Votre candidature a bien été envoyée !');
      } catch (err: any) {
        toast.error(err?.message || 'Échec de l\'envoi de la demande.');
      } finally {
        isSending = false;
      }
      return;
    }

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
  title={type === 'partenariat' || type === 'beta' ? 'Candidature Partenariat / Bêta-test' : 'Retour / Suggestion'}
  subtitle={type === 'partenariat' || type === 'beta' ? 'Présentez votre projet à notre équipe' : 'Aidez-nous à améliorer l\'application'}
  size={successResult ? 'md' : (type === 'partenariat' || type === 'beta' ? 'lg' : 'md')}
>
  <!-- Premium background mesh glow -->
  <div class="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05] overflow-hidden">
    <div class="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-primary rounded-full blur-[100px]"></div>
    <div class="absolute bottom-[20%] right-[-10%] w-[50%] h-[50%] bg-secondary rounded-full blur-none hidden"></div>
  </div>

  {#if successResult}
    <!-- Success screen -->
    <div class="p-6 space-y-6 text-center max-w-md mx-auto relative z-10">
      <div class="w-16 h-16 bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-2 border border-emerald-500/20">
        <Papicon icon="check_circle" size={32} />
      </div>
      
      <h3 class="text-xl font-bold text-on-surface">Candidature transmise !</h3>
      
      {#if successResult.alreadyMember}
        <p class="text-sm text-on-surface-variant leading-relaxed">
          Comme vous êtes déjà sur notre serveur Discord, un ticket privé avec le staff a été automatiquement ouvert pour échanger avec vous.
        </p>
        {#if successResult.dmDelivered}
          <p class="text-xs text-on-surface-variant/70 italic">
            Un récapitulatif vous a été envoyé par Message Privé (MP).
          </p>
        {/if}
      {:else}
        <div class="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-2 text-left">
          <p class="text-sm font-semibold text-amber-500 flex items-center gap-1.5">
            ⚠️ Action requise pour valider votre demande !
          </p>
          <p class="text-xs text-on-surface-variant leading-relaxed">
            Pour que votre candidature soit prise en compte, <strong>vous devez impérativement rejoindre notre serveur</strong>. Un ticket d'échange y sera alors créé automatiquement.
          </p>
        </div>

        {#if successResult.inviteUrl}
          <a
            href={successResult.inviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center justify-center w-full px-5 py-3 rounded-xl font-semibold bg-primary text-on-primary hover:bg-primary-container transition-all duration-200 gap-2 shadow-md hover:shadow-lg active:scale-[0.98]"
          >
            <Papicon icon="external-link" size={14} />
            <span>Rejoindre le serveur Discord</span>
          </a>
        {:else}
          <p class="text-sm text-error/80 italic font-medium">
            (Lien d'invitation indisponible. Veuillez contacter un administrateur)
          </p>
        {/if}

        {#if successResult.dmDelivered}
          <p class="text-xs text-on-surface-variant/70 italic">
            Le lien et un récapitulatif de votre candidature vous ont également été envoyés par Message Privé (MP).
          </p>
        {:else}
          <p class="text-xs text-error/70 italic">
            Nous n'avons pas pu vous envoyer de Message Privé (assurez-vous de permettre les DMs des membres du serveur).
          </p>
        {/if}
      {/if}

      <div class="pt-4 border-t border-outline-variant/20">
        <ActionButton
          label="Fermer"
          variant="muted"
          size="md"
          className="w-full"
          onClick={closeModal}
        />
      </div>
    </div>
  {:else}
    <!-- Form Content -->
    <form onsubmit={handleSubmit} class="p-6 space-y-5 relative z-10">
      <!-- Type Selection -->
      <div class="space-y-2">
        <label for="feedback-type" class="text-[13px] font-medium text-on-surface-variant/70">Type de retour</label>
        <FormSelect id="feedback-type" bind:value={type} className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-hidden focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all duration-300">
          <option value="retour">📬 Retour d'expérience</option>
          <option value="bloquage">🛑 Bloquage / Bug</option>
          <option value="suggestion">💡 Suggestion d'amélioration</option>
          <option value="partenariat">🤝 Demande de Partenariat</option>
          <option value="beta">🧪 Demande de Bêta-test</option>
          <option value="autre">💬 Autre</option>
        </FormSelect>
      </div>

      {#if type === 'partenariat' || type === 'beta'}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Nom du projet -->
          <div class="space-y-1.5">
            <label for="p-name" class="text-[13px] font-medium text-on-surface-variant/70">Nom du Projet / Serveur *</label>
            <FormInput
              id="p-name"
              bind:value={projectName}
              placeholder="Ex: Mon Super Serveur"
              disabled={isSending}
              className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-low px-4 py-2.5 text-sm text-on-surface outline-hidden focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all duration-300 font-medium"
            />
          </div>

          <!-- Lien du projet -->
          <div class="space-y-1.5">
            <label for="p-url" class="text-[13px] font-medium text-on-surface-variant/70">Lien du projet (URL)</label>
            <FormInput
              id="p-url"
              bind:value={projectUrl}
              placeholder="Ex: https://discord.gg/..."
              disabled={isSending}
              className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-low px-4 py-2.5 text-sm text-on-surface outline-hidden focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all duration-300 font-medium"
            />
          </div>

          <!-- Nombre de membres -->
          <div class="space-y-1.5">
            <label for="p-members" class="text-[13px] font-medium text-on-surface-variant/70">Nombre de membres / Audience</label>
            <FormInput
              id="p-members"
              bind:value={memberCount}
              placeholder="Ex: 1500"
              disabled={isSending}
              className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-low px-4 py-2.5 text-sm text-on-surface outline-hidden focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all duration-300 font-medium"
            />
          </div>

          <!-- Disponibilités -->
          <div class="space-y-1.5">
            <label for="p-avail" class="text-[13px] font-medium text-on-surface-variant/70">Disponibilités</label>
            <FormInput
              id="p-avail"
              bind:value={availability}
              placeholder="Ex: Soirs et week-ends"
              disabled={isSending}
              className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-low px-4 py-2.5 text-sm text-on-surface outline-hidden focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all duration-300 font-medium"
            />
          </div>
        </div>

        <!-- Autre contact -->
        <div class="space-y-1.5">
          <label for="p-contact" class="text-[13px] font-medium text-on-surface-variant/70">Autre moyen de contact (ex: Discord, Mail, Telegram...)</label>
          <FormInput
            id="p-contact"
            bind:value={contact}
            placeholder="Ex: mon_tag ou contact@projet.com"
            disabled={isSending}
            className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-low px-4 py-2.5 text-sm text-on-surface outline-hidden focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all duration-300 font-medium"
          />
        </div>

        <!-- Description -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <label for="p-desc" class="text-[13px] font-medium text-on-surface-variant/70">Description du projet *</label>
            <span class="text-[10px] font-bold {description.length > 1900 ? 'text-error' : 'text-on-surface-variant/50'}">
              {description.length} / 2000
            </span>
          </div>
          <FormTextarea
            id="p-desc"
            bind:value={description}
            rows={3}
            placeholder="Présentez votre projet de manière détaillée..."
            disabled={isSending}
            className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-hidden focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all duration-300 resize-none font-medium leading-relaxed placeholder:text-on-surface-variant/40"
          />
        </div>

        <!-- Motivation -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <label for="p-motiv" class="text-[13px] font-medium text-on-surface-variant/70">Motivations *</label>
            <span class="text-[10px] font-bold {motivation.length > 1900 ? 'text-error' : 'text-on-surface-variant/50'}">
              {motivation.length} / 2000
            </span>
          </div>
          <FormTextarea
            id="p-motiv"
            bind:value={motivation}
            rows={3}
            placeholder="Pourquoi souhaitez-vous collaborer / participer au bêta-test ?"
            disabled={isSending}
            className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-hidden focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all duration-300 resize-none font-medium leading-relaxed placeholder:text-on-surface-variant/40"
          />
        </div>

        <!-- Expérience -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <label for="p-exp" class="text-[13px] font-medium text-on-surface-variant/70">Expériences passées (le cas échéant)</label>
            <span class="text-[10px] font-bold {experience.length > 1900 ? 'text-error' : 'text-on-surface-variant/50'}">
              {experience.length} / 2000
            </span>
          </div>
          <FormTextarea
            id="p-exp"
            bind:value={experience}
            rows={2}
            placeholder="Avez-vous déjà géré des partenariats ou participé à des phases de test ?"
            disabled={isSending}
            className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-hidden focus:border-primary/40 focus:ring-4 focus:ring-primary/10 transition-all duration-300 resize-none font-medium leading-relaxed placeholder:text-on-surface-variant/40"
          />
        </div>
      {:else}
        <!-- Description Textarea (original) -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label for="feedback-message" class="text-[13px] font-medium text-on-surface-variant/70">Message / Description</label>
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
      {/if}

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
          disabled={isSending || (type !== 'partenariat' && type !== 'beta' ? !message.trim() : (!projectName.trim() || !description.trim() || !motivation.trim()))}
          class="px-5 py-2.5 text-xs rounded-xl font-semibold uppercase tracking-wide bg-primary text-on-primary border border-primary hover:bg-primary-container active:scale-95 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 flex items-center gap-2"
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
  {/if}
</Modal>
