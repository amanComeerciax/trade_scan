const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function check() {
  const c = await p.company.findFirst({
    where: { name: { contains: 'A To Z Exports' } },
  });
  console.log('Company in DB:', c);

  const anyWithoutPhone = await p.company.findMany({
    where: { phone: null },
    take: 5,
    select: { id: true, trademapId: true, name: true, city: true, contactName: true, phone: true }
  });
  console.log('\n5 Samples without phone:');
  console.log(anyWithoutPhone);

  await p.$disconnect();
}

check().catch(console.error);
