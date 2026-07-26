export type IdeLanguage = 'javascript' | 'typescript' | 'python' | 'c' | 'lua' | 'sqlite';

export function normalizeIdeLanguage(input?: string | null): IdeLanguage {
  const value = (input ?? '').trim().toLowerCase();
  if (value === 'js' || value === 'javascript') return 'javascript';
  if (value === 'ts' || value === 'typescript') return 'typescript';
  if (value === 'py' || value === 'python') return 'python';
  if (value === 'c' || value === 'cpp' || value === 'c++' || value === 'clang') return 'c';
  if (value === 'lua') return 'lua';
  if (value === 'sql' || value === 'sqlite') return 'sqlite';
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

  const luaHints = [
    /\blocal\s+\w+/,
    /\bfunction\s+\w+\s*\(/,
    /\bend\b/,
    /\bprint\s*\(/,
    /\brequire\s*\(/,
  ];

  const sqliteHints = [
    /\bselect\b[\s\S]+\bfrom\b/i,
    /\bcreate\s+table\b/i,
    /\binsert\s+into\b/i,
    /\bupdate\b[\s\S]+\bset\b/i,
    /\bdelete\s+from\b/i,
    /\bdrop\s+table\b/i,
    /\balter\s+table\b/i,
    /\bpragma\b/i,
  ];

  const typescriptHints = [
    /\binterface\s+\w+/,
    /\btype\s+\w+\s*=/,
    /\benum\s+\w+/,
    /\b(public|private|protected|readonly)\s+\w+/,
    /\bimplements\s+\w+/,
    /:\s*[A-Z][\w<>, [\]|&]*/,
    /\bas\s+[A-Z][\w<>, [\]|&]*/,
  ];

  const pythonScore = pythonHints.reduce((score, pattern) => score + (pattern.test(source) ? 1 : 0), 0);
  const cScore = cHints.reduce((score, pattern) => score + (pattern.test(source) ? 1 : 0), 0);
  const luaScore = luaHints.reduce((score, pattern) => score + (pattern.test(source) ? 1 : 0), 0);
  const sqliteScore = sqliteHints.reduce((score, pattern) => score + (pattern.test(source) ? 1 : 0), 0);
  const typescriptScore = typescriptHints.reduce((score, pattern) => score + (pattern.test(source) ? 1 : 0), 0);

  if (sqliteScore >= 1) return 'sqlite';
  if (cScore >= 1 && cScore >= pythonScore) return 'c';
  if (luaScore >= 2) return 'lua';
  if (pythonScore >= 2) return 'python';
  if (typescriptScore >= 1) return 'typescript';

  return 'javascript';
}

export function createIdePayloadKey(submissionId: string): string {
  const timestamp = Date.now();
  return `daily-algo-ide:${submissionId}:${timestamp}`;
}
