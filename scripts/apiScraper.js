/**
 * ⚡ TradeScan JSON API EXTRACTION ENGINE v1.0
 * ================================================================
 * Replaces DOM scraping with TradeMap's internal JSON API:
 *   GET https://www.trademap.org/api/companies
 * 
 * Features:
 *   - 100% compatible with existing authenticated Chrome profile
 *   - size=100 & dynamic nbPages pagination (page=1..nbPages)
 *   - Normalizes 11 target fields into database schema
 *   - PostgreSQL / SQLite upsert & deduplication via unique trademapId
 *   - Persistent checkpoint & resume mechanism (skip completed pages)
 *   - Robust error, timeout, rate-limit, and session-expiration handling
 *   - Safe platform-limit detection (clean checkpoint & halt)
 *   - Configurable HS code (5208, 520811, 520812, etc.)
 * ================================================================
 */

const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();

// ============================================================
// CONFIGURATION & DEFAULTS
// ============================================================
const CONFIG = {
  DEFAULT_HS: '5208',
  DEFAULT_COUNTRY: '000',
  DEFAULT_FLOW: 'E',
  PAGE_SIZE: 100,
  REQUEST_DELAY_MS: 3000,     // 3s delay between API calls for stability
  MAX_RETRIES_PER_PAGE: 3,
  PROFILE_DIR: path.join(process.env.LOCALAPPDATA || '', 'TradeScan-Scraper-Profile'),
  TRADEMAP_BASE: 'https://www.trademap.org',
};

// ISO Numeric to Country Name mapping
const COUNTRY_MAP = {
  '000': 'World',
  '699': 'India',
  '156': 'China',
  '276': 'Germany',
  '842': 'United States',
  '704': 'Vietnam',
  '076': 'Brazil',
  '784': 'United Arab Emirates',
  '702': 'Singapore',
  '251': 'France',
  '381': 'Italy',
  '392': 'Japan',
  '826': 'United Kingdom',
  '792': 'Turkey',
  '360': 'Indonesia',
  '764': 'Thailand',
  '050': 'Bangladesh',
  '586': 'Pakistan',
  '579': 'Norway',
};

// ============================================================
// CLI & HELPERS
// ============================================================
function ask(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(query, a => { rl.close(); r(a.trim()); }));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function getCheckpointPath(hsCode, country, flow, sortDir = 'asc') {
  const safeName = `TradeScan-checkpoint-${hsCode}-${country}-${flow}-${sortDir}.json`;
  return path.join(process.env.LOCALAPPDATA || '.', safeName);
}

function loadCheckpoint(hsCode, country, flow, sortDir = 'asc') {
  try {
    const p = getCheckpointPath(hsCode, country, flow, sortDir);
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch {}
  return null;
}

function saveCheckpoint(hsCode, country, flow, sortDir = 'asc', state) {
  try {
    const p = getCheckpointPath(hsCode, country, flow, sortDir);
    fs.writeFileSync(p, JSON.stringify({ ...state, lastUpdated: new Date().toISOString() }, null, 2));
  } catch {}
}

function clearCheckpoint(hsCode, country, flow, sortDir = 'asc') {
  try {
    const p = getCheckpointPath(hsCode, country, flow, sortDir);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {}
}

// Parse CLI flags (e.g. node apiScraper.js --hs=5208 --country=000 --flow=E)
function parseCliArgs() {
  const args = process.argv.slice(2);
  const flags = {};
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, val] = arg.slice(2).split('=');
      flags[key.toLowerCase()] = val || true;
    }
  }
  return flags;
}

