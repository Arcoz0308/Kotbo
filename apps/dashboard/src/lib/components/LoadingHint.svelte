<script lang="ts">
  type HintSet = { delay: number; messages: string[] };

  let {
    context = 'default',
    class: className = '',
  }: {
    context?: 'data' | 'analytics' | 'network' | 'config' | 'members' | 'default';
    class?: string;
  } = $props();

  const hintSets: Record<string, HintSet[]> = {
    data: [
      { delay: 3000, messages: [
        'Récupération des données en cours...',
        'Synchronisation avec le serveur...',
        'Préparation des informations...',
      ]},
      { delay: 8000, messages: [
        'Beaucoup de données à traiter, merci de patienter',
        'Le volume de données est important, on y est presque',
        'Traitement d\'un grand nombre d\'entrées...',
      ]},
      { delay: 15000, messages: [
        'La connexion semble un peu lente aujourd\'hui',
        'Le serveur met plus de temps que d\'habitude à répondre',
        'Patience, le réseau est un peu chargé',
      ]},
      { delay: 25000, messages: [
        'Toujours en cours... vérifiez votre connexion si ça persiste',
        'Le chargement est anormalement long, tentez de rafraîchir si besoin',
      ]},
    ],
    analytics: [
      { delay: 3000, messages: [
        'Calcul des statistiques en cours...',
        'Analyse des métriques du serveur...',
        'Agrégation des données analytiques...',
      ]},
      { delay: 8000, messages: [
        'Les calculs prennent un moment, le serveur a beaucoup à analyser',
        'Analyse d\'un gros volume de données, merci de patienter',
        'Première analyse ? La mise en cache accélèrera les prochains chargements',
      ]},
      { delay: 15000, messages: [
        'Les analytics demandent plus de ressources que d\'habitude',
        'Le serveur traite beaucoup de métriques, ça arrive bientôt',
      ]},
      { delay: 25000, messages: [
        'Chargement inhabituellement long... le serveur est peut-être surchargé',
      ]},
    ],
    network: [
      { delay: 3000, messages: [
        'Cartographie des interactions en cours...',
        'Construction du réseau de communication...',
      ]},
      { delay: 8000, messages: [
        'Le réseau est dense, l\'analyse prend un peu plus de temps',
        'Beaucoup de connexions à tracer, merci de patienter',
      ]},
      { delay: 15000, messages: [
        'Le graphe est particulièrement complexe, on y arrive',
        'Connexion lente ? Le réseau nécessite beaucoup de données',
      ]},
    ],
    config: [
      { delay: 3000, messages: [
        'Chargement de la configuration...',
        'Récupération des paramètres...',
      ]},
      { delay: 8000, messages: [
        'La configuration met plus de temps que prévu',
        'Synchronisation avec le bot en cours...',
      ]},
      { delay: 15000, messages: [
        'Le bot met du temps à répondre, vérifiez qu\'il est bien en ligne',
      ]},
    ],
    members: [
      { delay: 3000, messages: [
        'Chargement de la liste des membres...',
        'Récupération des profils...',
      ]},
      { delay: 8000, messages: [
        'Votre serveur a beaucoup de membres, ça prend un moment',
        'Chargement d\'un grand nombre de profils...',
      ]},
      { delay: 15000, messages: [
        'La synchronisation des membres est plus lente que d\'habitude',
        'Le cache est en cours de construction, les prochains chargements seront plus rapides',
      ]},
    ],
    default: [
      { delay: 3000, messages: [
        'Chargement en cours...',
        'Récupération des données...',
        'Un instant...',
      ]},
      { delay: 8000, messages: [
        'C\'est un peu plus long que d\'habitude, merci de patienter',
        'Premier chargement ? Les suivants seront plus rapides',
        'Le serveur traite votre demande...',
      ]},
      { delay: 15000, messages: [
        'La connexion semble lente, on y est presque',
        'Le serveur met du temps à répondre...',
      ]},
      { delay: 25000, messages: [
        'Toujours en attente... vérifiez votre connexion',
      ]},
    ],
  };

  let elapsed = $state(0);
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let pickedIndex = $state(0);

  $effect(() => {
    elapsed = 0;
    pickedIndex = Math.floor(Math.random() * 100);
    intervalId = setInterval(() => { elapsed += 1000; }, 1000);
    return () => { if (intervalId) clearInterval(intervalId); };
  });

  const currentHint = $derived.by(() => {
    const sets = hintSets[context] ?? hintSets.default;
    let matched: HintSet | null = null;
    for (const set of sets) {
      if (elapsed >= set.delay) matched = set;
    }
    if (!matched) return '';
    return matched.messages[pickedIndex % matched.messages.length];
  });
</script>

{#if currentHint}
  <p class="text-xs text-on-surface-variant/50 mt-2 animate-fade-hint {className}" role="status">
    {currentHint}
  </p>
{/if}

<style>
  .animate-fade-hint {
    animation: fadeHint 0.5s ease-in-out;
  }
  @keyframes fadeHint {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
