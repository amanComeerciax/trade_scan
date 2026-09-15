const { chromium } = require('playwright');
const path = require('path');

async function main() {
  const profileDir = path.join(process.env.LOCALAPPDATA || '', 'TradeScan-Scraper-Profile');
  console.log('Inspecting TradeMap API from profile:', profileDir);

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: false,
    args: ['--start-maximized'],
  });

  const page = await context.newPage();

  // Intercept all requests to /api/companies
  page.on('request', (req) => {
    if (req.url().includes('/api/companies')) {
      console.log('\n--- INTERCEPTED API REQUEST ---');
      console.log('URL:', req.url());
      console.log('Headers:', JSON.stringify(req.headers(), null, 2));
    }
  });

  page.on('response', async (res) => {
    if (res.url().includes('/api/companies')) {
      console.log('\n--- INTERCEPTED API RESPONSE ---');
      console.log('Status:', res.status());
      try {
        const json = await res.json();
        console.log('Response keys:', Object.keys(json));
        console.log('nbRecords:', json.nbRecords);
        console.log('nbPages:', json.nbPages);
        console.log('nbRecordPerPage:', json.nbRecordPerPage);
        console.log('records count:', json.records?.length);
        if (json.records?.length > 0) {
          console.log('First record name:', json.records[0]?.name);
        }
      } catch (e) {
        console.log('Failed to parse json:', e.message);
      }
    }
  });

  console.log('Opening TradeMap page...');
  await page.goto('https://www.trademap.org/en/goods/companies/c/000/exports/p/5208', {
    waitUntil: 'networkidle',
    timeout: 60000,
  }).catch(() => {});

  // Wait 10 seconds to allow network requests to finish
  await page.waitForTimeout(10000);

  // Check localStorage and cookies
  const storage = await page.evaluate(() => {
    return {
      localStorage: { ...localStorage },
      sessionStorage: { ...sessionStorage },
      cookies: document.cookie,
    };
  });

  console.log('\n--- STORAGE INSPECTION ---');
  console.log('LocalStorage keys:', Object.keys(storage.localStorage));
  console.log('SessionStorage keys:', Object.keys(storage.sessionStorage));
  console.log('Cookie string length:', storage.cookies.length);
  console.log('Cookie preview:', storage.cookies.slice(0, 200));

  await context.close();
}

main().catch(console.error);
