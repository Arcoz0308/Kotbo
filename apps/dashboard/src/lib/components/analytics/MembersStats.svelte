<script lang="ts">
  import Papicon from '../Papicon.svelte';
  import Chart from '../charts/Chart.svelte';
  import ExportDropdown from './ExportDropdown.svelte';
  import { rescanMemberStats } from '../../api';
  import { toast } from '../../stores/toast.svelte';
  import * as XLSX from 'xlsx';

  let { data, chartLabels, onOpenMember } = $props<{
    data: any;
    chartLabels: any[];
    onOpenMember?: (userId: string, name: string) => void;
  }>();

  let showCumulative = $state(false);
  let scanningMembers = $state(false);

  const cumulativeJoins = $derived(() => {
    let total = 0;
    return chartLabels.map(l => { total += (l.membersJoined || 0); return total; });
  });

  const cumulativeLeaves = $derived(() => {
    let total = 0;
    return chartLabels.map(l => { total += (l.membersLeft || 0); return total; });
  });

  const getAvatar = (url: string | null) => url || 'https://cdn.discordapp.com/embed/avatars/0.png';

  function triggerDownload(content: BlobPart, fileName: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function exportCSV(name: string, rows: Record<string, unknown>[]) {
    if (!rows.length) { toast.error('Aucune donnée.'); return; }
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => String(r[h] ?? '')).join(','))].join('\n');
    triggerDownload(csv, `${name}.csv`, 'text/csv;charset=utf-8');
  }

  function exportXLSX(name: string, rows: Record<string, unknown>[]) {
    if (!rows.length) { toast.error('Aucune donnée.'); return; }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name.slice(0, 31));
    XLSX.writeFile(wb, `${name}.xlsx`);
  }

  function exportImage(cardSelector: string, name: string) {
    const card = document.querySelector(cardSelector);
    const canvas = card?.querySelector('canvas');
    if (!canvas) { toast.error('Graphique introuvable.'); return; }
    canvas.toBlob((blob) => {
      if (blob) triggerDownload(blob, `${name}.png`, 'image/png');
    }, 'image/png');
  }

  function fluxRows() {
    return chartLabels.map(l => ({ date: l.label, arrivees: l.membersJoined || 0, departs: l.membersLeft || 0, net: (l.membersJoined || 0) - (l.membersLeft || 0) }));
  }

  function activeRows() {
    return chartLabels.map(l => ({ date: l.label, peakOnline: l.peakOnline || 0, onlineMembers: l.onlineMembers || 0 }));
  }

  async function handleRescanMembers() {
    scanningMembers = true;
    try {
      const res = await rescanMemberStats({ force: false });
      if (res?.ok) {
        toast.success('Scraping des membres lancé en arrière-plan.');
      } else {
        toast.error(res?.error || 'Erreur lors du lancement du scraping');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du scraping');
    } finally {
      scanningMembers = false;
    }
  }
</script>

<div class="space-y-6">
  <!-- Population Chart -->
  <div id="chart-flux" class="premium-card p-8 rounded-xl space-y-8">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div class="flex items-center gap-4">
        <div class="bg-emerald-500/10 p-3 rounded-lg text-emerald-500">
          <Papicon icon="Users" size={24} />
        </div>
        <div>
          <h3 class="text-xl font-semibold text-on-surface">Flux de Population</h3>
          <p class="text-xs font-bold text-on-surface-variant/40">{showCumulative ? 'Vue cumulée' : 'Arrivées vs Départs'}</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <!-- Toggle Cumulé / Journalier -->
        <div class="flex bg-surface-container-high/40 p-1 rounded-lg border border-outline-variant/10">
          <button
            onclick={() => showCumulative = false}
            class="px-3 py-1.5 rounded-md text-xs font-medium transition-all {!showCumulative ? 'bg-on-surface text-surface shadow-sm' : 'text-on-surface-variant/60 hover:text-on-surface'}"
          >
            Journalier
          </button>
          <button
            onclick={() => showCumulative = true}
            class="px-3 py-1.5 rounded-md text-xs font-medium transition-all {showCumulative ? 'bg-on-surface text-surface shadow-sm' : 'text-on-surface-variant/60 hover:text-on-surface'}"
          >
            Cumulé
          </button>
        </div>
        <!-- Sync Membres -->
        <button
          onclick={handleRescanMembers}
          disabled={scanningMembers}
          class="p-2 rounded-lg bg-surface-container-high/40 hover:bg-surface-container-high border border-outline-variant/10 text-on-surface-variant/60 hover:text-emerald-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          title="Synchroniser les membres existants pour remplir l'historique"
        >
          <Papicon icon="ArrowsClockwise" size={16} />
        </button>
        <!-- Export -->
        <ExportDropdown
          onExportCSV={() => exportCSV('flux_population', fluxRows())}
          onExportXLSX={() => exportXLSX('flux_population', fluxRows())}
          onExportImage={() => exportImage('#chart-flux', 'flux_population')}
        />
        <!-- Stats -->
        <div class="flex gap-4">
          <div class="flex flex-col items-end">
             <span class="text-sm font-semibold text-emerald-500">+{chartLabels.reduce((a, b) => a + (b.membersJoined || 0), 0)}</span>
             <span class="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/40">Entrées</span>
          </div>
          <div class="flex flex-col items-end">
             <span class="text-sm font-semibold text-rose-500">-{chartLabels.reduce((a, b) => a + (b.membersLeft || 0), 0)}</span>
             <span class="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/40">Sorties</span>
          </div>
        </div>
      </div>
    </div>
    
    <div class="h-[300px]">
      {#if showCumulative}
        <Chart
          data={{
            labels: chartLabels.map(l => l.label),
            datasets: [
              {
                label: 'Arrivées (cumulé)',
                data: cumulativeJoins(),
                borderColor: '#10b981',
                borderWidth: 3,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#10b981',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 3,
                fill: true,
                tension: 0.4,
                gradient: {
                  backgroundColor: {
                    axis: 'y',
                    colors: { 0: 'rgba(16, 185, 129, 0)', 100: 'rgba(16, 185, 129, 0.15)' }
                  }
                }
              },
              {
                label: 'Départs (cumulé)',
                data: cumulativeLeaves(),
                borderColor: '#f97316',
                borderWidth: 3,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#f97316',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 3,
                fill: true,
                tension: 0.4,
                gradient: {
                  backgroundColor: {
                    axis: 'y',
                    colors: { 0: 'rgba(249, 115, 22, 0)', 100: 'rgba(249, 115, 22, 0.15)' }
                  }
                }
              }
            ]
          }}
          height={300}
        />
      {:else}
        <Chart
          data={{
            labels: chartLabels.map(l => l.label),
            datasets: [
              {
                label: 'Arrivées',
                data: chartLabels.map(l => l.membersJoined),
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                gradient: {
                  backgroundColor: {
                    axis: 'y',
                    colors: { 0: 'rgba(16, 185, 129, 0)', 100: 'rgba(16, 185, 129, 0.2)' }
                  }
                }
              },
              {
                label: 'Départs',
                data: chartLabels.map(l => l.membersLeft),
                borderColor: '#f97316',
                backgroundColor: 'rgba(249, 115, 22, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                gradient: {
                  backgroundColor: {
                    axis: 'y',
                    colors: { 0: 'rgba(249, 115, 22, 0)', 100: 'rgba(249, 115, 22, 0.2)' }
                  }
                }
              }
            ]
          }}
          height={300}
        />
      {/if}
    </div>

    <div class="grid grid-cols-3 gap-4 border-t border-outline-variant/10 pt-6">
      <div class="space-y-1">
        <p class="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/40">Moy. Arrivées/jour</p>
        <p class="text-2xl font-semibold text-emerald-500">{Math.round(chartLabels.reduce((a, b) => a + (b.membersJoined || 0), 0) / Math.max(chartLabels.length, 1))}</p>
      </div>
      <div class="space-y-1">
        <p class="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/40">Moy. Départs/jour</p>
        <p class="text-2xl font-semibold text-orange-500">{Math.round(chartLabels.reduce((a, b) => a + (b.membersLeft || 0), 0) / Math.max(chartLabels.length, 1))}</p>
      </div>
      <div class="space-y-1">
        <p class="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/40">Net</p>
        <p class="text-2xl font-semibold {chartLabels.reduce((a, b) => a + (b.membersJoined || 0) - (b.membersLeft || 0), 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}">
          {chartLabels.reduce((a, b) => a + (b.membersJoined || 0) - (b.membersLeft || 0), 0)}
        </p>
      </div>
    </div>
  </div>

  <!-- Active Members -->
  <div id="chart-active" class="premium-card p-8 rounded-xl space-y-6">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <div class="bg-cyan-500/10 p-3 rounded-lg text-cyan-500">
          <Papicon icon="Activity" size={24} />
        </div>
        <div>
          <h3 class="text-xl font-semibold text-on-surface">Membres Actifs</h3>
          <p class="text-xs font-bold text-on-surface-variant/40">Pic d'activité simultanée</p>
        </div>
      </div>
      <ExportDropdown
        onExportCSV={() => exportCSV('membres_actifs', activeRows())}
        onExportXLSX={() => exportXLSX('membres_actifs', activeRows())}
        onExportImage={() => exportImage('#chart-active', 'membres_actifs')}
      />
    </div>

    <div class="h-[250px]">
      <Chart 
        data={{
          labels: chartLabels.map(l => l.label),
          datasets: [{
            label: 'Membres Actifs',
            data: chartLabels.map(l => l.peakOnline || 0),
            borderColor: '#06b6d4',
            backgroundColor: 'rgba(6, 182, 212, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            gradient: {
              backgroundColor: {
                axis: 'y',
                colors: { 0: 'rgba(6, 182, 212, 0)', 100: 'rgba(6, 182, 212, 0.2)' }
              }
            }
          }]
        }}
        height={250}
      />
    </div>

    <div class="grid grid-cols-3 gap-4 border-t border-outline-variant/10 pt-6">
      <div class="space-y-1">
        <p class="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/40">Pic Record</p>
        <p class="text-2xl font-semibold text-cyan-500">{Math.max(...chartLabels.map(l => l.peakOnline || 0), 0)}</p>
      </div>
      <div class="space-y-1">
        <p class="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/40">Moyenne</p>
        <p class="text-2xl font-semibold text-cyan-500">{Math.round(chartLabels.reduce((a, b) => a + (b.onlineMembers || 0), 0) / Math.max(chartLabels.length, 1))}</p>
      </div>
      <div class="space-y-1">
        <p class="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/40">Minimum</p>
        <p class="text-2xl font-semibold text-cyan-500">{Math.min(...chartLabels.filter(l => l.onlineMembers > 0).map(l => l.onlineMembers || 0), 0)}</p>
      </div>
    </div>
  </div>

  <!-- Clan Tag Growth Chart -->
  {#if data?.clanTag}
    {@const growth = (chartLabels[chartLabels.length - 1]?.taggedMembersCount || 0) - (chartLabels[0]?.taggedMembersCount || 0)}
    <div id="chart-clantag" class="premium-card p-8 rounded-xl space-y-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <div class="bg-indigo-500/10 p-3 rounded-lg text-indigo-500">
            <Papicon icon="Award" size={24} />
          </div>
          <div>
            <h3 class="text-xl font-semibold text-on-surface">Membres avec le Tag [{data.clanTag}]</h3>
            <p class="text-xs font-bold text-on-surface-variant/40">Évolution du nombre de membres arborant le tag du serveur</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <ExportDropdown
            onExportCSV={() => exportCSV('clan_tag', chartLabels.map(l => ({ date: l.label, taggedMembers: l.taggedMembersCount || 0 })))}
            onExportXLSX={() => exportXLSX('clan_tag', chartLabels.map(l => ({ date: l.label, taggedMembers: l.taggedMembersCount || 0 })))}
            onExportImage={() => exportImage('#chart-clantag', 'clan_tag')}
          />
          <div class="flex flex-col items-end">
            <span class="text-2xl font-semibold text-indigo-500">{data.clanTaggedMembersCount || 0}</span>
            <span class="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/40">Membres Actuels</span>
          </div>
        </div>
      </div>

      <div class="h-[250px]">
        <Chart 
          data={{
            labels: chartLabels.map(l => l.label),
            datasets: [{
              label: `Membres [${data.clanTag}]`,
              data: chartLabels.map(l => l.taggedMembersCount || 0),
              borderColor: '#6366f1',
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              fill: true,
              tension: 0.4,
              pointRadius: 0,
              gradient: {
                backgroundColor: {
                  axis: 'y',
                  colors: { 0: 'rgba(99, 102, 241, 0)', 100: 'rgba(99, 102, 241, 0.2)' }
                }
              }
            }]
          }}
          height={250}
        />
      </div>

      <div class="grid grid-cols-3 gap-4 border-t border-outline-variant/10 pt-6">
        <div class="space-y-1">
          <p class="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/40">Début de Période</p>
          <p class="text-2xl font-semibold text-indigo-500">{chartLabels[0]?.taggedMembersCount || 0}</p>
        </div>
        <div class="space-y-1">
          <p class="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/40">Fin de Période</p>
          <p class="text-2xl font-semibold text-indigo-500">{chartLabels[chartLabels.length - 1]?.taggedMembersCount || 0}</p>
        </div>
        <div class="space-y-1">
          <p class="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/40">Croissance</p>
          <p class="text-2xl font-semibold {growth >= 0 ? 'text-emerald-500' : 'text-rose-500'}">
            {growth >= 0 ? `+${growth}` : growth}
          </p>
        </div>
      </div>
    </div>
  {/if}

  <!-- Top Members -->
  <div class="premium-card p-8 rounded-xl space-y-6">
    <div class="flex items-center gap-4">
      <div class="bg-primary/10 p-3 rounded-lg text-primary">
        <Papicon icon="Trophy" size={24} />
      </div>
      <div>
        <h3 class="text-xl font-semibold text-on-surface">Membres les Plus Actifs</h3>
        <p class="text-xs font-bold text-on-surface-variant/40">Parmi tous les contributeurs</p>
      </div>
    </div>

    <div class="space-y-3">
      {#each (data?.topMessageMembers || []).slice(0, 10) as member, index}
        <button 
          onclick={() => onOpenMember?.(member.userId, member.name)}
          class="w-full flex items-center justify-between p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 hover:bg-surface-container-high/60 transition-all text-left group"
        >
          <div class="flex items-center gap-4 flex-1 min-w-0">
            <span class="text-sm font-semibold text-on-surface-variant/40 w-6 text-right">#{index + 1}</span>
            <img src={member.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'} alt={member.name} class="w-10 h-10 rounded-full" />
            <div class="flex-1 min-w-0">
              <p class="font-semibold text-on-surface truncate">{member.name}</p>
              <p class="text-xs text-on-surface-variant/60">{member.messageCount.toLocaleString('fr-FR')} messages</p>
            </div>
          </div>
          <Papicon icon="ArrowRight" size={16} class="opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      {/each}
      {#if (data?.topMessageMembers || []).length === 0}
        <p class="text-center py-10 text-on-surface-variant/40 font-bold text-sm">Aucune donnée disponible</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .premium-card {
    background: rgba(var(--color-surface-container-low), 0.4);
    backdrop-filter: blur(24px);
    border: 1px solid rgba(var(--color-outline-variant), 0.1);
    transition: all 0.4s cubic-bezier(0.2, 1, 0.3, 1);
  }
</style>
