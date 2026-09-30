const { chromium } = require('playwright');
const path = require('path');

async function checkTradeMap0902() {
  const profileDir = path.join(process.env.LOCALAPPDATA || '', 'TradeScan-Scraper-Profile');
  console.log('Launching browser to inspect 0902 India on TradeMap...');

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
  });

  const page = await context.newPage();

  // Listen to all network responses
  const apiUrls = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('trademap.org') && (url.includes('api') || url.includes('json') || url.includes('company'))) {
      apiUrls.push({ url, status: res.status() });
    }
  });

  console.log('Visiting TradeMap India 0902...');
  await page.goto('https://www.trademap.org/en/goods/companies/c/699/exports/p/0902', {
    waitUntil: 'networkidle',
    timeout: 60000,
  }).catch(e => console.log('Goto notice:', e.message));

  await page.waitForTimeout(5000);

  // Take screenshot of what TradeMap displays
  await page.screenshot({ path: path.join(__dirname, 'trademap_0902_view.png') });
  console.log('Screenshot saved to trademap_0902_view.png');

  // Check table headers
  const headers = await page.$$eval('th', ths => ths.map(t => t.innerText.trim()).filter(Boolean));
  console.log('Table Headers on TradeMap:', headers);

  // Check first few rows
  const rows = await page.$$eval('table tr', trs => trs.slice(0, 5).map(r => r.innerText.replace(/\n+/g, ' | ').trim()));
  console.log('Sample Rows:', rows);

  // Check if any links exist in the table rows
  const links = await page.$$eval('table tr a', as => as.slice(0, 5).map(a => ({ text: a.innerText.trim(), href: a.href })));
  console.log('Sample links in table:', links);

  console.log('\nRelevant API calls seen during load:', apiUrls.slice(0, 10));

  await context.close();
}

checkTradeMap0902().catch(console.error);
