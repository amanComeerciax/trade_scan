require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function cleanDatabase() {
  console.log('🧹 Cleaning Database...');

  const prodCount = await prisma.companyProduct.deleteMany({});
  console.log(`✅ Deleted ${prodCount.count} records from CompanyProduct`);

  const compCount = await prisma.company.deleteMany({});
  console.log(`✅ Deleted ${compCount.count} records from Company`);

  const jobCount = await prisma.scrapeJob.deleteMany({}).catch(() => ({ count: 0 }));
  console.log(`✅ Deleted ${jobCount.count} records from ScrapeJob`);

  // Clear checkpoints
  const localAppData = process.env.LOCALAPPDATA || '';
  const checkpointFiles = [
    'TradeScan-checkpoint-0902.json',
    'TradeScan-checkpoint-0902-full.json',
    'TradeScan-checkpoint-0902-699.json',
  ];

  for (const file of checkpointFiles) {
    const fullPath = path.join(localAppData, file);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`✅ Cleared checkpoint: ${file}`);
    }
  }

  const remaining = await prisma.company.count();
  console.log(`\n🎉 Database Clean Complete! Total companies remaining in DB: ${remaining}`);

  await prisma.$disconnect();
}

cleanDatabase().catch(err => {
  console.error('❌ Error cleaning database:', err);
  process.exit(1);
});
