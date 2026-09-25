require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.company.count();
  console.log('COMPANY COUNT IN PRISMA:', count);
  const collections = await prisma.$runCommandRaw({ listCollections: 1 });
  console.log('COLLECTIONS:', collections);
  await prisma.$disconnect();
}

main().catch(console.error);
