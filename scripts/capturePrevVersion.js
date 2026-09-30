const { chromium } = require('playwright');
const path = require('path');

async function capturePrevVersion() {
  const profileDir = path.join(process.env.LOCALAPPDATA || '', 'TradeScan-Scraper-Profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: false,
  });
  const page = await context.newPage();

  // Capture all requests/responses
  const apiHits = [];
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('Company') || (url.includes('trademap') && !url.includes('cms') && !url.includes('assets'))) {
      try {
        const ct = res.headers()['content-type'] || '';
        const text = await res.text();
        apiHits.push({ url, status: res.status(), ct: ct.slice(0, 30), preview: text.slice(0, 200) });
      } catch(e) {}
    }
  });

  // Step 1: Go to new version
  console.log('Going to new TradeMap...');
  await page.goto('https://www.trademap.org/en/', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // Step 2: Click "Switch to previous version"
  console.log('Clicking Switch to previous version...');
  const switchBtn = await page.$('text=Switch to previous version');
  if (switchBtn) {
    await switchBtn.click();
    await page.waitForTimeout(3000);
    console.log('Switched! Current URL:', page.url());
  } else {
    console.log('Switch button not found, trying direct URL...');
    // Try direct old trademap URL
    await page.goto('https://www.trademap.org/Index.aspx', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);
    console.log('After direct nav:', page.url());
  }

  // Now navigate to 0902 India
  const prevUrl = page.url();
  console.log('On page:', prevUrl);

  // Try navigating to company list for 0902
  await page.goto('https://www.trademap.org/Company_list.aspx?nvpm=1%7c699%7c%7c%7c%7c0902%7c%7c%7c4%7c1%7c1%7c2%7c1%7c1%7c2%7c1%7c1', {
    waitUntil: 'networkidle',
    timeout: 30000,
  }).catch(e => console.log('Nav:', e.message));
  await page.waitForTimeout(3000);

  const finalUrl = page.url();
  const title = await page.title();
  console.log('\nFinal URL:', finalUrl);
  console.log('Title:', title);

  await page.screenshot({ path: path.join(__dirname, 'prev_version_0902.png') });

  console.log('\n--- API HITS ---');
  apiHits.slice(0, 20).forEach(h => {
    console.log(`[${h.status}] ${h.url}`);
    if (h.preview) console.log('  Preview:', h.preview.slice(0, 150));
  });

  await context.close();
}

capturePrevVersion().catch(console.error);
