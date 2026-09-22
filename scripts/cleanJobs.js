const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const jobs = await prisma.scrapeJob.findMany({
    orderBy: { startedAt: 'desc' },
    take: 5
  });
  console.log('Recent jobs:', JSON.stringify(jobs.map(j => ({ id: j.id, status: j.status, target: j.target, recordsFound: j.recordsFound, startedAt: j.startedAt })), null, 2));
  const running = await prisma.scrapeJob.findMany({ where: { status: 'RUNNING' } });
  if (running.length > 0) {
    await prisma.scrapeJob.updateMany({
      where: { status: 'RUNNING' },
      data: { status: 'CANCELLED' }
    });
    console.log('Cleaned up running jobs count:', running.length);
  } else {
    console.log('No jobs currently in RUNNING status.');
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());