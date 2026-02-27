import 'dotenv/config';
import { PrismaClient } from './src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  try {
    const user = await prisma.user.findUnique({ where: { email: 'admin@linkedin-platform.com' } });
    console.log('User found:', user ? user.email : 'NOT FOUND');
    if (user) {
      const match = await bcrypt.compare('Admin123!', user.passwordHash);
      console.log('Password match:', match);
    }
  } catch (e) {
    console.error('ERROR:', e);
  }
  await prisma.$disconnect();
}
main();
