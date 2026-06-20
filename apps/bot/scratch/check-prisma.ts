import prisma from '../src/utils/db.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

console.log("--- DIAGNOSTIC START ---");
console.log("Prisma instance exists:", !!prisma);
if (prisma) {
  const keys = Object.keys(prisma);
  console.log("Model keys on prisma:", keys.filter(k => !k.startsWith('_') && !k.startsWith('$')));
  console.log("Has sanctionTable:", 'sanctionTable' in prisma);
}
try {
  console.log("Resolved @prisma/client path:", require.resolve('@prisma/client'));
} catch (e: any) {
  console.log("Error resolving @prisma/client:", e.message);
}
console.log("--- DIAGNOSTIC END ---");
