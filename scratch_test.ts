import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
  const ticket = await prisma.ticket.findUnique({
    where: { id: 'cmpbmw41b001u6od0gz99mpfx' }
  });
  console.log('Ticket:', ticket);
  try {
    JSON.stringify(ticket);
    console.log('Ticket stringify OK');
  } catch (err) {
    console.error('Ticket stringify error:', err);
  }
}

test().catch(console.error).finally(() => prisma.$disconnect());
