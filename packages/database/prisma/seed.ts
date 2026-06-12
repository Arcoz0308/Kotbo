import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

loadEnv({ path: path.resolve(import.meta.dir, '../../.env') });
loadEnv({ path: path.resolve(import.meta.dir, '../../../.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL non défini dans .env');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });

const prisma = new PrismaClient({ adapter });

const GUILD_ID = process.env.GUILD_ID;
if (!GUILD_ID) {
  console.error('❌ GUILD_ID non défini dans .env');
  process.exit(1);
}

const guildId: string = GUILD_ID;

const DEFAULT_FEEDS = [
  // 🇫🇷 Actualité Tech Générale (France)
  { name: 'Presse-Citron', url: 'https://www.presse-citron.net/feed/', category: 'Actualité Tech Générale (France)', language: 'fr' },
  { name: 'Le Journal du Geek', url: 'https://www.journaldugeek.com/feed/', category: 'Actualité Tech Générale (France)', language: 'fr' },
  { name: 'Numerama', url: 'https://www.numerama.com/feed/', category: 'Actualité Tech Générale (France)', language: 'fr' },
  { name: 'Next (ex-Next INpact)', url: 'https://next.ink/feed/', category: 'Actualité Tech Générale (France)', language: 'fr' },
  { name: "L'Usine Digitale", url: 'https://www.usine-digitale.fr/rss', category: 'Actualité Tech Générale (France)', language: 'fr' },

  // 🌍 Références Internationales (Anglais)
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'Références Internationales (Anglais)', language: 'en' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'Références Internationales (Anglais)', language: 'en' },
  { name: 'Ars Technica', url: 'http://feeds.arstechnica.com/arstechnica/index', category: 'Références Internationales (Anglais)', language: 'en' },
  { name: 'Wired', url: 'https://www.wired.com/feed/rss', category: 'Références Internationales (Anglais)', language: 'en' },
  { name: 'Hacker News (Top)', url: 'https://hnrss.org/frontpage', category: 'Références Internationales (Anglais)', language: 'en' },

  // 🛡️ Cybersécurité & Open Source
  { name: 'Korben', url: 'https://korben.info/feed', category: 'Cybersécurité & Open Source', language: 'fr' },
  { name: 'CERT-FR (ANSSI)', url: 'https://www.cert.ssi.gouv.fr/feed/', category: 'Cybersécurité & Open Source', language: 'fr' },
  { name: 'CNIL (Actus)', url: 'https://www.cnil.fr/fr/rss.xml', category: 'Cybersécurité & Open Source', language: 'fr' },
  { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', category: 'Cybersécurité & Open Source', language: 'en' },

  // 🤖 Intelligence Artificielle & Dev
  { name: 'OpenAI Blog', url: 'https://openai.com/blog/rss.xml', category: 'Intelligence Artificielle & Dev', language: 'en' },
  { name: 'Google News (AI)', url: 'https://news.google.com/rss/search?q=Artificial+Intelligence', category: 'Intelligence Artificielle & Dev', language: 'en' },
  { name: 'Baeldung (Dev)', url: 'https://www.baeldung.com/feed', category: 'Intelligence Artificielle & Dev', language: 'en' },
  { name: 'GitHub Blog', url: 'https://github.blog/feed/', category: 'Intelligence Artificielle & Dev', language: 'en' },

  // 💻 Hardware & Gaming
  { name: "Tom's Hardware France", url: 'https://www.tomshardware.fr/feed/', category: 'Hardware & Gaming', language: 'fr' },
  { name: 'Comptoir du Hardware', url: 'http://www.comptoir-hardware.com/home.xml', category: 'Hardware & Gaming', language: 'fr' },
  { name: 'Frandroid', url: 'https://www.frandroid.com/feed', category: 'Hardware & Gaming', language: 'fr' },
  { name: 'Eurogamer', url: 'https://www.eurogamer.net/feed/news', category: 'Hardware & Gaming', language: 'en' },
];

