import * as fs from 'fs';

const content = fs.readFileSync('packages/database/prisma/schema.prisma', 'utf8');
const lines = content.split('\n');

function printModel(name: string) {
  let inside = false;
  let braces = 0;
  for (const line of lines) {
    if (line.trim().startsWith(`model ${name} `) || line.trim() === `model ${name} {`) {
      inside = true;
      console.log(`--- Model: ${name} ---`);
    }
    if (inside) {
      console.log(line);
      if (line.includes('{')) braces++;
      if (line.includes('}')) braces--;
      if (braces === 0 && line.includes('}')) {
        inside = false;
      }
    }
  }
}

printModel('DashboardFeatureConfig');
printModel('DashboardFeatureRoleAccess');
printModel('DashboardRoleAccess');
printModel('NotificationTarget');
