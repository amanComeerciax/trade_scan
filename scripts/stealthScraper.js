/**
 * 🕵️ TradeScan STEALTH SCRAPER v3.0 - Multi-Batch Seamless Scraper
 * ================================================================
 * - Dedicated Chrome profile (no conflict with regular Chrome)
 * - Seamless batch progression (Batch 1 -> Batch 2 -> Batch 3 without restarting browser)
 * - Safe anti-ban cooldowns between batches & human delays between pages
 * - Persistent progress saving & 1-click resume
 * ================================================================
 */

const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
  PAGES_PER_BATCH: 5,        // 5 pages per batch = ~500 companies
  BATCH_COOLDOWN_SEC: 45,    // 45 seconds human cooldown between batches
  MIN_PAGE_DELAY_MS: 7000,   // 7s min delay between pages
  MAX_PAGE_DELAY_MS: 13000,  // 13s max delay between pages
  TRADEMAP_BASE: 'https://www.trademap.org',
};

const COUNTRY_CODES = {
  india: '699', china: '156', germany: '276', usa: '842',
  vietnam: '704', brazil: '076', uae: '784', singapore: '702',
  france: '251', italy: '381', japan: '392', uk: '826',
  turkey: '792', indonesia: '360', thailand: '764', bangladesh: '050',
  pakistan: '586', srilanka: '144', myanmar: '104',
};

const HS_NAMES = {
  '0901': 'HS 0901 Coffee & Substitutes',
  '5208': 'HS 5208 Woven Cotton Fabrics',
  '5201': 'HS 5201 Raw Cotton',
  '1006': 'HS 1006 Rice & Paddy',
  '0902': 'HS 0902 Tea & Mate',
  '0904': 'HS 0904 Pepper & Spices',
  '6203': 'HS 6203 Men Garments',
  '6204': 'HS 6204 Women Garments',
  '7113': 'HS 7113 Jewellery & Gems',
  '8471': 'HS 8471 Computers & IT Hardware',
  '2709': 'HS 2709 Petroleum & Crude Oil',
  '1701': 'HS 1701 Sugar & Cane',
  '6109': 'HS 6109 T-Shirts & Vests',
};

// ============================================================
// HELPERS
// ============================================================
function ask(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(query, a => { rl.close(); r(a.trim()); }));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const randomDelay = (min = CONFIG.MIN_PAGE_DELAY_MS, max = CONFIG.MAX_PAGE_DELAY_MS) =>
  Math.floor(Math.random() * (max - min)) + min;

// ============================================================
// PROGRESS TRACKING
// ============================================================
function getProgressFilePath(hsCode, countryCode) {
  return path.join(process.env.LOCALAPPDATA, `TradeScan-progress-${hsCode}-${countryCode}.json`);
}

function saveProgress(hsCode, countryCode, data) {
  try {
    const filePath = getProgressFilePath(hsCode, countryCode);
    fs.writeFileSync(filePath, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 2));
  } catch (e) {
    // silent catch
  }
}

function loadProgress(hsCode, countryCode) {
  try {
    const filePath = getProgressFilePath(hsCode, countryCode);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    // silent catch
  }
  return null;
}

function clearProgress(hsCode, countryCode) {
  try {
    const filePath = getProgressFilePath(hsCode, countryCode);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    // silent catch
  }
}

