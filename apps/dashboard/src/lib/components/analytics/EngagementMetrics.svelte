<script lang="ts">
  import Papicon from '../Papicon.svelte';
  import Chart from '../charts/Chart.svelte';
  import DetailedAnalyticsModal from './DetailedAnalyticsModal.svelte';

  let { data, mode = 'messages', onOpenMember } = $props<{ 
    data: any; 
    mode?: 'messages' | 'voice';
    onOpenMember: (id: string, name: string) => void 
  }>();

  let showMembersModal = $state(false);
  let showChannelsModal = $state(false);

  const topMembers = $derived(mode === 'messages' ? (data?.topMessageMembers || []) : (data?.topVoiceMembers || []));
  const topChannels = $derived(mode === 'messages' ? (data?.topChannels || []) : []);

  const membersChartData = $derived({
    labels: topMembers.slice(0, 5).map(m => m.name || m.username),
    datasets: [{
      label: mode === 'messages' ? 'Messages' : 'Minutes',
      data: topMembers.slice(0, 5).map(m => mode === 'messages' ? m.messageCount : Math.round(m.voiceTimeSeconds / 60)),
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

  const membersModalChartData = $derived({
    labels: topMembers.slice(0, 20).map(m => m.name || m.username),
    datasets: [{
      label: mode === 'messages' ? 'Messages' : 'Minutes',
      data: topMembers.slice(0, 20).map(m => mode === 'messages' ? m.messageCount : Math.round(m.voiceTimeSeconds / 60)),
      backgroundColor: mode === 'messages' ? '#6366f1' : '#10b981',
      borderRadius: 4
    }]
  });

  const channelsChartData = $derived({
    labels: topChannels.slice(0, 5).map(c => `#${c.channelName || c.name || c.channelId}`),
    datasets: [{
      label: 'Volume',
      data: topChannels.slice(0, 5).map(c => c.messagesCount || c.count),
      backgroundColor: '#ec4899',
      borderRadius: 8,
      borderSkipped: false,
      gradient: {
        backgroundColor: {
          axis: 'x',
          colors: { 0: 'rgba(236, 72, 153, 0.4)', 100: '#ec4899' }
        }
      }
    }]
  });

  const channelsModalChartData = $derived({
    labels: topChannels.slice(0, 20).map(c => `#${c.channelName || c.name || c.channelId}`),
    datasets: [{
      label: 'Volume',
      data: topChannels.slice(0, 20).map(c => c.messagesCount || c.count),
      backgroundColor: '#ec4899',
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
</script>

<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
  <!-- Top Members -->
  <div class="premium-card p-8 rounded-[2.5rem] space-y-8 flex flex-col">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <div class="p-3 rounded-2xl {mode === 'messages' ? 'bg-primary/10 text-primary' : 'bg-emerald-500/10 text-emerald-500'}">
          <Papicon icon={mode === 'messages' ? 'UsersFour' : 'Microphone'} size={24} />
        </div>
        <div>
          <h3 class="text-xl font-black text-on-surface">{mode === 'messages' ? 'Top Messagers' : 'Top Vocalistes'}</h3>
          <p class="text-xs font-bold text-on-surface-variant/40">{mode === 'messages' ? 'Par volume de messages' : 'Par temps passé en vocal'}</p>
        </div>
      </div>
      <button 
        onclick={() => showMembersModal = true}
        class="px-4 py-2 rounded-xl bg-surface-container-high/40 hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors"
      >
        Voir plus
      </button>
    </div>

    <div class="h-[250px]">
       <Chart data={membersChartData} type="bar" height={250} options={horizontalOptions} />
    </div>

    <div class="space-y-3 flex-grow pr-2">
      {#each topMembers.slice(0, 3) as member}
        <button 
          onclick={() => onOpenMember(member.userId, member.name || member.username)}
          class="w-full flex items-center justify-between p-3 rounded-2xl bg-surface-container-high/20 border border-outline-variant/5 hover:bg-surface-container-high/60 transition-all group"
        >
          <div class="flex items-center gap-3">
            <div class="relative">
               <img src={getAvatar(member.avatarUrl)} alt="" class="w-8 h-8 rounded-lg object-cover" />
               <div class="absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-surface {mode === 'messages' ? 'bg-primary' : 'bg-emerald-500'}"></div>
            </div>
            <p class="text-sm font-black text-on-surface">@{member.name || member.username}</p>
          </div>
          <div class="flex items-center gap-4">
             <div class="text-right">
                <p class="text-[10px] font-black {mode === 'messages' ? 'text-primary' : 'text-emerald-500'} uppercase tracking-widest">{mode === 'messages' ? 'Messages' : 'Minutes'}</p>
                <p class="text-sm font-black text-on-surface">{(mode === 'messages' ? member.messageCount : Math.round(member.voiceTimeSeconds / 60)).toLocaleString('fr-FR')}</p>
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

  <!-- Top Channels (messages mode only) -->
  {#if mode === 'messages'}
  <div class="premium-card p-8 rounded-[2.5rem] space-y-8 flex flex-col">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <div class="bg-secondary/10 p-3 rounded-2xl text-secondary">
          <Papicon icon="Hash" size={24} />
        </div>
        <div>
          <h3 class="text-xl font-black text-on-surface">Salons Textuels Populaires</h3>
          <p class="text-xs font-bold text-on-surface-variant/40">Distribution des messages par salon</p>
        </div>
      </div>
      <button 
        onclick={() => showChannelsModal = true}
        class="px-4 py-2 rounded-xl bg-surface-container-high/40 hover:bg-surface-container-high text-xs font-bold text-on-surface transition-colors"
      >
        Voir plus
      </button>
    </div>

    <div class="h-[300px]">
       <Chart data={channelsChartData} type="bar" height={300} options={horizontalOptions} />
    </div>
    
    <div class="grid grid-cols-2 gap-4">
       {#each topChannels.slice(0, 4) as channel}
          <div class="p-4 rounded-2xl bg-secondary/5 border border-secondary/10 hover:border-secondary/30 transition-colors">
             <p class="text-[9px] font-black uppercase tracking-widest text-secondary/60 mb-1">#{channel.channelName || channel.name || channel.channelId}</p>
             <p class="text-lg font-black text-on-surface">{(channel.messagesCount || channel.count).toLocaleString('fr-FR')}</p>
          </div>
       {/each}
    </div>
  </div>
  {:else}
  <!-- Voice mode: no per-channel voice data available -->
  <div class="premium-card p-8 rounded-[2.5rem] flex flex-col items-center justify-center gap-4 text-center min-h-[200px]">
    <div class="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
      <Papicon icon="Microphone" size={28} />
    </div>
    <div>
      <h3 class="text-base font-black text-on-surface">Activité Vocale par Salon</h3>
      <p class="text-xs font-bold text-on-surface-variant/40 mt-1 max-w-xs">Le suivi du temps vocal par salon n'est pas encore disponible. Seul le temps total par membre est enregistré.</p>
    </div>
  </div>
  {/if}
</div>

<DetailedAnalyticsModal
  open={showMembersModal}
  onClose={() => showMembersModal = false}
  title={mode === 'messages' ? 'Top Messagers' : 'Top Vocalistes'}
  subtitle="Classement complet des membres les plus actifs"
  icon={mode === 'messages' ? 'UsersFour' : 'Microphone'}
  iconBgClass={mode === 'messages' ? 'bg-primary/10' : 'bg-emerald-500/10'}
  iconColorClass={mode === 'messages' ? 'text-primary' : 'text-emerald-500'}
  type={mode === 'messages' ? 'messages' : 'voice'}
  data={topMembers}
  chartData={membersModalChartData}
  chartOptions={horizontalOptions}
  {onOpenMember}
/>

<DetailedAnalyticsModal
  open={showChannelsModal}
  onClose={() => showChannelsModal = false}
  title="Salons Populaires"
  subtitle="Activité détaillée par salon"
  icon="Hash"
  iconBgClass="bg-secondary/10"
  iconColorClass="text-secondary"
  type="channels"
  data={topChannels}
  chartData={channelsModalChartData}
  chartOptions={horizontalOptions}
/>

<style>
  .premium-card {
    background: rgba(var(--color-surface-container-low), 0.4);
    backdrop-filter: blur(24px);
    border: 1px solid rgba(var(--color-outline-variant), 0.1);
    transition: all 0.4s cubic-bezier(0.2, 1, 0.3, 1);
  }
</style>


