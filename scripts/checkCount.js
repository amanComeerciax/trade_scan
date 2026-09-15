const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const hs5208 = await p.companyProduct.count({ where: { hsCode: '5208' } });
  const hs0901 = await p.companyProduct.count({ where: { hsCode: '0901' } });
  const totalCompanies = await p.company.count();
  const total = await p.companyProduct.count();

  const withTrademapId = await p.company.count({ where: { trademapId: { not: null } } });
  const sample = await p.company.findFirst({
    where: { trademapId: { not: null } },
    select: { trademapId: true, name: true, country: true, city: true, website: true, activities: true },
  });

  console.log('\n========================================');
  console.log('📊 TradeScan Database Count');
  console.log('========================================');
  console.log(`HS 5208 (Cotton Fabric) : ${hs5208} companies`);
  console.log(`HS 0901 (Coffee)        : ${hs0901} companies`);
  console.log(`With TradeMap ID        : ${withTrademapId} companies`);
  console.log(`Total Unique Companies  : ${totalCompanies}`);
  console.log(`Total Records           : ${total}`);
  if (sample) {
    console.log('----------------------------------------');
    console.log('Latest Sample Record:');
    console.log(sample);
  }
  console.log('========================================\n');
  await p.$disconnect();
}

main().catch(e => { console.error(e); p.$disconnect(); });
