// ─── Onboarding System (Notion-style) ───────────────────────────────────────
// Three layers:
//   1. Welcome modal   — shown once on first guild visit
//   2. Checklist        — floating panel tracking onboarding tasks
//   3. Page tips        — contextual cards on first page visit

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ChecklistTask {
  id: string;
  title: string;
  description: string;
  icon: string;
  /** Route to navigate when clicking the task */
  route?: string;
  /** Auto-complete when user visits this route */
  autoCompleteRoute?: string;
}

export interface PageTip {
  pageId: string;
  /** Route pattern (exact or startsWith) */
  routes: string[];
  title: string;
  description: string;
  highlights: string[];
  icon: string;
}

export interface OnboardingState {
  welcomeSeen: boolean;
  checklistDismissed: boolean;
  checklistMinimized: boolean;
  completedTasks: string[];
  visitedPages: string[];
  startedAt: number;
  completedAt?: number;
}

// ─── Checklist Tasks ────────────────────────────────────────────────────────

export const checklistTasks: ChecklistTask[] = [
  {
    id: 'visit-overview',
    title: 'Découvrir le dashboard',
    description: 'Consultez la vue d\'ensemble de votre serveur.',
    icon: 'layout-grid',
    route: '/',
    autoCompleteRoute: '/',
  },
  {
    id: 'explore-modules',
    title: 'Configurer les modules',
    description: 'Activez les fonctionnalités dont vous avez besoin.',
    icon: 'package',
    route: '/modules',
    autoCompleteRoute: '/modules',
  },
  {
    id: 'check-members',
    title: 'Consulter les membres',
    description: 'Explorez la liste et les profils de vos membres.',
    icon: 'users',
    route: '/members',
    autoCompleteRoute: '/members',
  },
  {
    id: 'review-moderation',
    title: 'Découvrir la modération',
    description: 'Configurez les outils de sanctions et d\'AutoMod.',
    icon: 'shield',
    route: '/sanctions',
    autoCompleteRoute: '/sanctions',
  },
  {
    id: 'setup-community',
    title: 'Explorer la communauté',
    description: 'Leveling, économie, giveaways et plus encore.',
    icon: 'trophy',
    route: '/leveling',
    autoCompleteRoute: '/leveling',
  },
  {
    id: 'manage-staff',
    title: 'Organiser le staff',
    description: 'Annuaire, hiérarchie, recrutement et tickets.',
    icon: 'user-check',
    route: '/staff-management?tab=members',
    autoCompleteRoute: '/staff-management',
  },
  {
    id: 'configure-settings',
    title: 'Ajuster les paramètres',
    description: 'Personnalisez les réglages de votre serveur.',
    icon: 'settings',
    route: '/settings',
    autoCompleteRoute: '/settings',
  },
  {
    id: 'try-shortcuts',
    title: 'Essayer les raccourcis',
    description: 'Ctrl+K pour la recherche, Ctrl+G pour changer de serveur.',
    icon: 'keyboard',
  },
];

// ─── Page Tips ──────────────────────────────────────────────────────────────

