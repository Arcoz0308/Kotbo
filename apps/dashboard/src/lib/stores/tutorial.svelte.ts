export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  target?: string; // CSS selector or route path
  action?: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  image?: string;
  icon?: string; // Lucide icon name
}

export interface TutorialProgress {
  currentStep: number;
  completed: boolean;
  dismissed: boolean;
  startedAt?: number;
  completedAt?: number;
}

export const tutorialSteps: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Bienvenue sur Kotbo Dashboard !',
    description: 'Ce tutoriel va vous guider à travers les fonctionnalités essentielles du dashboard. Vous apprendrez à configurer votre serveur, gérer les membres, et utiliser tous les outils disponibles.',
    position: 'center',
    icon: 'sparkles',
  },
  {
    id: 'navigation',
    title: 'Navigation',
    description: 'La sidebar à gauche est organisée en catégories : Général, Modération, Communauté, Staff, et Configuration. Utilisez-la pour naviguer rapidement.',
    target: '.sidebar',
    position: 'right',
    icon: 'layout',
  },
  {
    id: 'overview',
    title: 'Vue d\'ensemble',
    description: 'La page d\'accueil vous donne une vue globale de votre serveur avec les statistiques principales et l\'activité récente.',
    target: '/',
    action: 'Cliquez sur "Vue d\'ensemble" dans la sidebar',
    icon: 'layout-grid',
  },
  {
    id: 'modules',
    title: 'Modules',
    description: 'Kotbo est modulaire. Activez uniquement les fonctionnalités dont vous avez besoin : Leveling, Économie, Tickets, Daily Algo, etc.',
    target: '/modules',
    action: 'Allez dans Configuration > Modules',
    icon: 'package',
  },
  {
    id: 'members',
    title: 'Membres',
    description: 'Gérez votre communauté : consultez les profils, les statistiques, et les informations détaillées de chaque membre.',
    target: '/members',
    action: 'Allez dans Modération > Membres',
    icon: 'users',
  },
  {
    id: 'staff',
    title: 'Staff Management',
    description: 'Organisez votre équipe avec l\'annuaire, les hiérarchies, le recrutement, les tickets, et le tutorat.',
    target: '/staff-management?tab=members',
    action: 'Allez dans Staff > Annuaire',
    icon: 'shield',
  },
  {
    id: 'sanctions',
    title: 'Sanctions',
    description: 'Outils de modération complets : avertissements, bannissements, kicks, et historique des sanctions.',
    target: '/sanctions',
    action: 'Allez dans Modération > Sanctions',
    icon: 'gavel',
  },
  {
    id: 'leveling',
    title: 'Leveling & XP',
    description: 'Système de niveaux et d\'XP avec récompenses, classements, et configuration des rôles de niveaux.',
    target: '/leveling',
    action: 'Allez dans Communauté > Leveling & XP',
    icon: 'trophy',
  },
  {
    id: 'economy',
    title: 'Économie & RPG',
    description: 'Système économique complet avec boutique, mini-jeux, et profils RPG pour vos membres.',
    target: '/economy',
    action: 'Allez dans Communauté > Économie & RPG',
    icon: 'coins',
  },
  {
    id: 'settings',
    title: 'Paramètres',
    description: 'Configurez les salons, les commandes, et les paramètres globaux de votre serveur.',
    target: '/settings',
    action: 'Allez dans Configuration > Paramètres',
    icon: 'settings',
  },
  {
    id: 'shortcuts',
    title: 'Raccourcis clavier',
    description: 'Gagnez du temps avec les raccourcis : Ctrl+G pour changer de serveur, et CTRL+K pour utiliser la recherche rapide.',
    position: 'center',
    icon: 'keyboard',
  },
  {
    id: 'complete',
    title: 'Tutoriel terminé !',
    description: 'Vous avez terminé le tutoriel de base. Explorez toutes les fonctionnalités du dashboard et n\'hésitez pas à consulter l\'aide.',
    position: 'center',
    icon: 'check-circle',
  },
];

