<script lang="ts">
  import { onMount } from 'svelte';
  import Papicon from '../Papicon.svelte';

  interface Node {
    id: string;
    label: string;
    type: 'user' | 'target';
    avatar?: string | null;
    x?: number;
    y?: number;
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
  let height = $state(400);

  // Positionnement simple en étoile (radial)
  let positionedNodes = $derived.by(() => {
    if (nodes.length === 0) return [];
    
    const centerNode = nodes.find(n => n.type === 'user') || nodes[0];
    const otherNodes = nodes.filter(n => n.id !== centerNode.id);
    
    const result = [{ ...centerNode, x: width / 2, y: height / 2 }];
    
    const radius = Math.min(width, height) * 0.35;
    otherNodes.forEach((node, i) => {
      const angle = (i / otherNodes.length) * 2 * Math.PI - Math.PI / 2;
      result.push({
        ...node,
        x: width / 2 + radius * Math.cos(angle),
        y: height / 2 + radius * Math.sin(angle)
      });
    });
    
    return result;
  });

  let edgesWithCoords = $derived.by(() => {
    return edges.map(edge => {
      const fromNode = positionedNodes.find(n => n.id === edge.from);
      const toNode = positionedNodes.find(n => n.id === edge.to);
      if (!fromNode || !toNode) return null;
      return { ...edge, x1: fromNode.x, y1: fromNode.y, x2: toNode.x, y2: toNode.y };
    }).filter(Boolean);
  });

  onMount(() => {
    const updateSize = () => {
      if (container) {
        width = container.clientWidth;
        height = container.clientHeight;
      }
    };
    
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  });

  function getEdgeColor(type: string) {
    switch (type) {
      case 'mention': return 'stroke-primary';
      case 'reply': return 'stroke-secondary';
      case 'reaction': return 'stroke-emerald-500';
      default: return 'stroke-on-surface-variant/20';
    }
  }

  function getEdgeLabel(type: string) {
    switch (type) {
      case 'mention': return 'Mention';
      case 'reply': return 'Réponse';
      case 'reaction': return 'Réaction';
      default: return '';
    }
  }
</script>

<div bind:this={container} class="relative h-full w-full bg-surface-container-low/30 rounded-[3rem] border border-outline-variant/10 overflow-hidden group">
  {#if nodes.length === 0}
    <div class="absolute inset-0 flex flex-col items-center justify-center text-on-surface-variant/20">
      <Papicon icon="share-2" size={48} />
      <p class="mt-4 text-xs font-black uppercase tracking-widest">Aucune interaction détectée</p>
    </div>
  {:else}
    <svg {width} {height} class="overflow-visible">
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="25" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" class="fill-on-surface-variant/20" />
        </marker>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      <!-- Edges -->
      {#each edgesWithCoords as edge}
        {@const midX = (edge.x1 + edge.x2) / 2}
        {@const midY = (edge.y1 + edge.y2) / 2}
        <g class="transition-all duration-700">
          <line 
            x1={edge.x1} y1={edge.y1} 
            x2={edge.x2} y2={edge.y2} 
            class="{getEdgeColor(edge.type)} opacity-20 group-hover:opacity-40 transition-opacity"
            stroke-width={Math.log10(edge.count + 1) * 4 + 1}
            marker-end="url(#arrowhead)"
          />
          <!-- Interaction Count Badge on Edge -->
          <g transform="translate({midX}, {midY})">
            <rect x="-12" y="-8" width="24" height="16" rx="4" class="fill-surface-container-high stroke-outline-variant/10" />
            <text text-anchor="middle" dy="4" class="fill-on-surface text-[8px] font-black">{edge.count}</text>
          </g>
        </g>
      {/each}

      <!-- Nodes -->
      {#each positionedNodes as node}
        <g 
          transform="translate({node.x}, {node.y})" 
          class="transition-all duration-700 hover:scale-110 cursor-pointer"
          onclick={() => onSelectNode(node.id)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && onSelectNode(node.id)}
        >
          <circle 
            r={node.type === 'user' ? 32 : 24} 
            class="{node.type === 'user' ? 'fill-primary' : 'fill-surface-container-highest'} stroke-outline-variant/20 shadow-xl"
            stroke-width="2"
          />
          
          {#if node.avatar}
            <clipPath id="avatar-clip-{node.id}">
              <circle r={node.type === 'user' ? 30 : 22} />
            </clipPath>
            <image 
              href={node.avatar} 
              x={node.type === 'user' ? -30 : -22} 
              y={node.type === 'user' ? -30 : -22} 
              width={node.type === 'user' ? 60 : 44} 
              height={node.type === 'user' ? 60 : 44} 
              clip-path="url(#avatar-clip-{node.id})"
            />
          {:else}
            <text text-anchor="middle" dy="6" class="fill-on-surface text-[14px] font-black uppercase">
              {node.label.slice(0, 1)}
            </text>
          {/if}

          <!-- Label -->
          <g transform="translate(0, {node.type === 'user' ? 45 : 35})">
            <rect x="-40" y="-10" width="80" height="20" rx="8" class="fill-surface-container-low/80 backdrop-blur-md stroke-outline-variant/10" />
            <text text-anchor="middle" dy="4" class="fill-on-surface text-[9px] font-black truncate max-w-[70px]">
              {node.label}
            </text>
          </g>
        </g>
      {/each}
    </svg>

    <!-- Legend -->
    <div class="absolute bottom-6 left-6 flex gap-4 p-4 rounded-2xl bg-surface-container-low/50 border border-outline-variant/10 backdrop-blur-md">
      <div class="flex items-center gap-2">
        <div class="h-2 w-2 rounded-full bg-primary"></div>
        <span class="text-[8px] font-black uppercase tracking-widest text-on-surface-variant/60">Mentions</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="h-2 w-2 rounded-full bg-secondary"></div>
        <span class="text-[8px] font-black uppercase tracking-widest text-on-surface-variant/60">Réponses</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="h-2 w-2 rounded-full bg-emerald-500"></div>
        <span class="text-[8px] font-black uppercase tracking-widest text-on-surface-variant/60">Réactions</span>
      </div>
    </div>
  {/if}
</div>

<style>
  svg {
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1));
  }

  g {
    transform-origin: center;
    transform-box: fill-box;
  }
</style>
