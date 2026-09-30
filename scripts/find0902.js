const { chromium } = require('playwright');
const path = require('path');

async function findTea0902() {
  const profileDir = path.join(process.env.LOCALAPPDATA || '', 'TradeScan-Scraper-Profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: false, // visible so we can see what's happening
  });
  const page = await context.newPage();

  // Intercept all API calls
  const apiCalls = [];
  page.on('request', req => {
    if (req.url().includes('/api/')) {
      apiCalls.push(req.url());
    }
  });
  page.on('response', async res => {
    if (res.url().includes('/api/companies')) {
      try {
        const json = await res.json();
        console.log('\n✅ FOUND API CALL for companies:');
        console.log('URL:', res.url());
        console.log('nbRecords:', json.nbRecords);
        console.log('nbPages:', json.nbPages);
        if (json.records?.length > 0) {
          console.log('Sample company:', json.records[0]?.name, '|', json.records[0]?.city);
        }
      } catch(e) {}
    }
  });

  // Try old trademap URL format
  console.log('Trying old TradeMap URL format...');
  await page.goto('https://www.trademap.org/Company_list.aspx?nvpm=1%7c699%7c%7c%7c%7c0902%7c%7c%7c6%7c1%7c1%7c2%7c1%7c1%7c2%7c1%7c1', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  }).catch(e => console.log('Err:', e.message));

  await page.waitForTimeout(5000);
  const title1 = await page.title();
  const url1 = page.url();
  console.log('Old format URL result:', url1, '|', title1);

  await page.screenshot({ path: path.join(__dirname, 'trademap_0902_old.png') });

  // Also try the "switch to previous version" URL
  await page.goto('https://www.trademap.org/Company_list.aspx?nvpm=1%7c699%7c%7c%7c%7c0902%7c%7c%7c4%7c1%7c1%7c2%7c1%7c1%7c2%7c1%7c1', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  }).catch(e => console.log('Err2:', e.message));

  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(__dirname, 'trademap_0902_old2.png') });
  console.log('Old format 2 URL:', page.url(), '|', await page.title());

  console.log('\nAll API calls intercepted:', apiCalls.slice(0, 10));

  await context.close();
}

findTea0902().catch(console.error);
