<script lang="ts">
  import Papicon from '../Papicon.svelte';
  import Chart from '../charts/Chart.svelte';
  import ExportDropdown from './ExportDropdown.svelte';
  import { toast } from '../../stores/toast.svelte';
  import * as XLSX from 'xlsx';

  let { data, mode = 'messages', onOpenMember } = $props<{
    data: any;
    mode?: 'messages' | 'voice';
    onOpenMember: (id: string, name: string) => void
  }>();

  let expandedView = $state<'members' | 'channels' | null>(null);

  let searchQuery = $state('');
  let currentPage = $state(1);
  const itemsPerPage = 50;

  function openExpanded(view: 'members' | 'channels') {
    expandedView = view;
    searchQuery = '';
    currentPage = 1;
  }

  function closeExpanded() {
    expandedView = null;
    searchQuery = '';
    currentPage = 1;
  }

  $effect(() => {
    searchQuery;
    currentPage = 1;
  });

  const topMembers = $derived(mode === 'messages' ? (data?.topMessageMembers || []) : (data?.topVoiceMembers || []));
  const topChannels = $derived(mode === 'messages' ? (data?.topChannels || []) : (data?.topVoiceChannels || []));

  const filteredExpandedData = $derived(() => {
    const source = expandedView === 'members' ? topMembers : topChannels;
    if (!searchQuery) return source;
    const q = searchQuery.toLowerCase();
    return source.filter((item: any) => {
      const name = item.name || item.username || item.channelName || item.channelId || '';
      return name.toLowerCase().includes(q);
    });
  });

  const totalPages = $derived(Math.max(1, Math.ceil(filteredExpandedData().length / itemsPerPage)));
  const paginatedData = $derived(filteredExpandedData().slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage));

  const membersChartData = $derived({
    labels: topMembers.slice(0, 5).map((m: any) => m.name || m.username),
    datasets: [{
      label: mode === 'messages' ? 'Messages' : 'Minutes',
      data: topMembers.slice(0, 5).map((m: any) => mode === 'messages' ? m.messageCount : Math.round(m.voiceTimeSeconds / 60)),
      backgroundColor: mode === 'messages' ? '#6366f1' : '#10b981',
      borderRadius: 8,
      borderSkipped: false,
      gradient: {
        backgroundColor: {
          axis: 'x',
          colors: {
            0: mode === 'messages' ? 'rgba(99, 102, 241, 0.4)' : 'rgba(16, 185, 129, 0.4)',
            100: mode === 'messages' ? '#6366f1' : '#10b981'
          }
        }
      }
    }]
  });

  const channelsChartData = $derived({
    labels: topChannels.slice(0, 5).map((c: any) => `#${c.channelName || c.name || c.channelId}`),
    datasets: [{
      label: mode === 'messages' ? 'Messages' : 'Minutes',
      data: topChannels.slice(0, 5).map((c: any) => mode === 'messages' ? (c.messagesCount || c.count) : (c.voiceMinutes || 0)),
      backgroundColor: mode === 'messages' ? '#ec4899' : '#10b981',
      borderRadius: 8,
      borderSkipped: false,
      gradient: {
        backgroundColor: {
          axis: 'x',
          colors: mode === 'messages'
            ? { 0: 'rgba(236, 72, 153, 0.4)', 100: '#ec4899' }
            : { 0: 'rgba(16, 185, 129, 0.4)', 100: '#10b981' }
        }
      }
    }]
  });

  const expandedChartData = $derived({
    labels: (expandedView === 'members' ? topMembers : topChannels).slice(0, 20).map((item: any) => {
      if (expandedView === 'members') return item.name || item.username;
      return `#${item.channelName || item.name || item.channelId}`;
    }),
    datasets: [{
      label: expandedView === 'members'
        ? (mode === 'messages' ? 'Messages' : 'Minutes')
        : (mode === 'messages' ? 'Messages' : 'Minutes'),
      data: (expandedView === 'members' ? topMembers : topChannels).slice(0, 20).map((item: any) => {
        if (expandedView === 'members') {
          return mode === 'messages' ? item.messageCount : Math.round(item.voiceTimeSeconds / 60);
        }
        return mode === 'messages' ? (item.messagesCount || item.count) : (item.voiceMinutes || 0);
      }),
      backgroundColor: expandedView === 'members'
        ? (mode === 'messages' ? '#6366f1' : '#10b981')
        : (mode === 'messages' ? '#ec4899' : '#10b981'),
      borderRadius: 4
    }]
  });

  const horizontalOptions = $derived({
    indexAxis: 'y',
    scales: {
      x: { display: true, beginAtZero: true },
      y: { display: true, grid: { display: false } }
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: (context: any) => `${context.parsed.x.toLocaleString('fr-FR')} ${mode === 'messages' ? 'messages' : 'minutes'}`
        }
      }
    }
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

  function doExportCSV(name: string, rows: Record<string, unknown>[]) {
    if (!rows.length) { toast.error('Aucune donnée.'); return; }
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => String(r[h] ?? '')).join(','))].join('\n');
    triggerDownload(csv, `${name}.csv`, 'text/csv;charset=utf-8');
  }

  function doExportXLSX(name: string, rows: Record<string, unknown>[]) {
    if (!rows.length) { toast.error('Aucune donnée.'); return; }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name.slice(0, 31));
    XLSX.writeFile(wb, `${name}.xlsx`);
  }

  function doExportImage(cardSelector: string, name: string) {
    const card = document.querySelector(cardSelector);
    const canvas = card?.querySelector('canvas');
    if (!canvas) { toast.error('Graphique introuvable.'); return; }
    canvas.toBlob((blob) => {
      if (blob) triggerDownload(blob, `${name}.png`, 'image/png');
    }, 'image/png');
  }

  function membersRows() {
    return topMembers.map((m: any, i: number) => ({
      rang: i + 1,
      nom: m.name || m.username,
      ...(mode === 'messages' ? { messages: m.messageCount } : { minutes_vocal: Math.round(m.voiceTimeSeconds / 60) })
    }));
  }

  function channelsRows() {
    return topChannels.map((c: any, i: number) => ({
      rang: i + 1,
      salon: c.channelName || c.name || c.channelId,
      ...(mode === 'messages' ? { messages: c.messagesCount || c.count } : { minutes_vocal: c.voiceMinutes || 0 })
    }));
  }