export const pageTips: PageTip[] = [
  {
    pageId: 'overview',
    routes: ['/'],
    title: 'Vue d\'ensemble',
    description: 'Votre tableau de bord principal. Retrouvez ici les statistiques clés, l\'activité récente et un aperçu rapide de votre communauté.',
    highlights: [
      'Statistiques en temps réel de votre serveur',
      'Activité récente des membres et du staff',
      'Accès rapide aux sections importantes',
    ],
    icon: 'layout-grid',
  },
  {
    pageId: 'inbox',
    routes: ['/inbox'],
    title: 'Boîte de réception',
    description: 'Centralisez toutes vos notifications et messages importants en un seul endroit.',
    highlights: [
      'Notifications du bot et du serveur',
      'Alertes de modération importantes',
      'Messages système et mises à jour',
    ],
    icon: 'inbox',
  },
  {
    pageId: 'analytics',
    routes: ['/analytics'],
    title: 'Analytics',
    description: 'Analysez l\'activité de votre serveur avec des graphiques détaillés et des métriques avancées.',
    highlights: [
      'Graphiques d\'activité par période',
      'Statistiques de croissance des membres',
      'Métriques d\'engagement de la communauté',
    ],
    icon: 'pie-chart',
  },
  {
    pageId: 'members',
    routes: ['/members'],
    title: 'Gestion des membres',
    description: 'Consultez les profils détaillés de chaque membre, leur activité et leurs statistiques sur le serveur.',
    highlights: [
      'Recherche et filtrage avancés',
      'Profils détaillés avec historique',
      'Statistiques d\'activité individuelles',
    ],
    icon: 'users',
  },
  {
    pageId: 'sanctions',
    routes: ['/sanctions'],
    title: 'Sanctions',
    description: 'Gérez la modération de votre serveur. Consultez, créez et suivez les sanctions appliquées à vos membres.',
    highlights: [
      'Historique complet des sanctions',
      'Avertissements, bans, kicks et mutes',
      'Filtrage par type et par membre',
    ],
    icon: 'alert-triangle',
  },
  {
    pageId: 'automod',
    routes: ['/automod'],
    title: 'Modération automatique',
    description: 'Configurez des règles automatiques pour protéger votre serveur contre le spam, les liens malveillants et les comportements indésirables.',
    highlights: [
      'Filtres anti-spam et anti-flood',
      'Détection automatique de liens dangereux',
      'Règles personnalisables par salon',
    ],
    icon: 'shield-alert',
  },
  {
    pageId: 'logs',
    routes: ['/logs'],
    title: 'Logs Discord',
    description: 'Suivez tous les événements de votre serveur Discord : messages supprimés, modifications de rôles, entrées/sorties et plus.',
    highlights: [
      'Messages supprimés et modifiés',
      'Changements de rôles et permissions',
      'Historique des entrées et sorties',
    ],
    icon: 'file-text',
  },
  {
    pageId: 'activity',
    routes: ['/activity'],
    title: 'Journal d\'activité',
    description: 'Suivez toutes les actions effectuées sur le dashboard par les membres de votre équipe.',
    highlights: [
      'Actions du staff sur le dashboard',
      'Modifications de configuration',
      'Traçabilité complète des changements',
    ],
    icon: 'history',
  },
  {
    pageId: 'invitations',
    routes: ['/invitations'],
    title: 'Invitations',
    description: 'Analysez les liens d\'invitation de votre serveur. Identifiez qui recrute le plus et suivez la provenance de vos membres.',
    highlights: [
      'Statistiques d\'utilisation par lien',
      'Top inviteurs du serveur',
      'Suivi des invitations frauduleuses',
    ],
    icon: 'link',
  },
  {
    pageId: 'events',
    routes: ['/events'],
    title: 'Événements',
    description: 'Créez et gérez des événements pour votre communauté avec inscriptions et rappels automatiques.',
    highlights: [
      'Planification d\'événements',
      'Gestion des inscriptions',
      'Rappels automatiques',
    ],
    icon: 'zap',
  },
  {
    pageId: 'leveling',
    routes: ['/leveling'],
    title: 'Leveling & XP',
    description: 'Système de progression par l\'expérience. Les membres gagnent de l\'XP en participant et débloquent des rôles de niveaux.',
    highlights: [
      'Configuration des gains d\'XP',
      'Récompenses et rôles par niveau',
      'Classement et leaderboard',
    ],
    icon: 'trophy',
  },
  {
    pageId: 'economy',
    routes: ['/economy'],
    title: 'Économie & RPG',
    description: 'Système économique complet avec monnaie virtuelle, boutique, mini-jeux et profils RPG personnalisés.',
    highlights: [
      'Gestion de la monnaie et boutique',
      'Mini-jeux et récompenses quotidiennes',
      'Profils RPG personnalisables',
    ],
    icon: 'coins',
  },
  {
    pageId: 'giveaways',
    routes: ['/giveaways'],
    title: 'Giveaways',
    description: 'Organisez des tirages au sort pour votre communauté avec des conditions de participation personnalisables.',
    highlights: [
      'Création de giveaways rapide',
      'Conditions de participation flexibles',
      'Tirage automatique et historique',
    ],
    icon: 'sparkles',
  },
  {
    pageId: 'announcement',
    routes: ['/announcement'],
    title: 'Annonces & Auto-Rôle',
    description: 'Configurez les messages de bienvenue, d\'au revoir et les rôles automatiques pour les nouveaux arrivants.',
    highlights: [
      'Messages de bienvenue personnalisés',
      'Attribution automatique de rôles',
      'Messages d\'au revoir configurables',
    ],
    icon: 'megaphone',
  },
  {
    pageId: 'reaction-roles',
    routes: ['/reaction-roles'],
    title: 'Reaction Roles',
    description: 'Créez des menus de rôles interactifs où les membres peuvent s\'attribuer des rôles en cliquant sur des réactions ou boutons.',
    highlights: [
      'Menus de rôles par réaction',
      'Boutons et sélecteurs personnalisés',
      'Rôles exclusifs ou cumulables',
    ],
    icon: 'mouse-pointer',
  },
  {
    pageId: 'triggers',
    routes: ['/triggers'],
    title: 'Déclencheurs',
    description: 'Créez des réponses automatiques et des commandes personnalisées déclenchées par des mots-clés ou des patterns.',
    highlights: [
      'Réponses automatiques sur mots-clés',
      'Commandes personnalisées',
      'Support des embeds et variables',
    ],
    icon: 'message-square',
  },
  {
    pageId: 'suggestions',
    routes: ['/suggestions'],
    title: 'Suggestions',
    description: 'Permettez à votre communauté de soumettre des idées et votez pour les meilleures suggestions.',
    highlights: [
      'Système de vote par réactions',
      'Modération des suggestions',
      'Suivi du statut (accepté, refusé, en cours)',
    ],
    icon: 'thumbs-up',
  },
  {
    pageId: 'embed-builder',
    routes: ['/embed-builder'],
    title: 'Éditeur d\'Embeds',
    description: 'Créez de magnifiques messages embed Discord avec un éditeur visuel intuitif, sans aucun code.',
    highlights: [
      'Éditeur visuel drag & drop',
      'Prévisualisation en temps réel',
      'Modèles prédéfinis et sauvegarde',
    ],
    icon: 'file-plus',
  },
  {
    pageId: 'regulation',
    routes: ['/regulation'],
    title: 'Règlement',
    description: 'Configurez et publiez le règlement de votre serveur. Les membres doivent l\'accepter pour accéder au serveur.',
    highlights: [
      'Éditeur de règlement intégré',
      'Système d\'acceptation obligatoire',
      'Versioning et historique',
    ],
    icon: 'book',
  },
  {
    pageId: 'news',
    routes: ['/news'],
    title: 'Actualités & RSS',
    description: 'Publiez automatiquement des flux RSS et des actualités dans les salons de votre choix.',
    highlights: [
      'Suivi de flux RSS automatique',
      'Publication dans les salons Discord',
      'Filtrage et personnalisation',
    ],
    icon: 'rss',
  },
  {
    pageId: 'staff-management',
    routes: ['/staff-management'],
    title: 'Gestion du Staff',
    description: 'Organisez votre équipe avec l\'annuaire, la hiérarchie, les sondages internes et le suivi disciplinaire.',
    highlights: [
      'Annuaire et fiches des membres du staff',
      'Hiérarchie et rôles organisationnels',
      'Sondages internes et votes',
    ],
    icon: 'user-check',
  },
  {
    pageId: 'recruitment',
    routes: ['/recruitment'],
    title: 'Recrutement',
    description: 'Gérez les candidatures et le processus de recrutement de votre équipe de modération.',
    highlights: [
      'Formulaires de candidature personnalisés',
      'Suivi des candidatures en cours',
      'Workflow de validation multi-étapes',
    ],
    icon: 'user-plus',
  },
  {
    pageId: 'tickets',
    routes: ['/tickets'],
    title: 'Tickets',
    description: 'Système de support par tickets pour gérer les demandes de vos membres de façon organisée.',
    highlights: [
      'Création et gestion de tickets',
      'Catégories et priorités',
      'Transcripts et archivage automatique',
    ],
    icon: 'message-square',
  },
  {
    pageId: 'tutoring',
    routes: ['/tutoring'],
    title: 'Tutorat',
    description: 'Programme de mentorat pour former les nouveaux membres du staff avec suivi de progression.',
    highlights: [
      'Assignation tuteur/apprenti',
      'Objectifs et étapes de formation',
      'Suivi de la progression',
    ],
    icon: 'book-open',
  },
  {
    pageId: 'planning',
    routes: ['/planning'],
    title: 'Planning',
    description: 'Organisez les plannings de présence et les absences de votre équipe.',
    highlights: [
      'Calendrier des disponibilités',
      'Gestion des absences',
      'Vue d\'ensemble de l\'équipe',
    ],
    icon: 'calendar',
  },
  {
    pageId: 'modules',
    routes: ['/modules'],
    title: 'Modules',
    description: 'Kotbo est modulaire. Activez uniquement les fonctionnalités dont vous avez besoin pour garder le dashboard épuré.',
    highlights: [
      'Activation/désactivation en un clic',
      'Description détaillée de chaque module',
      'Aucun impact sur les données existantes',
    ],
    icon: 'package',
  },
  {
    pageId: 'settings',
    routes: ['/settings'],
    title: 'Paramètres',
    description: 'Configurez les paramètres globaux de votre serveur : langue, préfixe, timezone et préférences générales.',
    highlights: [
      'Paramètres globaux du bot',
      'Configuration des salons système',
      'Préférences de notifications',
    ],
    icon: 'settings',
  },
  {
    pageId: 'channels-management',
    routes: ['/channels-management'],
    title: 'Gestion des salons',
    description: 'Configurez les threads automatiques et les paramètres spécifiques par salon.',
    highlights: [
      'Threads automatiques par salon',
      'Configuration par salon',
      'Règles de publication',
    ],
    icon: 'hash',
  },
  {
    pageId: 'command-access',
    routes: ['/command-access'],
    title: 'Accès aux commandes',
    description: 'Contrôlez finement quels rôles et membres peuvent utiliser chaque commande du bot.',
    highlights: [
      'Permissions par commande',
      'Restrictions par rôle et salon',
      'Override de permissions Discord',
    ],
    icon: 'terminal',
  },
  {
    pageId: 'dailyalgo',
    routes: ['/dailyalgo'],
    title: 'Daily Algo',
    description: 'Défi algorithmique quotidien pour votre communauté. Un problème par jour avec classement et récompenses.',
    highlights: [
      'Problèmes algorithmiques quotidiens',
      'Classement et points',
      'Niveaux de difficulté variés',
    ],
    icon: 'code',
  },
  {
    pageId: 'nickname-moderation',
    routes: ['/nickname-moderation'],
    title: 'Modération des pseudos',
    description: 'Filtrez et modérez automatiquement les pseudonymes inappropriés sur votre serveur.',
    highlights: [
      'Filtres automatiques de pseudos',
      'Liste noire de mots et patterns',
      'Actions automatiques configurables',
    ],
    icon: 'filter',
  },
  {
    pageId: 'double-accounts',
    routes: ['/double-accounts'],
    title: 'Sécurité & Doubles Comptes',
    description: 'Détectez les doubles comptes et renforcez la sécurité de votre serveur contre les raids.',
    highlights: [
      'Détection de doubles comptes',
      'Analyse de sécurité des membres',
      'Protection anti-raid',
    ],
    icon: 'shield',
  },
  {
    pageId: 'forms',
    routes: ['/forms'],
    title: 'Formulaires',
    description: 'Créez des formulaires personnalisés pour collecter des informations auprès de vos membres.',
    highlights: [
      'Éditeur de formulaires visuel',
      'Types de champs variés',
      'Réponses centralisées',
    ],
    icon: 'clipboard',
  },
  {
    pageId: 'fun',
    routes: ['/fun'],
    title: 'Salons Fun',
    description: 'Configurez des salons ludiques avec des interactions automatiques pour dynamiser votre communauté.',
    highlights: [
      'Salons interactifs automatisés',
      'Mini-jeux et compteurs',
      'Interactions communautaires',
    ],
    icon: 'smile',
  },
  {
    pageId: 'social-networks',
    routes: ['/social-networks'],
    title: 'Réseaux sociaux',
    description: 'Connectez vos réseaux sociaux pour publier automatiquement les mises à jour dans vos salons Discord.',
    highlights: [
      'Intégration multi-plateformes',
      'Publication automatique',
      'Personnalisation des embeds',
    ],
    icon: 'share-2',
  },
  {
    pageId: 'backups',
    routes: ['/backups'],
    title: 'Sauvegardes',
    description: 'Créez et restaurez des sauvegardes de la configuration de votre serveur.',
    highlights: [
      'Sauvegardes automatiques et manuelles',
      'Restauration sélective',
      'Historique des sauvegardes',
    ],
    icon: 'archive',
  },
  {
    pageId: 'schedules',
    routes: ['/schedules'],
    title: 'Planifications',
    description: 'Programmez des actions automatiques récurrentes : messages, rappels, et tâches planifiées.',
    highlights: [
      'Messages programmés récurrents',
      'Actions automatiques par cron',
      'Gestion centralisée des planifications',
    ],
    icon: 'calendar',
  },
];

