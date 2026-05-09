<script lang="ts">
  import Papicon from './Papicon.svelte';
  import FormInput from './FormInput.svelte';
  import FormSelect from './FormSelect.svelte';
  import FormTextarea from './FormTextarea.svelte';
  import ActionButton from './ActionButton.svelte';

  let { 
    show = false, 
    onClose = () => {}, 
    onSave = (data: any) => {},
    staffMembers = [],
    eligibleSuperiors = [],
    isAdmin = false,
    initialDate = new Date(),
    initialEndDate = null
  } = $props();

  let saving = $state(false);
  let errorMsg = $state('');

  let startDate = $state('');
  let startTime = $state('');
  let endDate = $state('');
  let endTime = $state('');
  let isAllDay = $state(true);
  let reason = $state('');
  let type = $state('CONGÉ');
  let superiorUserId = $state('');

  $effect(() => {
    if (show) {
      startDate = initialDate.toLocaleDateString('en-CA');
      startTime = initialDate.toTimeString().slice(0, 5);
      
      const end = initialEndDate || new Date(initialDate.getTime() + 3600000);
      endDate = end.toLocaleDateString('en-CA');
      endTime = end.toTimeString().slice(0, 5);
      
      isAllDay = !initialEndDate;
      // Reset other fields too
      reason = '';
      type = 'CONGÉ';
      superiorUserId = '';
    }
  });
  let isIndefinite = $state(false);
  let confirmIndefinite = $state(false);

  const absenceTypes = [
    { value: 'CONGÉ', label: 'Congé / Vacances' },
    { value: 'MALADIE', label: 'Maladie' },
    { value: 'PERSONNEL', label: 'Raison Personnelle' },
    { value: 'TRAVAIL', label: 'Travail / Études' },
    { value: 'RÉUNION', label: 'Réunion Staff' },
    { value: 'AUTRE', label: 'Autre' }
  ];

  async function handleSave() {
    if (!startDate || (!isIndefinite && !endDate) || !reason || !superiorUserId) {
      errorMsg = 'Veuillez remplir tous les champs obligatoires.';
      return;
    }

    if (!isIndefinite && new Date(endDate) < new Date(startDate)) {
      errorMsg = 'La date de fin doit être postérieure à la date de début.';
      return;
    }

    saving = true;
    errorMsg = '';

    try {
      await onSave({
        startDate: isAllDay ? new Date(`${startDate}T00:00:00`) : new Date(`${startDate}T${startTime}`),
        endDate: isIndefinite ? null : (isAllDay ? new Date(`${endDate}T23:59:59`) : new Date(`${endDate}T${endTime}`)),
        reason,
        type,
        superiorUserId,
        isIndefinite,
        confirmIndefinite
      });
      onClose();
    } catch (e: any) {
      errorMsg = e.message || 'Une erreur est survenue.';
    } finally {
      saving = false;
    }
  }
</script>

{#if show}
  <div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
    <div 
      class="absolute inset-0 bg-black/60 backdrop-blur-sm" 
      onclick={onClose}
      onkeydown={(e) => e.key === 'Escape' && onClose()}
      role="button"
      tabindex="-1"
    ></div>
    
    <div class="relative w-full max-w-2xl bg-surface-container-lowest rounded-[2.5rem] shadow-2xl overflow-hidden border border-outline-variant/30 flex flex-col max-h-[90vh]">
      <!-- Header -->
      <header class="p-8 border-b border-outline-variant/30 bg-primary/5 flex items-center justify-between">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
            <Papicon icon="calendar-plus" size={24} class="text-white" />
          </div>
          <div>
            <h3 class="text-2xl font-black text-on-surface">Organiser une Absence</h3>
            <p class="text-sm text-on-surface-variant font-medium">Planifiez votre indisponibilité comme une réunion Outlook.</p>
          </div>
        </div>
        <button onclick={onClose} class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-hover transition-colors">
          <Papicon icon="x" size={24} />
        </button>
      </header>

      <!-- Content -->
      <div class="p-8 space-y-8 overflow-y-auto">
        <!-- Time Section -->
        <section class="space-y-4">
          <h4 class="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Créneau Horaire</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <label for="start-date" class="block text-xs font-bold text-on-surface-variant ml-1">Début</label>
              <div class="flex gap-2">
                <FormInput id="start-date" type="date" bind:value={startDate} className="flex-[2]" />
                <FormInput type="time" bind:value={startTime} className="flex-1" disabled={isAllDay} />
              </div>
            </div>
            <div class="space-y-2">
              <label for="end-date" class="block text-xs font-bold text-on-surface-variant ml-1">Fin</label>
              <div class="flex gap-2">
                <FormInput id="end-date" type="date" bind:value={endDate} className="flex-[2]" disabled={isIndefinite} />
                <FormInput type="time" bind:value={endTime} className="flex-1" disabled={isIndefinite || isAllDay} />
              </div>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-6 px-2">
            <div class="flex items-center gap-3">
              <input type="checkbox" id="all-day" bind:checked={isAllDay} class="w-4 h-4 rounded border-outline text-primary focus:ring-primary" />
              <label for="all-day" class="text-sm font-bold text-on-surface">Toute la journée</label>
            </div>
            <div class="flex items-center gap-3">
              <input type="checkbox" id="indefinite" bind:checked={isIndefinite} class="w-4 h-4 rounded border-outline text-primary focus:ring-primary" />
              <label for="indefinite" class="text-sm font-bold text-on-surface">Absence indéterminée</label>
            </div>
          </div>
        </section>

        <!-- Details Section -->
        <section class="space-y-6">
          <h4 class="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Détails de l'absence</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div class="space-y-2">
              <label for="type" class="block text-xs font-bold text-on-surface-variant ml-1">Type d'absence</label>
              <FormSelect id="type" bind:value={type} className="w-full">
                {#each absenceTypes as at}
                  <option value={at.value}>{at.label}</option>
                {/each}
              </FormSelect>
            </div>
            <div class="space-y-2">
              <label for="superior" class="block text-xs font-bold text-on-surface-variant ml-1">Référent / Approbateur</label>
              <FormSelect id="superior" bind:value={superiorUserId} className="w-full">
                <option value="" disabled>Sélectionner un responsable...</option>
                {#each eligibleSuperiors as superior}
                  <option value={superior.userId}>
                    {superior.displayName || superior.username} ({superior.grade})
                  </option>
                {/each}
              </FormSelect>
            </div>
          </div>
          <div class="space-y-2">
            <label for="reason" class="block text-xs font-bold text-on-surface-variant ml-1">Motif / Description</label>
            <FormTextarea 
              id="reason"
              bind:value={reason}
              placeholder="Expliquez brièvement la raison de votre absence..."
              rows={3}
              className="w-full"
            />
          </div>
        </section>

        {#if errorMsg}
          <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex gap-3 animate-shake">
            <Papicon icon="alert-circle" size={18} class="text-red-500" />
            <p class="text-xs text-red-700 font-bold">{errorMsg}</p>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <footer class="p-8 border-t border-outline-variant/30 bg-surface-container-lowest flex items-center justify-end gap-4">
        <button onclick={onClose} class="px-6 py-3 font-bold text-on-surface-variant hover:bg-surface-hover rounded-2xl transition-all">
          Annuler
        </button>
        <ActionButton 
          variant="primary" 
          onClick={handleSave} 
          loading={saving} 
          label="Confirmer l'absence" 
          icon="check-circle"
        />
      </footer>
    </div>
  </div>
{/if}
