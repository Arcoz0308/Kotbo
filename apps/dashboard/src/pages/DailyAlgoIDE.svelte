<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from 'tinro';
  import { reviewDailyAlgoSubmission, fetchDailyAlgoSubmission } from '../lib/api';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import DailyAlgoMiniIDE from '../lib/components/DailyAlgoMiniIDE.svelte';
  import { detectIdeLanguageFromCode, normalizeIdeLanguage, type IdeLanguage } from '../lib/dailyAlgoIde';
  import Papicon from '../lib/components/Papicon.svelte';

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

  const canModerateDailyAlgo = $derived(
    !!dashboardStore.state.featureAccess?.daily_algo?.canModerate
      || !!dashboardStore.state.access?.canModerateDailyAlgo
      || !!dashboardStore.state.access?.canModerateContent
  );
  const hasLowScore = $derived(
    [scoreCorrectness, scoreComments, scoreCompactness, scoreOptimization, scoreReadability].some((score) => score < 5),
  );
  const reviewAverage = $derived(((scoreCorrectness + scoreComments + scoreCompactness + scoreOptimization + scoreReadability) / 5).toFixed(1));

  function statusMeta(current: SubmissionStatus): { label: string; classes: string } {
    if (current === 'APPROVED') {
      return {
        label: 'Validee',
        classes: 'status-approved',
      };
    }

    if (current === 'REJECTED') {
      return {
        label: 'Rejetee',
        classes: 'status-rejected',
      };
    }

    return {
      label: 'En attente',
      classes: 'status-pending',
    };
  }

  function goBackToDailyAlgo() {
    router.goto('/dailyalgo');
  }

  function computeEditorHeight() {
    if (typeof window === 'undefined') return;
    editorHeight = Math.max(430, Math.floor(window.innerHeight - 120));
  }

  function applyPayload(payload: IdePayload) {
    code = payload.code?.trim() || (payload as any).solution?.trim() || '';
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
        feedback: reviewFeedback.trim(),
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
        
        if (!code.trim() && submissionId) {
          try {
            const fetched = await fetchDailyAlgoSubmission(submissionId);
            if (fetched) {
              applyPayload({
                ...fetched,
                code: fetched.solution, // API uses 'solution' field
                submissionId: fetched.id
              });
            }
          } catch (err) {
            console.error('DailyAlgoIDE: Failed to fetch submission', err);
          }
        }

        if (!code.trim()) {
          console.warn('DailyAlgoIDE: No code found in payload', payload);
          // Don't set pageError if we have metadata, just show the empty editor
          if (!submissionId) {
            pageError = 'Aucun code trouve pour cette session IDE.';
          }
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

<div class="daily-ide-page">
  <div class="daily-ide-wrap">
    <header class="daily-ide-header section-card">
      <div>
        <p class="daily-eyebrow">Daily Algo Workbench</p>
        <h1>{authorName}</h1>
        <div class="daily-meta-row">
          {#if submissionId}
            <span class="meta-chip">ID: {submissionId}</span>
          {/if}
          <span class={`status-pill ${statusMeta(status).classes}`}>
            {statusMeta(status).label}
          </span>
        </div>
      </div>

      <button type="button" onclick={goBackToDailyAlgo} class="page-action">Retour dashboard</button>
    </header>

    {#if loading}
      <div class="daily-ide-grid animate-pulse">
        <section class="daily-ide-main section-card" style="height: {editorHeight + 16}px;">
          <div class="flex flex-col gap-4 h-full">
            <div class="flex items-center justify-between">
              <div class="flex gap-2">
                <div class="h-6 w-24 rounded-lg bg-on-surface/5"></div>
                <div class="h-6 w-16 rounded-lg bg-on-surface/5"></div>
              </div>
              <div class="h-6 w-32 rounded-lg bg-on-surface/5"></div>
            </div>
            <div class="flex-1 rounded-xl bg-on-surface/[0.03]"></div>
            <div class="h-10 w-full rounded-xl bg-on-surface/5"></div>
          </div>
        </section>

        <aside class="daily-ide-panel section-card">
          <div class="space-y-6">
            <div class="space-y-2">
              <div class="h-3 w-32 rounded-full bg-on-surface/10"></div>
              <div class="h-24 w-full rounded-2xl bg-on-surface/5"></div>
            </div>
            
            <div class="space-y-4">
              <div class="h-3 w-40 rounded-full bg-on-surface/10"></div>
              <div class="grid grid-cols-2 gap-4">
                {#each Array(5) as _}
                  <div class="space-y-2">
                    <div class="h-2 w-20 rounded-full bg-on-surface/5"></div>
                    <div class="h-10 w-full rounded-xl bg-on-surface/5"></div>
                  </div>
                {/each}
              </div>
            </div>

            <div class="space-y-2 pt-4">
              <div class="h-2 w-32 rounded-full bg-on-surface/5"></div>
              <div class="h-32 w-full rounded-2xl bg-on-surface/5"></div>
            </div>

            <div class="h-12 w-full rounded-xl bg-primary/10"></div>
          </div>
        </aside>
      </div>
    {:else if pageError}
      <div class="state-panel section-card state-error">{pageError}</div>
    {:else}
      <div class="daily-ide-grid">
        <section class="daily-ide-main section-card">
          <DailyAlgoMiniIDE
            initialCode={code}
            initialLanguage={language}
            height={editorHeight}
            showPopoutButton={false}
          />
        </section>

        <aside class="daily-ide-panel section-card">
          {#if status !== 'PENDING' && reviewFeedback}
            <div class="corrected-feedback-card {status === 'APPROVED' ? 'approved' : 'rejected'} animate-in fade-in slide-in-from-top-2 duration-500">
              <div class="feedback-header">
                <Papicon icon="message-square" size={16} />
                <span>Commentaire du correcteur</span>
              </div>
              <p class="feedback-body">
                "{reviewFeedback}"
              </p>
            </div>
          {/if}

          <h2>{status === 'PENDING' ? 'Notation rapide' : 'Détails de la correction'}</h2>

          {#if !canModerateDailyAlgo}
            <div class="alert alert-warn">
              Cette vue est ouverte, mais ton compte n'a pas les droits de moderation pour noter/rejeter.
            </div>
          {/if}

          <div class="scores-grid">
            <label class="score-field" for="score-correctness">
              Correctitude
              <input id="score-correctness" class="score-input" type="number" min="1" max="5" step="1" bind:value={scoreCorrectness} disabled={!canModerateDailyAlgo || (status !== 'PENDING' && !canModerateDailyAlgo)} />
            </label>
            <label class="score-field" for="score-comments">
              Commentaires
              <input id="score-comments" class="score-input" type="number" min="1" max="5" step="1" bind:value={scoreComments} disabled={!canModerateDailyAlgo || (status !== 'PENDING' && !canModerateDailyAlgo)} />
            </label>
            <label class="score-field" for="score-compactness">
              Compacite
              <input id="score-compactness" class="score-input" type="number" min="1" max="5" step="1" bind:value={scoreCompactness} disabled={!canModerateDailyAlgo || (status !== 'PENDING' && !canModerateDailyAlgo)} />
            </label>
            <label class="score-field" for="score-optimization">
              Optimisation
              <input id="score-optimization" class="score-input" type="number" min="1" max="5" step="1" bind:value={scoreOptimization} disabled={!canModerateDailyAlgo || (status !== 'PENDING' && !canModerateDailyAlgo)} />
            </label>
            <label class="score-field score-field-full" for="score-readability">
              Lisibilite
              <input id="score-readability" class="score-input" type="number" min="1" max="5" step="1" bind:value={scoreReadability} disabled={!canModerateDailyAlgo || (status !== 'PENDING' && !canModerateDailyAlgo)} />
            </label>
          </div>

          <div class="feedback-block">
            <label for="review-feedback" class="feedback-label">Feedback</label>
            <textarea
              id="review-feedback"
              rows="5"
              maxlength="1000"
              bind:value={reviewFeedback}
              placeholder={status === 'PENDING' ? "Obligatoire si une note est inferieure a 5/5." : ""}
              disabled={!canModerateDailyAlgo || (status !== 'PENDING' && !canModerateDailyAlgo)}
              class="review-textarea"
            ></textarea>
            {#if hasLowScore}
              <p class="hint-required">Feedback requis: au moins un critere est en dessous de 5/5.</p>
            {/if}
          </div>

          <div class="average-chip">Moyenne courante: {reviewAverage}/5</div>

          {#if reviewError}
            <div class="alert alert-error">{reviewError}</div>
          {/if}

          {#if reviewSuccess}
            <div class="alert alert-success">{reviewSuccess}</div>
          {/if}

          <div class="action-row">
            <button
              type="button"
              class="btn-approve"
              onclick={submitApprove}
              disabled={!canModerateDailyAlgo || isSubmitting || !submissionId}
            >
              {isSubmitting ? 'En cours...' : 'Valider'}
            </button>
            <button
              type="button"
              class="btn-reject"
              onclick={submitReject}
              disabled={!canModerateDailyAlgo || isSubmitting || !submissionId}
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
  .daily-ide-page {
    min-height: 100vh;
    background: var(--background);
    color: var(--on-surface);
  }

  .daily-ide-wrap {
    width: 100%;
    height: 100vh;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow: hidden;
  }

  .daily-ide-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    padding: 0.8rem 1.5rem;
    background: var(--surface-container-low);
    border-bottom: 1px solid var(--outline-variant);
    z-index: 10;
  }

  .daily-eyebrow {
    margin: 0;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--on-surface-variant);
  }

  .daily-ide-header h1 {
    margin: 0.3rem 0 0;
    font-size: clamp(1.05rem, 2.2vw, 1.7rem);
    font-weight: 900;
    letter-spacing: -0.02em;
    color: var(--on-surface);
  }

  .daily-meta-row {
    margin-top: 0.55rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .meta-chip,
  .status-pill {
    border-radius: 0.6rem;
    padding: 0.3rem 0.55rem;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    border: 1px solid var(--outline-variant);
  }

  .meta-chip {
    background: var(--surface-container-low);
    color: var(--on-surface-variant);
  }

  .status-pending {
    background: rgba(245, 158, 11, 0.14);
    color: #d97706;
    border-color: rgba(245, 158, 11, 0.36);
  }

  .status-approved {
    background: rgba(16, 185, 129, 0.13);
    color: #047857;
    border-color: rgba(16, 185, 129, 0.35);
  }

  .status-rejected {
    background: rgba(220, 38, 38, 0.13);
    color: #b91c1c;
    border-color: rgba(220, 38, 38, 0.35);
  }

  :global(.dark) .status-pending {
    color: #fcd34d;
  }

  :global(.dark) .status-approved {
    color: #6ee7b7;
  }

  :global(.dark) .status-rejected {
    color: #fda4af;
  }

  .page-action {
    border: 1px solid var(--outline);
    background: var(--surface-container-low);
    color: var(--on-surface);
    border-radius: 0.75rem;
    padding: 0.6rem 0.9rem;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .daily-ide-grid {
    display: grid;
    gap: 0;
    flex: 1;
    min-height: 0;
    grid-template-columns: minmax(0, 1fr);
  }

  .daily-ide-main,
  .daily-ide-panel {
    padding: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .corrected-feedback-card {
    border-radius: 1.25rem;
    padding: 1.25rem;
    margin-bottom: 0.5rem;
    border: 1px solid var(--outline-variant);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .corrected-feedback-card.approved {
    background: rgba(16, 185, 129, 0.05);
    border-color: rgba(16, 185, 129, 0.2);
  }

  .corrected-feedback-card.rejected {
    background: rgba(220, 38, 38, 0.05);
    border-color: rgba(220, 38, 38, 0.2);
  }

  .feedback-header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .approved .feedback-header { color: #059669; }
  .rejected .feedback-header { color: #dc2626; }

  .feedback-body {
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
    color: var(--on-surface);
    font-style: italic;
    font-weight: 500;
  }

  .daily-ide-panel {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 1.5rem;
    border-left: 1px solid var(--outline-variant);
    background: var(--surface-container-lowest);
    overflow-y: auto;
  }

  .daily-ide-panel h2 {
    margin: 0;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--on-surface-variant);
  }

  .scores-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.7rem;
  }

  .score-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--on-surface-variant);
  }

  .score-field-full {
    grid-column: 1 / -1;
  }

  .score-input {
    border: 1px solid var(--outline);
    border-radius: 0.7rem;
    background: var(--surface-container-low);
    color: var(--on-surface);
    padding: 0.52rem 0.66rem;
    font-size: 13px;
    font-weight: 700;
  }

  .score-input:focus,
  .review-textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(51, 69, 87, 0.14);
  }

  .feedback-block {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .feedback-label {
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--on-surface-variant);
  }

  .review-textarea {
    width: 100%;
    border: 1px solid var(--outline);
    border-radius: 0.8rem;
    background: var(--surface-container-low);
    color: var(--on-surface);
    padding: 0.6rem 0.72rem;
    font-size: 12px;
    line-height: 1.5;
    resize: vertical;
  }

  .hint-required {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    color: #b45309;
  }

  :global(.dark) .hint-required {
    color: #fcd34d;
  }

  .average-chip {
    border-radius: 0.75rem;
    border: 1px solid rgba(16, 185, 129, 0.35);
    background: rgba(16, 185, 129, 0.12);
    color: #047857;
    padding: 0.56rem 0.72rem;
    font-size: 12px;
    font-weight: 800;
  }

  :global(.dark) .average-chip {
    color: #6ee7b7;
  }

  .alert {
    border-radius: 0.75rem;
    padding: 0.58rem 0.72rem;
    font-size: 12px;
    font-weight: 700;
    border: 1px solid transparent;
  }

  .alert-warn {
    border-color: rgba(245, 158, 11, 0.35);
    background: rgba(245, 158, 11, 0.12);
    color: #b45309;
  }

  :global(.dark) .alert-warn {
    color: #fcd34d;
  }

  .alert-error {
    border-color: rgba(220, 38, 38, 0.35);
    background: rgba(220, 38, 38, 0.11);
    color: #b91c1c;
  }

  :global(.dark) .alert-error {
    color: #fda4af;
  }

  .alert-success {
    border-color: rgba(16, 185, 129, 0.35);
    background: rgba(16, 185, 129, 0.12);
    color: #047857;
  }

  :global(.dark) .alert-success {
    color: #6ee7b7;
  }

  .action-row {
    display: flex;
    gap: 0.55rem;
  }

  .btn-approve,
  .btn-reject {
    border-radius: 0.75rem;
    padding: 0.62rem 0.8rem;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .btn-approve {
    flex: 1;
    border: 1px solid rgba(16, 185, 129, 0.5);
    background: #059669;
    color: #ecfdf5;
  }

  .btn-reject {
    border: 1px solid rgba(220, 38, 38, 0.4);
    background: rgba(220, 38, 38, 0.12);
    color: #b91c1c;
  }

  :global(.dark) .btn-reject {
    color: #fda4af;
  }

  .btn-approve:disabled,
  .btn-reject:disabled,
  .page-action:disabled {
    opacity: 0.58;
    cursor: not-allowed;
  }

  .state-panel {
    padding: 1rem 1.15rem;
    border-radius: 1rem;
    font-size: 14px;
    font-weight: 700;
    color: var(--on-surface-variant);
  }

  .state-error {
    border-color: rgba(220, 38, 38, 0.35);
    background: rgba(220, 38, 38, 0.09);
    color: #b91c1c;
  }

  :global(.dark) .state-error {
    color: #fda4af;
  }

  @media (min-width: 1450px) {
    .daily-ide-grid {
      grid-template-columns: minmax(0, 1fr) 340px;
    }
  }

  @media (max-width: 820px) {
    .daily-ide-wrap {
      width: min(1880px, calc(100vw - 0.8rem));
      padding: 0.4rem 0 0.8rem;
      gap: 0.6rem;
    }

    .daily-ide-header {
      flex-direction: column;
      align-items: flex-start;
      padding: 0.8rem;
    }

    .page-action {
      width: 100%;
    }

    .daily-ide-main,
    .daily-ide-panel {
      padding: 0.55rem;
    }

    .scores-grid {
      grid-template-columns: 1fr;
    }

    .score-field-full {
      grid-column: auto;
    }
  }
</style>
