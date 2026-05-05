<script module>
  import { categoryMap, categoryOrder } from './ManagementAccess.svelte';
</script>

<script lang="ts">
  import Papicon from '../Papicon.svelte';

  let { features = [], auditLogs = [], availableRoles = [], guildSettings = {} as any } = $props();

  const enabledCount = $derived(features.filter((f: any) => f.enabled).length);
  const loggingCount = $derived(features.filter((f: any) => f.loggingEnabled).length);
  const trackingCount = $derived(features.filter((f: any) => f.userActivityTracking).length);
  const dmNotifCount = $derived(features.filter((f: any) => f.notifyViaDM).length);
  const channelNotifCount = $derived(features.filter((f: any) => f.notifyViaDiscordChannel).length);

  const criticalChannels = $derived.by(() => [
    { label: 'Logs', value: guildSettings.logChannelId, key: 'logChannelId' },
    { label: 'Règlement', value: guildSettings.regulationChannelId, key: 'regulationChannelId' },
    { label: 'Annonces Réunions', value: guildSettings.meetingAnnouncementChannelId, key: 'meetingAnnouncementChannelId' },
    { label: 'Digest', value: guildSettings.digestChannelId, key: 'digestChannelId' },
  ]);

  const missingChannels = $derived(criticalChannels.filter(c => !c.value));
  const healthScore = $derived(Math.round(((criticalChannels.length - missingChannels.length) / criticalChannels.length) * 100));

  const groupedFeatures = $derived.by(() => {
    const groups: Array<{ category: string; items: any[] }> = [];
    const catMap = new Map<string, any[]>();

    features.forEach((feature) => {
      const cat = categoryMap[feature.featureKey] || 'Autre';
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat)!.push(feature);
    });

    for (const cat of categoryOrder) {
      if (catMap.has(cat)) {
        groups.push({ category: cat, items: catMap.get(cat)! });
      }
    }
    return groups;
  });
</script>

<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 animate-in fade-in duration-500">
  <div class="bg-surface-container-low/30 border border-outline-variant/10 p-7 rounded-[2.5rem] space-y-3 group hover:border-primary/20 transition-colors">
    <div class="bg-primary/10 w-11 h-11 rounded-2xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform"><Papicon icon="Package" size={22} /></div>
    <h3 class="text-sm font-bold text-on-surface-variant/70">Modules Actifs</h3>
    <p class="text-3xl font-black">{enabledCount} <span class="text-sm font-normal text-on-surface-variant/40">/ {features.length}</span></p>
  </div>
  <div class="bg-surface-container-low/30 border border-outline-variant/10 p-7 rounded-[2.5rem] space-y-3 group hover:border-secondary/20 transition-colors">
    <div class="bg-secondary/10 w-11 h-11 rounded-2xl flex items-center justify-center text-secondary group-hover:scale-110 transition-transform"><Papicon icon="Bell" size={22} /></div>
    <h3 class="text-sm font-bold text-on-surface-variant/70">Notifications</h3>
    <p class="text-[11px] text-on-surface-variant/60 font-medium">{channelNotifCount} salon · {dmNotifCount} MP</p>
  </div>
  <div class="bg-surface-container-low/30 border border-outline-variant/10 p-7 rounded-[2.5rem] space-y-3 group hover:border-tertiary/20 transition-colors">
    <div class="bg-tertiary/10 w-11 h-11 rounded-2xl flex items-center justify-center text-tertiary group-hover:scale-110 transition-transform"><Papicon icon="FileText" size={22} /></div>
    <h3 class="text-sm font-bold text-on-surface-variant/70">Logging</h3>
    <p class="text-[11px] text-on-surface-variant/60 font-medium">{loggingCount} logs · {trackingCount} tracking</p>
  </div>
  <div class="bg-surface-container-low/30 border border-outline-variant/10 p-7 rounded-[2.5rem] space-y-3 group hover:border-emerald-500/20 transition-colors">
    <div class="w-11 h-11 rounded-2xl flex items-center justify-center {healthScore >= 80 ? 'bg-emerald-500/10 text-emerald-500' : healthScore >= 50 ? 'bg-amber-500/10 text-amber-500' : 'bg-red-500/10 text-red-500'} group-hover:scale-110 transition-transform"><Papicon icon="HeartBeat" size={22} /></div>
    <h3 class="text-sm font-bold text-on-surface-variant/70">Santé Config</h3>
    <p class="text-3xl font-black {healthScore >= 80 ? 'text-emerald-500' : healthScore >= 50 ? 'text-amber-500' : 'text-red-500'}">{healthScore}%</p>
  </div>
</div>

{#if missingChannels.length > 0}
  <div class="bg-amber-500/5 border border-amber-500/20 p-6 rounded-[2.5rem] flex items-start gap-4">
    <div class="bg-amber-500/10 p-2 rounded-xl text-amber-500 shrink-0"><Papicon icon="Warning" size={18} /></div>
    <div>
      <h4 class="font-bold text-sm text-amber-500 uppercase tracking-widest text-[10px]">Configuration incomplète</h4>
      <p class="text-xs text-on-surface-variant/60 mt-1">Salons non configurés : {missingChannels.map(c => c.label).join(', ')}. Allez dans l'onglet <b>Salons & Rôles</b> pour les configurer.</p>
    </div>
  </div>
{/if}

<div class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-8">
  <div class="flex items-center justify-between">
    <h3 class="text-lg font-black flex items-center gap-3"><Papicon icon="List" size={20} class="text-primary" /> État des fonctionnalités</h3>
    <div class="flex gap-4 text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40">
      <span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Actif</span>
      <span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-red-400"></span> Inactif</span>
    </div>
  </div>

  <div class="space-y-8">
    {#each groupedFeatures as group}
      <div class="space-y-4">
        <div class="flex items-center gap-3">
          <div class="h-[1px] flex-1 bg-outline-variant/10"></div>
          <span class="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/30">{group.category}</span>
          <div class="h-[1px] flex-1 bg-outline-variant/10"></div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {#each group.items as f}
            <div class="flex items-center gap-3 px-4 py-3 rounded-2xl bg-surface-container-high/20 border border-outline-variant/5 hover:bg-surface-container-high/40 transition-colors">
              <span class="w-2 h-2 rounded-full shrink-0 {f.enabled ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]' : 'bg-red-400'}"></span>
              <span class="text-sm font-bold flex-1 truncate text-on-surface/80">{f.featureName}</span>
              <div class="flex items-center gap-1.5 text-[8px] font-black">
                {#if f.loggingEnabled}<span class="px-1.5 py-0.5 rounded bg-surface-container-high/60 text-on-surface-variant/60">LOG</span>{/if}
                {#if f.notifyViaDM}<span class="px-1.5 py-0.5 rounded bg-primary/10 text-primary">MP</span>{/if}
                {#if f.notifyViaDiscordChannel}<span class="px-1.5 py-0.5 rounded bg-secondary/10 text-secondary">CH</span>{/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
