<script lang="ts">
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { refreshDashboardOnMount } from '../lib/dashboardLifecycle';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import ActionButton from '../lib/components/ActionButton.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import FormTextarea from '../lib/components/FormTextarea.svelte';
  import ReportRuleSelector from '../lib/components/sanctions/ReportRuleSelector.svelte';
  import SelectedRuleChips from '../lib/components/sanctions/SelectedRuleChips.svelte';
  import ColumnSortFilter, { type ColumnFilterOption } from '../lib/components/sanctions/ColumnSortFilter.svelte';
  import { createSanctionReport, deleteSanction } from '../lib/api';
  import {
    buildBrokenRulesPayload,
    buildReportRuleOptions,
    getRuleIdsFromBrokenRules,
    getRulesFromBrokenRules,
  } from '../lib/sanctions/reportRules';
  import { durationLabel, statusLabel, toDateTimeLocal, typeLabel } from '../lib/sanctions/formatters';
  import { filterAndSortSanctions, type SanctionFilters, type SortField, type SortOption } from '../lib/sanctions/filterSort';

  refreshDashboardOnMount();

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
  let evidenceLinksRaw = $state('');
  let additionalNotes = $state('');

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
        icon: '📄',
        disabled: false,
        variant: 'success',
        hint: 'Le rapport de sanction existe déjà et peut être consulté.',
      };
    }

    if (canCreate) {
      return {
        label: 'Creer le rapport',
        icon: '📋',
        disabled: false,
        variant: 'primary',
        hint: 'Ouvre le formulaire pour compléter le rapport lié à cette sanction.',
      };
    }

    return {
      label: 'Rapport reserve',
      icon: '🔒',
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
    evidenceLinksRaw = '';
    additionalNotes = sanction.reason ? `Raison initiale de la sanction: ${sanction.reason}` : '';
    reportMessage = '';
    reportMessageIsError = false;
  }

  function openReportModal(sanction: { id: string; createdAt: string; reason: string; durationSeconds: number | null }) {
    prepareDraftFromSanction(sanction);
    const linkedReport = sanctionReports.find((entry) => entry.sanctionId === sanction.id);
    modalMode = linkedReport ? 'view' : 'create';
    modalOpen = true;
  }

  function closeModal() {
    modalOpen = false;
    reportMessage = '';
    reportMessageIsError = false;
  }

  function sanitizeLinks(raw: string): string[] {
    return raw
      .split(/\n|,/g)
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

    const evidenceLinks = sanitizeLinks(evidenceLinksRaw);
    if (evidenceLinks.length === 0) {
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
        evidenceLinks,
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

<div class="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 font-inter">
  <div>
    <h2 class="text-3xl font-extrabold text-primary tracking-tight font-headline">Sanctions & Rapports</h2>
    <p class="text-on-surface-variant mt-1 leading-relaxed">Suivi des sanctions, de leur auteur, de la cible et gestion des rapports via modal.</p>
  </div>
  <RefreshButton
    onClick={() => dashboardStore.refresh()}
    loading={dashboardStore.state.loading}
    label="Actualiser"
    className="px-5 py-2.5 font-bold shadow-lg shadow-primary/10"
    iconClass="text-lg"
  />
</div>

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
  <div class="px-6 pt-4">
    <label class="relative block w-full md:max-w-xl">
      <span class="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
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
              <td class="px-4 py-4 text-xs">{entry.targetTag}</td>
              <td class="px-4 py-4 text-xs">{entry.moderatorTag}</td>
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
                      icon="🗑️"
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

{#if modalOpen && selectedSanction}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="modal-backdrop" role="dialog" aria-modal="true" tabindex="-1" onclick={closeModal}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-panel modal-panel-lg space-y-5 font-inter" onclick={(e) => e.stopPropagation()}>
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-[10px] font-black uppercase tracking-[0.25em] text-on-surface-variant">Sanction selectionnee</p>
          <h3 class="text-xl font-black text-on-surface mt-1">{typeLabel(selectedSanction.type)} - {selectedSanction.targetTag}</h3>
          <p class="text-xs text-on-surface-variant mt-1">Par {selectedSanction.moderatorTag} le {new Date(selectedSanction.createdAt).toLocaleString('fr-FR')}</p>
        </div>
        <ActionButton onClick={closeModal} size="sm" variant="neutral" label="Fermer" />
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div class="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-3">
          <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Type</p>
          <p class="mt-1 font-semibold">{typeLabel(selectedSanction.type)}</p>
        </div>
        <div class="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-3">
          <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Membre</p>
          <p class="mt-1 font-semibold">{selectedSanction.targetTag} ({selectedSanction.targetUserId})</p>
        </div>
      </div>

      {#if modalMode === 'view' && selectedReport}
        <div class="space-y-4">
          <div class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200">
            Mode lecture seule. Le rapport reprend le même formulaire que la création pour garder la cohérence visuelle.
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label for="report-incident-at-view" class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Date et heure de l'incident</label>
              <FormInput id="report-incident-at-view" type="datetime-local" value={toDateTimeLocal(selectedReport.incidentAt)} disabled className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border-none text-sm disabled:opacity-100 disabled:text-slate-500" />
            </div>
            <div>
              <label for="report-duration-view" class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Durée</label>
              <FormInput id="report-duration-view" type="text" value={selectedReport.sanctionDurationLabel || ''} disabled className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border-none text-sm disabled:opacity-100 disabled:text-slate-500" />
            </div>
            <div>
              <label for="report-rules-view" class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Regle(s) enfreinte(s)</label>
              <ReportRuleSelector
                id="report-rules-view"
                options={reportRuleOptions}
                selectedIds={selectedReportRuleIds}
                disabled={true}
                placeholder="Aucune regle selectionnee"
              />
            </div>
          </div>

            <SelectedRuleChips selectedRules={selectedReportRules} />

          <div>
            <label for="report-reason-view" class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Raison detaillee</label>
            <FormTextarea id="report-reason-view" value={selectedReport.detailedReason} rows={3} disabled className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border-none text-sm disabled:opacity-100 disabled:text-slate-500" />
          </div>

          <div>
            <label for="report-evidence-view" class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Lien(s) de preuves</label>
            <FormTextarea id="report-evidence-view" value={selectedReport.evidenceLinks.join('\n')} rows={3} disabled className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border-none text-sm disabled:opacity-100 disabled:text-slate-500" />
          </div>

          <div>
            <label for="report-notes-view" class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Notes supplementaires</label>
            <FormTextarea id="report-notes-view" value={selectedReport.additionalNotes || ''} rows={2} disabled className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border-none text-sm disabled:opacity-100 disabled:text-slate-500" placeholder="Aucune note supplementaire" />
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div class="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-3">
              <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Cree par</p>
              <p class="mt-1 font-semibold">{selectedReport.createdByTag || selectedReport.createdByUserId}</p>
            </div>
            <div class="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-3">
              <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Duree</p>
              <p class="mt-1 font-semibold">{selectedReport.sanctionDurationLabel || 'N/A'}</p>
            </div>
          </div>
        </div>
      {:else}
        <div class="space-y-4">
          {#if !canCreateSelectedReport}
            <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
              Seule la personne qui a applique la sanction peut creer ce rapport.
            </div>
          {/if}

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label for="report-incident-at" class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Date et heure de l'incident</label>
              <FormInput id="report-incident-at" type="datetime-local" bind:value={incidentAt} className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border-none text-sm" />
            </div>
            <div>
              <label for="report-duration" class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Durée</label>
              <FormInput id="report-duration" type="text" bind:value={sanctionDurationLabel} className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border-none text-sm" placeholder="Ex: 2h, 1j 4h, 30m" />
            </div>
            <div>
              <label for="report-rules" class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Regle(s) enfreinte(s)</label>
              <ReportRuleSelector
                id="report-rules"
                options={reportRuleOptions}
                selectedIds={selectedRuleIds}
                placeholder="Selectionner une ou plusieurs regles"
                onToggle={toggleRuleSelection}
              />
            </div>
          </div>

          <SelectedRuleChips selectedRules={selectedDraftRules} />

          <div>
            <label for="report-reason" class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Raison detaillee</label>
            <FormTextarea id="report-reason" bind:value={detailedReason} rows={3} className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border-none text-sm" placeholder="Explique ce qu'a fait le membre" />
          </div>

          <div>
            <label for="report-evidence" class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Lien(s) de preuves (obligatoire)</label>
            <FormTextarea id="report-evidence" bind:value={evidenceLinksRaw} rows={3} className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border-none text-sm" placeholder="Un lien par ligne" />
          </div>

          <div>
            <label for="report-notes" class="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Notes supplementaires</label>
            <FormTextarea id="report-notes" bind:value={additionalNotes} rows={2} className="mt-1 w-full rounded-xl px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border-none text-sm" placeholder="Contexte, antecedents..." />
          </div>

          {#if reportMessage}
            <p class="text-sm font-semibold {reportMessageIsError ? 'text-red-600' : 'text-emerald-600'}">{reportMessage}</p>
          {/if}

          <ActionButton
            onClick={submitReport}
            disabled={creatingReport || !canCreateSelectedReport}
            variant="primary"
            size="lg"
            fullWidth={true}
            label={creatingReport ? 'Creation en cours...' : 'Creer le rapport de sanction'}
          />
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if deleteModalOpen && pendingDeletion}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-sanction-title" tabindex="-1" onclick={closeDeleteModal}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-panel max-w-lg space-y-4 font-inter" onclick={(e) => e.stopPropagation()}>
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
