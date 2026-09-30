const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const hs01 = await prisma.companyProduct.findMany({
    where: { hsCode: '01' },
    include: { company: true }
  });
  console.log(`HS 01 count: ${hs01.length}`);
  for (const item of hs01) {
    console.log(`- [${item.company.id}] ${item.company.name} | ${item.company.country} | Phone: ${item.company.phone} | Contact: ${item.company.contactPerson}`);
  }

  const totalCompanies = await prisma.company.count();
  console.log(`Total companies in DB: ${totalCompanies}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
