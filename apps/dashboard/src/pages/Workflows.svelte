<script lang="ts">
  import { onMount } from 'svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import WorkflowEditor from '../lib/components/workflows/WorkflowEditor.svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { toast } from '../lib/stores/toast.svelte';
  import { m, dateLocale } from '../lib/i18n';
  import { hasBlockingIssue, type ValidationIssue, type WorkflowGraph } from '@kotbo/shared';
  import {
    fetchWorkflows,
    fetchWorkflow,
    createWorkflow,
    updateWorkflow,
    toggleWorkflow,
    deleteWorkflow,
    fetchWorkflowExecutions,
    fetchWorkflowExecution,
    type WorkflowSummary,
    type WorkflowExecutionSummary,
    type WorkflowExecutionDetail,
  } from '../lib/api';

  const canManageSettings = $derived(!!dashboardStore.state.access?.canManageSettings);

  type View = 'list' | 'editor';
  let view = $state<View>('list');
  let loading = $state(true);
  let error = $state('');

  let workflows = $state<WorkflowSummary[]>([]);
  let executions = $state<WorkflowExecutionSummary[]>([]);

  // Filtres et recherche dans la liste
  let searchFilter = $state('');
  let statusFilter = $state<'all' | 'active' | 'inactive'>('all');

  // ── Édition ───────────────────────────────────────────────────────────────
  let editingId = $state<string | null>(null);
  let form = $state({ name: '', description: '', enabled: false });
  let graph = $state<WorkflowGraph>({ nodes: [], edges: [] });
  let issues = $state<ValidationIssue[]>([]);
  let saving = $state(false);

  // ── Rejeu d'exécution ─────────────────────────────────────────────────────
  let replay = $state<WorkflowExecutionDetail | null>(null);
  let replayIndex = $state(-1);
  let replayTimer: ReturnType<typeof setInterval> | null = null;

  const replaySteps = $derived(replay?.steps.map((s) => ({ nodeId: s.nodeId, status: s.status })) ?? null);

  const STATUS_META: Record<string, { label: () => string; color: string }> = {
    COMPLETED: { label: () => m.wf_exec_status_completed(), color: 'bg-emerald-500/15 text-emerald-300' },
    FAILED: { label: () => m.wf_exec_status_failed(), color: 'bg-red-500/15 text-red-300' },
    WAITING: { label: () => m.wf_exec_status_waiting(), color: 'bg-amber-500/15 text-amber-300' },
    RUNNING: { label: () => m.wf_exec_status_running(), color: 'bg-sky-500/15 text-sky-300' },
    CANCELLED: { label: () => m.wf_exec_status_cancelled(), color: 'bg-surface-container-highest text-on-surface-variant/60' },
  };

  const TRIGGER_BADGES: Record<string, { label: string; icon: string }> = {
    OnMemberJoin: { label: "Arrivée membre", icon: "User" },
    OnMemberLeave: { label: "Départ membre", icon: "UserCross" },
    OnRoleAdded: { label: "Rôle attribué", icon: "Shield" },
    OnRoleRemoved: { label: "Rôle retiré", icon: "Shield" },
    OnMessageSend: { label: "Message envoyé", icon: "MessageSquare" },
    OnReactionAdd: { label: "Réaction ajoutée", icon: "Sparkles" },
    OnVoiceJoin: { label: "Arrivée vocal", icon: "Mic" },
    OnVoiceLeave: { label: "Départ vocal", icon: "Mic" },
    OnTicketCreated: { label: "Ticket créé", icon: "TextBubble" },
    OnSanctionApplied: { label: "Sanction", icon: "AlertTriangle" },
    OnLevelUp: { label: "Passage niveau", icon: "Sparkles" },
  };

  const filteredWorkflows = $derived(
    workflows.filter((w) => {
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && w.enabled) ||
        (statusFilter === 'inactive' && !w.enabled);
      const matchesSearch =
        !searchFilter.trim() ||
        w.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        (w.description && w.description.toLowerCase().includes(searchFilter.toLowerCase())) ||
        w.triggerType.toLowerCase().includes(searchFilter.toLowerCase());
      return matchesStatus && matchesSearch;
    })
  );

  async function loadList() {
    try {
      const [wf, ex] = await Promise.all([fetchWorkflows(), fetchWorkflowExecutions()]);
      if (wf) workflows = wf.workflows;
      if (ex) executions = ex.executions;
    } catch (e: any) {
      error = e?.message || m.wf_error();
    }
  }

  onMount(async () => {
    loading = true;
    await loadList();
    loading = false;
    return () => stopReplay();
  });

  function newWorkflow() {
    editingId = null;
    form = { name: '', description: '', enabled: false };
    graph = { nodes: [], edges: [] };
    issues = [];
    stopReplay();
    view = 'editor';
  }

  async function editWorkflow(id: string) {
    try {
      const result = await fetchWorkflow(id);
      if (!result?.workflow) return;
      editingId = id;
      form = {
        name: result.workflow.name,
        description: result.workflow.description ?? '',
        enabled: result.workflow.enabled,
      };
      graph = result.workflow.graph;
      stopReplay();
      view = 'editor';
    } catch (e: any) {
      toast.error(e?.message || m.wf_error());
    }
  }

  async function save() {
    if (!canManageSettings || saving) return;
    if (hasBlockingIssue(issues)) {
      toast.error(m.wf_validation_failed());
      return;
    }
    if (!form.name.trim()) {
      toast.error(m.wf_name());
      return;
    }

    saving = true;
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        enabled: form.enabled,
        graph,
      };
      const result = editingId
        ? await updateWorkflow(editingId, payload)
        : await createWorkflow(payload);

      if (result?.workflow) editingId = result.workflow.id;
      toast.success(m.wf_saved());
      await loadList();
    } catch (e: any) {
      toast.error(e?.message || m.wf_error());
    } finally {
      saving = false;
    }
  }

  async function toggle(workflow: WorkflowSummary) {
    try {
      await toggleWorkflow(workflow.id, !workflow.enabled);
      await loadList();
    } catch (e: any) {
      toast.error(e?.message || m.wf_error());
    }
  }

  async function duplicate(workflow: WorkflowSummary) {
    try {
      const full = await fetchWorkflow(workflow.id);
      if (!full?.workflow) return;

      const payload = {
        name: `${full.workflow.name} (Copie)`,
        description: full.workflow.description,
        enabled: false,
        graph: full.workflow.graph,
      };
      await createWorkflow(payload);
      toast.success('Trigger dupliqué !');
      await loadList();
    } catch (e: any) {
      toast.error(e?.message || m.wf_error());
    }
  }

  async function remove(id: string) {
    if (!confirm(m.wf_delete_confirm())) return;
    try {
      await deleteWorkflow(id);
      toast.success(m.wf_deleted());
      await loadList();
    } catch (e: any) {
      toast.error(e?.message || m.wf_error());
    }
  }

  // ── Rejeu ─────────────────────────────────────────────────────────────────
  async function openReplay(executionId: string, workflowId: string) {
    try {
      if (editingId !== workflowId) await editWorkflow(workflowId);

      const result = await fetchWorkflowExecution(executionId);
      if (!result?.execution) return;
      replay = result.execution;
      replayIndex = -1;
      startReplay();
    } catch (e: any) {
      toast.error(e?.message || m.wf_error());
    }
  }

  function startReplay() {
    stopReplay();
    if (!replay || replay.steps.length === 0) return;
    replayTimer = setInterval(() => {
      if (!replay || replayIndex >= replay.steps.length - 1) {
        stopReplay();
        return;
      }
      replayIndex++;
    }, 700);
  }

  function stopReplay() {
    if (replayTimer) clearInterval(replayTimer);
    replayTimer = null;
  }

  function closeReplay() {
    stopReplay();
    replay = null;
    replayIndex = -1;
  }

  function successRate(workflow: WorkflowSummary): number {
    if (workflow.runCount === 0) return 0;
    return Math.round((workflow.successCount / workflow.runCount) * 100);
  }

  function formatDate(value: string | null): string {
    if (!value) return '—';
    return new Date(value).toLocaleString(dateLocale(), {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  }

  const currentStep = $derived(replay && replayIndex >= 0 ? replay.steps[replayIndex] : null);
</script>

<ModulePage title={m.wf_page_title()} description={m.wf_page_desc()} icon="Workflow" featureKey="workflows">
  {#snippet actions()}
    {#if canManageSettings}
      <div class="flex items-center gap-2">
        {#if view === 'editor'}
          <button
            onclick={() => { view = 'list'; closeReplay(); }}
            class="px-4 py-2.5 rounded-xl text-xs font-semibold bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-all"
          >{m.wf_back()}</button>
          <button
            onclick={save}
            disabled={saving || hasBlockingIssue(issues)}
            class="px-5 py-2.5 rounded-xl text-xs font-semibold bg-primary text-on-primary hover:opacity-90 transition-all disabled:opacity-40 flex items-center gap-2"
          >
            <Papicon icon={saving ? 'Loader' : 'Check'} size={14} class={saving ? 'animate-spin' : ''} />
            {saving ? m.wf_saving() : m.wf_save()}
          </button>
        {:else}
          <button
            onclick={newWorkflow}
            class="px-5 py-2.5 rounded-xl text-xs font-semibold bg-primary text-on-primary hover:opacity-90 transition-all flex items-center gap-2 shadow-lg shadow-primary/20"
          >
            <Papicon icon="Plus" size={14} />
            {m.wf_new()}
          </button>
        {/if}
      </div>
    {/if}
  {/snippet}

  {#if loading}
    <div class="space-y-3">
      {#each Array(3) as _}
        <div class="h-24 rounded-2xl bg-surface-container-high/40 animate-pulse"></div>
      {/each}
    </div>
  {:else if error}
    <div class="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 flex items-center gap-3">
      <Papicon icon="Warning" size={20} />
      <span>{error}</span>
    </div>
  {:else if view === 'editor'}
    <div class="space-y-4">
      <!-- Métadonnées -->
      <div class="grid grid-cols-1 md:grid-cols-[2fr_3fr_auto] gap-3 items-end">
        <div class="space-y-1.5">
          <label for="wf-name" class="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest">{m.wf_name()}</label>
          <input
            id="wf-name"
            bind:value={form.name}
            placeholder={m.wf_name_placeholder()}
            class="w-full px-3 py-2 rounded-xl bg-surface-container-highest border border-outline-variant/20 text-sm text-on-surface focus:border-primary/50 focus:outline-none"
          />
        </div>
        <div class="space-y-1.5">
          <label for="wf-desc" class="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest">{m.wf_description()}</label>
          <input
            id="wf-desc"
            bind:value={form.description}
            class="w-full px-3 py-2 rounded-xl bg-surface-container-highest border border-outline-variant/20 text-sm text-on-surface focus:border-primary/50 focus:outline-none"
          />
        </div>
        <label class="flex items-center gap-2 px-3 py-2 cursor-pointer">
          <input type="checkbox" bind:checked={form.enabled} class="w-4 h-4 rounded accent-primary cursor-pointer" />
          <span class="text-xs text-on-surface font-medium">{m.wf_enabled()}</span>
        </label>
      </div>

      <!-- Bandeau de rejeu -->
      {#if replay}
        <div class="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex flex-wrap items-center gap-3">
          <Papicon icon="Play" size={14} class="text-amber-300" />
          <span class="text-xs text-amber-200">
            {m.wf_exec_step({ n: Math.max(0, replayIndex + 1), total: replay.steps.length })}
          </span>
          {#if currentStep}
            <span class="text-[11px] text-on-surface-variant/70 font-mono">
              {currentStep.nodeType} · {currentStep.durationMs} ms
            </span>
          {/if}
          <div class="ml-auto flex items-center gap-2">
            <button
              onclick={() => (replayIndex = Math.max(-1, replayIndex - 1))}
              class="px-2 py-1 rounded-lg bg-surface-container-highest text-xs">‹</button>
            <button
              onclick={() => (replayIndex = Math.min(replay.steps.length - 1, replayIndex + 1))}
              class="px-2 py-1 rounded-lg bg-surface-container-highest text-xs">›</button>
            <button
              onclick={closeReplay}
              class="px-3 py-1 rounded-lg bg-surface-container-highest text-xs">{m.wf_exec_stop_replay()}</button>
          </div>
        </div>

        {#if currentStep}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="p-3 rounded-xl bg-surface-container-high/50 border border-outline-variant/10">
              <h4 class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-1.5">{m.wf_exec_inputs()}</h4>
              <pre class="text-[10px] text-on-surface-variant/80 overflow-x-auto">{JSON.stringify(currentStep.inputs, null, 2)}</pre>
            </div>
            <div class="p-3 rounded-xl bg-surface-container-high/50 border border-outline-variant/10">
              <h4 class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-1.5">{m.wf_exec_outputs()}</h4>
              <pre class="text-[10px] text-on-surface-variant/80 overflow-x-auto">{JSON.stringify(currentStep.outputs, null, 2)}</pre>
            </div>
          </div>
        {/if}
      {/if}

      <WorkflowEditor
        {graph}
        replaySteps={replaySteps}
        {replayIndex}
        onChange={(next, nextIssues) => { graph = next; issues = nextIssues; }}
      />
    </div>
  {:else}
    <!-- Liste des triggers -->
    <div class="space-y-6">
      <!-- Barre de filtrage et recherche -->
      <div class="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-surface-container-high/50 border border-outline-variant/10">
        <div class="flex items-center gap-1 bg-surface-container-highest/60 p-1 rounded-xl border border-outline-variant/15">
          <button
            onclick={() => (statusFilter = 'all')}
            class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all {statusFilter === 'all'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-on-surface-variant/70 hover:text-on-surface'}"
          >
            Tous ({workflows.length})
          </button>
          <button
            onclick={() => (statusFilter = 'active')}
            class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all {statusFilter === 'active'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-on-surface-variant/70 hover:text-on-surface'}"
          >
            Actifs ({workflows.filter(w => w.enabled).length})
          </button>
          <button
            onclick={() => (statusFilter = 'inactive')}
            class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all {statusFilter === 'inactive'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-on-surface-variant/70 hover:text-on-surface'}"
          >
            Inactifs ({workflows.filter(w => !w.enabled).length})
          </button>
        </div>

        <div class="relative min-w-64">
          <Papicon icon="Search" size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50" />
          <input
            type="text"
            bind:value={searchFilter}
            placeholder="Rechercher un trigger..."
            class="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-container-highest border border-outline-variant/20 text-xs text-on-surface focus:border-primary/50 focus:outline-none"
          />
        </div>
      </div>

      {#if filteredWorkflows.length === 0}
        <div class="p-10 text-center rounded-2xl bg-surface-container-high/30 space-y-2">
          <div class="p-3 rounded-2xl bg-surface-container-highest/60 w-fit mx-auto text-on-surface-variant/50">
            <Papicon icon="Workflow" size={24} />
          </div>
          <p class="text-sm font-semibold text-on-surface">Aucun trigger ne correspond à la recherche</p>
          <p class="text-xs text-on-surface-variant/50">{m.wf_empty_hint()}</p>
        </div>
      {:else}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {#each filteredWorkflows as workflow (workflow.id)}
            {@const badge = TRIGGER_BADGES[workflow.triggerType]}
            <article class="p-4 rounded-2xl bg-surface-container-high/50 border border-outline-variant/10 space-y-3 hover:border-outline-variant/30 transition-all">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 space-y-1">
                  <div class="flex items-center gap-2">
                    <h3 class="text-sm font-bold text-on-surface truncate">{workflow.name}</h3>
                    {#if badge}
                      <span class="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 flex items-center gap-1 shrink-0">
                        <Papicon icon={badge.icon} size={10} />
                        <span>{badge.label}</span>
                      </span>
                    {/if}
                  </div>
                  {#if workflow.description}
                    <p class="text-xs text-on-surface-variant/70 line-clamp-2">{workflow.description}</p>
                  {/if}
                </div>
                <span
                  class="px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 shadow-sm {workflow.enabled
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'bg-surface-container-highest text-on-surface-variant/50'}"
                >{workflow.enabled ? m.wf_enabled() : m.wf_disabled()}</span>
              </div>

              <div class="flex flex-wrap items-center gap-3 text-[11px] text-on-surface-variant/60 pt-1 border-t border-outline-variant/10">
                <span class="font-mono text-on-surface-variant/40">{workflow.triggerType}</span>
                <span>{m.wf_runs({ n: workflow.runCount })}</span>
                {#if workflow.runCount > 0}
                  <span class="text-emerald-400 font-medium">{m.wf_success_rate({ n: successRate(workflow) })}</span>
                {/if}
                <span class="ml-auto">{workflow.lastRunAt ? m.wf_last_run({ date: formatDate(workflow.lastRunAt) }) : m.wf_never_run()}</span>
              </div>

              {#if workflow.lastError}
                <p class="px-2.5 py-1.5 rounded-lg bg-red-500/10 text-[10px] text-red-300 truncate border border-red-500/20">{workflow.lastError}</p>
              {/if}

              {#if canManageSettings}
                <div class="flex items-center gap-2 pt-1">
                  <button
                    onclick={() => editWorkflow(workflow.id)}
                    class="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-surface-container-highest text-on-surface hover:bg-surface-container-highest/80 transition-all flex items-center gap-1.5"
                  >
                    <Papicon icon="Pen" size={12} />
                    <span>{m.wf_edit()}</span>
                  </button>
                  <button
                    onclick={() => duplicate(workflow)}
                    class="px-3 py-1.5 rounded-xl text-xs font-medium bg-surface-container-highest text-on-surface-variant/80 hover:text-on-surface transition-all flex items-center gap-1.5"
                    title="Dupliquer ce trigger"
                  >
                    <Papicon icon="Paper" size={12} />
                    <span>Dupliquer</span>
                  </button>
                  <button
                    onclick={() => toggle(workflow)}
                    class="px-3 py-1.5 rounded-xl text-xs font-medium bg-surface-container-highest text-on-surface-variant/70 hover:text-on-surface transition-all"
                  >{workflow.enabled ? m.wf_disabled() : m.wf_enabled()}</button>
                  <button
                    onclick={() => remove(workflow.id)}
                    class="px-3 py-1.5 rounded-xl text-xs font-medium bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-all ml-auto"
                  >{m.wf_delete()}</button>
                </div>
              {/if}
            </article>
          {/each}
        </div>
      {/if}

      <!-- Exécutions récentes -->
      <section class="space-y-3 pt-4 border-t border-outline-variant/15">
        <h2 class="text-sm font-bold text-on-surface">{m.wf_executions()}</h2>
        {#if executions.length === 0}
          <p class="text-xs text-on-surface-variant/50">{m.wf_executions_empty()}</p>
        {:else}
          <ul class="space-y-2">
            {#each executions as execution (execution.id)}
              {@const meta = STATUS_META[execution.status] ?? STATUS_META.CANCELLED}
              <li class="flex flex-wrap items-center gap-3 px-3.5 py-2.5 rounded-xl bg-surface-container-high/50 text-xs border border-outline-variant/10">
                <span class="px-2.5 py-0.5 rounded-full font-semibold text-[10px] {meta.color}">{meta.label()}</span>
                <span class="text-on-surface font-medium truncate">
                  {workflows.find((w) => w.id === execution.workflowId)?.name ?? execution.workflowId}
                </span>
                <span class="text-on-surface-variant/50">{m.wf_exec_nodes_visited({ n: execution.nodeVisits })}</span>
                {#if execution.iterations > 0}
                  <span class="text-on-surface-variant/50">{m.wf_exec_iterations({ n: execution.iterations })}</span>
                {/if}
                {#if execution.resumeAt}
                  <span class="text-amber-300">{m.wf_exec_resume_at({ date: formatDate(execution.resumeAt) })}</span>
                {/if}
                <span class="text-on-surface-variant/40 ml-auto">{formatDate(execution.startedAt)}</span>
                {#if canManageSettings}
                  <button
                    onclick={() => openReplay(execution.id, execution.workflowId)}
                    class="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-surface-container-highest text-on-surface-variant/70 hover:text-on-surface transition-all"
                  >{m.wf_exec_replay()}</button>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>
  {/if}
</ModulePage>
