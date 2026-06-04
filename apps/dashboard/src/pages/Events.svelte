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
  let showTypeModal = $state(false);
  let isCreating = $state(false);

  const EVENT_TYPES = [
    {
      type: 'QUIZ',
      label: 'Quiz',
      icon: 'HelpCircle',
      description: 'Questions à choix multiples ou réponses libres. Idéal pour tester les connaissances de votre communauté.',
      color: 'from-blue-500/20 to-indigo-500/20',
      border: 'border-blue-500/30 hover:border-blue-400/60',
      iconBg: 'bg-blue-500/10 text-blue-400',
      tag: 'Questions & Réponses',
      tagColor: 'bg-blue-500/15 text-blue-400',
    },
    {
      type: 'CTF',
      label: 'Capture The Flag',
      icon: 'Flag',
      description: 'Défis de sécurité informatique avec flags cachés. Classement en temps réel, rôles en récompense.',
      color: 'from-emerald-500/20 to-teal-500/20',
      border: 'border-emerald-500/30 hover:border-emerald-400/60',
      iconBg: 'bg-emerald-500/10 text-emerald-400',
      tag: 'Hacking & Sécurité',
      tagColor: 'bg-emerald-500/15 text-emerald-400',
    },
  ] as const;

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

  async function createEventWithType(type: 'QUIZ' | 'CTF') {
    const guildId = authStore.selectedGuildId;
    if (!guildId) return;
    isCreating = true;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authStore.token}`
        },
        body: JSON.stringify({
          title: `Nouveau ${type === 'CTF' ? 'CTF' : 'Quiz'}`,
          type,
          description: 'Description de l\'événement...'
        })
      });
      const data = await res.json();
      if (data.event) {
        toast.success('Événement créé');
        showTypeModal = false;
        router.goto(`/events/edit/${data.event.id}`);
      }
    } catch (err) {
      toast.error('Erreur lors de la création');
    } finally {
      isCreating = false;
    }
  }

  async function deleteEvent(eventId: string, title: string) {
    const guildId = authStore.selectedGuildId;
    if (!guildId) return;

    const confirmDelete = confirm(`Êtes-vous sûr de vouloir supprimer l'événement "${title}" ? Cette action est irréversible et supprimera toutes les questions, réponses et participants associés.`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${guildId}/events/${eventId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authStore.token}`
        }
      });
      if (res.ok) {
        toast.success('Événement supprimé avec succès');
        await loadEvents();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Erreur lors de la suppression');
      }
    } catch (err) {
      toast.error('Erreur de connexion avec le serveur');
    }
  }
</script>