// ============================================================
// DATA NORMALIZATION (Requirement 7)
// ============================================================
function normalizeRecord(raw, hsCode, tradeFlowCode) {
  const trademapId = raw.id ? String(raw.id).trim() : null;
  const companyName = raw.name ? String(raw.name).trim() : 'Unknown';
  const city = raw.city ? String(raw.city).trim() : null;
  const countryCode = raw.countryCd ? String(raw.countryCd).trim() : null;
  const countryName = (countryCode && COUNTRY_MAP[countryCode]) ? COUNTRY_MAP[countryCode] : (countryCode || 'International');

  let activities = null;
  if (Array.isArray(raw.activities) && raw.activities.length > 0) {
    activities = raw.activities.join(', ');
  } else if (typeof raw.activities === 'string' && raw.activities.trim()) {
    activities = raw.activities.trim();
  }

  const website = raw.website ? String(raw.website).trim() : null;
  const annualTurnover = (raw.annualTurnover !== undefined && raw.annualTurnover !== null) ? String(raw.annualTurnover) : null;
  const numberOfEmployees = (raw.numberOfEmployees !== undefined && raw.numberOfEmployees !== null) ? String(raw.numberOfEmployees) : null;
  const updateDate = raw.updateDate ? String(raw.updateDate).trim() : null;
  
  let sourceId = null;
  if (typeof raw.sourceId === 'number') {
    sourceId = raw.sourceId;
  } else if (raw.sourceId) {
    sourceId = parseInt(raw.sourceId, 10) || null;
  }

  const tradeFlow = tradeFlowCode === 'I' ? 'Importer' : 'Exporter';

  return {
    trademapId,
    companyName,
    city,
    countryCode,
    countryName,
    activities,
    website,
    annualTurnover,
    numberOfEmployees,
    updateDate,
    sourceId,
    hsCode,
    tradeFlow,
  };
}

// ============================================================
// DATABASE UPSERT & DEDUPLICATION (Requirement 8)
// ============================================================
async function upsertCompanyRecord(norm) {
  if (!norm.trademapId) {
    return { status: 'failed', reason: 'Missing trademapId' };
  }

  const companyPayload = {
    name: norm.companyName,
    country: norm.countryName,
    countryCode: norm.countryCode,
    city: norm.city,
    address: norm.city ? `${norm.city}, ${norm.countryName}` : norm.countryName,
    website: norm.website,
    sourceUrl: `https://www.trademap.org/companies/${norm.trademapId}`,
    activities: norm.activities,
    annualTurnover: norm.annualTurnover,
    numberOfEmployees: norm.numberOfEmployees,
    updateDate: norm.updateDate,
    sourceId: norm.sourceId,
    tradeFlow: norm.tradeFlow,
  };

  try {
    // 1. Primary deduplication by trademapId
    const existingByTrademapId = await prisma.company.findUnique({
      where: { trademapId: norm.trademapId },
    });

    let company;
    let isInsert = false;
    let isUpdate = false;

    if (existingByTrademapId) {
      company = await prisma.company.update({
        where: { trademapId: norm.trademapId },
        data: companyPayload,
      });
      isUpdate = true;
    } else {
      // 2. Secondary deduplication by [name, country]
      const existingByNameCountry = await prisma.company.findUnique({
        where: {
          name_country: {
            name: norm.companyName,
            country: norm.countryName,
          },
        },
      });

      if (existingByNameCountry) {
        company = await prisma.company.update({
          where: { id: existingByNameCountry.id },
          data: {
            trademapId: norm.trademapId,
            ...companyPayload,
          },
        });
        isUpdate = true;
      } else {
        company = await prisma.company.create({
          data: {
            trademapId: norm.trademapId,
            ...companyPayload,
          },
        });
        isInsert = true;
      }
    }

    // 3. Connect CompanyProduct relation
    if (norm.hsCode && company) {
      const existingProd = await prisma.companyProduct.findFirst({
        where: {
          companyId: company.id,
          hsCode: norm.hsCode,
        },
      });

      if (!existingProd) {
        await prisma.companyProduct.create({
          data: {
            companyId: company.id,
            hsCode: norm.hsCode,
            productCategory: `HS ${norm.hsCode} Sector`,
            tradeType: norm.tradeFlow || 'Exporter',
          },
        }).catch(() => {});
      }
    }

    return { status: isInsert ? 'inserted' : 'updated' };
  } catch (err) {
    return { status: 'failed', reason: err.message || String(err) };
  }
}

