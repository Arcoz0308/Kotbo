<script module>
  import { categoryMap, categoryIcons, categoryColors, categoryOrder } from './ManagementAccess.svelte';
</script>

<script lang="ts">
  import Papicon from '../Papicon.svelte';
  import ToggleSwitch from '../ToggleSwitch.svelte';

  let { features = $bindable([]), availableChannels = [], availableRoles = [], onSave = (_key: string) => {} } = $props();

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
    for (const [cat, items] of catMap) {
      groups.push({ category: cat, items });
    }

    return groups;
  });

  const notificationMethods = [
    { key: 'notifyViaDiscordChannel', label: 'Salon Discord', desc: 'Envoi dans le salon configuré', icon: 'Hash' },
    { key: 'notifyViaDM', label: 'Messages Privés', desc: 'Envoi en MP Discord', icon: 'Mail' },
  ];

  let expandedCategory = $state<string | null>(null);
  let expandedFeature = $state<string | null>(null);
</script>

<div class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-6 animate-in fade-in duration-500">
  <div>
    <h3 class="text-2xl font-black">Système de Notifications</h3>
    <p class="text-xs text-on-surface-variant/50 mt-1">Configurez qui et comment les alertes sont envoyées pour chaque module.</p>
  </div>

  <div class="space-y-4">
    {#each groupedFeatures as group}
      {@const catColor = categoryColors[group.category] || { text: 'text-on-surface-variant', bg: 'bg-surface-container-high/20', border: 'border-outline-variant/10' }}
      {@const catIcon = categoryIcons[group.category] || 'Grid'}
      {@const isCatExpanded = expandedCategory === group.category}

      <div class="space-y-2">
        <!-- Category header -->
        <button
          onclick={() => expandedCategory = isCatExpanded ? null : group.category}
          class="w-full flex items-center gap-3 px-5 py-3 rounded-2xl {catColor.bg} border {catColor.border} hover:opacity-90 transition-all cursor-pointer"
        >
          <Papicon icon={catIcon} size={18} class={catColor.text} />
          <span class="text-[11px] font-black uppercase tracking-widest {catColor.text}">{group.category}</span>
          <span class="text-[10px] text-on-surface-variant/40 ml-1">{group.items.length} module{group.items.length > 1 ? 's' : ''}</span>
          <div class="ml-auto transform transition-transform {isCatExpanded ? 'rotate-180' : ''}">
            <Papicon icon="CaretDown" size={14} class="text-on-surface-variant/40" />
          </div>
        </button>

        <!-- Category items -->
        {#if isCatExpanded}
          <div class="space-y-2 pl-2 animate-in fade-in slide-in-from-top-1 duration-300">
            {#each group.items as { feature, idx }}
              {@const isExpanded = expandedFeature === feature.featureKey}
              <div class="bg-surface-container-high/20 border border-outline-variant/5 rounded-[1.5rem] overflow-hidden">
                <!-- Feature header -->
                <button
                  onclick={() => expandedFeature = isExpanded ? null : feature.featureKey}
                  class="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-container-high/30 transition-colors"
                >
                  <div class="flex items-center gap-3">
                    <span class="w-2 h-2 rounded-full {feature.enabled ? 'bg-emerald-500' : 'bg-red-400'}"></span>
                    <span class="text-sm font-bold">{feature.featureName}</span>
                    <div class="flex gap-1 ml-2">
                      {#if feature.notifyViaDiscordChannel}
                        <span class="px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-[8px] font-bold">Salon</span>
                      {/if}
                      {#if feature.notifyViaDM}
                        <span class="px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-400 text-[8px] font-bold">MP</span>
                      {/if}
                    </div>
                  </div>
                  <div class="transform transition-transform {isExpanded ? 'rotate-180' : ''}">
                    <Papicon icon="CaretDown" size={14} />
                  </div>
                </button>

                {#if isExpanded}
                  <div class="px-6 pb-6 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <!-- Methods -->
                      <div class="space-y-3">
                        <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Méthodes d'envoi</p>
                        <div class="space-y-2">
                          {#each notificationMethods as method}
                            <div class="flex items-center justify-between p-3 rounded-xl bg-surface-container-high/40 border border-outline-variant/5">
                              <div class="flex items-center gap-3">
                                <Papicon icon={method.icon} size={14} class="text-primary" />
                                <div>
                                  <p class="text-[11px] font-bold">{method.label}</p>
                                  <p class="text-[9px] text-on-surface-variant/40">{method.desc}</p>
                                </div>
                              </div>
                              <ToggleSwitch checked={features[idx][method.key]} onToggle={(v) => { features[idx][method.key] = v; features = [...features]; }} />
                            </div>
                          {/each}
                        </div>
                      </div>

                      <!-- Configuration -->
                      <div class="space-y-3">
                        <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Paramètres</p>
                        <div class="space-y-4">
                          <div class="space-y-1.5">
                            <label for="notify-channel-{feature.featureKey}" class="text-[10px] font-bold text-on-surface-variant/60">Salon des alertes</label>
                            <select id="notify-channel-{feature.featureKey}" bind:value={features[idx].channelId} class="w-full bg-surface-container-high text-sm px-4 py-2.5 rounded-xl border border-outline-variant/10 focus:ring-1 ring-primary/30 transition-all outline-none">
                              <option value="">Utiliser le salon par défaut</option>
                              {#each availableChannels as channel}
                                <option value={channel.id}>#{channel.name}</option>
                              {/each}
                            </select>
                          </div>
                          <div class="space-y-1.5">
                            <label for="notify-role-{feature.featureKey}" class="text-[10px] font-bold text-on-surface-variant/60">Rôle à mentionner</label>
                            <select id="notify-role-{feature.featureKey}" bind:value={features[idx].notificationRoleId} class="w-full bg-surface-container-high text-sm px-4 py-2.5 rounded-xl border border-outline-variant/10 focus:ring-1 ring-primary/30 transition-all outline-none">
                              <option value="">Aucune mention</option>
                              {#each availableRoles as role}
                                <option value={role.id}>{role.name}</option>
                              {/each}
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="flex justify-end pt-2">
                      <button
                        onclick={() => onSave(feature.featureKey)}
                        class="px-6 py-2.5 bg-primary text-on-primary text-[10px] font-black uppercase tracking-widest rounded-xl hover:scale-105 transition-transform"
                      >
                        Appliquer
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