const DEFAULT_DEVELOPER_EXCUSES = [
  'Ça fonctionnait sur ma machine.',
  "C'est un problème de cache.",
  "C'est une fonctionnalité, pas un bug.",
  "L'API externe était indisponible.",
  "Je pense que c'est un souci de localStorage.",
  'Tout dépend du timing.',
  'Il faut vider le cache du navigateur.',
  'Il manque un point-virgule quelque part.',
  'C’est une classique condition de course.',
  'Le serveur n’était pas prêt.',
  'Ça marche en production, je ne sais pas pourquoi.',
  'Le client n’a pas donné assez de détails.',
  "C'est un problème en aval.",
  'Je l’avais corrigé localement, mais j’ai oublié de commit.',
  'C’est une incompatibilité de navigateur.',
  'La base de données était lente ce jour-là.',
];
const DEFAULT_DAILY_ALGO_PROBLEMS = [
  {
    title: 'Inverser une chaîne',
    description: 'Écris une fonction qui inverse une chaîne de caractères sans utiliser les méthodes built-in.',
    solution: 'Utilise une boucle ou la récursion pour parcourir la chaîne à l\'envers.',
    difficulty: 'facile',
    functionName: 'reverseString',
    functionArgs: [{ name: 'input', type: 'string' }],
    allowedLanguages: ['javascript', 'typescript', 'python'],
    unitTests: [
      { name: 'mot simple', args: ['hello'], expected: 'olleh' },
      { name: 'palindrome', args: ['racecar'], expected: 'racecar' },
      { name: 'chaine vide', args: [''], expected: '' },
    ],
  },
  {
    title: 'Fibonacci',
    description: 'Implémente une fonction qui retourne le Nième nombre de Fibonacci de manière efficace.',
    solution: 'Utilise la programmation dynamique ou la récursion avec mémoïsation pour éviter les recalculs.',
    difficulty: 'moyen',
    functionName: 'fibonacci',
    functionArgs: [{ name: 'n', type: 'number' }],
    allowedLanguages: ['javascript', 'typescript', 'python'],
    unitTests: [
      { name: 'fibo 0', args: [0], expected: 0 },
      { name: 'fibo 1', args: [1], expected: 1 },
      { name: 'fibo 7', args: [7], expected: 13 },
      { name: 'fibo 10', args: [10], expected: 55 },
    ],
  },
  {
    title: 'Vérifier un palindrome',
    description: 'Écris une fonction pour vérifier si une chaîne est un palindrome (ignore les espaces et la casse).',
    solution: 'Compare la chaîne avec sa version inversée après normalisation.',
    difficulty: 'facile',
    functionName: 'isPalindrome',
    functionArgs: [{ name: 'input', type: 'string' }],
    allowedLanguages: ['javascript', 'typescript', 'python'],
    unitTests: [
      { name: 'palindrome simple', args: ['kayak'], expected: true },
      { name: 'palindrome avec espaces', args: ['Never odd or even'], expected: true },
      { name: 'pas palindrome', args: ['hello'], expected: false },
    ],
  },
  {
    title: 'Deux sommes',
    description: 'Trouve deux nombres dans un tableau qui s\'additionnent pour égaler une cible.',
    solution: 'Utilise une Map/Set pour stocker les nombres vus et trouve le complément en O(n).',
    difficulty: 'moyen',
    functionName: 'twoSum',
    functionArgs: [
      { name: 'nums', type: 'number[]' },
      { name: 'target', type: 'number' },
    ],
    allowedLanguages: ['javascript', 'typescript', 'python'],
    unitTests: [
      { name: 'cas classique', args: [[2, 7, 11, 15], 9], expected: [0, 1] },
      { name: 'valeurs dupliquees', args: [[3, 3], 6], expected: [0, 1] },
      { name: 'autre tableau', args: [[3, 2, 4], 6], expected: [1, 2] },
    ],
  },
  {
    title: 'Parenthèses valides',
    description: 'Vérifie si une chaîne de parenthèses/crochets/accolades est correctement équilibrée.',
    solution: 'Utilise une pile (stack) pour tracker les ouvertures et vérifier les fermetures.',
    difficulty: 'moyen',
    functionName: 'isValidParentheses',
    functionArgs: [{ name: 'input', type: 'string' }],
    allowedLanguages: ['javascript', 'typescript', 'python'],
    unitTests: [
      { name: 'valide simple', args: ['()[]{}'], expected: true },
      { name: 'ordre invalide', args: ['([)]'], expected: false },
      { name: 'imbrique valide', args: ['{[()]}'], expected: true },
    ],
  },
  {
    title: 'Nombre premier',
    description: 'Crée une fonction pour vérifier si un nombre donné est un nombre premier.',
    solution: 'Vérifie les diviseurs jusqu\'à la racine carrée du nombre.',
    difficulty: 'facile',
    functionName: 'isPrime',
    functionArgs: [{ name: 'n', type: 'number' }],
    allowedLanguages: ['javascript', 'typescript', 'python'],
    unitTests: [
      { name: '2 est premier', args: [2], expected: true },
      { name: '9 n est pas premier', args: [9], expected: false },
      { name: '17 est premier', args: [17], expected: true },
      { name: '1 n est pas premier', args: [1], expected: false },
    ],
  },
  {
    title: 'Maximum de tableau',
    description: 'Trouve l\'élément maximum dans un tableau sans utiliser Math.max().',
    solution: 'Parcours le tableau en gardant trace du maximum rencontré.',
    difficulty: 'facile',
    functionName: 'maxInArray',
    functionArgs: [{ name: 'values', type: 'number[]' }],
    allowedLanguages: ['javascript', 'typescript', 'python'],
    unitTests: [
      { name: 'valeurs positives', args: [[1, 4, 2, 9, 3]], expected: 9 },
      { name: 'valeurs negatives', args: [[-5, -1, -9]], expected: -1 },
      { name: 'singleton', args: [[42]], expected: 42 },
    ],
  },
  {
    title: 'Fusionner deux tableaux triés',
    description: 'Fusionne deux tableaux triés en un seul tableau trié en O(n + m).',
    solution: 'Utilise deux pointeurs pour comparer et ajouter le plus petit élément en priorité.',
    difficulty: 'moyen',
    functionName: 'mergeSortedArrays',
    functionArgs: [
      { name: 'left', type: 'number[]' },
      { name: 'right', type: 'number[]' },
    ],
    allowedLanguages: ['javascript', 'typescript', 'python'],
    unitTests: [
      { name: 'fusion classique', args: [[1, 3, 5], [2, 4, 6]], expected: [1, 2, 3, 4, 5, 6] },
      { name: 'tableau vide gauche', args: [[], [1, 2]], expected: [1, 2] },
      { name: 'tableau vide droite', args: [[1, 2], []], expected: [1, 2] },
    ],
  },
  {
    title: 'Anagrammes',
    description: 'Détermine si deux chaînes sont des anagrammes (même lettres, ordre différent).',
    solution: 'Compare les fréquences de caractères ou les chaînes triées.',
    difficulty: 'facile',
    functionName: 'areAnagrams',
    functionArgs: [
      { name: 'a', type: 'string' },
      { name: 'b', type: 'string' },
    ],
    allowedLanguages: ['javascript', 'typescript', 'python'],
    unitTests: [
      { name: 'anagramme simple', args: ['chien', 'niche'], expected: true },
      { name: 'pas anagramme', args: ['chat', 'chien'], expected: false },
      { name: 'casse et espaces', args: ['Dormitory', 'Dirty room'], expected: true },
    ],
  },
  {
    title: 'Sous-tableau avec somme max',
    description: 'Trouve la somme maximale d\'un sous-tableau contigu (Kadane\'s algorithm).',
    solution: 'Utilise la programmation dynamique pour tracker la somme locale et globale.',
    difficulty: 'difficile',
    functionName: 'maxSubarraySum',
    functionArgs: [{ name: 'values', type: 'number[]' }],
    allowedLanguages: ['javascript', 'typescript', 'python'],
    unitTests: [
      { name: 'kadane classique', args: [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], expected: 6 },
      { name: 'tout negatif', args: [[-8, -3, -6, -2, -5, -4]], expected: -2 },
      { name: 'tout positif', args: [[1, 2, 3, 4]], expected: 10 },
    ],
  },
];