// ============================================================
// DATABASE SAVE
// ============================================================
async function saveCompany({ name, country, city, website, link, hsCode, tradeType }) {
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

    const exists = await prisma.companyProduct.findFirst({
      where: { companyId: company.id, hsCode },
    });

    if (!exists) {
      await prisma.companyProduct.create({
        data: {
          companyId: company.id,
          hsCode,
          productCategory: HS_NAMES[hsCode] || `HS ${hsCode} Sector`,
          tradeType: tradeType || 'Exporter',
        },
      }).catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// BROWSER LAUNCH
// ============================================================
async function launchScraperBrowser() {
  const scraperDataDir = path.join(process.env.LOCALAPPDATA, 'TradeScan-Scraper-Profile');
  console.log(`🔄 Chrome launching with dedicated profile...`);
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

// ============================================================
// PAGE ACTIONS
// ============================================================
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

    if (rows.length === 0) {
      const allTrs = Array.from(document.querySelectorAll('tr, [role="row"]'))
        .filter(r => {
          const cells = r.querySelectorAll('td, [role="cell"]');
          return cells.length >= 1 && !r.querySelector('th');
        });
      if (allTrs.length > 0) rows = allTrs;
    }

    return rows.map(r => {
      const cells = Array.from(r.querySelectorAll('td, [role="cell"], .cell, [class*="cell"], [class*="column"]'));
      const texts = cells.length > 0
        ? cells.map(c => c.innerText?.trim()).filter(t => t && t !== '+' && t !== '...')
        : (r.innerText?.split('\n') || []).map(t => t.trim()).filter(Boolean);

      if (texts.length >= 1 && texts[0]?.length > 1) {
        const name = texts[0];
        if (skip.some(s => name.toLowerCase() === s)) return null;

        // When viewing World, column 2 is often Country
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

        const website = texts.find(t => t.includes('.com') || t.includes('.in') || t.includes('.net') || t.includes('www') || t.includes('.org') || t.includes('.co')) || '';
        const link = r.querySelector('a')?.getAttribute('href') || '';

        return {
          name,
          country: compCountry,
          city: compCity,
          website,
          link,
        };
      }
      return null;
    }).filter(Boolean).filter(r => !skip.some(s => r.name.toLowerCase() === s));
  }, defaultCountry);
}

async function clickNext(page) {
  return page.evaluate(() => {
    // 1. Angular Material or TradeMap paginator
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

    // 2. Generic next page buttons
    const nextBtn = document.querySelector('button[aria-label*="Next" i], button[title*="Next" i], .mat-mdc-paginator-navigation-next');
    if (nextBtn && !nextBtn.disabled && nextBtn.getAttribute('aria-disabled') !== 'true') {
      nextBtn.click();
      return true;
    }

    return false;
  });
}

async function getPaginatorInfo(page) {
  return page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('*')).find(
      e => e.children.length === 0 && /\d+\s*[-–]\s*\d+\s+of\s+\d+/i.test(e.innerText || '')
    );
    return el ? el.innerText.trim() : '';
  });
}

