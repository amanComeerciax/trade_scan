const { chromium } = require('playwright');
const path = require('path');

async function findTokenStorage() {
  const profileDir = path.join(process.env.LOCALAPPDATA || '', 'TradeScan-Scraper-Profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: false,
  });

  const page = await context.newPage();

  let apiAuthHeader = null;
  page.on('request', req => {
    if (req.url().includes('/api/')) {
      const auth = req.headers()['authorization'];
      if (auth) apiAuthHeader = auth;
    }
  });

  await page.goto('https://www.trademap.org/en/goods/companies/c/699/exports/p/0910', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(4000);

  const storageDump = await page.evaluate(() => {
    const sKeys = Object.keys(sessionStorage);
    const lKeys = Object.keys(localStorage);
    return {
      sessionStorageKeys: sKeys,
      localStorageKeys: lKeys,
      cookies: document.cookie,
      // search for token anywhere in localStorage
      localStorageTokenKeys: lKeys.filter(k => localStorage.getItem(k).includes('eyJ')),
      sessionStorageTokenKeys: sKeys.filter(k => sessionStorage.getItem(k).includes('eyJ')),
    };
  });

  console.log('\n--- TOKEN STORAGE INSPECTION ---');
  console.log('Intercepted Request Auth Header:', apiAuthHeader ? `${apiAuthHeader.slice(0, 30)}...` : 'NONE');
  console.log('localStorage keys with JWT (eyJ):', storageDump.localStorageTokenKeys);
  console.log('sessionStorage keys with JWT (eyJ):', storageDump.sessionStorageTokenKeys);
  console.log('All localStorage keys:', storageDump.localStorageKeys);

  await context.close();
}

findTokenStorage().catch(console.error);
