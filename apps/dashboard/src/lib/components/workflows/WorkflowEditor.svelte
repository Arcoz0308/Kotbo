<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteFlow, Background, Controls, type Edge, type Node } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';
  import Papicon from '../Papicon.svelte';
  import WorkflowNodeCard from './WorkflowNodeCard.svelte';
  import { dashboardStore } from '../../stores/dashboard.svelte';
  import { m } from '../../i18n';
  import {
    NODE_CATALOG,
    canConnect,
    getNodeDef,
    resolveNodeOutputs,
    validateGraph,
    hasBlockingIssue,
    type NodeCategory,
    type ValidationIssue,
    type WorkflowGraph,
  } from '@kotbo/shared';

  /**
   * Éditeur de graphe.
   *
   * La validation partagée avec le backend tourne à chaque modification : les
   * problèmes s'affichent en direct et un graphe invalide ne peut pas être
   * enregistré, ni depuis ici ni par un appel API direct.
   */
  const {
    graph = { nodes: [], edges: [] },
    replaySteps = null,
    replayIndex = -1,
    onChange,
  }: {
    graph?: WorkflowGraph;
    /** Étapes d'une exécution rejouée, pour surligner le parcours */
    replaySteps?: { nodeId: string; status: string }[] | null;
    replayIndex?: number;
    onChange?: (graph: WorkflowGraph, issues: ValidationIssue[]) => void;
  } = $props();

  const availableRoles = $derived(dashboardStore.state.discordRoles || []);
  const availableChannels = $derived(dashboardStore.state.discordChannels || []);

  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);
  let selectedId = $state<string | null>(null);
  let selectedEdgeId = $state<string | null>(null);
  let issues = $state<ValidationIssue[]>([]);

  const selectedEdge = $derived(edges.find((e) => e.id === selectedEdgeId));
  const selectedEdgeSourceNode = $derived(
    selectedEdge ? nodes.find((n) => n.id === selectedEdge.source) : undefined,
  );
  const selectedEdgeTargetNode = $derived(
    selectedEdge ? nodes.find((n) => n.id === selectedEdge.target) : undefined,
  );

  function deleteSelectedEdge(): void {
    if (!selectedEdgeId) return;
    edges = edges.filter((e) => e.id !== selectedEdgeId);
    selectedEdgeId = null;
    revalidate();
  }

  const nodeTypes = { kotbo: WorkflowNodeCard };

  const CATEGORY_LABELS: Record<NodeCategory, () => string> = {
    trigger: () => m.wf_palette_trigger(),
    flow: () => m.wf_palette_flow(),
    action: () => m.wf_palette_action(),
    data: () => m.wf_palette_data(),
    logic: () => m.wf_palette_logic(),
  };
  const CATEGORIES: NodeCategory[] = ['trigger', 'flow', 'action', 'data', 'logic'];

  /** Le graphe métier, reconstruit depuis l'état du canvas. */
  function toGraph(): WorkflowGraph {
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: (n.data as { nodeType: string }).nodeType,
        position: n.position,
        config: (n.data as { config?: Record<string, unknown> }).config ?? {},
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle ?? '',
        target: e.target,
        targetHandle: e.targetHandle ?? '',
      })),
    };
  }

  function updateConfigForNode(nodeId: string, key: string, value: unknown): void {
    nodes = nodes.map((n) => (n.id === nodeId
      ? { ...n, data: { ...(n.data as Record<string, unknown>), config: { ...((n.data as { config?: Record<string, unknown> }).config ?? {}), [key]: value } } }
      : n));
    revalidate();
  }

  /** Injecte dans chaque nœud le contexte dont son rendu a besoin. */
  function decorate(current: WorkflowGraph, currentIssues: ValidationIssue[]): void {
    const errored = new Set(currentIssues.filter((i) => i.severity === 'error').map((i) => i.nodeId));
    const replayByNode = new Map<string, { order: number; status: string }>();

    if (replaySteps) {
      replaySteps.slice(0, replayIndex + 1).forEach((step, order) => {
        replayByNode.set(step.nodeId, { order, status: step.status });
      });
    }

    untrack(() => {
      nodes = nodes.map((n) => {
        const replay = replayByNode.get(n.id);
        return {
          ...n,
          data: {
            ...(n.data as Record<string, unknown>),
            graph: current,
            hasError: errored.has(n.id),
            replayOrder: replay?.order ?? null,
            replayStatus: replay?.status ?? null,
            availableRoles,
            availableChannels,
            onUpdateConfig: (key: string, value: unknown) => updateConfigForNode(n.id, key, value),
          },
        };
      });
    });
  }

  let lastLoadedGraph: WorkflowGraph | null = null;

  function revalidate(): void {
    const current = toGraph();
    issues = validateGraph(current);
    decorate(current, issues);
    lastLoadedGraph = current;
    onChange?.(current, issues);
  }

  // Mettre à jour les données des nœuds lorsque les rôles/salons sont chargés
  $effect(() => {
    void availableRoles;
    void availableChannels;
    untrack(() => {
      decorate(toGraph(), issues);
    });
  });

  // Chargement initial : conversion du graphe métier vers l'état du canvas
  $effect(() => {
    const source = graph;
    if (source === lastLoadedGraph) return;
    lastLoadedGraph = source;

    untrack(() => {
      nodes = source.nodes.map((n: any) => ({
        id: n.id,
        type: 'kotbo',
        position: n.position,
        data: { nodeType: n.type, config: n.config ?? {}, graph: source },
      }));
      edges = source.edges.map((e: any) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle,
        target: e.target,
        targetHandle: e.targetHandle,
        animated: isExecEdge(source, e.source, e.sourceHandle),
      }));
      issues = validateGraph(source);
      decorate(source, issues);
    });
  });

  // Le rejeu ne modifie pas le graphe, seulement sa décoration
  $effect(() => {
    void replayIndex;
    void replaySteps;
    untrack(() => {
      decorate(toGraph(), issues);
    });
  });

  function isExecEdge(current: WorkflowGraph, sourceId: string, handle: string): boolean {
    const source = current.nodes.find((n: any) => n.id === sourceId);
    if (!source) return false;
    const port = resolveNodeOutputs(source, current).find((p: { id: string }) => p.id === handle);
    return port?.type === 'Exec';
  }

  let nextId = 0;
  function addNode(type: string): void {
    const def = getNodeDef(type);
    if (!def) return;

    // Un seul déclencheur par workflow : on remplace celui déjà posé
    if (def.category === 'trigger') {
      nodes = nodes.filter((n) => getNodeDef((n.data as { nodeType: string }).nodeType)?.category !== 'trigger');
    }

    const config: Record<string, unknown> = {};
    for (const field of def.config ?? []) {
      if (field.defaultValue !== undefined) config[field.key] = field.defaultValue;
    }

    nodes = [...nodes, {
      id: `${type}-${Date.now()}-${nextId++}`,
      type: 'kotbo',
      position: { x: 120 + Math.random() * 200, y: 80 + Math.random() * 200 },
      data: { nodeType: type, config, graph: toGraph() },
    }];
    revalidate();
  }

  function deleteSelected(): void {
    if (!selectedId) return;
    nodes = nodes.filter((n) => n.id !== selectedId);
    edges = edges.filter((e) => e.source !== selectedId && e.target !== selectedId);
    selectedId = null;
    revalidate();
  }

  /**
   * Refuse une connexion incompatible avant même qu'elle soit créée : c'est ce
   * qui empêche de relier un Membre à un port Rôle.
   */
  function isValidConnection(connection: { source: string; sourceHandle?: string | null; target: string; targetHandle?: string | null }): boolean {
    const current = toGraph();
    const source = current.nodes.find((n: any) => n.id === connection.source);
    const target = current.nodes.find((n: any) => n.id === connection.target);
    if (!source || !target) return false;

    const from = resolveNodeOutputs(source, current).find((p: { id: string }) => p.id === connection.sourceHandle);
    const to = getNodeDef(target.type)?.inputs.find((p: { id: string }) => p.id === connection.targetHandle);
    if (!from || !to) return false;

    return canConnect(from.type, to.type);
  }

  const selectedNode = $derived(nodes.find((n) => n.id === selectedId));
  const selectedDef = $derived(
    selectedNode ? getNodeDef((selectedNode.data as { nodeType: string }).nodeType) : undefined,
  );

  function updateConfig(key: string, value: unknown): void {
    nodes = nodes.map((n) => (n.id === selectedId
      ? { ...n, data: { ...(n.data as Record<string, unknown>), config: { ...((n.data as { config?: Record<string, unknown> }).config ?? {}), [key]: value } } }
      : n));
    revalidate();
  }

  function currentConfig(key: string): unknown {
    return (selectedNode?.data as { config?: Record<string, unknown> })?.config?.[key];
  }

  function updateCase(index: number, value: string): void {
    const cases = [...((currentConfig('cases') as string[]) ?? [])];
    cases[index] = value;
    updateConfig('cases', cases);
  }

  function addCase(): void {
    updateConfig('cases', [...((currentConfig('cases') as string[]) ?? []), 'nouveau']);
  }

  function removeCase(index: number): void {
    const cases = [...((currentConfig('cases') as string[]) ?? [])];
    cases.splice(index, 1);
    updateConfig('cases', cases);
  }

  export function isValid(): boolean {
    return !hasBlockingIssue(issues);
  }
