const { chromium } = require('playwright');
require('dotenv').config();

(async () => {
  const user = process.env.TRADEMAP_ACCOUNT_1_USER;
  const pass = process.env.TRADEMAP_ACCOUNT_1_PASS;
  console.log(`Testing direct STS Authorize flow for: ${user}...`);

  const authUrl = 'https://sts.marketanalysis.intracen.org/connect/authorize?client_id=TradeMap&redirect_uri=https%3A%2F%2Fwww.trademap.org%2Fsignin-oidc&response_type=code%20id_token&scope=openid%20profile%20offline_access%20TradeMap.API%20Account.API&response_mode=form_post';

  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('1. Navigating to STS Authorize URL...');
  await page.goto(authUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  console.log('Current URL:', page.url());

  const emailField = await page.$('#Email, input[name="Email"]');
  if (emailField) {
    console.log('2. Filling credentials...');
    await emailField.fill(user);
    const passField = await page.$('#Password, input[name="Password"]');
    if (passField) await passField.fill(pass);

    console.log('3. Submitting login form...');
    const submitBtn = await page.$('button[type="submit"], button[name="button"][value="login"]');
    if (submitBtn) {
      await Promise.all([
        page.waitForNavigation({ timeout: 30000 }).catch(e => console.log('Nav:', e.message)),
        submitBtn.click(),
      ]);
    }
    await page.waitForTimeout(4000);
    console.log('4. URL after STS submission:', page.url());

    console.log('5. Navigating to HS 030235 page...');
    await page.goto('https://www.trademap.org/en/goods/companies/c/000/exports/p/030235', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    console.log('6. Final Page URL:', page.url());
    console.log('7. Final Page Title:', await page.title());
  } else {
    console.log('Email field not found. Current URL:', page.url());
  }

  await browser.close();
})();
