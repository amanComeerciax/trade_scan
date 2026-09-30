const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const products = await prisma.companyProduct.findMany({
    where: { hsCode: { startsWith: '0101' } },
    include: { company: true }
  });
  console.log('Total products for 0101:', products.length);
  const companyIds = new Set(products.map(p => p.companyId));
  console.log('Unique company IDs in products:', companyIds.size);
  const companies = await prisma.company.findMany({
    where: { id: { in: [...companyIds] } }
  });
  console.log('Existing companies in DB:', companies.length);
  
  const orphans = products.filter(p => !p.company);
  console.log('Orphan products (no company relation):', orphans.length);

  const compMap = {};
  products.forEach(p => {
    compMap[p.companyId] = (compMap[p.companyId] || 0) + 1;
  });
  const multiples = Object.entries(compMap).filter(([id, count]) => count > 1);
  console.log('Companies with multiple 0101 product lines:', multiples.length);
  for (const [id, count] of multiples) {
    const comp = companies.find(c => c.id === id);
    console.log(`- Company "${comp?.name}" (ID: ${id}) has ${count} product lines for 0101`);
  }
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
