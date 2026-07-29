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

  /** Hauteur d'une rangée de ports, alignée sur l'espacement du gabarit. */
  const ROW = 22;
  const HEADER = 44;

  function portTop(index: number, offset: number): number {
    return HEADER + offset + index * ROW;
  }

  function label(port: PortDef): string {
    return port.label || (port.type === 'Exec' ? '' : port.id);
  }
</script>

<div
  class="rounded-xl border-2 bg-surface-container shadow-lg min-w-52 transition-all
    {selected ? 'border-primary' : data.hasError ? 'border-red-500/70' : 'border-outline-variant/20'}
    {data.replayStatus === 'ERROR' ? 'ring-2 ring-red-500' : ''}
    {data.replayOrder != null ? 'ring-2 ring-amber-400' : ''}"
  style="--accent: {accent}"
>
  <!-- En-tête -->
  <div class="px-3 py-2 rounded-t-lg flex items-center gap-2" style="background: {accent}22">
    <span class="w-2 h-2 rounded-full shrink-0" style="background: {accent}"></span>
    <span class="text-xs font-bold text-on-surface truncate">{def?.label ?? data.nodeType}</span>
    {#if data.replayOrder != null}
      <span class="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-400 text-black">
        {data.replayOrder + 1}
      </span>
    {/if}
  </div>

  <!-- Corps : les ports sont positionnés en absolu par rapport à ce bloc -->
  <div class="relative px-3 py-2 text-[11px] text-on-surface-variant/80" style="min-height: {
    Math.max(execInputs.length, execOutputs.length) * ROW
    + Math.max(dataInputs.length, dataOutputs.length) * ROW + 8
  }px">
    <!-- Ports d'exécution -->
    {#each execInputs as port, i}
      <Handle
        type="target"
        position={Position.Left}
        id={port.id}
        style="top: {portTop(i, 0)}px; background: {PORT_COLORS.Exec}; width: 10px; height: 10px; border-radius: 2px;"
      />
    {/each}
    {#each execOutputs as port, i}
      <Handle
        type="source"
        position={Position.Right}
        id={port.id}
        style="top: {portTop(i, 0)}px; background: {PORT_COLORS.Exec}; width: 10px; height: 10px; border-radius: 2px;"
      />
      <div class="absolute right-3 text-right font-semibold text-on-surface/70" style="top: {portTop(i, 0) - HEADER}px">
        {label(port)}
      </div>
    {/each}

    <!-- Ports de données -->
    {#each dataInputs as port, i}
      {@const top = portTop(i, execInputs.length * ROW)}
      <Handle
        type="target"
        position={Position.Left}
        id={port.id}
        style="top: {top}px; background: {PORT_COLORS[port.type]}; width: 9px; height: 9px;"
      />
      <div class="absolute left-3" style="top: {top - HEADER}px">{label(port)}</div>
    {/each}
    {#each dataOutputs as port, i}
      {@const top = portTop(i, execOutputs.length * ROW)}
      <Handle
        type="source"
        position={Position.Right}
        id={port.id}
        style="top: {top}px; background: {PORT_COLORS[port.type]}; width: 9px; height: 9px;"
      />
      <div class="absolute right-3 text-right" style="top: {top - HEADER}px">{label(port)}</div>
    {/each}
  </div>
</div>
