export type ReportRuleOption = {
  id: string;
  scope: 'Règlement';
  label: string;
  details: string;
  emoji: string | null;
  sortOrder: number;
};

export type RegulationRuleItem = {
  id: string;
  title: string;
  description: string;
  emoji: string | null;
  sortOrder: number;
  enabled: boolean;
};

function normalizeEmoji(value: string | null | undefined): string | null {
  const emoji = value?.trim();
  return emoji ? emoji : null;
}

function toRuleOption(rule: RegulationRuleItem): ReportRuleOption {
  return {
    id: rule.id,
    scope: 'Règlement',
    label: rule.title.trim(),
    details: rule.description.trim(),
    emoji: normalizeEmoji(rule.emoji),
    sortOrder: rule.sortOrder ?? 0,
  };
}

export function buildReportRuleOptions(rules: RegulationRuleItem[]): ReportRuleOption[] {
  return rules
    .filter((rule) => rule.enabled)
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, 'fr'))
    .map(toRuleOption);
}

function parseBrokenRulesPayload(rawBrokenRules: string): Array<Record<string, unknown>> {
  const trimmed = rawBrokenRules.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object');
  } catch {
    return [];
  }
}

export function buildBrokenRulesPayload(ruleIds: string[], options: ReportRuleOption[]): string {
  const selectedRules = [...new Set(ruleIds)]
    .map((ruleId) => options.find((entry) => entry.id === ruleId))
    .filter((entry): entry is ReportRuleOption => Boolean(entry));

  return JSON.stringify(selectedRules.map((rule) => ({
    id: rule.id,
    title: rule.label,
    description: rule.details,
    emoji: rule.emoji,
    sortOrder: rule.sortOrder,
  })));
}

export function getRuleIdsFromBrokenRules(rawBrokenRules: string): string[] {
  const parsed = parseBrokenRulesPayload(rawBrokenRules);

  if (parsed.length > 0) {
    return parsed
      .map((entry) => (typeof entry.id === 'string' ? entry.id.trim() : ''))
      .filter((ruleId): ruleId is string => Boolean(ruleId));
  }

  return rawBrokenRules
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line)
    .filter((ruleId): ruleId is string => Boolean(ruleId));
}

export function getRulesFromBrokenRules(rawBrokenRules: string, options: ReportRuleOption[]): ReportRuleOption[] {
  const parsed = parseBrokenRulesPayload(rawBrokenRules);

  if (parsed.length > 0) {
    return parsed
      .map((entry) => {
        const id = typeof entry.id === 'string' ? entry.id.trim() : '';
        if (!id) return null;

        const fallback = options.find((rule) => rule.id === id);
        const title = typeof entry.title === 'string' && entry.title.trim()
          ? entry.title.trim()
          : fallback?.label ?? id;
        const details = typeof entry.description === 'string' && entry.description.trim()
          ? entry.description.trim()
          : fallback?.details ?? '';
        const emoji = normalizeEmoji(typeof entry.emoji === 'string' ? entry.emoji : fallback?.emoji);
        const sortOrder = typeof entry.sortOrder === 'number' && Number.isFinite(entry.sortOrder)
          ? entry.sortOrder
          : fallback?.sortOrder ?? 0;

        return {
          id,
          scope: 'Règlement',
          label: title,
          details,
          emoji,
          sortOrder,
        } satisfies ReportRuleOption;
      })
      .filter((entry): entry is ReportRuleOption => Boolean(entry));
  }

  return getRuleIdsFromBrokenRules(rawBrokenRules)
    .map((ruleId, index) => {
      const matched = options.find((entry) => entry.id === ruleId);
      if (matched) return matched;

      return {
        id: `legacy-${index}`,
        scope: 'Règlement',
        label: ruleId,
        details: '',
        emoji: null,
        sortOrder: index,
      } satisfies ReportRuleOption;
    });
}

export function getRuleById(ruleId: string, options: ReportRuleOption[]): ReportRuleOption | undefined {
  return options.find((entry) => entry.id === ruleId);
}
