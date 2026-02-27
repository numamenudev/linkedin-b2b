// backend/prisma/seed.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // DC-10: ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD are REQUIRED — no hardcoded fallbacks
  if (!process.env.ADMIN_EMAIL) {
    throw new Error('ADMIN_EMAIL environment variable is required for seeding');
  }
  if (!process.env.ADMIN_INITIAL_PASSWORD) {
    throw new Error('ADMIN_INITIAL_PASSWORD environment variable is required for seeding');
  }

  // 1. Create or update admin user (upsert by email, bcrypt cost=12)
  const passwordHash = await bcrypt.hash(process.env.ADMIN_INITIAL_PASSWORD, 12);

  const user = await prisma.user.upsert({
    where: { email: process.env.ADMIN_EMAIL },
    update: {},
    create: {
      email: process.env.ADMIN_EMAIL,
      passwordHash,
      name: 'NuMa',
    },
  });

  // 2. Create singleton Settings record with design defaults
  await prisma.settings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      reportEmail: 'daniel.dallapalma@gmail.com',
      reportEmailTime: '19:00',
      linkedinMode: 'free',
      timezone: 'Europe/Rome',
      morningJobTime: '09:00',
      middayJobTime: '11:30',
      afternoonJobTime: '14:00',
      eveningJobTime: '18:30',
      globalWeeklyConnectionLimit: 150,
      globalDailyConnectionLimit: 21,
      globalDailyMessageLimit: 25,
    },
  });

  // 3. DC-05: Create 3 Identity stubs with approvedByUser=false
  // fullContextPrompt is a placeholder — generated after document upload via Identity Builder
  const identityStubs = [
    {
      name: 'NuMa B2B Identity',
      personaName: 'numa_b2b',
      role: 'Business Development',
      company: 'NuovoMangiare',
      location: 'Italy',
      fullContextPrompt: 'Da completare con Identity Builder',
      toneProfile: {},
      companyContext: {},
      credibilityMarkers: {},
      doNotSay: {},
      approvedByUser: false,
    },
    {
      name: 'NuMa Investor Identity',
      personaName: 'numa_investor',
      role: 'Investment Relations',
      company: 'NuovoMangiare',
      location: 'Italy',
      fullContextPrompt: 'Da completare con Identity Builder',
      toneProfile: {},
      companyContext: {},
      credibilityMarkers: {},
      doNotSay: {},
      approvedByUser: false,
    },
    {
      name: 'NuMa AI Training Identity',
      personaName: 'ai_training',
      role: 'AI Solutions',
      company: 'NuovoMangiare',
      location: 'Italy',
      fullContextPrompt: 'Da completare con Identity Builder',
      toneProfile: {},
      companyContext: {},
      credibilityMarkers: {},
      doNotSay: {},
      approvedByUser: false,
    },
  ];

  const identities: { id: string }[] = [];
  for (const stub of identityStubs) {
    const identity = await prisma.identity.create({ data: stub });
    identities.push(identity);
  }

  // 4. DC-05: Create 3 Agent records
  // Weekly budget: NUMA-B2B=60, NUMA-INVESTOR=20, AI-TRAINING=70 (total=150 / LinkedIn weekly cap)
  // Daily approx:  9, 3, 10 (total=22, within global 21 cap — NUMA-B2B adjusted from 60/7≈9)
  const agentConfigs = [
    {
      name: 'NUMA-B2B',
      description: 'B2B outreach for NuovoMangiare restaurant solutions',
      status: 'paused', // All agents start paused — activate only after identity approval
      identityId: identities[0].id, // numa_b2b
      targetConfig: {}, // To be configured via Agent Wizard
      messagingConfig: {}, // To be configured via Agent Wizard
      weeklyConnectionRequests: 60,
      dailyConnectionRequests: 9,
      dailyMessages: 8,
      priority: 1,
    },
    {
      name: 'NUMA-INVESTOR',
      description: 'Investor relations and funding outreach',
      status: 'paused',
      identityId: identities[1].id, // numa_investor
      targetConfig: {},
      messagingConfig: {},
      weeklyConnectionRequests: 20,
      dailyConnectionRequests: 3,
      dailyMessages: 5,
      priority: 2,
    },
    {
      name: 'AI-TRAINING',
      description: 'AI training solutions outreach for food industry',
      status: 'paused',
      identityId: identities[2].id, // ai_training
      targetConfig: {},
      messagingConfig: {},
      weeklyConnectionRequests: 70,
      dailyConnectionRequests: 10,
      dailyMessages: 8,
      priority: 1,
    },
  ];

  for (const agentConfig of agentConfigs) {
    await prisma.agent.create({ data: agentConfig });
  }

  // 5. Final log with record counts
  const [userCount, settingsCount, identityCount, agentCount] = await Promise.all([
    prisma.user.count(),
    prisma.settings.count(),
    prisma.identity.count(),
    prisma.agent.count(),
  ]);

  console.log('Seed completed successfully:');
  console.log(`  Users:      ${userCount} (admin: ${user.email})`);
  console.log(`  Settings:   ${settingsCount} (singleton)`);
  console.log(`  Identities: ${identityCount} (numa_b2b, numa_investor, ai_training)`);
  console.log(`  Agents:     ${agentCount} (NUMA-B2B, NUMA-INVESTOR, AI-TRAINING)`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
