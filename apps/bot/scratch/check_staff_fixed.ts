import { prisma } from '../src/utils/db';

async function main() {
  const staff = await prisma.staffMember.findMany({
    orderBy: { grade: 'asc' }
  });
  console.log(`Found ${staff.length} staff members in DB:`);
  staff.forEach(s => {
    console.log(`- ${s.displayName || s.username} (Grade: ${s.grade}, ID: ${s.userId}, Guild: ${s.guildId})`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
