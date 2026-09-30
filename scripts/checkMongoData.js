const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const count = await prisma.company.count();
  const withPhone = await prisma.company.count({ where: { phone: { not: null } } });
  const withContact = await prisma.company.count({ where: { contactName: { not: null } } });
  const byFlow = await prisma.company.groupBy({
    by: ['tradeFlow'],
    _count: { id: true }
  });
  const sample = await prisma.company.findMany({
    take: 5,
    where: { contactName: { not: null } },
    select: { name: true, country: true, contactName: true, phone: true, tradeFlow: true, products: true }
  });
  console.log({ count, withPhone, withContact, byFlow, sample });
  await prisma.$disconnect();
}
check();
