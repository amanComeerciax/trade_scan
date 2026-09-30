const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('Finding products for HS 01 and HS 1006...');

  // Find all products matching HS 01, 0101, etc. and HS 1006
  const productsToDelete = await prisma.companyProduct.findMany({
    where: {
      OR: [
        { hsCode: { startsWith: '01' } },
        { hsCode: { startsWith: '1006' } },
      ],
    },
    select: { id: true, companyId: true, hsCode: true },
  });

  console.log(`Found ${productsToDelete.length} product lines to delete.`);
  const companyIds = [...new Set(productsToDelete.map((p) => p.companyId))];
  console.log(`Associated with ${companyIds.length} unique companies.`);

  // Delete product lines
  const deletedProducts = await prisma.companyProduct.deleteMany({
    where: {
      OR: [
        { hsCode: { startsWith: '01' } },
        { hsCode: { startsWith: '1006' } },
      ],
    },
  });
  console.log(`Deleted ${deletedProducts.count} companyProduct records.`);

  // Check if companies have other products remaining
  let deletedCompaniesCount = 0;
  for (const cId of companyIds) {
    const remainingProducts = await prisma.companyProduct.count({
      where: { companyId: cId },
    });
    if (remainingProducts === 0) {
      await prisma.company.delete({ where: { id: cId } }).catch(() => {});
      deletedCompaniesCount++;
    }
  }
  console.log(`Deleted ${deletedCompaniesCount} standalone companies that had no other commodities.`);

  // Verify remaining HS codes
  const remaining = await prisma.companyProduct.findMany({
    select: { hsCode: true },
    distinct: ['hsCode'],
  });
  console.log('Remaining HS Codes in DB:', remaining.map((r) => r.hsCode));
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
