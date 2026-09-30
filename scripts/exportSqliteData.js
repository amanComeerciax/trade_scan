const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function exportData() {
  console.log('📦 Exporting data from SQLite dev.db...');
  
  const companies = await prisma.company.findMany({
    include: {
      products: true,
    }
  });

  console.log(`✅ Found ${companies.length} companies with relational products in SQLite.`);

  const dumpPath = path.join(__dirname, '..', 'prisma', 'sqlite_dump.json');
  fs.writeFileSync(dumpPath, JSON.stringify(companies, null, 2), 'utf8');

  console.log(`💾 Dump successfully written to: ${dumpPath}`);
  console.log(`   File size: ${(fs.statSync(dumpPath).size / (1024 * 1024)).toFixed(2)} MB`);

  await prisma.$disconnect();
}

exportData().catch(err => {
  console.error('❌ Export failed:', err);
  process.exit(1);
});