// ============================================================
// API REQUEST THROUGH AUTHENTICATED BROWSER CONTEXT
// ============================================================
async function fetchTradeMapApiPage(page, { tradeFlow, product, country, pageNum, size, sortDir = 'asc' }, capturedHeaders = {}) {
  const apiUrl = `https://www.trademap.org/api/companies?tradeFlow=${encodeURIComponent(tradeFlow)}&product=${encodeURIComponent(product)}&productType=p&country=${encodeURIComponent(country)}&page=${pageNum}&size=${size}&sortBy=companyName&sortDir=${encodeURIComponent(sortDir)}`;

  return page.evaluate(async ({ url, headers }) => {
    try {
      const resp = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          ...headers,
          Accept: 'application/json, text/plain, */*',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      // Detect redirects (e.g. redirect to account-blocked or login)
      if (resp.redirected) {
        return {
          ok: false,
          redirected: true,
          status: resp.status,
          url: resp.url,
          error: `Redirected to ${resp.url}`,
        };
      }

      if (!resp.ok) {
        return {
          ok: false,
          status: resp.status,
          statusText: resp.statusText,
          url: resp.url,
          error: `HTTP ${resp.status} ${resp.statusText}`,
        };
      }

      const text = await resp.text();
      try {
        const json = JSON.parse(text);
        return { ok: true, status: 200, data: json };
      } catch (jsonErr) {
        return {
          ok: false,
          status: 200,
          error: 'MALFORMED_JSON',
          rawPreview: text.slice(0, 300),
        };
      }
    } catch (networkErr) {
      return {
        ok: false,
        status: 0,
        error: networkErr.message || String(networkErr),
      };
    }
  }, { url: apiUrl, headers: capturedHeaders });
}

