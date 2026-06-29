<script lang="ts">
  import Papicon from './Papicon.svelte';
  import HierarchyNode from './HierarchyNode.svelte';

  export type HierarchyTreeNode = {
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
    children: HierarchyTreeNode[];
  };

  let { node, isRoot = false }: { node: HierarchyTreeNode; isRoot?: boolean } = $props();

  function getMembersForRole(hierarchyMembers: HierarchyTreeNode['members'], roleName: string) {
    if (!hierarchyMembers) return [];
    return hierarchyMembers.filter((member) => member.grade.toLowerCase() === roleName.toLowerCase());
  }

  const groupedRolesByLevel = $derived(
    (() => {
      const groups: Record<number, typeof node.roles> = {};
      for (const r of node.roles) {
        const lvl = r.level ?? 0;
        if (!groups[lvl]) groups[lvl] = [];
        groups[lvl].push(r);
      }
      return Object.keys(groups)
        .map(Number)
        .sort((a, b) => b - a)
        .map(lvl => ({
          level: lvl,
          roles: groups[lvl].sort((a, b) => a.name.localeCompare(b.name))
        }));
    })()
  );
</script>

<div class:root-node={isRoot} class="hierarchy-node flex flex-col items-center relative w-full">
  <div class="hierarchy-card w-full p-6 rounded-xl bg-surface-container-low border border-outline-variant/10 shadow-sm transition-all duration-300 hover:shadow-sm flex flex-col items-center text-center relative"
       style="border-top: 4px solid {node.color || 'var(--color-primary)'}">
    <div class="w-12 h-12 rounded-lg flex items-center justify-center text-xl font-bold mb-3 shadow-md"
         style="background-color: {node.color ? node.color + '15' : 'var(--color-primary-container)'}; color: {node.color || 'var(--color-primary)'}">
      {node.icon || '🔵'}
    </div>
    <h3 class="text-base font-semibold text-on-surface">{node.name}</h3>
    {#if node.description}
      <p class="text-xs text-on-surface-variant/75 mt-1 leading-relaxed max-w-60">{node.description}</p>
    {/if}

    {#if node.responsable && node.responsable.name}
      <div class="mt-4 px-4 py-1.5 rounded-full bg-surface-container-high border border-outline-variant/10 flex items-center gap-2">
        <span class="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/70">Resp :</span>
        <span class="text-xs font-bold text-on-surface">{node.responsable.name}</span>
      </div>
    {/if}
  </div>

  {#if node.roles && node.roles.length > 0}
    <div class="vertical-line" style="background-color: {node.color || 'rgba(99, 102, 241, 0.2)'}"></div>
  {/if}

  {#if node.roles && node.roles.length > 0}
    <div class="roles-stack w-full space-y-4">
      {#each groupedRolesByLevel as group}
        <div class="flex flex-wrap gap-4 justify-center w-full">
          {#each group.roles as role}
            {@const roleMembers = getMembersForRole(node.members, role.name)}
            <div class="role-card flex-1 min-w-[200px] max-w-[280px] p-4 rounded-xl bg-surface-container-low/40 border border-outline-variant/10 shadow-md flex flex-col relative text-left"
                 style="border-left: 3px solid {role.color || node.color || '#999'}">
              <div class="flex items-center justify-between">
                <h4 class="text-sm font-semibold text-on-surface flex items-center gap-2">
                  {role.name}
                  {#if role.isResponsable}
                    <span class="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[10px] font-semibold uppercase tracking-wider">Chef</span>
                  {/if}
                </h4>
                <span class="text-[10px] font-bold text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-md">
                  {roleMembers.length}
                </span>
              </div>

              {#if roleMembers.length > 0}
                <div class="mt-3 space-y-2 border-t border-outline-variant/10 pt-3">
                  {#each roleMembers as member}
                    <div class="flex items-center gap-2 px-2 py-1 rounded-xl hover:bg-surface-container-high/50 transition-colors">
                      {#if member.avatarUrl}
                        <img src={member.avatarUrl} alt="" class="w-6 h-6 rounded-full object-cover shadow-xs border border-outline-variant/15" />
                      {:else}
                        <div class="w-6 h-6 rounded-full bg-surface-container-high text-xs font-semibold flex items-center justify-center text-on-surface-variant">
                          {member.displayName?.charAt(0).toUpperCase() || member.username.charAt(0).toUpperCase()}
                        </div>
                      {/if}
                      <div class="text-xs">
                        <p class="font-bold text-on-surface leading-tight">{member.displayName || member.username}</p>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="mt-2 text-center py-2 text-[10px] text-on-surface-variant/40 italic">
                  Aucun membre
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/each}
    </div>
  {/if}

  {#if node.children && node.children.length > 0}
    <div class="children-connector"></div>
    <div class="children-row flex flex-wrap justify-center gap-8 mt-10 relative">
      {#each node.children as child (child.id)}
        <div class="child-wrap flex-1 min-w-65 max-w-90">
          <!-- svelte-ignore svelte_self_deprecated -->
          <HierarchyNode node={child} />
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .hierarchy-node {
    position: relative;
  }

  .vertical-line {
    width: 2px;
    height: 40px;
  }

  .children-connector {
    width: 2px;
    height: 32px;
    background: rgba(99, 102, 241, 0.15);
    margin-top: 6px;
  }

  .root-node > .children-row {
    margin-top: 2rem;
  }
</style>
