const { chromium } = require('playwright');

async function testExtraction() {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const page = await browser.newPage();
  console.log('Opening TradeMap with networkidle...');
  
  await page.goto('https://www.trademap.org/en/goods/companies/c/699/exports/p/0901', {
    waitUntil: 'networkidle',
    timeout: 60000,
  }).catch(() => {});

  await page.waitForTimeout(4000);

  const companies = await page.$$eval('table tr, [role="row"]', (rows) => {
    return rows.map((r) => {
      const cells = Array.from(r.querySelectorAll('td, [role="cell"]')).map((c) => c.innerText.trim());
      const link = r.querySelector('a')?.getAttribute('href') || '';
      if (cells.length >= 2) {
        return { name: cells[0], city: cells[1], website: cells[2] || '', link };
      }
      const parts = r.innerText.split('\t').map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        return { name: parts[0], city: parts[1], website: parts[2] || '', link };
      }
      return null;
    }).filter((c) => c && c.name && !c.name.toLowerCase().includes('company name'));
  });

  console.log(`✅ SUCCESS! Extracted ${companies.length} REAL companies from the table:`);
  companies.forEach((c, i) => console.log(`  ${i + 1}. ${c.name} | City: ${c.city} | Web: ${c.website}`));

  await browser.close();
}

testExtraction().catch(console.error);
