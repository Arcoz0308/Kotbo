<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import {
    deleteFeed,
    updateFeed,
    updateYouTubeSettings,
    updateModuleStatus,
    fetchDailyAlgoProblems,
    createDailyAlgoProblem,
    fetchTodayDailyAlgoSubmissions,
    fetchDailyAlgoSubmissionHistory,
    reviewDailyAlgoSubmission,
  } from '../lib/api';
  import { router } from 'tinro';
  import { getModuleMeta } from '../lib/moduleMeta';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import FormInput from '../lib/components/FormInput.svelte';
  import ToggleSwitch from '../lib/components/ToggleSwitch.svelte';
  import ColumnSortFilter, { type ColumnFilterOption } from '../lib/components/sanctions/ColumnSortFilter.svelte';
  import DailyAlgoMiniIDE from '../lib/components/DailyAlgoMiniIDE.svelte';
  import {
    detectIdeLanguageFromCode,
    normalizeIdeLanguage,
    type IdeLanguage,
  } from '../lib/dailyAlgoIde';

  let { moduleId } = $props();

  const module = $derived(dashboardStore.state.modules.find(m => m.id === moduleId) || { 
    name: 'Chargement...', 
    description: 'Veuillez patienter...', 
    status: 'inactive' 
  });
  const moduleMeta = $derived(getModuleMeta(moduleId));
  const canManageSettings = $derived(!!dashboardStore.state.access?.canManageSettings);
  const canModerateContent = $derived(!!dashboardStore.state.access?.canModerateContent);

  let youtubeReferenceChannelId = $state('');
  let desiredModuleStatus = $state('inactive');
  let deleteFeedModalOpen = $state(false);
  let createDailyAlgoProblemModalOpen = $state(false);
  let pendingFeedDeletion = $state<{ id: string; name: string } | null>(null);
  const formAction = createAsyncActionState();

  // Daily Algo state
  let dailyAlgoProblems = $state<any[]>([]);
  let dailyAlgoToday = $state<any | null>(null);
  let isFetchingAlgo = $state(false);
  let isFetchingAlgoSubmissions = $state(false);
  let isFetchingAlgoHistory = $state(false);
  let dailyAlgoHistory = $state<any[]>([]);
  let dailyAlgoSubmissionStatusFilter = $state<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  let ideFocusedSubmissionId = $state<string | null>(null);
  let ideModalOpen = $state(false);
  let integratedIdeEditorHeight = $state('62vh');
  let scoreDraftBySubmissionId = $state<Record<string, {
    correctness: number;
    comments: number;
    compactness: number;
    optimization: number;
    readability: number;
    feedback: string;
  }>>({});
  let algoDraft = $state({
    title: '',
    description: '',
    solution: '',
    difficulty: 'moyen',
    language: 'fr'
  });

  onMount(async () => {
    await dashboardStore.refresh();
    if (moduleId === 'youtube') {
      youtubeReferenceChannelId = dashboardStore.state.youtubeReferenceChannelId || '';
    } else if (moduleId === 'dailyalgo') {
      await Promise.all([loadDailyAlgoProblems(), loadTodayDailyAlgoSubmissions(), loadDailyAlgoHistory()]);
    }
  });

  async function loadDailyAlgoProblems() {
    isFetchingAlgo = true;
    try {
      dailyAlgoProblems = await fetchDailyAlgoProblems();
    } catch (err) {
      console.error(err);
      formAction.setError('Erreur lors du chargement des algorithmes.');
    } finally {
      isFetchingAlgo = false;
    }
  }

  async function loadTodayDailyAlgoSubmissions() {
    isFetchingAlgoSubmissions = true;
    try {
      dailyAlgoToday = await fetchTodayDailyAlgoSubmissions();
    } catch (err) {
      console.error(err);
      formAction.setError('Erreur lors du chargement des soumissions du jour.');
    } finally {
      isFetchingAlgoSubmissions = false;
    }
  }

  async function loadDailyAlgoHistory() {
    isFetchingAlgoHistory = true;
    try {
      const payload = await fetchDailyAlgoSubmissionHistory(7);
      dailyAlgoHistory = payload?.history ?? [];
    } catch (err) {
      console.error(err);
      formAction.setError('Erreur lors du chargement de l\'historique Daily Algo.');
    } finally {
      isFetchingAlgoHistory = false;
    }
  }

  function openDailyAlgoProblemModal() {
    if (!canManageSettings) {
      formAction.setError('Seuls les administrateurs peuvent ajouter un exercice.');
      return;
    }

    createDailyAlgoProblemModalOpen = true;
  }

  function closeDailyAlgoProblemModal() {
    createDailyAlgoProblemModalOpen = false;
  }

  async function submitDailyAlgoProblem() {
    if (!canManageSettings) {
      formAction.setError('Seuls les administrateurs peuvent ajouter un algo.');
      return;
    }

    if (!algoDraft.title.trim() || !algoDraft.description.trim() || !algoDraft.solution.trim()) {
      formAction.setError('Tous les champs requis doivent être remplis.');
      return;
    }

    await formAction.run(
      async () => {
        const ok = await createDailyAlgoProblem({ ...algoDraft });
        if (!ok) return false;

        algoDraft = { title: '', description: '', solution: '', difficulty: 'moyen', language: 'fr' };
        createDailyAlgoProblemModalOpen = false;
        await loadDailyAlgoProblems();
        return true;
      },
      {
        successMessage: 'Exercice algorithmique ajouté avec succès.',
        failureMessage: 'Erreur lors de l’ajout de l’exercice.'
      }
    );
  }

  function getDefaultScoreDraft() {
    return {
      correctness: 5,
      comments: 5,
      compactness: 5,
      optimization: 5,
      readability: 5,
      feedback: '',
    };
  }

  function buildDraftFromSubmission(submission: any) {
    const hasPersistedScores = [
      submission?.scoreCorrectness,
      submission?.scoreComments,
      submission?.scoreCompactness,
      submission?.scoreOptimization,
      submission?.scoreReadability,
    ].every((value) => Number.isFinite(Number(value)));

    const fallback = getDefaultScoreDraft();
    return {
      correctness: hasPersistedScores ? Number(submission.scoreCorrectness) : fallback.correctness,
      comments: hasPersistedScores ? Number(submission.scoreComments) : fallback.comments,
      compactness: hasPersistedScores ? Number(submission.scoreCompactness) : fallback.compactness,
      optimization: hasPersistedScores ? Number(submission.scoreOptimization) : fallback.optimization,
      readability: hasPersistedScores ? Number(submission.scoreReadability) : fallback.readability,
      feedback: submission?.reviewFeedback && submission.reviewFeedback !== 'Rien à redire.'
        ? submission.reviewFeedback
        : '',
    };
  }

  function ensureSubmissionDraft(submission: any) {
    if (scoreDraftBySubmissionId[submission.id]) return;
    scoreDraftBySubmissionId = {
      ...scoreDraftBySubmissionId,
      [submission.id]: buildDraftFromSubmission(submission),
    };
  }

  function ideLanguageForSubmission(submission: any): IdeLanguage {
    if (typeof submission?.language === 'string' && submission.language.trim()) {
      return normalizeIdeLanguage(submission.language);
    }
    return detectIdeLanguageFromCode(submission?.solution ?? '');
  }

  function openSubmissionInIntegratedIde(submission: any) {
    ensureSubmissionDraft(submission);
    ideFocusedSubmissionId = submission.id;
    ideModalOpen = true;
    computeIntegratedIdeEditorHeight();
  }

  function closeIntegratedIde() {
    ideModalOpen = false;
    ideFocusedSubmissionId = null;
  }

  function computeIntegratedIdeEditorHeight() {
    if (typeof window === 'undefined') return;
    const ratio = window.innerWidth >= 1360 ? 0.4 : window.innerWidth >= 960 ? 0.38 : 0.34;
    const available = Math.floor(window.innerHeight * ratio);
    const bounded = Math.max(260, Math.min(430, available));
    integratedIdeEditorHeight = `${bounded}px`;
  }

  function updateSubmissionScore(
    submissionId: string,
    field: 'correctness' | 'comments' | 'compactness' | 'optimization' | 'readability',
    value: number,
  ) {
    const score = Number.isFinite(value) ? Math.max(1, Math.min(5, Math.trunc(value))) : 1;
    scoreDraftBySubmissionId = {
      ...scoreDraftBySubmissionId,
      [submissionId]: {
        ...(scoreDraftBySubmissionId[submissionId] ?? getDefaultScoreDraft()),
        [field]: score,
      },
    };
  }

  function updateSubmissionFeedback(submissionId: string, value: string) {
    scoreDraftBySubmissionId = {
      ...scoreDraftBySubmissionId,
      [submissionId]: {
        ...(scoreDraftBySubmissionId[submissionId] ?? getDefaultScoreDraft()),
        feedback: value,
      },
    };
  }

  function reviewAverage(submissionId: string) {
    const draft = scoreDraftBySubmissionId[submissionId] ?? getDefaultScoreDraft();
    const total = draft.correctness + draft.comments + draft.compactness + draft.optimization + draft.readability;
    return (total / 5).toFixed(1);
  }

  async function rejectSubmission(submissionId: string) {
    if (!canModerateContent) {
      formAction.setError('Vous n\'avez pas les droits pour modérer les soumissions Daily Algo.');
      return;
    }

    await formAction.run(
      async () => {
        const ok = await reviewDailyAlgoSubmission(submissionId, { action: 'reject' });
        if (!ok) return false;
        closeIntegratedIde();
        await Promise.all([loadTodayDailyAlgoSubmissions(), loadDailyAlgoHistory(), dashboardStore.refresh()]);
        return true;
      },
      {
        successMessage: 'Soumission rejetée.',
        failureMessage: 'Impossible de rejeter cette soumission.'
      }
    );
  }

  async function approveSubmission(submissionId: string) {
    if (!canModerateContent) {
      formAction.setError('Vous n\'avez pas les droits pour modérer les soumissions Daily Algo.');
      return;
    }

    const draft = scoreDraftBySubmissionId[submissionId] ?? getDefaultScoreDraft();
    const feedback = draft.feedback?.trim() ?? '';
    const hasLowScore = [draft.correctness, draft.comments, draft.compactness, draft.optimization, draft.readability].some((score) => score < 5);

    if (hasLowScore && !feedback) {
      formAction.setError('Une explication est obligatoire si une note est inférieure à 5/5.');
      return;
    }

    const currentSubmission = (dailyAlgoToday?.submissions ?? []).find((submission) => submission.id === submissionId);
    const isEdition = currentSubmission?.status !== 'PENDING';

    await formAction.run(
      async () => {
        const ok = await reviewDailyAlgoSubmission(submissionId, {
          action: 'approve',
          scores: {
            correctness: draft.correctness,
            comments: draft.comments,
            compactness: draft.compactness,
            optimization: draft.optimization,
            readability: draft.readability,
          },
          feedback: feedback || undefined,
        });
        if (!ok) return false;

        closeIntegratedIde();
        await Promise.all([loadTodayDailyAlgoSubmissions(), loadDailyAlgoHistory(), dashboardStore.refresh()]);
        return true;
      },
      {
        successMessage: isEdition ? 'Notes et commentaire mis à jour.' : 'Soumission validée et notée.',
        failureMessage: 'Impossible de valider cette soumission.'
      }
    );
  }

  function submissionStatusMeta(status: string) {
    if (status === 'APPROVED') {
      return {
        label: 'Validée',
        classes: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
      };
    }
    if (status === 'REJECTED') {
      return {
        label: 'Rejetée',
        classes: 'bg-red-500/10 text-red-700 border-red-500/20',
      };
    }
    return {
      label: 'En attente',
      classes: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
    };
  }

  const todaySubmissionStats = $derived.by(() => {
    const submissions = dailyAlgoToday?.submissions ?? [];
    return {
      total: submissions.length,
      pending: submissions.filter((submission) => submission.status === 'PENDING').length,
      approved: submissions.filter((submission) => submission.status === 'APPROVED').length,
      rejected: submissions.filter((submission) => submission.status === 'REJECTED').length,
    };
  });

  const filteredTodaySubmissions = $derived.by(() => {
    const submissions = dailyAlgoToday?.submissions ?? [];
    if (dailyAlgoSubmissionStatusFilter === 'ALL') {
      return submissions;
    }
    return submissions.filter((submission) => submission.status === dailyAlgoSubmissionStatusFilter);
  });

  function submissionStatusSortWeight(status: string) {
    if (status === 'PENDING') return 0;
    if (status === 'APPROVED') return 1;
    if (status === 'REJECTED') return 2;
    return 3;
  }

  const sortedFilteredTodaySubmissions = $derived.by(() => {
    return [...filteredTodaySubmissions].sort((left, right) => {
      const statusDelta = submissionStatusSortWeight(left.status) - submissionStatusSortWeight(right.status);
      if (statusDelta !== 0) return statusDelta;
      return new Date(left.submittedAt).getTime() - new Date(right.submittedAt).getTime();
    });
  });

  const focusedSubmission = $derived.by(() => {
    if (!ideModalOpen || !ideFocusedSubmissionId) return null;
    return (dailyAlgoToday?.submissions ?? []).find((submission) => submission.id === ideFocusedSubmissionId) ?? null;
  });

  $effect(() => {
    if (!ideModalOpen || typeof window === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeIntegratedIde();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  $effect(() => {
    if (typeof document === 'undefined') return;
    if (!ideModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  });

  $effect(() => {
    if (!ideModalOpen || typeof window === 'undefined') return;
    const onResize = () => computeIntegratedIdeEditorHeight();
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  function historyDateLabel(dateKey?: string | null) {
    if (!dateKey) return 'Date inconnue';
    const [year, month, day] = dateKey.split('-').map((value) => Number(value));
    if (!year || !month || !day) return dateKey;
    return new Date(year, month - 1, day).toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  function difficultyLabel(value: string) {
    if (value === 'facile') return 'Facile';
    if (value === 'moyen') return 'Moyen';
    if (value === 'difficile') return 'Difficile';
    return value;
  }

  function dailyAlgoProblemStatus(problem: any) {
    return problem.usedAt ? 'Utilisé' : 'Disponible';
  }

  const sortedDailyAlgoProblems = $derived.by(() => {
    return [...dailyAlgoProblems].sort((left, right) => {
      if (!!left.usedAt !== !!right.usedAt) {
        return left.usedAt ? 1 : -1;
      }

      const leftCreatedAt = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightCreatedAt = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      return rightCreatedAt - leftCreatedAt;
    });
  });

  $effect(() => {
    desiredModuleStatus = module.status === 'active' ? 'active' : 'inactive';
  });

  function openDeleteFeedModal(feed: { id: string; name: string }) {
    if (!canManageSettings) {
      formAction.setError('Seuls les administrateurs peuvent modifier ce module.');
      return;
    }

    pendingFeedDeletion = { id: feed.id, name: feed.name };
    deleteFeedModalOpen = true;
  }

  function closeDeleteFeedModal() {
    deleteFeedModalOpen = false;
    pendingFeedDeletion = null;
  }

  async function confirmDeleteFeed() {
    if (!pendingFeedDeletion) return;

    const feedId = pendingFeedDeletion.id;
    closeDeleteFeedModal();

    await formAction.run(
      async () => {
        const success = await deleteFeed(feedId);
        if (!success) return false;
        await dashboardStore.refresh();
        return true;
      },
      {
        successMessage: 'Flux RSS supprimé.',
        failureMessage: 'Impossible de supprimer ce flux.'
      }
    );
  }

  async function handleSave() {
    formAction.clearFeedback();

    if (!canManageSettings) {
      formAction.setError('Seuls les administrateurs peuvent modifier ce module.');
      return;
    }

    if (moduleId === 'youtube') {
      await formAction.run(
        async () => {
          const success = await updateYouTubeSettings(youtubeReferenceChannelId.trim());
          if (!success) return false;
          await dashboardStore.refresh();
          return true;
        },
        {
          successMessage: 'Canal YouTube de référence enregistré avec succès.',
          failureMessage: 'Impossible d\'enregistrer le canal YouTube de référence.'
        }
      );
      return;
    }

    if (moduleId === 'rss') {
      formAction.setMessage('Les flux RSS se configurent directement dans la liste ci-dessous.');
      return;
    }

    await formAction.run(
      async () => {
        const success = await updateModuleStatus(moduleId, desiredModuleStatus);
        if (!success) return false;
        await dashboardStore.refresh();
        return true;
      },
      {
        successMessage: 'Configuration du module enregistrée avec succès.',
        failureMessage: 'Impossible de sauvegarder la configuration du module.'
      }
    );
  }

  const activeFeeds = $derived(dashboardStore.state.feeds);

  type FeedSortField = 'name' | 'category' | 'lastCheck' | 'status';
  let feedSearchQuery = $state('');
  let feedFilters = $state({
    statuses: [] as string[],
    categories: [] as string[],
  });
  let feedSortField = $state<FeedSortField>('lastCheck');
  let feedSortDirection = $state<'asc' | 'desc'>('desc');

  const feedStatusOptions = $derived<ColumnFilterOption[]>([
    { value: 'ok', label: 'Synchronisé' },
    { value: 'warning', label: 'Avertissement' },
    { value: 'error', label: 'Échec' },
  ]);
  const feedCategoryOptions = $derived<ColumnFilterOption[]>(
    [...new Set(activeFeeds.map((feed) => feed.category || 'Général'))]
      .sort((a, b) => a.localeCompare(b, 'fr'))
      .map((category) => ({ value: category, label: category }))
  );

  const hasActiveFeedFiltersOrSort = $derived(
    feedSearchQuery.trim().length > 0
      || feedFilters.statuses.length > 0
      || feedFilters.categories.length > 0
      || feedSortField !== 'lastCheck'
      || feedSortDirection !== 'desc'
  );

  const filteredFeeds = $derived.by(() => {
    const query = feedSearchQuery.trim().toLowerCase();
    return [...activeFeeds]
      .filter((feed) => {
        const category = feed.category || 'Général';
        const matchesQuery = !query
          || (feed.name || '').toLowerCase().includes(query)
          || (feed.url || '').toLowerCase().includes(query)
          || category.toLowerCase().includes(query);
        const matchesStatus = feedFilters.statuses.length === 0 || feedFilters.statuses.includes(feed.lastStatus);
        const matchesCategory = feedFilters.categories.length === 0 || feedFilters.categories.includes(category);
        return matchesQuery && matchesStatus && matchesCategory;
      })
      .sort((left, right) => {
        let result = 0;
        switch (feedSortField) {
          case 'name':
            result = (left.name || '').localeCompare((right.name || ''), 'fr');
            break;
          case 'category':
            result = (left.category || 'Général').localeCompare((right.category || 'Général'), 'fr');
            break;
          case 'lastCheck': {
            const leftDate = left.lastCheck ? new Date(left.lastCheck).getTime() : 0;
            const rightDate = right.lastCheck ? new Date(right.lastCheck).getTime() : 0;
            result = leftDate - rightDate;
            break;
          }
          case 'status':
            result = (left.lastStatus || '').localeCompare((right.lastStatus || ''), 'fr');
            break;
        }
        return feedSortDirection === 'asc' ? result : -result;
      });
  });

  function toggleFeedFilter(filterType: keyof typeof feedFilters, value: string) {
    const list = feedFilters[filterType];
    if (list.includes(value)) {
      feedFilters[filterType] = list.filter((entry) => entry !== value);
      return;
    }
    feedFilters[filterType] = [...list, value];
  }

  function toggleFeedSort(field: FeedSortField) {
    if (feedSortField === field) {
      feedSortDirection = feedSortDirection === 'asc' ? 'desc' : 'asc';
      return;
    }
    feedSortField = field;
    feedSortDirection = 'asc';
  }

  function feedSortDirectionFor(field: FeedSortField) {
    return feedSortField === field ? feedSortDirection : null;
  }

  function resetFeedFiltersAndSort() {
    feedSearchQuery = '';
    feedFilters = {
      statuses: [],
      categories: [],
    };
    feedSortField = 'lastCheck';
    feedSortDirection = 'desc';
  }

  let editingFeedId = $state(null);
  let feedDraft = $state({
    name: '',
    url: '',
    category: 'Général',
    includeKeywords: '',
    excludeKeywords: '',
    enabled: true,
    scanMinutes: 10
  });

  const rssStats = $derived.by(() => {
    const feeds = dashboardStore.state.feeds;
    const total = feeds.length;
    const active = feeds.filter((f) => f.enabled).length;
    const inError = feeds.filter((f) => f.lastStatus === 'error').length;
    const inWarning = feeds.filter((f) => f.lastStatus === 'warning').length;

    return { total, active, inError, inWarning };
  });

  function formatDate(isoDate) {
    if (!isoDate) return 'Jamais';
    return new Date(isoDate).toLocaleString('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  }

  function startEditFeed(feed) {
    if (!canManageSettings) {
      formAction.setError('Seuls les administrateurs peuvent modifier les flux RSS.');
      return;
    }

    editingFeedId = feed.id;
    feedDraft = {
      name: feed.name,
      url: feed.url,
      category: feed.category || 'Général',
      includeKeywords: (feed.includeKeywords || []).join(', '),
      excludeKeywords: (feed.excludeKeywords || []).join(', '),
      enabled: !!feed.enabled,
      scanMinutes: feed.scanMinutes || 10
    };
  }

  function cancelEditFeed() {
    editingFeedId = null;
  }

  function splitKeywords(value) {
    if (!value) return [];
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  function buildFeedPayload(feed, overrides: Record<string, any> = {}) {
    return {
      name: (overrides.name ?? feed.name ?? '').trim(),
      url: (overrides.url ?? feed.url ?? '').trim(),
      category: (overrides.category ?? feed.category ?? 'Général').trim() || 'Général',
      enabled: overrides.enabled ?? !!feed.enabled,
      scanMinutes: Number(overrides.scanMinutes ?? feed.scanMinutes ?? 10) || 10,
      includeKeywords: overrides.includeKeywords ?? feed.includeKeywords ?? [],
      excludeKeywords: overrides.excludeKeywords ?? feed.excludeKeywords ?? []
    };
  }

  async function saveFeed(feedId) {
    if (!canManageSettings) {
      formAction.setError('Seuls les administrateurs peuvent modifier les flux RSS.');
      return;
    }

    const payload = buildFeedPayload(feedDraft, {
      includeKeywords: splitKeywords(feedDraft.includeKeywords),
      excludeKeywords: splitKeywords(feedDraft.excludeKeywords)
    });

    if (!payload.name || !payload.url) {
      formAction.setError('Le nom et l\'URL du flux sont requis.');
      return;
    }

    await formAction.run(
      async () => {
        const success = await updateFeed(feedId, payload);
        if (!success) return false;
        editingFeedId = null;
        await dashboardStore.refresh();
        return true;
      },
      {
        successMessage: 'Flux RSS mis à jour.',
        failureMessage: 'Impossible de mettre à jour ce flux.'
      }
    );
  }

  async function toggleFeedEnabled(feed) {
    if (!canManageSettings) {
      formAction.setError('Seuls les administrateurs peuvent modifier les flux RSS.');
      return;
    }

    await formAction.run(
      async () => {
        const success = await updateFeed(feed.id, buildFeedPayload(feed, { enabled: !feed.enabled }));
        if (!success) return false;
        await dashboardStore.refresh();
        return true;
      },
      {
        successMessage: `Flux ${feed.enabled ? 'désactivé' : 'activé'} avec succès.`,
        failureMessage: 'Impossible de changer l\'état du flux.'
      }
    );
  }
</script>

<div class="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
  
  <div class="flex items-center gap-3 px-2">
    <a href="/modules" class="text-[10px] font-black text-on-surface-variant/40 hover:text-primary uppercase tracking-[0.25em] transition-colors">Catalogue</a>
    <span class="material-symbols-outlined text-sm text-slate-400 opacity-30">chevron_right</span>
    <span class="text-[10px] font-black text-primary uppercase tracking-[0.25em]">{module.name}</span>
  </div>

  
  <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 pb-8 border-b border-outline-variant/20">
    <div class="flex items-center gap-6">
      <div class="w-16 h-16 rounded-[1.75rem] {moduleMeta.headerToneClasses} flex items-center justify-center shadow-inner border group hover:rotate-6 transition-transform">
        <span class="material-symbols-outlined text-3xl">{moduleMeta.icon}</span>
      </div>
      <div>
        <h2 class="text-3xl font-black font-headline tracking-tighter leading-tight">{module.name}</h2>
        <div class="flex items-center gap-3 mt-1.5 px-3 py-1 bg-emerald-500/5 rounded-full border border-emerald-500/10 w-fit">
          <span class="w-1.5 h-1.5 rounded-full {module.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}"></span>
          <span class="text-[9px] font-black {module.status === 'active' ? 'text-emerald-600' : 'text-slate-500'} uppercase tracking-widest whitespace-nowrap">
            {module.status === 'active' ? 'Actif' : 'Inactif'}
          </span>
        </div>
      </div>
    </div>
    
    <div class="flex items-center gap-4">
      <RefreshButton
        onClick={() => dashboardStore.refresh()}
        loading={dashboardStore.state.loading}
        label="Rafraîchir"
        className="px-6 py-3.5 text-xs font-black uppercase tracking-widest rounded-2xl bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/30 text-on-surface-variant/60 hover:text-on-surface shadow-none"
        iconClass="text-base"
      />
      <button 
        onclick={handleSave}
        disabled={formAction.state.loading || !canManageSettings}
        class="px-10 py-3.5 bg-primary text-on-primary text-xs font-black rounded-2xl shadow-2xl shadow-primary/30 hover:scale-105 active:scale-95 transition-all uppercase tracking-widest"
      >
        {formAction.state.loading ? 'Enregistrement...' : 'Enregistrer'}
      </button>
    </div>
  </div>

  <InlineFeedback message={formAction.state.message} error={formAction.state.error} />

  {#if !canManageSettings}
    <div class="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs font-bold text-amber-700">
      Accès modérateur: cette page est en lecture seule.
    </div>
  {/if}

  <div class="grid grid-cols-12 gap-12">
    
    <div class="col-span-12 space-y-12 pb-24">
      
      <section class="space-y-8">
        <h3 class="text-xl font-black tracking-tight flex items-center gap-4">
          <div class="w-1.5 h-8 bg-primary rounded-full"></div>
          Configuration Générale
        </h3>
        <div class="premium-card p-10 rounded-[3rem] space-y-10 group">
          <div class="space-y-4">
            <label class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.25em] ml-2 block" for="name">Description du module</label>
            <p class="px-6 py-4 bg-surface-container-low border border-outline-variant/5 rounded-2xl text-sm italic opacity-70">
              {module.description}
            </p>
          </div>
          
          {#if moduleId === 'rss'}
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div class="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-5">
                <p class="text-[10px] uppercase tracking-[0.2em] font-black text-emerald-700/80">Flux actifs</p>
                <p class="text-3xl font-black text-emerald-700 mt-2">{rssStats.active}</p>
              </div>
              <div class="rounded-2xl bg-slate-500/10 border border-slate-500/20 p-5">
                <p class="text-[10px] uppercase tracking-[0.2em] font-black text-slate-700/80">Total flux</p>
                <p class="text-3xl font-black text-slate-700 mt-2">{rssStats.total}</p>
              </div>
              <div class="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-5">
                <p class="text-[10px] uppercase tracking-[0.2em] font-black text-amber-700/80">Avertissements</p>
                <p class="text-3xl font-black text-amber-700 mt-2">{rssStats.inWarning}</p>
              </div>
              <div class="rounded-2xl bg-red-500/10 border border-red-500/20 p-5">
                <p class="text-[10px] uppercase tracking-[0.2em] font-black text-red-700/80">Erreurs</p>
                <p class="text-3xl font-black text-red-700 mt-2">{rssStats.inError}</p>
              </div>
            </div>
          {/if}
        </div>
      </section>

      {#if moduleId === 'rss'}
        
        <section class="space-y-8">
          <div class="flex items-center justify-between px-2">
            <h3 class="text-xl font-black tracking-tight flex items-center gap-4">
              <div class="w-1.5 h-8 bg-primary rounded-full"></div>
              Flux RSS Connectés
            </h3>
          </div>

          <div class="rounded-3xl border border-outline-variant/15 bg-surface-container/60 p-4 md:p-5">
            <div class="flex flex-col gap-4">
              <div class="flex flex-col md:flex-row md:items-center gap-3 justify-between">
                <label class="relative w-full md:max-w-xl">
                  <span class="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/40 text-lg">search</span>
                  <FormInput
                    bind:value={feedSearchQuery}
                    type="search"
                    placeholder="Rechercher un flux, une URL, une catégorie..."
                    className="w-full rounded-full border border-outline-variant/20 bg-surface-container-low px-11 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/40 outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
                  />
                </label>

                <div class="flex items-center gap-3">
                  <span class="text-xs font-bold text-on-surface-variant">{filteredFeeds.length} / {activeFeeds.length} flux</span>
                  {#if hasActiveFeedFiltersOrSort}
                    <button
                      type="button"
                      onclick={resetFeedFiltersAndSort}
                      class="text-xs font-bold text-primary hover:text-primary/80 transition"
                    >
                      Réinitialiser
                    </button>
                  {/if}
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-3">
                <ColumnSortFilter
                  label="Nom"
                  sortDirection={feedSortDirectionFor('name')}
                  onToggleSort={() => toggleFeedSort('name')}
                />
                <ColumnSortFilter
                  label="Catégorie"
                  sortDirection={feedSortDirectionFor('category')}
                  onToggleSort={() => toggleFeedSort('category')}
                  options={feedCategoryOptions}
                  selectedValues={feedFilters.categories}
                  onToggleValue={(value) => toggleFeedFilter('categories', value)}
                />
                <ColumnSortFilter
                  label="Dernier check"
                  sortDirection={feedSortDirectionFor('lastCheck')}
                  onToggleSort={() => toggleFeedSort('lastCheck')}
                />
                <ColumnSortFilter
                  label="État"
                  sortDirection={feedSortDirectionFor('status')}
                  onToggleSort={() => toggleFeedSort('status')}
                  options={feedStatusOptions}
                  selectedValues={feedFilters.statuses}
                  onToggleValue={(value) => toggleFeedFilter('statuses', value)}
                />
              </div>
            </div>
          </div>

          <div class="space-y-4">
            {#each filteredFeeds as feed}
              <div class="premium-card p-6 rounded-3xl space-y-6 hover:border-primary/40 transition-all">
                <div class="flex flex-wrap items-start justify-between gap-4">
                  <div class="flex items-center gap-5 min-w-0">
                    <div class="w-12 h-12 {feed.enabled ? 'bg-orange-500/10 text-orange-600' : 'bg-slate-500/10 text-slate-400'} rounded-2xl flex items-center justify-center border border-current opacity-20">
                      <span class="material-symbols-outlined text-2xl">rss_feed</span>
                    </div>
                    <div class="min-w-0">
                      <p class="font-black text-on-surface tracking-tight leading-none mb-1.5">{feed.name}</p>
                      <p class="text-[10px] text-on-surface-variant/40 font-bold font-mono truncate">{feed.url}</p>
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    <button
                      onclick={() => toggleFeedEnabled(feed)}
                      disabled={!canManageSettings}
                      class="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] border transition-all {feed.enabled
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500 hover:text-white'
                        : 'bg-slate-500/10 text-slate-600 border-slate-500/20 hover:bg-slate-700 hover:text-white'}"
                    >
                      {feed.enabled ? 'Actif' : 'Inactif'}
                    </button>
                    <button
                      onclick={() => startEditFeed(feed)}
                      disabled={!canManageSettings}
                      class="p-3 text-on-surface-variant/40 hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                      title="Modifier le flux"
                    >
                      <span class="material-symbols-outlined">edit</span>
                    </button>
                    <button 
                      onclick={() => openDeleteFeedModal(feed)}
                      disabled={!canManageSettings}
                      class="p-3 text-on-surface-variant/20 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                      title="Supprimer le flux"
                    >
                      <span class="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div class="rounded-2xl bg-surface-container-low p-4 border border-outline-variant/10">
                    <p class="text-[9px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em] mb-1">Dernier état</p>
                    <div class="flex items-center gap-2">
                      <span class="w-2 h-2 rounded-full {feed.lastStatus === 'ok' ? 'bg-emerald-500' : feed.lastStatus === 'warning' ? 'bg-amber-500' : 'bg-red-500'}"></span>
                      <span class="text-xs font-black {feed.lastStatus === 'ok' ? 'text-emerald-600' : feed.lastStatus === 'warning' ? 'text-amber-600' : 'text-red-600'} uppercase tracking-[0.08em]">
                        {feed.lastStatus === 'ok' ? 'Synchronisé' : feed.lastStatus === 'warning' ? 'Avertissement' : 'Échec'}
                      </span>
                    </div>
                  </div>

                  <div class="rounded-2xl bg-surface-container-low p-4 border border-outline-variant/10">
                    <p class="text-[9px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em] mb-1">Dernière vérification</p>
                    <p class="text-xs font-bold text-on-surface">{formatDate(feed.lastCheck)}</p>
                  </div>

                  <div class="rounded-2xl bg-surface-container-low p-4 border border-outline-variant/10">
                    <p class="text-[9px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em] mb-1">Catégorie</p>
                    <p class="text-xs font-bold text-on-surface">{feed.category || 'Général'}</p>
                  </div>
                </div>

                <div class="flex flex-wrap gap-2">
                  <span class="text-[9px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em] self-center">Inclusions</span>
                  {#if feed.includeKeywords?.length}
                    {#each feed.includeKeywords as keyword}
                      <span class="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-700">{keyword}</span>
                    {/each}
                  {:else}
                    <span class="text-[10px] font-medium text-on-surface-variant/60">Aucun mot-clé</span>
                  {/if}
                </div>

                <div class="flex flex-wrap gap-2">
                  <span class="text-[9px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em] self-center">Exclusions</span>
                  {#if feed.excludeKeywords?.length}
                    {#each feed.excludeKeywords as keyword}
                      <span class="px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-[10px] font-bold text-red-700">{keyword}</span>
                    {/each}
                  {:else}
                    <span class="text-[10px] font-medium text-on-surface-variant/60">Aucun mot-clé</span>
                  {/if}
                </div>

                {#if editingFeedId === feed.id}
                  <div class="border-t border-outline-variant/15 pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-2">
                      <label for="feed-name" class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Nom du flux</label>
                      <FormInput
                        id="feed-name"
                        bind:value={feedDraft.name}
                        disabled={!canManageSettings}
                        className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/10 rounded-xl text-sm font-semibold outline-none focus:border-primary/40"
                        placeholder="Nom lisible"
                      />
                    </div>

                    <div class="space-y-2">
                      <label for="feed-category" class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Catégorie</label>
                      <FormInput
                        id="feed-category"
                        bind:value={feedDraft.category}
                        disabled={!canManageSettings}
                        className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/10 rounded-xl text-sm font-semibold outline-none focus:border-primary/40"
                        placeholder="Catégorie"
                      />
                    </div>

                    <div class="space-y-2 md:col-span-2">
                      <label for="feed-url" class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">URL du flux</label>
                      <FormInput
                        id="feed-url"
                        bind:value={feedDraft.url}
                        disabled={!canManageSettings}
                        className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/10 rounded-xl text-sm font-semibold outline-none focus:border-primary/40"
                        placeholder="https://..."
                      />
                    </div>

                    <div class="space-y-2">
                      <label for="feed-include-keywords" class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Mots-clés inclus (séparés par virgule)</label>
                      <FormInput
                        id="feed-include-keywords"
                        bind:value={feedDraft.includeKeywords}
                        disabled={!canManageSettings}
                        className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/10 rounded-xl text-sm font-semibold outline-none focus:border-primary/40"
                        placeholder="ia, open-source, release"
                      />
                    </div>

                    <div class="space-y-2">
                      <label for="feed-exclude-keywords" class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Mots-clés exclus (séparés par virgule)</label>
                      <FormInput
                        id="feed-exclude-keywords"
                        bind:value={feedDraft.excludeKeywords}
                        disabled={!canManageSettings}
                        className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/10 rounded-xl text-sm font-semibold outline-none focus:border-primary/40"
                        placeholder="sponsorisé, promo"
                      />
                    </div>

                    <div class="md:col-span-2 flex items-center justify-end gap-3 pt-2">
                      <button
                        onclick={cancelEditFeed}
                        class="px-5 py-2.5 rounded-xl border border-outline-variant/30 text-xs font-black uppercase tracking-[0.12em] text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container-low"
                      >
                        Annuler
                      </button>
                      <button
                        onclick={() => saveFeed(feed.id)}
                        disabled={!canManageSettings}
                        class="px-6 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-black uppercase tracking-[0.12em] shadow-lg shadow-primary/20 hover:scale-[1.01] transition-transform"
                      >
                        Enregistrer le flux
                      </button>
                    </div>
                  </div>
                {/if}
              </div>
            {/each}

            {#if activeFeeds.length === 0}
              <div class="p-20 text-center premium-card rounded-[3rem] border-dashed border-2 opacity-30 flex flex-col items-center">
                <span class="material-symbols-outlined text-6xl mb-6">rss_feed</span>
                <p class="text-[10px] font-black uppercase tracking-[0.3em]">Aucun flux n'est encore lié à cette instance</p>
              </div>
            {:else if filteredFeeds.length === 0}
              <div class="p-14 text-center premium-card rounded-[3rem] border-dashed border-2 opacity-55 flex flex-col items-center">
                <span class="material-symbols-outlined text-5xl mb-4">filter_alt_off</span>
                <p class="text-[10px] font-black uppercase tracking-[0.3em]">Aucun flux ne correspond aux filtres</p>
              </div>
            {/if}
          </div>
        </section>
      {:else if moduleId === 'youtube'}
        <section class="space-y-8">
          <h3 class="text-xl font-black tracking-tight flex items-center gap-4">
            <div class="w-1.5 h-8 bg-red-500 rounded-full"></div>
            Configuration YouTube
          </h3>
          <div class="premium-card p-10 rounded-[3rem] space-y-10 group">
             <div class="space-y-4">
                <label class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.25em] ml-2 block" for="yt-id">ID de la chaîne de référence</label>
                <FormInput
                  id="yt-id"
                  type="text"
                  bind:value={youtubeReferenceChannelId}
                  disabled={!canManageSettings}
                  className="w-full px-6 py-4 bg-surface-container-low border border-outline-variant/10 focus:border-red-500/30 focus:shadow-xl focus:shadow-red-500/5 transition-all rounded-2xl text-sm font-bold outline-none"
                  placeholder="UCxxxxxxxxxxxxxxxxx"
                />
                <p class="text-[10px] text-slate-400 ml-2">L'ID de la chaîne YouTube dont les nouvelles vidéos seront automatiquement publiées.</p>
             </div>
          </div>
        </section>
      {:else if moduleId === 'dailyalgo'}
        <section class="space-y-8">
          <h3 class="text-xl font-black tracking-tight flex items-center gap-4">
            <div class="w-1.5 h-8 bg-emerald-500 rounded-full"></div>
            Exercices Algorithmiques
          </h3>

          <div class="premium-card p-8 rounded-[2.5rem] space-y-6">
            <div class="flex items-center justify-between gap-4">
              <h4 class="text-lg font-black text-on-surface">Soumissions du Daily Algo du jour</h4>
              <RefreshButton
                onClick={loadTodayDailyAlgoSubmissions}
                loading={isFetchingAlgoSubmissions}
                label="Rafraîchir"
                className="px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/20 text-on-surface-variant"
                iconClass="text-sm"
              />
            </div>

            {#if isFetchingAlgoSubmissions}
              <div class="p-8 text-center text-sm font-bold text-on-surface-variant/50 animate-pulse">
                Chargement des soumissions du jour...
              </div>
            {:else if !dailyAlgoToday?.run}
              <div class="p-8 rounded-2xl border border-outline-variant/20 bg-surface-container-low text-sm text-on-surface-variant">
                Aucun Daily Algo n'a encore été lancé aujourd'hui.
              </div>
            {:else}
              <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div class="rounded-2xl bg-slate-500/10 border border-slate-500/20 p-4">
                  <p class="text-[9px] uppercase tracking-[0.2em] font-black text-slate-700/80">Soumissions</p>
                  <p class="text-2xl font-black text-slate-700 mt-1">{todaySubmissionStats.total}</p>
                </div>
                <div class="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4">
                  <p class="text-[9px] uppercase tracking-[0.2em] font-black text-amber-700/80">En attente</p>
                  <p class="text-2xl font-black text-amber-700 mt-1">{todaySubmissionStats.pending}</p>
                </div>
                <div class="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4">
                  <p class="text-[9px] uppercase tracking-[0.2em] font-black text-emerald-700/80">Validées</p>
                  <p class="text-2xl font-black text-emerald-700 mt-1">{todaySubmissionStats.approved}</p>
                </div>
                <div class="rounded-2xl bg-red-500/10 border border-red-500/20 p-4">
                  <p class="text-[9px] uppercase tracking-[0.2em] font-black text-red-700/80">Rejetées</p>
                  <p class="text-2xl font-black text-red-700 mt-1">{todaySubmissionStats.rejected}</p>
                </div>
              </div>

              <div class="rounded-2xl bg-surface-container-low border border-outline-variant/15 p-4">
                <p class="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60">Défi en cours</p>
                <p class="mt-1 text-sm font-black text-on-surface">{dailyAlgoToday.run.problem.title}</p>
                <p class="mt-2 text-xs text-on-surface-variant line-clamp-3">{dailyAlgoToday.run.problem.description}</p>
              </div>

              <div class="rounded-2xl border border-outline-variant/15 bg-surface-container-low p-4">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 mr-2">Filtrer par statut</span>
                  {#each [
                    { value: 'ALL', label: 'Tous' },
                    { value: 'PENDING', label: 'En attente' },
                    { value: 'APPROVED', label: 'Validées' },
                    { value: 'REJECTED', label: 'Rejetées' },
                  ] as option}
                    <button
                      type="button"
                      onclick={() => (dailyAlgoSubmissionStatusFilter = option.value as 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED')}
                      class="px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-[0.12em] transition-colors {dailyAlgoSubmissionStatusFilter === option.value
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface text-on-surface-variant border-outline-variant/30 hover:text-on-surface'}"
                    >
                      {option.label}
                    </button>
                  {/each}
                </div>
              </div>

              {#if (dailyAlgoToday.submissions ?? []).length === 0}
                <div class="p-8 rounded-2xl border border-outline-variant/20 bg-surface-container-low text-sm text-on-surface-variant">
                  Aucune soumission enregistrée pour le moment.
                </div>
              {:else if filteredTodaySubmissions.length === 0}
                <div class="p-8 rounded-2xl border border-outline-variant/20 bg-surface-container-low text-sm text-on-surface-variant">
                  Aucune soumission ne correspond à ce filtre.
                </div>
              {:else}
                <div class="space-y-3">
                  <p class="text-xs font-bold text-on-surface-variant">
                    {sortedFilteredTodaySubmissions.length} / {dailyAlgoToday.submissions.length} soumission(s) affichée(s)
                  </p>
                  <div class="rounded-2xl border border-outline-variant/15 bg-surface-container-low overflow-x-auto">
                    <table class="data-table">
                      <thead>
                        <tr>
                          <th class="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant">Membre</th>
                          <th class="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant">Statut</th>
                          <th class="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant">Soumission</th>
                          <th class="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant">Note / Total</th>
                          <th class="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant">Modération</th>
                          <th class="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {#each sortedFilteredTodaySubmissions as submission}
                          <tr>
                            <td>
                              <p class="text-sm font-black text-on-surface">{submission.authorName}</p>
                              <p class="text-[10px] text-on-surface-variant">ID: {submission.authorId}</p>
                            </td>
                            <td>
                              <span class="px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-[0.12em] {submissionStatusMeta(submission.status).classes}">
                                {submissionStatusMeta(submission.status).label}
                              </span>
                              {#if submission.speedRank}
                                <p class="mt-1 text-[10px] text-on-surface-variant">Rang #{submission.speedRank} (+{submission.speedBonusPoints ?? 0})</p>
                              {/if}
                            </td>
                            <td>
                              <p class="text-xs font-bold text-on-surface">{formatDate(submission.submittedAt)}</p>
                              <div class="mt-1 flex flex-wrap items-center gap-3">
                                <button
                                  type="button"
                                  onclick={() => openSubmissionInIntegratedIde(submission)}
                                  class="text-[10px] font-black uppercase tracking-widest text-emerald-700 hover:text-emerald-600"
                                >
                                  IDE intégré
                                </button>
                              </div>
                            </td>
                            <td>
                              {#if submission.status === 'APPROVED'}
                                <p class="text-xs font-black text-emerald-700">{submission.scoreFinal ?? 0}/5</p>
                                <p class="text-[10px] text-emerald-700/80">Total {submission.totalPoints ?? submission.scoreFinal ?? 0} pts</p>
                              {:else if submission.status === 'REJECTED'}
                                <p class="text-xs font-black text-red-700">Rejetée</p>
                              {:else}
                                <p class="text-xs font-black text-amber-700">En attente de note</p>
                              {/if}
                              {#if submission.reviewFeedback}
                                <p class="mt-1 text-[10px] text-on-surface-variant line-clamp-2">{submission.reviewFeedback}</p>
                              {/if}
                            </td>
                            <td>
                              {#if submission.validatedByName}
                                <p class="text-xs font-bold text-on-surface">{submission.validatedByName}</p>
                                <p class="text-[10px] text-on-surface-variant">{submission.validatedAt ? formatDate(submission.validatedAt) : 'Date inconnue'}</p>
                              {:else}
                                <p class="text-[10px] font-bold text-on-surface-variant">Pas encore modérée</p>
                              {/if}
                            </td>
                            <td>
                              {#if canModerateContent && (submission.status === 'PENDING' || submission.status === 'APPROVED' || submission.status === 'REJECTED')}
                                <div class="flex flex-col gap-2">
                                  <button
                                    type="button"
                                    onclick={() => openSubmissionInIntegratedIde(submission)}
                                    class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest"
                                  >
                                    {submission.status === 'PENDING' ? 'Noter dans IDE' : submission.status === 'APPROVED' ? 'Modifier dans IDE' : 'Réévaluer dans IDE'}
                                  </button>
                                  {#if submission.status === 'PENDING'}
                                    <button
                                      type="button"
                                      onclick={() => rejectSubmission(submission.id)}
                                      class="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-700 text-[10px] font-black uppercase tracking-widest"
                                    >
                                      Rejeter
                                    </button>
                                  {/if}
                                </div>
                              {:else}
                                <span class="text-[10px] text-on-surface-variant">Aucune action</span>
                              {/if}
                            </td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                </div>
              {/if}
            {/if}
          </div>

          <div class="premium-card p-8 rounded-[2.5rem] space-y-6">
            <div class="flex items-center justify-between gap-4">
              <h4 class="text-lg font-black text-on-surface">Historique Daily Algo (J-1 et avant)</h4>
              <RefreshButton
                onClick={loadDailyAlgoHistory}
                loading={isFetchingAlgoHistory}
                label="Rafraîchir"
                className="px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/20 text-on-surface-variant"
                iconClass="text-sm"
              />
            </div>

            {#if isFetchingAlgoHistory}
              <div class="p-8 text-center text-sm font-bold text-on-surface-variant/50 animate-pulse">
                Chargement de l'historique...
              </div>
            {:else if dailyAlgoHistory.length === 0}
              <div class="p-8 rounded-2xl border border-outline-variant/20 bg-surface-container-low text-sm text-on-surface-variant">
                Aucun historique Daily Algo disponible pour le moment.
              </div>
            {:else}
              <div class="space-y-3">
                {#each dailyAlgoHistory as run}
                  <div class="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4 space-y-3">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p class="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60">{historyDateLabel(run.dateKey)}</p>
                        <p class="mt-1 text-sm font-black text-on-surface">{run.problem.title}</p>
                      </div>
                      <div class="flex items-center gap-2 text-[10px] font-bold text-on-surface-variant">
                        <span class="px-2 py-1 rounded border border-outline-variant/25 bg-surface">Total: {run.stats.total}</span>
                        <span class="px-2 py-1 rounded border border-emerald-500/25 bg-emerald-500/10 text-emerald-700">Validées: {run.stats.approved}</span>
                        <span class="px-2 py-1 rounded border border-red-500/25 bg-red-500/10 text-red-700">Rejetées: {run.stats.rejected}</span>
                      </div>
                    </div>

                    {#if run.topEntries?.length}
                      <div class="space-y-1">
                        <p class="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60">Top du jour</p>
                        {#each run.topEntries as entry, index}
                          <div class="flex items-center justify-between rounded-lg border border-outline-variant/20 bg-surface px-3 py-2 text-xs">
                            <span class="font-black text-on-surface">#{index + 1} {entry.authorName}</span>
                            <span class="font-bold text-emerald-700">{entry.totalPoints} pts</span>
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <div class="premium-card p-8 rounded-[2.5rem] space-y-6">
            <div class="flex flex-wrap items-center justify-between gap-4">
              <h4 class="text-lg font-black text-on-surface">Exercices disponibles</h4>
              <div class="flex items-center gap-2">
                <RefreshButton
                  onClick={loadDailyAlgoProblems}
                  loading={isFetchingAlgo}
                  label="Rafraîchir"
                  className="px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/20 text-on-surface-variant"
                  iconClass="text-sm"
                />
                {#if canManageSettings}
                  <button
                    type="button"
                    onclick={openDailyAlgoProblemModal}
                    class="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-[0.12em] shadow-lg shadow-emerald-500/20 hover:bg-emerald-700"
                  >
                    Ajouter un nouvel exercice
                  </button>
                {/if}
              </div>
            </div>

            {#if isFetchingAlgo}
              <div class="p-8 text-center text-sm font-bold text-on-surface-variant/50 animate-pulse">
                Chargement des exercices...
              </div>
            {:else if sortedDailyAlgoProblems.length === 0}
              <div class="p-10 text-center rounded-2xl border border-outline-variant/20 bg-surface-container-low text-sm text-on-surface-variant">
                Aucun exercice disponible dans la base.
              </div>
            {:else}
              <div class="overflow-x-auto rounded-2xl border border-outline-variant/15 bg-surface-container-low">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th class="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant">Titre</th>
                      <th class="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant">Difficulté</th>
                      <th class="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant">Statut</th>
                      <th class="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant">Description</th>
                      <th class="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant">Créé le</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each sortedDailyAlgoProblems as problem}
                      <tr>
                        <td>
                          <p class="text-sm font-black text-on-surface">{problem.title}</p>
                        </td>
                        <td>
                          <span class="inline-flex px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-[0.12em] {problem.difficulty === 'facile' ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' : problem.difficulty === 'moyen' ? 'bg-amber-500/10 text-amber-700 border-amber-500/20' : 'bg-red-500/10 text-red-700 border-red-500/20'}">
                            {difficultyLabel(problem.difficulty)}
                          </span>
                        </td>
                        <td>
                          <span class="inline-flex px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-[0.12em] {problem.usedAt ? 'bg-slate-500/10 text-slate-700 border-slate-500/20' : 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'}">
                            {dailyAlgoProblemStatus(problem)}
                          </span>
                        </td>
                        <td>
                          <p class="text-xs text-on-surface-variant max-w-xl line-clamp-2">{problem.description}</p>
                        </td>
                        <td>
                          <p class="text-xs font-bold text-on-surface-variant">{formatDate(problem.createdAt)}</p>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>
        </section>
      {:else}
        <section class="space-y-8">
            <h3 class="text-xl font-black tracking-tight flex items-center gap-4">
              <div class="w-1.5 h-8 bg-primary rounded-full"></div>
              Paramètres du module
            </h3>
            <div class="premium-card p-10 rounded-[3rem] space-y-8">
              <div class="flex items-center justify-between gap-6 p-6 rounded-2xl bg-surface-container-low border border-outline-variant/20">
                <div>
                  <p class="text-sm font-black text-on-surface">Activation du module</p>
                  <p class="text-xs text-on-surface-variant/70 mt-1">Définissez l'état opérationnel de ce module et appliquez via "Enregistrer".</p>
                </div>
                <ToggleSwitch
                  checked={desiredModuleStatus === 'active'}
                  disabled={!canManageSettings}
                  onToggle={() => (desiredModuleStatus = desiredModuleStatus === 'active' ? 'inactive' : 'active')}
                />
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onclick={() => router.goto('/settings')}
                  disabled={!canManageSettings}
                  class="px-5 py-4 rounded-2xl border border-outline-variant/30 bg-surface-container-low text-sm font-black uppercase tracking-wider text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all"
                >
                  Ouvrir les paramètres globaux
                </button>
                <button
                  onclick={() => router.goto('/activity')}
                  class="px-5 py-4 rounded-2xl border border-outline-variant/30 bg-surface-container-low text-sm font-black uppercase tracking-wider text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all"
                >
                  Consulter les actions récentes
                </button>
              </div>
            </div>
        </section>
      {/if}
    </div>
  </div>
</div>

{#if ideModalOpen && focusedSubmission}
  <div class="modal-backdrop dailyalgo-ide-overlay" role="dialog" aria-modal="true" aria-labelledby="dailyalgo-ide-title" tabindex="-1">
    <div class="modal-panel modal-panel-dailyalgo-ide" onclick={(event) => event.stopPropagation()}>
      <div class="dailyalgo-ide-menubar">
        <div class="dailyalgo-ide-window-controls">
          <span class="dot red"></span>
          <span class="dot amber"></span>
          <span class="dot green"></span>
        </div>
        <p class="dailyalgo-ide-menubar-title">Kotbo IDE Workspace</p>
        <button
          type="button"
          onclick={closeIntegratedIde}
          class="dailyalgo-ide-close"
          aria-label="Fermer l'IDE intégré"
        >
          <span class="material-symbols-outlined text-base">close</span>
        </button>
      </div>

      <div class="dailyalgo-ide-modal-header">
        <div>
          <p class="dailyalgo-ide-modal-eyebrow">Daily Algo</p>
          <h3 id="dailyalgo-ide-title">Session de review: {focusedSubmission.authorName}</h3>
          <div class="dailyalgo-ide-modal-meta">
            <span class="dailyalgo-ide-chip">ID: {focusedSubmission.id}</span>
            <span class="dailyalgo-ide-chip {submissionStatusMeta(focusedSubmission.status).classes}">
              {submissionStatusMeta(focusedSubmission.status).label}
            </span>
            <span class="dailyalgo-ide-chip">Soumis: {formatDate(focusedSubmission.submittedAt)}</span>
          </div>
        </div>
      </div>

      <div class="dailyalgo-ide-modal-grid">
        <section class="dailyalgo-ide-editor-pane">
          <div class="dailyalgo-ide-context-strip">
            <span>Challenge: {dailyAlgoToday?.run?.problem?.title ?? 'Daily Algo'}</span>
            <span class="dot">•</span>
            <span>Score: {focusedSubmission.scoreFinal ?? '—'}/5</span>
            <span class="dot">•</span>
            <span>Total: {focusedSubmission.totalPoints ?? '—'} pts</span>
          </div>
          <DailyAlgoMiniIDE
            initialCode={focusedSubmission.solution}
            initialLanguage={ideLanguageForSubmission(focusedSubmission)}
            languagePersistenceKey={`submission:${focusedSubmission.id}`}
            height={integratedIdeEditorHeight}
            showPopoutButton={false}
            fileLabel={focusedSubmission.authorName?.replace(/\s+/g, '-').toLowerCase() || 'solution'}
          />
          {#if focusedSubmission.status !== 'PENDING' && focusedSubmission.reviewFeedback}
            <div class="rounded-xl border border-outline-variant/25 bg-surface-container-low p-3 space-y-1">
              <p class="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant">Feedback staff</p>
              <p class="text-xs text-on-surface whitespace-pre-wrap">{focusedSubmission.reviewFeedback}</p>
            </div>
          {/if}
        </section>

        <aside class="dailyalgo-ide-score-panel">
          <h4 class="text-[11px] font-black uppercase tracking-[0.14em] text-on-surface-variant">Review Panel</h4>

          {#if canModerateContent && (focusedSubmission.status === 'PENDING' || focusedSubmission.status === 'APPROVED' || focusedSubmission.status === 'REJECTED')}
            <div class="grid grid-cols-2 gap-3">
              <label class="text-[11px] font-bold text-on-surface-variant space-y-1" for={`modal-score-correctness-${focusedSubmission.id}`}>
                Correctitude
                <input
                  id={`modal-score-correctness-${focusedSubmission.id}`}
                  type="number"
                  min="1"
                  max="5"
                  step="1"
                  value={scoreDraftBySubmissionId[focusedSubmission.id]?.correctness ?? 5}
                  onchange={(event) => updateSubmissionScore(focusedSubmission.id, 'correctness', Number((event.currentTarget as HTMLInputElement).value))}
                  class="w-full px-3 py-2 rounded-lg border border-outline-variant/25 bg-surface text-sm text-on-surface"
                />
              </label>
              <label class="text-[11px] font-bold text-on-surface-variant space-y-1" for={`modal-score-comments-${focusedSubmission.id}`}>
                Commentaires
                <input
                  id={`modal-score-comments-${focusedSubmission.id}`}
                  type="number"
                  min="1"
                  max="5"
                  step="1"
                  value={scoreDraftBySubmissionId[focusedSubmission.id]?.comments ?? 5}
                  onchange={(event) => updateSubmissionScore(focusedSubmission.id, 'comments', Number((event.currentTarget as HTMLInputElement).value))}
                  class="w-full px-3 py-2 rounded-lg border border-outline-variant/25 bg-surface text-sm text-on-surface"
                />
              </label>
              <label class="text-[11px] font-bold text-on-surface-variant space-y-1" for={`modal-score-compactness-${focusedSubmission.id}`}>
                Compacité
                <input
                  id={`modal-score-compactness-${focusedSubmission.id}`}
                  type="number"
                  min="1"
                  max="5"
                  step="1"
                  value={scoreDraftBySubmissionId[focusedSubmission.id]?.compactness ?? 5}
                  onchange={(event) => updateSubmissionScore(focusedSubmission.id, 'compactness', Number((event.currentTarget as HTMLInputElement).value))}
                  class="w-full px-3 py-2 rounded-lg border border-outline-variant/25 bg-surface text-sm text-on-surface"
                />
              </label>
              <label class="text-[11px] font-bold text-on-surface-variant space-y-1" for={`modal-score-optimization-${focusedSubmission.id}`}>
                Optimisation
                <input
                  id={`modal-score-optimization-${focusedSubmission.id}`}
                  type="number"
                  min="1"
                  max="5"
                  step="1"
                  value={scoreDraftBySubmissionId[focusedSubmission.id]?.optimization ?? 5}
                  onchange={(event) => updateSubmissionScore(focusedSubmission.id, 'optimization', Number((event.currentTarget as HTMLInputElement).value))}
                  class="w-full px-3 py-2 rounded-lg border border-outline-variant/25 bg-surface text-sm text-on-surface"
                />
              </label>
              <label class="text-[11px] font-bold text-on-surface-variant space-y-1 col-span-2" for={`modal-score-readability-${focusedSubmission.id}`}>
                Lisibilité
                <input
                  id={`modal-score-readability-${focusedSubmission.id}`}
                  type="number"
                  min="1"
                  max="5"
                  step="1"
                  value={scoreDraftBySubmissionId[focusedSubmission.id]?.readability ?? 5}
                  onchange={(event) => updateSubmissionScore(focusedSubmission.id, 'readability', Number((event.currentTarget as HTMLInputElement).value))}
                  class="w-full px-3 py-2 rounded-lg border border-outline-variant/25 bg-surface text-sm text-on-surface"
                />
              </label>
            </div>

            <div class="space-y-2">
              <label class="text-[11px] font-bold text-on-surface-variant space-y-1" for={`modal-score-feedback-${focusedSubmission.id}`}>
                Explication / axes d'amélioration
                <textarea
                  id={`modal-score-feedback-${focusedSubmission.id}`}
                  rows="5"
                  maxlength="1000"
                  value={scoreDraftBySubmissionId[focusedSubmission.id]?.feedback ?? ''}
                  oninput={(event) => updateSubmissionFeedback(focusedSubmission.id, (event.currentTarget as HTMLTextAreaElement).value)}
                  class="w-full px-3 py-2 rounded-lg border border-outline-variant/25 bg-surface text-sm text-on-surface"
                  placeholder="Obligatoire si une note est inférieure à 5/5."
                ></textarea>
              </label>
              {#if [scoreDraftBySubmissionId[focusedSubmission.id]?.correctness ?? 5, scoreDraftBySubmissionId[focusedSubmission.id]?.comments ?? 5, scoreDraftBySubmissionId[focusedSubmission.id]?.compactness ?? 5, scoreDraftBySubmissionId[focusedSubmission.id]?.optimization ?? 5, scoreDraftBySubmissionId[focusedSubmission.id]?.readability ?? 5].some((score) => score < 5)}
                <p class="text-[10px] font-bold text-amber-700">Une explication est requise car au moins un critère est en dessous de 5/5.</p>
              {/if}
            </div>

            <div class="dailyalgo-ide-score-actions">
              <p class="text-xs font-black text-emerald-700">Moyenne: {reviewAverage(focusedSubmission.id)}/5</p>
              <div class="flex items-center gap-2">
                {#if focusedSubmission.status === 'PENDING'}
                  <button
                    type="button"
                    onclick={() => rejectSubmission(focusedSubmission.id)}
                    class="px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-700 text-[10px] font-black uppercase tracking-[0.12em]"
                  >
                    Rejeter
                  </button>
                {/if}
                <button
                  type="button"
                  onclick={() => approveSubmission(focusedSubmission.id)}
                  class="px-4 py-2 rounded-lg bg-emerald-700 text-white text-[10px] font-black uppercase tracking-[0.12em] hover:bg-emerald-800"
                >
                  {focusedSubmission.status === 'PENDING' ? 'Confirmer la validation' : focusedSubmission.status === 'APPROVED' ? 'Enregistrer les modifications' : 'Valider la réévaluation'}
                </button>
              </div>
            </div>
          {:else}
            <div class="rounded-xl border border-outline-variant/25 bg-surface-container-low p-3 text-xs text-on-surface-variant">
              Cette soumission est en lecture seule pour ton rôle.
            </div>
          {/if}
        </aside>
      </div>
    </div>
  </div>
{/if}

{#if deleteFeedModalOpen && pendingFeedDeletion}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-feed-title" tabindex="-1" onclick={closeDeleteFeedModal}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-panel max-w-md space-y-4" onclick={(e) => e.stopPropagation()}>
      <div>
        <p class="text-[10px] font-black uppercase tracking-[0.2em] text-red-500">Confirmation</p>
        <h3 id="delete-feed-title" class="mt-1 text-lg font-black text-on-surface">Supprimer ce flux RSS ?</h3>
        <p class="mt-2 text-sm text-on-surface-variant">
          Le flux <span class="font-bold text-on-surface">{pendingFeedDeletion.name}</span> sera supprimé de cette instance.
        </p>
      </div>
      <div class="flex items-center justify-end gap-2">
        <button
          onclick={closeDeleteFeedModal}
          class="px-4 py-2 rounded-xl border border-outline-variant/30 text-xs font-black uppercase tracking-[0.12em] text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
        >
          Annuler
        </button>
        <button
          onclick={confirmDeleteFeed}
          class="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-black uppercase tracking-[0.12em] hover:bg-red-700 transition-colors"
        >
          Supprimer
        </button>
      </div>
    </div>
  </div>
{/if}

{#if createDailyAlgoProblemModalOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="dailyalgo-create-title" tabindex="-1" onclick={closeDailyAlgoProblemModal}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-panel modal-panel-lg space-y-5" onclick={(e) => e.stopPropagation()}>
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Daily Algo</p>
          <h3 id="dailyalgo-create-title" class="mt-1 text-xl font-black text-on-surface">Ajouter un nouvel exercice</h3>
          <p class="mt-1 text-sm text-on-surface-variant">Complète les champs puis valide pour ajouter l'exercice dans la banque.</p>
        </div>
        <button
          type="button"
          onclick={closeDailyAlgoProblemModal}
          class="p-2 rounded-lg border border-outline-variant/30 text-on-surface-variant hover:text-on-surface"
          aria-label="Fermer"
        >
          <span class="material-symbols-outlined text-base">close</span>
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="space-y-2">
          <label for="modal-dailyalgo-title" class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Titre</label>
          <FormInput
            id="modal-dailyalgo-title"
            bind:value={algoDraft.title}
            className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/10 rounded-xl text-sm font-semibold outline-none focus:border-emerald-500/40"
            placeholder="Titre de l'exercice"
          />
        </div>
        <div class="space-y-2">
          <label for="modal-dailyalgo-difficulty" class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Difficulté</label>
          <select
            id="modal-dailyalgo-difficulty"
            bind:value={algoDraft.difficulty}
            class="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/10 rounded-xl text-sm font-semibold outline-none focus:border-emerald-500/40 text-on-surface appearance-none"
          >
            <option value="facile">Facile</option>
            <option value="moyen">Moyen</option>
            <option value="difficile">Difficile</option>
          </select>
        </div>
        <div class="space-y-2 md:col-span-2">
          <label for="modal-dailyalgo-description" class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Description (Markdown autorisé)</label>
          <textarea
            id="modal-dailyalgo-description"
            bind:value={algoDraft.description}
            class="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/10 rounded-xl text-sm font-mono outline-none focus:border-emerald-500/40 min-h-30"
            placeholder="Description du problème..."
          ></textarea>
        </div>
        <div class="space-y-2 md:col-span-2">
          <label for="modal-dailyalgo-solution" class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Solution attendue</label>
          <textarea
            id="modal-dailyalgo-solution"
            bind:value={algoDraft.solution}
            class="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/10 rounded-xl text-sm font-mono outline-none focus:border-emerald-500/40 min-h-30"
            placeholder="Code de la solution optimale..."
          ></textarea>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onclick={closeDailyAlgoProblemModal}
          class="px-4 py-2 rounded-xl border border-outline-variant/30 text-xs font-black uppercase tracking-[0.12em] text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
        >
          Annuler
        </button>
        <button
          type="button"
          onclick={submitDailyAlgoProblem}
          disabled={formAction.state.loading}
          class="px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-[0.12em] shadow-lg shadow-emerald-500/20 hover:bg-emerald-700"
        >
          {formAction.state.loading ? 'Ajout...' : 'Ajouter l\'exercice'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

  .dailyalgo-ide-overlay {
    inset: 0;
    padding: 0;
    align-items: stretch;
    justify-content: stretch;
    background: rgba(2, 6, 23, 0.72);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }

  .modal-panel-dailyalgo-ide {
    width: 100vw;
    height: 100vh;
    max-width: none;
    max-height: none;
    margin: 0;
    border-radius: 0;
    border: none;
    padding: 0;
    background: var(--background);
    color: var(--on-surface);
    overflow: hidden;
    box-shadow: none;
    display: flex;
    flex-direction: column;
  }

  .dailyalgo-ide-menubar {
    height: 44px;
    padding: 0 0.9rem;
    border-bottom: 1px solid var(--outline-variant);
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--surface-container-high) 84%, transparent),
      color-mix(in srgb, var(--surface-container-low) 92%, transparent)
    );
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }

  .dailyalgo-ide-window-controls {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .dailyalgo-ide-window-controls .dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--outline) 70%, black 30%);
  }

  .dailyalgo-ide-window-controls .dot.red { background: #f87171; }
  .dailyalgo-ide-window-controls .dot.amber { background: #fbbf24; }
  .dailyalgo-ide-window-controls .dot.green { background: #34d399; }

  .dailyalgo-ide-menubar-title {
    margin: 0;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-primary);
    flex: 1;
  }

  .dailyalgo-ide-close {
    width: 30px;
    height: 30px;
    border-radius: 0.5rem;
    border: 1px solid var(--outline-variant);
    color: var(--on-surface-variant);
    background: var(--surface-container-low);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .dailyalgo-ide-close:hover {
    color: var(--on-surface);
    border-color: color-mix(in srgb, var(--color-error) 45%, transparent);
    background: color-mix(in srgb, var(--color-error) 12%, transparent);
  }

  .dailyalgo-ide-modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.85rem 1rem 0.75rem;
    border-bottom: 1px solid var(--outline-variant);
    background: color-mix(in srgb, var(--surface-container-low) 78%, transparent);
  }

  .dailyalgo-ide-modal-eyebrow {
    margin: 0;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--color-primary);
  }

  .dailyalgo-ide-modal-header h3 {
    margin: 0.25rem 0 0;
    font-size: clamp(1rem, 1.45vw, 1.25rem);
    font-weight: 900;
    letter-spacing: -0.02em;
    color: var(--on-surface);
  }

  .dailyalgo-ide-modal-meta {
    margin-top: 0.5rem;
    display: flex;
    gap: 0.45rem;
    flex-wrap: wrap;
  }

  .dailyalgo-ide-chip {
    border-radius: 0.55rem;
    border: 1px solid var(--outline-variant);
    background: var(--surface-container-low);
    color: var(--on-surface-variant);
    padding: 0.25rem 0.5rem;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .dailyalgo-ide-modal-grid {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 350px;
    gap: 0.75rem;
    padding: 0.75rem;
    background:
      radial-gradient(circle at 15% 0%, color-mix(in srgb, var(--color-primary) 18%, transparent), transparent 35%),
      radial-gradient(circle at 85% 10%, color-mix(in srgb, var(--color-secondary) 12%, transparent), transparent 35%),
      var(--background);
  }

  .dailyalgo-ide-editor-pane {
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .dailyalgo-ide-context-strip {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.35rem;
    border: 1px solid var(--outline-variant);
    background: var(--surface-container-low);
    color: var(--on-surface-variant);
    border-radius: 0.75rem;
    padding: 0.45rem 0.6rem;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .dailyalgo-ide-context-strip .dot {
    opacity: 0.55;
  }

  .dailyalgo-ide-score-panel {
    border: 1px solid var(--outline-variant);
    background: color-mix(in srgb, var(--surface-container-lowest) 88%, transparent);
    border-radius: 0.9rem;
    padding: 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    overflow: auto;
  }

  .dailyalgo-ide-score-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  @media (max-width: 1500px) {
    .dailyalgo-ide-modal-grid {
      grid-template-columns: minmax(0, 1fr) 320px;
    }
  }

  @media (max-width: 1220px) {
    .dailyalgo-ide-modal-grid {
      grid-template-columns: minmax(0, 1fr) 320px;
    }
  }

  @media (max-width: 920px) {
    .dailyalgo-ide-modal-header {
      padding: 0.7rem 0.7rem 0.65rem;
    }

    .dailyalgo-ide-modal-grid {
      grid-template-columns: minmax(0, 1fr);
      padding: 0.55rem;
      gap: 0.55rem;
    }

    .dailyalgo-ide-score-panel {
      max-height: 42vh;
    }

    .dailyalgo-ide-chip {
      font-size: 9px;
      letter-spacing: 0.04em;
    }
  }
</style>
