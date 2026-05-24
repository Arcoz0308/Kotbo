<script lang="ts">
  import { onMount } from 'svelte';
  import Papicon from '../Papicon.svelte';

  interface Node {
    id: string;
    label: string;
    type: 'user' | 'target';
    avatar?: string | null;
  }

  interface Edge {
    from: string;
    to: string;
    type: 'mention' | 'reply' | 'reaction';
    count: number;
  }

  let { 
    nodes = [], 
    edges = [],
    onSelectNode = (id: string) => {}
  }: { 
    nodes: Node[], 
    edges: Edge[],
    onSelectNode?: (id: string) => void
  } = $props();

  let container: HTMLDivElement;
  let width = $state(600);
  let height = $state(450);

  // Hover states
  let hoveredNodeId = $state<string | null>(null);
  let hoveredEdge = $state<any | null>(null);

  // Deterministically position nodes in a gorgeous, responsive, symmetrical radial tree layout
  let positionedNodes = $derived.by(() => {
    if (nodes.length === 0) return [];

    const centerNode = nodes.find(n => n.type === 'user') || nodes[0];
    const otherNodes = nodes.filter(n => n.id !== centerNode.id);

    const w = width;
    const h = height;

    const result = [{
      ...centerNode,
      x: w / 2,
      y: h / 2,
      lx: 0,
      ly: 42
    }];

    // Generous, mathematically optimized radius calculation that pushes target nodes as far outward
    // as possible while maintaining perfect safety bounds against top/bottom and left/right limits
    const maxRadius = Math.min((w - 160) / 2, (h - 90) / 2);
    const radius = Math.max(180, Math.min(250, maxRadius));

    otherNodes.forEach((node, i) => {
      // Symmetrical circular distribution
      const angle = (i / otherNodes.length) * 2 * Math.PI - Math.PI / 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      // Pushed outward radially so label cards form a gorgeous outer halo and never collide
      const labelDist = 65;
      const lx = labelDist * cosA;
      const ly = labelDist * sinA;

      result.push({
        ...node,
        x: w / 2 + radius * cosA,
        y: h / 2 + radius * sinA,
        lx,
        ly
      });
    });

    return result;
  });

  // Group edges by target node id to draw exactly one connection line per node pair
  let groupedEdges = $derived.by(() => {
    if (nodes.length === 0 || edges.length === 0) return [];

    const centerNode = nodes.find(n => n.type === 'user') || nodes[0];
    const otherNodes = nodes.filter(n => n.id !== centerNode.id);

    return otherNodes.map(targetNode => {
      // Find all edges between centerNode and targetNode
      const connectedEdges = edges.filter(e => 
        (e.from === centerNode.id && e.to === targetNode.id) ||
        (e.from === targetNode.id && e.to === centerNode.id)
      );

      if (connectedEdges.length === 0) return null;

      const mentionEdge = connectedEdges.find(e => e.type === 'mention');
      const replyEdge = connectedEdges.find(e => e.type === 'reply');
      const reactionEdge = connectedEdges.find(e => e.type === 'reaction');

      const mentionCount = mentionEdge?.count || 0;
      const replyCount = replyEdge?.count || 0;
      const reactionCount = reactionEdge?.count || 0;
      const totalCount = mentionCount + replyCount + reactionCount;

      // Determine strongest type for dominancy coloring & arrowheads
      let strongestType: 'mention' | 'reply' | 'reaction' = 'mention';
      let maxCount = mentionCount;
      if (replyCount > maxCount) {
        strongestType = 'reply';
        maxCount = replyCount;
      }
      if (reactionCount > maxCount) {
        strongestType = 'reaction';
        maxCount = reactionCount;
      }

      const strongestEdge = connectedEdges.find(e => e.type === strongestType) || connectedEdges[0];

      return {
        targetId: targetNode.id,
        from: strongestEdge.from,
        to: strongestEdge.to,
        strongestType,
        mentionCount,
        replyCount,
        reactionCount,
        totalCount
      };
    }).filter(Boolean);
  });

  // Calculate curved path coordinates from positioned nodes for single consolidated lines
  let edgesWithCoords = $derived.by(() => {
    return groupedEdges.map(edge => {
      const fromNode = positionedNodes.find(n => n.id === edge.from);
      const toNode = positionedNodes.find(n => n.id === edge.to);
      if (!fromNode || !toNode) return null;

      const x1 = fromNode.x;
      const y1 = fromNode.y;
      const x2 = toNode.x;
      const y2 = toNode.y;

      const dx = x2 - x1;
      const dy = y2 - y1;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;

      // circular node padding limits
      const R_start = fromNode.type === 'user' ? 34 : 25;
      const R_end = toNode.type === 'user' ? 34 : 25;

      const sx = x1 + ux * R_start;
      const sy = y1 + uy * R_start;
      const tx = x2 - ux * R_end;
      const ty = y2 - uy * R_end;

      // Symmetrical curved Bezier layout (uniform swirl of 18px for an absolute premium aesthetic)
      const mx = (sx + tx) / 2;
      const my = (sy + ty) / 2;
      const px = -uy;
      const py = ux;

      const cx = mx + px * 18;
      const cy = my + py * 18;

      const bx = 0.25 * sx + 0.5 * cx + 0.25 * tx;
      const by = 0.25 * sy + 0.5 * cy + 0.25 * ty;

      const activeCount = (edge.mentionCount > 0 ? 1 : 0) + (edge.replyCount > 0 ? 1 : 0) + (edge.reactionCount > 0 ? 1 : 0);
      const pillW = 34 + (activeCount - 1) * 26;

      return {
        ...edge,
        sx, sy, tx, ty, cx, cy, bx, by, pillW
      };
    }).filter(Boolean);
  });

  function getEdgeColorClass(type: string) {
    switch (type) {
      case 'mention': return 'stroke-primary text-primary';
      case 'reply': return 'stroke-secondary text-secondary';
      case 'reaction': return 'stroke-emerald-500 text-emerald-500';
      default: return 'stroke-outline-variant text-outline-variant';
    }
  }

  // Interactive Drag & Pan Board State
  let panX = $state(0);
  let panY = $state(0);
  let isDragging = $state(false);

  let startX = 0;
  let startY = 0;
  let downX = 0;
  let downY = 0;

  function startDrag(e: MouseEvent) {
    // Only allow left mouse button clicks to drag/pan the board
    if (e.button !== 0) return;
    
    isDragging = true;
    startX = e.clientX - panX;
    startY = e.clientY - panY;
    downX = e.clientX;
    downY = e.clientY;
  }

  function drag(e: MouseEvent) {
    if (!isDragging) return;
    panX = e.clientX - startX;
    panY = e.clientY - startY;
  }

  function endDrag() {
    isDragging = false;
  }

  onMount(() => {
    // High-fidelity ResizeObserver to adapt container dimensions perfectly on modals & tab transitions
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        width = entry.contentRect.width || 600;
        height = entry.contentRect.height || 450;
      }
    });

    if (container) {
      resizeObserver.observe(container);
    }

    return () => {
      resizeObserver.disconnect();
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div 
  bind:this={container} 
  class="relative h-full w-full bg-surface-container-low/20 rounded-[3rem] border border-outline-variant/10 overflow-hidden group select-none transition-all duration-300"
  class:cursor-grab={!isDragging}
  class:cursor-grabbing={isDragging}
  onmousedown={startDrag}
  onmousemove={drag}
  onmouseup={endDrag}
  onmouseleave={endDrag}
>
  {#if nodes.length === 0}
    <div class="absolute inset-0 flex flex-col items-center justify-center text-on-surface-variant/20">
      <Papicon icon="share-2" size={48} />
      <p class="mt-4 text-xs font-black uppercase tracking-widest">Aucune interaction détectée</p>
    </div>
  {:else}
    <!-- Active Info Hover Banner -->
    <div class="absolute top-6 left-6 right-6 flex items-center justify-between pointer-events-none z-10">
      {#if hoveredNodeId}
        {@const hoveredNode = nodes.find(n => n.id === hoveredNodeId)}
        {#if hoveredNode}
          <div class="backdrop-blur-md bg-primary/10 border border-primary/20 px-4 py-2 rounded-2xl animate-fade-in">
            <span class="text-[9px] font-black uppercase tracking-widest text-primary">
              Ciblé : {hoveredNode.label}
            </span>
          </div>
        {/if}
      {/if}
    </div>

    <!-- Main Network SVG Canvas -->
    <svg {width} {height} class="overflow-visible w-full h-full relative z-0">
      <defs>
        <!-- Glowing Arrowhead Markers -->
        <marker id="arrowhead-mention" markerWidth="8" markerHeight="6" refX="4" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" class="fill-primary" />
        </marker>
        <marker id="arrowhead-reply" markerWidth="8" markerHeight="6" refX="4" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" class="fill-secondary" />
        </marker>
        <marker id="arrowhead-reaction" markerWidth="8" markerHeight="6" refX="4" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" class="fill-emerald-500" />
        </marker>
      </defs>

      <g transform="translate({panX}, {panY})">

      <!-- Edges (Rendered under Nodes) -->
      {#each edgesWithCoords as edge}
        <g class="edge-group transition-all duration-300">
          <path 
            d="M {edge.sx} {edge.sy} Q {edge.cx} {edge.cy} {edge.tx} {edge.ty}" 
            fill="none" 
            class="{getEdgeColorClass(edge.strongestType)} edge-path opacity-25 group-hover:opacity-40 transition-all duration-300"
            stroke-width={Math.min(10, Math.log10(edge.totalCount + 1) * 4 + 1.5)}
            marker-end="url(#arrowhead-{edge.strongestType})"
          />

          <!-- Invisible thick interaction overlay to make hovering super easy and satisfying -->
          <path 
            d="M {edge.sx} {edge.sy} Q {edge.cx} {edge.cy} {edge.tx} {edge.ty}" 
            fill="none" 
            stroke="transparent"
            stroke-width="20"
            class="cursor-pointer"
            onmouseenter={() => hoveredEdge = edge}
            onmouseleave={() => hoveredEdge = null}
          />

          <!-- Glassmorphic Dynamic Pill Count Badge along Curve -->
          <g 
            transform="translate({edge.bx}, {edge.by})"
            class="cursor-default pointer-events-none transition-opacity duration-500"
          >
            <rect 
              x={-edge.pillW / 2} y="-8" 
              width={edge.pillW} height="16" 
              rx="6" 
              class="badge-rect shadow-lg" 
              stroke-width="1.5"
              stroke-opacity="0.4"
            />
            <text 
              text-anchor="middle" 
              dy="3.5" 
              class="text-[8px] font-black tracking-wider"
            >
              {#if edge.mentionCount > 0}
                <tspan class="badge-tspan-mention">@{edge.mentionCount}</tspan>
              {/if}
              {#if edge.replyCount > 0}
                {#if edge.mentionCount > 0}
                  <tspan class="badge-tspan-separator"> | </tspan>
                {/if}
                <tspan class="badge-tspan-reply">💬{edge.replyCount}</tspan>
              {/if}
              {#if edge.reactionCount > 0}
                {#if edge.mentionCount > 0 || edge.replyCount > 0}
                  <tspan class="badge-tspan-separator"> | </tspan>
                {/if}
                <tspan class="badge-tspan-reaction">😊{edge.reactionCount}</tspan>
              {/if}
            </text>
          </g>
        </g>
      {/each}

      <!-- Nodes -->
      {#each positionedNodes as node}
        <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
        <g 
          transform="translate({node.x}, {node.y})" 
          class="node-group cursor-pointer"
          onmouseenter={() => hoveredNodeId = node.id}
          onmouseleave={() => hoveredNodeId = null}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && node.type !== 'user' && onSelectNode(node.id)}
        >
          <!-- Outer Neon Halo Glow -->
          <circle 
            r={node.type === 'user' ? 34 : 25} 
            class="fill-none stroke-current transition-opacity duration-300"
            class:text-primary={node.type === 'user'}
            class:text-secondary={node.type !== 'user' && hoveredNodeId === node.id}
            class:text-outline-variant={node.type !== 'user' && hoveredNodeId !== node.id}
            stroke-width="2"
            opacity={hoveredNodeId === node.id ? 0.8 : 0.2}
          />

          <!-- Main Core Circle -->
          <circle 
            r={node.type === 'user' ? 30 : 21} 
            class="{node.type === 'user' ? 'fill-primary shadow-[0_0_12px_rgba(var(--color-primary),0.3)]' : 'fill-surface-container-highest'} stroke-outline-variant/10 shadow-xl"
            stroke-width="1.5"
          />
          
          <!-- Avatar or First Initial -->
          {#if node.avatar}
            <clipPath id="avatar-clip-{node.id}">
              <circle r={node.type === 'user' ? 28 : 19} />
            </clipPath>
            <image 
              href={node.avatar} 
              x={node.type === 'user' ? -28 : -19} 
              y={node.type === 'user' ? -28 : -19} 
              width={node.type === 'user' ? 56 : 38} 
              height={node.type === 'user' ? 56 : 38} 
              clip-path="url(#avatar-clip-{node.id})"
            />
          {:else}
            <text 
              text-anchor="middle" 
              dy="4" 
              class="fill-on-surface text-[10px] font-black uppercase tracking-wider"
            >
              {node.label.slice(0, 1)}
            </text>
          {/if}

          <!-- Transparent high-precision click shield over the avatar to intercept all clicks/hovers flawlessly -->
          <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <circle 
            r={node.type === 'user' ? 30 : 21}
            fill="transparent"
            class="cursor-pointer"
            role="button"
            tabindex="-1"
            onclick={(e) => {
              e.stopPropagation();
              const dx = Math.abs(e.clientX - downX);
              const dy = Math.abs(e.clientY - downY);
              if (dx < 6 && dy < 6 && node.type !== 'user') {
                onSelectNode(node.id);
              }
            }}
          />

          <!-- Floating Name Label Card (Pushed outwards radially to form a perfect, collision-free outer halo) -->
          <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <g 
            transform="translate({node.lx}, {node.ly})"
            class="cursor-pointer"
            role="button"
            tabindex="-1"
            onclick={(e) => {
              e.stopPropagation();
              const dx = Math.abs(e.clientX - downX);
              const dy = Math.abs(e.clientY - downY);
              if (dx < 6 && dy < 6 && node.type !== 'user') {
                onSelectNode(node.id);
              }
            }}
          >
            <rect 
              x="-40" y="-8" 
              width="80" height="16" 
              rx="6" 
              class="fill-surface-container-low/85 backdrop-blur-md stroke-outline-variant/10 shadow-md transition-colors" 
              class:fill-primary-container={hoveredNodeId === node.id && node.type === 'user'}
              class:fill-secondary-container={hoveredNodeId === node.id && node.type !== 'user'}
            />
            <text 
              text-anchor="middle" 
              dy="3.5" 
              class="fill-on-surface text-[7.5px] font-black truncate max-w-[72px]"
            >
              {node.label}
            </text>
          </g>
        </g>
      {/each}
      </g>
    </svg>

    <!-- Custom Micro-Tooltip overlay -->
    {#if hoveredEdge}
      {@const source = nodes.find(n => n.id === hoveredEdge.from)?.label || 'Utilisateur'}
      {@const target = nodes.find(n => n.id === hoveredEdge.to)?.label || 'Cible'}
      <div 
        class="absolute bottom-6 left-6 right-6 backdrop-blur-md p-4 rounded-3xl flex flex-col gap-2 animate-fade-in z-10 details-card"
      >
        <div class="flex items-center justify-between border-b border-slate-500/10 pb-2">
          <div class="text-[9px] font-black uppercase tracking-[0.2em] details-title">
            Détails des Interactions
          </div>
          <div class="text-[10px] font-black truncate details-member-path">
            {source} ➔ {target}
          </div>
        </div>
        <div class="flex gap-4 items-center mt-1">
          {#if hoveredEdge.mentionCount > 0}
            <div class="flex items-center gap-1.5">
              <div class="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_6px_#3b82f6]"></div>
              <span class="text-[8.5px] font-black uppercase tracking-widest details-count-text">＠ {hoveredEdge.mentionCount} Mentions</span>
            </div>
          {/if}
          {#if hoveredEdge.replyCount > 0}
            <div class="flex items-center gap-1.5">
              <div class="h-2 w-2 rounded-full bg-violet-500 shadow-[0_0_6px_#8b5cf6]"></div>
              <span class="text-[8.5px] font-black uppercase tracking-widest details-count-text">💬 {hoveredEdge.replyCount} Réponses</span>
            </div>
          {/if}
          {#if hoveredEdge.reactionCount > 0}
            <div class="flex items-center gap-1.5">
              <div class="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]"></div>
              <span class="text-[8.5px] font-black uppercase tracking-widest details-count-text">😊 {hoveredEdge.reactionCount} Réactions</span>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  svg {
    filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.15));
  }

  .edge-path {
    transition: stroke-width 0.2s, opacity 0.2s;
    stroke-dasharray: 1000;
    stroke-dashoffset: 1000;
    animation: drawPath 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  .edge-group:hover .edge-path {
    opacity: 0.95 !important;
    filter: drop-shadow(0 0 4px currentColor);
  }

  .node-group {
    transform-origin: center;
    transform-box: fill-box;
    /* Smooth premium fanning out transit whenever positions are calculated */
    transition: transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .animate-fade-in {
    animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes drawPath {
    to { stroke-dashoffset: 0; }
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Theme-aware high contrast styling for inline SVG badges and tooltip detail cards */
  .badge-rect {
    fill: #ffffff;
    stroke: #e2e8f0;
  }
  .badge-tspan-mention {
    fill: #2563eb; /* rich high contrast blue */
  }
  .badge-tspan-reply {
    fill: #7c3aed; /* rich high contrast purple */
  }
  .badge-tspan-reaction {
    fill: #059669; /* rich high contrast green */
  }
  .badge-tspan-separator {
    fill: #94a3b8;
    opacity: 0.5;
  }

  .details-card {
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid #e2e8f0;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  }
  .details-title {
    color: #2563eb;
  }
  .details-member-path {
    color: #0f172a;
  }
  .details-count-text {
    color: #334155;
  }

  :global(.dark) .badge-rect {
    fill: #1e293b; /* deep slate navy */
    stroke: #334155;
  }
  :global(.dark) .badge-tspan-mention {
    fill: #60a5fa; /* bright sky blue */
  }
  :global(.dark) .badge-tspan-reply {
    fill: #c084fc; /* bright purple/pink */
  }
  :global(.dark) .badge-tspan-reaction {
    fill: #34d399; /* bright emerald */
  }
  :global(.dark) .badge-tspan-separator {
    fill: #475569;
    opacity: 0.7;
  }

  :global(.dark) .details-card {
    background: rgba(15, 23, 42, 0.95);
    border: 1px solid rgba(51, 65, 85, 0.5);
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  }
  :global(.dark) .details-title {
    color: #60a5fa;
  }
  :global(.dark) .details-member-path {
    color: #f8fafc;
  }
  :global(.dark) .details-count-text {
    color: #cbd5e1;
  }
</style>
