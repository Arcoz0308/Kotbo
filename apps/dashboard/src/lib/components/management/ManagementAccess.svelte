<script module>
  // ─── Category mapping ───
  export const categoryMap: Record<string, string> = {
    dashboard: 'Tableau de bord',
    analytics: 'Tableau de bord',
    inbox: 'Tableau de bord',
    profile: 'Tableau de bord',
    content: 'Modération',
    daily_algo: 'Modération',
    members: 'Modération',
    sanctions: 'Modération',
    double_accounts: 'Modération',
    logs: 'Modération',
    activity: 'Modération',
    recruitment: 'Gestion Staff',
    staff_directory: 'Gestion Staff',
    staff_management: 'Gestion Staff',
    staff_roles: 'Gestion Staff',
    tutoring: 'Gestion Staff',
    meetings: 'Gestion Staff',
    absences: 'Gestion Staff',
    polls: 'Gestion Staff',
    discipline: 'Gestion Staff',
    regulation: 'Gestion',
    modules: 'Configuration',
    centralized_config: 'Configuration',
    commands: 'Configuration',
    settings: 'Configuration',
    youtube: 'Intégrations',
    digest: 'Intégrations',
  };

  export const categoryIcons: Record<string, string> = {
    'Tableau de bord': 'Grid',
    'Modération': 'AlertTriangle',
    'Gestion Staff': 'User',
    'Gestion': 'Paper',
    'Configuration': 'Gears',
    'Intégrations': 'Link',
  };

  export const categoryColors: Record<string, { text: string; bg: string; border: string }> = {
    'Tableau de bord': { text: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
    'Modération': { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    'Gestion Staff': { text: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
    'Gestion': { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    'Configuration': { text: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
    'Intégrations': { text: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
  };

  export const categoryOrder = ['Tableau de bord', 'Modération', 'Gestion Staff', 'Gestion', 'Configuration', 'Intégrations'];
</script>

<script lang="ts">
  import Papicon from '../Papicon.svelte';

  let { 
    features = $bindable([]), 
    availableRoles = [], 
    onUpdateAccess = (_key: string, _access: any[]) => {},
    onApplyPreset = (_preset: string) => {}
  } = $props();

  // Group features by category - Use $derived.by for better performance
  const groupedFeatures = $derived.by(() => {
    const groups: Array<{ category: string; items: Array<{ feature: any; idx: number }> }> = [];
    const catMap = new Map<string, Array<{ feature: any; idx: number }>>();

    features.forEach((feature, idx) => {
      const cat = categoryMap[feature.featureKey] || 'Autre';
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat)!.push({ feature, idx });
    });

    for (const cat of categoryOrder) {
      if (catMap.has(cat)) {
        groups.push({ category: cat, items: catMap.get(cat)! });
        catMap.delete(cat);
      }
    }
    // Any remaining (uncategorized)
    for (const [cat, items] of catMap) {
      groups.push({ category: cat, items });
    }

    return groups;
  });

  // Generate dynamic role levels from actual staff roles
  const roleEntries = $derived.by(() => {
    if (availableRoles.length > 0) {
      return [...availableRoles]
        .sort((a, b) => (b.position ?? 0) - (a.position ?? 0))
        .map((role, idx) => ({
          roleId: role.id,
          name: role.name,
          color: ['text-blue-400', 'text-emerald-400', 'text-purple-400', 'text-amber-400', 'text-rose-400', 'text-cyan-400', 'text-teal-400', 'text-orange-400'][idx % 8],
          bg: ['bg-blue-500/10', 'bg-emerald-500/10', 'bg-purple-500/10', 'bg-amber-500/10', 'bg-rose-500/10', 'bg-cyan-500/10', 'bg-teal-500/10', 'bg-orange-500/10'][idx % 8],
          dotColor: ['bg-blue-400', 'bg-emerald-400', 'bg-purple-400', 'bg-amber-400', 'bg-rose-400', 'bg-cyan-400', 'bg-teal-400', 'bg-orange-400'][idx % 8],
        }));
    }
    return [];
  });

  const permissions = [
    { key: 'canView', label: 'Voir', icon: 'Eye' },
    { key: 'canModerate', label: 'Modérer', icon: 'Gavel' },
    { key: 'canConfigure', label: 'Configurer', icon: 'Settings' },
    { key: 'canDelete', label: 'Supprimer', icon: 'Trash' },
  ];

  function getRoleAccess(feature: any, roleId: string): any {
    if (!feature.roleAccessByRole) return {};
    return feature.roleAccessByRole.find((ra: any) => ra.roleId === roleId) || {};
  }

  function togglePermission(featureIdx: number, roleId: string, permKey: string) {
    const feature = features[featureIdx];
    if (!feature.roleAccessByRole) feature.roleAccessByRole = [];

    let ra = feature.roleAccessByRole.find((r: any) => r.roleId === roleId);
    if (!ra) {
      ra = { roleId, canView: false, canModerate: false, canConfigure: false, canDelete: false };
      feature.roleAccessByRole.push(ra);
    }
    ra[permKey] = !ra[permKey];
    features = [...features];
  }

  let expandedFeature = $state<string | null>(null);
  let expandedCategory = $state<string | null>(null);
</script>

<div class="space-y-6 animate-in fade-in duration-500">
  <div class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-xl space-y-6">
    <div class="flex flex-col md:flex-row justify-between gap-6">
      <div>
        <h3 class="text-2xl font-semibold">Matrice des Accès</h3>
        <p class="text-xs text-on-surface-variant/50 mt-1">
          Définissez les permissions par rôle Discord pour chaque page et fonctionnalité du dashboard.
          {#if availableRoles.length > 0}
            <span class="text-primary font-bold">{availableRoles.length} rôles Discord chargés.</span>
          {/if}
        </p>
      </div>

      <div class="flex items-center gap-3">
        <span class="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/40">Réinitialiser via Preset :</span>
        {#each ['general', 'gaming', 'dev'] as p}
          <button 
            onclick={() => onApplyPreset(p)}
            class="px-3 py-1.5 rounded-lg border border-outline-variant/10 hover:bg-surface-container-high transition-colors text-[11px] font-semibold uppercase tracking-widest"
          >
            {p}
          </button>
        {/each}
      </div>
    </div>

    <!-- Légende rôles -->
    <div class="flex flex-wrap gap-3">
      {#each roleEntries as role}
        <div class="flex items-center gap-2 px-3 py-1.5 rounded-xl {role.bg}">
          <span class="w-2 h-2 rounded-full {role.dotColor}"></span>
          <span class="text-xs font-medium {role.color}">{role.name}</span>
        </div>
      {/each}
      <div class="flex items-center gap-3 ml-auto text-[10px] text-on-surface-variant/40">
        {#each permissions as perm}
          <span class="flex items-center gap-1"><Papicon icon={perm.icon} size={12} /> {perm.label}</span>
        {/each}
      </div>
    </div>

    <!-- Grouped feature cards by category -->
    <div class="space-y-6">
      {#each groupedFeatures as group}
        {@const catColor = categoryColors[group.category] || { text: 'text-on-surface-variant', bg: 'bg-surface-container-high/20', border: 'border-outline-variant/10' }}
        {@const catIcon = categoryIcons[group.category] || 'Grid'}
        {@const isCatExpanded = expandedCategory === group.category}

        <div class="space-y-2">
          <!-- Category header -->
          <button
            onclick={() => expandedCategory = isCatExpanded ? null : group.category}
            class="w-full flex items-center gap-3 px-5 py-3 rounded-lg {catColor.bg} border {catColor.border} hover:opacity-90 transition-all cursor-pointer"
          >
            <Papicon icon={catIcon} size={18} class={catColor.text} />
            <span class="text-[11px] font-semibold uppercase tracking-widest {catColor.text}">{group.category}</span>
            <span class="text-[10px] text-on-surface-variant/40 ml-1">{group.items.length} module{group.items.length > 1 ? 's' : ''}</span>
            <div class="ml-auto flex items-center gap-2">
              <!-- Quick summary: nb of features with full permissions -->
              <span class="text-[11px] text-on-surface-variant/30">{group.items.filter(i => i.feature.enabled).length} actif{group.items.filter(i => i.feature.enabled).length > 1 ? 's' : ''}</span>
              <div class="transform transition-transform {isCatExpanded ? 'rotate-180' : ''}">
                <Papicon icon="CaretDown" size={14} class="text-on-surface-variant/40" />
              </div>
            </div>
          </button>

          <!-- Category items -->
          {#if isCatExpanded}
            <div class="space-y-2 pl-2 animate-in fade-in slide-in-from-top-1 duration-300">
              {#each group.items as { feature, idx }}
                {@const isExpanded = expandedFeature === feature.featureKey}
                <div class="bg-surface-container-high/20 border border-outline-variant/5 rounded-xl overflow-hidden transition-all">
                  <!-- Feature header -->
                  <button
                    onclick={() => expandedFeature = isExpanded ? null : feature.featureKey}
                    class="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-container-high/30 transition-colors"
                  >
                    <div class="flex items-center gap-3">
                      <span class="w-2 h-2 rounded-full {feature.enabled ? 'bg-emerald-500' : 'bg-red-400'}"></span>
                      <span class="text-sm font-bold">{feature.featureName}</span>
                      {#if feature.description}
                        <span class="text-[10px] text-on-surface-variant/30 hidden md:inline">{feature.description}</span>
                      {/if}
                    </div>
                    <div class="flex items-center gap-3">
                      <!-- Quick preview badges -->
                      <div class="flex gap-1 hidden sm:flex">
                        {#each roleEntries as role}
                          {@const ra = getRoleAccess(feature, role.roleId)}
                          {@const activePerms = permissions.filter(p => ra[p.key]).length}
                          <span class="px-1.5 py-0.5 rounded text-[10px] font-bold {role.bg} {role.color}">{activePerms}/{permissions.length}</span>
                        {/each}
                      </div>
                      <div class="transform transition-transform {isExpanded ? 'rotate-180' : ''}">
                        <Papicon icon="CaretDown" size={14} />
                      </div>
                    </div>
                  </button>

                  <!-- Expanded permission matrix -->
                  {#if isExpanded}
                    <div class="px-5 pb-5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div class="overflow-hidden rounded-xl border border-outline-variant/5">
                        <table class="w-full text-left border-collapse">
                          <thead class="bg-surface-container-high/40 text-xs font-medium text-on-surface-variant/60">
                            <tr>
                              <th class="px-4 py-3">Rôle</th>
                              {#each permissions as perm}
                                <th class="px-4 py-3 text-center">
                                  <div class="flex items-center justify-center gap-1"><Papicon icon={perm.icon} size={12} /> {perm.label}</div>
                                </th>
                              {/each}
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-outline-variant/5">
                            {#each roleEntries as role}
                              {@const ra = getRoleAccess(feature, role.roleId)}
                              <tr class="hover:bg-surface-container-high/10 transition-colors">
                                <td class="px-4 py-3">
                                  <span class="flex items-center gap-2 {role.color} font-bold text-sm">
                                    <span class="w-2 h-2 rounded-full {role.dotColor}"></span>
                                    {role.name}
                                  </span>
                                </td>
                                {#each permissions as perm}
                                  <td class="px-4 py-3 text-center">
                                    <button
                                      onclick={() => togglePermission(idx, role.roleId, perm.key)}
                                      class="w-7 h-7 rounded-lg flex items-center justify-center transition-all {ra[perm.key] ? 'bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30' : 'bg-surface-container-high/40 text-on-surface-variant/30 hover:bg-surface-container-high/60'}"
                                    >
                                      <Papicon icon={ra[perm.key] ? "Check" : "X"} size={12} />
                                    </button>
                                  </td>
                                {/each}
                              </tr>
                            {/each}
                          </tbody>
                        </table>
                      </div>

                      <div class="flex justify-end">
                        <button
                          onclick={() => onUpdateAccess(feature.featureKey, feature.roleAccessByRole || [])}
                          class="px-5 py-2 bg-on-surface text-surface text-[11px] font-semibold uppercase tracking-widest rounded-xl transition-transform"
                        >
                          Sauvegarder
                        </button>
                      </div>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>
