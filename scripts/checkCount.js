const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const total = await p.company.count();
  const hs0902 = await p.companyProduct.count({ where: { hsCode: '0902' } });
  const hs0910 = await p.companyProduct.count({ where: { hsCode: '0910' } });
  const withPhone = await p.company.count({ where: { phone: { not: null } } });
  const withContact = await p.company.count({ where: { contactName: { not: null } } });
  const withoutPhone = await p.company.count({ where: { phone: null } });

  console.log('\n========================================');
  console.log('📊 Current Database Status');
  console.log('========================================');
  console.log(`Total Companies in DB     : ${total}`);
  console.log(`HS 0902 Linked Companies  : ${hs0902}`);
  console.log(`HS 0910 Linked Companies  : ${hs0910}`);
  console.log(`Companies WITH Phone      : ${withPhone}`);
  console.log(`Companies WITH Contact    : ${withContact}`);
  console.log(`Companies WITHOUT Phone   : ${withoutPhone}`);
  console.log('========================================\n');

  const sampleWithPhone = await p.company.findFirst({
    where: { phone: { not: null } },
    select: { name: true, city: true, contactName: true, contactRole: true, phone: true }
  });
  console.log('Sample with Phone & Contact:');
  console.log(sampleWithPhone);

  await p.$disconnect();
}

main().catch(e => { console.error(e); p.$disconnect(); });
