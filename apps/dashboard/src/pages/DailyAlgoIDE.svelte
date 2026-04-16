<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from 'tinro';
  import { reviewDailyAlgoSubmission } from '../lib/api';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import DailyAlgoMiniIDE from '../lib/components/DailyAlgoMiniIDE.svelte';
  import { detectIdeLanguageFromCode, normalizeIdeLanguage, type IdeLanguage } from '../lib/dailyAlgoIde';

  type SubmissionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

  type IdePayload = {
    code?: string;
    language?: string;
    authorName?: string;
    submissionId?: string;
    status?: SubmissionStatus;
    scoreCorrectness?: number;
    scoreComments?: number;
    scoreCompactness?: number;
    scoreOptimization?: number;
    scoreReadability?: number;
    reviewFeedback?: string;
  };

  function clampScore(value: number, fallback = 5): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(1, Math.min(5, Math.trunc(value)));
  }

  function normalizeStatus(value: unknown): SubmissionStatus {
    if (value === 'APPROVED' || value === 'REJECTED') return value;
    return 'PENDING';
  }

  let loading = $state(true);
  let pageError = $state('');
  let code = $state('');
  let language = $state<IdeLanguage>('javascript');
  let authorName = $state('Soumission Daily Algo');
  let submissionId = $state<string | null>(null);
  let status = $state<SubmissionStatus>('PENDING');
  let editorHeight = $state(620);

  let scoreCorrectness = $state(5);
  let scoreComments = $state(5);
  let scoreCompactness = $state(5);
  let scoreOptimization = $state(5);
  let scoreReadability = $state(5);
  let reviewFeedback = $state('');

  let isSubmitting = $state(false);
  let reviewError = $state('');
  let reviewSuccess = $state('');

  const canModerateContent = $derived(!!dashboardStore.state.access?.canModerateContent);
  const hasLowScore = $derived(
    [scoreCorrectness, scoreComments, scoreCompactness, scoreOptimization, scoreReadability].some((score) => score < 5),
  );
  const reviewAverage = $derived(((scoreCorrectness + scoreComments + scoreCompactness + scoreOptimization + scoreReadability) / 5).toFixed(1));

  function statusMeta(current: SubmissionStatus): { label: string; classes: string } {
    if (current === 'APPROVED') {
      return {
        label: 'Validee',
        classes: 'border-emerald-400/35 bg-emerald-500/15 text-emerald-200',
      };
    }

    if (current === 'REJECTED') {
      return {
        label: 'Rejetee',
        classes: 'border-red-400/35 bg-red-500/15 text-red-200',
      };
    }

    return {
      label: 'En attente',
      classes: 'border-amber-400/35 bg-amber-500/15 text-amber-200',
    };
  }

  function goBackToDailyAlgo() {
    router.goto('/module-settings/dailyalgo');
  }

  function computeEditorHeight() {
    if (typeof window === 'undefined') return;
    editorHeight = Math.max(430, Math.floor(window.innerHeight - 230));
  }

  function applyPayload(payload: IdePayload) {
    code = payload.code ?? '';
    language = payload.language
      ? normalizeIdeLanguage(payload.language)
      : detectIdeLanguageFromCode(code);
    authorName = payload.authorName?.trim() || 'Soumission Daily Algo';
    submissionId = payload.submissionId?.trim() || null;
    status = normalizeStatus(payload.status);

    scoreCorrectness = clampScore(Number(payload.scoreCorrectness), 5);
    scoreComments = clampScore(Number(payload.scoreComments), 5);
    scoreCompactness = clampScore(Number(payload.scoreCompactness), 5);
    scoreOptimization = clampScore(Number(payload.scoreOptimization), 5);
    scoreReadability = clampScore(Number(payload.scoreReadability), 5);
    if (typeof payload.reviewFeedback === 'string') {
      const trimmedFeedback = payload.reviewFeedback.trim();
      const normalizedFeedback = trimmedFeedback
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

      reviewFeedback = normalizedFeedback === 'rien a redire.' || normalizedFeedback === 'rien a redire'
        ? ''
        : trimmedFeedback;
    } else {
      reviewFeedback = '';
    }
  }

  async function submitApprove() {
    reviewError = '';
    reviewSuccess = '';

    if (!submissionId) {
      reviewError = 'Impossible de noter: soumission introuvable.';
      return;
    }

    if (hasLowScore && !reviewFeedback.trim()) {
      reviewError = 'Une explication est obligatoire si une note est inferieure a 5/5.';
      return;
    }

    isSubmitting = true;
    try {
      const ok = await reviewDailyAlgoSubmission(submissionId, {
        action: 'approve',
        scores: {
          correctness: scoreCorrectness,
          comments: scoreComments,
          compactness: scoreCompactness,
          optimization: scoreOptimization,
          readability: scoreReadability,
        },
        feedback: reviewFeedback.trim(),
      });

      if (!ok) {
        reviewError = 'La validation a echoue. Verifie tes permissions ou le statut de la soumission.';
        return;
      }

      status = 'APPROVED';
      reviewSuccess = 'Soumission validee et notes enregistrees.';
    } catch (error) {
      reviewError = error instanceof Error ? error.message : 'Erreur inconnue pendant la validation.';
    } finally {
      isSubmitting = false;
    }
  }

  async function submitReject() {
    reviewError = '';
    reviewSuccess = '';

    if (!submissionId) {
      reviewError = 'Impossible de rejeter: soumission introuvable.';
      return;
    }

    isSubmitting = true;
    try {
      const ok = await reviewDailyAlgoSubmission(submissionId, {
        action: 'reject',
      });

      if (!ok) {
        reviewError = 'Le rejet a echoue. Verifie tes permissions ou le statut de la soumission.';
        return;
      }

      status = 'REJECTED';
      reviewSuccess = 'Soumission rejetee.';
    } catch (error) {
      reviewError = error instanceof Error ? error.message : 'Erreur inconnue pendant le rejet.';
    } finally {
      isSubmitting = false;
    }
  }

  onMount(() => {
    const onResize = () => computeEditorHeight();

    (async () => {
      try {
        computeEditorHeight();
        window.addEventListener('resize', onResize);

        await dashboardStore.refresh();

        const url = new URL(window.location.href);
        const payloadKey = url.searchParams.get('payloadKey');
        let payload: IdePayload | null = null;

        if (payloadKey) {
          const rawPayload = window.localStorage.getItem(payloadKey);
          if (rawPayload) {
            payload = JSON.parse(rawPayload) as IdePayload;
            window.localStorage.removeItem(payloadKey);
          }
        }

        if (!payload) {
          const codeParam = url.searchParams.get('code');
          const langParam = url.searchParams.get('language');
          const authorParam = url.searchParams.get('authorName');
          const submissionParam = url.searchParams.get('submissionId');

          payload = {
            code: codeParam ? decodeURIComponent(codeParam) : '',
            language: langParam ?? undefined,
            authorName: authorParam ? decodeURIComponent(authorParam) : undefined,
            submissionId: submissionParam ?? undefined,
          };
        }

        applyPayload(payload);

        if (!code.trim()) {
          pageError = 'Aucun code trouve pour cette session IDE.';
        }
      } catch (error) {
        pageError = error instanceof Error ? error.message : 'Impossible de charger la session IDE.';
      } finally {
        loading = false;
      }
    })();

    return () => {
      window.removeEventListener('resize', onResize);
    };
  });

