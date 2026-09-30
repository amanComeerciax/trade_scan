const { chromium } = require('playwright');
const path = require('path');

async function checkUrls() {
  const profileDir = path.join(process.env.LOCALAPPDATA || '', 'TradeScan-Scraper-Profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
  });
  const page = await context.newPage();

  const urlsToTest = [
    'https://www.trademap.org/en/goods/companies/c/699/exports/p/0901',
    'https://www.trademap.org/en/goods/companies/c/699/exports/p/901',
    'https://www.trademap.org/en/goods/companies/c/699/exports/p/0902',
    'https://www.trademap.org/en/goods/companies/c/699/exports/p/902',
    'https://www.trademap.org/en/goods/companies/c/000/exports/p/5208',
  ];

  for (const u of urlsToTest) {
    const res = await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(e => ({ status: () => 'err: ' + e.message }));
    const title = await page.title();
    console.log(`URL: ${u} => status: ${res?.status ? res.status() : 'none'} | title: ${title}`);
  }

  await context.close();
}

checkUrls().catch(console.error);
