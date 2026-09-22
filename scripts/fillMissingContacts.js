/**
 * 🔄 TradeScan Phone & Contact Auto-Filler
 * ================================================================
 * Ye script database ke un companies ko scan karegi jinka
 * Phone ya Contact Person missing reh gaya tha (jab token expire hua tha).
 * 
 * Har call par fresh Token use hoga taaki:
 *   - Na koi pause ho
 *   - Na browser me manual click karna pade
 * ================================================================
 */

require('dotenv').config();
const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const readline = require('readline');
const path = require('path');

const prisma = new PrismaClient();

const CONFIG = {
  PROFILE_DIR: path.join(process.env.LOCALAPPDATA || '', 'TradeScan-Scraper-Profile'),
  DELAY_MS: 250,
};

function ask(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(query, a => { rl.close(); r(a.trim()); }));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('\n' + '='.repeat(68));
  console.log('🔄 TradeScan Phone & Contact Auto-Filler');
  console.log('='.repeat(68));

  // Find all companies with missing phone or missing contact
  const missing = await prisma.company.findMany({
    where: {
      OR: [
        { phone: null },
        { contactName: null },
      ],
      trademapId: { not: null },
    },
    select: { id: true, trademapId: true, name: true, city: true, phone: true, contactName: true },
  });

  console.log(`📋 Total companies needing Phone / Contact fill: ${missing.length}`);
  if (missing.length === 0) {
    console.log('🎉 Sabhi companies ke paas already phone / contact hai!');
    await prisma.$disconnect();
    return;
  }

  console.log('🔄 Chrome browser launch ho raha hai...');
  const context = await chromium.launchPersistentContext(CONFIG.PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    args: ['--start-maximized'],
    viewport: null,
  });

  const page = await context.newPage();

  console.log('🌐 Connecting to TradeMap...');
  await page.goto('https://www.trademap.org/en/goods/companies/c/699/exports/p/0902', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  }).catch(() => {});
  await sleep(3000);

  console.log('\n👉 BROWSER OPEN HAI!');
  console.log('👉 Browser me login check karke ENTER dabayein:');
  await ask('');

  console.log('\n🚀 Starting Auto-Fill with Fresh Dynamic Token...\n');

  let filledCount = 0;
  let notAvailableCount = 0;

  for (let i = 0; i < missing.length; i++) {
    const comp = missing[i];
    process.stdout.write(`   ↳ [${i + 1}/${missing.length}] ${comp.name.substring(0, 32)}... `);

    // Fetch contact using DYNAMIC fresh token from sessionStorage
    const res = await page.evaluate(async (companyId) => {
      // 1. Get latest token dynamically
      let token = null;
      for (let j = 0; j < sessionStorage.length; j++) {
        const k = sessionStorage.key(j);
        const v = sessionStorage.getItem(k);
        if (v && v.includes('access_token')) {
          try {
            const p = JSON.parse(v);
            if (p.access_token) { token = p.access_token; break; }
          } catch {}
        }
      }

      try {
        const url = `https://www.trademap.org/api/companies/contact?companyId=${encodeURIComponent(companyId)}&sourceId=1`;
        const headers = {
          'Accept': 'application/json, text/plain, */*',
          'X-Requested-With': 'XMLHttpRequest',
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const r = await fetch(url, { headers, credentials: 'include' });
        if (!r.ok) return { error: r.status };
        return await r.json();
      } catch (e) {
        return { error: e.message };
      }
    }, comp.trademapId);

    if (res && !res.error && (res.phone || res.name)) {
      const updates = {};
      if (res.phone && !comp.phone) updates.phone = res.phone.trim();
      if (res.name && !comp.contactName) updates.contactName = res.name.trim();
      if (res.role) updates.contactRole = res.role.trim();

      if (Object.keys(updates).length > 0) {
        await prisma.company.update({
          where: { id: comp.id },
          data: updates,
        });
        filledCount++;
        const parts = [];
        if (updates.contactName) parts.push(`👤 ${updates.contactName}`);
        if (updates.phone) parts.push(`📞 ${updates.phone}`);
        console.log(`✅ FILLED (${parts.join(' | ')})`);
      } else {
        notAvailableCount++;
        console.log(`ℹ️ Already matched`);
      }
    } else {
      notAvailableCount++;
      console.log(`⚪ Not listed on TradeMap`);
    }

    await sleep(CONFIG.DELAY_MS);
  }

  console.log('\n' + '='.repeat(68));
  console.log('🎉 AUTO-FILL COMPLETE!');
  console.log(`   Newly Filled Phone/Contact : ${filledCount}`);
  console.log(`   Not Provided on TradeMap   : ${notAvailableCount}`);
  console.log('='.repeat(68) + '\n');

  await context.close().catch(() => {});
  await prisma.$disconnect();
}

main().catch(console.error);
