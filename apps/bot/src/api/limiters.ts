export const configRateLimiter = new Map<string, number[]>();

/**
 * Pages publiques des clans. Le classement est mis en cache et servi tel quel à
 * tout le monde, d'où un plafond large ; la recherche, elle, tape la base à
 * chaque appel, mais elle est déclenchée par une frappe humaine (avec un délai
 * d'attente côté page), donc une trentaine d'appels par minute suffit largement.
 */
export const publicClansRateLimiter = new Map<string, number[]>();
export const publicClanSearchRateLimiter = new Map<string, number[]>();
export const errorReportRateLimiter = new Map<string, number[]>();
export const feedbackReportRateLimiter = new Map<string, number[]>();
export const partnershipRateLimiter = new Map<string, number[]>();

/**
 * Écritures du dashboard, indexées par membre + serveur (et non par IP : deux
 * admins derrière la même sortie réseau ne doivent pas se pénaliser).
 *
 * `dashboardWriteRateLimiter` est un garde-fou large : il ne gêne aucun usage
 * humain, mais coupe une boucle de requêtes partie en vrille côté panel.
 * `dashboardSensitiveRateLimiter` couvre le petit lot d'actions coûteuses ou
 * irréversibles (enregistrement de réglages, clôture de semaine, remises à zéro
 * de clans), où même quelques appels par minute n'ont aucun sens légitime.
 */
export const dashboardWriteRateLimiter = new Map<string, number[]>();
export const dashboardSensitiveRateLimiter = new Map<string, number[]>();
