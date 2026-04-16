<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from 'tinro';
  import DailyAlgoMiniIDE from '../lib/components/DailyAlgoMiniIDE.svelte';
  import { detectIdeLanguageFromCode, normalizeIdeLanguage, type IdeLanguage } from '../lib/dailyAlgoIde';

  type IdePayload = {
    code?: string;
    language?: string;
    authorName?: string;
    submissionId?: string;
  };

  let loading = $state(true);
  let errorMessage = $state('');
  let code = $state('');
  let language = $state<IdeLanguage>('javascript');
  let authorName = $state('Soumission');
  let submissionId = $state<string | null>(null);

  function goBackToDailyAlgo() {
    router.goto('/module-settings/dailyalgo');
  }

  onMount(() => {
    try {
      const url = new URL(window.location.href);
      const payloadKey = url.searchParams.get('payloadKey');

      let payload: IdePayload | null = null;

      if (payloadKey) {
        const raw = window.localStorage.getItem(payloadKey);
        if (raw) {
          payload = JSON.parse(raw) as IdePayload;
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

      code = payload.code ?? '';
      language = payload.language
        ? normalizeIdeLanguage(payload.language)
        : detectIdeLanguageFromCode(code);
      authorName = payload.authorName?.trim() || 'Soumission Daily Algo';
      submissionId = payload.submissionId ?? null;

      if (!code.trim()) {
        errorMessage = 'Aucun code trouve pour cette session IDE.';
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Impossible de charger la session IDE.';
    } finally {
      loading = false;
    }
  });
</script>

<div class="max-w-6xl mx-auto px-4 py-6 space-y-4">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <p class="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60">Daily Algo IDE</p>
      <h1 class="text-2xl font-black text-on-surface">{authorName}</h1>
      {#if submissionId}
        <p class="text-xs font-bold text-on-surface-variant">Soumission: {submissionId}</p>
      {/if}
    </div>
    <button
      type="button"
      onclick={goBackToDailyAlgo}
      class="px-4 py-2 rounded-xl border border-outline-variant/25 bg-surface-container-low text-[10px] font-black uppercase tracking-[0.14em] text-on-surface-variant hover:text-on-surface"
    >
      Retour au dashboard
    </button>
  </div>

  {#if loading}
    <div class="rounded-xl border border-outline-variant/25 bg-surface-container-low p-6 text-sm font-bold text-on-surface-variant animate-pulse">
      Chargement de l'IDE...
    </div>
  {:else if errorMessage}
    <div class="rounded-xl border border-red-500/20 bg-red-500/10 p-6 text-sm font-bold text-red-700">
      {errorMessage}
    </div>
  {:else}
    <DailyAlgoMiniIDE
      initialCode={code}
      initialLanguage={language}
      height={440}
      showPopoutButton={false}
    />
  {/if}
</div>