// ============================================================
// MAIN EXTRACTION WORKER
// ============================================================
async function main() {
  console.log('\n' + '='.repeat(68));
  console.log('⚡  TradeScan JSON API EXTRACTION ENGINE');
  console.log('    Source: GET https://www.trademap.org/api/companies');
  console.log('='.repeat(68));

  const cli = parseCliArgs();

  // 1. Configurable Parameters (Requirement 13)
  let hsCode = cli.hs;
  if (!hsCode) {
    const hsInput = await ask(`HS Code (default: ${CONFIG.DEFAULT_HS}): `);
    hsCode = hsInput.trim() || CONFIG.DEFAULT_HS;
  }

  let countryCode = cli.country;
  if (!countryCode) {
    const countryInput = await ask(`Country code (default: ${CONFIG.DEFAULT_COUNTRY} = World): `);
    countryCode = countryInput.trim() || CONFIG.DEFAULT_COUNTRY;
  }

  let tradeFlow = (cli.flow || '').toUpperCase();
  if (!['E', 'I'].includes(tradeFlow)) {
    const flowInput = await ask(`Trade Flow (E = Exports, I = Imports | default: E): `);
    tradeFlow = flowInput.trim().toUpperCase() === 'I' ? 'I' : 'E';
  }

  const sortDir = (cli.sortdir || cli.sort || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
  const pageSize = CONFIG.PAGE_SIZE; // 100 per requirement 5

  console.log('\n' + '─'.repeat(68));
  console.log(`🎯 Target Product : HS ${hsCode}`);
  console.log(`🌍 Target Country : ${COUNTRY_MAP[countryCode] || countryCode} (${countryCode})`);
  console.log(`🔄 Trade Flow     : ${tradeFlow === 'E' ? 'Exports' : 'Imports'} (code: ${tradeFlow})`);
  console.log(`🔃 Sort Direction : ${sortDir.toUpperCase()} (${sortDir === 'desc' ? 'Z to A' : 'A to Z'})`);
  console.log(`📄 Page Size      : ${pageSize}`);
  console.log('─'.repeat(68) + '\n');

  // 2. Checkpoint & Resume Evaluation (Requirement 9)
  let startPage = 1;
  let metrics = {
    totalApiRecords: 0,
    totalProcessed: 0,
    totalInserted: 0,
    totalUpdated: 0,
    totalDuplicates: 0,
    totalFailed: 0,
    lastSuccessfulPage: 0,
    nbPages: 0,
  };

  const checkpoint = loadCheckpoint(hsCode, countryCode, tradeFlow, sortDir);
  if (checkpoint && checkpoint.lastSuccessfulPage > 0) {
    console.log(`🔄 Checkpoint found for HS ${hsCode} (${countryCode}):`);
    console.log(`   Last successful page: ${checkpoint.lastSuccessfulPage} / ${checkpoint.nbPages || '?'}`);
    console.log(`   Previously inserted : ${checkpoint.totalInserted || 0}`);
    console.log(`   Previously updated  : ${checkpoint.totalUpdated || 0}`);

    let resumeChoice = cli.resume ? 'y' : '';
    if (!resumeChoice) {
      resumeChoice = await ask(`   Resume from page ${checkpoint.lastSuccessfulPage + 1}? (y = resume, n = fresh start): `);
    }

    if (resumeChoice.toLowerCase() === 'y') {
      startPage = checkpoint.lastSuccessfulPage + 1;
      metrics = { ...checkpoint };
      console.log(`✅ Resuming execution from Page ${startPage} (already completed pages will be skipped).\n`);
    } else {
      clearCheckpoint(hsCode, countryCode, tradeFlow, sortDir);
      console.log(`🆕 Starting fresh from Page 1.\n`);
    }
  }

  // 3. Launch Authenticated Chrome Context (Requirement 4)
  console.log(`🔄 Initializing TradeMap session context...`);
  console.log(`   Profile directory: ${CONFIG.PROFILE_DIR}`);

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
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: null,
    locale: 'en-US',
  });

  const page = await context.newPage();

  // Intercept authentic request headers sent by TradeMap frontend
  let capturedHeaders = {};
  page.on('request', (req) => {
    if (req.url().includes('/api/companies')) {
      const h = req.headers();
      capturedHeaders = { ...capturedHeaders, ...h };
    }
  });

  // Navigate to TradeMap to establish origin and verify session
  console.log(`🌐 Connecting to TradeMap origin...`);
  const initialUrl = `${CONFIG.TRADEMAP_BASE}/en/goods/companies/c/${countryCode}/${tradeFlow === 'I' ? 'imports' : 'exports'}/p/${hsCode}`;
  await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(3000);

  // Check if session is blocked or unauthenticated
  const sessionCheck = await page.evaluate(() => {
    const body = document.body ? document.body.innerText : '';
    const isBlocked = body.includes('account-blocked') || window.location.href.includes('account-blocked');
    const isSignIn = body.includes('Sign in') || body.includes('Register') || window.location.href.includes('Sign-in');
    return { isBlocked, isSignIn, url: window.location.href };
  });

  if (sessionCheck.isBlocked || sessionCheck.isSignIn) {
    console.log(`\n⚠️  Authentication or Verification notice detected:`);
    console.log(`   Current URL: ${sessionCheck.url}`);
    console.log(`👉 Please ensure you are logged into TradeMap in the opened Chrome browser.`);
    await ask(`👉 Once logged in and ready, press ENTER to begin extraction: `);
  }

  console.log(`\n🚀 TradeMap JSON API Engine active. Starting pagination loop...\n`);

  let currentPage = startPage;
  let totalNbPages = metrics.nbPages || 0;
  let isHaltedByPlatform = false;

  // 4. Main Pagination Loop (Requirements 5 & 10)
  while (true) {
    // Stop condition: if totalNbPages is known and we exceeded it
    if (totalNbPages > 0 && currentPage > totalNbPages) {
      console.log(`\n🏁 Completed all ${totalNbPages} pages!`);
      break;
    }

    const pageDisplay = totalNbPages > 0 ? `${currentPage}/${totalNbPages}` : `${currentPage}`;
    console.log(`[TradeMap] Page ${pageDisplay}`);

    // Fetch page with retry logic
    let apiResult = null;
    let attempt = 0;

    while (attempt < CONFIG.MAX_RETRIES_PER_PAGE) {
      attempt++;
      apiResult = await fetchTradeMapApiPage(page, {
        tradeFlow,
        product: hsCode,
        country: countryCode,
        pageNum: currentPage,
        size: pageSize,
        sortDir,
      }, capturedHeaders);

      if (apiResult.ok) break;

      // Check if redirected to account-blocked or sign-in (Requirement 15)
      if (apiResult.redirected || (apiResult.url && apiResult.url.includes('account-blocked'))) {
        console.log(`\n⚠️  [TradeMap] Platform limit detected: TradeMap redirected to account-blocked.`);
        console.log(`   URL: ${apiResult.url}`);
        isHaltedByPlatform = true;
        break;
      }

      if (apiResult.status === 401 || apiResult.status === 403) {
        console.log(`\n⚠️  [TradeMap] Session authorization expired (HTTP ${apiResult.status}).`);
        isHaltedByPlatform = true;
        break;
      }

      if (apiResult.status === 429) {
        console.log(`\n⚠️  [TradeMap] Rate limit hit (HTTP 429).`);
        isHaltedByPlatform = true;
        break;
      }

      // Retry on network errors / timeouts
      console.log(`   ⚠️ Attempt ${attempt} failed: ${apiResult.error}. Retrying in ${attempt * 3}s...`);
      await sleep(attempt * 3000);
    }

    // If platform limitation reached, checkpoint and cleanly exit (Requirement 15)
    if (isHaltedByPlatform || !apiResult || !apiResult.ok) {
      saveCheckpoint(hsCode, countryCode, tradeFlow, sortDir, metrics);
      console.log(`\n💾 [TradeMap] Checkpointed successfully at last complete page: ${metrics.lastSuccessfulPage}`);
      console.log(`🛑 Stopping extraction cleanly without attempting evasion.`);
      break;
    }

    const data = apiResult.data;

    // Validate response structure (Requirement 10)
    if (!data || typeof data !== 'object') {
      console.log(`   ❌ Malformed response received at page ${currentPage}. Skipping.`);
      metrics.totalFailed++;
      currentPage++;
      continue;
    }

    // Dynamic total pages detection (Requirement 5)
    if (typeof data.nbPages === 'number' && data.nbPages > 0) {
      totalNbPages = data.nbPages;
      metrics.nbPages = totalNbPages;
    }
    if (typeof data.nbRecords === 'number') {
      metrics.totalApiRecords = data.nbRecords;
    }

    const records = Array.isArray(data.records) ? data.records : [];
    console.log(`[TradeMap] Received ${records.length} records`);

    if (records.length === 0) {
      console.log(`   ℹ️ No records found on page ${currentPage}. End of available results.`);
      metrics.lastSuccessfulPage = currentPage;
      saveCheckpoint(hsCode, countryCode, tradeFlow, metrics);
      break;
    }

    // Process & Upsert every object inside records[] (Requirements 6, 7, 8)
    let pageInserted = 0;
    let pageUpdated = 0;
    let pageDuplicates = 0;
    let pageFailed = 0;

    for (const raw of records) {
      metrics.totalProcessed++;
      const norm = normalizeRecord(raw, hsCode, tradeFlow);

      if (!norm.trademapId) {
        metrics.totalFailed++;
        pageFailed++;
        continue;
      }

      const res = await upsertCompanyRecord(norm);
      if (res.status === 'inserted') {
        metrics.totalInserted++;
        pageInserted++;
      } else if (res.status === 'updated') {
        metrics.totalUpdated++;
        pageUpdated++;
      } else {
        metrics.totalFailed++;
        pageFailed++;
      }
    }

    // Log progress (Requirement 11)
    console.log(`[TradeMap] Inserted: ${pageInserted}`);
    console.log(`[TradeMap] Duplicates: ${pageUpdated}`);
    if (pageFailed > 0) {
      console.log(`[TradeMap] Failed: ${pageFailed}`);
    }

    // Checkpoint after successful page (Requirement 9)
    metrics.lastSuccessfulPage = currentPage;
    saveCheckpoint(hsCode, countryCode, tradeFlow, sortDir, metrics);

    // Natural delay between pages
    await sleep(CONFIG.REQUEST_DELAY_MS);

    currentPage++;
  }

  // 5. Final Metrics Summary (Requirement 12)
  console.log('\n' + '='.repeat(68));
  console.log('📊 TradeMap API Extraction Summary');
  console.log('='.repeat(68));
  console.log(`Total API records    : ${metrics.totalApiRecords || 'Unknown'}`);
  console.log(`Total processed      : ${metrics.totalProcessed}`);
  console.log(`Total inserted       : ${metrics.totalInserted}`);
  console.log(`Total updated        : ${metrics.totalUpdated}`);
  console.log(`Total duplicates     : ${metrics.totalUpdated}`);
  console.log(`Total failed         : ${metrics.totalFailed}`);
  console.log(`Last successful page : ${metrics.lastSuccessfulPage}`);
  console.log('='.repeat(68) + '\n');

  await context.close().catch(() => {});
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('\n❌ Fatal execution error:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
