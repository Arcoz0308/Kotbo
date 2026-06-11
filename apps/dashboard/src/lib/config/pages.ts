export interface PageConfig {
  name: string;
  icon?: string;
  href: string;
  featureKey?: string;
  /** Affiche le badge BETA dans la sidebar et la bannière page */
  beta?: boolean;
  /** Affiche le badge WIP dans la sidebar et l’overlay page */
  wip?: boolean;
}

export function isPageBeta(page: PageConfig): boolean {
  return page.beta === true;
}

export function isPageWip(page: PageConfig): boolean {
  return page.wip === true;
}

export const generalItems: PageConfig[] = [
  { name: "Vue d'ensemble", icon: "grid",      href: "/",          featureKey: "dashboard", beta: false, wip: false },
  { name: "Inbox",          icon: "inbox",     href: "/inbox",     featureKey: "inbox", beta: false, wip: false },
  { name: "Analytics",      icon: "pie-chart", href: "/analytics", featureKey: "analytics", beta: false, wip: false },
];

export const moderationItems: PageConfig[] = [
  { name: "Membres",             icon: "users",         href: "/members",            featureKey: "members", beta: false, wip: false },
  { name: "Sanctions",           icon: "alert-triangle",href: "/sanctions",          featureKey: "sanctions", beta: false, wip: false },
  { name: "Modération auto",     icon: "shield-alert",  href: "/automod",            featureKey: "automod", beta: true, wip: false },
  { name: "Pseudos",             icon: "filter",        href: "/nickname-moderation",featureKey: "nickname_moderation", beta: false, wip: false },
  { name: "Doubles Comptes",     icon: "copy",          href: "/double-accounts",    featureKey: "double_accounts", beta: false, wip: false },
  { name: "Détections",          icon: "bell",          href: "/detections",         featureKey: "double_accounts", beta: false, wip: false },
  { name: "Invitations",         icon: "link",          href: "/invitations",        featureKey: "members", beta: false, wip: false },
  { name: "Logs Discord",        icon: "file-text",     href: "/logs",              featureKey: "logs", beta: false, wip: false },
  { name: "Journal d'activité",  icon: "history",       href: "/activity",          featureKey: "activity", beta: false, wip: false },
  { name: "Événements",          icon: "zap",           href: "/events",            featureKey: "events", beta: false, wip: false },
  { name: "Daily Algo",          icon: "code",          href: "/dailyalgo",         featureKey: "daily_algo", beta: false, wip: false },
];

export const communityItems: PageConfig[] = [
  { name: "Leveling & XP",       icon: "trophy",        href: "/leveling",         featureKey: "leveling", beta: true, wip: false },
  { name: "Giveaways",           icon: "sparkles",      href: "/giveaways",        featureKey: "giveaways", beta: true, wip: false },
  { name: "Annonces & Auto-Rôle", icon: "megaphone",    href: "/announcement",     featureKey: "welcome_goodbye", beta: true, wip: false },
  { name: "Reaction Roles",      icon: "mouse-pointer", href: "/reaction-roles",   featureKey: "reaction_roles", beta: true, wip: false },
  { name: "Déclencheurs",        icon: "message-square",href: "/triggers",         featureKey: "triggers", beta: true, wip: false },
  { name: "Suggestions",         icon: "thumbs-up",     href: "/suggestions",      featureKey: "suggestions", beta: true, wip: false },
  { name: "Embeds",              icon: "file-plus",     href: "/embed-builder",    featureKey: "embed_builder", beta: true, wip: false },
  { name: "Règlement",           icon: "book",          href: "/regulation",       featureKey: "regulation", beta: false, wip: false },
  { name: "Actualités & RSS",    icon: "rss",           href: "/news",             featureKey: "news", beta: false, wip: false },
  { name: "Réseaux sociaux",     icon: "share-2",       href: "/social-networks",  featureKey: "social_networks", beta: false, wip: true },
];

export const staffItems: PageConfig[] = [
  { name: "Annuaire",            icon: "users",         href: "/staff-management?tab=members", featureKey: "staff_directory", beta: false, wip: false },
  { name: "Hiérarchie & Rôles",  icon: "shield",        href: "/staff-management?tab=roles",   featureKey: "staff_roles", beta: false, wip: false },
  { name: "Recrutement",         icon: "user-plus",     href: "/recruitment",      featureKey: "recruitment", beta: false, wip: false },
  { name: "Formulaires",         icon: "description",   href: "/recruitment-forms", featureKey: "recruitment", beta: false, wip: false },
  { name: "Tickets",             icon: "message-square",href: "/tickets",          featureKey: "tickets", beta: false, wip: false },
  { name: "Tutorat",             icon: "book-open",     href: "/tutoring",         featureKey: "tutoring", beta: false, wip: false },
  { name: "Réunions",            icon: "calendar",      href: "/meetings",         featureKey: "meetings", beta: false, wip: false },
  { name: "Planning",            icon: "sun",           href: "/absences",         featureKey: "absences", beta: false, wip: false },
  { name: "Sondages",            icon: "bar-chart",     href: "/staff-management?tab=polls",    featureKey: "polls", beta: false, wip: false },
  { name: "Discipline",          icon: "alert-circle",  href: "/staff-management?tab=warnings", featureKey: "discipline", beta: false, wip: false },
];

export const configItems: PageConfig[] = [
  { name: "Modules",             icon: "package",       href: "/modules",              featureKey: "modules", beta: false, wip: false },
  { name: "Salons",              icon: "hash",          href: "/channels-management",  featureKey: "auto_thread", beta: true, wip: false },
  { name: "Commandes",           icon: "terminal",      href: "/command-access",       featureKey: "commands", beta: false, wip: false },
  { name: "Paramètres",          icon: "settings",      href: "/settings",             featureKey: "settings", beta: false, wip: false },
  { name: "Sauvegardes",         icon: "archive",        href: "/backups",              featureKey: "settings", beta: false, wip: false },
];

export const otherPages: PageConfig[] = [
  { name: "Administration",      icon: "lock",          href: "/admin",                beta: false, wip: false },
  { name: "Mon Profil",          icon: "user",          href: "/profile",              beta: false, wip: false },
  { name: "Paramètres Utilisateur", icon: "settings",   href: "/userSettings",         beta: true, wip: false },
];

export const allPages: PageConfig[] = [
  ...generalItems,
  ...moderationItems,
  ...communityItems,
  ...staffItems,
  ...configItems,
  ...otherPages
];

export function getPageStatus(path: string, url: string = path): { beta: boolean; wip: boolean; name: string } | null {
  for (const page of allPages) {
    const [pPath, pQuery] = page.href.split('?');
    if (pQuery) {
      if (path === pPath && url.includes(pQuery)) {
        return { beta: isPageBeta(page), wip: isPageWip(page), name: page.name };
      }
    } else {
      if (path === pPath || (pPath !== '/' && path.startsWith(`${pPath}/`))) {
        return { beta: isPageBeta(page), wip: isPageWip(page), name: page.name };
      }
    }
  }
  return null;
}
