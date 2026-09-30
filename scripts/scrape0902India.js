/**
 * 🍵 TradeScan AUTHENTICATED API ENGINE - ALL 918 RECORDS (HS 0902 INDIA)
 * ================================================================
 * Uses authentic Authorization Bearer Token from browser:
 *   - Page 1/10: 100 records
 *   - Page 2/10: 100 records
 *   ...
 *   - Page 10/10: 18 records (Total 918 records)
 * 
 * For each company:
 *   - Calls /api/companies/contact to get Phone, Contact Name, Role
 *   - Saves to SQLite DB via Prisma
 * ================================================================
 */

require('dotenv').config();
const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();

const CONFIG = {
  HS_CODE: '0902',
  COUNTRY_CODE: '699',
  COUNTRY_NAME: 'India',
  PAGE_SIZE: 100,
  API_DELAY_MS: 300,       // 300ms safe delay between contact fetches
  PAGE_DELAY_MS: 1500,     // 1.5s delay between pages
  PROFILE_DIR: path.join(process.env.LOCALAPPDATA || '', 'TradeScan-Scraper-Profile'),
  CHECKPOINT_FILE: path.join(process.env.LOCALAPPDATA || '', 'TradeScan-checkpoint-0902-api.json'),
};

function ask(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans.trim());
  }));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadCheckpoint() {
  try {
    if (fs.existsSync(CONFIG.CHECKPOINT_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG.CHECKPOINT_FILE, 'utf8'));
    }
  } catch {}
  return null;
}

function saveCheckpoint(state) {
  try {
    fs.writeFileSync(CONFIG.CHECKPOINT_FILE, JSON.stringify({
      ...state,
      updatedAt: new Date().toISOString(),
    }, null, 2));
  } catch {}
}

async function upsertCompany(data, hsCode = '0902', countryName = 'India') {
  if (!data.name?.trim()) return { status: 'skipped' };
  const cleanName = data.name.trim();
  const finalCountry = data.country?.trim() || countryName;

  try {
    const existing = await prisma.company.findUnique({
      where: { name_country: { name: cleanName, country: finalCountry } },
    });

    const payload = {
      city: data.city || undefined,
      address: data.city ? `${data.city}, ${finalCountry}` : finalCountry,
      website: data.website || undefined,
      sourceUrl: data.sourceUrl || undefined,
      phone: data.phone || undefined,
      contactName: data.contactName || undefined,
      contactRole: data.contactRole || undefined,
      tradeFlow: data.tradeFlow || 'Exporter',
      activities: data.activities || undefined,
      annualTurnover: data.annualTurnover || undefined,
      numberOfEmployees: data.numberOfEmployees || undefined,
      trademapId: data.id ? String(data.id) : undefined,
    };

    let company;
    let isInsert = false;

    if (existing) {
      const updates = {};
      for (const [k, v] of Object.entries(payload)) {
        if (v && (!existing[k] || existing[k] !== v)) updates[k] = v;
      }
      company = Object.keys(updates).length > 0
        ? await prisma.company.update({ where: { id: existing.id }, data: updates })
        : existing;
    } else {
      company = await prisma.company.create({
        data: { name: cleanName, country: finalCountry, ...payload },
      });
      isInsert = true;
    }

    // Link CompanyProduct
    const existingProd = await prisma.companyProduct.findFirst({
      where: { companyId: company.id, hsCode },
    });
    if (!existingProd) {
      await prisma.companyProduct.create({
        data: {
          companyId: company.id,
          hsCode,
          productCategory: `HS ${hsCode} Tea & Mate`,
          tradeType: data.tradeFlow || 'Exporter',
        },
      }).catch(() => {});
    }

    return { status: isInsert ? 'inserted' : 'updated' };
  } catch (err) {
    return { status: 'failed', error: err.message };
  }
}

