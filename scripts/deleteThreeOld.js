require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function del() {
  console.log('Connecting to:', process.env.DATABASE_URL);
  
  // Find them
  const toDelete = await prisma.company.findMany({
    where: {
      OR: [
        { name: { contains: 'Advance Export' } },
        { name: { contains: 'ACCURAMECH' } },
        { name: { contains: 'AGT FOODS' } }
      ]
    },
    include: { products: true }
  });

  console.log(`Found ${toDelete.length} old test records to remove.`);
  for (const c of toDelete) {
    for (const p of c.products) {
      await prisma.companyProduct.delete({ where: { id: p.id } }).catch(() => {});
    }
    await prisma.company.delete({ where: { id: c.id } }).catch(() => {});
    console.log(`✅ Permanently deleted: ${c.name}`);
  }

  // Also clear any product with hsCode 01
  const p01 = await prisma.companyProduct.deleteMany({ where: { hsCode: '01' } }).catch(() => {});
  console.log('Cleared remaining 01 products:', p01);

  const total = await prisma.company.count();
  console.log(`🎉 Cleanup complete! Total real companies in MongoDB Atlas: ${total}`);

  await prisma.$disconnect();
}

del().catch(err => {
  console.error(err);
  process.exit(1);
});
