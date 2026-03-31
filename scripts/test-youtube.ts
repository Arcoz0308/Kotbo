import dotenv from 'dotenv';
import path from 'path';
import Parser from 'rss-parser';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const parser = new Parser({ timeout: 10000 });
const { PrismaClient } = await import('../node_modules/.prisma/client/index.js');
const prisma = new PrismaClient();

async function testYouTube() {
  const ytChannelId = process.env.NATHAN_YOUTUBE_CHANNEL_ID;
  const guildId = process.env.GUILD_ID;

  console.log('🔍 Vérification de la configuration YouTube...');
  console.log('-------------------------------------------');

  if (!ytChannelId) {
    console.error('❌ NATHAN_YOUTUBE_CHANNEL_ID est manquant dans le .env');
  } else {
    console.log(`✅ ID YouTube trouvé : ${ytChannelId}`);
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${ytChannelId}`;
    console.log(`📡 Tentative de récupération du flux : ${feedUrl}`);

    try {
      const feed = await parser.parseURL(feedUrl);
      console.log(`✅ Connexion réussie à la chaîne : ${feed.title}`);
      console.log(`📺 Dernières vidéos trouvées :`);
      
      const items = (feed.items ?? []).slice(0, 5);
      if (items.length === 0) {
        console.warn('⚠️ Aucune vidéo trouvée sur cette chaîne.');
      } else {
        items.forEach((item, i) => {
          console.log(`  ${i + 1}. [${item.pubDate}] ${item.title} (${item.link})`);
        });
      }
    } catch (err) {
      console.error(`❌ Erreur lors de la récupération du flux YouTube :`, err);
    }
  }

  console.log('\n🔍 Vérification de la base de données...');
  console.log('---------------------------------------');

  if (!guildId) {
    console.error('❌ GUILD_ID est manquant dans le .env');
  } else {
    try {
      const guild = await prisma.guild.findUnique({ where: { id: guildId } });
      if (!guild) {
        console.error(`❌ La guilde ${guildId} n'est pas encore enregistrée en base de données.`);
        console.log(`💡 Note : Lance le bot une fois ou utilise /setup dans Discord.`);
      } else {
        console.log(`✅ Guilde ${guildId} trouvée en base.`);
        console.log(`📺 YouTube Activé : ${guild.youtubeEnabled ? '🟢 Oui' : '🔴 Non'}`);
        console.log(`🆔 ID YouTube en base : ${guild.nathanYtChannelId ?? '❌ Aucun'}`);
        
        if (guild.nathanYtChannelId !== ytChannelId) {
          console.warn(`⚠️ L'ID dans le .env ne correspond pas à celui en base de données.`);
        }
      }
    } catch (err) {
      console.error(`❌ Erreur lors de l'accès à la base de données :`, err);
    }
  }

  await prisma.$disconnect();
  console.log('-------------------------------------------');
  console.log('Vérification terminée.');
}

testYouTube();