</script>

<div class="daily-ide-page min-h-screen bg-slate-950 text-slate-100">
  <div class="mx-auto w-[min(1680px,96vw)] py-4 space-y-4">
    <header class="rounded-2xl border border-slate-700/60 bg-slate-900/90 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Daily Algo Workbench</p>
        <h1 class="text-xl md:text-2xl font-black text-slate-100 mt-1">{authorName}</h1>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          {#if submissionId}
            <span class="rounded-md border border-slate-600/70 bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-300">ID: {submissionId}</span>
          {/if}
          <span class={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${statusMeta(status).classes}`}>
            {statusMeta(status).label}
          </span>
        </div>
      </div>

      <button
        type="button"
        onclick={goBackToDailyAlgo}
        class="px-4 py-2 rounded-xl border border-slate-600/70 bg-slate-800 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300 hover:text-slate-100"
      >
        Retour dashboard
      </button>
    </header>

    {#if loading}
      <div class="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-8 text-sm font-bold text-slate-400 animate-pulse">
        Chargement de l'IDE...
      </div>
    {:else if pageError}
      <div class="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-sm font-bold text-red-200">
        {pageError}
      </div>
    {:else}
      <div class="grid gap-4 2xl:grid-cols-[1fr_360px] items-start">
        <section class="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-3">
          <DailyAlgoMiniIDE
            initialCode={code}
            initialLanguage={language}
            height={editorHeight}
            showPopoutButton={false}
          />
        </section>

        <aside class="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-4 space-y-4">
          <h2 class="text-sm font-black uppercase tracking-[0.16em] text-slate-300">Notation rapide</h2>

          {#if !canModerateContent}
            <div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-bold text-amber-200">
              Cette vue est ouverte, mais ton compte n'a pas les droits de moderation pour noter/rejeter.
            </div>
          {/if}

          <div class="grid grid-cols-2 gap-3">
            <label class="score-field" for="score-correctness">
              Correctitude
              <input id="score-correctness" type="number" min="1" max="5" step="1" bind:value={scoreCorrectness} />
            </label>
            <label class="score-field" for="score-comments">
              Commentaires
              <input id="score-comments" type="number" min="1" max="5" step="1" bind:value={scoreComments} />
            </label>
            <label class="score-field" for="score-compactness">
              Compacite
              <input id="score-compactness" type="number" min="1" max="5" step="1" bind:value={scoreCompactness} />
            </label>
            <label class="score-field" for="score-optimization">
              Optimisation
              <input id="score-optimization" type="number" min="1" max="5" step="1" bind:value={scoreOptimization} />
            </label>
            <label class="score-field col-span-2" for="score-readability">
              Lisibilite
              <input id="score-readability" type="number" min="1" max="5" step="1" bind:value={scoreReadability} />
            </label>
          </div>

          <div class="space-y-1">
            <label for="review-feedback" class="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Feedback</label>
            <textarea
              id="review-feedback"
              rows="4"
              maxlength="1000"
              bind:value={reviewFeedback}
              placeholder="Obligatoire si une note est inferieure a 5/5."
              class="w-full rounded-xl border border-slate-600/70 bg-slate-800/80 px-3 py-2 text-xs text-slate-100"
            ></textarea>
            {#if hasLowScore}
              <p class="text-[11px] font-bold text-amber-300">Feedback requis: au moins un critere est en dessous de 5/5.</p>
            {/if}
          </div>

          <div class="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200">
            Moyenne courante: {reviewAverage}/5
          </div>

          {#if reviewError}
            <div class="rounded-xl border border-red-500/35 bg-red-500/15 px-3 py-2 text-xs font-bold text-red-200">{reviewError}</div>
          {/if}

          {#if reviewSuccess}
            <div class="rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-200">{reviewSuccess}</div>
          {/if}

          <div class="flex items-center gap-2">
            <button
              type="button"
              class="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white disabled:opacity-60"
              onclick={submitApprove}
              disabled={!canModerateContent || isSubmitting || !submissionId}
            >
              {isSubmitting ? 'En cours...' : 'Valider'}
            </button>
            <button
              type="button"
              class="rounded-xl border border-red-400/40 bg-red-500/15 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-red-200 disabled:opacity-60"
              onclick={submitReject}
              disabled={!canModerateContent || isSubmitting || !submissionId}
            >
              Rejeter
            </button>
          </div>
        </aside>
      </div>
    {/if}
  </div>
</div>

<style>
  .score-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: #94a3b8;
  }

  .score-field input {
    border: 1px solid rgba(100, 116, 139, 0.8);
    border-radius: 0.75rem;
    background: rgba(30, 41, 59, 0.85);
    color: #f8fafc;
    padding: 0.55rem 0.7rem;
    font-size: 13px;
    font-weight: 700;
  }

  .score-field input:focus {
    outline: none;
    border-color: rgba(16, 185, 129, 0.7);
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.15);
  }
</style>
