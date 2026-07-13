<script lang="ts">
  import Papicon from './Papicon.svelte';
  import HierarchyNode from './HierarchyNode.svelte';

  type HierarchySchema = {
    chiefStaff: { userId?: string | null; roleId?: string | null; name?: string | null } | null;
    hierarchies: Array<{
      id: string;
      name: string;
      description?: string | null;
      color?: string | null;
      icon?: string | null;
      parentHierarchyId?: string | null;
      responsable?: { userId: string; name?: string | null } | null;
      roles: Array<{ id: string; name: string; level: number; isResponsable: boolean; color?: string | null }>;
      memberCount: number;
      members: Array<{ userId: string; username: string; displayName?: string | null; avatarUrl?: string | null; grade: string }>;
    }>;
  };

  let { schema }: { schema: HierarchySchema } = $props();

  type HierarchyTreeNode = HierarchySchema['hierarchies'][number] & {
    children: HierarchyTreeNode[];
  };

  function buildHierarchyTree(): HierarchyTreeNode[] {
    const nodeMap = new Map<string, HierarchyTreeNode>();

    for (const hierarchy of schema?.hierarchies ?? []) {
      nodeMap.set(hierarchy.id, { ...hierarchy, children: [] });
    }

    const roots: HierarchyTreeNode[] = [];

    for (const node of nodeMap.values()) {
      const parentId = node.parentHierarchyId ?? null;
      const parentNode = parentId ? nodeMap.get(parentId) : null;

      if (parentNode) {
        parentNode.children.push(node);
      } else {
        roots.push(node);
      }
    }

    const sortNodes = (nodes: HierarchyTreeNode[]) => {
      nodes.sort((left, right) => (left.sortOrder - right.sortOrder) || left.name.localeCompare(right.name));
      nodes.forEach((node) => {
        node.children = sortNodes(node.children);
      });
      return nodes;
    };

    return sortNodes(roots);
  }

  const hierarchyTree = $derived(buildHierarchyTree());
</script>

<div class="org-chart-container py-12 px-6 overflow-x-auto select-none">
  {#if !schema || !schema.hierarchies || schema.hierarchies.length === 0}
    <div class="flex flex-col items-center justify-center py-20 text-on-surface-variant/30 border-2 border-dashed border-outline-variant/10 rounded-xl bg-surface-container-low/20">
      <div class="w-20 h-20 rounded-xl bg-surface-container flex items-center justify-center mb-6 shadow-inner opacity-50">
        <Papicon icon="schema" size={32} />
      </div>
      <h3 class="text-xl font-semibold tracking-tight text-on-surface/40">Aucune hiérarchie à afficher</h3>
      <p class="mt-2 text-xs opacity-50">Créez des hiérarchies et assignez des rôles pour générer l'organigramme.</p>
    </div>
  {:else}
    <div class="tree">
      <!-- Chief Staff Node -->
      {#if schema.chiefStaff && (schema.chiefStaff.name || schema.chiefStaff.userId)}
        <div class="chief-staff-node mb-10 flex flex-col items-center">
          <div class="relative group p-6 rounded-xl bg-linear-to-br from-amber-500/20 to-yellow-600/10 border-2 border-amber-500/40 shadow-sm shadow-amber-500/5 max-w-sm text-center">
            <div class="absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 rounded-lg bg-amber-500 text-white flex items-center justify-center shadow-sm">
              <span class="text-xl font-bold">👑</span>
            </div>
            <div class="mt-4">
              <h4 class="text-[13px] font-medium text-amber-400">Resp Staff Global</h4>
              <p class="text-lg font-semibold text-on-surface mt-1">{schema.chiefStaff.name || 'Nom Inconnu'}</p>
              {#if schema.chiefStaff.userId}
                <span class="text-[11px] font-mono text-on-surface-variant/60 block mt-1">ID: {schema.chiefStaff.userId}</span>
              {/if}
            </div>
          </div>
          <div class="vertical-line bg-amber-500/30"></div>
        </div>
      {/if}

      <!-- Hierarchies Tree -->
      <div class="hierarchies-tree flex flex-col items-center gap-12 relative">
        {#each hierarchyTree as hierarchy (hierarchy.id)}
          <div class="w-full flex justify-center">
            <HierarchyNode node={hierarchy} isRoot={true} />
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .org-chart-container {
    background: radial-gradient(circle at top left, var(--color-surface-container-low) 0%, transparent 70%);
  }

  .chief-staff-node {
    position: relative;
  }

  .vertical-line {
    width: 2px;
    height: 40px;
  }

  .hierarchies-tree {
    padding-top: 1rem;
  }
</style>
