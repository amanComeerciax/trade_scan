const { chromium } = require('playwright');
const path = require('path');

async function testTokenDirect() {
  const profileDir = path.join(process.env.LOCALAPPDATA || '', 'TradeScan-Scraper-Profile');
  const context = await chromium.launchPersistentContext(profileDir, { channel: 'chrome', headless: true });
  const page = await context.newPage();
  await page.goto('https://www.trademap.org', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const test = await page.evaluate(async () => {
    function getLiveToken() {
      try {
        const item = localStorage.getItem('0-TradeMap');
        if (item) {
          const parsed = JSON.parse(item);
          return parsed.authnResult?.access_token || parsed.authzData || null;
        }
      } catch {}
      return null;
    }

    const token = getLiveToken();
    if (!token) return { error: 'No token found in 0-TradeMap' };

    // 1. Fetch 100 companies from Page 1
    const url = 'https://www.trademap.org/api/companies?tradeFlow=E&product=0910&productType=p&country=699&page=1&pageSize=100&sortBy=companyName&sortDir=asc';
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
        'Authorization': `Bearer ${token}`
      },
      credentials: 'include',
    });

    const data = await res.json();

    // 2. Fetch contact for first company
    let contact = null;
    if (data.records && data.records.length > 0) {
      const cId = data.records[0].id;
      const cUrl = `https://www.trademap.org/api/companies/contact?companyId=${encodeURIComponent(cId)}&sourceId=1`;
      const cRes = await fetch(cUrl, {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'X-Requested-With': 'XMLHttpRequest',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
      });
      contact = await cRes.json();
    }

    return {
      tokenFound: !!token,
      recordsCount: data.records?.length,
      nbRecords: data.nbRecords,
      nbPages: data.nbPages,
      firstCompanyName: data.records?.[0]?.name,
      firstCompanyContact: contact
    };
  });

  console.log('TEST RESULT:\n', JSON.stringify(test, null, 2));
  await context.close();
}

testTokenDirect().catch(console.error);