const DEFAULT_CODE_POLICE_RULES = [
  { key: 'signal.js.function', category: 'SIGNAL', matchType: 'EXACT', language: 'javascript', pattern: 'function', label: 'Fonction JavaScript', feedback: 'Repère une définition de fonction JavaScript.' , severity: 'INFO' },
  { key: 'signal.js.const', category: 'SIGNAL', matchType: 'EXACT', language: 'javascript', pattern: 'const', label: 'Constante JavaScript', feedback: 'Repère une constante ou une variable en JavaScript.', severity: 'INFO' },
  { key: 'signal.js.let', category: 'SIGNAL', matchType: 'EXACT', language: 'javascript', pattern: 'let', label: 'Variable JavaScript', feedback: 'Repère une variable mutable en JavaScript.', severity: 'INFO' },
  { key: 'signal.js.var', category: 'SIGNAL', matchType: 'EXACT', language: 'javascript', pattern: 'var', label: 'Variable historique JavaScript', feedback: 'Repère une déclaration historique en JavaScript.', severity: 'INFO' },
  { key: 'signal.js.async', category: 'SIGNAL', matchType: 'EXACT', language: 'javascript', pattern: 'async', label: 'Asynchrone JavaScript', feedback: 'Repère un bloc ou une fonction asynchrone.', severity: 'INFO' },
  { key: 'signal.js.await', category: 'SIGNAL', matchType: 'EXACT', language: 'javascript', pattern: 'await', label: 'Attente JavaScript', feedback: 'Repère un appel en attente.', severity: 'INFO' },
  { key: 'signal.js.class', category: 'SIGNAL', matchType: 'EXACT', language: 'javascript', pattern: 'class', label: 'Classe JavaScript', feedback: 'Repère une classe.', severity: 'INFO' },
  { key: 'signal.js.import', category: 'SIGNAL', matchType: 'EXACT', language: 'javascript', pattern: 'import', label: 'Import JavaScript', feedback: 'Repère un import ES module.', severity: 'INFO' },
  { key: 'signal.js.export', category: 'SIGNAL', matchType: 'EXACT', language: 'javascript', pattern: 'export', label: 'Export JavaScript', feedback: 'Repère un export ES module.', severity: 'INFO' },
  { key: 'signal.js.console.log', category: 'SIGNAL', matchType: 'EXACT', language: 'javascript', pattern: 'console.log', label: 'Console JavaScript', feedback: 'Repère une sortie console.', severity: 'INFO' },
  { key: 'signal.python.def', category: 'SIGNAL', matchType: 'REGEX', language: 'python', pattern: '\\bdef\\s+[A-Za-z_][\\w]*\\s*\\(', label: 'Fonction Python', feedback: 'Repère une fonction Python.', severity: 'INFO' },
  { key: 'signal.python.import', category: 'SIGNAL', matchType: 'REGEX', language: 'python', pattern: '\\bimport\\s+[A-Za-z_][\\w.]*\\b', label: 'Import Python', feedback: 'Repère un import Python.', severity: 'INFO' },
  { key: 'signal.python.print', category: 'SIGNAL', matchType: 'REGEX', language: 'python', pattern: '\\bprint\\s*\\(', label: 'Print Python', feedback: 'Repère une impression Python.', severity: 'INFO' },
  { key: 'signal.sql.select', category: 'SIGNAL', matchType: 'EXACT', language: 'sql', pattern: 'SELECT', label: 'SELECT SQL', feedback: 'Repère une requête SQL.', severity: 'INFO' },
  { key: 'signal.sql.from', category: 'SIGNAL', matchType: 'EXACT', language: 'sql', pattern: 'FROM', label: 'FROM SQL', feedback: 'Repère une clause SQL.', severity: 'INFO' },
  { key: 'signal.sql.where', category: 'SIGNAL', matchType: 'EXACT', language: 'sql', pattern: 'WHERE', label: 'WHERE SQL', feedback: 'Repère un filtre SQL.', severity: 'INFO' },
  { key: 'signal.shell.sudo', category: 'SIGNAL', matchType: 'EXACT', language: 'shell', pattern: 'sudo', label: 'Commande shell', feedback: 'Repère une commande shell sensible.', severity: 'INFO' },
  { key: 'signal.shell.git', category: 'SIGNAL', matchType: 'EXACT', language: 'shell', pattern: 'git', label: 'Commande git', feedback: 'Repère une commande Git.', severity: 'INFO' },
  { key: 'signal.java.public-class', category: 'SIGNAL', matchType: 'REGEX', language: 'java', pattern: '\\bpublic\\s+(?:class|interface|enum)\\b', label: 'Classe Java', feedback: 'Repère une structure Java.', severity: 'INFO' },
  { key: 'signal.java.system-out', category: 'SIGNAL', matchType: 'EXACT', language: 'java', pattern: 'System.out.println', label: 'Console Java', feedback: 'Repère une sortie console Java.', severity: 'INFO' },
  { key: 'signal.cpp.include', category: 'SIGNAL', matchType: 'REGEX', language: 'cpp', pattern: '\\b#include\\b', label: 'Include C++', feedback: 'Repère un include C++.', severity: 'INFO' },
  { key: 'signal.html.tag', category: 'SIGNAL', matchType: 'REGEX', language: 'html', pattern: '<\\/?[a-z][\\w-]*(?:\\s+[^<>]*)?>', label: 'Balise HTML', feedback: 'Repère une balise HTML.', severity: 'INFO' },
  { key: 'signal.syntax.block', category: 'SIGNAL', matchType: 'REGEX', language: 'generic', pattern: '[{}\\[\\]();=>]', label: 'Syntaxe de bloc', feedback: 'Repère une syntaxe de bloc typique du code.', severity: 'INFO' },
  { key: 'signal.control.flow', category: 'SIGNAL', matchType: 'REGEX', language: 'generic', pattern: '(?:^|\\n)\\s*(?:if|for|while|switch|try|catch|else)\\s*\\(', label: 'Contrôle de flux', feedback: 'Repère une structure de contrôle.', severity: 'INFO' },
  { key: 'signal.indentation.block', category: 'SIGNAL', matchType: 'REGEX', language: 'generic', pattern: '(?:^|\\n)\\s{2,}\\S', label: 'Indentation de bloc', feedback: 'Repère une indentation typique de code.', severity: 'INFO' },
  { key: 'signal.shell.pipeline', category: 'SIGNAL', matchType: 'REGEX', language: 'shell', pattern: '\\b(?:curl|wget|npm|pip|docker|kubectl|rm|chmod|cat|echo|grep|sed|awk)\\b', label: 'Commande shell', feedback: 'Repère une commande shell courante.', severity: 'INFO' },
  { key: 'danger.eval', category: 'DANGER', matchType: 'REGEX', language: 'javascript', pattern: '\\b(?:eval|Function)\\s*\\(', label: 'Évaluation dynamique', feedback: 'Évite l\'évaluation dynamique de code quand ce n\'est pas strictement nécessaire.', severity: 'DANGER' },
  { key: 'danger.timer', category: 'DANGER', matchType: 'REGEX', language: 'javascript', pattern: '\\b(?:setTimeout|setInterval)\\s*\\(', label: 'Timer dynamique', feedback: 'Vérifie que le délai est borné et que la donnée exécutée n\'est pas injectée par un utilisateur.', severity: 'WARNING' },
  { key: 'danger.child-process', category: 'DANGER', matchType: 'REGEX', language: 'generic', pattern: '\\b(?:child_process\\.(?:exec|execSync|spawn|spawnSync)|os\\.system|subprocess\\.(?:run|Popen|call|check_output)|Runtime\\.getRuntime\\(\\)\\.exec|ProcessBuilder)\\b', label: 'Appel système', feedback: 'Les appels système directs doivent être verrouillés et validés avant exécution.', severity: 'DANGER' },
  { key: 'danger.rm-rf', category: 'DANGER', matchType: 'REGEX', language: 'shell', pattern: '(?:rm\\s+-rf\\s+\\/|del\\s+\\/f\\s+\\/q|Remove-Item\\s+-Recurse\\s+-Force|format\\s+[a-z]:|mkfs\\.|dd\\s+if=\\/dev\\/zero)', label: 'Destruction de fichiers', feedback: 'Cette commande peut supprimer ou écraser des données critiques.', severity: 'DANGER' },
  { key: 'danger.curl-bash', category: 'DANGER', matchType: 'REGEX', language: 'shell', pattern: '(?:curl|wget).*(?:\\||;).*(?:sh|bash|powershell|pwsh)', label: 'Téléchargement puis exécution', feedback: 'Télécharger puis exécuter une commande directement est très risqué.', severity: 'DANGER' },
  { key: 'danger.payload', category: 'DANGER', matchType: 'REGEX', language: 'generic', pattern: '(?:base64\\s+-d|atob\\(|btoa\\(|Buffer\\.from\\().*(?:\\||;).*(?:sh|bash|python|node|pwsh)', label: 'Charge utile masquée', feedback: 'Le décodage suivi d\'une exécution peut masquer un payload malveillant.', severity: 'DANGER' },
  { key: 'danger.fork-bomb', category: 'DANGER', matchType: 'REGEX', language: 'shell', pattern: ':\\(\\)\\s*\\{\\s*:\\|:&\\s*\\};:', label: 'Fork bomb', feedback: 'Cette charge utile peut saturer la machine en quelques secondes.', severity: 'DANGER' },
  { key: 'language.javascript', category: 'LANGUAGE_FEEDBACK', matchType: 'EXACT', language: 'javascript', pattern: 'javascript', label: 'Conseil JavaScript', feedback: 'JS/TS : évite eval, borne les boucles et préfère des gardes explicites avant toute récursion.', severity: 'INFO' },
  { key: 'language.python', category: 'LANGUAGE_FEEDBACK', matchType: 'EXACT', language: 'python', pattern: 'python', label: 'Conseil Python', feedback: 'Python : ajoute un cas de base aux fonctions récursives et évite les appels système non filtrés.', severity: 'INFO' },
  { key: 'language.sql', category: 'LANGUAGE_FEEDBACK', matchType: 'EXACT', language: 'sql', pattern: 'sql', label: 'Conseil SQL', feedback: 'SQL : privilégie les requêtes paramétrées et évite la concaténation directe de chaînes.', severity: 'INFO' },
  { key: 'language.shell', category: 'LANGUAGE_FEEDBACK', matchType: 'EXACT', language: 'shell', pattern: 'shell', label: 'Conseil Shell', feedback: 'Shell : vérifie chaque commande avant exécution, surtout si elle vient d\'une entrée utilisateur.', severity: 'INFO' },
  { key: 'language.html', category: 'LANGUAGE_FEEDBACK', matchType: 'EXACT', language: 'html', pattern: 'html', label: 'Conseil HTML', feedback: 'HTML/CSS : si du script est injecté, vérifie l\'assainissement des données avant rendu.', severity: 'INFO' },
  { key: 'language.java', category: 'LANGUAGE_FEEDBACK', matchType: 'EXACT', language: 'java', pattern: 'java', label: 'Conseil Java', feedback: 'Java : surveille les boucles sans sortie et les exécutions de commandes externes.', severity: 'INFO' },
  { key: 'language.cpp', category: 'LANGUAGE_FEEDBACK', matchType: 'EXACT', language: 'cpp', pattern: 'cpp', label: 'Conseil C++', feedback: 'C++ : surveille les accès mémoire, les boucles infinies et les appels système.', severity: 'INFO' },
  { key: 'language.generic', category: 'LANGUAGE_FEEDBACK', matchType: 'EXACT', language: 'generic', pattern: 'generic', label: 'Conseil générique', feedback: 'Bonne pratique : ajoute un cas de sortie clair, borne les itérations et valide toutes les entrées.', severity: 'INFO' },
] as const;

