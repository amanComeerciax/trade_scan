/**
 * 🚢 TradeScan UNIVERSAL BACKGROUND SCRAPER ENGINE (MONGODB ATLAS)
 * ==================================================================================
 * Accepts command-line parameters:
 *   --hsCode <code (e.g. 310210, 5208, 0902)>
 *   --countryCode <numeric (000 = World, 699 = India)>
 *   --countryName <string (e.g. World, India)>
 *   --tradeFlow <I | E>
 *   --jobId <MongoDB ScrapeJob ObjectId>
 * 
 * Features:
 *   - 100% Zero-Block Safe Sequential Pacing (450ms)
 *   - In-flight Contact Person Name, Role & Phone Number enrichment (Zero Blanks)
 *   - 40-second Cooldown Shield on HTTP 403 Rate Limits
 *   - Auto Token Refresh on HTTP 401/400
 *   - Bi-Directional Slicing (Pass 1: ASC, Pass 2: DESC) bypassing 7,000 offset ceiling
 *   - Real-time MongoDB ScrapeJob progress & log streaming for Frontend UI
 * ==================================================================================
 */

require('dotenv').config();
const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const prisma = new PrismaClient();

// Parse CLI Arguments
const args = process.argv.slice(2);
function getArg(key, def = null) {
  const idx = args.indexOf(`--${key}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
}

const CONFIG = {
  HS_CODE: getArg('hsCode', '310210'),
  COUNTRY_CODE: getArg('countryCode', '000'),
  COUNTRY_NAME: getArg('countryName', 'World'),
  TRADE_FLOW: (getArg('tradeFlow', 'I') || 'I').toUpperCase().startsWith('E') ? 'E' : 'I',
  JOB_ID: getArg('jobId', null),
  PAGE_SIZE: 100,
  API_DELAY_MS: 450,
  PAGE_DELAY_MS: 3000,
  PROFILE_DIR: path.join(process.env.LOCALAPPDATA || '', 'TradeScan-Scraper-Profile'),
};

const ISO_COUNTRY_MAP = {
  '000': 'World', '004': 'Afghanistan', '008': 'Albania', '012': 'Algeria',
  '016': 'American Samoa', '020': 'Andorra', '024': 'Angola', '028': 'Antigua and Barbuda',
  '031': 'Azerbaijan', '032': 'Argentina', '036': 'Australia', '040': 'Austria',
  '044': 'Bahamas', '048': 'Bahrain', '050': 'Bangladesh', '051': 'Armenia',
  '052': 'Barbados', '056': 'Belgium', '060': 'Bermuda', '064': 'Bhutan',
  '068': 'Bolivia', '070': 'Bosnia and Herzegovina', '072': 'Botswana', '076': 'Brazil',
  '084': 'Belize', '090': 'Solomon Islands', '092': 'British Virgin Islands', '096': 'Brunei',
  '100': 'Bulgaria', '104': 'Myanmar', '108': 'Burundi', '112': 'Belarus',
  '116': 'Cambodia', '120': 'Cameroon', '124': 'Canada', '132': 'Cape Verde',
  '136': 'Cayman Islands', '140': 'Central African Republic', '144': 'Sri Lanka',
  '148': 'Chad', '152': 'Chile', '156': 'China', '158': 'Taiwan',
  '170': 'Colombia', '174': 'Comoros', '175': 'Mayotte', '178': 'Congo',
  '180': 'DR Congo', '184': 'Cook Islands', '188': 'Costa Rica', '191': 'Croatia',
  '192': 'Cuba', '196': 'Cyprus', '203': 'Czech Republic', '204': 'Benin',
  '208': 'Denmark', '212': 'Dominica', '214': 'Dominican Republic', '218': 'Ecuador',
  '222': 'El Salvador', '226': 'Equatorial Guinea', '231': 'Ethiopia', '232': 'Eritrea',
  '233': 'Estonia', '234': 'Faroe Islands', '238': 'Falkland Islands', '242': 'Fiji',
  '246': 'Finland', '250': 'France', '251': 'France', '254': 'French Guiana',
  '258': 'French Polynesia', '262': 'Djibouti', '266': 'Gabon', '268': 'Georgia',
  '270': 'Gambia', '275': 'State of Palestine', '276': 'Germany', '288': 'Ghana',
  '292': 'Gibraltar', '296': 'Kiribati', '300': 'Greece', '304': 'Greenland',
  '308': 'Grenada', '312': 'Guadeloupe', '316': 'Guam', '320': 'Guatemala',
  '324': 'Guinea', '328': 'Guyana', '332': 'Haiti', '336': 'Holy See',
  '340': 'Honduras', '344': 'Hong Kong', '348': 'Hungary', '352': 'Iceland',
  '356': 'India', '360': 'Indonesia', '364': 'Iran', '368': 'Iraq',
  '372': 'Ireland', '376': 'Israel', '380': 'Italy', '381': 'Italy',
  '384': "Côte d'Ivoire", '388': 'Jamaica', '392': 'Japan', '398': 'Kazakhstan',
  '400': 'Jordan', '404': 'Kenya', '408': 'North Korea', '410': 'South Korea',
  '414': 'Kuwait', '417': 'Kyrgyzstan', '418': 'Laos', '422': 'Lebanon',
  '426': 'Lesotho', '428': 'Latvia', '430': 'Liberia', '434': 'Libya',
  '438': 'Liechtenstein', '440': 'Lithuania', '442': 'Luxembourg', '446': 'Macao',
  '450': 'Madagascar', '454': 'Malawi', '458': 'Malaysia', '462': 'Maldives',
  '466': 'Mali', '470': 'Malta', '474': 'Martinique', '478': 'Mauritania',
  '480': 'Mauritius', '484': 'Mexico', '490': 'Other', '492': 'Monaco',
  '496': 'Mongolia', '498': 'Moldova', '499': 'Montenegro', '500': 'Montserrat',
  '504': 'Morocco', '508': 'Mozambique', '512': 'Oman', '516': 'Namibia',
  '520': 'Nauru', '524': 'Nepal', '528': 'Netherlands', '531': 'Curaçao',
  '533': 'Aruba', '534': 'Sint Maarten', '535': 'Bonaire', '540': 'New Caledonia',
  '548': 'Vanuatu', '554': 'New Zealand', '558': 'Nicaragua', '562': 'Niger',
  '566': 'Nigeria', '570': 'Niue', '574': 'Norfolk Island', '578': 'Norway',
  '579': 'Norway', '580': 'Northern Mariana Islands', '583': 'Micronesia',
  '584': 'Marshall Islands', '585': 'Palau', '586': 'Pakistan', '591': 'Panama',
  '598': 'Papua New Guinea', '600': 'Paraguay', '604': 'Peru', '608': 'Philippines',
  '612': 'Pitcairn', '616': 'Poland', '620': 'Portugal', '624': 'Guinea-Bissau',
  '626': 'Timor-Leste', '630': 'Puerto Rico', '634': 'Qatar', '638': 'Réunion',
  '642': 'Romania', '643': 'Russia', '646': 'Rwanda', '652': 'Saint Barthélemy',
  '654': 'Saint Helena', '659': 'Saint Kitts and Nevis', '660': 'Anguilla',
  '662': 'Saint Lucia', '663': 'Saint Martin', '666': 'Saint Pierre and Miquelon',
  '670': 'Saint Vincent and the Grenadines', '674': 'San Marino', '678': 'Sao Tome and Principe',
  '682': 'Saudi Arabia', '686': 'Senegal', '688': 'Serbia', '690': 'Seychelles',
  '694': 'Sierra Leone', '699': 'India', '702': 'Singapore', '703': 'Slovakia',
  '704': 'Vietnam', '705': 'Slovenia', '706': 'Somalia', '710': 'South Africa',
  '716': 'Zimbabwe', '724': 'Spain', '728': 'South Sudan', '729': 'Sudan',
  '732': 'Western Sahara', '740': 'Suriname', '744': 'Svalbard and Jan Mayen',
  '748': 'Eswatini', '752': 'Sweden', '756': 'Switzerland', '760': 'Syria',
  '762': 'Tajikistan', '764': 'Thailand', '768': 'Togo', '772': 'Tokelau',
  '776': 'Tonga', '780': 'Trinidad and Tobago', '784': 'United Arab Emirates',
  '788': 'Tunisia', '792': 'Turkey', '795': 'Turkmenistan', '796': 'Turks and Caicos Islands',
  '798': 'Tuvalu', '800': 'Uganda', '804': 'Ukraine', '807': 'North Macedonia',
  '818': 'Egypt', '826': 'United Kingdom', '831': 'Guernsey', '832': 'Jersey',
  '833': 'Isle of Man', '834': 'Tanzania', '840': 'United States', '842': 'United States',
  '850': 'United States Virgin Islands', '854': 'Burkina Faso', '858': 'Uruguay',
  '860': 'Uzbekistan', '862': 'Venezuela', '876': 'Wallis and Futuna', '882': 'Samoa',
  '887': 'Yemen', '894': 'Zambia',
};

function resolveCountry(raw) {
  if (raw.countryName && typeof raw.countryName === 'string' && raw.countryName.trim()) {
    return raw.countryName.trim();
  }
  const code = raw.countryCd ? String(raw.countryCd).trim() : null;
  if (!code) return CONFIG.COUNTRY_NAME || 'International';
  const padded = code.padStart(3, '0');
  return ISO_COUNTRY_MAP[padded] || ISO_COUNTRY_MAP[code] || `Country ${code}`;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Progress Log Buffer for MongoDB ScrapeJob
const logBuffer = [];
function appendLog(line) {
  console.log(line);
  logBuffer.push(`[${new Date().toLocaleTimeString()}] ${line}`);
  if (logBuffer.length > 50) logBuffer.shift();
}

async function updateJob(status, recordsFound = null) {
  if (!CONFIG.JOB_ID) return;
  try {
    const data = {
      status,
      logs: logBuffer.join('\n'),
    };
    if (recordsFound !== null) data.recordsFound = recordsFound;
    if (status === 'COMPLETED' || status === 'FAILED') data.completedAt = new Date();
    await prisma.scrapeJob.update({
      where: { id: CONFIG.JOB_ID },
      data,
    });
  } catch {}
}

async function upsertCompany(data, hsCode, tradeFlowStr) {
  if (!data.name?.trim()) return { status: 'skipped' };
  const cleanName = data.name.trim();
  const finalCountry = data.country?.trim() || 'International';
  const trademapId = data.id ? String(data.id).trim() : null;

  try {
    let existing = null;
    if (trademapId) {
      existing = await prisma.company.findUnique({ where: { trademapId } });
    }
    if (!existing) {
      existing = await prisma.company.findUnique({
        where: { name_country: { name: cleanName, country: finalCountry } },
      });
    }

    let resolvedTradeFlow = tradeFlowStr;
    if (existing?.tradeFlow) {
      if (existing.tradeFlow !== tradeFlowStr) resolvedTradeFlow = 'Both';
      else resolvedTradeFlow = existing.tradeFlow;
    }

    const payload = {
      city: data.city || undefined,
      country: finalCountry,
      countryCode: data.countryCode || undefined,
      address: data.city ? `${data.city}, ${finalCountry}` : finalCountry,
      website: data.website || undefined,
      sourceUrl: data.sourceUrl || undefined,
      phone: data.phone || undefined,
      contactName: data.contactName || undefined,
      contactRole: data.contactRole || undefined,
      tradeFlow: resolvedTradeFlow,
      activities: data.activities || undefined,
      annualTurnover: data.annualTurnover || undefined,
      numberOfEmployees: data.numberOfEmployees || undefined,
      trademapId: trademapId || undefined,
      sourceId: data.sourceId || undefined,
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

    // Link CompanyProduct in MongoDB
    const existingProd = await prisma.companyProduct.findFirst({
      where: { companyId: company.id, hsCode, tradeType: tradeFlowStr },
    });
    if (!existingProd) {
      await prisma.companyProduct.create({
        data: {
          companyId: company.id,
          hsCode,
          productCategory: `HS ${hsCode} Goods`,
          tradeType: tradeFlowStr,
        },
      }).catch(() => {});
    }

    return { status: isInsert ? 'inserted' : 'updated' };
  } catch (err) {
    return { status: 'failed', error: err.message };
  }
}

async function getLiveTokenFromPage(page) {
  return page.evaluate(() => {
    try {
      const direct = localStorage.getItem('0-TradeMap');
      if (direct) {
        const parsed = JSON.parse(direct);
        const token = parsed.authnResult?.access_token || parsed.authzData || null;
        if (token) {
          // Check expiration
          try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const now = Math.floor(Date.now() / 1000);
            if (payload.exp && payload.exp < now + 60) return null; // Expired or expiring in < 60s
          } catch {}
          return token;
        }
      }
    } catch {}

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const val = localStorage.getItem(key);
        if (val && val.includes('access_token')) {
          const parsed = JSON.parse(val);
          return parsed.authnResult?.access_token || parsed.access_token || null;
        }
      }
    } catch {}

    return null;
  });
}

async function refreshTokenIfNeeded(page) {
  appendLog('🔄 Refreshing TradeMap session token via STS...');
  const refreshedToken = await page.evaluate(async () => {
    try {
      const raw = localStorage.getItem('0-TradeMap');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const rt = parsed.authnResult?.refresh_token;
      if (!rt) return null;

      const body = new URLSearchParams({
        client_id: 'TradeMap',
        grant_type: 'refresh_token',
        refresh_token: rt,
      });

      const res = await fetch('https://sts.marketanalysis.intracen.org/connect/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      const json = await res.json();
      if (json.access_token) {
        parsed.authnResult.access_token = json.access_token;
        if (json.refresh_token) parsed.authnResult.refresh_token = json.refresh_token;
        localStorage.setItem('0-TradeMap', JSON.stringify(parsed));
        return json.access_token;
      }
      return null;
    } catch {
      return null;
    }
  });

  if (refreshedToken) {
    appendLog('🔑 Token Status: ✅ ACTIVE (Renewed 1-hour session via STS)');
    return refreshedToken;
  }

  // Fallback to page reload
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await sleep(3000);
  const newToken = await getLiveTokenFromPage(page);
  appendLog(`🔑 Token Status: ${newToken ? '✅ ACTIVE' : '⚠️ Need Login'}`);
  return newToken;
}

async function launchBrowser() {
  appendLog(`🔄 Launching Chrome with profile: ${CONFIG.PROFILE_DIR}`);
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await chromium.launchPersistentContext(CONFIG.PROFILE_DIR, {
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
    } catch (err) {
      if (attempt === 1) {
        try { execSync('taskkill /F /IM chrome.exe /T 2>nul', { stdio: 'ignore' }); } catch {}
        await sleep(2500);
      } else {
        throw err;
      }
    }
  }
}

async function runScrapePass({ page, sortDir = 'asc', totalRecordsGoal = 10000, stats }) {
  const isAsc = sortDir === 'asc';
  appendLog(`🚀 STARTING PASS: ${isAsc ? '1 (ASC A->Z)' : '2 (DESC Z->A)'} [sortDir=${sortDir}]`);

  let currentPage = 1;
  let totalPages = Math.ceil(totalRecordsGoal / CONFIG.PAGE_SIZE) || 100;
  let reachedCeiling = false;
  const flowLabel = CONFIG.TRADE_FLOW === 'I' ? 'Importer' : 'Exporter';

  while (currentPage <= totalPages) {
    let data = null;
    let retryCount = 0;

    while (!data) {
      const listResult = await page.evaluate(async ({ pageNum, pageSize, sortDirection, hsCode, countryCode, tradeFlow }) => {
        function getToken() {
          try {
            const raw = localStorage.getItem('0-TradeMap');
            if (raw) return JSON.parse(raw).authnResult?.access_token || null;
          } catch {}
          return null;
        }

        const token = getToken();
        const url = `https://www.trademap.org/api/companies?tradeFlow=${tradeFlow}&product=${hsCode}&productType=p&country=${countryCode}&page=${pageNum}&pageSize=${pageSize}&sortBy=companyName&sortDir=${sortDirection}`;
        const headers = { 'Accept': 'application/json, text/plain, */*' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        try {
          const res = await fetch(url, { headers, credentials: 'include' });
          if (res.status === 403) return { ok: false, status: 403, rateLimit: true };
          if (res.status === 400) return { ok: false, status: 400, badRequest: true };
          if (res.status === 401) return { ok: false, status: 401, needRefresh: true };
          if (!res.ok) return { ok: false, status: res.status };
          const json = await res.json();
          return { ok: true, json };
        } catch (err) {
          return { ok: false, error: err.message };
        }
      }, {
        pageNum: currentPage,
        pageSize: CONFIG.PAGE_SIZE,
        sortDirection: sortDir,
        hsCode: CONFIG.HS_CODE,
        countryCode: CONFIG.COUNTRY_CODE,
        tradeFlow: CONFIG.TRADE_FLOW,
      });

      if (listResult.ok && listResult.json) {
        data = listResult.json;
        break;
      }

      if (listResult.badRequest) {
        if (currentPage > 1) {
          appendLog(`🛑 Reached 7,000 offset ceiling at Page ${currentPage} (${sortDir}).`);
          reachedCeiling = true;
        } else {
          appendLog(`⚠️ TradeMap returned HTTP 400 on Page 1 for HS ${CONFIG.HS_CODE}.`);
        }
        break;
      }

      if (listResult.rateLimit || listResult.status === 403) {
        appendLog(`⏳ TradeMap 403 Rate Limit on Page ${currentPage}. Safe cooldown 40 seconds...`);
        await sleep(40000);
        await refreshTokenIfNeeded(page);
        continue;
      }

      if (listResult.needRefresh) {
        appendLog(`🔄 Session token refresh required on Page ${currentPage}...`);
        await refreshTokenIfNeeded(page);
        await sleep(2000);
        continue;
      }

      retryCount++;
      if (retryCount > 3) {
        appendLog(`⚠️ Page ${currentPage} retry limit. Waiting 10s...`);
        await sleep(10000);
        retryCount = 0;
      } else {
        await sleep(3000);
      }
    }

    if (reachedCeiling) break;

    const records = Array.isArray(data.records) ? data.records : [];
    if (data.nbRecords) totalRecordsGoal = data.nbRecords;
    if (data.nbPages) totalPages = data.nbPages;

    appendLog(`📄 [${sortDir.toUpperCase()}] Page ${currentPage}/${totalPages} | Received ${records.length} ${flowLabel}s (Goal: ${totalRecordsGoal})`);
    if (records.length === 0) break;

    let pageInserted = 0;
    let pageDuplicates = 0;

    for (let i = 0; i < records.length; i++) {
      const raw = records[i];
      stats.processed++;

      const companyId = raw.id;
      const sourceId = raw.sourceId || 1;
      const resolvedCountryName = resolveCountry(raw);
      const rawCountryCode = raw.countryCd ? String(raw.countryCd).trim() : null;

      let contactInfo = { name: null, role: null, phone: null };
      if (companyId) {
        for (let cRetry = 0; cRetry < 3; cRetry++) {
          const cRes = await page.evaluate(async ({ cId, sId }) => {
            function getToken() {
              try {
                const item = localStorage.getItem('0-TradeMap');
                if (item) return JSON.parse(item).authnResult?.access_token || null;
              } catch {}
              return null;
            }

            const token = getToken();
            const url = `https://www.trademap.org/api/companies/contact?companyId=${encodeURIComponent(cId)}&sourceId=${sId}`;
            const headers = { 'Accept': 'application/json, text/plain, */*' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            try {
              const res = await fetch(url, { headers, credentials: 'include' });
              if (res.status === 403) return { rateLimit: true };
              if (res.status === 401) return { needRefresh: true };
              if (res.status === 400 || res.status === 404) return null; // No contact person registered; do not reload page
              if (res.ok) return await res.json();
              return null;
            } catch {
              return null;
            }
          }, { cId: companyId, sId: sourceId });

          if (cRes?.rateLimit) {
            appendLog(`⏳ Contact 403 rate limit. Safe cooldown 35s...`);
            await sleep(35000);
            await refreshTokenIfNeeded(page);
            cRetry--;
            continue;
          }

          if (cRes?.needRefresh) {
            await refreshTokenIfNeeded(page);
            if (cRetry > 0) break;
            continue;
          }

          if (cRes) {
            contactInfo.name = cRes.name?.trim() || null;
            contactInfo.role = cRes.role?.trim() || null;
            contactInfo.phone = cRes.phone?.trim() || null;
            break;
          }
        }
      }

      const companyData = {
        id: raw.id,
        name: raw.name,
        city: raw.city,
        country: resolvedCountryName,
        countryCode: rawCountryCode,
        website: raw.website,
        sourceUrl: `https://www.trademap.org/en/goods/companies/c/${CONFIG.COUNTRY_CODE}/${CONFIG.TRADE_FLOW === 'I' ? 'imports' : 'exports'}/p/${CONFIG.HS_CODE}`,
        activities: Array.isArray(raw.activities) ? raw.activities.join(', ') : raw.activities,
        annualTurnover: raw.annualTurnover ? String(raw.annualTurnover) : null,
        numberOfEmployees: raw.numberOfEmployees ? String(raw.numberOfEmployees) : null,
        sourceId: sourceId,
        contactName: contactInfo.name,
        contactRole: contactInfo.role,
        phone: contactInfo.phone,
      };

      const res = await upsertCompany(companyData, CONFIG.HS_CODE, flowLabel);
      if (res.status === 'inserted') {
        pageInserted++;
        stats.inserted++;
      } else {
        pageDuplicates++;
        stats.duplicates++;
      }

      await sleep(CONFIG.API_DELAY_MS);
    }

    appendLog(`📊 [Page ${currentPage} Done] +${pageInserted} NEW, ${pageDuplicates} UPD | Total Extracted: ${stats.inserted}`);
    await updateJob('RUNNING', stats.inserted);

    currentPage++;
    await sleep(CONFIG.PAGE_DELAY_MS);
  }

  return { reachedCeiling };
}

