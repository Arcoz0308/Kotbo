<script lang="ts">
  import { onMount } from 'svelte';
  import Papicon from '../Papicon.svelte';
  import { MessageSquare, ThumbsUp, AtSign, Compass, Maximize2, RotateCcw } from 'lucide-svelte';

  interface GraphNode {
    id: string;
    label: string;
    avatar?: string | null;
    activityCount: number;
  }

  interface GraphEdge {
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
    nodes: GraphNode[];
    edges: GraphEdge[];
    onSelectNode?: (id: string) => void;
  } = $props();

  let container = $state<HTMLDivElement | null>(null);
  let width = $state(800);
  let height = $state(550);

  // Pan & Zoom
  let panX = $state(0);
  let panY = $state(0);
  let zoom = $state(1);
  let isPanning = $state(false);
  let startPanX = $state(0);
  let startPanY = $state(0);

  // Selected / Hovered items
  let selectedNodeId = $state<string | null>(null);
  let hoveredNodeId = $state<string | null>(null);
  let hoveredEdge = $state<any | null>(null);

  // Zoom & Pan listeners
  function handleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return; // Only pan on left click!
    isPanning = true;
    startPanX = e.clientX - panX;
    startPanY = e.clientY - panY;
  }

  function handleMouseMove(e: MouseEvent) {
    if (isPanning) {
      panX = e.clientX - startPanX;
      panY = e.clientY - startPanY;
    }
  }

  function handleMouseUp() {
    isPanning = false;
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const zoomFactor = 1.1;
    if (e.deltaY < 0) {
      zoom = Math.min(zoom * zoomFactor, 3);
    } else {
      zoom = Math.max(zoom / zoomFactor, 0.4);
    }
  }

  function resetGraph() {
    panX = 0;
    panY = 0;
    zoom = 1;
    selectedNodeId = null;
  }

  // Deterministically position nodes in a gorgeous community-clustered social network graph (Facebook-style)
  let positionedNodes = $derived.by(() => {
    const w = width || 800;
    const h = height || 550;
    const cx = w / 2;
    const cy = h / 2;

    const safeNodes = nodes || [];
    if (safeNodes.length === 0) return [];

    // Sort by activityCount descending
    const sorted = [...safeNodes].sort((a, b) => b.activityCount - a.activityCount);
    const totalCount = sorted.length;

    // Dynamically adjust node sizes depending on the total count of nodes to prevent any overlapping!
    const sizeFactor = totalCount > 120 ? 0.55 : totalCount > 70 ? 0.75 : 1.0;

    const result: any[] = [];

    // 1. Identify Community Hubs (top 5 most active users represent communities/clusters)
    const k = Math.min(5, sorted.length);
    const hubs = sorted.slice(0, k);
    const remaining = sorted.slice(k);

    // Position the 5 Hubs in a gorgeous spacious circle around the canvas center
    const R_hubs = Math.min(w, h) * 0.33; // proportional hub orbit radius
    const hubPositions = new Map<string, {x: number, y: number, angle: number}>();

    hubs.forEach((hub, index) => {
      const angle = (index / k) * 2 * Math.PI - Math.PI / 2;
      const hx = cx + R_hubs * Math.cos(angle);
      const hy = cy + R_hubs * Math.sin(angle);
      const radius = 28 * sizeFactor;

      hubPositions.set(hub.id, { x: hx, y: hy, angle });

      result.push({
        ...hub,
        x: hx,
        y: hy,
        radius,
        isHub: true,
        isCenter: index === 0, // Mark the single most active as main center for display compatibility
        hubAngle: angle,
        hubId: hub.id
      });
    });

    if (remaining.length === 0) return result;

    // 2. Assign each remaining user to their strongest connected hub (based on edges)
    // If no direct connection, assign to the hub that has the fewest members to keep the clusters balanced!
    const hubGroups = new Map<string, any[]>();
    hubs.forEach(h => hubGroups.set(h.id, []));

    remaining.forEach(node => {
      // Find strongest edge connection to any hub
      let bestHubId = '';
      let maxCount = -1;

      edges.forEach(edge => {
        if (edge.from === node.id || edge.to === node.id) {
          const otherId = edge.from === node.id ? edge.to : edge.from;
          if (hubPositions.has(otherId) && edge.count > maxCount) {
            maxCount = edge.count;
            bestHubId = otherId;
          }
        }
      });

      if (!bestHubId) {
        // Fallback: assign to the hub with the smallest current cluster size to keep the graph perfectly balanced and visual!
        let minSize = Infinity;
        let selectedHubId = hubs[0].id;
        hubs.forEach(h => {
          const size = hubGroups.get(h.id)?.length ?? 0;
          if (size < minSize) {
            minSize = size;
            selectedHubId = h.id;
          }
        });
        bestHubId = selectedHubId;
      }

      hubGroups.get(bestHubId)?.push(node);
    });

    // 3. Cluster members around their respective hub in deterministic concentric sub-orbits
    hubs.forEach(hub => {
      const group = hubGroups.get(hub.id) || [];
      // Sort group by activity
      group.sort((a, b) => b.activityCount - a.activityCount);

      const hubPos = hubPositions.get(hub.id)!;

      // Concentric rings around this specific hub!
      const r1Limit = 6;
      const r2Limit = 12;

      const ring1 = group.slice(0, r1Limit);
      const ring2 = group.slice(r1Limit, r1Limit + r2Limit);
      const ring3 = group.slice(r1Limit + r2Limit);

      // Position Ring 1
      ring1.forEach((node, i) => {
        const angle = (i / ring1.length) * 2 * Math.PI + hubPos.angle;
        const radius = 17 * sizeFactor;
        const x = hubPos.x + 48 * Math.cos(angle);
        const y = hubPos.y + 48 * Math.sin(angle);

        result.push({
          ...node,
          x, y, radius, isHub: false, hubId: hub.id
        });
      });

      // Position Ring 2
      ring2.forEach((node, i) => {
        const angle = (i / ring2.length) * 2 * Math.PI - hubPos.angle;
        const radius = 13 * sizeFactor;
        const x = hubPos.x + 85 * Math.cos(angle);
        const y = hubPos.y + 85 * Math.sin(angle);

        result.push({
          ...node,
          x, y, radius, isHub: false, hubId: hub.id
        });
      });

      // Position Ring 3
      ring3.forEach((node, i) => {
        const angle = (i / ring3.length) * 2 * Math.PI + hubPos.angle;
        const radius = 10 * sizeFactor;
        const x = hubPos.x + 120 * Math.cos(angle);
        const y = hubPos.y + 120 * Math.sin(angle);

        result.push({
          ...node,
          x, y, radius, isHub: false, hubId: hub.id
        });
      });
    });

    // Apply Dimming if there is a hovered node
    return result.map(node => {
      const isDimmed = hoveredNodeId ? (node.id !== hoveredNodeId && !edges.some(e => 
        (e.from === hoveredNodeId && e.to === node.id) || 
        (e.from === node.id && e.to === hoveredNodeId)
      )) : false;

      return { ...node, isDimmed };
    });
  });

  // Group edges between any two users to avoid multiple lines
  let groupedEdges = $derived.by(() => {
    const safeEdges = edges || [];
    const pairMap = new Map<string, any>();

    safeEdges.forEach(edge => {
      const u1 = edge.from;
      const u2 = edge.to;
      const key = u1 < u2 ? `${u1}-${u2}` : `${u2}-${u1}`;

      let pair = pairMap.get(key);
      if (!pair) {
        pair = {
          from: u1,
          to: u2,
          mentionCount: 0,
          replyCount: 0,
          reactionCount: 0,
          totalCount: 0,
          strongestType: 'mention',
          maxCount: 0
        };
        pairMap.set(key, pair);
      }

      if (edge.type === 'mention') pair.mentionCount += edge.count;
      if (edge.type === 'reply') pair.replyCount += edge.count;
      if (edge.type === 'reaction') pair.reactionCount += edge.count;
      
      pair.totalCount += edge.count;

      if (edge.count > pair.maxCount) {
        pair.maxCount = edge.count;
        pair.strongestType = edge.type;
      }
    });

    return Array.from(pairMap.values());
  });

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

      // node padding limits
      const R_start = fromNode.radius ?? 24;
      const R_end = toNode.radius ?? 24;

      const sx = x1 + ux * R_start;
      const sy = y1 + uy * R_start;
      const tx = x2 - ux * R_end;
      const ty = y2 - uy * R_end;

      const isDimmed = hoveredNodeId ? (edge.from !== hoveredNodeId && edge.to !== hoveredNodeId) : false;

      // Determine edge color gradient url or hex
      let strokeColor = '#3b82f6';
      if (edge.strongestType === 'reply') strokeColor = '#f59e0b';
      if (edge.strongestType === 'reaction') strokeColor = '#ec4899';

      return {
        ...edge,
        sx, sy, tx, ty, isDimmed, strokeColor
      };
    }).filter(Boolean);
  });

  // Filter edges to keep it clean and represent a "graphe social classic"
  let filteredEdges = $derived.by(() => {
    const allEdges = edgesWithCoords;
    if (allEdges.length <= 50) return allEdges;
    
    // Prune weak connections based on the network density
    let threshold = 1;
    if (allEdges.length > 150) threshold = 3;
    else if (allEdges.length > 80) threshold = 2;

    const cleanEdges = allEdges.filter(e => e.totalCount >= threshold);
    
    // Cap the maximum visible lines to 120 so the user can actually read the graph
    if (cleanEdges.length > 120) {
      return [...cleanEdges].sort((a, b) => b.totalCount - a.totalCount).slice(0, 120);
    }
    return cleanEdges;
  });

  // Info details about selected node
  let selectedNode = $derived(positionedNodes.find(n => n.id === selectedNodeId) || null);
  let selectedNodeStats = $derived.by(() => {
    if (!selectedNodeId) return null;
    
    let mentionsCount = 0;
    let repliesCount = 0;
    let reactionsCount = 0;

    const safeEdges = edges || [];
    safeEdges.forEach(e => {
      if (e.from === selectedNodeId || e.to === selectedNodeId) {
        if (e.type === 'mention') mentionsCount += e.count;
        if (e.type === 'reply') repliesCount += e.count;
        if (e.type === 'reaction') reactionsCount += e.count;
      }
    });

    return {
      mentions: mentionsCount,
      replies: repliesCount,
      reactions: reactionsCount,
      total: mentionsCount + repliesCount + reactionsCount
    };
  });

  onMount(() => {
    // High-fidelity ResizeObserver to adapt container dimensions perfectly on modals & tab transitions
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          width = entry.contentRect.width;
          height = entry.contentRect.height;
        }
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

<svelte:window onmousemove={handleMouseMove} onmouseup={handleMouseUp} />

<!-- Outer Container with rich dark aesthetic, neon border-glow and glassmorphic control layout -->
<div 
  bind:this={container}
  class="relative w-full h-[620px] rounded-2xl border border-white/5 bg-[#0f1118]/80 backdrop-blur-xl overflow-hidden shadow-2xl transition-all duration-300"
>
  <!-- Interactive Canvas Header -->
  <div class="absolute top-4 left-6 z-10 flex flex-col pointer-events-none">
    <div class="flex items-center gap-2">
      <Compass class="w-5 h-5 text-purple-400 animate-spin-slow" />
      <h3 class="text-base font-semibold bg-gradient-to-r from-indigo-200 via-purple-200 to-pink-200 bg-clip-text text-transparent tracking-wide">
        Réseau d'interactions global
      </h3>
    </div>
    <span class="text-xs text-slate-400 mt-1">
      Visualisez les connexions des membres. Glissez pour déplacer la caméra, cliquez pour analyser.
    </span>
  </div>

  <!-- Float Toolbar Controls -->
  <div class="absolute top-4 right-6 z-20 flex items-center gap-2">
    <button
      onclick={resetGraph}
      class="px-3.5 py-2.5 rounded-lg border border-white/5 bg-slate-900/60 hover:bg-slate-800/80 hover:border-white/10 text-xs font-medium text-slate-300 transition-all duration-200 flex items-center gap-2 pointer-events-auto animate-fade-in"
      title="Recentrer le graphe"
    >
      <RotateCcw class="w-4 h-4 text-purple-400" />
      Recentrer
    </button>
  </div>

  <!-- Interactive SVG Layout Wrapper -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <svg
    class="w-full h-full cursor-grab active:cursor-grabbing select-none"
    onmousedown={handleMouseDown}
    onwheel={handleWheel}
  >
    <!-- Define glowing radial gradients for connection routes -->
    <defs>
      <linearGradient id="cyanGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.9" />
        <stop offset="100%" stop-color="#06b6d4" stop-opacity="0.4" />
      </linearGradient>
      <linearGradient id="orangeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.9" />
        <stop offset="100%" stop-color="#eab308" stop-opacity="0.4" />
      </linearGradient>
      <linearGradient id="pinkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ec4899" stop-opacity="0.9" />
        <stop offset="100%" stop-color="#db2777" stop-opacity="0.4" />
      </linearGradient>

      <!-- Glow filters for highlighted nodes -->
      <filter id="glow-heavy" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="16" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
      <filter id="glow-node" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="6" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    <!-- Transformed Zoom/Pan Viewport Group -->
    <g transform="translate({panX}, {panY}) scale({zoom})">
      <!-- 1. Connections layer (Edges) -->
      <g>
        {#each filteredEdges as edge}
          <!-- Elegant straight line -->
          <!-- svelte-ignore a11y_mouse_events_have_key_events -->
          <line
            x1={edge.sx}
            y1={edge.sy}
            x2={edge.tx}
            y2={edge.ty}
            stroke={edge.strokeColor}
            stroke-width={Math.min(2 + edge.totalCount * 0.8, 8)}
            stroke-opacity={edge.isDimmed ? 0.08 : 0.45}
            class="transition-all duration-300 pointer-events-auto cursor-pointer"
            onmouseover={() => hoveredEdge = edge}
            onmouseout={() => hoveredEdge = null}
          />
          
          <!-- Interactive hover glow highlighter -->
          {#if hoveredEdge === edge || (hoveredNodeId && (edge.from === hoveredNodeId || edge.to === hoveredNodeId))}
            <line
              x1={edge.sx}
              y1={edge.sy}
              x2={edge.tx}
              y2={edge.ty}
              stroke={edge.strokeColor}
              stroke-width={Math.min(5 + edge.totalCount * 1.2, 12)}
              stroke-opacity={edge.isDimmed ? 0.1 : 0.85}
              filter="url(#glow-node)"
              class="pointer-events-none"
            />
          {/if}
        {/each}
      </g>

      <!-- 2. Nodes layer -->
      <g>
        {#each positionedNodes as node (node.id)}
          <!-- svelte-ignore a11y_mouse_events_have_key_events -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <g
            transform="translate({node.x}, {node.y})"
            class="cursor-pointer transition-opacity duration-300 pointer-events-auto"
            opacity={node.isDimmed ? 0.25 : 1}
            onmousedown={(e) => e.stopPropagation()}
            onmouseover={() => hoveredNodeId = node.id}
            onmouseout={() => hoveredNodeId = null}
            onclick={(e) => {
              e.stopPropagation();
              selectedNodeId = selectedNodeId === node.id ? null : node.id;
              onSelectNode(node.id);
            }}
          >
            <!-- Glowing background aura if hovered or selected -->
            {#if hoveredNodeId === node.id || selectedNodeId === node.id}
              <circle
                r={(node.radius ?? 24) + 6}
                fill="none"
                stroke={selectedNodeId === node.id ? '#a78bfa' : '#38bdf8'}
                stroke-width="3"
                stroke-opacity="0.8"
                filter="url(#glow-node)"
                class="animate-pulse"
              />
            {/if}

            <!-- Node base circle wrapper -->
            <circle
              r={node.radius ?? 24}
              fill="#131722"
              stroke={selectedNodeId === node.id ? 'url(#pinkGradient)' : 'url(#cyanGradient)'}
              stroke-width={(selectedNodeId === node.id) ? 3.5 : 2}
              class="transition-all duration-300"
            />

            <!-- ClipPath for circular profile picture -->
            <defs>
              <clipPath id="clip-{node.id}">
                <circle r={(node.radius ?? 24) - 1.5} />
              </clipPath>
            </defs>

            <!-- Render profile image inside clip path -->
            {#if node.avatar}
              <image
                href={node.avatar}
                x={-(node.radius ?? 24)}
                y={-(node.radius ?? 24)}
                width={(node.radius ?? 24) * 2}
                height={(node.radius ?? 24) * 2}
                clip-path="url(#clip-{node.id})"
                preserveAspectRatio="xMidYMid slice"
              />
            {:else}
              <!-- fallback elegant letter avatar -->
              <circle
                r={(node.radius ?? 24) - 1.5}
                fill="#312e81"
                clip-path="url(#clip-{node.id})"
              />
              <text
                text-anchor="middle"
                dy="0.3em"
                fill="#e0e7ff"
                font-size={Math.max(11, (node.radius ?? 24) * 0.6)}
                font-weight="bold"
                font-family="'Inter', sans-serif"
                class="pointer-events-none"
              >
                {node.label.slice(0, 2).toUpperCase()}
              </text>
            {/if}

            <!-- Node Nameplate label card on hover -->
            {#if hoveredNodeId === node.id || selectedNodeId === node.id || (node.radius ?? 24) > 34}
              <g transform="translate(0, {(node.radius ?? 24) + 14})">
                <!-- Label card background pill -->
                <rect
                  x={-(Math.max(60, node.label.length * 4) + 10)}
                  y="-10"
                  width={(Math.max(60, node.label.length * 4) + 10) * 2}
                  height="22"
                  rx="6"
                  fill="#0b0f19"
                  fill-opacity="0.9"
                  stroke="rgba(255, 255, 255, 0.08)"
                  stroke-width="1"
                />
                <!-- Label card text -->
                <text
                  text-anchor="middle"
                  dy="0.35em"
                  fill="#f1f5f9"
                  font-size="10.5"
                  font-weight="600"
                  font-family="'Inter', sans-serif"
                  class="pointer-events-none tracking-wide"
                >
                  {node.label}
                </text>
              </g>
            {/if}
          </g>
        {/each}
      </g>
    </g>
  </svg>

  <!-- Node detail information card (glassmorphic slide-in panel in the bottom-left corner) -->
  {#if selectedNode && selectedNodeStats}
    <div
      class="absolute bottom-5 left-5 z-20 w-80 rounded-xl border border-white/10 bg-slate-950/80 backdrop-blur-lg p-5 shadow-2xl flex flex-col gap-4 animate-fade-in-slide"
    >
      <div class="flex items-center gap-3">
        {#if selectedNode.avatar}
          <img src={selectedNode.avatar} alt="Avatar" class="w-11 h-11 rounded-full border border-purple-500/30" />
        {:else}
          <div class="w-11 h-11 rounded-full bg-indigo-900 border border-purple-500/30 flex items-center justify-center text-indigo-200 font-bold text-sm">
            {selectedNode.label.slice(0, 2).toUpperCase()}
          </div>
        {/if}
        <div class="flex flex-col">
          <span class="text-sm font-semibold text-slate-100">{selectedNode.label}</span>
          <span class="text-xs text-indigo-400">{selectedNode.isCenter ? 'Membre le plus actif 🔥' : 'Membre actif'}</span>
        </div>
        <button 
          onclick={() => selectedNodeId = null}
          class="ml-auto p-1.5 rounded-md hover:bg-white/5 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <Papicon icon="x" size={16} />
        </button>
      </div>

      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="rounded-lg bg-slate-900/50 border border-white/5 py-2 px-1 flex flex-col items-center">
          <AtSign class="w-3.5 h-3.5 text-sky-400 mb-1" />
          <span class="text-xs text-slate-400 font-medium">Mentions</span>
          <span class="text-sm font-bold text-slate-100 mt-0.5">{selectedNodeStats.mentions}</span>
        </div>
        <div class="rounded-lg bg-slate-900/50 border border-white/5 py-2 px-1 flex flex-col items-center">
          <MessageSquare class="w-3.5 h-3.5 text-yellow-400 mb-1" />
          <span class="text-xs text-slate-400 font-medium">Réponses</span>
          <span class="text-sm font-bold text-slate-100 mt-0.5">{selectedNodeStats.replies}</span>
        </div>
        <div class="rounded-lg bg-slate-900/50 border border-white/5 py-2 px-1 flex flex-col items-center">
          <ThumbsUp class="w-3.5 h-3.5 text-pink-400 mb-1" />
          <span class="text-xs text-slate-400 font-medium">Réactions</span>
          <span class="text-sm font-bold text-slate-100 mt-0.5">{selectedNodeStats.reactions}</span>
        </div>
      </div>

      <div class="flex justify-between items-center text-xs border-t border-white/5 pt-3">
        <span class="text-slate-400 font-medium">Total des interactions :</span>
        <span class="font-bold text-indigo-300 text-sm">{selectedNodeStats.total}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Custom micro-animations */
  @keyframes fadeInSlide {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .animate-fade-in-slide {
    animation: fadeInSlide 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  :global(.animate-spin-slow) {
    animation: spin 16s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
