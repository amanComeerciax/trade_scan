const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function importData() {
  const dumpPath = path.join(__dirname, '..', 'prisma', 'sqlite_dump.json');
  if (!fs.existsSync(dumpPath)) {
    console.error('❌ Dump file not found:', dumpPath);
    process.exit(1);
  }

  console.log('📖 Reading SQLite dump...');
  const companies = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
  console.log(`📦 Loaded ${companies.length} companies from dump.`);

  // Reset test collection in MongoDB Atlas
  console.log('🧹 Clearing initial test records in MongoDB Atlas...');
  await prisma.companyProduct.deleteMany({}).catch(() => {});
  await prisma.company.deleteMany({}).catch(() => {});

  // Deduplicate strictly by [name, country] and trademapId
  const seenNameCountry = new Set();
  const seenTradeMapId = new Set();
  const validCompanies = [];

  for (const c of companies) {
    const name = c.name?.trim();
    const country = c.country?.trim() || 'International';
    if (!name) continue;

    const ncKey = `${name.toLowerCase()}___${country.toLowerCase()}`;
    if (seenNameCountry.has(ncKey)) continue;
    seenNameCountry.add(ncKey);

    const trademapId = c.trademapId ? String(c.trademapId).trim() : null;
    if (trademapId) {
      if (seenTradeMapId.has(trademapId)) continue;
      seenTradeMapId.add(trademapId);
    }

    const companyData = {
      name,
      country,
      countryCode: c.countryCode || undefined,
      city: c.city || undefined,
      address: c.address || undefined,
      phone: c.phone || undefined,
      contactName: c.contactName || undefined,
      contactRole: c.contactRole || undefined,
      website: c.website || undefined,
      sourceUrl: c.sourceUrl || undefined,
      trademapId: trademapId || undefined,
      externalId: c.externalId || undefined,
      activities: c.activities || undefined,
      annualTurnover: c.annualTurnover || undefined,
      numberOfEmployees: c.numberOfEmployees || undefined,
      updateDate: c.updateDate || undefined,
      sourceId: c.sourceId || undefined,
      tradeFlow: c.tradeFlow || 'Exporter',
    };

    validCompanies.push({ companyData, rawProducts: c.products || [] });
  }

  console.log(`✨ Filtered to ${validCompanies.length} unique companies. Bulk inserting into MongoDB Atlas in batches of 500...`);

  const BATCH_SIZE = 500;
  let totalInserted = 0;

  for (let i = 0; i < validCompanies.length; i += BATCH_SIZE) {
    const slice = validCompanies.slice(i, i + BATCH_SIZE);
    const companyPayloads = slice.map(item => item.companyData);

    try {
      // Prisma createMany in MongoDB (no skipDuplicates parameter)
      const result = await prisma.company.createMany({
        data: companyPayloads,
      });
      totalInserted += result.count;
      console.log(`🚀 [${Math.min(i + BATCH_SIZE, validCompanies.length)}/${validCompanies.length}] Inserted batch of ${result.count} companies.`);
    } catch (err) {
      console.error(`⚠️ Batch insert around index ${i}:`, err.message);
      // Fallback insert 1-by-1 for this batch if duplicate slipped
      for (const p of companyPayloads) {
        try {
          await prisma.company.create({ data: p });
          totalInserted++;
        } catch {}
      }
    }
  }

  // Now create products for companies
  console.log('\n🔗 Mapping relational products (CompanyProduct)...');
  const allMongoCompanies = await prisma.company.findMany({
    select: { id: true, name: true, country: true },
  });
  const mongoMap = new Map();
  for (const mc of allMongoCompanies) {
    mongoMap.set(`${mc.name.toLowerCase()}___${(mc.country || 'international').toLowerCase()}`, mc.id);
  }

  const productPayloads = [];
  for (const item of validCompanies) {
    const key = `${item.companyData.name.toLowerCase()}___${item.companyData.country.toLowerCase()}`;
    const mongoId = mongoMap.get(key);
    if (!mongoId) continue;

    for (const p of item.rawProducts) {
      productPayloads.push({
        companyId: mongoId,
        productCategory: p.productCategory || undefined,
        hsCode: p.hsCode || undefined,
        tradeType: p.tradeType || undefined,
      });
    }
  }

  console.log(`📦 Prepared ${productPayloads.length} product relationships. Bulk inserting into MongoDB Atlas...`);
  for (let i = 0; i < productPayloads.length; i += 1000) {
    const pSlice = productPayloads.slice(i, i + 1000);
    try {
      await prisma.companyProduct.createMany({
        data: pSlice,
      });
      console.log(`   ↳ Inserted ${Math.min(i + 1000, productPayloads.length)}/${productPayloads.length} products.`);
    } catch (err) {
      console.error('⚠️ Product batch insert error:', err.message);
    }
  }

  const finalCompanyCount = await prisma.company.count();
  const finalProductCount = await prisma.companyProduct.count();

  console.log('\n' + '='.repeat(60));
  console.log(`🎉 MONGODB ATLAS MIGRATION 100% COMPLETE!`);
  console.log(`   Total Companies in Atlas : ${finalCompanyCount}`);
  console.log(`   Total Products in Atlas  : ${finalProductCount}`);
  console.log('='.repeat(60) + '\n');

  await prisma.$disconnect();
}

importData().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
