export type ReportRuleOption = {
  id: string;
  scope: 'Discord ToS' | 'Constitution francaise' | 'Règles';
  label: string;
  details: string;
};

export const reportRuleOptions: ReportRuleOption[] = [
  {
    id: 'tos-terms',
    scope: 'Discord ToS',
    label: "Conditions d'utilisation Discord",
    details: "Violation des conditions d'utilisation officielles de Discord.",
  },
  {
    id: 'tos-guidelines',
    scope: 'Discord ToS',
    label: 'Community Guidelines Discord',
    details: 'Violation des regles communautaires officielles de Discord.',
  },
  {
    id: 'constitution',
    scope: 'Constitution francaise',
    label: 'Non-respect de la Constitution et/ou de la loi francaise',
    details: 'Violation de la Constitution francaise, des lois sur la haine en ligne, le harcelement, les discours dangereux, etc.',
  },
  {
    id: 'rule-1',
    scope: 'Règles',
    label: '1. Respect et courtoisie',
    details: 'Insultes, harcelement, menaces ou discrimination interdits.',
  },
  {
    id: 'rule-2',
    scope: 'Règles',
    label: '2. Contenu approprie',
    details: 'Aucun contenu NSFW, gore, violent ou obscen tolere.',
  },
  {
    id: 'rule-3',
    scope: 'Règles',
    label: '3. Utilisation des salons',
    details: 'Chaque salon doit etre utilise selon son theme.',
  },
  {
    id: 'rule-4',
    scope: 'Règles',
    label: '4. Spam et mentions',
    details: 'Flood, abus de majuscules et abus des mentions interdits.',
  },
  {
    id: 'rule-5',
    scope: 'Règles',
    label: '5. Publicite et autopromotion',
    details: 'Publicite non autorisee hors salon dedie et sans abus.',
  },
  {
    id: 'rule-6',
    scope: 'Règles',
    label: '6. Salons vocaux',
    details: 'Respect vocal, pas de soundboards, pas de sons non sollicites.',
  },
  {
    id: 'rule-7',
    scope: 'Règles',
    label: '7. Protection de la vie privee',
    details: "Ne pas partager d'informations personnelles sensibles.",
  },
  {
    id: 'rule-8',
    scope: 'Règles',
    label: '8. Messages prives (DM)',
    details: 'Harcelement ou demarchage non sollicite en DM interdit.',
  },
  {
    id: 'rule-9',
    scope: 'Règles',
    label: '9. Moderation',
    details: 'Les decisions de moderation doivent etre respectees.',
  },
  {
    id: 'rule-10',
    scope: 'Règles',
    label: '10. Evolution du reglement',
    details: 'Les regles peuvent evoluer, les membres doivent se tenir informes.',
  },
  {
    id: 'rule-11',
    scope: 'Règles',
    label: '11. Securite et integrite',
    details: 'Scripts malveillants, raids, injection, doxxing et scraping interdits.',
  },
  {
    id: 'rule-12',
    scope: 'Règles',
    label: '12. Exploitation des systemes du serveur',
    details: 'Contournement/farm XP par scripts ou methodes artificielles interdit.',
  },
  {
    id: 'rule-13',
    scope: 'Règles',
    label: '13. Emojis, GIFs et reactions',
    details: 'Emojis/GIFs inappropries ou obscenes interdits.',
  },
];

function formatRuleLine(rule: ReportRuleOption): string {
  return `[${rule.scope}] ${rule.label} - ${rule.details}`;
}

export function buildBrokenRulesPayload(ruleIds: string[]): string {
  return ruleIds
    .map((ruleId) => reportRuleOptions.find((entry) => entry.id === ruleId))
    .filter((entry): entry is ReportRuleOption => Boolean(entry))
    .map(formatRuleLine)
    .join('\n');
}

export function getRuleIdsFromBrokenRules(rawBrokenRules: string): string[] {
  return rawBrokenRules
    .split('\n')
    .map((line) => line.trim())
    .map((line) => {
      const matchedRule = reportRuleOptions.find((entry) => formatRuleLine(entry) === line);
      return matchedRule?.id ?? null;
    })
    .filter((ruleId): ruleId is string => Boolean(ruleId));
}

export function getRuleById(ruleId: string): ReportRuleOption | undefined {
  return reportRuleOptions.find((entry) => entry.id === ruleId);
}