async function main() {
  console.log('\n' + '='.repeat(68));
  console.log('🍵 TradeScan AUTHENTICATED ENGINE - ALL 918 RECORDS (HS 0902 INDIA)');
  console.log('='.repeat(68));

  console.log('🔄 Chrome browser launch ho raha hai...');
  console.log(`   Profile: ${CONFIG.PROFILE_DIR}`);

  const context = await chromium.launchPersistentContext(CONFIG.PROFILE_DIR, {
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
    viewport: null,
    locale: 'en-US',
  });

  const page = await context.newPage();

  // Intercept request headers to capture Authorization Bearer token
  let capturedHeaders = {};
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/api/')) {
      const h = req.headers();
      if (h['authorization'] || h['Authorization']) {
        capturedHeaders = { ...capturedHeaders, ...h };
      }
    }
  });

  console.log('🌐 Opening TradeMap (0902 India)...');
  await page.goto('https://www.trademap.org/en/goods/companies/c/699/exports/p/0902', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  }).catch(() => {});
  await sleep(3000);

  console.log('\n' + '─'.repeat(68));
  console.log('👉 BROWSER OPEN HO GAYA HAI!');
  console.log('👉 Browser me check kar lijiye ki aap login hain ya nahi.');
  console.log('👉 Jab page load ho jaye aur table dikhne lage, tab yahan ENTER dabayein.');
  console.log('─'.repeat(68) + '\n');

  await ask('👉 Login hone ke baad yahan ENTER dabayein: ');

  // Extract auth token from browser storage if not captured via network
  const storageToken = await page.evaluate(() => {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      const v = sessionStorage.getItem(k);
      if (v && v.includes('access_token')) {
        try {
          const p = JSON.parse(v);
          if (p.access_token) return p.access_token;
        } catch {}
      }
    }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k);
      if (v && v.includes('access_token')) {
        try {
          const p = JSON.parse(v);
          if (p.access_token) return p.access_token;
        } catch {}
      }
    }
    return null;
  });

  if (storageToken && !capturedHeaders['authorization']) {
    capturedHeaders['authorization'] = `Bearer ${storageToken}`;
  }

  const hasAuth = !!(capturedHeaders['authorization'] || capturedHeaders['Authorization']);
  console.log(`\n🔑 Authentication Status: ${hasAuth ? '✅ LOGGED IN (Bearer Token Active)' : '⚠️ GUEST (Token not found yet)'}`);

  // Check checkpoint
  let startPage = 1;
  let grandTotalInserted = 0;
  let grandTotalDuplicates = 0;
  let grandTotalProcessed = 0;

  const checkpoint = loadCheckpoint();
  if (checkpoint && checkpoint.lastPage > 0) {
    console.log(`🔄 Checkpoint mila! Last Page: ${checkpoint.lastPage} | Processed: ${checkpoint.totalProcessed}`);
    const resume = await ask(`Page ${checkpoint.lastPage + 1} se resume karein? (y/n): `);
    if (resume.toLowerCase() === 'y') {
      startPage = checkpoint.lastPage + 1;
      grandTotalInserted = checkpoint.totalInserted || 0;
      grandTotalDuplicates = checkpoint.totalDuplicates || 0;
      grandTotalProcessed = checkpoint.totalProcessed || 0;
    }
  }

  let currentPage = startPage;
  let totalPages = 10;
  let totalRecords = 918;

  console.log('\n🚀 Starting Extraction of ALL 918 Records (100 per page)...\n');

  while (currentPage <= totalPages) {
    // 1. Fetch 100 companies from authenticated API with dynamic fresh token
    const listResult = await page.evaluate(async ({ pageNum, pageSize }) => {
      // Get latest token dynamically from browser session
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
        const url = `https://www.trademap.org/api/companies?tradeFlow=E&product=0902&productType=p&country=699&page=${pageNum}&pageSize=${pageSize}&size=${pageSize}&sortBy=companyName&sortDir=asc`;
        const headers = {
          'Accept': 'application/json, text/plain, */*',
          'X-Requested-With': 'XMLHttpRequest',
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(url, { headers, credentials: 'include' });
        if (!res.ok) return { ok: false, status: res.status };
        const json = await res.json();
        return { ok: true, json };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }, { pageNum: currentPage, pageSize: CONFIG.PAGE_SIZE });

    if (!listResult.ok || !listResult.json) {
      console.log(`❌ Page ${currentPage} fetch failed (Status: ${listResult.status || listResult.error}). Retrying in 4s...`);
      await sleep(4000);
      continue;
    }

    const data = listResult.json;
    const records = Array.isArray(data.records) ? data.records : (Array.isArray(data) ? data : []);
    if (data.nbRecords) totalRecords = data.nbRecords;
    if (data.nbPages) totalPages = data.nbPages;

    console.log(`[TradeMap] Page ${currentPage}/${totalPages}`);
    console.log(`[TradeMap] Received ${records.length} records`);

    if (records.length === 0) {
      console.log('ℹ️ No more records found.');
      break;
    }

    let pageInserted = 0;
    let pageDuplicates = 0;

    // 2. For each company, fetch Contact & Phone from dedicated API using dynamic fresh token
    for (let i = 0; i < records.length; i++) {
      const raw = records[i];
      grandTotalProcessed++;

      const companyId = raw.id;
      const sourceId = raw.sourceId || 1;

      // Fetch contact details
      let contactInfo = { name: null, role: null, phone: null };
      if (companyId) {
        const contactRes = await page.evaluate(async ({ cId, sId }) => {
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
            const url = `https://www.trademap.org/api/companies/contact?companyId=${encodeURIComponent(cId)}&sourceId=${sId}`;
            const headers = {
              'Accept': 'application/json, text/plain, */*',
              'X-Requested-With': 'XMLHttpRequest',
            };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(url, { headers, credentials: 'include' });
            if (res.ok) return await res.json();
            return null;
          } catch {
            return null;
          }
        }, { cId: companyId, sId: sourceId });

        if (contactRes) {
          contactInfo.name = contactRes.name?.trim() || null;
          contactInfo.role = contactRes.role?.trim() || null;
          contactInfo.phone = contactRes.phone?.trim() || null;
        }
      }

      // Prepare company payload
      const companyData = {
        id: raw.id,
        name: raw.name,
        city: raw.city,
        country: CONFIG.COUNTRY_NAME,
        website: raw.website,
        sourceUrl: `https://www.trademap.org/en/goods/companies/c/699/exports/p/0902`,
        activities: Array.isArray(raw.activities) ? raw.activities.join(', ') : raw.activities,
        annualTurnover: raw.annualTurnover ? String(raw.annualTurnover) : null,
        numberOfEmployees: raw.numberOfEmployees ? String(raw.numberOfEmployees) : null,
        tradeFlow: 'Exporter',
        contactName: contactInfo.name,
        contactRole: contactInfo.role,
        phone: contactInfo.phone,
      };

      const res = await upsertCompany(companyData, CONFIG.HS_CODE, CONFIG.COUNTRY_NAME);

      const contactParts = [];
      if (companyData.contactName) contactParts.push(`👤 ${companyData.contactName}${companyData.contactRole ? ` (${companyData.contactRole})` : ''}`);
      if (companyData.phone) contactParts.push(`📞 ${companyData.phone}`);
      const infoBadge = contactParts.length > 0 ? ` (${contactParts.join(' | ')})` : '';

      const counterStr = `[${grandTotalProcessed}/${totalRecords}]`;
      process.stdout.write(`   ↳ ${counterStr} ${(companyData.name || '').substring(0, 32)}... `);

      if (res.status === 'inserted') {
        pageInserted++;
        grandTotalInserted++;
        console.log(`✅ NEW${infoBadge}`);
      } else if (res.status === 'updated') {
        pageDuplicates++;
        grandTotalDuplicates++;
        console.log(`🔄 UPDATED${infoBadge}`);
      } else {
        pageDuplicates++;
        grandTotalDuplicates++;
        console.log(`⏭️ SKIP`);
      }

      await sleep(CONFIG.API_DELAY_MS);
    }

    console.log(`[TradeMap] Inserted: ${pageInserted}`);
    console.log(`[TradeMap] Duplicates: ${pageDuplicates}\n`);

    saveCheckpoint({
      lastPage: currentPage,
      totalProcessed: grandTotalProcessed,
      totalInserted: grandTotalInserted,
      totalDuplicates: grandTotalDuplicates,
    });

    currentPage++;
    await sleep(CONFIG.PAGE_DELAY_MS);
  }

  console.log('\n' + '='.repeat(68));
  console.log('🎉 ALL 918 RECORDS EXTRACTION COMPLETED!');
  console.log(`   Total Processed          : ${grandTotalProcessed}`);
  console.log(`   Total Inserted           : ${grandTotalInserted}`);
  console.log(`   Total Duplicates/Updated : ${grandTotalDuplicates}`);
  console.log('='.repeat(68) + '\n');

  await context.close().catch(() => {});
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
