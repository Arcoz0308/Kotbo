export const configRateLimiter = new Map<string, number[]>();
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
