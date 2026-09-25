const { chromium } = require('playwright');
const path = require('path');

async function debugPage10() {
  const profileDir = path.join(process.env.LOCALAPPDATA || '', 'TradeScan-Scraper-Profile');
  console.log('Opening Chrome to check Page 10 response...');

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: false,
  });

  const page = await context.newPage();
  await page.goto('https://www.trademap.org/en/goods/companies/c/699/exports/p/0910', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(4000);

  const result = await page.evaluate(async () => {
    // 1. Get live token from sessionStorage
    let token = null;
    for (let i = 0; i < sessionStorage.length; i++) {
      const v = sessionStorage.getItem(sessionStorage.key(i));
      if (v && v.includes('access_token')) {
        try {
          const parsed = JSON.parse(v);
          if (parsed.access_token) { token = parsed.access_token; break; }
        } catch {}
      }
    }

    const headers = {
      'Accept': 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // Test 1: with pageSize only
    const url1 = 'https://www.trademap.org/api/companies?tradeFlow=E&product=0910&productType=p&country=699&page=10&pageSize=100&sortBy=companyName&sortDir=asc';
    const r1 = await fetch(url1, { headers, credentials: 'include' });
    const t1 = await r1.text();

    // Test 2: with size & pageSize
    const url2 = 'https://www.trademap.org/api/companies?tradeFlow=E&product=0910&productType=p&country=699&page=10&pageSize=100&size=100&sortBy=companyName&sortDir=asc';
    const r2 = await fetch(url2, { headers, credentials: 'include' });
    const t2 = await r2.text();

    return {
      hasToken: !!token,
      test1_pageSizeOnly: { status: r1.status, ok: r1.ok, len: t1.length, preview: t1.slice(0, 200) },
      test2_both: { status: r2.status, ok: r2.ok, len: t2.length, preview: t2.slice(0, 200) },
    };
  });

  console.log('Result:', JSON.stringify(result, null, 2));
  await context.close();
}

debugPage10().catch(console.error);