const DEFAULT_BANNED_WORDS = [
  // RACISM
  { word: 'nègre', category: 'racism' },
  { word: 'négresse', category: 'racism' },
  { word: 'nigger', category: 'racism' },
  { word: 'nigga', category: 'racism' },
  { word: 'bamboula', category: 'racism' },
  { word: 'bougnoule', category: 'racism' },
  { word: 'bicot', category: 'racism' },
  { word: 'chinetoc', category: 'racism' },
  { word: 'chinetoque', category: 'racism' },
  { word: 'macaque', category: 'racism' },
  { word: 'chink', category: 'racism' },
  { word: 'gook', category: 'racism' },
  { word: 'coon', category: 'racism' },

  // THREAT
  { word: 'tuer', category: 'threat' },
  { word: 'assassiner', category: 'threat' },
  { word: 'égorger', category: 'threat' },
  { word: 'bombe', category: 'threat' },
  { word: 'terroriste', category: 'threat' },
  { word: 'suicide', category: 'threat' },
  { word: 'pendre', category: 'threat' },
  { word: 'décapiter', category: 'threat' },
  { word: 'fusiller', category: 'threat' },
  { word: 'massacrer', category: 'threat' },
  { word: 'kill', category: 'threat' },
  { word: 'murder', category: 'threat' },
  { word: 'bomb', category: 'threat' },
  { word: 'terrorist', category: 'threat' },
  { word: 'explosif', category: 'threat' },
  { word: 'kamikaze', category: 'threat' },
  { word: 'k4mikaze', category: 'threat' },
  { word: 'kamikaz', category: 'threat' },
  { word: 'k4mikaz', category: 'threat' },
  { word: 'kamikase', category: 'threat' },
  { word: 'k4mikase', category: 'threat' },

  // SEXUAL
  { word: 'bite', category: 'sexual' },
  { word: 'chatte', category: 'sexual' },
  { word: 'salope', category: 'sexual' },
  { word: 'pute', category: 'sexual' },
  { word: 'pouffiasse', category: 'sexual' },
  { word: 'couille', category: 'sexual' },
  { word: 'couilles', category: 'sexual' },
  { word: 'pénis', category: 'sexual' },
  { word: 'penis', category: 'sexual' },
  { word: 'vagin', category: 'sexual' },
  { word: 'clitoris', category: 'sexual' },
  { word: 'sperme', category: 'sexual' },
  { word: 'branler', category: 'sexual' },
  { word: 'branlette', category: 'sexual' },
  { word: 'fellation', category: 'sexual' },
  { word: 'cunnilingus', category: 'sexual' },
  { word: 'sodomie', category: 'sexual' },
  { word: 'porno', category: 'sexual' },
  { word: 'porn', category: 'sexual' },
  { word: 'nude', category: 'sexual' },
  { word: 'nudes', category: 'sexual' },
  { word: 'hentai', category: 'sexual' },
  { word: 'pédophile', category: 'sexual' },
  { word: 'pedophile', category: 'sexual' },
  { word: 'zoophile', category: 'sexual' },
  { word: 'inceste', category: 'sexual' },
  { word: 'dick', category: 'sexual' },
  { word: 'pussy', category: 'sexual' },
  { word: 'whore', category: 'sexual' },
  { word: 'slut', category: 'sexual' },
  { word: 'cock', category: 'sexual' },
  { word: 'cunt', category: 'sexual' },
  { word: 'vagina', category: 'sexual' },
  { word: 'sperm', category: 'sexual' },
  { word: 'masturbate', category: 'sexual' },
  { word: 'blowjob', category: 'sexual' },

  // LGBTPHOBIA
  { word: 'pédé', category: 'lgbtphobia' },
  { word: 'pedé', category: 'lgbtphobia' },
  { word: 'tarlouze', category: 'lgbtphobia' },
  { word: 'tapette', category: 'lgbtphobia' },
  { word: 'goudou', category: 'lgbtphobia' },
  { word: 'gouine', category: 'lgbtphobia' },
  { word: 'faggot', category: 'lgbtphobia' },
  { word: 'tranny', category: 'lgbtphobia' },
  { word: 'homophobe', category: 'lgbtphobia' },
  { word: 'transphobe', category: 'lgbtphobia' },
  { word: 'fag', category: 'lgbtphobia' },
  { word: 'dyke', category: 'lgbtphobia' },

  // HATE
  { word: 'nazi', category: 'hate' },
  { word: 'hitler', category: 'hate' },
  { word: 'swastika', category: 'hate' },
  { word: 'fasciste', category: 'hate' },
  { word: 'fachiste', category: 'hate' },
  { word: 'antisémite', category: 'hate' },
  { word: 'antisemitic', category: 'hate' },
  { word: 'croix gammée', category: 'hate' },
  { word: 'ku klux klan', category: 'hate' },
  { word: 'kkk', category: 'hate' },
  { word: 'suprématiste', category: 'hate' },
  { word: 'supremacist', category: 'hate' },

  // INSULT
  { word: 'con', category: 'insult' },
  { word: 'connard', category: 'insult' },
  { word: 'connasse', category: 'insult' },
  { word: 'salopard', category: 'insult' },
  { word: 'fdp', category: 'insult' },
  { word: 'fils de pute', category: 'insult' },
  { word: 'merde', category: 'insult' },
  { word: 'enculé', category: 'insult' },
  { word: 'encule', category: 'insult' },
  { word: 'abruti', category: 'insult' },
  { word: 'débile', category: 'insult' },
  { word: 'debile', category: 'insult' },
  { word: 'mongol', category: 'insult' },
  { word: 'tocard', category: 'insult' },
  { word: 'crevard', category: 'insult' },
  { word: 'bâtard', category: 'insult' },
  { word: 'batard', category: 'insult' },
  { word: 'gogol', category: 'insult' },
  { word: 'bouffon', category: 'insult' },
  { word: 'asshole', category: 'insult' },
  { word: 'bastard', category: 'insult' },
  { word: 'motherfucker', category: 'insult' },
  { word: 'idiot', category: 'insult' },
  { word: 'retard', category: 'insult' },
  { word: 'dumbass', category: 'insult' },
  { word: 'jerk', category: 'insult' },
  { word: 'piece of shit', category: 'insult' },
];

