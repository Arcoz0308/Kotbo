export interface PageConfig {
  name: string;
  icon?: string;
  href: string;
  featureKey?: string;
  /** Affiche le badge BETA dans la sidebar et la bannière page */
  beta?: boolean;
  /** Affiche le badge WIP dans la sidebar et l'overlay page */
  wip?: boolean;
  /** Message custom sur l'overlay WIP (remplace le texte par défaut) */
  wipMessage?: string;
}

export function isPageBeta(page: PageConfig): boolean {
  return page.beta === true;
}

export function isPageWip(page: PageConfig): boolean {
  return page.wip === true;
}

export const generalItems: PageConfig[] = [
  { name: "Vue d'ensemble", icon: "grid",      href: "/",          featureKey: "dashboard", beta: false, wip: false },
  { name: "Pulse & IA",     icon: "activity",  href: "/pulse",     featureKey: "dashboard", beta: true, wip: false },
  { name: "Inbox",          icon: "inbox",     href: "/inbox",     featureKey: "inbox", beta: false, wip: false },
  { name: "Analytics",      icon: "pie-chart", href: "/analytics", featureKey: "analytics", beta: false, wip: false },
];

export const moderationItems: PageConfig[] = [
  { name: "Membres",             icon: "users",         href: "/members",            featureKey: "members", beta: false, wip: false },
  { name: "Sanctions",           icon: "alert-triangle",href: "/sanctions",          featureKey: "sanctions", beta: false, wip: false },
  { name: "Appels de ban",       icon: "gavel",         href: "/appeals",            featureKey: "sanctions", beta: true, wip: false },
  { name: "Modération auto",     icon: "shield-alert",  href: "/automod",            featureKey: "automod", beta: true, wip: false },
  { name: "Pseudos",             icon: "filter",        href: "/nickname-moderation",featureKey: "nickname_moderation", beta: false, wip: false },
  { name: "Sécurité & DC",       icon: "shield",        href: "/double-accounts",    featureKey: "double_accounts", beta: false, wip: false },
  { name: "Invitations",         icon: "link",          href: "/invitations",        featureKey: "members", beta: false, wip: false },
  { name: "Logs Discord",        icon: "file-text",     href: "/logs",              featureKey: "logs", beta: false, wip: false },
  { name: "Recherche messages",  icon: "search",        href: "/message-search",    featureKey: "logs", beta: true, wip: false },
  { name: "Transcriptions",      icon: "file",          href: "/transcripts-list",  featureKey: "tickets", beta: false, wip: false },
  { name: "Journal d'activité",  icon: "history",       href: "/activity",          featureKey: "activity", beta: false, wip: false },
  { name: "Événements",          icon: "zap",           href: "/events",            featureKey: "events", beta: false, wip: false },
  { name: "Formulaires",         icon: "clipboard",     href: "/forms",             featureKey: "events", beta: false, wip: false },
  { name: "Daily Algo",          icon: "code",          href: "/dailyalgo",         featureKey: "daily_algo", beta: false, wip: false },
];

export const levelingItems: PageConfig[] = [
  { name: "Leveling & XP",       icon: "trophy",        href: "/leveling",         featureKey: "leveling", beta: false, wip: false },
  { name: "Saisons",             icon: "flag",          href: "/seasons",          featureKey: "leveling", beta: true, wip: false },
  { name: "Réputation",          icon: "star",          href: "/reputation",       featureKey: "leveling", beta: true, wip: false },
];

export const economyItems: PageConfig[] = [
  { name: "Économie & RPG",      icon: "coins",         href: "/economy",          featureKey: "economy",  beta: true, wip: false },
  { name: "Marché",              icon: "shopping-bag",  href: "/marketplace",      featureKey: "economy",  beta: true, wip: false },
  { name: "Quêtes",              icon: "compass",       href: "/quests",           featureKey: "economy",  beta: true, wip: false },
];

export const communityItems: PageConfig[] = [
  { name: "Giveaways",           icon: "sparkles",      href: "/giveaways",        featureKey: "giveaways", beta: false, wip: false },
  { name: "Annonces & Auto-Rôle", icon: "megaphone",    href: "/announcement",     featureKey: "welcome_goodbye", beta: false, wip: false },
  { name: "Reaction Roles",      icon: "mouse-pointer", href: "/reaction-roles",   featureKey: "reaction_roles", beta: true, wip: false },
  { name: "Déclencheurs",        icon: "message-square",href: "/triggers",         featureKey: "triggers", beta: false, wip: false },
  { name: "Suggestions",         icon: "thumbs-up",     href: "/suggestions",      featureKey: "suggestions", beta: false, wip: false },
  { name: "Embeds",              icon: "file-plus",     href: "/embed-builder",    featureKey: "embed_builder", beta: true, wip: false },
  { name: "Règlement",           icon: "book",          href: "/regulation",       featureKey: "regulation", beta: false, wip: false },
  { name: "Actualités & RSS",    icon: "rss",           href: "/news",             featureKey: "news", beta: false, wip: false },
  { name: "Salons Fun",          icon: "smile",         href: "/fun",              featureKey: "fun",  beta: true, wip: false },
  { name: "Réseaux sociaux",     icon: "share-2",       href: "/social-networks",  featureKey: "social_networks", beta: true, wip: false },
];