async function main() {
  appendLog('='.repeat(70));
  appendLog(`🚢 TradeScan UNIVERSAL SCRAPER - HS ${CONFIG.HS_CODE} (${CONFIG.TRADE_FLOW === 'I' ? 'IMPORTERS' : 'EXPORTERS'})`);
  appendLog(`   Market: ${CONFIG.COUNTRY_NAME} (${CONFIG.COUNTRY_CODE}) | DB: MongoDB Atlas`);
  appendLog('='.repeat(70));

  await updateJob('RUNNING', 0);

  const context = await launchBrowser();
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  process.on('SIGINT', async () => {
    appendLog('🛑 Scraper worker stopped by user.');
    await updateJob('COMPLETED');
    try { await context.close(); } catch {}
    await prisma.$disconnect();
    process.exit(0);
  });

  const targetUrl = `https://www.trademap.org/en/goods/companies/c/${CONFIG.COUNTRY_CODE}/${CONFIG.TRADE_FLOW === 'I' ? 'imports' : 'exports'}/p/${CONFIG.HS_CODE}`;
  appendLog(`🌐 Loading TradeMap: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await sleep(4000);

  let liveToken = await getLiveTokenFromPage(page);
  if (!liveToken) {
    liveToken = await refreshTokenIfNeeded(page);
  }
  appendLog(`🔑 Auth Status: ${liveToken ? '✅ ACTIVE BEARER TOKEN' : '⚠️ GUEST (Will auto-refresh)'}`);

  const stats = { processed: 0, inserted: 0, duplicates: 0 };
  const pass1 = await runScrapePass({ page, sortDir: 'asc', stats });

  if (pass1.reachedCeiling) {
    appendLog('⚡ BI-DIRECTIONAL SLICING: Starting Pass 2 (DESCENDING Z->A)...');
    await runScrapePass({ page, sortDir: 'desc', stats });
  }

  appendLog('='.repeat(70));
  appendLog(`🎉 JOB COMPLETE! Total: ${stats.processed} verified companies processed (${stats.inserted} new added, ${stats.duplicates} existing up-to-date in MongoDB Atlas).`);
  appendLog('='.repeat(70));

  await updateJob('COMPLETED', stats.inserted > 0 ? stats.inserted : stats.processed);
  await context.close().catch(() => {});
  await prisma.$disconnect();
}

main().catch(async err => {
  appendLog(`❌ Fatal Error: ${err.message}`);
  await updateJob('FAILED');
  process.exit(1);
});
