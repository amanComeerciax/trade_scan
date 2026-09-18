const { chromium } = require('playwright');
const path = require('path');

async function debugUrl() {
  const profileDir = path.join(process.env.LOCALAPPDATA || '', 'TradeScan-Scraper-Profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
  });

  const page = await context.newPage();
  await page.goto('https://www.trademap.org/en/goods/companies/c/699/exports/p/0902', {
    waitUntil: 'load',
    timeout: 30000,
  }).catch(e => console.log(e.message));

  await page.waitForTimeout(3000);
  console.log('Current URL:', page.url());
  console.log('Page Title:', await page.title());
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log('Body Preview:\n', bodyText);

  await context.close();
}

debugUrl().catch(console.error);
