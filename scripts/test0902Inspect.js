const { chromium } = require('playwright');
const path = require('path');

async function inspect0902() {
  const profileDir = path.join(process.env.LOCALAPPDATA || '', 'TradeScan-Scraper-Profile');
  console.log('Testing TradeMap API for HS 0902 India (699)...');

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
  });

  const page = await context.newPage();

  console.log('Navigating to TradeMap base...');
  await page.goto('https://www.trademap.org/en/goods/companies/c/699/exports/p/0902', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  }).catch(e => console.log('Navigation:', e.message));

  await page.waitForTimeout(3000);

  // Now call the API directly inside the page context
  const res = await page.evaluate(async () => {
    try {
      const url = 'https://www.trademap.org/api/companies?tradeFlow=E&product=0902&productType=p&country=699&page=1&size=10&sortBy=companyName&sortDir=asc';
      const r = await fetch(url, {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      return { ok: r.ok, status: r.status, json: await r.json() };
    } catch (e) {
      return { error: e.message };
    }
  });

  console.log('Fetch result:', res.ok, res.status);
  if (res.json) {
    console.log('nbRecords:', res.json.nbRecords);
    console.log('nbPages:', res.json.nbPages);
    if (res.json.records && res.json.records.length > 0) {
      console.log('\n--- FULL FIRST RECORD KEYS ---');
      console.log('Keys:', Object.keys(res.json.records[0]));
      console.log('\n--- FULL FIRST RECORD ---');
      console.log(JSON.stringify(res.json.records[0], null, 2));

      // Check if there is a company detail endpoint: e.g. /api/companies/{id}
      const testId = res.json.records[0].id;
      console.log('\nTesting company detail fetch for ID:', testId);
      const detailRes = await page.evaluate(async (id) => {
        try {
          const r = await fetch(`https://www.trademap.org/api/companies/${id}`, {
            headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
          });
          return { ok: r.ok, status: r.status, text: (await r.text()).slice(0, 500) };
        } catch (e) {
          return { error: e.message };
        }
      }, testId);
      console.log('Detail API result:', detailRes);
    }
  } else {
    console.log('Response error or non-json:', res);
  }

  await context.close();
}

inspect0902().catch(console.error);
