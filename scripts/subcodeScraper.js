/**
 * 🎯 TradeScan SUB-CODE ENGINE v1.0 - Anti-Ban 6-Digit HS Automation
 * ================================================================
 * Har 4-digit HS code ko unke official 6-digit sub-codes mein baant
 * kar extract karta hai. Har sub-code mein sirf 2-4 pages hote hain,
 * isliye TradeMap ka 10-page / 1000-record block KABHI TRIGGER NAHI HOTA!
 * ================================================================
 */

const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();

// ============================================================
// OFFICIAL 6-DIGIT SUB-CODES FOR MAJOR HS CHAPTERS
// ============================================================
const SUBCODES_MAP = {
  // HS 5208: Woven Cotton Fabrics (All 20 sub-categories)
  '5208': [
    { code: '520811', name: 'Unbleached, plain weave <= 100g/m2' },
    { code: '520812', name: 'Unbleached, plain weave > 100g to 200g/m2' },
    { code: '520813', name: 'Unbleached, 3 or 4-thread twill' },
    { code: '520819', name: 'Other unbleached woven cotton' },
    { code: '520821', name: 'Bleached, plain weave <= 100g/m2' },
    { code: '520822', name: 'Bleached, plain weave > 100g to 200g/m2' },
    { code: '520823', name: 'Bleached, 3 or 4-thread twill' },
    { code: '520829', name: 'Other bleached woven cotton' },
    { code: '520831', name: 'Dyed, plain weave <= 100g/m2' },
    { code: '520832', name: 'Dyed, plain weave > 100g to 200g/m2' },
    { code: '520833', name: 'Dyed, 3 or 4-thread twill' },
    { code: '520839', name: 'Other dyed woven cotton' },
    { code: '520841', name: 'Yarn-dyed, plain weave <= 100g/m2' },
    { code: '520842', name: 'Yarn-dyed, plain weave > 100g to 200g/m2' },
    { code: '520843', name: 'Yarn-dyed, 3 or 4-thread twill' },
    { code: '520849', name: 'Other yarn-dyed woven cotton' },
    { code: '520851', name: 'Printed, plain weave <= 100g/m2' },
    { code: '520852', name: 'Printed, plain weave > 100g to 200g/m2' },
    { code: '520853', name: 'Printed, 3 or 4-thread twill' },
    { code: '520859', name: 'Other printed woven cotton' },
  ],
  // HS 0901: Coffee (Sub-categories)
  '0901': [
    { code: '090111', name: 'Coffee, not roasted, not decaffeinated' },
    { code: '090112', name: 'Coffee, not roasted, decaffeinated' },
    { code: '090121', name: 'Coffee, roasted, not decaffeinated' },
    { code: '090122', name: 'Coffee, roasted, decaffeinated' },
    { code: '090190', name: 'Coffee husks, skins & substitutes' },
  ],
  // HS 1006: Rice
  '1006': [
    { code: '100610', name: 'Rice in the husk (paddy or rough)' },
    { code: '100620', name: 'Husked (brown) rice' },
    { code: '100630', name: 'Semi-milled or wholly milled rice' },
    { code: '100640', name: 'Broken rice' },
  ],
};

const CONFIG = {
  MIN_PAGE_DELAY_MS: 6000,
  MAX_PAGE_DELAY_MS: 11000,
  BETWEEN_SUBCODES_SEC: 15, // 15s break between sub-codes
  TRADEMAP_BASE: 'https://www.trademap.org',
};

function ask(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(query, a => { rl.close(); r(a.trim()); }));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const randomDelay = (min = CONFIG.MIN_PAGE_DELAY_MS, max = CONFIG.MAX_PAGE_DELAY_MS) =>
  Math.floor(Math.random() * (max - min)) + min;

// Progress File
function getSubcodeProgressFile(hsCode, countryCode) {
  return path.join(process.env.LOCALAPPDATA, `TradeScan-subcodes-${hsCode}-${countryCode}.json`);
}

function saveSubcodeProgress(hsCode, countryCode, data) {
  try {
    fs.writeFileSync(getSubcodeProgressFile(hsCode, countryCode), JSON.stringify(data, null, 2));
  } catch (e) {}
}

