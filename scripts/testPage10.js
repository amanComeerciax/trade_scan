const { chromium } = require('playwright');
const path = require('path');

async function testPage10() {
  const profileDir = path.join(process.env.LOCALAPPDATA || '', 'TradeScan-Scraper-Profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
  });
  const page = await context.newPage();
  await page.goto('https://www.trademap.org', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(2000);

  // Test page 9 and page 10
  for (const p of [8, 9, 10]) {
    const res = await page.evaluate(async (pageNum) => {
      // Get token from storage
      let token = null;
      for (let j = 0; j < sessionStorage.length; j++) {
        const v = sessionStorage.getItem(sessionStorage.key(j));
        if (v && v.includes('access_token')) {
          try {
            const parsed = JSON.parse(v);
            if (parsed.access_token) { token = parsed.access_token; break; }
          } catch {}
        }
      }

      const url = `https://www.trademap.org/api/companies?tradeFlow=E&product=0910&productType=p&country=699&page=${pageNum}&pageSize=100&size=100&sortBy=companyName&sortDir=asc`;
      const headers = { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      try {
        const r = await fetch(url, { headers, credentials: 'include' });
        return { pageNum, ok: r.ok, status: r.status, text: (await r.text()).slice(0, 300) };
      } catch (e) {
        return { pageNum, error: e.message };
      }
    }, p);

    console.log(`Page ${p} Result:`, res);
  }

  await context.close();
}

testPage10().catch(console.error);