</script>

{#if expandedView}
  <!-- Expanded Full Page View -->
  <div class="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
    <!-- Header -->
    <div class="premium-card p-6 md:p-8 rounded-xl flex items-start justify-between">
      <div class="flex items-center gap-4">
        <div class="p-3 rounded-lg {expandedView === 'members' ? (mode === 'messages' ? 'bg-primary/10 text-primary' : 'bg-emerald-500/10 text-emerald-500') : (mode === 'messages' ? 'bg-secondary/10 text-secondary' : 'bg-emerald-500/10 text-emerald-500')}">
          <Papicon icon={expandedView === 'members' ? (mode === 'messages' ? 'UsersFour' : 'Microphone') : (mode === 'messages' ? 'Hash' : 'SpeakerHigh')} size={24} />
        </div>
        <div>
          <h3 class="text-xl md:text-2xl font-semibold text-on-surface">
            {#if expandedView === 'members'}
              {mode === 'messages' ? 'Top Messagers' : 'Top Vocalistes'}
            {:else}
              {mode === 'messages' ? 'Salons Textuels Populaires' : 'Salons Vocaux Populaires'}
            {/if}
          </h3>
          <p class="text-xs font-bold text-on-surface-variant/60">
            Classement complet ({filteredExpandedData().length} résultats sur {expandedView === 'members' ? topMembers.length : topChannels.length})
          </p>
        </div>
      </div>
      <button
        onclick={closeExpanded}
        class="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-container-high/40 hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors"
      >
        <Papicon icon="ArrowLeft" size={14} />
        Retour
      </button>
    </div>

    <!-- Chart -->
    <div class="premium-card p-6 md:p-8 rounded-xl">
      <div class="h-[350px]">
        <Chart data={expandedChartData} type="bar" height={350} options={horizontalOptions} />
      </div>
    </div>

    <!-- Search -->
    <div class="premium-card p-4 rounded-xl">
      <div class="relative">
        <div class="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/40">
          <Papicon icon="MagnifyingGlass" size={20} />
        </div>
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Rechercher par nom..."
          class="w-full bg-surface-container-high/40 text-on-surface text-sm font-bold rounded-lg pl-12 pr-4 py-3 border border-outline-variant/5 focus:border-primary/50 focus:outline-none transition-colors placeholder:text-on-surface-variant/40"
        />
      </div>
    </div>

    <!-- Data List -->
    <div class="premium-card p-6 md:p-8 rounded-xl space-y-3">
      {#each paginatedData as item, i}
        {@const globalIndex = (currentPage - 1) * itemsPerPage + i + 1}

        {#if expandedView === 'members'}
          <button
            onclick={() => onOpenMember(item.userId, item.name || item.username)}
            class="w-full flex items-center justify-between p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 hover:bg-surface-container-high/60 transition-all text-left group"
          >
            <div class="flex items-center gap-4">
              <div class="w-8 text-center text-xs font-semibold text-on-surface-variant/40">{globalIndex}</div>
              <div class="relative">
                <img src={getAvatar(item.avatarUrl)} alt="" class="w-10 h-10 rounded-xl object-cover" />
                <div class="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-surface {mode === 'messages' ? 'bg-primary' : 'bg-emerald-500'}"></div>
              </div>
              <p class="text-base font-semibold text-on-surface">@{item.name || item.username}</p>
            </div>
            <div class="flex items-center gap-6">
              <div class="text-right">
                <p class="text-[10px] font-semibold {mode === 'messages' ? 'text-primary' : 'text-emerald-500'} uppercase tracking-widest">{mode === 'messages' ? 'Messages' : 'Minutes'}</p>
                <p class="text-base font-semibold text-on-surface">{(mode === 'messages' ? item.messageCount : Math.round(item.voiceTimeSeconds / 60)).toLocaleString('fr-FR')}</p>
              </div>
              <Papicon icon="ArrowRight" size={16} class="opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </button>
        {:else}
          <div class="w-full flex items-center justify-between p-4 rounded-lg bg-surface-container-high/20 border border-outline-variant/5">
            <div class="flex items-center gap-4">
              <div class="w-8 text-center text-xs font-semibold text-on-surface-variant/40">{globalIndex}</div>
              <div class="{mode === 'messages' ? 'bg-secondary/10 text-secondary' : 'bg-emerald-500/10 text-emerald-500'} p-3 rounded-xl">
                <Papicon icon={mode === 'messages' ? 'Hash' : 'SpeakerHigh'} size={20} />
              </div>
              <p class="text-base font-semibold text-on-surface">#{item.channelName || item.name || item.channelId}</p>
            </div>
            <div class="text-right">
              <p class="text-[10px] font-semibold {mode === 'messages' ? 'text-secondary' : 'text-emerald-500'} uppercase tracking-widest">{mode === 'messages' ? 'Messages' : 'Minutes'}</p>
              <p class="text-base font-semibold text-on-surface">{(mode === 'messages' ? (item.messagesCount || item.count) : (item.voiceMinutes || 0)).toLocaleString('fr-FR')}</p>
            </div>
          </div>
        {/if}
      {/each}

      {#if paginatedData.length === 0}
        <div class="py-20 text-center opacity-40">
          <Papicon icon="Ghost" size={48} class="mx-auto mb-4" />
          <p class="text-sm font-bold">Aucune donnée trouvée</p>
        </div>
      {/if}

      <!-- Pagination -->
      {#if totalPages > 1}
        <div class="flex items-center justify-between pt-4 border-t border-outline-variant/10">
          <button
            onclick={() => currentPage = Math.max(1, currentPage - 1)}
            disabled={currentPage === 1}
            class="px-4 py-2 rounded-xl bg-surface-container-high/40 hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Papicon icon="CaretLeft" size={14} />
            Précédent
          </button>
          <span class="text-xs font-bold text-on-surface-variant/60">Page {currentPage} sur {totalPages}</span>
          <button
            onclick={() => currentPage = Math.min(totalPages, currentPage + 1)}
            disabled={currentPage === totalPages}
            class="px-4 py-2 rounded-xl bg-surface-container-high/40 hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            Suivant
            <Papicon icon="CaretRight" size={14} />
          </button>
        </div>
      {/if}
    </div>
  </div>

{:else}
  <!-- Default Grid View -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Top Members -->
    <div id="chart-top-members" class="premium-card p-8 rounded-xl space-y-8 flex flex-col">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <div class="p-3 rounded-lg {mode === 'messages' ? 'bg-primary/10 text-primary' : 'bg-emerald-500/10 text-emerald-500'}">
            <Papicon icon={mode === 'messages' ? 'UsersFour' : 'Microphone'} size={24} />
          </div>
          <div>
            <h3 class="text-xl font-semibold text-on-surface">{mode === 'messages' ? 'Top Messagers' : 'Top Vocalistes'}</h3>
            <p class="text-xs font-bold text-on-surface-variant/40">{mode === 'messages' ? 'Par volume de messages' : 'Par temps passé en vocal'}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <ExportDropdown
            onExportCSV={() => doExportCSV(`top_${mode === 'messages' ? 'messagers' : 'vocalistes'}`, membersRows())}
            onExportXLSX={() => doExportXLSX(`top_${mode === 'messages' ? 'messagers' : 'vocalistes'}`, membersRows())}
            onExportImage={() => doExportImage('#chart-top-members', `top_${mode === 'messages' ? 'messagers' : 'vocalistes'}`)}
          />
          {#if topMembers.length > 3}
            <button
              onclick={() => openExpanded('members')}
              class="px-4 py-2 rounded-xl bg-surface-container-high/40 hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors"
            >
              Voir plus
            </button>
          {/if}
        </div>
      </div>

      <div class="h-[250px]">
        <Chart data={membersChartData} type="bar" height={250} options={horizontalOptions} />
      </div>

      <div class="space-y-3 flex-grow pr-2">
        {#each topMembers.slice(0, 3) as member}
          <button
            onclick={() => onOpenMember(member.userId, member.name || member.username)}
            class="w-full flex items-center justify-between p-3 rounded-lg bg-surface-container-high/20 border border-outline-variant/5 hover:bg-surface-container-high/60 transition-all group"
          >
            <div class="flex items-center gap-3">
              <div class="relative">
                <img src={getAvatar(member.avatarUrl)} alt="" class="w-8 h-8 rounded-lg object-cover" />
                <div class="absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-surface {mode === 'messages' ? 'bg-primary' : 'bg-emerald-500'}"></div>
              </div>
              <p class="text-sm font-semibold text-on-surface">@{member.name || member.username}</p>
            </div>
            <div class="flex items-center gap-4">
              <div class="text-right">
                  <p class="text-[10px] font-semibold {mode === 'messages' ? 'text-primary' : 'text-emerald-500'} uppercase tracking-widest">{mode === 'messages' ? 'Messages' : 'Minutes'}</p>
                  <p class="text-sm font-semibold text-on-surface">{(mode === 'messages' ? member.messageCount : Math.round(member.voiceTimeSeconds / 60)).toLocaleString('fr-FR')}</p>
              </div>
              <Papicon icon="ArrowRight" size={14} class="opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </button>
        {/each}
        {#if topMembers.length === 0}
          <p class="text-center py-10 text-on-surface-variant/40 font-bold text-sm">Aucune donnée pour cette période</p>
        {/if}
      </div>
    </div>

    <!-- Top Channels -->
    <div id="chart-top-channels" class="premium-card p-8 rounded-xl space-y-8 flex flex-col">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <div class="{mode === 'messages' ? 'bg-secondary/10 text-secondary' : 'bg-emerald-500/10 text-emerald-500'} p-3 rounded-lg">
            <Papicon icon={mode === 'messages' ? 'Hash' : 'SpeakerHigh'} size={24} />
          </div>
          <div>
            <h3 class="text-xl font-semibold text-on-surface">{mode === 'messages' ? 'Salons Textuels Populaires' : 'Salons Vocaux Populaires'}</h3>
            <p class="text-xs font-bold text-on-surface-variant/40">{mode === 'messages' ? 'Distribution des messages par salon' : 'Temps passé en vocal par salon'}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <ExportDropdown
            onExportCSV={() => doExportCSV(`top_salons_${mode}`, channelsRows())}
            onExportXLSX={() => doExportXLSX(`top_salons_${mode}`, channelsRows())}
            onExportImage={() => doExportImage('#chart-top-channels', `top_salons_${mode}`)}
          />
          {#if topChannels.length > 4}
            <button
              onclick={() => openExpanded('channels')}
              class="px-4 py-2 rounded-xl bg-surface-container-high/40 hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors"
            >
              Voir plus
            </button>
          {/if}
        </div>
      </div>

      {#if topChannels.length > 0}
        <div class="h-[300px]">
          <Chart data={channelsChartData} type="bar" height={300} options={horizontalOptions} />
        </div>

        <div class="grid grid-cols-2 gap-4">
          {#each topChannels.slice(0, 4) as channel}
              <div class="p-4 rounded-lg {mode === 'messages' ? 'bg-secondary/5 border border-secondary/10 hover:border-secondary/30' : 'bg-emerald-500/5 border border-emerald-500/10 hover:border-emerald-500/30'} transition-colors">
                <p class="text-[11px] font-semibold uppercase tracking-widest {mode === 'messages' ? 'text-secondary/60' : 'text-emerald-500/60'} mb-1">#{channel.channelName || channel.name || channel.channelId}</p>
                <p class="text-lg font-semibold text-on-surface">
                  {(mode === 'messages' ? (channel.messagesCount || channel.count) : (channel.voiceMinutes || 0)).toLocaleString('fr-FR')}
                  <span class="text-xs font-bold text-on-surface-variant/40">{mode === 'messages' ? 'msgs' : 'min'}</span>
                </p>
              </div>
          {/each}
        </div>
      {:else}
        <div class="flex-grow flex flex-col items-center justify-center gap-4 text-center py-8">
          <div class="w-14 h-14 rounded-lg {mode === 'messages' ? 'bg-secondary/10 text-secondary' : 'bg-emerald-500/10 text-emerald-500'} flex items-center justify-center">
            <Papicon icon={mode === 'messages' ? 'Hash' : 'SpeakerHigh'} size={28} />
          </div>
          <div>
            <h3 class="text-base font-semibold text-on-surface">{mode === 'messages' ? 'Activité par Salon' : 'Activité Vocale par Salon'}</h3>
            <p class="text-xs font-bold text-on-surface-variant/40 mt-1 max-w-xs">Aucune donnée disponible pour cette période.</p>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .premium-card {
    background: rgba(var(--color-surface-container-low), 0.4);
    backdrop-filter: blur(24px);
    border: 1px solid rgba(var(--color-outline-variant), 0.1);
    transition: all 0.4s cubic-bezier(0.2, 1, 0.3, 1);
  }
</style>
