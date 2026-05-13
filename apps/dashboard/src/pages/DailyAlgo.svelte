<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import {
    API_BASE_URL,
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
    fetchGlobalDailyAlgoLeaderboard,
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
  import Skeleton from '../lib/components/Skeleton.svelte';
  import ModulePage from '../lib/components/ModulePage.svelte';

  const moduleId = 'dailyalgo';

  const module = $derived((dashboardStore.state.modules as Array<{ id: string; name: string; description: string; status: string }>).find((m) => m.id === moduleId) || { 
    name: 'Daily Algo', 
    description: 'Défis algorithmiques quotidiens.', 
    status: 'inactive' 
  });
  
  const canManageSettings = $derived(
    !!dashboardStore.state.featureAccess?.modules?.canConfigure
      || !!dashboardStore.state.access?.canManageSettings
  );
  const canModerateContent = $derived(
    !!dashboardStore.state.featureAccess?.content?.canModerate
      || !!dashboardStore.state.access?.canModerateContent
  );
  const canModerateDailyAlgo = $derived(
    !!dashboardStore.state.featureAccess?.daily_algo?.canModerate
      || !!dashboardStore.state.access?.canModerateDailyAlgo
      || canModerateContent
  );

  const supportedDailyAlgoLanguages: IdeLanguage[] = ['javascript', 'typescript', 'python', 'c', 'lua', 'sqlite'];
  const dailyAlgoLanguageSuggestions = ['javascript', 'typescript', 'python', 'c', 'lua', 'sqlite', 'rust', 'go', 'java', 'php', 'ruby', 'c#'];

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

  function formatDate(value: string | number | Date | null | undefined): string {
    if (value === null || value === undefined || value === '') return 'Date inconnue';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return 'Date inconnue';
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }

  function createFunctionArgDraft(name = 'input', type = 'string'): DailyAlgoFunctionArgDraft {
    return { id: createDraftId('arg'), name, type };
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
      if (nextArgs.length > argCount) nextArgs.length = argCount;
      while (nextArgs.length < argCount) nextArgs.push('null');
      return { ...test, argValues: nextArgs };
    });
  }

  function parseDraftJsonValue(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
    const trimmed = raw.trim();
    if (!trimmed) return { ok: false, error: 'Valeur vide' };
    try {
      return { ok: true, value: JSON.parse(trimmed) };
    } catch {
      return { ok: true, value: trimmed };
    }
  }

  const formAction = createAsyncActionState();
  const apiKeyAction = createAsyncActionState();

  let dailyAlgoProblems = $state<any[]>([]);
  let dailyAlgoToday = $state<any | null>(null);
  let isFetchingAlgo = $state(false);
  let isFetchingAlgoSubmissions = $state(false);
  let isFetchingAlgoHistory = $state(false);
  let isFetchingAlgoSchedule = $state(false);
  let isFetchingApiKeys = $state(false);
  let dailyAlgoHistory = $state<any[]>([]);
  let dailyAlgoSchedule = $state<any[]>([]);
  let myApiKeys = $state<any[]>([]);
  let dailyAlgoApiKeyName = $state('Kotbo Daily Algo');
  let latestIssuedApiKey = $state('');
  let dailyAlgoApiModalOpen = $state(false);
  let createDailyAlgoProblemModalOpen = $state(false);
  let editingDailyAlgoProblemId = $state<string | null>(null);
  let ideFocusedSubmissionId = $state<string | null>(null);
  let ideModalOpen = $state(false);
  let dailyAlgoSubmissionStatusFilter = $state<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  let dailyAlgoLibrarySearch = $state('');
  
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

  let scoreDraftBySubmissionId = $state<Record<string, any>>({});

  onMount(async () => {
    await dashboardStore.refresh();
    await Promise.all([
      loadDailyAlgoProblems(), 
      loadTodayDailyAlgoSubmissions(), 
      loadDailyAlgoHistory(), 
      loadDailyAlgoSchedule(), 
      loadMyApiKeys()
    ]);
  });

  async function loadDailyAlgoProblems() {
    isFetchingAlgo = true;
    try { dailyAlgoProblems = await fetchDailyAlgoProblems(); } 
    catch (err) { formAction.setError('Erreur chargement exercices.'); } 
    finally { isFetchingAlgo = false; }
  }

  async function loadTodayDailyAlgoSubmissions() {
    isFetchingAlgoSubmissions = true;
    try { dailyAlgoToday = await fetchTodayDailyAlgoSubmissions(); } 
    catch (err) { formAction.setError('Erreur chargement soumissions.'); } 
    finally { isFetchingAlgoSubmissions = false; }
  }

  async function loadDailyAlgoHistory() {
    isFetchingAlgoHistory = true;
    try {
      const payload = await fetchDailyAlgoSubmissionHistory(7);
      dailyAlgoHistory = payload?.history ?? [];
    } finally { isFetchingAlgoHistory = false; }
  }

  async function loadDailyAlgoSchedule() {
    isFetchingAlgoSchedule = true;
    try {
      if (canManageSettings) await ensureDailyAlgoSchedule(21);
      const payload = await fetchDailyAlgoSchedule(7, 21);
      dailyAlgoSchedule = Array.isArray(payload?.runs) ? payload.runs : [];
    } finally { isFetchingAlgoSchedule = false; }
  }

  async function loadMyApiKeys() {
    isFetchingApiKeys = true;
    try {
      const payload = await fetchMyApiKeys();
      myApiKeys = Array.isArray(payload?.keys) ? payload.keys : [];
    } finally { isFetchingApiKeys = false; }
  }

  function openDailyAlgoProblemModal() {
    editingDailyAlgoProblemId = null;
    algoDraft = {
      title: '', description: '', difficulty: 'moyen', language: 'fr', functionName: '',
      allowedLanguages: [], languageInput: '',
      functionArgs: [createFunctionArgDraft('input', 'string')],
      unitTests: [createUnitTestDraft(1, 'Cas 1')],
    };
    createDailyAlgoProblemModalOpen = true;
  }

  async function submitDailyAlgoProblem() {
    if (!canManageSettings) return;
    await formAction.run(async () => {
      const payload = {
        title: algoDraft.title.trim(),
        description: algoDraft.description.trim(),
        difficulty: algoDraft.difficulty,
        functionName: algoDraft.functionName.trim(),
        functionArgs: algoDraft.functionArgs.map(a => ({ name: a.name.trim(), type: a.type.trim() })),
        unitTests: algoDraft.unitTests.map(t => ({
          name: t.name.trim(),
          args: t.argValues.map(v => parseDraftJsonValue(v).value),
          expected: parseDraftJsonValue(t.expectedValue).value
        })),
        allowedLanguages: algoDraft.allowedLanguages,
      };
      const ok = editingDailyAlgoProblemId 
        ? await updateDailyAlgoProblem(editingDailyAlgoProblemId, payload)
        : await createDailyAlgoProblem(payload);
      if (ok) {
        createDailyAlgoProblemModalOpen = false;
        await loadDailyAlgoProblems();
      }
      return ok;
    });
  }

  const filteredProblems = $derived(
    dailyAlgoProblems.filter(p => 
      p.title.toLowerCase().includes(dailyAlgoLibrarySearch.toLowerCase())
    )
  );

  const todaySubmissions = $derived(
    (dailyAlgoToday?.submissions ?? []).filter((s: any) => 
      dailyAlgoSubmissionStatusFilter === 'ALL' || s.status === dailyAlgoSubmissionStatusFilter
    )
  );

  function openSubmissionInIntegratedIde(submission: any) {
    ideFocusedSubmissionId = submission.id;
    ideModalOpen = true;
  }

