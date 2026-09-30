const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const products = await prisma.companyProduct.findMany({
    where: { hsCode: { not: null } },
    select: { hsCode: true, companyId: true, productCategory: true }
  });
  const hsMap = {};
  for (const p of products) {
    if (!p.hsCode) continue;
    if (!hsMap[p.hsCode]) {
      hsMap[p.hsCode] = { hsCode: p.hsCode, companies: new Set(), productCategory: p.productCategory || 'HS ' + p.hsCode };
    }
    hsMap[p.hsCode].companies.add(p.companyId);
  }
  const result = Object.values(hsMap).map(h => ({
    hsCode: h.hsCode,
    productCategory: h.productCategory,
    companyCount: h.companies.size
  })).sort((a, b) => b.companyCount - a.companyCount);
  console.log(result);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