async function main() {
  console.log(`🌱 Seeding ${DEFAULT_FEEDS.length} flux RSS pour le serveur ${guildId}...`);

  // Ensure guild exists
  await prisma.guild.upsert({
    where: { id: guildId },
    update: {},
    create: { id: guildId },
  });

  let created = 0;
  let skipped = 0;

  for (const feed of DEFAULT_FEEDS) {
    const existing = await prisma.feed.findFirst({ where: { guildId, url: feed.url } });
    if (existing) { skipped++; continue; }

    await prisma.feed.create({
      data: {
        guildId,
        name: feed.name,
        url: feed.url,
        category: feed.category,
        language: feed.language,
        enabled: true,
      },
    });
    created++;
    console.log(`  ✅ ${feed.name}`);
  }

  console.log(`\n🌱 Seeding ${DEFAULT_DEVELOPER_EXCUSES.length} excuses développeur...`);

  let excusesCreated = 0;
  let excusesSkipped = 0;

  for (const excuse of DEFAULT_DEVELOPER_EXCUSES) {
    const existing = await prisma.developerExcuse.findFirst({ where: { text: excuse, language: 'fr' } });
    if (existing) {
      excusesSkipped++;
      continue;
    }

    await prisma.developerExcuse.create({
      data: {
        text: excuse,
        language: 'fr',
      },
    });
    excusesCreated++;
    console.log(`  ✅ ${excuse}`);
  }

  console.log(`\n🌱 Seeding ${DEFAULT_DAILY_ALGO_PROBLEMS.length} problèmes de Daily Algo...`);

  let algoCreated = 0;
  let algoSkipped = 0;

  for (const problem of DEFAULT_DAILY_ALGO_PROBLEMS) {
    const existing = await prisma.dailyAlgoProblem.findFirst({ where: { title: problem.title, language: 'fr' } });
    if (existing) {
      algoSkipped++;
      continue;
    }

    await prisma.dailyAlgoProblem.create({
      data: {
        title: problem.title,
        description: problem.description,
        solution: problem.solution,
        difficulty: problem.difficulty,
        language: 'fr',
        functionName: problem.functionName,
        functionArgs: problem.functionArgs,
        unitTests: problem.unitTests,
        allowedLanguages: problem.allowedLanguages,
      },
    });
    algoCreated++;
    console.log(`  ✅ ${problem.title}`);
  }

  console.log(`\n🌱 Seeding ${DEFAULT_CODE_POLICE_RULES.length} règles de Police du code...`);

  let codePoliceCreated = 0;
  let codePoliceSkipped = 0;

  for (const rule of DEFAULT_CODE_POLICE_RULES) {
    const existing = await prisma.codePoliceRule.findUnique({ where: { key: rule.key } });
    if (existing) {
      codePoliceSkipped++;
      continue;
    }

    await prisma.codePoliceRule.create({
      data: {
        key: rule.key,
        guildId: null,
        category: rule.category,
        matchType: rule.matchType,
        language: rule.language,
        pattern: rule.pattern,
        label: rule.label,
        feedback: rule.feedback,
        severity: rule.severity,
        enabled: true,
      },
    });

    codePoliceCreated++;
    console.log(`  ✅ ${rule.label}`);
  }

  console.log(`\n🌱 Seeding ${DEFAULT_BANNED_WORDS.length} mots bannis globaux...`);

  let bannedWordsCreated = 0;
  let bannedWordsSkipped = 0;

  for (const item of DEFAULT_BANNED_WORDS) {
    const existing = await prisma.bannedWord.findFirst({
      where: {
        guildId: null,
        word: item.word,
      },
    });
    if (existing) {
      bannedWordsSkipped++;
      continue;
    }

    await prisma.bannedWord.create({
      data: {
        guildId: null,
        word: item.word,
        category: item.category,
        enabled: true,
      },
    });
    bannedWordsCreated++;
    console.log(`  ✅ [${item.category.toUpperCase()}] ${item.word}`);
  }

  console.log(`\n✨ Seed terminé : ${created} flux créés, ${skipped} ignorés, ${excusesCreated} excuses créées, ${excusesSkipped} excuses ignorées, ${algoCreated} problèmes d'algo créés, ${algoSkipped} problèmes ignorés, ${codePoliceCreated} règles de Police du code créées, ${codePoliceSkipped} ignorées, ${bannedWordsCreated} mots bannis globaux créés, ${bannedWordsSkipped} ignorés`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
