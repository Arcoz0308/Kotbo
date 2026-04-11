
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const staff = await prisma.staffMember.findMany({
    orderBy: { grade: 'asc' }
  });
  console.log('Staff members in DB:');
  staff.forEach(s => {
    console.log(`- ${s.displayName || s.username} (Grade: ${s.grade}, ID: ${s.userId})`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
