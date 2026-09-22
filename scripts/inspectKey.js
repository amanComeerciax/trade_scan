const { chromium } = require('playwright');
const path = require('path');

async function inspectKey() {
  const profileDir = path.join(process.env.LOCALAPPDATA || '', 'TradeScan-Scraper-Profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
  });

  const page = await context.newPage();
  await page.goto('https://www.trademap.org', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const raw = await page.evaluate(() => {
    const val = localStorage.getItem('0-TradeMap');
    try {
      const parsed = JSON.parse(val);
      return {
        keys: Object.keys(parsed),
        tokenLength: parsed.access_token?.length || parsed.token?.length,
        hasAccessToken: !!parsed.access_token,
        sample: parsed.access_token ? parsed.access_token.slice(0, 50) : parsed,
      };
    } catch {
      return { raw: val ? val.slice(0, 100) : null };
    }
  });

  console.log('0-TradeMap Content:', raw);
  await context.close();
}

inspectKey().catch(console.error);