<!-- ── Modal sélection du type d'événement ───────────────────────── -->
{#if showTypeModal}
  <!-- Backdrop -->
  <div
    role="presentation"
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
    onclick={() => { if (!isCreating) showTypeModal = false; }}
  >
    <!-- Panneau (stoppe la propagation au backdrop) -->
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      class="relative bg-surface-container rounded-[2.5rem] border border-outline-variant/20 shadow-2xl w-full max-w-2xl p-10 flex flex-col gap-8"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 id="modal-title" class="text-2xl font-black text-on-surface">Choisir un type d'événement</h2>
          <p class="text-on-surface-variant/50 text-sm mt-1">Sélectionnez la nature de votre événement. Vous pourrez le configurer en détail ensuite.</p>
        </div>
        <button
          onclick={() => showTypeModal = false}
          class="w-10 h-10 rounded-2xl bg-on-surface/5 hover:bg-on-surface/10 flex items-center justify-center text-on-surface-variant/60 hover:text-on-surface transition-colors shrink-0"
          aria-label="Fermer la modale"
          disabled={isCreating}
        >
          <Papicon icon="X" size={18} />
        </button>
      </div>

      <!-- Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {#each EVENT_TYPES as et}
          <button
            onclick={() => createEventWithType(et.type)}
            disabled={isCreating}
            class="group relative flex flex-col gap-5 p-7 rounded-[2rem] border bg-gradient-to-br text-left
                   transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed
                   {et.color} {et.border}"
          >
            <!-- Icon -->
            <div class="w-14 h-14 rounded-[1.2rem] {et.iconBg} flex items-center justify-center transition-transform group-hover:scale-110">
              <Papicon icon={et.icon} size={26} />
            </div>

            <!-- Text -->
            <div class="flex flex-col gap-2">
              <div class="flex items-center gap-3">
                <span class="text-lg font-black text-on-surface">{et.label}</span>
                <span class="px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest {et.tagColor}">
                  {et.tag}
                </span>
              </div>
              <p class="text-on-surface-variant/60 text-sm leading-relaxed">{et.description}</p>
            </div>

            <!-- Arrow indicator -->
            <div class="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity text-on-surface-variant/40">
              <Papicon icon="ArrowRight" size={18} />
            </div>
          </button>
        {/each}
      </div>

      {#if isCreating}
        <p class="text-center text-on-surface-variant/50 text-sm animate-pulse">Création en cours…</p>
      {/if}
    </div>
  </div>
{/if}

<!-- ── Page principale ─────────────────────────────────────────────── -->
<ModulePage 
  title="Événements" 
  description="Créez et gérez des événements interactifs sur votre serveur Discord (Quiz, CTF…)." 
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
          onclick={() => showTypeModal = true}
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
              <div class="w-16 h-16 rounded-[1.5rem] flex items-center justify-center group-hover:scale-110 transition-transform
                {event.type === 'CTF' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'}">
                <Papicon icon={event.type === 'CTF' ? 'Flag' : 'HelpCircle'} size={24} />
              </div>
              <div>
                <div class="flex items-center gap-3">
                  <h4 class="text-xl font-black text-on-surface">{event.title}</h4>
                  <span class="px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest {getStatusColor(event.status)} border border-current/10">
                    {getStatusLabel(event.status)}
                  </span>
                  <span class="px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest
                    {event.type === 'CTF' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-blue-500/15 text-blue-400'}">
                    {event.type === 'CTF' ? 'CTF' : 'Quiz'}
                  </span>
                </div>
                <p class="text-on-surface-variant/60 mt-1 line-clamp-1">{event.description || 'Aucune description.'}</p>
                <div class="flex items-center gap-4 mt-3">
                  <span class="text-[10px] font-bold text-on-surface-variant/40 flex items-center gap-1.5">
                    {#if event.type === 'CTF'}
                      <Papicon icon="Flag" size={12} /> {event._count?.ctfChallenges || 0} défis
                    {:else}
                      <Papicon icon="HelpCircle" size={12} /> {event._count?.questions || 0} questions
                    {/if}
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
              {#if event.status === 'COMPLETED'}
                <button 
                  onclick={() => router.goto(`/events/control/${event.id}`)}
                  class="px-6 py-3 bg-primary/10 text-primary rounded-2xl text-[10px] font-black uppercase tracking-widest border border-primary/20 hover:bg-primary/20 transition-colors flex items-center gap-2"
                >
                  <Papicon icon="BarChart2" size={12} /> Stats
                </button>
              {/if}
              <button 
                onclick={() => router.goto(`/events/edit/${event.id}`)}
                class="px-6 py-3 bg-surface-container-high rounded-2xl text-[10px] font-black uppercase tracking-widest border border-outline-variant/10 hover:bg-surface-container-highest transition-colors flex items-center gap-2"
              >
                <Papicon icon="Edit3" size={12} /> Éditer
              </button>
              {#if canManageEvents}
                <button 
                  onclick={() => deleteEvent(event.id, event.title)}
                  class="px-6 py-3 bg-red-500/10 text-red-500 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-red-500/20 hover:bg-red-500/20 transition-colors flex items-center gap-2"
                >
                  <Papicon icon="Trash" size={12} /> Supprimer
                </button>
              {/if}
            </div>
          </div>
        {:else}
          <div class="py-20 text-center bg-surface-container-low/20 rounded-[3rem] border border-dashed border-outline-variant/20">
            <div class="w-20 h-20 bg-on-surface/5 rounded-full flex items-center justify-center mx-auto mb-6 text-on-surface-variant/20">
              <Papicon icon="Zap" size={40} />
            </div>
            <p class="text-on-surface-variant/60 font-black text-xl">Aucun événement pour le moment.</p>
            {#if canManageEvents}
              <button onclick={() => showTypeModal = true} class="mt-6 text-primary font-black uppercase text-[10px] tracking-widest hover:underline">
                Créer votre premier événement
              </button>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  </div>
</ModulePage>
