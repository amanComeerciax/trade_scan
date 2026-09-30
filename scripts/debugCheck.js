require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const prods = await prisma.companyProduct.findMany({
    where: { hsCode: '01' },
    include: { company: true }
  });
  console.log('Products with hsCode 01:', prods.map(p => ({
    prodId: p.id,
    companyId: p.companyId,
    companyName: p.company?.name
  })));

  // Delete them cleanly
  for (const p of prods) {
    await prisma.companyProduct.delete({ where: { id: p.id } }).catch(() => {});
    if (p.companyId) {
      await prisma.company.delete({ where: { id: p.companyId } }).catch(() => {});
    }
  }

  const remaining = await prisma.company.count();
  console.log('Remaining companies in Mongo:', remaining);
  await prisma.$disconnect();
}
run();