async function waitForTableUpdate(page, prevFirstRow) {
  for (let i = 0; i < 20; i++) {
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
// MAIN EXECUTION
// ============================================================
async function main() {
  console.log('\n' + '='.repeat(64));
  console.log('🕵️  TradeScan STEALTH SCRAPER v3.0  -  Multi-Batch Automation');
  console.log('='.repeat(64));

  // 1. Inputs with smart defaults
  const hsInput = await ask('HS Code (default: 5208 Cotton Fabric | 0901 Coffee): ');
  const hsCode = hsInput.trim() || '5208';

  const countryInput = await ask('Country code (default: 000 = WORLD sabse zyada 7000+ data | 699 = India): ');
  const countryCode = countryInput.trim() || '000';
  const country = countryCode === '000' ? 'World' : (Object.keys(COUNTRY_CODES).find(k => COUNTRY_CODES[k] === countryCode) || countryCode);

  const flowInput = await ask('exports ya imports (default: exports): ');
  const tradeFlow = flowInput.toLowerCase() === 'imports' ? 'imports' : 'exports';

  const maxPagesInput = await ask('Max pages (0 = UNLIMITED 🔥 sab 7000+ extract karega): ');
  const maxPages = parseInt(maxPagesInput) || 0;

  const targetUrl = `${CONFIG.TRADEMAP_BASE}/en/goods/companies/c/${countryCode}/${tradeFlow}/p/${hsCode}`;

  console.log('\n' + '─'.repeat(64));
  console.log(`🎯 Target       : ${country} (${countryCode}) | HS ${hsCode} (${HS_NAMES[hsCode] || 'Sector'}) | ${tradeFlow}`);
  console.log(`📄 Page Limit   : ${maxPages === 0 ? 'UNLIMITED 🔥' : maxPages}`);
  console.log(`📦 Batch Size   : ${CONFIG.PAGES_PER_BATCH} pages per batch (~500 companies)`);
  console.log(`⏸️  Cooldown     : ${CONFIG.BATCH_COOLDOWN_SEC}s between batches (Browser session open rahega)`);
  console.log(`⏱️  Page Delay   : ${(CONFIG.MIN_PAGE_DELAY_MS / 1000).toFixed(0)}s - ${(CONFIG.MAX_PAGE_DELAY_MS / 1000).toFixed(0)}s human-like delay`);
  console.log('─'.repeat(64) + '\n');

  // 2. Check for Previous Progress
  let totalSaved = 0;
  let currentPage = 1;
  let batchNum = 1;
  let pagesInBatch = 0;
  let resumeTargetPage = 1;

  const saved = loadProgress(hsCode, countryCode);
  if (saved && saved.lastScrapedPage > 0) {
    console.log(`\n🔄 PICHLA SESSION MILA! (HS ${hsCode} | ${country})`);
    console.log(`   Pichle run mein Page ${saved.lastScrapedPage} tak (${saved.totalSaved} companies) extract ho chuki thi.`);
    console.log(`   Agla page: Page ${saved.lastScrapedPage + 1} se resume karein? (y = resume, n = fresh start Page 1)`);
    const resumeChoice = await ask('   Choice (y/n): ');

    if (resumeChoice.toLowerCase() === 'y') {
      resumeTargetPage = saved.lastScrapedPage + 1;
      currentPage = resumeTargetPage;
      totalSaved = saved.totalSaved || 0;
      batchNum = Math.floor(saved.lastScrapedPage / CONFIG.PAGES_PER_BATCH) + 1;
      pagesInBatch = saved.lastScrapedPage % CONFIG.PAGES_PER_BATCH;
      console.log(`✅ Page ${currentPage} se resume ho raha hai! (Batch ${batchNum})\n`);
    } else {
      clearProgress(hsCode, countryCode);
      console.log('🆕 Fresh start from Page 1!\n');
    }
  }

  // 3. Launch Browser
  const context = await launchScraperBrowser();
  const page = await context.newPage();

  console.log(`🌐 Navigating to TradeMap...`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e =>
    console.log('Nav note:', e.message)
  );
  await sleep(4000);

  // Check login / captcha
  const isBlocked = await page.evaluate(() => {
    const t = document.body?.innerText || '';
    return t.includes('account-blocked') || t.includes('Sign in') || t.includes('Register') || t.includes('Session expired');
  });

  if (isBlocked) {
    console.log('\n🔑 Login ya verification notice mila. Browser window mein check karein/login karein.');
    await ask('👉 Login hone ke baad yahan ENTER dabayein: ');
  }

  // 4. Resume jump if needed
  if (resumeTargetPage > 1) {
    console.log(`\n⏩ Resume navigation: Page ${resumeTargetPage} par jump kar raha hoon (${resumeTargetPage - 1} pages advance)...`);
    for (let jump = 1; jump < resumeTargetPage; jump++) {
      const ok = await clickNext(page);
      if (!ok) {
        console.log(`⚠️ Next button nahi mila at jump ${jump}. Proceeding on current page.`);
        break;
      }
      await sleep(1500);
      if (jump % 5 === 0 || jump === resumeTargetPage - 1) {
        console.log(`   ...Page ${jump + 1} of ${resumeTargetPage}`);
      }
    }
    console.log(`✅ Page ${resumeTargetPage} par pahunch gaye! Scraping resume ho rahi hai!\n`);
  }

  console.log('🚀 Scraping loop running smoothly...\n');

  let prevFirstRow = '';

  // 5. Main Extraction Loop
  while (true) {
    if (maxPages > 0 && currentPage > maxPages) {
      console.log(`\n🏁 Max page limit (${maxPages}) poori ho gayi!`);
      break;
    }

    // Wait for table to load
    let rows = await waitForTableUpdate(page, prevFirstRow);

    if (rows.length === 0) {
      console.log(`⚠️ Table empty at Page ${currentPage} - waiting 5s...`);
      await sleep(5000);
      rows = await extractRows(page, country).catch(() => []);
      if (rows.length === 0) {
        console.log('⚠️ Still empty - reloading page...');
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await sleep(5000);
        rows = await extractRows(page, country).catch(() => []);
      }
    }

    if (rows.length > 0) {
      prevFirstRow = rows[0]?.name || '';
    }

    // Save extracted companies
    let newlySaved = 0;
    for (const r of rows) {
      const ok = await saveCompany({
        name: r.name,
        country: r.country,
        city: r.city,
        website: r.website,
        link: r.link ? (r.link.startsWith('http') ? r.link : `${CONFIG.TRADEMAP_BASE}${r.link}`) : '',
        hsCode,
        tradeType: tradeFlow === 'exports' ? 'Exporter' : 'Importer',
      });
      if (ok) newlySaved++;
    }

    totalSaved += newlySaved;
    pagesInBatch++;

    const paginatorText = await getPaginatorInfo(page);
    const paginatorDisplay = paginatorText ? ` (${paginatorText})` : '';

    console.log(`✅ [Batch ${batchNum} | Page ${currentPage}] ${rows.length} rows → +${newlySaved} new | 💾 Grand Total: ${totalSaved}${paginatorDisplay}`);

    // Save Progress after EVERY page
    saveProgress(hsCode, countryCode, {
      lastScrapedPage: currentPage,
      batchNum,
      totalSaved,
      tradeFlow,
    });

    // ── BATCH COOLDOWN CHECK ─────────────────────────────────
    // If batch size reached: Pause for cooldown, but DO NOT close browser!
    // Next page will seamlessly be Batch (batchNum + 1)
    if (pagesInBatch >= CONFIG.PAGES_PER_BATCH) {
      console.log('\n' + '─'.repeat(58));
      console.log(`📦 Batch ${batchNum} Complete! (${pagesInBatch * 100} companies processed in this batch)`);
      console.log(`⏸️  Anti-Ban Cooldown: ${CONFIG.BATCH_COOLDOWN_SEC}s break... (Browser open rahega, no restart)`);
      console.log('─'.repeat(58));

      for (let sec = CONFIG.BATCH_COOLDOWN_SEC; sec > 0; sec -= 5) {
        process.stdout.write(`\r   ⏱️  ${sec}s baki... Batch ${batchNum + 1} automatically Page ${currentPage + 1} se shuru hoga `);
        await sleep(5000);
      }
      process.stdout.write('\n\n');

      batchNum++;
      pagesInBatch = 0;
      console.log(`🚀 Batch ${batchNum} shuru ho raha hai Page ${currentPage + 1} se...\n`);
    } else {
      // Regular Human-like delay between pages inside the batch
      const delay = randomDelay();
      process.stdout.write(`   ⏳ ${(delay / 1000).toFixed(1)}s human delay...\r`);
      await page.evaluate(() => window.scrollBy({ top: 350, behavior: 'smooth' })).catch(() => {});
      await sleep(delay);
    }

    // ── ADVANCE TO NEXT PAGE ─────────────────────────────────
    const hasNext = await clickNext(page);
    if (!hasNext) {
      console.log('\n🏁 Bilkul aakhri page reach ho gaya! Sabhi companies extract ho chuki hain!');
      break;
    }

    currentPage++;
    await sleep(2000); // Give Angular paginator a moment to trigger API call
  }

  // 6. Wrap Up
  console.log('\n' + '='.repeat(64));
  console.log('🎉  STEALTH SCRAPING COMPLETE!');
  console.log(`    Total Companies Saved : ${totalSaved}`);
  console.log(`    HS Code               : ${hsCode} (${HS_NAMES[hsCode] || ''})`);
  console.log(`    Dashboard             : http://localhost:3000`);
  console.log('='.repeat(64) + '\n');

  await context.close().catch(() => {});
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('\n❌ Fatal error:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
