require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanDummy() {
  // Delete dummy HS 01 test records
  const delProd = await prisma.companyProduct.deleteMany({
    where: { hsCode: '01' }
  });
  const delComp = await prisma.company.deleteMany({
    where: {
      name: {
        in: [
          'AGT FOODS INDIA PRIVATE LIMITED',
          'Advance Export Private Limited',
          'ACCURAMECH INDUSTRIAL ENGINEERING PRIVATE LIMITED'
        ]
      }
    }
  });
  console.log(`Cleaned ${delComp.count} dummy companies and ${delProd.count} dummy products.`);
  await prisma.$disconnect();
}
cleanDummy();
