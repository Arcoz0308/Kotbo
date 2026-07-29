<script lang="ts">
  import { Handle, Position } from '@xyflow/svelte';
  import { PORT_COLORS, getNodeDef, resolveNodeOutputs, type PortDef, type WorkflowGraph } from '@kotbo/shared';

  /**
   * Rendu d'un bloc sur le canvas.
   *
   * Les ports d'exécution sont placés en haut, les ports de données en dessous,
   * ce qui sépare visuellement les deux flux comme dans un éditeur de
   * blueprints. La couleur d'un port encode son type.
   */
  const { id, data, selected }: {
    id: string;
    data: {
      nodeType: string;
      config?: Record<string, unknown>;
      graph: WorkflowGraph;
      hasError?: boolean;
      /** Rang d'exécution lors d'un rejeu, null hors rejeu */
      replayOrder?: number | null;
      replayStatus?: 'OK' | 'ERROR' | 'SKIPPED' | null;
    };
    selected?: boolean;
  } = $props();

  const def = $derived(getNodeDef(data.nodeType));
  const outputs = $derived(
    def ? resolveNodeOutputs({ id, type: data.nodeType, position: { x: 0, y: 0 }, config: data.config }, data.graph) : [],
  );

  const execInputs = $derived(def?.inputs.filter((p) => p.type === 'Exec') ?? []);
  const dataInputs = $derived(def?.inputs.filter((p) => p.type !== 'Exec') ?? []);
  const execOutputs = $derived(outputs.filter((p) => p.type === 'Exec'));
  const dataOutputs = $derived(outputs.filter((p) => p.type !== 'Exec'));

  const CATEGORY_ACCENT: Record<string, string> = {
    trigger: '#ef4444',
    flow: '#eab308',
    action: '#10b981',
    data: '#0ea5e9',
    logic: '#a855f7',
  };

  const accent = $derived(CATEGORY_ACCENT[def?.category ?? 'action'] ?? '#64748b');
  const maxDataRows = $derived(Math.max(dataInputs.length, dataOutputs.length));

  function label(port: PortDef): string {
    return port.label || (port.type === 'Exec' ? '' : port.id);
  }
</script>

<div
  class="rounded-xl border-2 bg-surface-container-high shadow-2xl min-w-56 overflow-visible transition-all relative
    {selected ? 'border-primary ring-2 ring-primary/30' : data.hasError ? 'border-red-500' : 'border-outline-variant/30'}
    {data.replayStatus === 'ERROR' ? 'ring-2 ring-red-500' : ''}
    {data.replayOrder != null ? 'ring-2 ring-amber-400' : ''}"
  style="--accent: {accent}"
>
  <!-- En-tête -->
  <div class="px-3.5 py-2.5 rounded-t-[10px] flex items-center gap-2 border-b border-outline-variant/15" style="background: {accent}2b">
    <span class="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style="background: {accent}"></span>
    <span class="text-xs font-bold text-white tracking-wide truncate">{def?.label ?? data.nodeType}</span>
    {#if data.replayOrder != null}
      <span class="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-400 text-black shadow-sm">
        {data.replayOrder + 1}
      </span>
    {/if}
  </div>

  <!-- Corps des ports -->
  <div class="p-3 space-y-2 text-xs text-slate-200">
    <!-- Ports d'exécution (Exec) -->
    {#if execInputs.length > 0 || execOutputs.length > 0}
      <div class="space-y-1.5 pb-2 border-b border-outline-variant/15">
        {#each execInputs as port}
          <div class="relative flex items-center h-6">
            <Handle
              type="target"
              position={Position.Left}
              id={port.id}
              style="left: -18px; top: 50%; transform: translateY(-50%); background: {PORT_COLORS.Exec}; width: 10px; height: 10px; border-radius: 2px; border: 1px solid rgba(0,0,0,0.5);"
            />
            <span class="font-bold text-white/90">{label(port)}</span>
          </div>
        {/each}

        {#each execOutputs as port}
          <div class="relative flex items-center justify-end h-6">
            <span class="font-bold text-white/90 text-right">{label(port)}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={port.id}
              style="right: -18px; top: 50%; transform: translateY(-50%); background: {PORT_COLORS.Exec}; width: 10px; height: 10px; border-radius: 2px; border: 1px solid rgba(0,0,0,0.5);"
            />
          </div>
        {/each}
      </div>
    {/if}

    <!-- Ports de données (Inputs à gauche, Outputs à droite) -->
    {#if maxDataRows > 0}
      <div class="space-y-1.5">
        {#each Array(maxDataRows) as _, i}
          {@const inputPort = dataInputs[i]}
          {@const outputPort = dataOutputs[i]}
          <div class="flex items-center justify-between h-6 gap-4">
            <!-- Port d'entrée (Gauche) -->
            <div class="relative flex items-center min-w-0 h-6">
              {#if inputPort}
                <Handle
                  type="target"
                  position={Position.Left}
                  id={inputPort.id}
                  style="left: -18px; top: 50%; transform: translateY(-50%); background: {PORT_COLORS[inputPort.type] ?? '#94a3b8'}; width: 10px; height: 10px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.5);"
                />
                <span class="truncate font-medium text-slate-200">{label(inputPort)}</span>
              {/if}
            </div>

            <!-- Port de sortie (Droite) -->
            <div class="relative flex items-center justify-end min-w-0 ml-auto h-6">
              {#if outputPort}
                <span class="truncate text-right font-medium text-slate-200">{label(outputPort)}</span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={outputPort.id}
                  style="right: -18px; top: 50%; transform: translateY(-50%); background: {PORT_COLORS[outputPort.type] ?? '#94a3b8'}; width: 10px; height: 10px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.5);"
                />
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
