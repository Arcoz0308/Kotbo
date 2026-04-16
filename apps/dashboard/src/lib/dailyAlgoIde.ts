export type IdeLanguage = 'javascript' | 'python' | 'c';

export function normalizeIdeLanguage(input?: string | null): IdeLanguage {
  const value = (input ?? '').trim().toLowerCase();
  if (value === 'js' || value === 'javascript' || value === 'ts' || value === 'typescript') return 'javascript';
  if (value === 'py' || value === 'python') return 'python';
  if (value === 'c' || value === 'cpp' || value === 'c++' || value === 'clang') return 'c';
  return 'javascript';
}

export function detectIdeLanguageFromCode(code: string): IdeLanguage {
  const source = code.trim();
  if (!source) return 'javascript';

  const pythonHints = [
    /\bdef\s+\w+\s*\(/,
    /\bimport\s+\w+/,
    /\bprint\s*\(/,
    /\bNone\b/,
    /:\s*(\n|$)/,
  ];

  const cHints = [
    /#include\s*[<"]/,
    /\bint\s+main\s*\(/,
    /\bprintf\s*\(/,
    /\bscanf\s*\(/,
    /\bstd::/,
    /using\s+namespace\s+std/,
  ];

  const pythonScore = pythonHints.reduce((score, pattern) => score + (pattern.test(source) ? 1 : 0), 0);
  const cScore = cHints.reduce((score, pattern) => score + (pattern.test(source) ? 1 : 0), 0);

  if (cScore >= 1 && cScore >= pythonScore) return 'c';
  if (pythonScore >= 2) return 'python';

  return 'javascript';
}

export function createIdePayloadKey(submissionId: string): string {
  const timestamp = Date.now();
  return `daily-algo-ide:${submissionId}:${timestamp}`;
}
