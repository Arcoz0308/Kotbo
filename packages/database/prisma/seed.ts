import { PrismaClient } from '@prisma/client';


const prisma = new PrismaClient();

const GUILD_ID = process.env.GUILD_ID;
if (!GUILD_ID) {
  console.error('❌ GUILD_ID non défini dans .env');
  process.exit(1);
}

const guildId: string = GUILD_ID;

const DEFAULT_FEEDS = [
  // 🇫🇷 Tech FR
  { name: 'Presse-Citron', url: 'https://www.presse-citron.net/feed/', category: 'Tech FR', language: 'fr' },
  { name: 'Le Journal du Geek', url: 'https://www.journaldugeek.com/feed/', category: 'Tech FR', language: 'fr' },
  { name: 'Numerama', url: 'https://www.numerama.com/feed/', category: 'Tech FR', language: 'fr' },
  { name: 'Next (ex-Next INpact)', url: 'https://next.ink/feed/', category: 'Tech FR', language: 'fr' },
  { name: "L'Usine Digitale", url: 'https://www.usine-digitale.fr/rss', category: 'Tech FR', language: 'fr' },

  // 🌍 Tech EN
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'Tech EN', language: 'en' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'Tech EN', language: 'en' },
  { name: 'Ars Technica', url: 'http://feeds.arstechnica.com/arstechnica/index', category: 'Tech EN', language: 'en' },
  { name: 'Wired', url: 'https://www.wired.com/feed/rss', category: 'Tech EN', language: 'en' },
  { name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'Tech EN', language: 'en' },

  // 🛡️ Cybersécurité
  { name: 'Korben', url: 'https://korben.info/feed', category: 'Cybersécurité', language: 'fr' },
  { name: 'LeMagIT Sécurité', url: 'https://www.lemagit.fr/rss/Securite.xml', category: 'Cybersécurité', language: 'fr' },
  { name: 'CNIL', url: 'https://www.cnil.fr/fr/rss.xml', category: 'Cybersécurité', language: 'fr' },
  { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', category: 'Cybersécurité', language: 'en' },

  // 🤖 IA & Dev
  { name: 'OpenAI Blog', url: 'https://openai.com/news/rss', category: 'IA & Dev', language: 'en' },
  { name: 'Google News AI', url: 'https://news.google.com/rss/search?q=Artificial+Intelligence', category: 'IA & Dev', language: 'en' },
  { name: 'Baeldung', url: 'https://www.baeldung.com/feed', category: 'IA & Dev', language: 'en' },
  { name: 'GitHub Blog', url: 'https://github.blog/feed/', category: 'IA & Dev', language: 'en' },

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

  console.log(`\n✨ Seed terminé : ${created} flux créés, ${skipped} ignorés, ${excusesCreated} excuses créées, ${excusesSkipped} excuses ignorées`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
