const { chromium } = require('playwright');

async function inspectInputs() {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const page = await browser.newPage();
  console.log('Navigating to TradeMap...');
  await page.goto('https://www.trademap.org/en/goods/companies/c/699/exports/p/0901', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  await page.waitForTimeout(4000);

  // Inspect all input and select elements
  const elements = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, select, [role="combobox"], [contenteditable="true"], .select, .form-control')).map((el) => ({
      tag: el.tagName,
      type: el.getAttribute('type'),
      placeholder: el.getAttribute('placeholder'),
      id: el.id,
      className: el.className,
      value: el.value || el.innerText,
      ariaLabel: el.getAttribute('aria-label'),
    }));
  });

  console.log('Found input elements:', JSON.stringify(elements, null, 2));
  await browser.close();
}

inspectInputs().catch(console.error);
