require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const all01 = await prisma.company.findMany({
    where: {
      products: { some: { hsCode: '01' } }
    },
    include: { products: true }
  });
  console.log('Count with hs 01:', all01.length);
  for (const c of all01) {
    console.log('Found:', c.id, c.name, c.products.map(p => p.id));
    for (const p of c.products) {
      await prisma.companyProduct.delete({ where: { id: p.id } });
    }
    await prisma.company.delete({ where: { id: c.id } });
    console.log('Deleted:', c.id);
  }
  const totalAfter = await prisma.company.count();
  console.log('Total companies now:', totalAfter);
  await prisma.$disconnect();
}
check();
