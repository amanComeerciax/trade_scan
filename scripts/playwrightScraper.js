const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const COUNTRY_CODES = {
  india: "699",
  germany: "276",
  vietnam: "704",
  china: "156",
  "united states": "842",
  usa: "842",
  brazil: "076",
  "united arab emirates": "784",
  uae: "784",
  singapore: "702",
  france: "251",
  italy: "381",
  japan: "392",
  "united kingdom": "826",
  uk: "826",
};

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );
}

function getInstalledChromeProfiles() {
  const localStatePath = path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data', 'Local State');
  if (fs.existsSync(localStatePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
      const cache = data.profile?.info_cache || {};
      return Object.keys(cache).map((dir) => ({
        dir,
        name: cache[dir].name || dir,
        userName: cache[dir].user_name || '',
        gaiaName: cache[dir].gaia_name || '',
      }));
    } catch {
      return [];
    }
  }
  return [];
}

async function saveCompanyToDb({ name, country, city, website, sourceUrl, hsCode, tradeType }) {
  if (!name || !name.trim()) return false;
  try {
    const cleanName = name.trim();
    const cleanCountry = country.trim();

    const company = await prisma.company.upsert({
      where: {
        name_country: {
          name: cleanName,
          country: cleanCountry,
        },
      },
      update: {
        city: city || undefined,
        address: city ? `${city}, ${cleanCountry}` : cleanCountry,
        website: website || undefined,
        sourceUrl: sourceUrl || undefined,
      },
      create: {
        name: cleanName,
        country: cleanCountry,
        city: city || undefined,
        address: city ? `${city}, ${cleanCountry}` : cleanCountry,
        website: website || undefined,
        sourceUrl: sourceUrl || undefined,
      },
    });

    if (hsCode) {
      const prodId = `prod_${company.id}_${hsCode}`;
      const existing = await prisma.companyProduct.findFirst({
        where: { companyId: company.id, hsCode },
      });
      if (!existing) {
        await prisma.companyProduct.create({
          data: {
            id: prodId,
            companyId: company.id,
            hsCode,
            productCategory: `HS ${hsCode} Commodity Sector`,
            tradeType: tradeType || "Exporter",
          },
        }).catch(() => {});
      }
    }
    return true;
  } catch (err) {
    return false;
  }
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const detectedProfiles = getInstalledChromeProfiles();

  console.log('\n======================================================');
  console.log('🌐 TradeScan Playwright Scraper - Account Selection');
  console.log('======================================================');
  console.log('Detected Google Chrome Accounts:');
  detectedProfiles.forEach((p, idx) => {
    const label = p.gaiaName ? `${p.gaiaName} (${p.userName || p.name})` : p.name;
    console.log(`  [${idx + 1}] ${label}`);
  });
  console.log(`  [${detectedProfiles.length + 1}] Fresh Clean Profile (New Session)`);
  console.log('------------------------------------------------------');

  let selectedProfileDirName = 'profile-divythakkar';
  let accountDisplayName = 'Divy Thakkar';

  if (rawArgs.length === 0) {
    const choice = await askQuestion(`Select Account to open [1-${detectedProfiles.length + 1}] (default 1): `);
    const chosenIdx = parseInt(choice || '1', 10) - 1;

    if (chosenIdx >= 0 && chosenIdx < detectedProfiles.length) {
      const prof = detectedProfiles[chosenIdx];
      selectedProfileDirName = `profile-${prof.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      accountDisplayName = prof.gaiaName ? `${prof.gaiaName} (${p => p.userName || p.name})` : prof.name;
    } else {
      selectedProfileDirName = 'profile-fresh';
      accountDisplayName = 'Fresh Clean Profile';
    }
  }

  console.log(`✓ Selected Account: ${accountDisplayName}`);

  const countryInput = await askQuestion('Target Country (default India): ');
  const country = countryInput || 'India';

  const hsInput = await askQuestion('Commodity / HS Code (default 0901 for Coffee): ');
  const hsCode = hsInput || '0901';

  const pagesInput = await askQuestion('Number of Pages to scrape (default 3): ');
  const maxPages = parseInt(pagesInput || '3', 10);

  const countryCode = COUNTRY_CODES[country.toLowerCase()] || '699';
  const targetUrl = `https://www.trademap.org/en/goods/companies/c/${countryCode}/exports/p/${hsCode}`;

  console.log('\n======================================================');
  console.log(`🚀 Starting Playwright Scraper with: ${accountDisplayName}`);
  console.log(`   Target Country   : ${country} (${countryCode})`);
  console.log(`   HS Code          : ${hsCode}`);
  console.log(`   Max Pages        : ${maxPages}`);
  console.log(`   Target URL       : ${targetUrl}`);
  console.log('======================================================\n');

  // Dedicated data directory per chosen profile (avoids Chrome security error)
  const sessionDir = path.resolve(__dirname, '..', `.chrome-${selectedProfileDirName}`);

  console.log(`Launching Google Chrome (${accountDisplayName})...`);
  const context = await chromium.launchPersistentContext(sessionDir, {
    channel: 'chrome',
    headless: false,
    args: ['--start-maximized'],
    viewport: null,
  });

  const page = context.pages()[0] || (await context.newPage());

  let totalSaved = 0;
  const seenNames = new Set();

  // Real-time network interception
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/companies') && !url.includes('/contact')) {
      try {
        const data = await response.json();
        if (data && Array.isArray(data.records)) {
          for (const rec of data.records) {
            if (rec.name && !seenNames.has(rec.name.toLowerCase().trim())) {
              seenNames.add(rec.name.toLowerCase().trim());
              const ok = await saveCompanyToDb({
                name: rec.name,
                country,
                city: rec.city,
                website: rec.website,
                sourceUrl: `https://www.trademap.org/companies/${rec.id || ''}`,
                hsCode,
                tradeType: Array.isArray(rec.activities) ? rec.activities.join(', ') : 'Exporter',
              });
              if (ok) totalSaved++;
            }
          }
        }
      } catch (e) {}
    }
  });

  console.log(`Navigating to ${targetUrl}...`);
  await page.bringToFront().catch(() => {});
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('Nav error:', e.message));

  // Check if login prompt is needed
  await page.waitForTimeout(3000);
  const isLoggedOut = await page.evaluate(() => {
    const text = document.body.innerText || '';
    return text.includes('Sign in or register') || text.includes('Register or login now');
  });

  if (isLoggedOut) {
    console.log('\n------------------------------------------------------');
    console.log('💡 TIP: Agar aap apna TradeMap account login karna chahein');
    console.log('   toh browser window mein jaakar login kar lein.');
    console.log('   (Yeh login is account mein hamesha ke liye save ho jayega!)');
    console.log('------------------------------------------------------');
    await askQuestion('\n👉 Browser ready hone par yahan Terminal mein ENTER dabayein: ');
  }

  // Pagination loop
  for (let p = 1; p <= maxPages; p++) {
    console.log(`\n⏳ [Page ${p}/${maxPages}] Waiting for companies table to load...`);

    // Poll until rows appear
    for (let waitAttempt = 1; waitAttempt <= 10; waitAttempt++) {
      if (page.isClosed()) break;
      const rowCount = await page.$$eval('table tr, [role="row"]', (r) => r.length).catch(() => 0);
      if (rowCount > 1) break;
      await page.waitForTimeout(2000).catch(() => {});
    }

    if (page.isClosed()) {
      console.log('Browser was closed by user.');
      break;
    }

    const domCompanies = await page.$$eval('table tr, [role="row"]', (rows) => {
      return rows.map((r) => {
        const cells = Array.from(r.querySelectorAll('td, [role="cell"]')).map((c) => c.innerText.trim());
        const link = r.querySelector('a')?.getAttribute('href') || '';
        if (cells.length >= 2) {
          return { name: cells[0], city: cells[1], website: cells[2] || '', link };
        }
        const parts = r.innerText.split('\t').map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          return { name: parts[0], city: parts[1], website: parts[2] || '', link };
        }
        return null;
      }).filter((c) => c && c.name && !c.name.toLowerCase().includes('company name') && !c.name.includes('New Trade Map'));
    }).catch(() => []);

    console.log(`   Found ${domCompanies.length} companies on Page ${p}`);

    for (const c of domCompanies) {
      const key = c.name.toLowerCase().trim();
      if (!seenNames.has(key)) {
        seenNames.add(key);
        console.log(`   • ${c.name} (${c.city || 'India'})`);
        const ok = await saveCompanyToDb({
          name: c.name,
          country,
          city: c.city,
          website: c.website.startsWith('http') ? c.website : (c.website ? `https://${c.website}` : undefined),
          sourceUrl: c.link ? (c.link.startsWith('http') ? c.link : `https://www.trademap.org${c.link}`) : undefined,
          hsCode,
        });
        if (ok) totalSaved++;
      }
    }

    console.log(`   ✓ Total saved in database: ${totalSaved}`);

    if (p >= maxPages) break;

    const pageClicked = await page.evaluate((nextPageNum) => {
      const numBtn = Array.from(document.querySelectorAll('button, a')).find(
        (el) => el.innerText.trim() === String(nextPageNum)
      );
      if (numBtn) {
        numBtn.click();
        return true;
      }
      const nextBtn = Array.from(document.querySelectorAll('button, a')).find(
        (el) =>
          el.getAttribute('aria-label')?.includes('Next') ||
          el.innerText.trim() === '›' ||
          el.innerText.trim() === '»'
      );
      if (nextBtn) {
        nextBtn.click();
        return true;
      }
      return false;
    }, p + 1).catch(() => false);

    if (pageClicked) {
      console.log(`   ➡️ Navigating to Page ${p + 1}...`);
      await page.waitForTimeout(4000).catch(() => {});
    } else {
      console.log(`   No next page button found. Finished.`);
      break;
    }
  }

  console.log('\n======================================================');
  console.log(`🎉 SCRAPING COMPLETED!`);
  console.log(`   Total Companies in SQLite Database: ${totalSaved}`);
  console.log(`   Open your dashboard at: http://localhost:3000`);
  console.log('======================================================\n');

  console.log('Browser will close in 5 seconds...');
  await page.waitForTimeout(5000).catch(() => {});
  await context.close().catch(() => {});
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Playwright Scraper Error:', err);
  process.exit(1);
});
