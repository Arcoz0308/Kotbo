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
  { name: 'LeMagIT (Sécurité)', url: 'https://www.lemagit.fr/rss/Securite.xml', category: 'Cybersécurité & Open Source', language: 'fr' },
  { name: 'CNIL (Actus)', url: 'https://www.cnil.fr/fr/rss.xml', category: 'Cybersécurité & Open Source', language: 'fr' },
  { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', category: 'Cybersécurité & Open Source', language: 'en' },

  // 🤖 Intelligence Artificielle & Dev
  { name: 'OpenAI Blog', url: 'https://openai.com/news/rss', category: 'Intelligence Artificielle & Dev', language: 'en' },
  { name: 'Google News (AI)', url: 'https://news.google.com/rss/search?q=Artificial+Intelligence', category: 'Intelligence Artificielle & Dev', language: 'en' },
  { name: 'Baeldung (Dev)', url: 'https://www.baeldung.com/feed', category: 'Intelligence Artificielle & Dev', language: 'en' },
  { name: 'GitHub Blog', url: 'https://github.blog/feed/', category: 'Intelligence Artificielle & Dev', language: 'en' },

  // 💻 Hardware & Gaming
  { name: 'CowcotLand', url: 'https://www.cowcotland.com/news.rss', category: 'Hardware & Gaming', language: 'fr' },
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
  },
  {
    title: 'Fibonacci',
    description: 'Implémente une fonction qui retourne le Nième nombre de Fibonacci de manière efficace.',
    solution: 'Utilise la programmation dynamique ou la récursion avec mémoïsation pour éviter les recalculs.',
    difficulty: 'moyen',
  },
  {
    title: 'Vérifier un palindrome',
    description: 'Écris une fonction pour vérifier si une chaîne est un palindrome (ignore les espaces et la casse).',
    solution: 'Compare la chaîne avec sa version inversée après normalisation.',
    difficulty: 'facile',
  },
  {
    title: 'Deux sommes',
    description: 'Trouve deux nombres dans un tableau qui s\'additionnent pour égaler une cible.',
    solution: 'Utilise une Map/Set pour stocker les nombres vus et trouve le complément en O(n).',
    difficulty: 'moyen',
  },
  {
    title: 'Parenthèses valides',
    description: 'Vérifie si une chaîne de parenthèses/crochets/accolades est correctement équilibrée.',
    solution: 'Utilise une pile (stack) pour tracker les ouvertures et vérifier les fermetures.',
    difficulty: 'moyen',
  },
  {
    title: 'Nombre premier',
    description: 'Crée une fonction pour vérifier si un nombre donné est un nombre premier.',
    solution: 'Vérifie les diviseurs jusqu\'à la racine carrée du nombre.',
    difficulty: 'facile',
  },
  {
    title: 'Maximum de tableau',
    description: 'Trouve l\'élément maximum dans un tableau sans utiliser Math.max().',
    solution: 'Parcours le tableau en gardant trace du maximum rencontré.',
    difficulty: 'facile',
  },
  {
    title: 'Fusionner deux tableaux triés',
    description: 'Fusionne deux tableaux triés en un seul tableau trié en O(n + m).',
    solution: 'Utilise deux pointeurs pour comparer et ajouter le plus petit élément en priorité.',
    difficulty: 'moyen',
  },
  {
    title: 'Anagrammes',
    description: 'Détermine si deux chaînes sont des anagrammes (même lettres, ordre différent).',
    solution: 'Compare les fréquences de caractères ou les chaînes triées.',
    difficulty: 'facile',
  },
  {
    title: 'Sous-tableau avec somme max',
    description: 'Trouve la somme maximale d\'un sous-tableau contigu (Kadane\'s algorithm).',
    solution: 'Utilise la programmation dynamique pour tracker la somme locale et globale.',
    difficulty: 'difficile',
  },
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
      },
    });
    algoCreated++;
    console.log(`  ✅ ${problem.title}`);
  }

  console.log(`\n✨ Seed terminé : ${created} flux créés, ${skipped} ignorés, ${excusesCreated} excuses créées, ${excusesSkipped} excuses ignorées, ${algoCreated} problèmes d'algo créés, ${algoSkipped} problèmes ignorés`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
