const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  console.log('🗑️  HS 5208 data delete ho raha hai...');
  const deleted = await p.companyProduct.deleteMany({ where: { hsCode: '5208' } });
  console.log(`   CompanyProduct records deleted: ${deleted.count}`);

  // Orphan companies bhi delete karo (jinke koi product nahi bacha)
  const orphans = await p.company.deleteMany({
    where: { products: { none: {} } },
  });
  console.log(`   Orphan companies deleted: ${orphans.count}`);

  const remaining = await p.company.count();
  console.log(`\n✅ Done! Remaining companies in DB: ${remaining}`);
  await p.$disconnect();
}

main().catch(e => { console.error(e); p.$disconnect(); });
