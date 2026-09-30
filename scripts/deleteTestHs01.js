const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const deletedProds = await prisma.companyProduct.deleteMany({
    where: { hsCode: '01' }
  });
  console.log(`Deleted ${deletedProds.count} companyProducts for HS 01`);

  const ids = [
    '6aad1cf23f85e87bc5f91ccc',
    '6aad1d013f85e87bc5f91cce',
    '6aad1d103f85e87bc5f91cd0'
  ];
  const deletedComps = await prisma.company.deleteMany({
    where: { id: { in: ids } }
  });
  console.log(`Deleted ${deletedComps.count} test companies`);
  
  const total = await prisma.company.count();
  console.log(`Remaining clean verified companies: ${total}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
