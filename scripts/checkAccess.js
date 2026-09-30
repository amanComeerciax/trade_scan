const { chromium } = require('playwright');
const path = require('path');

async function checkAccess() {
  const profileDir = path.join(process.env.LOCALAPPDATA || '', 'TradeScan-Scraper-Profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
  });
  const page = await context.newPage();

  // Check status and page content for 0901 (working URL)
  await page.goto('https://www.trademap.org/en/goods/companies/c/699/exports/p/0901', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  }).catch(() => {});
  await page.waitForTimeout(3000);

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300));
  const isBlocked = bodyText.includes('Access blocked') || bodyText.includes('account-blocked');
  const isLoggedIn = !bodyText.includes('Sign in') && !bodyText.includes('Register');
  console.log('Access blocked?:', isBlocked);
  console.log('Looks logged in?:', isLoggedIn);
  console.log('Body preview:', bodyText);

  // Now test API call for 0902
  const apiResult = await page.evaluate(async () => {
    const urls = [
      'https://www.trademap.org/api/companies?tradeFlow=E&product=0902&productType=p&country=699&page=1&size=5&sortBy=companyName&sortDir=asc',
      'https://www.trademap.org/api/companies?tradeFlow=E&product=902&productType=p&country=699&page=1&size=5&sortBy=companyName&sortDir=asc',
      'https://www.trademap.org/api/companies?tradeFlow=E&product=0902&productType=p&country=000&page=1&size=5&sortBy=companyName&sortDir=asc',
    ];
    const results = [];
    for (const url of urls) {
      try {
        const r = await fetch(url, { headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } });
        const text = await r.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch(e) {}
        results.push({ url: url.slice(60), status: r.status, nbRecords: parsed?.nbRecords, nbPages: parsed?.nbPages, sample: parsed?.records?.[0]?.name });
      } catch (e) {
        results.push({ url: url.slice(60), error: e.message });
      }
    }
    return results;
  });

  console.log('\n--- 0902 API Test Results ---');
  apiResult.forEach(r => console.log(r));

  await context.close();
}

checkAccess().catch(console.error);
