const { chromium } = require('playwright');
const path = require('path');

async function inspectTradeMapPage() {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
  });

  const page = await browser.newPage();
  
  console.log('Navigating to TradeMap...');
  await page.goto('https://www.trademap.org/en/goods/companies/c/699/exports/p/0901', {
    waitUntil: 'networkidle',
    timeout: 45000,
  }).catch(() => console.log('Networkidle timeout, continuing...'));

  await page.waitForTimeout(5000);

  const title = await page.title();
  console.log('Page Title:', title);

  // Look for buttons, links, pagination, table
  const buttonTexts = await page.$$eval('button', (btns) => btns.map((b) => b.innerText.trim()).filter(Boolean));
  console.log('Buttons on page:', buttonTexts.slice(0, 20));

  const tableRows = await page.$$eval('table tr, [role="row"]', (rows) => rows.map((r) => r.innerText.trim()).filter(Boolean));
  console.log('Table rows count:', tableRows.length);
  if (tableRows.length > 0) {
    console.log('First 3 rows:\n', tableRows.slice(0, 3));
  }

  // Check pagination elements
  const paginationElements = await page.$$eval('[class*="page"], [class*="pagination"], nav', (els) => els.map((e) => e.outerHTML.substring(0, 100)));
  console.log('Pagination elements:', paginationElements.slice(0, 10));

  await page.screenshot({ path: path.join(__dirname, 'trademap_screenshot.png') });
  console.log('Screenshot saved to scripts/trademap_screenshot.png');

  await browser.close();
}

inspectTradeMapPage().catch(console.error);
