const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  await prisma.scrapeJob.updateMany({
    where: { status: 'RUNNING' },
    data: { status: 'CANCELLED' }
  });
  const count = await prisma.company.count();
  console.log(`Database ready. Total verified companies in Atlas: ${count}`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
