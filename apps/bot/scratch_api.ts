import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

async function testApi() {
  const access = await prisma.dashboardAccess.findFirst({
    where: { guildId: '1477350874740424986' }
  });
  
  if (!access) {
    console.error('No dashboard access found for this guild');
    return prisma.$disconnect();
  }
  
  console.log('Using userId:', access.userId);
  const token = jwt.sign({ userId: access.userId }, process.env.JWT_SECRET || 'fallback-secret-key', { expiresIn: '1h' });
  const url = 'http://localhost:8787/api/dashboard/guilds/1477350874740424986/tickets/cmpbmw41b001u6od0gz99mpfx';
  
  console.log('Fetching:', url);
  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Response body:', text);
  } catch (err) {
    console.error('Fetch failed:', err);
  } finally {
    prisma.$disconnect();
  }
}

testApi();
