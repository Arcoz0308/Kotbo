<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { router } from 'tinro';
  import ModulePage from '../lib/components/ModulePage.svelte';
  import RefreshButton from '../lib/components/RefreshButton.svelte';
  import Papicon from '../lib/components/Papicon.svelte';
  import { toast } from '../lib/stores/toast.svelte';
  import { API_BASE_URL } from '../lib/api';

  let events = $state<any[]>([]);
  let isFetching = $state(false);

  const canManageEvents = $derived(
    !!dashboardStore.state.featureAccess?.events?.canConfigure
      || !!dashboardStore.state.access?.canManageSettings
      || !!dashboardStore.state.access?.canModerateContent
  );

  onMount(async () => {
    await loadEvents();
  });

  async function loadEvents() {
    isFetching = true;
    try {
      const guildId = authStore.selectedGuildId;
      if (!guildId) return;
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/events`, {
        headers: { 'Authorization': `Bearer ${authStore.token}` }
      });
      const data = await res.json();
      events = data.events || [];
    } catch (err) {
      toast.error('Erreur lors du chargement des événements');
    } finally {
      isFetching = false;
    }
  }

  function getStatusLabel(status: string) {
    switch (status) {
      case 'DRAFT': return 'Brouillon';
      case 'PUBLISHED': return 'Publié';
      case 'ONGOING': return 'En cours';
      case 'COMPLETED': return 'Terminé';
      case 'CANCELLED': return 'Annulé';
      default: return status;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'DRAFT': return 'bg-on-surface/5 text-on-surface-variant/60';
      case 'PUBLISHED': return 'bg-blue-500/10 text-blue-500';
      case 'ONGOING': return 'bg-emerald-500/10 text-emerald-500';
      case 'COMPLETED': return 'bg-purple-500/10 text-purple-500';
      case 'CANCELLED': return 'bg-red-500/10 text-red-500';
      default: return 'bg-on-surface/5 text-on-surface-variant/60';
    }
  }

  async function createNewEvent() {
    const guildId = authStore.selectedGuildId;
    if (!guildId) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authStore.token}`
        },
        body: JSON.stringify({
          title: 'Nouvel Événement',
          type: 'QUIZ',
          description: 'Description de l\'événement...'
        })
      });
      const data = await res.json();
      if (data.event) {
        toast.success('Événement créé');
        router.goto(`/events/edit/${data.event.id}`);
      }
    } catch (err) {
      toast.error('Erreur lors de la création');
    }
  }
</script>

<ModulePage 
  title="Événements" 
  description="Créez et gérez des événements interactifs sur votre serveur Discord (Quiz, etc.)." 
  icon="Zap"
  featureKey="events"
>
  {#snippet actions()}
    <div class="flex gap-3">
      <RefreshButton
        onClick={loadEvents}
        loading={isFetching}
        label="Actualiser"
      />
      {#if canManageEvents}
        <button
          onclick={createNewEvent}
          class="px-5 py-2.5 bg-primary text-on-primary rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
        >
          Nouvel Événement
        </button>
      {/if}
    </div>
  {/snippet}

  <div class="space-y-10 pb-20">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-surface-container-low/40 rounded-[2.5rem] p-8 border border-outline-variant/10">
        <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Total Événements</p>
        <p class="text-4xl font-black text-on-surface mt-2">{events.length}</p>
      </div>
      <div class="bg-surface-container-low/40 rounded-[2.5rem] p-8 border border-outline-variant/10">
        <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">En cours</p>
        <p class="text-4xl font-black text-emerald-500 mt-2">{events.filter(e => e.status === 'ONGOING').length}</p>
      </div>
      <div class="bg-surface-container-low/40 rounded-[2.5rem] p-8 border border-outline-variant/10">
        <p class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">Participations</p>
        <p class="text-4xl font-black text-on-surface mt-2">{events.reduce((acc, e) => acc + (e._count?.participants || 0), 0)}</p>
      </div>
    </div>

    <section class="space-y-6">
      <h3 class="text-xl font-black text-on-surface px-2">Liste des événements</h3>

      <div class="grid grid-cols-1 gap-4">
        {#each events as event}
          <div class="bg-surface-container-low/30 rounded-[2.5rem] border border-outline-variant/10 p-8 flex flex-col md:flex-row justify-between items-center gap-6 group hover:bg-surface-container-low/50 transition-colors">
            <div class="flex items-center gap-6">
              <div class="w-16 h-16 rounded-[1.5rem] bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                <Papicon icon="Zap" size={24} />
              </div>
              <div>
                <div class="flex items-center gap-3">
                  <h4 class="text-xl font-black text-on-surface">{event.title}</h4>
                  <span class="px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest {getStatusColor(event.status)} border border-current/10">
                    {getStatusLabel(event.status)}
                  </span>
                </div>
                <p class="text-on-surface-variant/60 mt-1 line-clamp-1">{event.description || 'Aucune description.'}</p>
                <div class="flex items-center gap-4 mt-3">
                  <span class="text-[10px] font-bold text-on-surface-variant/40 flex items-center gap-1.5">
                    <Papicon icon="HelpCircle" size={12} /> {event._count?.questions || 0} questions
                  </span>
                  <span class="text-[10px] font-bold text-on-surface-variant/40 flex items-center gap-1.5">
                    <Papicon icon="Users" size={12} /> {event._count?.participants || 0} participants
                  </span>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-3">
              {#if event.status === 'ONGOING' || event.status === 'PUBLISHED'}
                <button 
                  onclick={() => router.goto(`/events/control/${event.id}`)}
                  class="px-6 py-3 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform flex items-center gap-2"
                >
                  <Papicon icon="Play" size={12} /> Piloter
                </button>
              {/if}
              <button 
                onclick={() => router.goto(`/events/edit/${event.id}`)}
                class="px-6 py-3 bg-surface-container-high rounded-2xl text-[10px] font-black uppercase tracking-widest border border-outline-variant/10 hover:bg-surface-container-highest transition-colors flex items-center gap-2"
              >
                <Papicon icon="Edit3" size={12} /> Éditer
              </button>
            </div>
          </div>
        {:else}
          <div class="py-20 text-center bg-surface-container-low/20 rounded-[3rem] border border-dashed border-outline-variant/20">
            <div class="w-20 h-20 bg-on-surface/5 rounded-full flex items-center justify-center mx-auto mb-6 text-on-surface-variant/20">
              <Papicon icon="Zap" size={40} />
            </div>
            <p class="text-on-surface-variant/60 font-black text-xl">Aucun événement pour le moment.</p>
            {#if canManageEvents}
              <button onclick={createNewEvent} class="mt-6 text-primary font-black uppercase text-[10px] tracking-widest hover:underline">
                Créer votre premier événement
              </button>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  </div>
</ModulePage>
