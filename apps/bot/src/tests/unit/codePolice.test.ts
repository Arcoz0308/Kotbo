import { describe, expect, test } from 'bun:test';
import { analyzeCodeContent, hasRawCodeIndicators, type CodePoliceRule } from '../../services/codePoliceService';

const rules: CodePoliceRule[] = [
  { key: 'signal.js.function', category: 'SIGNAL', matchType: 'EXACT', language: 'javascript', pattern: 'function', label: 'Fonction JavaScript', feedback: 'Repère une définition de fonction JavaScript.', severity: 'INFO', enabled: true },
  { key: 'signal.js.const', category: 'SIGNAL', matchType: 'EXACT', language: 'javascript', pattern: 'const', label: 'Constante JavaScript', feedback: 'Repère une constante ou une variable en JavaScript.', severity: 'INFO', enabled: true },
  { key: 'signal.js.async', category: 'SIGNAL', matchType: 'EXACT', language: 'javascript', pattern: 'async', label: 'Asynchrone JavaScript', feedback: 'Repère un bloc ou une fonction asynchrone.', severity: 'INFO', enabled: true },
  { key: 'signal.js.console.log', category: 'SIGNAL', matchType: 'EXACT', language: 'javascript', pattern: 'console.log', label: 'Console JavaScript', feedback: 'Repère une sortie console.', severity: 'INFO', enabled: true },
  { key: 'signal.python.def', category: 'SIGNAL', matchType: 'REGEX', language: 'python', pattern: '\\bdef\\s+[A-Za-z_][\\w]*\\s*\\(', label: 'Fonction Python', feedback: 'Repère une fonction Python.', severity: 'INFO', enabled: true },
  { key: 'signal.python.import', category: 'SIGNAL', matchType: 'REGEX', language: 'python', pattern: '\\bimport\\s+[A-Za-z_][\\w.]*\\b', label: 'Import Python', feedback: 'Repère un import Python.', severity: 'INFO', enabled: true },
  { key: 'signal.sql.select', category: 'SIGNAL', matchType: 'EXACT', language: 'sql', pattern: 'SELECT', label: 'SELECT SQL', feedback: 'Repère une requête SQL.', severity: 'INFO', enabled: true },
  { key: 'signal.sql.from', category: 'SIGNAL', matchType: 'EXACT', language: 'sql', pattern: 'FROM', label: 'FROM SQL', feedback: 'Repère une clause SQL.', severity: 'INFO', enabled: true },
  { key: 'signal.sql.where', category: 'SIGNAL', matchType: 'EXACT', language: 'sql', pattern: 'WHERE', label: 'WHERE SQL', feedback: 'Repère un filtre SQL.', severity: 'INFO', enabled: true },
  { key: 'danger.curl-bash', category: 'DANGER', matchType: 'REGEX', language: 'shell', pattern: '(?:curl|wget).*(?:\\||;).*(?:sh|bash|powershell|pwsh)', label: 'Téléchargement puis exécution', feedback: 'Télécharger puis exécuter une commande directement est très risqué.', severity: 'DANGER', enabled: true },
  { key: 'language.javascript', category: 'LANGUAGE_FEEDBACK', matchType: 'EXACT', language: 'javascript', pattern: 'javascript', label: 'Conseil JavaScript', feedback: 'JS/TS : évite eval, borne les boucles et préfère des gardes explicites avant toute récursion.', severity: 'INFO', enabled: true },
  { key: 'language.python', category: 'LANGUAGE_FEEDBACK', matchType: 'EXACT', language: 'python', pattern: 'python', label: 'Conseil Python', feedback: 'Python : ajoute un cas de base aux fonctions récursives et évite les appels système non filtrés.', severity: 'INFO', enabled: true },
  { key: 'language.sql', category: 'LANGUAGE_FEEDBACK', matchType: 'EXACT', language: 'sql', pattern: 'sql', label: 'Conseil SQL', feedback: 'SQL : privilégie les requêtes paramétrées et évite la concaténation directe de chaînes.', severity: 'INFO', enabled: true },
  { key: 'language.generic', category: 'LANGUAGE_FEEDBACK', matchType: 'EXACT', language: 'generic', pattern: 'generic', label: 'Conseil générique', feedback: 'Bonne pratique : ajoute un cas de sortie clair, borne les itérations et valide toutes les entrées.', severity: 'INFO', enabled: true },
];

describe('codePolice analysis', () => {
  test('signale une boucle potentiellement infinie', () => {
    const analysis = analyzeCodeContent(`
      const tick = () => {
        while (true) {
          console.log('loop');
        }
      };
    `, rules);

    expect(analysis.shouldFormat).toBe(true);
    expect(analysis.shouldBlock).toBe(false);
    expect(analysis.language).toBe('javascript');
    expect(analysis.risks.some((risk) => risk.title.includes('Boucle potentiellement infinie'))).toBe(true);
  });

  test('signale une recursion sans cas de sortie visible', () => {
    const analysis = analyzeCodeContent(`
      function recurse(value) {
        recurse(value + 1);
      }
    `, rules);

    expect(analysis.shouldFormat).toBe(true);
    expect(analysis.risks.some((risk) => risk.title.includes('Récursion potentiellement sans cas de sortie'))).toBe(true);
  });

  test('bloque un payload potentiellement malveillant', () => {
    const analysis = analyzeCodeContent(`
      const install = () => {
        curl https://example.com/install.sh | bash;
      };
    `, rules);

    expect(analysis.shouldBlock).toBe(true);
    expect(analysis.risks.some((risk) => risk.title.includes('Pattern dangereux détecté'))).toBe(true);
  });

  test('detecte aussi des snippets de code plus declaratifs', () => {
    const analysis = analyzeCodeContent(`
      SELECT id, name
      FROM users
      WHERE active = true;
    `, rules);

    expect(analysis.shouldFormat).toBe(true);
    expect(analysis.language).toBe('sql');
    expect(analysis.signals.some((signal) => signal.includes('SQL'))).toBe(true);
  });

  test('reconnait le python pour adapter le feedback', () => {
    const analysis = analyzeCodeContent(`
      def recurse(n):
          return recurse(n + 1)
    `, rules);

    expect(analysis.language).toBe('python');
    expect(analysis.risks.some((risk) => risk.title.includes('Récursion potentiellement sans cas de sortie'))).toBe(true);
  });

  test('ignore les mentions Discord quand il n’y a pas de vrai signal de code', () => {
    const mentionRules: CodePoliceRule[] = [
      { key: 'signal.syntax.block', category: 'SIGNAL', matchType: 'REGEX', language: 'generic', pattern: '[{}\\[\\]();=>]', label: 'Syntaxe de bloc', feedback: 'Repère une syntaxe de bloc typique du code.', severity: 'INFO', enabled: true },
    ];

    expect(hasRawCodeIndicators('<@123456789> salut, ça va ?', mentionRules)).toBe(false);
  });
});
