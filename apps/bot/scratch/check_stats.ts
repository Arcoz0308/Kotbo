
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    const stats = await prisma.guildDailyStat.findMany({
      orderBy: { dateKey: 'desc' },
      take: 5
    });
    console.log('Last 5 Daily Stats:', JSON.stringify(stats, null, 2));
    
    const hourly = await prisma.guildHourlyStat.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    console.log('Last 5 Hourly Stats:', JSON.stringify(hourly, null, 2));
  } catch (e) {
    console.error('DB Error:', e);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