// ─── Defaults & Storage ─────────────────────────────────────────────────────

const DEFAULT_STATE: OnboardingState = {
  welcomeSeen: false,
  checklistDismissed: false,
  checklistMinimized: true,
  completedTasks: [],
  visitedPages: [],
  startedAt: 0,
};

const STORAGE_PREFIX = 'onboarding-';
const LEGACY_KEY = 'tutorial-progress';

const getStorageKey = (guildId: string) => `${STORAGE_PREFIX}${guildId}`;

function readState(guildId: string): OnboardingState {
  try {
    const raw = localStorage.getItem(getStorageKey(guildId));
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_STATE, ...parsed };
    }

    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (parsed?.completed || parsed?.dismissed || parsed?.seen) {
        return {
          ...DEFAULT_STATE,
          welcomeSeen: true,
          checklistDismissed: true,
          completedTasks: checklistTasks.map(t => t.id),
          visitedPages: pageTips.map(p => p.pageId),
          startedAt: parsed.startedAt ?? Date.now(),
          completedAt: parsed.completedAt ?? Date.now(),
        };
      }
    }

    const legacyGuild = localStorage.getItem(`tutorial-${guildId}`);
    if (legacyGuild) {
      const parsed = JSON.parse(legacyGuild);
      if (parsed?.completed || parsed?.dismissed || parsed?.seen) {
        return {
          ...DEFAULT_STATE,
          welcomeSeen: true,
          checklistDismissed: true,
          completedTasks: checklistTasks.map(t => t.id),
          visitedPages: pageTips.map(p => p.pageId),
          startedAt: parsed.startedAt ?? Date.now(),
          completedAt: parsed.completedAt ?? Date.now(),
        };
      }
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_STATE };
}

