<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import {
    API_BASE_URL,
    deleteFeed,
    updateFeed,
    updateYouTubeSettings,
    updateModuleStatus,
    fetchDailyAlgoProblems,
    createDailyAlgoProblem,
    updateDailyAlgoProblem,
    deleteDailyAlgoProblem,
    fetchDailyAlgoSchedule,
    ensureDailyAlgoSchedule,
    swapTodayDailyAlgoProblem,
    fetchMyApiKeys,
    createOrResetDailyAlgoApiKey,
    deleteMyApiKey,
    fetchTodayDailyAlgoSubmissions,
    fetchDailyAlgoSubmissionHistory,
    reviewDailyAlgoSubmission,
  } from '../lib/api';
  import { authStore } from '../lib/stores/auth.svelte';
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
  import Papicon from '../lib/components/Papicon.svelte';

  let { moduleId } = $props();

  const module = $derived(dashboardStore.state.modules.find(m => m.id === moduleId) || { 
    name: 'Chargement...', 
    description: 'Veuillez patienter...', 
    status: 'inactive' 
  });
  const moduleMeta = $derived(getModuleMeta(moduleId));
  const canManageSettings = $derived(!!dashboardStore.state.access?.canManageSettings);
  const canModerateContent = $derived(!!dashboardStore.state.access?.canModerateContent);
  const supportedDailyAlgoLanguages: IdeLanguage[] = ['javascript', 'typescript', 'python', 'c', 'lua', 'sqlite'];
  const dailyAlgoLanguageSuggestions = ['javascript', 'typescript', 'python', 'c', 'lua', 'sqlite', 'rust', 'go', 'java', 'php', 'ruby', 'c#'];

  type DailyAlgoFunctionArg = {
    name: string;
    type: string;
  };

  type DailyAlgoUnitTest = {
    name: string;
    args: unknown[];
    expected: unknown;
  };

  type DailyAlgoFunctionArgDraft = {
    id: string;
    name: string;
    type: string;
  };

  type DailyAlgoUnitTestDraft = {
    id: string;
    name: string;
    argValues: string[];
    expectedValue: string;
  };

  type DailyAlgoChallengeTypeKey =
    | 'time-complexity'
    | 'space-complexity'
    | 'code-golf'
    | 'absurd-constraints'
    | 'debug'
    | 'language-imposed'
    | 'classic';

  function createDraftId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function serializeDraftValue(value: unknown): string {
    if (typeof value === 'string') return JSON.stringify(value);
    if (value === undefined) return 'null';
    try {
      const serialized = JSON.stringify(value);
      return typeof serialized === 'string' ? serialized : 'null';
    } catch {
      return 'null';
    }
  }

  function createFunctionArgDraft(name = 'input', type = 'string'): DailyAlgoFunctionArgDraft {
    return {
      id: createDraftId('arg'),
      name,
      type,
    };
  }

  function createUnitTestDraft(argCount: number, name = 'Cas 1'): DailyAlgoUnitTestDraft {
    return {
      id: createDraftId('test'),
      name,
      argValues: Array.from({ length: argCount }, () => 'null'),
      expectedValue: 'null',
    };
  }

  function alignUnitTestsWithArgs(tests: DailyAlgoUnitTestDraft[], argCount: number): DailyAlgoUnitTestDraft[] {
    return tests.map((test) => {
      const nextArgs = [...test.argValues];
      if (nextArgs.length > argCount) {
        nextArgs.length = argCount;
      }
      while (nextArgs.length < argCount) {
        nextArgs.push('null');
      }
      return {
        ...test,
        argValues: nextArgs,
      };
    });
  }

  function normalizeEditableLanguageList(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const entry of raw) {
      if (typeof entry !== 'string') continue;
      const value = entry.trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push(value);
    }

    return normalized;
  }

  function parseDraftJsonValue(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { ok: false, error: 'Valeur vide' };
    }

    try {
      return { ok: true, value: JSON.parse(trimmed) };
    } catch {
      return { ok: true, value: trimmed };
    }
  }

  async function copyToClipboard(text: string, successMessage = 'Copié dans le presse-papiers.') {
    if (!text.trim()) {
      apiKeyAction.setError('Aucune valeur à copier.');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      apiKeyAction.setMessage(successMessage);
    } catch (error) {
      console.error(error);
      apiKeyAction.setError('Impossible de copier automatiquement. Copiez manuellement.');
    }
  }

  function openDailyAlgoApiModal() {
    dailyAlgoApiModalOpen = true;
  }

  function closeDailyAlgoApiModal() {
    dailyAlgoApiModalOpen = false;
  }

  let youtubeReferenceChannelId = $state('');
  let desiredModuleStatus = $state('inactive');
  let deleteFeedModalOpen = $state(false);
  let createDailyAlgoProblemModalOpen = $state(false);
  let editingDailyAlgoProblemId = $state<string | null>(null);
  let pendingFeedDeletion = $state<{ id: string; name: string } | null>(null);
  const formAction = createAsyncActionState();
  const apiKeyAction = createAsyncActionState();

  // Daily Algo state
  let dailyAlgoProblems = $state<any[]>([]);
  let dailyAlgoToday = $state<any | null>(null);
  let isFetchingAlgo = $state(false);
  let isFetchingAlgoSubmissions = $state(false);
  let isFetchingAlgoHistory = $state(false);
  let isFetchingAlgoSchedule = $state(false);
  let isEnsuringAlgoSchedule = $state(false);
  let dailyAlgoHistory = $state<any[]>([]);
  let dailyAlgoSchedule = $state<any[]>([]);
  let myApiKeys = $state<any[]>([]);
  let dailyAlgoApiKeyName = $state('Kotbo Daily Algo');
  let latestIssuedApiKey = $state('');
  let isFetchingApiKeys = $state(false);
  let dailyAlgoApiModalOpen = $state(false);
  let dailyAlgoSubmissionStatusFilter = $state<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  let dailyAlgoLibrarySearch = $state('');
  let dailyAlgoLibraryMode = $state<'ALL' | 'AVAILABLE' | 'USED'>('ALL');
  let switchingTodayProblemId = $state<string | null>(null);
  let deletingDailyAlgoProblemId = $state<string | null>(null);
  let ideFocusedSubmissionId = $state<string | null>(null);
  let ideModalOpen = $state(false);
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
    difficulty: 'moyen',
    language: 'fr',
    functionName: '',
    allowedLanguages: [] as string[],
    languageInput: '',
    functionArgs: [createFunctionArgDraft('input', 'string')] as DailyAlgoFunctionArgDraft[],
    unitTests: [createUnitTestDraft(1, 'Cas 1')] as DailyAlgoUnitTestDraft[],
  });

  onMount(async () => {
    await dashboardStore.refresh();
    if (moduleId === 'youtube') {
      youtubeReferenceChannelId = dashboardStore.state.youtubeReferenceChannelId || '';
    } else if (moduleId === 'dailyalgo') {
      await Promise.all([loadDailyAlgoProblems(), loadTodayDailyAlgoSubmissions(), loadDailyAlgoHistory(), loadDailyAlgoSchedule(), loadMyApiKeys()]);
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

  async function loadDailyAlgoSchedule() {
    isFetchingAlgoSchedule = true;
    try {
      if (canManageSettings) {
        isEnsuringAlgoSchedule = true;
        try {
          await ensureDailyAlgoSchedule(21);
        } finally {
          isEnsuringAlgoSchedule = false;
        }
      }
      const payload = await fetchDailyAlgoSchedule(7, 21);
      dailyAlgoSchedule = Array.isArray(payload?.runs) ? payload.runs : [];
    } catch (err) {
      console.error(err);
      formAction.setError('Erreur lors du chargement du planning Daily Algo.');
    } finally {
      isEnsuringAlgoSchedule = false;
      isFetchingAlgoSchedule = false;
    }
  }

  async function loadMyApiKeys() {
    isFetchingApiKeys = true;
    try {
      const payload = await fetchMyApiKeys();
      myApiKeys = Array.isArray(payload?.keys) ? payload.keys : [];
    } catch (err) {
      console.error(err);
      apiKeyAction.setError('Erreur lors du chargement de votre clé API.');
    } finally {
      isFetchingApiKeys = false;
    }
  }

  async function createOrResetMyApiKey() {
    if (!canManageSettings) {
      apiKeyAction.setError('Seuls les administrateurs peuvent gérer cette clé API.');
      return;
    }

    await apiKeyAction.run(
      async () => {
        const payload = await createOrResetDailyAlgoApiKey(dailyAlgoApiKeyName.trim() || 'Kotbo Daily Algo');
        const fullKey = typeof payload?.fullKey === 'string' ? payload.fullKey.trim() : '';
        latestIssuedApiKey = fullKey;
        await loadMyApiKeys();
        return Boolean(fullKey);
      },
      {
        successMessage: 'Clé API créée/réinitialisée. Copiez-la maintenant (elle ne sera plus visible ensuite).',
        failureMessage: 'Impossible de créer/réinitialiser la clé API.',
      }
    );
  }

  async function deleteCurrentApiKey(keyId: string) {
    if (!canManageSettings) {
      apiKeyAction.setError('Seuls les administrateurs peuvent gérer cette clé API.');
      return;
    }

    await apiKeyAction.run(
      async () => {
        const ok = await deleteMyApiKey(keyId);
        if (!ok) return false;
        latestIssuedApiKey = '';
        await loadMyApiKeys();
        return true;
      },
      {
        successMessage: 'Clé API désactivée.',
        failureMessage: 'Impossible de désactiver la clé API.',
      }
    );
  }

  function resetDailyAlgoDraft() {
    algoDraft = {
      title: '',
      description: '',
      difficulty: 'moyen',
      language: 'fr',
      functionName: '',
      allowedLanguages: [],
      languageInput: '',
      functionArgs: [createFunctionArgDraft('input', 'string')],
      unitTests: [createUnitTestDraft(1, 'Cas 1')],
    };
  }

  function openDailyAlgoProblemModal() {
    if (!canManageSettings) {
      formAction.setError('Seuls les administrateurs peuvent ajouter un exercice.');
      return;
    }

    editingDailyAlgoProblemId = null;
    resetDailyAlgoDraft();
    createDailyAlgoProblemModalOpen = true;
  }

  function openDailyAlgoProblemEditModal(problem: any) {
    if (!canManageSettings) {
      formAction.setError('Seuls les administrateurs peuvent modifier un exercice.');
      return;
    }

    const functionArgs = Array.isArray(problem?.functionArgs)
      ? problem.functionArgs
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const candidate = entry as { name?: unknown; type?: unknown };
          const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
          const type = typeof candidate.type === 'string' ? candidate.type.trim() : '';
          if (!name) return null;
          return createFunctionArgDraft(name, type || 'unknown');
        })
        .filter((entry): entry is DailyAlgoFunctionArgDraft => Boolean(entry))
      : [];

    const argsCount = functionArgs.length;
    const unitTests = Array.isArray(problem?.unitTests)
      ? problem.unitTests
        .map((entry, index) => {
          if (!entry || typeof entry !== 'object') return null;
          const candidate = entry as { name?: unknown; args?: unknown[]; expected?: unknown };
          const args = Array.isArray(candidate.args) ? candidate.args : [];
          const name = typeof candidate.name === 'string' ? candidate.name.trim() : `Cas ${index + 1}`;

          return {
            id: createDraftId('test'),
            name: name || `Cas ${index + 1}`,
            argValues: Array.from({ length: argsCount }, (_, argIndex) => serializeDraftValue(args[argIndex])),
            expectedValue: serializeDraftValue(candidate.expected),
          } as DailyAlgoUnitTestDraft;
        })
        .filter((entry): entry is DailyAlgoUnitTestDraft => Boolean(entry))
      : [];

    editingDailyAlgoProblemId = problem.id;
    algoDraft = {
      title: typeof problem?.title === 'string' ? problem.title : '',
      description: typeof problem?.description === 'string' ? problem.description : '',
      difficulty: typeof problem?.difficulty === 'string' ? problem.difficulty : 'moyen',
      language: typeof problem?.language === 'string' ? problem.language : 'fr',
      functionName: typeof problem?.functionName === 'string' ? problem.functionName : '',
      allowedLanguages: normalizeEditableLanguageList(problem?.allowedLanguages),
      languageInput: '',
      functionArgs,
      unitTests: unitTests.length > 0 ? alignUnitTestsWithArgs(unitTests, argsCount) : [createUnitTestDraft(argsCount, 'Cas 1')],
    };
    createDailyAlgoProblemModalOpen = true;
  }

  function closeDailyAlgoProblemModal() {
    createDailyAlgoProblemModalOpen = false;
    editingDailyAlgoProblemId = null;
    resetDailyAlgoDraft();
  }

  function addDraftAllowedLanguage() {
    const value = algoDraft.languageInput.trim();
    if (!value) return;

    const exists = algoDraft.allowedLanguages.some((entry) => entry.toLowerCase() === value.toLowerCase());
    if (!exists) {
      algoDraft.allowedLanguages = [...algoDraft.allowedLanguages, value];
    }
    algoDraft.languageInput = '';
  }

  function addSuggestedLanguage(language: string) {
    const value = language.trim();
    if (!value) return;
    const exists = algoDraft.allowedLanguages.some((entry) => entry.toLowerCase() === value.toLowerCase());
    if (!exists) {
      algoDraft.allowedLanguages = [...algoDraft.allowedLanguages, value];
    }
  }

  function removeDraftAllowedLanguage(language: string) {
    algoDraft.allowedLanguages = algoDraft.allowedLanguages.filter((entry) => entry !== language);
  }

  function enableFreeLanguageMode() {
    algoDraft.allowedLanguages = [];
    algoDraft.languageInput = '';
  }

  function handleLanguageInputKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addDraftAllowedLanguage();
  }

  function addFunctionArg() {
    const nextArgs = [...algoDraft.functionArgs, createFunctionArgDraft(`arg${algoDraft.functionArgs.length + 1}`, 'unknown')];
    algoDraft.functionArgs = nextArgs;
    algoDraft.unitTests = alignUnitTestsWithArgs(algoDraft.unitTests, nextArgs.length);
  }

  function removeFunctionArg(index: number) {
    if (index < 0 || index >= algoDraft.functionArgs.length) return;
    const nextArgs = algoDraft.functionArgs.filter((_, argIndex) => argIndex !== index);
    algoDraft.functionArgs = nextArgs;
    algoDraft.unitTests = alignUnitTestsWithArgs(algoDraft.unitTests, nextArgs.length);
  }

  function updateFunctionArgName(index: number, value: string) {
    const nextArgs = [...algoDraft.functionArgs];
    if (!nextArgs[index]) return;
    nextArgs[index] = {
      ...nextArgs[index],
      name: value,
    };
    algoDraft.functionArgs = nextArgs;
  }

  function updateFunctionArgType(index: number, value: string) {
    const nextArgs = [...algoDraft.functionArgs];
    if (!nextArgs[index]) return;
    nextArgs[index] = {
      ...nextArgs[index],
      type: value,
    };
    algoDraft.functionArgs = nextArgs;
  }

  function addUnitTest() {
    algoDraft.unitTests = [
      ...algoDraft.unitTests,
      createUnitTestDraft(algoDraft.functionArgs.length, `Cas ${algoDraft.unitTests.length + 1}`),
    ];
  }

  function removeUnitTest(index: number) {
    if (index < 0 || index >= algoDraft.unitTests.length) return;
    algoDraft.unitTests = algoDraft.unitTests.filter((_, testIndex) => testIndex !== index);
  }

  function updateUnitTestName(index: number, value: string) {
    const nextTests = [...algoDraft.unitTests];
    if (!nextTests[index]) return;
    nextTests[index] = {
      ...nextTests[index],
      name: value,
    };
    algoDraft.unitTests = nextTests;
  }

  function updateUnitTestArgValue(testIndex: number, argIndex: number, value: string) {
    const nextTests = [...algoDraft.unitTests];
    const target = nextTests[testIndex];
    if (!target) return;
    const nextArgs = [...target.argValues];
    nextArgs[argIndex] = value;
    nextTests[testIndex] = {
      ...target,
      argValues: nextArgs,
    };
    algoDraft.unitTests = nextTests;
  }

  function updateUnitTestExpectedValue(index: number, value: string) {
    const nextTests = [...algoDraft.unitTests];
    if (!nextTests[index]) return;
    nextTests[index] = {
      ...nextTests[index],
      expectedValue: value,
    };
    algoDraft.unitTests = nextTests;
  }

  async function submitDailyAlgoProblem() {
    if (!canManageSettings) {
      formAction.setError('Seuls les administrateurs peuvent ajouter un algo.');
      return;
    }

    if (!algoDraft.title.trim() || !algoDraft.description.trim()) {
      formAction.setError('Titre et description sont obligatoires.');
      return;
    }

    if (!algoDraft.functionName.trim()) {
      formAction.setError('Le nom de la fonction est obligatoire.');
      return;
    }

    const functionArgs = algoDraft.functionArgs
      .map((entry) => ({
        name: entry.name.trim(),
        type: entry.type.trim() || 'unknown',
      }))
      .filter((entry) => entry.name.length > 0);

    const duplicatedArg = functionArgs.find(
      (arg, index) => functionArgs.findIndex((candidate) => candidate.name.toLowerCase() === arg.name.toLowerCase()) !== index,
    );
    if (duplicatedArg) {
      formAction.setError(`Nom d'argument dupliqué: ${duplicatedArg.name}`);
      return;
    }

    if (algoDraft.unitTests.length === 0) {
      formAction.setError('Ajoute au moins un test unitaire.');
      return;
    }

    const unitTests: DailyAlgoUnitTest[] = [];
    for (let testIndex = 0; testIndex < algoDraft.unitTests.length; testIndex += 1) {
      const draftTest = algoDraft.unitTests[testIndex];
      if (draftTest.argValues.length !== functionArgs.length) {
        formAction.setError(`Le test ${testIndex + 1} n'a pas le bon nombre d'arguments.`);
        return;
      }

      const args: unknown[] = [];
      for (let argIndex = 0; argIndex < draftTest.argValues.length; argIndex += 1) {
        const parsed = parseDraftJsonValue(draftTest.argValues[argIndex] ?? '');
        if (!parsed.ok) {
          formAction.setError(`Argument ${argIndex + 1} du test ${testIndex + 1}: ${parsed.error}`);
          return;
        }
        args.push(parsed.value);
      }

      const parsedExpected = parseDraftJsonValue(draftTest.expectedValue ?? '');
      if (!parsedExpected.ok) {
        formAction.setError(`Valeur attendue du test ${testIndex + 1}: ${parsedExpected.error}`);
        return;
      }

      unitTests.push({
        name: draftTest.name.trim() || `Test ${testIndex + 1}`,
        args,
        expected: parsedExpected.value,
      });
    }

    const allowedLanguages = normalizeEditableLanguageList(algoDraft.allowedLanguages);

    const payload = {
      title: algoDraft.title.trim(),
      description: algoDraft.description.trim(),
      difficulty: algoDraft.difficulty,
      language: algoDraft.language || 'fr',
      functionName: algoDraft.functionName.trim(),
      functionArgs,
      unitTests,
      allowedLanguages,
      solution: '',
    };

    const isEdition = Boolean(editingDailyAlgoProblemId);

    await formAction.run(
      async () => {
        const ok = isEdition
          ? await updateDailyAlgoProblem(editingDailyAlgoProblemId, payload)
          : await createDailyAlgoProblem(payload);
        if (!ok) return false;

        resetDailyAlgoDraft();
        editingDailyAlgoProblemId = null;
        createDailyAlgoProblemModalOpen = false;
        await Promise.all([loadDailyAlgoProblems(), loadTodayDailyAlgoSubmissions(), loadDailyAlgoSchedule()]);
        return true;
      },
      {
        successMessage: isEdition
          ? 'Exercice mis à jour (message Discord du jour rafraîchi si concerné).'
          : 'Exercice algorithmique ajouté avec succès.',
        failureMessage: isEdition
          ? 'Erreur lors de la mise à jour de l’exercice.'
          : 'Erreur lors de l’ajout de l’exercice.'
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
  }

  function closeIntegratedIde() {
    ideModalOpen = false;
    ideFocusedSubmissionId = null;
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

  async function setProblemAsToday(problemId: string) {
    if (!canManageSettings) {
      formAction.setError('Seuls les administrateurs peuvent changer l’exercice du jour.');
      return;
    }

    switchingTodayProblemId = problemId;
    try {
      await formAction.run(
        async () => {
          const payload = await swapTodayDailyAlgoProblem(problemId);
          if (!payload?.ok) return false;

          await Promise.all([
            loadTodayDailyAlgoSubmissions(),
            loadDailyAlgoProblems(),
            loadDailyAlgoHistory(),
            loadDailyAlgoSchedule(),
            dashboardStore.refresh(),
          ]);
          return true;
        },
        {
          successMessage: 'Exercice du jour mis à jour.',
          failureMessage: 'Impossible de changer l’exercice du jour.',
        },
      );
    } finally {
      switchingTodayProblemId = null;
    }
  }

  async function deleteDailyAlgoProblemFromLibrary(problem: any) {
    if (!canManageSettings) {
      formAction.setError('Seuls les administrateurs peuvent supprimer un exercice.');
      return;
    }

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`Supprimer définitivement "${problem.title}" ?`);
      if (!confirmed) return;
    }

    deletingDailyAlgoProblemId = problem.id;
    try {
      await formAction.run(
        async () => {
          const payload = await deleteDailyAlgoProblem(problem.id);
          if (!payload?.ok) return false;

          if (editingDailyAlgoProblemId === problem.id) {
            closeDailyAlgoProblemModal();
          }

          await Promise.all([
            loadDailyAlgoProblems(),
            loadTodayDailyAlgoSubmissions(),
            loadDailyAlgoHistory(),
            loadDailyAlgoSchedule(),
            dashboardStore.refresh(),
          ]);
          return true;
        },
        {
          successMessage: 'Exercice supprimé.',
          failureMessage: 'Impossible de supprimer cet exercice.',
        },
      );
    } finally {
      deletingDailyAlgoProblemId = null;
    }
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
    if (typeof window === 'undefined') return;
    if (!dailyAlgoApiModalOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDailyAlgoApiModal();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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

  function dailyAlgoDateKeyFromDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function dailyAlgoDetectChallengeTypeKey(title: string, description: string): DailyAlgoChallengeTypeKey {
    const text = `${title ?? ''} ${description ?? ''}`.toLowerCase();

    if (/débog|debug|corrig|fix|bug/.test(text)) return 'debug';
    if (/complexité|o\(n|o\(log|temps d'exécution|runtime/.test(text)) return 'time-complexity';
    if (/mémoire|espace|space complexity|in-place|sans allocation/.test(text)) return 'space-complexity';
    if (/plus court|code golf|minimum de caractères|moins de caractères/.test(text)) return 'code-golf';
    if (/obligatoirement|en python|en rust|en javascript|en go|en typescript|en c\+\+|en c#|en sql|en bash|langage/.test(text)) {
      return 'language-imposed';
    }
    if (/sans la lettre|interdit|absurde|contraintes absurdes|uniquement|sans utiliser/.test(text)) return 'absurd-constraints';
    return 'classic';
  }

  function dailyAlgoChallengeTypeLabel(type: DailyAlgoChallengeTypeKey): string {
    if (type === 'debug') return 'Débogage';
    if (type === 'time-complexity') return 'Complexité temps';
    if (type === 'space-complexity') return 'Complexité mémoire';
    if (type === 'code-golf') return 'Code golf';
    if (type === 'language-imposed') return 'Langage imposé';
    if (type === 'absurd-constraints') return 'Contraintes';
    return 'Classique';
  }

  function dailyAlgoProblemFunctionSignature(problem: any) {
    const functionName = typeof problem?.functionName === 'string' && problem.functionName.trim()
      ? problem.functionName.trim()
      : 'solve';

    const args = Array.isArray(problem?.functionArgs)
      ? problem.functionArgs
        .filter((entry) => entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string')
        .map((entry) => {
          const candidate = entry as { name?: string; type?: string };
          return `${candidate.name}${candidate.type ? `: ${candidate.type}` : ''}`;
        })
      : [];

    return `${functionName}(${args.join(', ')})`;
  }

  function toKnownIdeLanguage(input: string): IdeLanguage | null {
    const normalized = input.trim().toLowerCase();
    if (normalized === 'javascript' || normalized === 'js') return 'javascript';
    if (normalized === 'typescript' || normalized === 'ts') return 'typescript';
    if (normalized === 'python' || normalized === 'py') return 'python';
    if (normalized === 'c' || normalized === 'cpp' || normalized === 'c++') return 'c';
    if (normalized === 'lua') return 'lua';
    if (normalized === 'sqlite' || normalized === 'sql') return 'sqlite';
    return null;
  }

  function dailyAlgoProblemAllowedLanguages(problem: any): string[] {
    const raw = Array.isArray(problem?.allowedLanguages) ? problem.allowedLanguages : [];
    return normalizeEditableLanguageList(raw);
  }

  function dailyAlgoProblemAllowedIdeLanguages(problem: any): IdeLanguage[] {
    const raw = dailyAlgoProblemAllowedLanguages(problem);
    const known = raw
      .map((entry) => toKnownIdeLanguage(entry))
      .filter((entry): entry is IdeLanguage => Boolean(entry))
      .filter((value, index, array) => supportedDailyAlgoLanguages.includes(value) && array.indexOf(value) === index);

    return known;
  }

  const selectedGuildId = $derived(authStore.selectedGuildId ?? '');
  const publicApiBaseUrl = $derived.by(() => {
    const fromEnv = typeof API_BASE_URL === 'string' ? API_BASE_URL.trim() : '';
    if (fromEnv) return `${fromEnv}/api/public`;
    if (typeof window !== 'undefined') return `${window.location.origin}/api/public`;
    return '/api/public';
  });
  const dailyAlgoPublicApiProblemsUrl = $derived.by(() => {
    if (!selectedGuildId) return '';
    return `${publicApiBaseUrl}/guilds/${selectedGuildId}/daily-algo-problems`;
  });
  const currentApiKey = $derived(myApiKeys.length > 0 ? myApiKeys[0] : null);
  const apiDocPayloadExample = $derived('{"title":"Somme","description":"Retourner a+b","difficulty":"facile","language":"fr","functionName":"solve","functionArgs":[{"name":"a","type":"number"},{"name":"b","type":"number"}],"unitTests":[{"name":"Cas 1","args":[1,2],"expected":3}],"allowedLanguages":["javascript","python"],"solution":""}');
  const apiDocGetCurl = $derived.by(() => {
    if (!dailyAlgoPublicApiProblemsUrl) return 'Sélectionnez une guilde pour générer les commandes.';
    return `curl -H "X-API-Key: kb_..." "${dailyAlgoPublicApiProblemsUrl}"`;
  });
  const apiDocPostCurl = $derived.by(() => {
    if (!dailyAlgoPublicApiProblemsUrl) return 'Sélectionnez une guilde pour générer les commandes.';
    return `curl -X POST "${dailyAlgoPublicApiProblemsUrl}" \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: kb_..." \\\n  -d '${apiDocPayloadExample}'`;
  });
  const apiDocPatchCurl = $derived.by(() => {
    if (!dailyAlgoPublicApiProblemsUrl) return 'Sélectionnez une guilde pour générer les commandes.';
    return `curl -X PATCH "${dailyAlgoPublicApiProblemsUrl}/PROBLEM_ID" \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: kb_..." \\\n  -d '${apiDocPayloadExample}'`;
  });

  const todayDateKey = $derived.by(() => dailyAlgoDateKeyFromDate(new Date()));
  const todayRunProblemId = $derived.by(() => {
    const problemId = dailyAlgoToday?.run?.problem?.id;
    return typeof problemId === 'string' && problemId.trim() ? problemId : null;
  });

  const dailyAlgoScheduleRuns = $derived.by(() => {
    const runs = Array.isArray(dailyAlgoSchedule) ? [...dailyAlgoSchedule] : [];
    return runs
      .filter((run) => typeof run?.dateKey === 'string' && run.dateKey.trim().length > 0)
      .sort((left, right) => String(left.dateKey).localeCompare(String(right.dateKey)))
      .map((run) => {
        const dateKey = String(run.dateKey);
        const status = dateKey < todayDateKey
          ? 'past'
          : dateKey > todayDateKey
            ? 'future'
            : 'today';

        return {
          ...run,
          dateKey,
          status,
          challengeType: dailyAlgoDetectChallengeTypeKey(
            run?.problem?.title ?? '',
            run?.problem?.description ?? '',
          ),
        };
      });
  });

  const dailyAlgoUpcomingRuns = $derived.by(() => dailyAlgoScheduleRuns.filter((run) => run.status !== 'past'));
  const dailyAlgoFutureRunsCount = $derived.by(() => dailyAlgoScheduleRuns.filter((run) => run.status === 'future').length);

  const dailyAlgoScheduleDateByProblemId = $derived.by(() => {
    const entries = dailyAlgoScheduleRuns
      .filter((run) => typeof run?.problem?.id === 'string' && run.problem.id.trim())
      .map((run) => [run.problem.id as string, run.dateKey as string] as const);
    return Object.fromEntries(entries);
  });

  function dailyAlgoPlannedDateForProblem(problemId: string): string | null {
    return dailyAlgoScheduleDateByProblemId[problemId] ?? null;
  }

  const filteredDailyAlgoLibrary = $derived.by(() => {
    const query = dailyAlgoLibrarySearch.trim().toLowerCase();
    const filtered = [...dailyAlgoProblems].filter((problem) => {
      if (dailyAlgoLibraryMode === 'AVAILABLE' && problem?.usedAt) return false;
      if (dailyAlgoLibraryMode === 'USED' && !problem?.usedAt) return false;

      if (!query) return true;

      const haystack = [
        problem?.title ?? '',
        problem?.description ?? '',
        problem?.difficulty ?? '',
        dailyAlgoProblemFunctionSignature(problem),
        ...(dailyAlgoProblemAllowedLanguages(problem) ?? []),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });

    return filtered.sort((left, right) => {
      const leftUsed = Boolean(left?.usedAt);
      const rightUsed = Boolean(right?.usedAt);
      if (leftUsed !== rightUsed) return leftUsed ? 1 : -1;

      if (!leftUsed) {
        const leftPlanned = dailyAlgoScheduleDateByProblemId[left.id] ?? '9999-99-99';
        const rightPlanned = dailyAlgoScheduleDateByProblemId[right.id] ?? '9999-99-99';
        if (leftPlanned !== rightPlanned) return leftPlanned.localeCompare(rightPlanned);
      } else {
        const leftUsedAt = left?.usedAt ? new Date(left.usedAt).getTime() : 0;
        const rightUsedAt = right?.usedAt ? new Date(right.usedAt).getTime() : 0;
        if (leftUsedAt !== rightUsedAt) return rightUsedAt - leftUsedAt;
      }

      const leftCreatedAt = left?.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightCreatedAt = right?.createdAt ? new Date(right.createdAt).getTime() : 0;
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
    <Papicon icon="chevron_right" size={14} class="text-slate-400 opacity-30" />
    <span class="text-[10px] font-black text-primary uppercase tracking-[0.25em]">{module.name}</span>
  </div>

  
  <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 pb-8 border-b border-outline-variant/20">
    <div class="flex items-center gap-6">
      <div class="w-16 h-16 rounded-[1.75rem] {moduleMeta.headerToneClasses} flex items-center justify-center shadow-inner border group hover:rotate-6 transition-transform">
        <Papicon icon={moduleMeta.icon} size={30} />
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
                  <Papicon icon="search" size={18} class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/40" />
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
                      <Papicon icon="rss_feed" size={24} />
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
                      <Papicon icon="edit" size={18} />
                    </button>
                    <button 
                      onclick={() => openDeleteFeedModal(feed)}
                      disabled={!canManageSettings}
                      class="p-3 text-on-surface-variant/20 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                      title="Supprimer le flux"
                    >
                      <Papicon icon="delete" size={18} />
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
                <Papicon icon="rss_feed" size={60} class="mb-6" />
                <p class="text-[10px] font-black uppercase tracking-[0.3em]">Aucun flux n'est encore lié à cette instance</p>
              </div>
            {:else if filteredFeeds.length === 0}
              <div class="p-14 text-center premium-card rounded-[3rem] border-dashed border-2 opacity-55 flex flex-col items-center">
                <Papicon icon="filter_alt_off" size={50} class="mb-4" />
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
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 class="text-xl font-black tracking-tight flex items-center gap-4">
                <div class="w-1.5 h-8 bg-emerald-500 rounded-full"></div>
                Daily Algo Control Room
              </h3>
              <p class="mt-2 text-xs text-on-surface-variant">
                Vue centrée sur le quotidien: exo du jour, modération des soumissions, calendrier confirmé et banque d'exercices.
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <RefreshButton
                onClick={() => Promise.all([loadTodayDailyAlgoSubmissions(), loadDailyAlgoProblems(), loadDailyAlgoHistory(), loadDailyAlgoSchedule(), loadMyApiKeys()])}
                loading={isFetchingAlgoSubmissions || isFetchingAlgo || isFetchingAlgoHistory || isFetchingAlgoSchedule || isEnsuringAlgoSchedule || isFetchingApiKeys}
                label="Tout rafraîchir"
                className="px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/20 text-on-surface-variant"
                iconClass="text-sm"
              />
              <button
                type="button"
                onclick={openDailyAlgoApiModal}
                class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-outline-variant/30 bg-surface-container-low text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
              >
                <Papicon icon="key" size={14} />
                API Externe
              </button>
              {#if canManageSettings}
                <button
                  type="button"
                  onclick={openDailyAlgoProblemModal}
                  class="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-[0.12em] shadow-lg shadow-emerald-500/20 hover:bg-emerald-700"
                >
                  Ajouter un exercice
                </button>
              {/if}
            </div>
          </div>

          <div class="premium-card rounded-[2.5rem] p-6 md:p-7 bg-gradient-to-br from-emerald-500/10 via-surface to-sky-500/10 border border-emerald-500/15">
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
              <div class="rounded-2xl bg-sky-500/10 border border-sky-500/20 p-4">
                <p class="text-[9px] uppercase tracking-[0.2em] font-black text-sky-700/80">Dates sûres</p>
                <p class="text-2xl font-black text-sky-700 mt-1">{dailyAlgoFutureRunsCount}</p>
              </div>
            </div>
          </div>

          <div class="premium-card p-8 rounded-[2.5rem] space-y-6">
            <div class="flex items-center justify-between gap-4">
              <h4 class="text-lg font-black text-on-surface">1) Défi du jour & validation des soumissions</h4>
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
              <div class="rounded-2xl bg-surface-container-low border border-outline-variant/15 p-4">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60">Défi en cours</p>
                  <span class="px-2 py-1 rounded-md border border-outline-variant/25 bg-surface text-[10px] font-black uppercase tracking-[0.08em] text-on-surface-variant">
                    {dailyAlgoChallengeTypeLabel(dailyAlgoDetectChallengeTypeKey(dailyAlgoToday.run.problem.title, dailyAlgoToday.run.problem.description))}
                  </span>
                </div>
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
                                <p class="mt-1 text-[10px] text-on-surface-variant">
                                  Rang #{submission.speedRank}
                                  {#if (submission.speedBonusPoints ?? 0) > 0}
                                    (+{submission.speedBonusPoints})
                                  {/if}
                                </p>
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
            <h4 class="text-lg font-black text-on-surface">2) + 3) Calendrier réel & banque d'exercices fusionnés</h4>

            <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
              <div class="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4 space-y-4">
                <div class="flex items-center justify-between gap-2">
                  <p class="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60">Mini calendrier confirmé (dates réelles)</p>
                  <span class="text-[10px] font-bold text-on-surface-variant">{dailyAlgoUpcomingRuns.length} date(s) affichée(s)</span>
                </div>
                {#if isFetchingAlgoSchedule || isEnsuringAlgoSchedule}
                  <div class="rounded-xl border border-outline-variant/20 bg-surface px-3 py-3 text-xs text-on-surface-variant animate-pulse">
                    Chargement du planning confirmé...
                  </div>
                {:else if dailyAlgoUpcomingRuns.length === 0}
                  <div class="rounded-xl border border-outline-variant/20 bg-surface px-3 py-3 text-xs text-on-surface-variant">
                    Aucune date future n'est programmée pour l'instant. Utilise “Mettre aujourd'hui” pour fixer l'exercice du jour.
                  </div>
                {:else}
                  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {#each dailyAlgoUpcomingRuns.slice(0, 14) as run}
                      <article class="rounded-xl border border-outline-variant/25 bg-surface px-3 py-3 space-y-1">
                        <div class="flex items-center justify-between gap-2">
                          <p class="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant">
                            {historyDateLabel(run.dateKey)}
                          </p>
                          <span class="px-2 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-[0.08em] {run.status === 'today'
                            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700'
                            : 'border-sky-500/25 bg-sky-500/10 text-sky-700'}">
                            {run.status === 'today' ? "Aujourd'hui" : 'Programmé'}
                          </span>
                        </div>
                        <p class="text-sm font-black text-on-surface line-clamp-1">{run.problem?.title ?? 'Exercice inconnu'}</p>
                        <div class="flex flex-wrap items-center gap-1.5">
                          <span class="px-2 py-0.5 rounded-md border border-outline-variant/20 bg-surface-container-low text-[10px] font-black uppercase tracking-[0.08em] text-on-surface-variant">
                            {difficultyLabel(run.problem?.difficulty ?? 'moyen')}
                          </span>
                          <span class="px-2 py-0.5 rounded-md border border-sky-500/25 bg-sky-500/10 text-[10px] font-black uppercase tracking-[0.08em] text-sky-700">
                            {dailyAlgoChallengeTypeLabel(run.challengeType)}
                          </span>
                          <span class="px-2 py-0.5 rounded-md border border-outline-variant/20 bg-surface-container-low text-[10px] font-black uppercase tracking-[0.08em] text-on-surface-variant">
                            {run.submissionsCount ?? 0} soum.
                          </span>
                        </div>
                      </article>
                    {/each}
                  </div>
                {/if}
              </div>

              <div class="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4 space-y-3">
                <p class="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60">Historique récent</p>
                {#if dailyAlgoHistory.length === 0}
                  <p class="text-xs text-on-surface-variant">Aucun run historique pour le moment.</p>
                {:else}
                  <div class="space-y-2 max-h-72 overflow-auto pr-1">
                    {#each dailyAlgoHistory.slice(0, 8) as run}
                      <div class="rounded-lg border border-outline-variant/20 bg-surface px-3 py-2">
                        <p class="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant">{historyDateLabel(run.dateKey)}</p>
                        <p class="text-xs font-bold text-on-surface line-clamp-1 mt-0.5">{run.problem.title}</p>
                        <p class="text-[10px] text-on-surface-variant mt-1">Total: {run.stats.total} · Validées: {run.stats.approved} · Rejetées: {run.stats.rejected}</p>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>

            <div class="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4 space-y-4">
              <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div class="flex flex-wrap items-center gap-2">
                  {#each [
                    { value: 'ALL', label: 'Tous' },
                    { value: 'AVAILABLE', label: 'Disponibles' },
                    { value: 'USED', label: 'Déjà joués' },
                  ] as mode}
                    <button
                      type="button"
                      onclick={() => (dailyAlgoLibraryMode = mode.value as 'ALL' | 'AVAILABLE' | 'USED')}
                      class="px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-[0.12em] transition-colors {dailyAlgoLibraryMode === mode.value
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface text-on-surface-variant border-outline-variant/30 hover:text-on-surface'}"
                    >
                      {mode.label}
                    </button>
                  {/each}
                </div>
                <input
                  type="search"
                  bind:value={dailyAlgoLibrarySearch}
                  placeholder="Rechercher un exo, une signature, un langage..."
                  class="w-full lg:max-w-lg rounded-xl border border-outline-variant/30 bg-surface px-4 py-2 text-sm text-on-surface outline-none focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
                />
              </div>

              {#if isFetchingAlgo}
                <div class="p-8 text-center text-sm font-bold text-on-surface-variant/50 animate-pulse">
                  Chargement des exercices...
                </div>
              {:else if filteredDailyAlgoLibrary.length === 0}
                <div class="p-8 rounded-xl border border-outline-variant/20 bg-surface text-sm text-on-surface-variant">
                  Aucun exercice ne correspond au filtre actuel.
                </div>
              {:else}
                <div class="overflow-x-auto rounded-2xl border border-outline-variant/15 bg-surface">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th class="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant">Date réelle</th>
                        <th class="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant">Exercice</th>
                        <th class="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant">Difficulté</th>
                        <th class="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant">Type</th>
                        <th class="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant">Langages</th>
                        <th class="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant">Tests</th>
                        <th class="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each filteredDailyAlgoLibrary as problem}
                        <tr>
                          <td>
                            {#if dailyAlgoPlannedDateForProblem(problem.id)}
                              {#if (dailyAlgoPlannedDateForProblem(problem.id) || '') === todayDateKey}
                                <span class="inline-flex px-2 py-0.5 rounded-md border border-emerald-500/25 bg-emerald-500/10 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700">Aujourd'hui</span>
                              {:else if (dailyAlgoPlannedDateForProblem(problem.id) || '') > todayDateKey}
                                <span class="inline-flex px-2 py-0.5 rounded-md border border-sky-500/25 bg-sky-500/10 text-[10px] font-black uppercase tracking-[0.08em] text-sky-700">Programmé</span>
                              {:else}
                                <span class="inline-flex px-2 py-0.5 rounded-md border border-slate-500/25 bg-slate-500/10 text-[10px] font-black uppercase tracking-[0.08em] text-slate-700">Joué</span>
                              {/if}
                              <p class="mt-1 text-[11px] font-bold text-on-surface-variant">{historyDateLabel(dailyAlgoPlannedDateForProblem(problem.id) || '')}</p>
                            {:else if problem.usedAt}
                              <span class="inline-flex px-2 py-0.5 rounded-md border border-slate-500/25 bg-slate-500/10 text-[10px] font-black uppercase tracking-[0.08em] text-slate-700">Joué</span>
                              <p class="mt-1 text-[11px] font-bold text-on-surface-variant">{formatDate(problem.usedAt)}</p>
                            {:else}
                              <span class="inline-flex px-2 py-0.5 rounded-md border border-amber-500/25 bg-amber-500/10 text-[10px] font-black uppercase tracking-[0.08em] text-amber-700">Backlog</span>
                              <p class="mt-1 text-[11px] font-bold text-on-surface-variant">En attente</p>
                            {/if}
                          </td>
                          <td>
                            <p class="text-sm font-black text-on-surface">{problem.title}</p>
                            <p class="text-[11px] font-mono text-on-surface-variant mt-1 line-clamp-1">{dailyAlgoProblemFunctionSignature(problem)}</p>
                          </td>
                          <td>
                            <span class="inline-flex px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-[0.12em] {problem.difficulty === 'facile' ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' : problem.difficulty === 'moyen' ? 'bg-amber-500/10 text-amber-700 border-amber-500/20' : 'bg-red-500/10 text-red-700 border-red-500/20'}">
                              {difficultyLabel(problem.difficulty)}
                            </span>
                          </td>
                          <td>
                            <span class="inline-flex px-2 py-0.5 rounded-md border border-outline-variant/20 bg-surface-container-low text-[10px] font-black uppercase tracking-[0.08em] text-on-surface-variant">
                              {dailyAlgoChallengeTypeLabel(dailyAlgoDetectChallengeTypeKey(problem.title, problem.description))}
                            </span>
                          </td>
                          <td>
                            {#if dailyAlgoProblemAllowedLanguages(problem).length === 0}
                              <span class="px-2 py-0.5 rounded-md border border-emerald-500/25 bg-emerald-500/10 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700">
                                Libre
                              </span>
                            {:else}
                              <div class="flex flex-wrap gap-1">
                                {#each dailyAlgoProblemAllowedLanguages(problem) as lang}
                                  <span class="px-2 py-0.5 rounded-md border border-outline-variant/25 bg-surface text-[10px] font-black uppercase tracking-[0.08em] text-on-surface-variant">
                                    {lang}
                                  </span>
                                {/each}
                              </div>
                            {/if}
                          </td>
                          <td>
                            <p class="text-xs font-black text-emerald-700">{Array.isArray(problem.unitTests) ? problem.unitTests.length : 0}</p>
                          </td>
                          <td>
                            {#if canManageSettings}
                              <div class="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onclick={() => openDailyAlgoProblemEditModal(problem)}
                                  class="px-3 py-1.5 rounded-lg border border-outline-variant/30 bg-surface text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant hover:text-on-surface"
                                >
                                  Éditer
                                </button>
                                <button
                                  type="button"
                                  onclick={() => setProblemAsToday(problem.id)}
                                  disabled={switchingTodayProblemId === problem.id || deletingDailyAlgoProblemId === problem.id || todayRunProblemId === problem.id}
                                  class="px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-[0.12em] disabled:opacity-50 disabled:cursor-not-allowed {todayRunProblemId === problem.id
                                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                                    : 'border-sky-500/30 bg-sky-500/10 text-sky-700 hover:bg-sky-500/20'}"
                                >
                                  {todayRunProblemId === problem.id ? "Exo du jour" : 'Mettre aujourd’hui'}
                                </button>
                                <button
                                  type="button"
                                  onclick={() => deleteDailyAlgoProblemFromLibrary(problem)}
                                  disabled={deletingDailyAlgoProblemId === problem.id || switchingTodayProblemId === problem.id}
                                  class="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-700 text-[10px] font-black uppercase tracking-[0.12em] hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Supprimer
                                </button>
                              </div>
                            {:else}
                              <span class="text-[10px] text-on-surface-variant">Lecture seule</span>
                            {/if}
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
            </div>
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

{#if dailyAlgoApiModalOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="dailyalgo-api-title" tabindex="-1" onclick={closeDailyAlgoApiModal}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="dailyalgo-api-popover" onclick={(event) => event.stopPropagation()}>
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Daily Algo</p>
          <h3 id="dailyalgo-api-title" class="mt-1 text-lg font-black text-on-surface">Configuration API externe</h3>
          <p class="mt-1 text-xs text-on-surface-variant">
            Clé personnelle, URL publique et commandes cURL de la guilde active.
          </p>
        </div>
        <button
          type="button"
          onclick={closeDailyAlgoApiModal}
          class="p-2 rounded-lg border border-outline-variant/30 text-on-surface-variant hover:text-on-surface"
          aria-label="Fermer la configuration API"
        >
          <Papicon icon="close" size={16} />
        </button>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div class="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4 space-y-4">
          <div class="flex items-center justify-between gap-2">
            <p class="text-[10px] uppercase tracking-[0.16em] font-black text-on-surface-variant/70">Gestion de clé</p>
            <RefreshButton
              onClick={loadMyApiKeys}
              loading={isFetchingApiKeys}
              label="Rafraîchir"
              className="px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] rounded-lg bg-surface border border-outline-variant/20 text-on-surface-variant"
              iconClass="text-sm"
            />
          </div>

          <label for="dailyalgo-api-key-name" class="text-[10px] font-black uppercase tracking-[0.16em] text-on-surface-variant/70">
            Nom de la clé
          </label>
          <input
            id="dailyalgo-api-key-name"
            type="text"
            bind:value={dailyAlgoApiKeyName}
            placeholder="Kotbo Daily Algo"
            class="w-full rounded-xl border border-outline-variant/30 bg-surface px-4 py-2 text-sm text-on-surface outline-none focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
          />

          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-[0.12em] hover:bg-emerald-700 disabled:opacity-60"
              onclick={createOrResetMyApiKey}
              disabled={!canManageSettings || apiKeyAction.state.loading}
            >
              {currentApiKey ? 'Reset clé API' : 'Créer clé API'}
            </button>

            {#if currentApiKey}
              <button
                type="button"
                class="px-4 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-700 text-[10px] font-black uppercase tracking-[0.12em] hover:bg-red-500/20 disabled:opacity-60"
                onclick={() => deleteCurrentApiKey(currentApiKey.id)}
                disabled={!canManageSettings || apiKeyAction.state.loading}
              >
                Désactiver
              </button>
            {/if}
          </div>

          <InlineFeedback message={apiKeyAction.state.message} error={apiKeyAction.state.error} />

          <div class="space-y-2 rounded-xl border border-outline-variant/20 bg-surface px-4 py-3">
            <p class="text-[10px] uppercase tracking-[0.16em] font-black text-on-surface-variant/70">Clé active</p>
            <p class="text-sm font-mono text-on-surface">{currentApiKey?.displayKey ?? 'Aucune clé active'}</p>
            {#if currentApiKey?.lastUsedAt}
              <p class="text-[11px] text-on-surface-variant">Dernière utilisation: {formatDate(currentApiKey.lastUsedAt)}</p>
            {/if}
          </div>

          {#if latestIssuedApiKey}
            <div class="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
              <p class="text-[10px] uppercase tracking-[0.16em] font-black text-emerald-700">Nouvelle clé (visible une seule fois)</p>
              <p class="text-sm font-mono text-emerald-800 break-all">{latestIssuedApiKey}</p>
              <button
                type="button"
                class="px-3 py-1.5 rounded-lg border border-emerald-600/30 bg-white text-emerald-700 text-[10px] font-black uppercase tracking-[0.12em] hover:bg-emerald-50"
                onclick={() => copyToClipboard(latestIssuedApiKey, 'Clé API copiée.')}
              >
                Copier la clé
              </button>
            </div>
          {/if}
        </div>

        <div class="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4 space-y-4">
          <div>
            <p class="text-[10px] uppercase tracking-[0.16em] font-black text-on-surface-variant/70">Mini doc API (guilde actuelle)</p>
            <p class="mt-1 text-xs text-on-surface-variant break-all">Guild ID: {selectedGuildId || 'Aucune guilde sélectionnée'}</p>
          </div>

          <div class="space-y-2">
            <p class="text-[10px] uppercase tracking-[0.16em] font-black text-on-surface-variant/70">Base URL</p>
            <div class="rounded-lg border border-outline-variant/20 bg-surface px-3 py-2 text-xs font-mono break-all">
              {dailyAlgoPublicApiProblemsUrl || 'Sélectionnez une guilde pour voir l’URL.'}
            </div>
          </div>

          <div class="space-y-2">
            <p class="text-[10px] uppercase tracking-[0.16em] font-black text-on-surface-variant/70">Exemples cURL</p>
            <pre class="rounded-lg border border-outline-variant/20 bg-surface px-3 py-2 text-[11px] font-mono overflow-auto">{apiDocGetCurl}</pre>
            <pre class="rounded-lg border border-outline-variant/20 bg-surface px-3 py-2 text-[11px] font-mono overflow-auto">{apiDocPostCurl}</pre>
            <pre class="rounded-lg border border-outline-variant/20 bg-surface px-3 py-2 text-[11px] font-mono overflow-auto">{apiDocPatchCurl}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if ideModalOpen && focusedSubmission}
  <div class="modal-backdrop dailyalgo-ide-overlay" role="dialog" aria-modal="true" aria-labelledby="dailyalgo-ide-title" tabindex="-1">
    <div class="modal-panel modal-panel-dailyalgo-ide">
      <div class="dailyalgo-ide-menubar">
        <div class="dailyalgo-ide-window-controls">
          <span class="dot red"></span>
          <span class="dot amber"></span>
          <span class="dot green"></span>
        </div>
        <p id="dailyalgo-ide-title" class="dailyalgo-ide-menubar-title">
          Review: {focusedSubmission.authorName}
        </p>
        <button
          type="button"
          onclick={closeIntegratedIde}
          class="dailyalgo-ide-close"
          aria-label="Fermer l'IDE intégré"
        >
          <Papicon icon="close" size={16} />
        </button>
      </div>

      <div class="dailyalgo-ide-modal-grid">
        <section class="dailyalgo-ide-editor-pane">
          <div class="dailyalgo-ide-context-strip">
            <span>Challenge: {dailyAlgoToday?.run?.problem?.title ?? 'Daily Algo'}</span>
            <span class="dot">•</span>
            <span>{submissionStatusMeta(focusedSubmission.status).label}</span>
            <span class="dot">•</span>
            <span>Score: {focusedSubmission.scoreFinal ?? '—'}/5</span>
            <span class="dot">•</span>
            <span>Total: {focusedSubmission.totalPoints ?? '—'} pts</span>
            <span class="dot">•</span>
            <span>Soumis: {formatDate(focusedSubmission.submittedAt)}</span>
          </div>
          <div class="dailyalgo-ide-host">
            <DailyAlgoMiniIDE
              initialCode={focusedSubmission.solution}
              initialLanguage={ideLanguageForSubmission(focusedSubmission)}
              allowedLanguages={dailyAlgoProblemAllowedIdeLanguages(dailyAlgoToday?.run?.problem)}
              functionName={typeof dailyAlgoToday?.run?.problem?.functionName === 'string' ? dailyAlgoToday.run.problem.functionName : ''}
              functionArgs={Array.isArray(dailyAlgoToday?.run?.problem?.functionArgs) ? dailyAlgoToday.run.problem.functionArgs : []}
              unitTests={Array.isArray(dailyAlgoToday?.run?.problem?.unitTests) ? dailyAlgoToday.run.problem.unitTests : []}
              languagePersistenceKey={`submission:${focusedSubmission.id}`}
              height="100%"
              showPopoutButton={false}
              fileLabel={focusedSubmission.authorName?.replace(/\s+/g, '-').toLowerCase() || 'solution'}
            />
          </div>
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
          <h3 id="dailyalgo-create-title" class="mt-1 text-xl font-black text-on-surface">
            {editingDailyAlgoProblemId ? 'Modifier l\'exercice' : 'Ajouter un nouvel exercice'}
          </h3>
          <p class="mt-1 text-sm text-on-surface-variant">
            {editingDailyAlgoProblemId
              ? 'Mets à jour la signature de fonction, les langages autorisés et les tests unitaires.'
              : 'Complète les champs puis valide pour ajouter l\'exercice dans la banque.'}
          </p>
        </div>
        <button
          type="button"
          onclick={closeDailyAlgoProblemModal}
          class="p-2 rounded-lg border border-outline-variant/30 text-on-surface-variant hover:text-on-surface"
          aria-label="Fermer"
        >
          <Papicon icon="close" size={16} />
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
          <label for="modal-dailyalgo-function-name" class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Nom de fonction attendu</label>
          <FormInput
            id="modal-dailyalgo-function-name"
            bind:value={algoDraft.functionName}
            className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/10 rounded-xl text-sm font-mono outline-none focus:border-emerald-500/40"
            placeholder="ex: reverseString"
          />
        </div>
        <div class="space-y-2 md:col-span-2">
          <p class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Langages autorisés (optionnel)</p>
          <div class="rounded-2xl border border-outline-variant/15 bg-surface-container-low p-4 space-y-3">
            <div class="flex flex-wrap gap-2">
              {#if algoDraft.allowedLanguages.length === 0}
                <span class="px-2.5 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">
                  Langage libre
                </span>
              {:else}
                {#each algoDraft.allowedLanguages as lang}
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-outline-variant/25 bg-surface text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant">
                    {lang}
                    <button
                      type="button"
                      onclick={() => removeDraftAllowedLanguage(lang)}
                      class="w-4 h-4 rounded-full bg-surface-container-high text-on-surface-variant hover:text-on-surface leading-none"
                      aria-label={`Retirer ${lang}`}
                    >
                      ×
                    </button>
                  </span>
                {/each}
              {/if}
            </div>

            <div class="flex flex-col md:flex-row gap-2">
              <input
                type="text"
                bind:value={algoDraft.languageInput}
                onkeydown={handleLanguageInputKeydown}
                class="flex-1 px-3 py-2 rounded-xl border border-outline-variant/20 bg-surface text-sm text-on-surface outline-none focus:border-emerald-500/40"
                placeholder="Ajouter un langage (ex: rust, kotlin, c#)"
              />
              <button
                type="button"
                onclick={addDraftAllowedLanguage}
                class="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-[0.12em] hover:bg-emerald-700"
              >
                Ajouter
              </button>
              <button
                type="button"
                onclick={enableFreeLanguageMode}
                class="px-4 py-2 rounded-xl border border-outline-variant/30 text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant hover:text-on-surface hover:bg-surface"
              >
                Mode libre
              </button>
            </div>

            <div class="flex flex-wrap gap-2">
              {#each dailyAlgoLanguageSuggestions as suggestion}
                <button
                  type="button"
                  onclick={() => addSuggestedLanguage(suggestion)}
                  class="px-2.5 py-1 rounded-lg border border-outline-variant/25 bg-surface text-[10px] font-black uppercase tracking-[0.1em] text-on-surface-variant hover:text-on-surface"
                >
                  {suggestion}
                </button>
              {/each}
            </div>

            <p class="text-[11px] text-on-surface-variant">
              Laisse vide pour autoriser tous les langages. Tu peux aussi ajouter des langages non disponibles dans l'IDE intégré.
            </p>
          </div>
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
          <div class="flex items-center justify-between gap-3">
            <p class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Arguments de la fonction</p>
            <button
              type="button"
              onclick={addFunctionArg}
              class="px-3 py-1.5 rounded-lg bg-surface border border-outline-variant/25 text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant hover:text-on-surface"
            >
              + Ajouter un argument
            </button>
          </div>
          <div class="rounded-2xl border border-outline-variant/15 bg-surface-container-low p-4 space-y-3">
            {#if algoDraft.functionArgs.length === 0}
              <p class="text-xs text-on-surface-variant">Aucun argument: la fonction est attendue sans paramètre.</p>
            {:else}
              {#each algoDraft.functionArgs as arg, argIndex}
                <div class="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-center">
                  <input
                    type="text"
                    value={arg.name}
                    oninput={(event) => updateFunctionArgName(argIndex, (event.currentTarget as HTMLInputElement).value)}
                    class="px-3 py-2 rounded-xl border border-outline-variant/20 bg-surface text-sm text-on-surface outline-none focus:border-emerald-500/40"
                    placeholder={`arg${argIndex + 1}`}
                  />
                  <input
                    type="text"
                    value={arg.type}
                    oninput={(event) => updateFunctionArgType(argIndex, (event.currentTarget as HTMLInputElement).value)}
                    class="px-3 py-2 rounded-xl border border-outline-variant/20 bg-surface text-sm text-on-surface outline-none focus:border-emerald-500/40"
                    placeholder="string | number | array | object..."
                  />
                  <button
                    type="button"
                    onclick={() => removeFunctionArg(argIndex)}
                    class="px-3 py-2 rounded-xl border border-red-500/20 bg-red-500/10 text-[10px] font-black uppercase tracking-[0.12em] text-red-700 hover:bg-red-500/20"
                  >
                    Supprimer
                  </button>
                </div>
              {/each}
            {/if}
          </div>
        </div>
        <div class="space-y-2 md:col-span-2">
          <div class="flex items-center justify-between gap-3">
            <p class="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">Tests unitaires</p>
            <button
              type="button"
              onclick={addUnitTest}
              class="px-3 py-1.5 rounded-lg bg-surface border border-outline-variant/25 text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant hover:text-on-surface"
            >
              + Ajouter un test
            </button>
          </div>
          <div class="rounded-2xl border border-outline-variant/15 bg-surface-container-low p-4 space-y-3">
            {#if algoDraft.unitTests.length === 0}
              <p class="text-xs text-on-surface-variant">Aucun test défini.</p>
            {:else}
              {#each algoDraft.unitTests as test, testIndex}
                <div class="rounded-xl border border-outline-variant/20 bg-surface p-3 space-y-3">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <input
                      type="text"
                      value={test.name}
                      oninput={(event) => updateUnitTestName(testIndex, (event.currentTarget as HTMLInputElement).value)}
                      class="flex-1 min-w-[220px] px-3 py-2 rounded-xl border border-outline-variant/20 bg-surface-container-low text-sm text-on-surface outline-none focus:border-emerald-500/40"
                      placeholder={`Cas ${testIndex + 1}`}
                    />
                    <button
                      type="button"
                      onclick={() => removeUnitTest(testIndex)}
                      class="px-3 py-2 rounded-xl border border-red-500/20 bg-red-500/10 text-[10px] font-black uppercase tracking-[0.12em] text-red-700 hover:bg-red-500/20"
                    >
                      Supprimer
                    </button>
                  </div>

                  {#if algoDraft.functionArgs.length === 0}
                    <p class="text-[11px] text-on-surface-variant">La fonction n'a pas d'argument: ce test sera exécuté avec <span class="font-mono">()</span>.</p>
                  {:else}
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {#each algoDraft.functionArgs as arg, argIndex}
                        <label class="space-y-1">
                          <span class="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant/60">{arg.name || `arg${argIndex + 1}`}</span>
                          <input
                            type="text"
                            value={test.argValues[argIndex] ?? 'null'}
                            oninput={(event) => updateUnitTestArgValue(testIndex, argIndex, (event.currentTarget as HTMLInputElement).value)}
                            class="w-full px-3 py-2 rounded-xl border border-outline-variant/20 bg-surface-container-low text-sm font-mono text-on-surface outline-none focus:border-emerald-500/40"
                            placeholder={'"hello" | 123 | true | [1,2] | {"k":"v"}'}
                          />
                        </label>
                      {/each}
                    </div>
                  {/if}

                  <label class="space-y-1">
                    <span class="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant/60">Valeur attendue</span>
                    <input
                      type="text"
                      value={test.expectedValue}
                      oninput={(event) => updateUnitTestExpectedValue(testIndex, (event.currentTarget as HTMLInputElement).value)}
                      class="w-full px-3 py-2 rounded-xl border border-outline-variant/20 bg-surface-container-low text-sm font-mono text-on-surface outline-none focus:border-emerald-500/40"
                      placeholder={'"olleh" | 42 | false | null | {"ok":true}'}
                    />
                  </label>
                </div>
              {/each}
            {/if}
          </div>
          <p class="text-[11px] text-on-surface-variant">Valeurs JSON recommandées. Si non JSON, la valeur sera traitée comme texte brut.</p>
        </div>
      </div>

      {#if formAction.state.error}
        <div class="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-700">
          {formAction.state.error}
        </div>
      {:else if formAction.state.message}
        <div class="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700">
          {formAction.state.message}
        </div>
      {/if}

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
          {formAction.state.loading
            ? (editingDailyAlgoProblemId ? 'Enregistrement...' : 'Ajout...')
            : (editingDailyAlgoProblemId ? 'Enregistrer les modifications' : 'Ajouter l\'exercice')}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

  .dailyalgo-api-popover {
    width: min(980px, calc(100vw - 1.5rem));
    max-height: calc(100vh - 1.5rem);
    margin: 0.75rem 0.75rem 0 auto;
    border-radius: 1.4rem;
    border: 1px solid var(--outline-variant);
    background: color-mix(in srgb, var(--surface-container) 92%, transparent);
    box-shadow:
      0 24px 55px rgba(0, 0, 0, 0.28),
      inset 0 1px 0 color-mix(in srgb, var(--surface) 55%, transparent);
    padding: 1rem;
    overflow: auto;
  }

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
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .dailyalgo-ide-host {
    min-height: 0;
    flex: 1;
    display: flex;
  }

  .dailyalgo-ide-host :global(.ide-root) {
    width: 100%;
    height: 100%;
    min-height: 0;
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
    .dailyalgo-api-popover {
      width: calc(100vw - 1rem);
      max-height: calc(100vh - 1rem);
      margin: 0.5rem auto;
      border-radius: 1rem;
    }

    .dailyalgo-ide-modal-grid {
      grid-template-columns: minmax(0, 1fr);
      padding: 0.55rem;
      gap: 0.55rem;
    }

    .dailyalgo-ide-score-panel {
      max-height: 42vh;
    }
  }
</style>
