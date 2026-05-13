<script lang="ts">
  import Papicon from '../Papicon.svelte';

  let { data = [], onOpenMember = (_id: string, _name: string) => {} } = $props();

  const metrics = [
    { key: 'sanctionsCount', label: 'Sanctions', icon: 'Gavel', color: 'text-amber-500' },
    { key: 'reportsCount', label: 'Signalements', icon: 'Megaphone', color: 'text-rose-500' },
    { key: 'warns', label: 'Avertissements', icon: 'Warning', color: 'text-orange-400' },
    { key: 'bans', label: 'Bans', icon: 'Banning', color: 'text-red-500' },
  ];
</script>

<div class="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
  <div class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-6">
    <div class="flex justify-between items-center">
      <div>
        <h3 class="text-xl font-black flex items-center gap-3">
          <Papicon icon="TrendUp" size={20} class="text-primary" />
          Performance Individuelle du Staff
        </h3>
        <p class="text-[10px] text-on-surface-variant/50 mt-1 uppercase tracking-widest font-bold">Actions de modération sur la période</p>
      </div>
    </div>

    <div class="overflow-x-auto no-scrollbar rounded-2xl border border-outline-variant/5">
      <table class="w-full text-left border-collapse">
        <thead class="bg-surface-container-high/40 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">
          <tr>
            <th class="px-6 py-4">Membre Staff</th>
            {#each metrics as m}
              <th class="px-6 py-4 text-center">
                <div class="flex items-center justify-center gap-1.5">
                  <Papicon icon={m.icon} size={12} class={m.color} />
                  {m.label}
                </div>
              </th>
            {/each}
            <th class="px-6 py-4 text-center">Score / Taux</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-outline-variant/5">
          {#each data as staff}
            <tr class="hover:bg-surface-container-high/10 transition-colors group">
              <td class="px-6 py-4">
                <button 
                  onclick={() => onOpenMember(staff.userId, staff.displayName || staff.username)}
                  class="flex items-center gap-3 hover:opacity-80 transition-opacity"
                >
                  <div class="relative">
                    <img src={staff.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'} alt={staff.username} class="w-10 h-10 rounded-full border-2 border-outline-variant/10" />
                    {#if staff.reportRate > 80}
                      <span class="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-surface flex items-center justify-center text-[8px] text-white">★</span>
                    {/if}
                  </div>
                  <div class="flex flex-col items-start">
                    <span class="text-sm font-black">{staff.displayName || staff.username}</span>
                    <span class="text-[10px] text-on-surface-variant/40 font-mono">@{staff.username}</span>
                  </div>
                </button>
              </td>
              {#each metrics as m}
                <td class="px-6 py-4 text-center font-bold text-sm">
                  {staff[m.key] || 0}
                </td>
              {/each}
              <td class="px-6 py-4 text-center">
                <div class="flex flex-col items-center gap-1">
                  <span class="text-xs font-black text-primary">{staff.reportRate}%</span>
                  <div class="w-16 h-1 bg-surface-container-high rounded-full overflow-hidden">
                    <div class="h-full bg-primary rounded-full" style="width: {staff.reportRate}%"></div>
                  </div>
                  <span class="text-[8px] font-bold text-on-surface-variant/30 uppercase tracking-tighter">Précision Signalements</span>
                </div>
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="6" class="px-6 py-12 text-center text-on-surface-variant/30">
                <div class="flex flex-col items-center gap-3">
                  <Papicon icon="UserFocus" size={48} />
                  <p class="text-sm font-bold">Aucune action de modération relevée</p>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>
