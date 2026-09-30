const { chromium } = require('playwright');
const path = require('path');

async function searchProductOnTradeMap() {
  const profileDir = path.join(process.env.LOCALAPPDATA || '', 'TradeScan-Scraper-Profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: false,
  });
  const page = await context.newPage();

  console.log('Opening TradeMap to check product selection for 0902/tea...');
  await page.goto('https://www.trademap.org/en/goods/companies/c/699/exports/p/0901', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  }).catch(() => {});

  await page.waitForTimeout(4000);

  // Take screenshot
  await page.screenshot({ path: path.join(__dirname, 'trademap_0901_ui.png') });

  // Look for product search input
  const inputs = await page.$$eval('input', els => els.map(e => ({ id: e.id, placeholder: e.placeholder, val: e.value, name: e.name })));
  console.log('Inputs found on page:', inputs);

  await context.close();
}

searchProductOnTradeMap().catch(console.error);
