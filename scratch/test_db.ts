import { updateRoleAccess } from '../apps/bot/src/services/core/dashboardManagementService.js';
import prisma from '../apps/bot/src/utils/db.js';

async function main() {
  console.log('Fetching all guilds...');
  const guilds = await prisma.guild.findMany();

  for (const guild of guilds) {
    console.log(`\n--- Guild: ${guild.id} ---`);
    const configs = await prisma.dashboardFeatureConfig.findMany({
      where: { guildId: guild.id },
    });

    const meetingsConfig = configs.find(c => c.featureKey === 'meetings');
    if (meetingsConfig) {
      console.log(`Found meetings config: ${meetingsConfig.id}`);
      try {
        const result = await updateRoleAccess(guild.id, meetingsConfig.id, [
          { roleId: '123456789', canView: true, canModerate: true }
        ]);
        console.log('Success for guild', guild.id);
      } catch (e) {
        console.error(`FAILED for guild ${guild.id}:`, e);
      }
    } else {
      console.log(`No meetings config for guild ${guild.id}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
