const { chromium } = require('playwright');
const path = require('path');

async function captureOldTradeMap0902() {
  const profileDir = path.join(process.env.LOCALAPPDATA || '', 'TradeScan-Scraper-Profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: false,
  });

  const page = await context.newPage();

  // Capture ALL network requests
  const allRequests = [];
  const apiResponses = [];

  page.on('request', req => {
    allRequests.push({ method: req.method(), url: req.url() });
  });

  page.on('response', async res => {
    const url = res.url();
    const ct = res.headers()['content-type'] || '';
    if (ct.includes('json') || url.includes('api') || url.includes('Company')) {
      try {
        const text = await res.text();
        if (text.length < 50000) {
          apiResponses.push({ url, status: res.status(), preview: text.slice(0, 300) });
        }
      } catch(e) {}
    }
  });

  // Old TradeMap URL for India 0902 exporters
  const oldUrl = 'https://www.trademap.org/Company_list.aspx?nvpm=1%7c699%7c%7c%7c%7c0902%7c%7c%7c4%7c1%7c1%7c2%7c1%7c1%7c2%7c1%7c1';
  console.log('Opening old TradeMap:', oldUrl);

  await page.goto(oldUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => console.log('Note:', e.message));
  await page.waitForTimeout(5000);

  const currentUrl = page.url();
  const title = await page.title();
  console.log('Current URL:', currentUrl);
  console.log('Title:', title);

  await page.screenshot({ path: path.join(__dirname, 'old_trademap_0902.png') });

  // Check page body
  const bodyPreview = await page.evaluate(() => document.body.innerText.slice(0, 400));
  console.log('Body preview:', bodyPreview);

  console.log('\n--- ALL API/JSON RESPONSES ---');
  apiResponses.slice(0, 15).forEach(r => {
    console.log(`\nURL: ${r.url}`);
    console.log(`Status: ${r.status}`);
    console.log(`Preview: ${r.preview}`);
  });

  await context.close();
}

captureOldTradeMap0902().catch(console.error);