export const staffItems: PageConfig[] = [
  { name: "Annuaire",            icon: "users",         href: "/staff-management/members", featureKey: "staff_directory", beta: false, wip: false },
  { name: "Hiérarchie & Rôles",  icon: "shield",        href: "/staff-management/roles",   featureKey: "staff_roles", beta: false, wip: false },
  { name: "Recrutement",         icon: "user-plus",     href: "/recruitment",      featureKey: "recruitment", beta: false, wip: false },
  { name: "Tickets & Satisfaction", icon: "message-square",href: "/tickets",          featureKey: "tickets", beta: false, wip: false },
  { name: "Évaluations Staff",   icon: "award",         href: "/evaluations",      featureKey: "staff_directory", beta: true, wip: false },
  { name: "Tutorat",             icon: "book-open",     href: "/tutoring",         featureKey: "tutoring", beta: false, wip: false },
  { name: "Planning",            icon: "calendar",      href: "/planning",         featureKey: "absences", beta: false, wip: false },
  { name: "Sondages",            icon: "bar-chart",     href: "/staff-management/polls",    featureKey: "polls", beta: false, wip: false },
  { name: "Discipline",          icon: "alert-circle",  href: "/staff-management/warnings", featureKey: "discipline", beta: false, wip: false },
  { name: "Widget Profil",       icon: "layout",        href: "/widget",                    featureKey: "dashboard", beta: true, wip: false },
];

export const crossServerItems: PageConfig[] = [
  { name: "Liens de salons",        icon: "link",          href: "/channel-links",      featureKey: "channel_links", beta: true, wip: false },
  { name: "Serveurs Staff",         icon: "shield",        href: "/staff-server",       featureKey: "staff_server", beta: true, wip: false },
];

export const configItems: PageConfig[] = [
  { name: "Modules",             icon: "package",       href: "/modules",              featureKey: "modules", beta: false, wip: false },
  { name: "Santé Salons",        icon: "activity",      href: "/channel-health",       featureKey: "channel_health", beta: true, wip: false },
  { name: "Salons",              icon: "hash",          href: "/channels-management",  featureKey: "auto_thread", beta: false, wip: false },
  { name: "Commandes",           icon: "terminal",      href: "/command-access",       featureKey: "commands", beta: false, wip: false },
  { name: "Paramètres",          icon: "settings",      href: "/settings",             featureKey: "settings", beta: false, wip: false },
  { name: "Sauvegardes",         icon: "archive",        href: "/backups",              featureKey: "settings", beta: false, wip: false },
  { name: "Planifications",      icon: "calendar",      href: "/schedules",            featureKey: "settings", beta: true, wip: false },
  { name: "API MCP",             icon: "cpu",           href: "/mcp-settings",         featureKey: "settings", beta: true, wip: false },
  { name: "Custom Bot",          icon: "bot",           href: "/custom-bot",           featureKey: "settings", beta: false, wip: true, wipMessage: "Cette fonctionnalité est disponible sur demande. Contactez l'administrateur de Kotbo en message privé sur Discord pour l'activer (service payant)." },
];

export const otherPages: PageConfig[] = [
  { name: "Administration",      icon: "lock",          href: "/admin",                beta: false, wip: false },
  { name: "Mon Profil",          icon: "user",          href: "/profile",              beta: false, wip: false },
  { name: "Paramètres Utilisateur", icon: "settings",   href: "/userSettings",         beta: false, wip: false },
];

export const allPages: PageConfig[] = [
  ...generalItems,
  ...moderationItems,
  ...levelingItems,
  ...economyItems,
  ...communityItems,
  ...staffItems,
  ...crossServerItems,
  ...configItems,
  ...otherPages
];

export function getPageStatus(path: string, url: string = path): { beta: boolean; wip: boolean; name: string; wipMessage?: string } | null {
  for (const page of allPages) {
    const [pPath, pQuery] = page.href.split('?');
    if (pQuery) {
      if (path === pPath && url.includes(pQuery)) {
        return { beta: isPageBeta(page), wip: isPageWip(page), name: page.name, wipMessage: page.wipMessage };
      }
    } else {
      if (path === pPath || (pPath !== '/' && path.startsWith(`${pPath}/`))) {
        return { beta: isPageBeta(page), wip: isPageWip(page), name: page.name, wipMessage: page.wipMessage };
      }
    }
  }
  return null;
}
