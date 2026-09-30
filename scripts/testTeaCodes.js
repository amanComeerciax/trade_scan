const { chromium } = require('playwright');
const path = require('path');

async function testSubcodes() {
  const profileDir = path.join(process.env.LOCALAPPDATA || '', 'TradeScan-Scraper-Profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
  });
  const page = await context.newPage();

  const urls = [
    'https://www.trademap.org/en/goods/companies/c/699/exports/p/09',
    'https://www.trademap.org/en/goods/companies/c/000/exports/p/0902',
    'https://www.trademap.org/en/goods/companies/c/699/exports/p/090210',
    'https://www.trademap.org/en/goods/companies/c/699/exports/p/090220',
    'https://www.trademap.org/en/goods/companies/c/699/exports/p/090230',
    'https://www.trademap.org/en/goods/companies/c/699/exports/p/090240',
  ];

  for (const u of urls) {
    const res = await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(e => ({ status: () => 'err: ' + e.message }));
    const title = await page.title();
    console.log(`URL: ${u} => status: ${res?.status ? res.status() : 'none'} | title: ${title}`);
  }

  await context.close();
}

testSubcodes().catch(console.error);
