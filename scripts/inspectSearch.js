const { chromium } = require('playwright');

async function inspectSearchBar() {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const page = await browser.newPage();
  await page.goto('https://www.trademap.org/en/goods/companies/c/699/exports/p/0901', {
    waitUntil: 'networkidle',
    timeout: 45000,
  }).catch(() => {});

  await page.waitForTimeout(4000);

  const html = await page.evaluate(() => {
    // Find any container that has Advanced or Companies in
    const els = Array.from(document.querySelectorAll('*')).filter(el => 
      el.children.length > 0 && el.innerText && el.innerText.includes('Trade flow')
    );
    // Find the smallest one
    els.sort((a, b) => a.innerText.length - b.innerText.length);
    return els[0] ? els[0].outerHTML.substring(0, 1500) : 'Not found';
  });

  console.log('Search Bar HTML:\n', html);
  await browser.close();
}

inspectSearchBar().catch(console.error);