</script>

<div class="flex gap-3 h-[70vh] min-h-[520px]">
  <!-- Palette -->
  <aside class="w-56 shrink-0 overflow-y-auto rounded-2xl bg-surface-container-high/50 border border-outline-variant/10 p-3">
    <h3 class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-1">{m.wf_palette()}</h3>
    <p class="text-[10px] text-on-surface-variant/40 mb-3">{m.wf_palette_hint()}</p>

    {#each CATEGORIES as category}
      <div class="mb-3">
        <h4 class="text-[10px] font-bold text-on-surface-variant/50 mb-1">{CATEGORY_LABELS[category]()}</h4>
        <div class="space-y-1">
          {#each NODE_CATALOG.filter((d: any) => d.category === category) as def}
            <button
              onclick={() => addNode(def.type)}
              title={def.description}
              class="w-full text-left px-2 py-1.5 rounded-lg text-[11px] bg-surface-container-highest/60 text-on-surface hover:bg-surface-container-highest transition-colors"
            >{def.label}</button>
          {/each}
        </div>
      </div>
    {/each}
  </aside>

  <!-- Canvas -->
  <div class="flex-1 rounded-2xl overflow-hidden border border-outline-variant/10 bg-surface-container-low">
    <SvelteFlow
      bind:nodes
      bind:edges
      {nodeTypes}
      {isValidConnection}
      fitView
      deleteKeyCode={['Delete', 'Backspace']}
      proOptions={{ hideAttribution: true }}
      onconnect={revalidate}
      ondelete={revalidate}
      onnodedragstop={revalidate}
      onnodeclick={({ node }: { node: any }) => { selectedId = node.id; selectedEdgeId = null; }}
      onedgeclick={({ edge }: { edge: any }) => { selectedEdgeId = edge.id; selectedId = null; }}
      onpaneclick={() => { selectedId = null; selectedEdgeId = null; }}
    >
      <Background variant="dots" gap={18} size={1.2} color="rgba(255, 255, 255, 0.12)" />
      <Controls />
    </SvelteFlow>
  </div>

  <!-- Panneau latéral : configuration et problèmes -->
  <aside class="w-64 shrink-0 overflow-y-auto rounded-2xl bg-surface-container-high/50 border border-outline-variant/10 p-3 space-y-4">
    {#if selectedEdge}
      <div class="p-3 rounded-xl bg-surface-container-highest/60 border border-outline-variant/20 space-y-2">
        <div class="flex items-center justify-between">
          <h3 class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/70">Liaison sélectionnée</h3>
          <button
            onclick={deleteSelectedEdge}
            class="px-2 py-1 rounded-lg text-xs font-semibold text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors flex items-center gap-1"
            title="Supprimer la liaison"
          >
            <Papicon icon="Trash" size={12} />
            <span>Supprimer</span>
          </button>
        </div>
        <p class="text-[11px] text-on-surface-variant/80">
          Relie <span class="font-semibold text-on-surface">{getNodeDef((selectedEdgeSourceNode?.data as any)?.nodeType)?.label ?? selectedEdge?.source}</span>
          à <span class="font-semibold text-on-surface">{getNodeDef((selectedEdgeTargetNode?.data as any)?.nodeType)?.label ?? selectedEdge?.target}</span>
        </p>
        <p class="text-[10px] text-on-surface-variant/50">Astuce : vous pouvez aussi appuyer sur Suppr ou Retour arrière pour la supprimer.</p>
      </div>
    {:else if selectedNode && selectedDef}
      <div>
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">{m.wf_node_config()}</h3>
          <button
            onclick={deleteSelected}
            class="p-1 rounded text-red-400 hover:bg-red-500/10 transition-colors"
            title={m.wf_delete_node()}
          >
            <Papicon icon="Trash" size={13} />
          </button>
        </div>
        <p class="text-xs font-semibold text-on-surface">{selectedDef.label}</p>
        <p class="text-[10px] text-on-surface-variant/50 mb-3">{selectedDef.description}</p>

        {#each selectedDef.config ?? [] as field}
          <div class="space-y-1 mb-2.5">
            <label for="cfg-{field.key}" class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">
              {field.label}
            </label>

            {#if field.type === 'cases'}
              <div class="space-y-1">
                {#each (currentConfig('cases') as string[]) ?? [] as caseValue, index}
                  <div class="flex gap-1">
                    <input
                      value={caseValue}
                      oninput={(e) => updateCase(index, e.currentTarget.value)}
                      class="flex-1 px-2 py-1 rounded-lg bg-surface-container-highest border border-outline-variant/20 text-[11px] text-on-surface"
                    />
                    <button onclick={() => removeCase(index)} class="px-1.5 rounded text-red-400 hover:bg-red-500/10">
                      <Papicon icon="X" size={11} />
                    </button>
                  </div>
                {/each}
                <button
                  onclick={addCase}
                  class="w-full px-2 py-1 rounded-lg text-[10px] bg-surface-container-highest text-on-surface-variant/70 hover:text-on-surface"
                >{m.wf_switch_add_case()}</button>
              </div>
            {:else if field.type === 'boolean'}
              <input
                id="cfg-{field.key}"
                type="checkbox"
                checked={Boolean(currentConfig(field.key))}
                onchange={(e) => updateConfig(field.key, e.currentTarget.checked)}
                class="w-4 h-4 rounded accent-primary"
              />
            {:else if field.type === 'number'}
              <input
                id="cfg-{field.key}"
                type="number"
                min={field.min}
                max={field.max}
                value={Number(currentConfig(field.key) ?? field.defaultValue ?? 0)}
                oninput={(e) => updateConfig(field.key, Number(e.currentTarget.value))}
                class="w-full px-2 py-1 rounded-lg bg-surface-container-highest border border-outline-variant/20 text-[11px] text-on-surface"
              />
            {:else if field.type === 'role' || field.type === 'channel'}
              <select
                id="cfg-{field.key}"
                value={String(currentConfig(field.key) ?? '')}
                onchange={(e) => updateConfig(field.key, e.currentTarget.value)}
                class="w-full px-2 py-1 rounded-lg bg-surface-container-highest border border-outline-variant/20 text-[11px] text-on-surface"
              >
                <option value="">—</option>
                {#each (field.type === 'role' ? availableRoles : availableChannels) as option}
                  <option value={option.id}>{field.type === 'role' ? '@' : '#'}{option.name}</option>
                {/each}
              </select>
            {:else if field.type === 'select'}
              <select
                id="cfg-{field.key}"
                value={String(currentConfig(field.key) ?? field.defaultValue ?? '')}
                onchange={(e) => updateConfig(field.key, e.currentTarget.value)}
                class="w-full px-2 py-1 rounded-lg bg-surface-container-highest border border-outline-variant/20 text-[11px] text-on-surface"
              >
                {#each field.options ?? [] as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            {:else if field.type === 'textarea'}
              <textarea
                id="cfg-{field.key}"
                rows="3"
                value={String(currentConfig(field.key) ?? '')}
                oninput={(e) => updateConfig(field.key, e.currentTarget.value)}
                placeholder={field.placeholder}
                class="w-full px-2 py-1 rounded-lg bg-surface-container-highest border border-outline-variant/20 text-[11px] text-on-surface"
              ></textarea>
            {:else}
              <input
                id="cfg-{field.key}"
                type="text"
                value={String(currentConfig(field.key) ?? '')}
                oninput={(e) => updateConfig(field.key, e.currentTarget.value)}
                placeholder={field.placeholder}
                class="w-full px-2 py-1 rounded-lg bg-surface-container-highest border border-outline-variant/20 text-[11px] text-on-surface"
              />
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <div class="p-3 rounded-xl bg-surface-container-highest/40 border border-outline-variant/15 space-y-2">
        <h3 class="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-1.5">
          <Papicon icon="Info" size={13} />
          <span>Configuration des nœuds</span>
        </h3>
        <p class="text-[11px] text-on-surface-variant/80 leading-relaxed">
          Pour choisir un <strong>Rôle</strong>, un <strong>Salon</strong> ou régler une valeur :
        </p>
        <ul class="text-[10px] text-on-surface-variant/70 space-y-1.5 list-disc pl-3">
          <li><strong>Directement sur le nœud :</strong> Utilisez les menus déroulants intégrés au nœud sur le canevas.</li>
          <li><strong>Dans ce panneau :</strong> Cliquez sur un nœud pour afficher ses paramètres ici.</li>
          <li><strong>Relier les nœuds :</strong> Glissez un fil du port de sortie (ex: <em>Rôle</em>) vers le port d'entrée d'une action (ex: <em>Ajouter un rôle</em>).</li>
        </ul>
      </div>
    {/if}

    <!-- Problèmes de validation -->
    <div>
      <h3 class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-2">{m.wf_issues()}</h3>
      {#if issues.length === 0}
        <p class="text-[11px] text-emerald-400 flex items-center gap-1.5">
          <Papicon icon="Check" size={12} /> {m.wf_no_issues()}
        </p>
      {:else}
        <ul class="space-y-1.5">
          {#each issues as issue}
            <li
              class="px-2 py-1.5 rounded-lg text-[10px] leading-snug {issue.severity === 'error'
                ? 'bg-red-500/10 text-red-300'
                : 'bg-amber-500/10 text-amber-300'}"
            >{issue.message}</li>
          {/each}
        </ul>
      {/if}
    </div>
  </aside>
</div>

<style>
  :global(.svelte-flow__attribution) {
    display: none !important;
  }

  :global(.svelte-flow__controls) {
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5) !important;
    border-radius: 0.75rem !important;
    overflow: hidden !important;
    border: 1px solid rgba(255, 255, 255, 0.15) !important;
    background: #181b22 !important;
  }

  :global(.svelte-flow__controls-button) {
    background: #181b22 !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
    color: #f1f5f9 !important;
    fill: #f1f5f9 !important;
    width: 28px !important;
    height: 28px !important;
    transition: background-color 0.15s ease, color 0.15s ease !important;
  }

  :global(.svelte-flow__controls-button:hover) {
    background: rgba(255, 255, 255, 0.12) !important;
    color: #ffffff !important;
  }

  :global(.svelte-flow__controls-button svg) {
    fill: currentColor !important;
    stroke: currentColor !important;
  }

  :global(.svelte-flow__handle) {
    transition: transform 0.15s ease, box-shadow 0.15s ease !important;
    z-index: 10 !important;
  }

  :global(.svelte-flow__handle:hover) {
    transform: translateY(-50%) scale(1.3) !important;
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.6) !important;
    z-index: 20 !important;
  }

  :global(.svelte-flow__edge-path) {
    stroke-width: 2.5px !important;
    transition: stroke 0.15s ease, stroke-width 0.15s ease !important;
  }

  :global(.svelte-flow__edge:hover .svelte-flow__edge-path) {
    stroke: #38bdf8 !important;
    stroke-width: 3.5px !important;
    cursor: pointer !important;
  }

  :global(.svelte-flow__edge.selected .svelte-flow__edge-path) {
    stroke: #ef4444 !important;
    stroke-width: 3.5px !important;
  }
</style>