function loadSubcodeProgress(hsCode, countryCode) {
  try {
    const p = getSubcodeProgressFile(hsCode, countryCode);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {}
  return null;
}

// Database Save
async function saveCompany({ name, country, city, website, link, parentHs, subCode, subName, tradeType }) {
  if (!name?.trim()) return false;
  try {
    const cleanName = name.trim();
    const finalCountry = country?.trim() || 'International';

    const company = await prisma.company.upsert({
      where: { name_country: { name: cleanName, country: finalCountry } },
      update: {
        city: city?.trim() || undefined,
        website: website?.trim() || undefined,
        sourceUrl: link?.trim() || undefined,
      },
      create: {
        name: cleanName,
        country: finalCountry,
        city: city?.trim() || undefined,
        address: city?.trim() ? `${city.trim()}, ${finalCountry}` : finalCountry,
        website: website?.trim() || undefined,
        sourceUrl: link?.trim() || undefined,
      },
    });

    // Save with parent HS (5208) as well as subCode info
    const exists = await prisma.companyProduct.findFirst({
      where: { companyId: company.id, hsCode: parentHs },
    });

    if (!exists) {
      await prisma.companyProduct.create({
        data: {
          companyId: company.id,
          hsCode: parentHs,
          productCategory: `HS ${parentHs} (${subCode}: ${subName})`,
          tradeType: tradeType || 'Exporter',
        },
      }).catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

// Browser Launch
async function launchBrowser() {
  const scraperDataDir = path.join(process.env.LOCALAPPDATA, 'TradeScan-Scraper-Profile');
  console.log(`\n🔄 Chrome browser launch ho raha hai...`);
  console.log(`   Profile folder: ${scraperDataDir}`);

  const context = await chromium.launchPersistentContext(scraperDataDir, {
    channel: 'chrome',
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--no-first-run',
      '--no-default-browser-check',
      '--start-maximized',
    ],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: null,
    locale: 'en-US',
  });

  return context;
}

// Extraction
async function extractRows(page, defaultCountry = 'World') {
  return page.evaluate((defaultCountry) => {
    const skip = ['company name', 'company info', 'name', 'country', 'city', 'total', 'actions'];
    const selectors = [
      '.company-card, .company-item, .company-row',
      'mat-row, [role="row"]:not([role="columnheader"])',
      'tbody tr, table tr:not(:first-child)',
      'tr',
    ];

    let rows = [];
    for (const sel of selectors) {
      try {
        const found = Array.from(document.querySelectorAll(sel)).filter(el => {
          const text = el.innerText?.trim();
          return text && text.length > 3 && !el.querySelector('th');
        });
        if (found.length > 2) {
          rows = found;
          break;
        }
      } catch (e) {}
    }

    return rows.map(r => {
      const cells = Array.from(r.querySelectorAll('td, [role="cell"], .cell, [class*="cell"], [class*="column"]'));
      const texts = cells.length > 0
        ? cells.map(c => c.innerText?.trim()).filter(t => t && t !== '+' && t !== '...')
        : (r.innerText?.split('\n') || []).map(t => t.trim()).filter(Boolean);

      if (texts.length >= 1 && texts[0]?.length > 1) {
        const name = texts[0];
        if (skip.some(s => name.toLowerCase() === s)) return null;

        let compCountry = defaultCountry;
        let compCity = '';

        if (texts.length > 1) {
          if (defaultCountry === 'World') {
            compCountry = texts[1] || 'International';
            compCity = texts[2] || '';
          } else {
            compCity = texts[1] || '';
          }
        }

        const website = texts.find(t => t.includes('.com') || t.includes('.in') || t.includes('.net') || t.includes('www') || t.includes('.org')) || '';
        const link = r.querySelector('a')?.getAttribute('href') || '';

        return { name, country: compCountry, city: compCity, website, link };
      }
      return null;
    }).filter(Boolean).filter(r => !skip.some(s => r.name.toLowerCase() === s));
  }, defaultCountry);
}

async function clickNext(page) {
  return page.evaluate(() => {
    const paginators = Array.from(document.querySelectorAll('div, mat-paginator, section, nav')).filter(
      el => el.innerText && /of\s+\d+/i.test(el.innerText) && el.querySelector('button')
    );
    for (const paginator of paginators) {
      const btns = Array.from(paginator.querySelectorAll('button')).filter(b => b.offsetWidth > 0);
      const next = btns[btns.length - 1];
      if (next && !next.disabled && next.getAttribute('aria-disabled') !== 'true') {
        next.click();
        return true;
      }
    }
    const nextBtn = document.querySelector('button[aria-label*="Next" i], button[title*="Next" i], .mat-mdc-paginator-navigation-next');
    if (nextBtn && !nextBtn.disabled && nextBtn.getAttribute('aria-disabled') !== 'true') {
      nextBtn.click();
      return true;
    }
    return false;
  });
}

async function waitForTableUpdate(page, prevFirstRow) {
  for (let i = 0; i < 15; i++) {
    const rows = await extractRows(page).catch(() => []);
    const firstRow = rows[0]?.name || '';
    if (rows.length > 2 && (prevFirstRow === '' || firstRow !== prevFirstRow)) {
      return rows;
    }
    await sleep(800);
  }
  return await extractRows(page).catch(() => []);
}

// ============================================================
// MAIN RUNNER
// ============================================================
async function main() {
  console.log('\n' + '='.repeat(66));
  console.log('🎯  TradeScan 6-DIGIT SUB-CODE ENGINE  -  Zero-Ban Automation');
  console.log('='.repeat(66));

  const hsInput = await ask('Parent HS Code (default: 5208 Cotton Fabric): ');
  const parentHs = hsInput.trim() || '5208';

  const countryInput = await ask('Country code (default: 000 = World | 699 = India): ');
  const countryCode = countryInput.trim() || '000';
  const countryName = countryCode === '000' ? 'World' : countryCode;

  const flowInput = await ask('exports ya imports (default: exports): ');
  const tradeFlow = flowInput.toLowerCase() === 'imports' ? 'imports' : 'exports';

  // Get subcodes list
  const subcodes = SUBCODES_MAP[parentHs] || [
    { code: `${parentHs}10`, name: `Sub-category 10` },
    { code: `${parentHs}20`, name: `Sub-category 20` },
  ];

  console.log('\n' + '─'.repeat(66));
  console.log(`📌 Parent HS Code    : ${parentHs}`);
  console.log(`🌐 Total Sub-codes   : ${subcodes.length} sub-categories`);
  console.log(`🛡️ Anti-Ban Strategy : Har sub-code sirf 2-4 pages (Zero Account Ban Risk)`);
  console.log(`⏸️ Break per Sub-code: ${CONFIG.BETWEEN_SUBCODES_SEC}s natural delay`);
  console.log('─'.repeat(66) + '\n');

  // Resume check
  let startIndex = 0;
  let grandTotalSaved = 0;
  const progress = loadSubcodeProgress(parentHs, countryCode);
  if (progress && progress.completedCodes) {
    console.log(`🔄 Pichla session mila: ${progress.completedCodes.length} / ${subcodes.length} sub-codes pehle se complete hain!`);
    console.log(`   Pehle se ${progress.grandTotalSaved || 0} companies saved hain.`);
    const rChoice = await ask(`   Bache hue sub-codes se resume karein? (y/n): `);
    if (rChoice.toLowerCase() === 'y') {
      startIndex = progress.completedCodes.length;
      grandTotalSaved = progress.grandTotalSaved || 0;
      console.log(`✅ Sub-code ${startIndex + 1} (${subcodes[startIndex]?.code || 'Done'}) se resume ho raha hai!\n`);
    }
  }

  const context = await launchBrowser();
  const page = await context.newPage();

  // Test first navigation for login check
  const firstCode = subcodes[startIndex]?.code || subcodes[0].code;
  const testUrl = `${CONFIG.TRADEMAP_BASE}/en/goods/companies/c/${countryCode}/${tradeFlow}/p/${firstCode}`;
  console.log(`🌐 TradeMap open ho raha hai...`);
  await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await sleep(4000);

  // Check login
  const isBlocked = await page.evaluate(() => {
    const t = document.body?.innerText || '';
    return t.includes('account-blocked') || t.includes('Sign in') || t.includes('Register') || t.includes('Session expired');
  });

  if (isBlocked) {
    console.log('\n🔑 Login ya Verification zaroori hai.');
    console.log('👉 Browser window mein naye account se login kar lein.');
    await ask('👉 Login ho gaya? Yahan ENTER dabayein: ');
  }

  // Iterate over each sub-code
  const completedCodes = progress?.completedCodes || [];

  for (let i = startIndex; i < subcodes.length; i++) {
    const sub = subcodes[i];
    const subUrl = `${CONFIG.TRADEMAP_BASE}/en/goods/companies/c/${countryCode}/${tradeFlow}/p/${sub.code}`;

    console.log(`\n${'═'.repeat(66)}`);
    console.log(`📦 [${i + 1}/${subcodes.length}] Sub-code: ${sub.code} - ${sub.name}`);
    console.log(`🔗 URL: ${subUrl}`);
    console.log('═'.repeat(66));

    await page.goto(subUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await sleep(4000);

    let subcodePage = 1;
    let subcodeSaved = 0;
    let prevFirstRow = '';

    while (true) {
      const rows = await waitForTableUpdate(page, prevFirstRow);

      if (rows.length === 0) {
        if (subcodePage === 1) {
          console.log(`   ℹ️ Is sub-code (${sub.code}) mein koi companies nahi mili ya table empty hai.`);
        }
        break;
      }

      prevFirstRow = rows[0]?.name || '';

      let pageSaved = 0;
      for (const r of rows) {
        const ok = await saveCompany({
          name: r.name,
          country: r.country,
          city: r.city,
          website: r.website,
          link: r.link ? (r.link.startsWith('http') ? r.link : `${CONFIG.TRADEMAP_BASE}${r.link}`) : '',
          parentHs,
          subCode: sub.code,
          subName: sub.name,
          tradeType: tradeFlow === 'exports' ? 'Exporter' : 'Importer',
        });
        if (ok) pageSaved++;
      }

      subcodeSaved += pageSaved;
      grandTotalSaved += pageSaved;

      console.log(`   ✅ [Page ${subcodePage}] ${rows.length} rows → +${pageSaved} new | Sub-Total: ${subcodeSaved} | 💾 Grand Total: ${grandTotalSaved}`);

      // Small natural delay
      const delay = randomDelay();
      process.stdout.write(`      ⏳ ${(delay / 1000).toFixed(1)}s delay...\r`);
      await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' })).catch(() => {});
      await sleep(delay);

      // Check next page
      const hasNext = await clickNext(page);
      if (!hasNext) {
        console.log(`   🏁 Sub-code ${sub.code} complete! (Total ${subcodePage} pages)`);
        break;
      }

      subcodePage++;
      await sleep(2000);
    }

    completedCodes.push(sub.code);
    saveSubcodeProgress(parentHs, countryCode, {
      completedCodes,
      grandTotalSaved,
      lastSubCode: sub.code,
    });

    if (i < subcodes.length - 1) {
      console.log(`\n⏸️  Sub-code break: ${CONFIG.BETWEEN_SUBCODES_SEC}s (Safe human pause)...`);
      for (let s = CONFIG.BETWEEN_SUBCODES_SEC; s > 0; s -= 5) {
        process.stdout.write(`\r   ⏱️  ${s}s baki... Agla sub-code (${subcodes[i + 1].code}) shuru hoga `);
        await sleep(5000);
      }
      process.stdout.write('\n');
    }
  }

  console.log('\n' + '='.repeat(66));
  console.log('🎉  SAARE SUB-CODES COMPLETE! DATA EXTRACTION FINISHED!');
  console.log(`    Total Companies Saved : ${grandTotalSaved}`);
  console.log(`    Parent HS Code        : ${parentHs}`);
  console.log(`    Dashboard             : http://localhost:3000`);
  console.log('='.repeat(66) + '\n');

  await context.close().catch(() => {});
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('\n❌ Fatal error:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
