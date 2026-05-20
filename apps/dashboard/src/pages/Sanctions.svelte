<script lang="ts">
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { portal } from '../lib/actions/portal';
  import { authStore } from '../lib/stores/auth.svelte';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import ActionButton from '../lib/components/ActionButton.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import FormTextarea from '../lib/components/FormTextarea.svelte';
  import ReportRuleSelector from '../lib/components/sanctions/ReportRuleSelector.svelte';
  import SelectedRuleChips from '../lib/components/sanctions/SelectedRuleChips.svelte';
  import ColumnSortFilter, { type ColumnFilterOption } from '../lib/components/sanctions/ColumnSortFilter.svelte';
  import { 
    createSanctionReport, 
    deleteSanction, 
    updateSanctionReport, 
    fetchMemberCase, 
    runMemberCaseAction,
    updateGlobalSettings,
    fetchFeatureConfigurations,
    updateFeatureConfiguration
  } from '../lib/api';
  import MemberCaseModal from '../lib/components/MemberCaseModal.svelte';
  import FormSelect from '../lib/components/FormSelect.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import RolePermissionSettings from '../lib/components/RolePermissionSettings.svelte';
  import { onMount } from 'svelte';
  import {
    buildBrokenRulesPayload,
    buildReportRuleOptions,
    getRuleIdsFromBrokenRules,
    getRulesFromBrokenRules,
  } from '../lib/sanctions/reportRules';
  import EvidenceInputList from '../lib/components/sanctions/EvidenceInputList.svelte';
  import { durationLabel, statusLabel, toDateTimeLocal, typeLabel } from '../lib/sanctions/formatters';
  import { filterAndSortSanctions, type SanctionFilters, type SortField, type SortOption } from '../lib/sanctions/filterSort';


  let activeTab = $state('sanctions');
  const saveAction = createAsyncActionState();

  let creatingReport = $state(false);
  let reportMessage = $state('');
  let reportMessageIsError = $state(false);
  let deletingSanctionId = $state<string | null>(null);
  let deletionMessage = $state('');
  let deletionMessageIsError = $state(false);
  let deleteModalOpen = $state(false);
  let pendingDeletion = $state<{ id: string; type: string; targetTag: string } | null>(null);
  let deleteConfirmationText = $state('');

  let modalOpen = $state(false);
  let modalMode = $state<'create' | 'view'>('create');
  let searchQuery = $state('');

  // Filter and sort state
  let filters = $state<SanctionFilters>({
    statuses: [],
    types: [],
    moderators: [],
    targets: [],
  });

  let sortOptions = $state<SortOption[]>([
    { field: 'date', direction: 'desc' },
  ]);

  let selectedSanctionId = $state('');
  let incidentAt = $state(new Date().toISOString().slice(0, 16));
  let sanctionDurationLabel = $state('');
  let brokenRules = $state('');
  let selectedRuleIds = $state<string[]>([]);
  let detailedReason = $state('');
  let evidenceLinks = $state<string[]>(['']);
  let additionalNotes = $state('');

  let isEditing = $state(false);
  let updateReportBusy = $state(false);

  // Member Case Modal State
  let caseModalOpen = $state(false);
  let selectedCaseUser = $state<{ name: string; id: string | null } | null>(null);
  let selectedCaseData = $state<any>(null);
  let selectedCaseLoading = $state(false);
  let selectedCaseError = $state('');
  let memberActionReason = $state('Action lancée depuis la page Sanctions.');
  let memberActionDuration = $state('30m');
  let memberActionBusy = $state(false);
  let memberActionFeedback = $state('');
  let memberActionIsError = $state(false);

  async function loadMemberCase(userId: string) {
    selectedCaseLoading = true;
    selectedCaseError = '';
    try {
      selectedCaseData = await fetchMemberCase(userId);
    } catch (error) {
      selectedCaseError = error instanceof Error ? error.message : 'Impossible de charger le profil membre.';
      selectedCaseData = null;
    } finally {
      selectedCaseLoading = false;
    }
  }

  function openCaseModal(userId: string, userName: string) {
    selectedCaseUser = { name: userName, id: userId };
    selectedCaseData = null;
    selectedCaseError = '';
    memberActionReason = 'Action lancée depuis la page Sanctions.';
    memberActionDuration = '30m';
    memberActionFeedback = '';
    memberActionIsError = false;
    caseModalOpen = true;

    if (userId) {
      void loadMemberCase(userId);
    }
  }

  const canManageSettings = $derived(
    !!dashboardStore.state.featureAccess?.settings?.canConfigure
      || !!dashboardStore.state.access?.canManageSettings
  );

  let guildSettings = $state({
    moderatorRoleId: '',
    propagateSanctions: false
  });

  let featureConfig = $state<any>(null);
  let loadingConfig = $state(false);

  onMount(async () => {
    loadingConfig = true;
    try {
      const configs = await fetchFeatureConfigurations();
      featureConfig = configs?.features?.find((c: any) => c.featureKey === 'sanctions') || null;
    } catch (err) {
      console.error('Error fetching sanctions config:', err);
    } finally {
      loadingConfig = false;
    }
  });

  $effect(() => {
    if (dashboardStore.state.moderatorRoleId !== undefined) {
      guildSettings.moderatorRoleId = dashboardStore.state.moderatorRoleId || '';
      guildSettings.propagateSanctions = (dashboardStore.state as any).propagateSanctions || false;
    }
  });

  async function toggleConfig(key: string, value: boolean) {
    if (!featureConfig) return;
    
    await saveAction.run(async () => {
      const ok = await updateFeatureConfiguration('sanctions', { [key]: value });
      if (!ok) throw new Error('Erreur API');
      featureConfig[key] = value;
      return true;
    }, { successMessage: 'Configuration mise à jour.' });
  }

  async function handleSaveSettings() {
    await saveAction.run(async () => {
      const ok = await updateGlobalSettings({
        moderatorRoleId: guildSettings.moderatorRoleId,
        propagateSanctions: guildSettings.propagateSanctions
      });
      if (!ok) throw new Error('Erreur API');
      
      if (featureConfig) {
         // Sync with feature config if necessary
      }

      await dashboardStore.refresh();
      return true;
    }, { successMessage: 'Paramètres enregistrés.' });
  }

  const availableRoles = $derived(dashboardStore.state.discordRoles || []);

  function closeCaseModal() {
    caseModalOpen = false;
    selectedCaseUser = null;
    selectedCaseData = null;
    selectedCaseError = '';
  }

  async function executeMemberAction(action: 'WARN' | 'KICK' | 'TIMEOUT' | 'BAN') {
    if (!selectedCaseUser?.id) return;

    memberActionBusy = true;
    memberActionFeedback = '';
    memberActionIsError = false;

    try {
      // Note: simple duration parsing can be improved, but matches existing patterns
      const durationMs = action === 'TIMEOUT' ? 30 * 60 * 1000 : null; // 30m default for simplicity here
      
      await runMemberCaseAction(selectedCaseUser.id, action, { 
        reason: memberActionReason.trim() || 'Action lancée depuis Sanctions.',
        durationMs: durationMs ?? undefined 
      });
      memberActionFeedback = 'Action appliquée avec succès.';
      await loadMemberCase(selectedCaseUser.id);
    } catch (error) {
      memberActionIsError = true;
      memberActionFeedback = error instanceof Error ? error.message : 'L’action de modération a échoué.';
    } finally {
      memberActionBusy = false;
    }
  }

  function toggleRuleSelection(ruleId: string, checked: boolean) {
    if (checked) {
      selectedRuleIds = [...new Set([...selectedRuleIds, ruleId])];
      return;
    }
    selectedRuleIds = selectedRuleIds.filter((entry) => entry !== ruleId);
  }

  // Filter and sort helper functions
  function toggleFilter(filterType: keyof SanctionFilters, value: string) {
    const filterList = filters[filterType];
    if (filterList.includes(value)) {
      filters[filterType] = filterList.filter((v) => v !== value);
    } else {
      filters[filterType] = [...filterList, value];
    }
  }

  function toggleSort(field: SortField) {
    const existingIndex = sortOptions.findIndex((opt) => opt.field === field);

    if (existingIndex >= 0) {
      // Toggle direction if already sorting by this field
      const option = sortOptions[existingIndex];
      const newDirection = option.direction === 'asc' ? 'desc' : 'asc';
      sortOptions[existingIndex] = { field: option.field, direction: newDirection };
    } else {
      // Add new sort if not already sorting
      sortOptions = [...sortOptions, { field, direction: 'asc' }];
    }
  }

  function sortDirectionFor(field: SortField) {
    return sortOptions.find((entry) => entry.field === field)?.direction ?? null;
  }

  function resetFiltersAndSort() {
    filters = {
      statuses: [],
      types: [],
      moderators: [],
      targets: [],
    };
    sortOptions = [{ field: 'date', direction: 'desc' }];
  }


  const regulationRules = $derived(dashboardStore.state.regulationRules || []);
  const reportRuleOptions = $derived(buildReportRuleOptions(regulationRules));
  const sanctions = $derived(dashboardStore.state.sanctions || []);
  const sanctionReports = $derived(dashboardStore.state.sanctionReports || []);
  const showSanctionsSkeleton = $derived(dashboardStore.state.loading && sanctions.length === 0);

  // Get unique values for filter options
  const uniqueStatuses = $derived([...new Set(sanctions.map((s) => s.status))].sort());
  const uniqueTypes = $derived([...new Set(sanctions.map((s) => s.type))].sort());
  const uniqueModerators = $derived(
    [...new Set(sanctions.map((s) => s.moderatorUserId))].sort((a, b) => {
      const tagA = sanctions.find((s) => s.moderatorUserId === a)?.moderatorTag || a;
      const tagB = sanctions.find((s) => s.moderatorUserId === b)?.moderatorTag || b;
      return tagA.localeCompare(tagB);
    })
  );
  const uniqueTargets = $derived(
    [...new Set(sanctions.map((s) => s.targetUserId))].sort((a, b) => {
      const tagA = sanctions.find((s) => s.targetUserId === a)?.targetTag || a;
      const tagB = sanctions.find((s) => s.targetUserId === b)?.targetTag || b;
      return tagA.localeCompare(tagB);
    })
  );

  const hasActiveFiltersOrSort = $derived(
    searchQuery.trim().length > 0 ||
    filters.statuses.length > 0 ||
      filters.types.length > 0 ||
      filters.moderators.length > 0 ||
      filters.targets.length > 0 ||
      sortOptions.length > 1 ||
      (sortOptions.length === 1 && (sortOptions[0].field !== 'date' || sortOptions[0].direction !== 'desc'))
  );

  const statusFilterOptions = $derived<ColumnFilterOption[]>(
    uniqueStatuses.map((status) => ({ value: status, label: statusLabel(status) }))
  );
  const typeFilterOptions = $derived<ColumnFilterOption[]>(
    uniqueTypes.map((type) => ({ value: type, label: typeLabel(type) }))
  );
  const moderatorFilterOptions = $derived<ColumnFilterOption[]>(
    uniqueModerators.map((moderatorId) => ({
      value: moderatorId,
      label: sanctions.find((entry) => entry.moderatorUserId === moderatorId)?.moderatorTag || moderatorId,
    }))
  );
  const targetFilterOptions = $derived<ColumnFilterOption[]>(
    uniqueTargets.map((targetId) => ({
      value: targetId,
      label: sanctions.find((entry) => entry.targetUserId === targetId)?.targetTag || targetId,
    }))
  );

  const searchedSanctions = $derived.by(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return sanctions;

    return sanctions.filter((entry) => {
      return [
        entry.type,
        entry.targetTag,
        entry.moderatorTag,
        entry.reason,
        statusLabel(entry.status),
      ]
        .map((value) => (value || '').toLowerCase())
        .some((value) => value.includes(query));
    });
  });

  // Apply filters and sorting
  const filteredAndSortedSanctions = $derived(filterAndSortSanctions(searchedSanctions, filters, sortOptions));

  const selectedSanction = $derived(sanctions.find((entry) => entry.id === selectedSanctionId) || null);
  const selectedReport = $derived(sanctionReports.find((entry) => entry.sanctionId === selectedSanctionId) || null);
  const selectedReportRuleIds = $derived(selectedReport ? getRuleIdsFromBrokenRules(selectedReport.brokenRules) : []);
  const selectedReportRules = $derived(selectedReport ? getRulesFromBrokenRules(selectedReport.brokenRules, reportRuleOptions) : []);
  const selectedDraftRules = $derived(
    selectedRuleIds
      .map((ruleId) => reportRuleOptions.find((rule) => rule.id === ruleId))
      .filter((rule): rule is (typeof reportRuleOptions)[number] => Boolean(rule))
  );
  const canDeleteSanctions = $derived(dashboardStore.state.access?.level === 'admin');
  const canCreateSelectedReport = $derived(
    Boolean(selectedSanction && !selectedReport && selectedSanction.moderatorUserId === authStore.user?.id && reportRuleOptions.length > 0)
  );
  const canEditSelectedReport = $derived(
    Boolean(selectedReport && (selectedReport.createdByUserId === authStore.user?.id || authStore.isAdmin))
  );

  type SanctionListItem = {
    id: string;
    moderatorUserId: string;
  };

  type SanctionReportListItem = {
    sanctionId: string | null;
  };

  type ReportActionState = {
    label: string;
    icon: string;
    disabled: boolean;
    variant: 'primary' | 'success' | 'muted';
    hint: string;
  };

  function getReportActionState(entry: SanctionListItem, linkedReport: SanctionReportListItem | undefined): ReportActionState {
    const canCreate = entry.moderatorUserId === authStore.user?.id;

    if (linkedReport) {
      return {
        label: 'Voir le rapport',
        icon: 'paper',
        disabled: false,
        variant: 'success',
        hint: 'Le rapport de sanction existe déjà et peut être consulté.',
      };
    }

    if (canCreate) {
      return {
        label: 'Creer le rapport',
        icon: 'plus',
        disabled: false,
        variant: 'primary',
        hint: 'Ouvre le formulaire pour compléter le rapport lié à cette sanction.',
      };
    }

    return {
      label: 'Rapport reserve',
      icon: 'lock',
      disabled: true,
      variant: 'muted',
      hint: 'Seule la personne qui a appliqué la sanction peut créer ce rapport.',
    };
  }


  function prepareDraftFromSanction(sanction: { id: string; createdAt: string; reason: string; durationSeconds: number | null }) {
    selectedSanctionId = sanction.id;
    incidentAt = toDateTimeLocal(sanction.createdAt);
    sanctionDurationLabel = durationLabel(sanction.durationSeconds);
    brokenRules = '';
    selectedRuleIds = [];
    detailedReason = sanction.reason;
    evidenceLinks = [''];
    additionalNotes = sanction.reason ? `Raison initiale de la sanction: ${sanction.reason}` : '';
    reportMessage = '';
    reportMessageIsError = false;
    isEditing = false;
  }

  function startEditing() {
    if (!selectedReport) return;
    
    incidentAt = toDateTimeLocal(selectedReport.incidentAt);
    sanctionDurationLabel = selectedReport.sanctionDurationLabel || '';
    selectedRuleIds = getRuleIdsFromBrokenRules(selectedReport.brokenRules);
    detailedReason = selectedReport.detailedReason;
    evidenceLinks = selectedReport.evidenceLinks.length > 0 ? [...selectedReport.evidenceLinks] : [''];
    additionalNotes = selectedReport.additionalNotes || '';
    isEditing = true;
  }

  function openReportModal(sanction: { id: string; createdAt: string; reason: string; durationSeconds: number | null }) {
    prepareDraftFromSanction(sanction);
    const linkedReport = sanctionReports.find((entry) => entry.sanctionId === sanction.id);
    modalMode = linkedReport ? 'view' : 'create';
    modalOpen = true;
  }

  function closeModal() {
    modalOpen = false;
    isEditing = false;
    reportMessage = '';
    reportMessageIsError = false;
  }

  function sanitizeLinks(linksArr: string[]): string[] {
    return linksArr
      .map((value) => value.trim())
      .filter((value) => /^https?:\/\//i.test(value));
  }

  async function submitReport() {
    reportMessage = '';
    reportMessageIsError = false;

    if (!selectedSanction) {
      reportMessage = 'Selectionne une sanction avant de creer un rapport.';
      reportMessageIsError = true;
      return;
    }

    if (selectedReport) {
      reportMessage = 'Un rapport existe deja pour cette sanction.';
      reportMessageIsError = true;
      return;
    }

    if (reportRuleOptions.length === 0) {
      reportMessage = 'Aucun article de règlement n’est configuré. Ajoute d’abord des règles dans le module Règlement.';
      reportMessageIsError = true;
      return;
    }

    if (selectedRuleIds.length === 0) {
      reportMessage = 'Sélectionne au moins une règle enfreinte.';
      reportMessageIsError = true;
      return;
    }

    if (selectedSanction.moderatorUserId !== authStore.user?.id) {
      reportMessage = 'Seule la personne qui a applique la sanction peut creer ce rapport.';
      reportMessageIsError = true;
      return;
    }

    if (!sanctionDurationLabel.trim()) {
      reportMessage = 'Renseigne la durée de la sanction.';
      reportMessageIsError = true;
      return;
    }

    const sanitizedLinks = sanitizeLinks(evidenceLinks);
    if (sanitizedLinks.length === 0) {
      reportMessage = 'Ajoute au moins un lien de preuve valide (http/https).';
      reportMessageIsError = true;
      return;
    }

    brokenRules = buildBrokenRulesPayload(selectedRuleIds, reportRuleOptions);

    if (!brokenRules.trim() || !detailedReason.trim()) {
      reportMessage = 'Merci de remplir tous les champs obligatoires du rapport.';
      reportMessageIsError = true;
      return;
    }

    creatingReport = true;
    try {
      const ok = await createSanctionReport({
        sanctionId: selectedSanction.id,
        incidentAt: new Date(incidentAt).toISOString(),
        sanctionDurationLabel: sanctionDurationLabel.trim(),
        brokenRules: brokenRules.trim(),
        detailedReason: detailedReason.trim(),
        evidenceLinks: sanitizedLinks,
        additionalNotes: additionalNotes || null,
      });

      if (!ok) {
        reportMessage = 'Impossible de creer le rapport de sanction.';
        reportMessageIsError = true;
        return;
      }

      await dashboardStore.refresh();
      modalMode = 'view';
      reportMessage = '';
      reportMessageIsError = false;
    } finally {
      creatingReport = false;
    }
  }

  async function handleUpdateReport() {
    if (!selectedReport) return;
    
    const sanitizedLinks = sanitizeLinks(evidenceLinks);
    if (sanitizedLinks.length === 0) {
      reportMessage = 'Ajoute au moins un lien de preuve valide (http/https).';
      reportMessageIsError = true;
      return;
    }

    if (selectedRuleIds.length === 0) {
      reportMessage = 'Sélectionne au moins une règle enfreinte.';
      reportMessageIsError = true;
      return;
    }

    updateReportBusy = true;
    reportMessage = '';
    reportMessageIsError = false;

    try {
      const ok = await updateSanctionReport(selectedReport.id, {
        incidentAt: new Date(incidentAt).toISOString(),
        sanctionDurationLabel: sanctionDurationLabel.trim(),
        brokenRules: buildBrokenRulesPayload(selectedRuleIds, reportRuleOptions),
        detailedReason: detailedReason.trim(),
        evidenceLinks: sanitizedLinks,
        additionalNotes: additionalNotes || null,
      });

      if (!ok) {
        reportMessage = 'Impossible de mettre à jour le rapport.';
        reportMessageIsError = true;
        return;
      }

      await dashboardStore.refresh();
      isEditing = false;
      reportMessage = 'Rapport mis à jour avec succès.';
      reportMessageIsError = false;
    } catch (e) {
      reportMessage = 'Une erreur est survenue lors de la mise à jour.';
      reportMessageIsError = true;
    } finally {
      updateReportBusy = false;
    }
  }

  function openDeleteModal(entry: { id: string; type: string; targetTag: string }) {
    deletionMessage = '';
    deletionMessageIsError = false;

    if (!canDeleteSanctions) {
      deletionMessage = 'Seuls les administrateurs peuvent supprimer une infraction.';
      deletionMessageIsError = true;
      return;
    }

    pendingDeletion = entry;
    deleteConfirmationText = '';
    deleteModalOpen = true;
  }

  function closeDeleteModal() {
    deleteModalOpen = false;
    pendingDeletion = null;
    deleteConfirmationText = '';
  }

  async function confirmDeleteSanction() {
    if (!pendingDeletion) return;

    if (deleteConfirmationText.trim().toUpperCase() !== 'SUPPRIMER') {
      deletionMessage = 'Suppression annulee: validation finale non confirmee.';
      deletionMessageIsError = true;
      return;
    }

    const sanctionToDelete = pendingDeletion;
    deletingSanctionId = sanctionToDelete.id;
    closeDeleteModal();
    try {
      const ok = await deleteSanction(sanctionToDelete.id);
      if (!ok) {
        deletionMessage = 'Impossible de supprimer l\'infraction.';
        deletionMessageIsError = true;
        return;
      }

      if (selectedSanctionId === sanctionToDelete.id) {
        closeModal();
      }

      await dashboardStore.refresh();
      deletionMessage = 'Infraction supprimee avec succes.';
      deletionMessageIsError = false;
    } finally {
      deletingSanctionId = null;
    }
  }
</script>

<ModulePage 
  title="Sanctions & Rapports" 
  description="Suivi des sanctions, de leur auteur, de la cible et gestion des rapports via modal." 
  icon="alert-triangle"
  featureKey="sanctions"
>
  {#snippet actions()}
    <div class="flex items-center gap-3">
      <RefreshButton
        onClick={() => dashboardStore.refresh()}
        loading={dashboardStore.state.loading}
        label="Actualiser"
        className="px-5 py-2.5 font-bold shadow-lg shadow-primary/10"
        iconClass="text-lg"
      />
    </div>
  {/snippet}

  <div class="space-y-8">
    <div class="flex border-b border-outline-variant/10">
      <button 
        onclick={() => activeTab = 'sanctions'}
        class="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative {activeTab === 'sanctions' ? 'text-primary' : 'text-on-surface-variant/40 hover:text-on-surface-variant'}"
      >
        Historique
        {#if activeTab === 'sanctions'}
          <div class="absolute bottom-0 left-0 w-full h-1 bg-primary rounded-t-full"></div>
        {/if}
      </button>
      {#if canManageSettings}
        <button 
          onclick={() => activeTab = 'settings'}
          class="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative {activeTab === 'settings' ? 'text-primary' : 'text-on-surface-variant/40 hover:text-on-surface-variant'}"
        >
          Configuration
          {#if activeTab === 'settings'}
            <div class="absolute bottom-0 left-0 w-full h-1 bg-primary rounded-t-full"></div>
          {/if}
        </button>
      {/if}
    </div>

    {#if activeTab === 'sanctions'}
      <section class="section-card-flush font-inter">
        <div class="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 class="text-lg font-black">Liste des sanctions</h3>
          <div class="flex items-center gap-3">
            <span class="text-xs font-bold text-on-surface-variant">{filteredAndSortedSanctions.length} / {sanctions.length} entree(s)</span>
            {#if hasActiveFiltersOrSort}
              <button
                onclick={resetFiltersAndSort}
                class="text-xs font-bold text-primary hover:text-primary/80 transition"
              >
                Réinitialiser filtres et tri
              </button>
            {/if}
          </div>
        </div>
        <div class="px-6 pb-4">
          <label class="relative block w-full md:max-w-xl">
            <Papicon icon="search" size={18} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <FormInput
              type="search"
              bind:value={searchQuery}
              placeholder="Rechercher par type, cible, staff, raison..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm text-on-surface outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
        </div>
        {#if deletionMessage}
          <div class="px-6 pt-4 text-sm font-semibold {deletionMessageIsError ? 'text-red-600' : 'text-emerald-600'}">{deletionMessage}</div>
        {/if}
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
        <tr class="bg-slate-50 dark:bg-white/5">
          <th class="px-4 py-4">
            <ColumnSortFilter
              label="Date"
              sortField="date"
              sortDirection={sortDirectionFor('date')}
              onToggleSort={() => toggleSort('date')}
            />
          </th>
          <th class="px-4 py-4">
            <ColumnSortFilter
              label="Type"
              sortField="type"
              sortDirection={sortDirectionFor('type')}
              onToggleSort={() => toggleSort('type')}
              options={typeFilterOptions}
              selectedValues={filters.types}
              onToggleValue={(value) => toggleFilter('types', value)}
            />
          </th>
          <th class="px-4 py-4">
            <ColumnSortFilter
              label="Cible"
              sortField="target"
              sortDirection={sortDirectionFor('target')}
              onToggleSort={() => toggleSort('target')}
              options={targetFilterOptions}
              selectedValues={filters.targets}
              onToggleValue={(value) => toggleFilter('targets', value)}
              searchable={true}
            />
          </th>
          <th class="px-4 py-4">
            <ColumnSortFilter
              label="Staff"
              sortField="moderator"
              sortDirection={sortDirectionFor('moderator')}
              onToggleSort={() => toggleSort('moderator')}
              options={moderatorFilterOptions}
              selectedValues={filters.moderators}
              onToggleValue={(value) => toggleFilter('moderators', value)}
              searchable={true}
            />
          </th>
          <th class="px-4 py-4">
            <ColumnSortFilter
              label="Duree"
              sortField="duration"
              sortDirection={sortDirectionFor('duration')}
              onToggleSort={() => toggleSort('duration')}
            />
          </th>
          <th class="px-4 py-4">
            <ColumnSortFilter
              label="Statut"
              sortField="status"
              sortDirection={sortDirectionFor('status')}
              onToggleSort={() => toggleSort('status')}
              options={statusFilterOptions}
              selectedValues={filters.statuses}
              onToggleValue={(value) => toggleFilter('statuses', value)}
            />
          </th>
          <th class="px-4 py-4 text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">Rapport</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-50 dark:divide-slate-800">
        {#if showSanctionsSkeleton}
          {#each Array(6) as _, index (index)}
            <tr class="animate-pulse">
              <td class="px-4 py-4"><div class="h-3.5 w-32 rounded-full bg-slate-200 dark:bg-slate-700"></div></td>
              <td class="px-4 py-4"><div class="h-3.5 w-28 rounded-full bg-slate-200 dark:bg-slate-700"></div></td>
              <td class="px-4 py-4"><div class="h-3.5 w-24 rounded-full bg-slate-200 dark:bg-slate-700"></div></td>
              <td class="px-4 py-4"><div class="h-3.5 w-24 rounded-full bg-slate-200 dark:bg-slate-700"></div></td>
              <td class="px-4 py-4"><div class="h-3.5 w-16 rounded-full bg-slate-200 dark:bg-slate-700"></div></td>
              <td class="px-4 py-4"><div class="h-5 w-20 rounded-full bg-slate-200 dark:bg-slate-700"></div></td>
              <td class="px-4 py-4"><div class="h-8 w-36 rounded-full bg-slate-200 dark:bg-slate-700"></div></td>
            </tr>
          {/each}
        {:else}
          {#each filteredAndSortedSanctions as entry}
            {@const linkedReport = sanctionReports.find((report) => report.sanctionId === entry.id)}
            {@const reportAction = getReportActionState(entry, linkedReport)}
            <tr class="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
              <td class="px-4 py-4 text-xs font-medium">{new Date(entry.createdAt).toLocaleString('fr-FR')}</td>
              <td class="px-4 py-4 text-xs font-bold text-primary">{typeLabel(entry.type)}</td>
              <td class="px-4 py-4 text-xs">
                <button 
                  onclick={() => openCaseModal(entry.targetUserId, entry.targetTag)}
                  class="hover:text-primary transition-colors font-bold text-left"
                >
                  @{entry.targetTag}
                </button>
              </td>
              <td class="px-4 py-4 text-xs">
                <button 
                  onclick={() => openCaseModal(entry.moderatorUserId, entry.moderatorTag)}
                  class="hover:text-primary transition-colors font-bold text-left"
                >
                  @{entry.moderatorTag}
                </button>
              </td>
              <td class="px-4 py-4 text-xs">{durationLabel(entry.durationSeconds)}</td>
              <td class="px-4 py-4 text-xs">
                <span class="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold {entry.status === 'ACTIVE' ? 'bg-amber-100 text-amber-700' : entry.status === 'RESOLVED' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}">
                  {statusLabel(entry.status)}
                </span>
              </td>
              <td class="px-4 py-4 text-xs">
                <div class="flex flex-wrap items-center gap-2">
                  <ActionButton
                    onClick={() => openReportModal(entry)}
                    disabled={reportAction.disabled}
                    title={reportAction.hint}
                    variant={reportAction.variant}
                    icon={reportAction.icon}
                    label={reportAction.label}
                    className="min-w-42.5"
                  />
                  {#if canDeleteSanctions}
                    <ActionButton
                      onClick={() => openDeleteModal(entry)}
                      disabled={deletingSanctionId === entry.id}
                      title="Supprimer cette infraction"
                      variant="danger"
                      icon="trash"
                      label={deletingSanctionId === entry.id ? 'Suppression...' : 'Supprimer'}
                      className="min-w-42.5"
                    />
                  {/if}
                </div>
                <p class="mt-2 text-[10px] font-semibold text-on-surface-variant">{reportAction.hint}</p>
              </td>
            </tr>
          {/each}
        {/if}
        {#if !showSanctionsSkeleton && sanctions.length === 0}
          <tr>
            <td colspan="7" class="px-6 py-14 text-center text-on-surface-variant">Aucune sanction enregistree.</td>
          </tr>
        {:else if !showSanctionsSkeleton && filteredAndSortedSanctions.length === 0}
          <tr>
            <td colspan="7" class="px-6 py-14 text-center text-on-surface-variant">
              Aucune sanction ne correspond aux filtres appliques.
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>
</section>
    {/if}
    
    {#if activeTab === 'settings'}
      <section class="space-y-8 animate-in fade-in duration-500">
        <div class="premium-card p-10 rounded-[3rem] space-y-8">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div class="space-y-4">
              <div>
                <p class="text-sm font-black text-on-surface">Rôle Modérateur</p>
                <p class="text-xs text-on-surface-variant/70 mt-1">Rôle requis pour utiliser les commandes de modération.</p>
              </div>
              <FormSelect
                bind:value={guildSettings.moderatorRoleId}
                className="w-full rounded-2xl bg-surface-container-high/40 border border-outline-variant/10 px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/30 transition-all"
              >
                <option value="">— Aucun rôle —</option>
                {#each availableRoles as r}
                  <option value={r.id}>@{r.name}</option>
                {/each}
              </FormSelect>
            </div>

            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-black text-on-surface">Propagation des sanctions</p>
                  <p class="text-xs text-on-surface-variant/70 mt-1">Appliquer automatiquement les sanctions sur les serveurs liés.</p>
                </div>
                <ToggleSwitch
                  checked={guildSettings.propagateSanctions}
                  onToggle={() => {
                    guildSettings.propagateSanctions = !guildSettings.propagateSanctions;
                    // Auto save for toggles is better UX
                    void handleSaveSettings();
                  }}
                  loading={saveAction.state.loading}
                />
              </div>
            </div>
          </div>

          {#if featureConfig}
          <div class="pt-8 border-t border-outline-variant/10">
            <RolePermissionSettings 
              featureKey="sanctions" 
              roleAccess={featureConfig.roleAccessByRole} 
            />
          </div>
          {/if}

          <div class="pt-6 border-t border-outline-variant/10 flex justify-end">
            <button
              onclick={handleSaveSettings}
              disabled={saveAction.state.loading}
              class="px-8 py-3 bg-primary text-on-primary rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
            >
              {saveAction.state.loading ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </button>
          </div>
          
          {#if saveAction.state.message}
            <p class="text-xs font-bold text-emerald-600 text-center">{saveAction.state.message}</p>
          {/if}
          {#if saveAction.state.error}
            <p class="text-xs font-bold text-red-600 text-center">{saveAction.state.error}</p>
          {/if}
        </div>
      </section>
    {/if}
  </div>

{#if modalOpen && selectedSanction}
  <div 
    use:portal
    class="modal-backdrop" 
    onclick={closeModal}
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && closeModal()}
    aria-label="Fermer le modal"
    role="button"
    tabindex="-1"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div 
      class="modal-panel modal-panel-lg space-y-0 p-0 font-inter overflow-hidden rounded-[2.5rem]" 
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Hero Header Style -->
      <div class="relative bg-linear-to-br from-primary/10 via-surface to-surface p-8 border-b border-outline-variant/5">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Dossier de Sanction</p>
            <h3 id="modal-title" class="text-2xl font-black text-on-surface mt-1">{typeLabel(selectedSanction.type)}</h3>
            <p class="text-xs font-bold text-on-surface-variant/60 mt-1">
              Appliquée à 
              <button onclick={() => openCaseModal(selectedSanction.targetUserId, selectedSanction.targetTag)} class="text-on-surface hover:text-primary transition-colors font-black">
                @{selectedSanction.targetTag}
              </button> 
              par 
              <button onclick={() => openCaseModal(selectedSanction.moderatorUserId, selectedSanction.moderatorTag)} class="text-on-surface hover:text-primary transition-colors font-black">
                @{selectedSanction.moderatorTag}
              </button>
            </p>
          </div>
          <button
            onclick={closeModal}
            class="flex h-10 w-10 items-center justify-center rounded-xl bg-on-surface/5 text-on-surface-variant hover:bg-on-surface/10 hover:text-on-surface transition-all"
          >
            <Papicon icon="x" size={20} />
          </button>
        </div>
      </div>

      <div class="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
        {#if modalMode === 'view' && selectedReport && !isEditing}
          <!-- View Mode -->
          <div class="space-y-8 animate-in fade-in duration-300">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-1.5">
                <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 px-1">Date de l'incident</p>
                <div class="rounded-2xl bg-surface-container-high/40 px-5 py-3 text-sm font-bold text-on-surface">
                  {new Date(selectedReport.incidentAt).toLocaleString('fr-FR')}
                </div>
              </div>
              <div class="space-y-1.5">
                <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 px-1">Durée annoncée</p>
                <div class="rounded-2xl bg-surface-container-high/40 px-5 py-3 text-sm font-bold text-on-surface">
                  {selectedReport.sanctionDurationLabel || 'N/A'}
                </div>
              </div>
            </div>

            <div class="space-y-3">
              <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 px-1">Règles enfreintes</p>
              <SelectedRuleChips selectedRules={selectedReportRules} />
            </div>

            <div class="space-y-3">
              <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 px-1">Raison détaillée</p>
              <div class="rounded-3xl bg-surface-container-high/30 p-6 text-sm text-on-surface-variant leading-relaxed italic border border-outline-variant/5">
                "{selectedReport.detailedReason}"
              </div>
            </div>

            {#if selectedReport.evidenceLinks && selectedReport.evidenceLinks.length > 0}
              <div class="space-y-3">
                <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 px-1">Preuves</p>
                <div class="flex flex-wrap gap-2">
                  {#each selectedReport.evidenceLinks as link}
                    <a href={link} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 rounded-xl bg-primary/5 px-4 py-2.5 text-[11px] font-black text-primary uppercase tracking-widest transition-all hover:bg-primary/10">
                      <Papicon icon="external-link" size={14} />
                      Lien de preuve
                    </a>
                  {/each}
                </div>
              </div>
            {/if}

            {#if selectedReport.additionalNotes}
              <div class="space-y-3">
                <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 px-1">Notes complémentaires</p>
                <p class="text-sm text-on-surface-variant/70 leading-relaxed bg-surface-container-low p-4 rounded-2xl border border-outline-variant/10">{selectedReport.additionalNotes}</p>
              </div>
            {/if}

            <div class="pt-6 flex flex-col items-center gap-4 border-t border-outline-variant/10">
              <p class="text-[10px] font-bold text-on-surface-variant/30 text-center">
                Rapport rédigé par 
                <button 
                  onclick={() => openCaseModal(selectedReport.createdByUserId, selectedReport.createdByTag || selectedReport.createdByUserId)}
                  class="hover:text-primary transition-colors font-bold"
                >
                  @{selectedReport.createdByTag || selectedReport.createdByUserId}
                </button>
              </p>
              
              {#if canEditSelectedReport}
                <button
                  onclick={startEditing}
                  class="inline-flex items-center gap-2 rounded-2xl bg-primary px-8 py-3 text-[11px] font-black text-on-primary uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-primary/20"
                >
                  <Papicon icon="edit-3" size={16} />
                  Modifier le rapport
                </button>
              {/if}
            </div>
          </div>
        {:else}
          <!-- Create / Edit Form -->
          <div class="space-y-8 animate-in fade-in duration-300">
            {#if !canCreateSelectedReport && !isEditing}
              <div class="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4 flex items-center gap-4">
                <Papicon icon="lock" class="text-amber-500" />
                <p class="text-xs font-bold text-amber-700">Seule la personne qui a appliqué la sanction peut créer ce rapport.</p>
              </div>
            {/if}

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-1.5">
                <label for="report-incident-at" class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 px-1">Date et heure de l'incident</label>
                <input id="report-incident-at" type="datetime-local" bind:value={incidentAt} class="w-full rounded-2xl bg-surface-container-high px-5 py-3 text-sm font-bold text-on-surface border border-outline-variant/10 focus:border-primary/50 outline-hidden transition-all" />
              </div>
              <div class="space-y-1.5">
                <label for="report-duration" class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 px-1">Durée appliquée</label>
                <input id="report-duration" type="text" bind:value={sanctionDurationLabel} placeholder="Ex: 2h, 1j, Permanent" class="w-full rounded-2xl bg-surface-container-high px-5 py-3 text-sm font-bold text-on-surface border border-outline-variant/10 focus:border-primary/50 outline-hidden transition-all" />
              </div>
            </div>

            <div class="space-y-3">
              <label for="report-rules" class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 px-1">Règles enfreintes</label>
              <ReportRuleSelector
                id="report-rules"
                options={reportRuleOptions}
                selectedIds={selectedRuleIds}
                placeholder="Sélectionner les articles du règlement..."
                onToggle={toggleRuleSelection}
              />
              <SelectedRuleChips selectedRules={isEditing ? selectedDraftRules : selectedDraftRules} />
            </div>

            <div class="space-y-1.5">
              <label for="report-reason" class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 px-1">Raison détaillée</label>
              <textarea id="report-reason" bind:value={detailedReason} rows={4} placeholder="Décrivez précisément les faits reprochés..." class="w-full rounded-3xl bg-surface-container-high px-5 py-4 text-sm font-bold text-on-surface border border-outline-variant/10 focus:border-primary/50 outline-hidden transition-all resize-none"></textarea>
            </div>

            <div class="space-y-3">
              <label class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 px-1">Preuves (URLs)</label>
              <EvidenceInputList bind:links={evidenceLinks} />
            </div>

            <div class="space-y-1.5">
              <label for="report-notes" class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 px-1">Notes contextuelles</label>
              <textarea id="report-notes" bind:value={additionalNotes} rows={2} placeholder="Contexte, antécédents, remarques..." class="w-full rounded-2xl bg-surface-container-high px-5 py-3 text-sm font-bold text-on-surface border border-outline-variant/10 focus:border-primary/50 outline-hidden transition-all resize-none"></textarea>
            </div>

            {#if reportMessage}
              <div class="rounded-xl p-4 text-xs font-black uppercase tracking-widest {reportMessageIsError ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}">
                {reportMessage}
              </div>
            {/if}

            <div class="flex gap-4 pt-4">
              {#if isEditing}
                <button
                  onclick={() => isEditing = false}
                  class="flex-1 py-4 rounded-2xl bg-on-surface/5 text-[11px] font-black uppercase tracking-widest text-on-surface-variant transition-all hover:bg-on-surface/10"
                >
                  Annuler
                </button>
                <button
                  onclick={handleUpdateReport}
                  disabled={updateReportBusy}
                  class="flex-[2] py-4 rounded-2xl bg-primary text-on-primary text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  {updateReportBusy ? 'Enregistrement...' : 'Mettre à jour le rapport'}
                </button>
              {:else}
                <button
                  onclick={submitReport}
                  disabled={creatingReport || !canCreateSelectedReport}
                  class="w-full py-4 rounded-2xl bg-primary text-on-primary text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  {creatingReport ? 'Création en cours...' : 'Finaliser et créer le rapport'}
                </button>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if deleteModalOpen && pendingDeletion}
  <div 
    use:portal
    class="modal-backdrop" 
    onclick={closeDeleteModal}
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && closeDeleteModal()}
    aria-label="Fermer le modal"
    role="button"
    tabindex="-1"
  >
    <div 
      class="modal-panel max-w-lg space-y-4 font-inter" 
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-sanction-title"
      tabindex="-1"
    >
      <div>
        <p class="text-[10px] font-black uppercase tracking-[0.25em] text-red-500">Action sensible</p>
        <h3 id="delete-sanction-title" class="mt-1 text-xl font-black text-on-surface">Confirmer la suppression</h3>
        <p class="mt-2 text-sm text-on-surface-variant">
          Tu es sur le point de supprimer l'infraction <span class="font-bold text-on-surface">{typeLabel(pendingDeletion.type)}</span>
          pour <span class="font-bold text-on-surface">{pendingDeletion.targetTag}</span>. Cette action est irreversible.
        </p>
      </div>

      <div>
        <label for="delete-confirmation" class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Tape SUPPRIMER pour valider</label>
        <FormInput
          id="delete-confirmation"
          type="text"
          bind:value={deleteConfirmationText}
          autocomplete="off"
          className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-red-400/40 focus:border-red-400 dark:focus:border-red-500 transition-all"
          placeholder="SUPPRIMER"
        />
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2">
        <ActionButton onClick={closeDeleteModal} variant="neutral" label="Annuler" />
        <ActionButton
          onClick={confirmDeleteSanction}
          variant="danger"
          label={deletingSanctionId ? 'Suppression...' : 'Supprimer definitivement'}
          disabled={Boolean(deletingSanctionId)}
        />
      </div>
    </div>
  </div>
{/if}
</ModulePage>