function writeState(guildId: string | null, state: OnboardingState) {
  if (!guildId) return;
  try {
    localStorage.setItem(getStorageKey(guildId), JSON.stringify(state));
  } catch {
    // ignore
  }
}

// ─── Reactive State ─────────────────────────────────────────────────────────

let guildId = $state<string | null>(null);
let state = $state<OnboardingState>({ ...DEFAULT_STATE });

// Welcome modal visibility
let showWelcome = $state(false);

// Active page tip
let activePageTip = $state<PageTip | null>(null);
let pageTipDismissed = $state(false);

// ─── Store ──────────────────────────────────────────────────────────────────

export const onboardingStore = {
  // ── Getters ──
  get initialized() { return guildId !== null; },
  get welcomeSeen() { return state.welcomeSeen; },
  get showWelcome() { return showWelcome; },
  get checklistDismissed() { return state.checklistDismissed; },
  get checklistMinimized() { return state.checklistMinimized; },
  get completedTasks() { return state.completedTasks; },
  get visitedPages() { return state.visitedPages; },
  get activePageTip() { return activePageTip; },
  get pageTipDismissed() { return pageTipDismissed; },

  get completedCount() {
    return state.completedTasks.length;
  },

  get totalTasks() {
    return checklistTasks.length;
  },

  get progress() {
    return checklistTasks.length === 0 ? 100 : Math.round((state.completedTasks.length / checklistTasks.length) * 100);
  },

  get allCompleted() {
    return state.completedTasks.length >= checklistTasks.length;
  },

  isTaskCompleted(taskId: string): boolean {
    return state.completedTasks.includes(taskId);
  },

  isPageVisited(pageId: string): boolean {
    return state.visitedPages.includes(pageId);
  },

  // ── Actions ──

  initialize(newGuildId: string) {
    if (guildId === newGuildId) return;
    guildId = newGuildId;
    state = readState(newGuildId);

    if (!state.welcomeSeen && !state.startedAt) {
      showWelcome = true;
      state.startedAt = Date.now();
      writeState(guildId, state);
    }
  },

  // Welcome
  dismissWelcome() {
    showWelcome = false;
    state.welcomeSeen = true;
    state.checklistMinimized = false;
    writeState(guildId, state);
  },

  // Checklist
  toggleChecklist() {
    state.checklistMinimized = !state.checklistMinimized;
    writeState(guildId, state);
  },

  expandChecklist() {
    state.checklistMinimized = false;
    writeState(guildId, state);
  },

  minimizeChecklist() {
    state.checklistMinimized = true;
    writeState(guildId, state);
  },

  dismissChecklist() {
    state.checklistDismissed = true;
    writeState(guildId, state);
  },

  completeTask(taskId: string) {
    if (state.completedTasks.includes(taskId)) return;
    state.completedTasks = [...state.completedTasks, taskId];

    if (state.completedTasks.length >= checklistTasks.length) {
      state.completedAt = Date.now();
    }

    writeState(guildId, state);
  },

  // Page tips
  onPageVisit(path: string, queryString: string = '') {
    const fullUrl = path + (queryString ? `?${queryString}` : '');

    // Auto-complete checklist tasks
    for (const task of checklistTasks) {
      if (!task.autoCompleteRoute) continue;
      if (path === task.autoCompleteRoute || path.startsWith(task.autoCompleteRoute + '/')) {
        this.completeTask(task.id);
      }
    }

    // Find matching page tip
    const tip = pageTips.find(p =>
      p.routes.some(r => {
        if (r === '/') return path === '/';
        return path === r || path.startsWith(r + '/') || fullUrl.includes(r);
      })
    );

    if (tip && !state.visitedPages.includes(tip.pageId)) {
      activePageTip = tip;
      pageTipDismissed = false;
    } else {
      activePageTip = null;
      pageTipDismissed = false;
    }
  },

  dismissPageTip() {
    if (activePageTip) {
      state.visitedPages = [...state.visitedPages, activePageTip.pageId];
      writeState(guildId, state);
    }
    pageTipDismissed = true;
    activePageTip = null;
  },

  // Complete reset
  reset() {
    state = {
      ...DEFAULT_STATE,
      startedAt: Date.now(),
    };
    showWelcome = true;
    activePageTip = null;
    pageTipDismissed = false;
    writeState(guildId, state);
  },

  // Restart tutorial (from menu)
  restart() {
    state = {
      ...DEFAULT_STATE,
      welcomeSeen: false,
      startedAt: Date.now(),
    };
    showWelcome = true;
    activePageTip = null;
    pageTipDismissed = false;
    writeState(guildId, state);
  },

  // Mark shortcut task as done (called from keyboard handler)
  markShortcutUsed() {
    this.completeTask('try-shortcuts');
  },
};

// Legacy exports for backward compat with MainLayout/Navbar references
export const tutorialStore = onboardingStore;
export const tutorialSteps = checklistTasks;
export function shouldShowTutorialForNewUser(guildId: string): boolean {
  const s = readState(guildId);
  return !s.welcomeSeen && !s.startedAt;
}