</script>

<ModulePage 
  title="Daily Algo" 
  description="Gérez les défis algorithmiques quotidiens, corrigez les soumissions et gérez votre bibliothèque." 
  icon="Code"
  featureKey="daily_algo"
>
  {#snippet actions()}
    <div class="flex gap-3">
      <RefreshButton
        onClick={() => { loadDailyAlgoProblems(); loadTodayDailyAlgoSubmissions(); }}
        loading={isFetchingAlgo || isFetchingAlgoSubmissions}
        label="Actualiser"
      />
      {#if canManageSettings}
        <button
          onclick={openDailyAlgoProblemModal}
          class="px-5 py-2.5 bg-primary text-on-primary rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
        >
          Nouvel Exercice
        </button>
      {/if}
    </div>
  {/snippet}

  <div class="space-y-10 pb-20">
    
    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-surface-container-low/40 rounded-[2.5rem] p-8 border border-outline-variant/10">
        <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Soumissions du jour</p>
        <p class="text-4xl font-black text-on-surface mt-2">{dailyAlgoToday?.submissions?.length ?? 0}</p>
      </div>
      <div class="bg-surface-container-low/40 rounded-[2.5rem] p-8 border border-outline-variant/10">
        <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Bibliothèque</p>
        <p class="text-4xl font-black text-on-surface mt-2">{dailyAlgoProblems.length}</p>
      </div>
      <div class="bg-surface-container-low/40 rounded-[2.5rem] p-8 border border-outline-variant/10">
        <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Planning</p>
        <p class="text-4xl font-black text-on-surface mt-2">{dailyAlgoSchedule.length} jours</p>
      </div>
    </div>

    <!-- Active Challenge -->
    <section class="bg-primary/5 rounded-[3rem] p-10 border border-primary/10">
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div class="flex items-center gap-3">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span class="text-[10px] font-black uppercase tracking-widest text-primary">Défi en cours</span>
          </div>
          <h3 class="text-3xl font-black text-on-surface mt-2">{dailyAlgoToday?.run?.problem?.title ?? 'Aucun défi actif'}</h3>
          <p class="text-on-surface-variant/60 mt-2 max-w-2xl line-clamp-2">{dailyAlgoToday?.run?.problem?.description ?? 'Planifiez un défi pour commencer.'}</p>
        </div>
        {#if canManageSettings}
          <button class="px-6 py-3 bg-surface-container-high rounded-2xl text-[10px] font-black uppercase tracking-widest border border-outline-variant/10 hover:bg-surface-container-highest transition-colors">
            Changer le défi
          </button>
        {/if}
      </div>
    </section>

    <!-- Submissions Table -->
    <section class="space-y-6">
      <div class="flex items-center justify-between px-2">
        <h3 class="text-xl font-black text-on-surface">Soumissions Récentes</h3>
        <div class="flex gap-2">
          {#each ['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as f}
            <button 
              onclick={() => dailyAlgoSubmissionStatusFilter = f as any}
              class="px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border border-outline-variant/10 {dailyAlgoSubmissionStatusFilter === f ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant/60 hover:bg-surface-container-high'}"
            >
              {f === 'ALL' ? 'Tout' : f}
            </button>
          {/each}
        </div>
      </div>

      <div class="bg-surface-container-low/30 rounded-[2.5rem] border border-outline-variant/10 overflow-hidden">
        <table class="w-full text-left">
          <thead class="bg-surface-container-high/50 border-b border-outline-variant/10">
            <tr>
              <th class="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Auteur</th>
              <th class="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Statut</th>
              <th class="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Date</th>
              <th class="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline-variant/5">
            {#each todaySubmissions as sub}
              <tr class="hover:bg-surface-container-low/50 transition-colors group">
                <td class="px-8 py-5">
                  <p class="font-black text-on-surface">{sub.authorName}</p>
                  <p class="text-[10px] text-on-surface-variant/40">ID: {sub.authorId}</p>
                </td>
                <td class="px-8 py-5">
                  <span class="px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest {sub.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-600' : sub.status === 'PENDING' ? 'bg-amber-500/10 text-amber-600' : 'bg-red-500/10 text-red-600'}">
                    {sub.status}
                  </span>
                </td>
                <td class="px-8 py-5 text-xs text-on-surface-variant">{formatDate(sub.submittedAt)}</td>
                <td class="px-8 py-5">
                  <button 
                    onclick={() => openSubmissionInIntegratedIde(sub)}
                    class="p-2 rounded-xl bg-primary/10 text-primary hover:scale-110 transition-transform"
                  >
                    <Papicon icon="Code" size={18} />
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

  </div>
</ModulePage>

<style>
  /* Styles minimaux pour la structure, le reste est en Tailwind */
</style>