const LEGACY_STORAGE_KEY = 'tutorial-progress';
const DEFAULT_PROGRESS: TutorialProgress = {
  currentStep: 0,
  completed: false,
  dismissed: false,
};

const getStorageKey = (guildId: string) => `tutorial-${guildId}`;

const normalizeProgress = (value: Partial<TutorialProgress> | null | undefined): TutorialProgress => ({
  currentStep: Math.max(0, Math.min(value?.currentStep ?? 0, tutorialSteps.length - 1)),
  completed: value?.completed === true,
  dismissed: value?.dismissed === true || (value as any)?.seen === true,
  startedAt: value?.startedAt,
  completedAt: value?.completedAt,
});

const readStoredProgress = (key: string): TutorialProgress | null => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? normalizeProgress(JSON.parse(stored)) : null;
  } catch (e) {
    console.error('Failed to load tutorial progress:', e);
    return null;
  }
};

const loadProgress = (guildId: string): TutorialProgress => {
  const guildProgress = readStoredProgress(getStorageKey(guildId));
  if (guildProgress) return guildProgress;

  const legacyProgress = readStoredProgress(LEGACY_STORAGE_KEY);
  if (legacyProgress?.completed || legacyProgress?.dismissed) {
    saveProgress(guildId, legacyProgress);
    return legacyProgress;
  }

  return { ...DEFAULT_PROGRESS };
};

const saveProgress = (guildId: string | null, progress: TutorialProgress) => {
  if (!guildId) return;
  try {
    localStorage.setItem(getStorageKey(guildId), JSON.stringify(progress));
  } catch (e) {
    console.error('Failed to save tutorial progress:', e);
  }
};

let activeGuildId = $state<string | null>(null);
let progress = $state<TutorialProgress>({ ...DEFAULT_PROGRESS });

export const tutorialStore = {
  get initialized() { return activeGuildId !== null; },
  get currentStep() { return progress.currentStep; },
  get completed() { return progress.completed; },
  get dismissed() { return progress.dismissed; },

  initialize: (guildId: string) => {
    if (activeGuildId === guildId) return;
    activeGuildId = guildId;
    progress = loadProgress(guildId);
  },

  nextStep: () => {
    if (progress.currentStep === tutorialSteps.length - 1) {
      progress = {
        ...progress,
        completed: true,
        completedAt: Date.now(),
      };
      saveProgress(activeGuildId, progress);
      return;
    }

    const nextStep = Math.min(progress.currentStep + 1, tutorialSteps.length - 1);
    progress = {
      ...progress,
      currentStep: nextStep,
    };
    saveProgress(activeGuildId, progress);
  },

  prevStep: () => {
    progress = {
      ...progress,
      currentStep: Math.max(progress.currentStep - 1, 0),
    };
    saveProgress(activeGuildId, progress);
  },

  goToStep: (step: number) => {
    progress = {
      ...progress,
      currentStep: Math.max(0, Math.min(step, tutorialSteps.length - 1)),
    };
    saveProgress(activeGuildId, progress);
  },

  dismiss: () => {
    progress = {
      ...progress,
      dismissed: true,
    };
    saveProgress(activeGuildId, progress);
  },

  reset: () => {
    progress = {
      currentStep: 0,
      completed: false,
      dismissed: false,
      startedAt: Date.now(),
    };
    saveProgress(activeGuildId, progress);
  },

  start: () => {
    progress = {
      currentStep: 0,
      completed: false,
      dismissed: false,
      startedAt: Date.now(),
    };
    saveProgress(activeGuildId, progress);
  },
};

// Fonction pour vérifier si l'utilisateur est nouveau et devrait voir le tutoriel
export function shouldShowTutorialForNewUser(guildId: string): boolean {
  const data = loadProgress(guildId);
  return !data.completed && !data.dismissed && !data.startedAt;
}
