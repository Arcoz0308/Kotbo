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
  import RolePermissionSettings from '../lib/components/RolePermissionSettings.svelte';
  import { fetchFeatureConfigurations, updateFeatureConfiguration } from '../lib/api';

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
  let dailyAlgoScheduleModalOpen = $state(false);
  
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

  let featureConfig = $state<any>(null);
  let loadingConfig = $state(false);

  async function loadFeatureConfig() {
    loadingConfig = true;
    try {
      const configs = await fetchFeatureConfigurations();
      featureConfig = configs?.features?.find((c: any) => c.featureKey === 'daily_algo') || null;
    } catch (err) {
      console.error('Error fetching daily algo config:', err);
    } finally {
      loadingConfig = false;
    }
  }

  onMount(async () => {
    await dashboardStore.refresh();
    await Promise.all([
      loadDailyAlgoProblems(), 
      loadTodayDailyAlgoSubmissions(), 
      loadDailyAlgoHistory(), 
      loadDailyAlgoSchedule(), 
      loadMyApiKeys(),
      loadFeatureConfig()
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
    const payload = {
      code: submission.solution,
      language: submission.language,
      authorName: submission.authorName,
      submissionId: submission.id,
      status: submission.status,
      scoreCorrectness: submission.scoreCorrectness || 5,
      scoreComments: submission.scoreComments || 5,
      scoreCompactness: submission.scoreCompactness || 5,
      scoreOptimization: submission.scoreOptimization || 5,
      scoreReadability: submission.scoreReadability || 5,
      reviewFeedback: submission.reviewFeedback || '',
    };
    
    const payloadKey = `daily_algo_payload_${submission.id}_${Date.now()}`;
    localStorage.setItem(payloadKey, JSON.stringify(payload));
    
    router.goto(`/dailyalgo/ide?payloadKey=${payloadKey}`);
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
      <button 
        onclick={() => dailyAlgoScheduleModalOpen = true}
        class="bg-surface-container-low/40 rounded-[2.5rem] p-8 border border-outline-variant/10 text-left hover:bg-surface-container-high/60 transition-colors group"
      >
        <div class="flex items-center justify-between">
          <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Planning</p>
          <Papicon icon="Calendar" size={14} class="text-on-surface-variant/20 group-hover:text-primary transition-colors" />
        </div>
        <p class="text-4xl font-black text-on-surface mt-2">{dailyAlgoSchedule.length} jours</p>
        <p class="text-[10px] font-bold text-primary mt-4 flex items-center gap-2">
          Voir le programme <Papicon icon="ArrowRight" size={10} />
        </p>
      </button>
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

    <!-- Configuration Section -->
    {#if canManageSettings && featureConfig}
      <section class="bg-surface-container-low/30 rounded-[3rem] p-10 border border-outline-variant/10 animate-in fade-in duration-500">
        <h3 class="text-xl font-black text-on-surface mb-8">Configuration & Permissions</h3>
        <RolePermissionSettings 
          featureKey="daily_algo" 
          roleAccess={featureConfig.roleAccessByRole} 
        />
      </section>
    {/if}

  </div>
  {#if dailyAlgoScheduleModalOpen}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-background/80 backdrop-blur-xl animate-in fade-in duration-300">
      <div class="bg-surface-container-low border border-outline-variant/10 w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <header class="p-10 border-b border-outline-variant/5 flex items-center justify-between">
          <div>
            <h2 class="text-3xl font-black text-on-surface tracking-tight">Programme Daily Algo</h2>
            <p class="text-on-surface-variant/60 mt-1 font-medium">Les prochains défis prévus pour la guilde.</p>
          </div>
          <button onclick={() => dailyAlgoScheduleModalOpen = false} class="p-3 rounded-2xl bg-on-surface/5 hover:bg-on-surface/10 transition-colors">
            <Papicon icon="X" size={20} />
          </button>
        </header>

        <div class="flex-1 overflow-y-auto p-10 space-y-4">
          {#if isFetchingAlgoSchedule}
            {#each Array(5) as _}
              <div class="h-20 bg-on-surface/5 rounded-3xl animate-pulse"></div>
            {/each}
          {:else if dailyAlgoSchedule.length === 0}
            <div class="py-20 text-center">
              <div class="w-16 h-16 bg-on-surface/5 rounded-full flex items-center justify-center mx-auto mb-4 text-on-surface-variant/20">
                <Papicon icon="Calendar" size={32} />
              </div>
              <p class="text-on-surface-variant/60 font-bold">Aucun programme généré pour l'instant.</p>
              <button 
                onclick={loadDailyAlgoSchedule}
                class="mt-6 px-6 py-3 bg-primary text-on-primary rounded-2xl font-black text-[10px] uppercase tracking-widest"
              >
                Générer le planning
              </button>
            </div>
          {:else}
            {#each dailyAlgoSchedule as run}
              <div class="group flex items-center justify-between p-6 bg-surface-container-high/40 border border-outline-variant/5 rounded-[2rem] hover:border-primary/20 hover:bg-primary/5 transition-all">
                <div class="flex items-center gap-6">
                  <div class="w-14 h-14 bg-surface-container-highest rounded-2xl flex flex-col items-center justify-center text-center border border-outline-variant/10">
                    <span class="text-[8px] font-black uppercase text-on-surface-variant/40 leading-none mb-1">
                      {new Date(run.dateKey).toLocaleDateString('fr-FR', { month: 'short' })}
                    </span>
                    <span class="text-xl font-black text-on-surface leading-none">
                      {new Date(run.dateKey).getDate()}
                    </span>
                  </div>
                  <div>
                    <h4 class="font-black text-on-surface">{run.problem?.title ?? 'Problème inconnu'}</h4>
                    <div class="flex items-center gap-3 mt-1">
                      <span class="px-2 py-0.5 bg-on-surface/5 rounded-lg text-[8px] font-black uppercase tracking-widest text-on-surface-variant/60 border border-outline-variant/5">
                        {run.problem?.difficulty ?? 'normal'}
                      </span>
                      <span class="text-[10px] font-bold text-on-surface-variant/40">
                        {run.submissionsCount ?? 0} soumissions
                      </span>
                    </div>
                  </div>
                </div>
                
                {#if run.dateKey === new Date().toISOString().split('T')[0]}
                  <span class="px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-lg text-[8px] font-black uppercase tracking-widest border border-emerald-500/20">Aujourd'hui</span>
                {/if}
              </div>
            {/each}
          {/if}
        </div>

        {#if canManageSettings}
          <footer class="p-8 bg-surface-container-high/30 border-t border-outline-variant/5">
            <button 
              onclick={() => ensureDailyAlgoSchedule(21).then(loadDailyAlgoSchedule)}
              class="w-full py-4 bg-primary text-on-primary rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] transition-transform flex items-center justify-center gap-3"
            >
              <Papicon icon="RefreshCw" size={14} />
              Étendre le planning de 3 semaines
            </button>
          </footer>
        {/if}
      </div>
    </div>
  {/if}
</ModulePage>

<style>
  /* Styles minimaux pour la structure, le reste est en Tailwind */
</style>
