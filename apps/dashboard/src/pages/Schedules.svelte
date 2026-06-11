<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import ActionButton from '../lib/components/ActionButton.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import Modal from '../lib/components/Modal.svelte';
  import Skeleton from '../lib/components/Skeleton.svelte';
  import SearchableSelect from '../lib/components/SearchableSelect.svelte';
  import FormSelect from '../lib/components/FormSelect.svelte';
  import {
    fetchSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    runScheduleNow
  } from '../lib/api';

  const loadAction = createAsyncActionState();
  const createAction = createAsyncActionState();
  const updateAction = createAsyncActionState();
  const deleteAction = createAsyncActionState();
  const runAction = createAsyncActionState();

  let loading = $state(false);
  let schedules = $state<any[]>([]);
  let showCreateModal = $state(false);
  let showDeleteModal = $state(false);
  let selectedSchedule = $state<any>(null);
  let isEditing = $state(false);

  // Form states
  let formName = $state('');
  let formType = $state('CHANNEL_RESET');
  let formTargetId = $state<string | null>(null);
  let formFrequency = $state('daily');
  let formCron = $state('0 0 * * *');

  const canManageSchedules = $derived(
    !!dashboardStore.state.access?.canManageSettings
  );

  const availableChannels = $derived(
    dashboardStore.state.discordChannels || []
  );

  // Predefined frequencies mapping
  const frequencies = [
    { key: 'hourly', label: 'Toutes les heures', value: '0 * * * *' },
    { key: 'daily', label: 'Chaque jour à minuit', value: '0 0 * * *' },
    { key: 'weekly', label: 'Chaque semaine (dimanche à minuit)', value: '0 0 * * 0' },
    { key: 'monthly', label: 'Chaque mois (le 1er à minuit)', value: '0 0 1 * *' },
    { key: 'custom', label: 'Personnalisée (Expression Cron)', value: '' }
  ];

  onMount(async () => {
    await loadSchedules();
  });

  async function loadSchedules() {
    loading = true;
    try {
      const data = await fetchSchedules(authStore.selectedGuildId ?? '');
      schedules = data || [];
    } catch (error) {
      console.error('Erreur lors du chargement des planifications:', error);
    }
    loading = false;
  }

  function handleFrequencyChange(freqKey: string) {
    formFrequency = freqKey;
    const found = frequencies.find(f => f.key === freqKey);
    if (found && freqKey !== 'custom') {
      formCron = found.value;
    }
  }

  function openCreateModal() {
    isEditing = false;
    formName = '';
    formType = 'CHANNEL_RESET';
    formTargetId = null;
    formFrequency = 'daily';
    formCron = '0 0 * * *';
    showCreateModal = true;
  }

  function openEditModal(schedule: any) {
    isEditing = true;
    selectedSchedule = schedule;
    formName = schedule.name;
    formType = schedule.type;
    formTargetId = schedule.targetId;
    
    // Detect frequency type
    const foundFreq = frequencies.find(f => f.value === schedule.cron);
    if (foundFreq) {
      formFrequency = foundFreq.key;
      formCron = foundFreq.value;
    } else {
      formFrequency = 'custom';
      formCron = schedule.cron;
    }

    showCreateModal = true;
  }

  async function handleSaveSchedule() {
    if (!formName.trim()) {
      createAction.setError('Le nom de la planification est requis.');
      return;
    }

    if (formType !== 'SERVER_BACKUP' && !formTargetId) {
      createAction.setError('Un salon cible est requis pour ce type de tâche.');
      return;
    }

    const payload = {
      name: formName,
      type: formType,
      cron: formCron,
      targetId: formType === 'SERVER_BACKUP' ? null : formTargetId,
      enabled: isEditing ? selectedSchedule.enabled : true
    };

    await createAction.run(async () => {
      if (isEditing && selectedSchedule) {
        await updateSchedule(selectedSchedule.id, payload, authStore.selectedGuildId ?? '');
      } else {
        await createSchedule(payload, authStore.selectedGuildId ?? '');
      }
      showCreateModal = false;
      await loadSchedules();
      return true;
    }, {
      successMessage: isEditing ? 'Planification mise à jour avec succès.' : 'Planification créée avec succès.'
    });
  }

  async function handleDeleteSchedule() {
    if (!selectedSchedule) return;
    await deleteAction.run(async () => {
      await deleteSchedule(selectedSchedule.id, authStore.selectedGuildId ?? '');
      showDeleteModal = false;
      selectedSchedule = null;
      await loadSchedules();
      return true;
    }, {
      successMessage: 'Planification supprimée avec succès.'
    });
  }

  async function handleToggleActive(schedule: any, enabled: boolean) {
    await updateAction.run(async () => {
      await updateSchedule(schedule.id, { enabled }, authStore.selectedGuildId ?? '');
      await loadSchedules();
      return true;
    }, {
      successMessage: enabled ? 'Planification activée.' : 'Planification désactivée.'
    });
  }

  async function handleRunNow(schedule: any) {
    await runAction.run(async () => {
      await runScheduleNow(schedule.id, authStore.selectedGuildId ?? '');
      await loadSchedules();
      return true;
    }, {
      successMessage: 'Planification lancée manuellement en arrière-plan.'
    });
  }

  function getChannelName(channelId: string | null): string {
    if (!channelId) return 'Aucun';
    const found = availableChannels.find((c: any) => c.id === channelId);
    return found ? `#${found.name}` : `#${channelId}`;
  }

  function formatType(type: string): string {
    switch (type) {
      case 'CHANNEL_RESET': return 'Réinitialisation de salon';
      case 'SERVER_BACKUP': return 'Sauvegarde de serveur';
      case 'DATA_EXPORT': return 'Exportation de données';
      default: return type;
    }
  }

  function formatCron(cronExp: string): string {
    const matched = frequencies.find(f => f.value === cronExp);
    return matched ? matched.label : cronExp;
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return 'Jamais';
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
  <!-- Hero Header -->
  <header class="relative overflow-hidden flex flex-col md:flex-row md:items-center gap-6 bg-surface-container-low/40 backdrop-blur-3xl p-8 rounded-4xl border border-outline-variant/30">
    <div class="absolute inset-0 pointer-events-none">
      <div class="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary/5 blur-3xl"></div>
      <div class="absolute -bottom-8 -left-8 w-40 h-40 rounded-full bg-secondary/5 blur-2xl"></div>
    </div>
    <div class="relative flex items-center gap-6 flex-1">
      <div class="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-inner shrink-0">
        <Papicon icon="calendar" size={32} />
      </div>
      <div>
        <h1 class="text-3xl font-black tracking-tight leading-tight">Planifications de tâches</h1>
        <p class="text-on-surface-variant/70 font-medium mt-1">
          Configurez et automatisez des actions régulières sur votre serveur Discord.
        </p>
      </div>
    </div>
    {#if canManageSchedules}
      <div class="relative shrink-0">
        <ActionButton onClick={openCreateModal} variant="primary" label="Nouvelle planification" icon="plus" />
      </div>
    {/if}
  </header>

  <!-- Content Grid -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {#if loading}
      {#each Array(3) as _}
        <div class="bg-surface-container-low/30 border border-outline-variant/10 rounded-3xl p-6 h-[250px]">
          <Skeleton height="100%" radius="1.5rem" />
        </div>
      {/each}
    {:else if schedules.length === 0}
      <div class="col-span-full bg-surface-container-low/30 border border-outline-variant/10 rounded-[2.5rem] p-12 flex flex-col items-center justify-center text-center space-y-4">
        <div class="w-16 h-16 bg-surface-container-high/40 rounded-full flex items-center justify-center text-on-surface-variant/40 border border-outline-variant/10">
          <Papicon icon="calendar" size={32} />
        </div>
        <div class="space-y-1">
          <h3 class="text-xl font-black">Aucune planification</h3>
          <p class="text-sm text-on-surface-variant/70 font-medium">Créez votre première planification pour automatiser des tâches récurrentes.</p>
        </div>
        {#if canManageSchedules}
          <ActionButton onClick={openCreateModal} variant="primary" label="Créer une planification" icon="plus" />
        {/if}
      </div>
    {:else}
      {#each schedules as schedule}
        <div class="relative overflow-hidden bg-surface-container-low/30 border border-outline-variant/10 hover:border-primary/30 rounded-4xl p-6 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5">
          <div class="space-y-4">
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0 flex-1">
                <h3 class="text-lg font-black truncate leading-snug">{schedule.name}</h3>
                <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 mt-1 bg-surface-container-high/50 border border-outline-variant/15 text-[10px] font-black rounded-lg uppercase tracking-wider text-primary">
                  {formatType(schedule.type)}
                </span>
              </div>
              {#if canManageSchedules}
                <ToggleSwitch
                  checked={schedule.enabled}
                  onToggle={(v) => handleToggleActive(schedule, v)}
                  disabled={updateAction.state.loading}
                />
              {/if}
            </div>

            <!-- Details Block -->
            <div class="space-y-2.5 bg-surface-container-high/15 border border-outline-variant/5 p-4 rounded-2xl text-xs font-semibold text-on-surface-variant">
              <div class="flex items-center gap-2">
                <div class="text-primary/70 shrink-0"><Papicon icon="clock" size={16} /></div>
                <span class="truncate">Fréquence : {formatCron(schedule.cron)}</span>
              </div>
              {#if schedule.type !== 'SERVER_BACKUP'}
                <div class="flex items-center gap-2">
                  <div class="text-primary/70 shrink-0"><Papicon icon="hash" size={16} /></div>
                  <span class="truncate">Salon cible : {getChannelName(schedule.targetId)}</span>
                </div>
              {/if}
              <div class="flex items-center gap-2 border-t border-outline-variant/5 pt-2 mt-1">
                <div class="text-primary/70 shrink-0"><Papicon icon="history" size={16} /></div>
                <span class="truncate">Dernier lancement : {formatDate(schedule.lastRun)}</span>
              </div>
            </div>
          </div>

          <!-- Actions Footer -->
          <div class="flex items-center justify-end gap-2 pt-4 border-t border-outline-variant/10 mt-4 shrink-0">
            {#if canManageSchedules}
              <ActionButton
                onClick={() => handleRunNow(schedule)}
                variant="muted"
                size="sm"
                label="Lancer"
                icon="play"
                disabled={runAction.state.loading || !schedule.enabled}
              />
              <ActionButton
                onClick={() => openEditModal(schedule)}
                variant="muted"
                size="sm"
                label="Modifier"
                icon="edit-3"
                disabled={updateAction.state.loading}
              />
              <ActionButton
                onClick={() => { selectedSchedule = schedule; showDeleteModal = true; }}
                variant="danger"
                size="sm"
                label="Supprimer"
                icon="trash"
                disabled={deleteAction.state.loading}
              />
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <InlineFeedback state={updateAction} />
  <InlineFeedback state={runAction} />
</div>

<!-- Modal de création / édition de planification -->
<Modal bind:open={showCreateModal} title={isEditing ? "Modifier la planification" : "Créer une planification"}>
  <div class="space-y-6">
    <!-- Nom -->
    <div class="space-y-2">
      <span class="block text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Nom de la tâche</span>
      <input
        type="text"
        bind:value={formName}
        placeholder="ex: Réinitialisation Générale Salon Général"
        class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
      />
    </div>

    <!-- Type -->
    <div class="space-y-2">
      <span class="block text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Type d'action</span>
      <FormSelect
        bind:value={formType}
        className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
      >
        <option value="CHANNEL_RESET">Réinitialisation de salon (nuke)</option>
        <option value="SERVER_BACKUP">Sauvegarde complète du serveur</option>
        <option value="DATA_EXPORT">Exportation des données (Logs & Profils)</option>
      </FormSelect>
    </div>

    <!-- Salon Discord cible -->
    {#if formType !== 'SERVER_BACKUP'}
      <div class="space-y-2">
        <span class="block text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Salon de destination / cible</span>
        <SearchableSelect
          id="schedule-target-channel"
          bind:value={formTargetId}
          options={availableChannels.map(c => ({ id: c.id, name: `#${c.name}` }))}
          placeholder="Choisir un salon..."
          className="w-full"
        />
      </div>
    {/if}

    <!-- Fréquence -->
    <div class="space-y-2">
      <span class="block text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Fréquence d'exécution</span>
      <FormSelect
        value={formFrequency}
        onchange={(e) => handleFrequencyChange((e.target as HTMLSelectElement).value)}
        className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none"
      >
        {#each frequencies as freq}
          <option value={freq.key}>{freq.label}</option>
        {/each}
      </FormSelect>
    </div>

    <!-- Expression Cron -->
    {#if formFrequency === 'custom'}
      <div class="space-y-2">
        <span class="block text-[10px] font-bold text-on-surface-variant/60 ml-2 uppercase tracking-widest">Expression Cron</span>
        <input
          type="text"
          bind:value={formCron}
          placeholder="* * * * * (minute, heure, jour, mois, jour de la semaine)"
          class="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all text-on-surface focus:outline-none font-mono"
        />
        <p class="text-[10px] text-on-surface-variant/60 ml-2">Standard cron unix format. ex: `0 12 * * *` pour chaque midi.</p>
      </div>
    {/if}

    <!-- Footer Actions -->
    <div class="flex justify-end gap-3 pt-2">
      <ActionButton onClick={() => showCreateModal = false} variant="muted" label="Annuler" />
      <ActionButton onClick={handleSaveSchedule} variant="primary" label={isEditing ? "Enregistrer" : "Créer"} />
    </div>
    <InlineFeedback state={createAction} />
  </div>
</Modal>

<!-- Modal de suppression -->
<Modal bind:open={showDeleteModal} title="Supprimer la planification">
  <div class="space-y-4">
    <p class="text-sm font-medium">Êtes-vous sûr de vouloir supprimer la planification <strong class="text-on-surface">{selectedSchedule?.name}</strong> ?</p>
    <p class="text-xs text-error font-bold bg-error/10 border border-error/20 px-4 py-3 rounded-2xl flex items-center gap-2">
      <Papicon icon="alert-triangle" size={16} />
      Cette action est définitive.
    </p>
    <div class="flex justify-end gap-3 pt-2">
      <ActionButton onClick={() => showDeleteModal = false} variant="muted" label="Annuler" />
      <ActionButton onClick={handleDeleteSchedule} variant="danger" label="Supprimer" />
    </div>
    <InlineFeedback state={deleteAction} />
  </div>
</Modal>
