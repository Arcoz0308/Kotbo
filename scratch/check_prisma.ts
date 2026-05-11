import prisma from '../apps/bot/src/utils/db.js';

console.log('Prisma keys:', Object.keys(prisma).filter(k => !k.startsWith('_')));
console.log('GlobalAdmin:', !!(prisma as any).globalAdmin);
console.log('GlobalBlacklist:', !!(prisma as any).globalBlacklist);
console.log('BotErrorLog:', !!(prisma as any).botErrorLog);
console.log('BotGlobalConfig:', !!(prisma as any).botGlobalConfig);
process.exit(0);
