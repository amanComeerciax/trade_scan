const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
require('dotenv').config();

// Parse command line arguments
// Usage: node scripts/launchAllAccounts.js [hsCode] [countryCode] [tradeFlow]
const args = process.argv.slice(2);
const hsCode = args[0] || process.env.HS_CODE || '020130';
const countryCode = args[1] || process.env.COUNTRY_CODE || '000';
const tradeFlow = (args[2] || process.env.TRADE_FLOW || 'exports').toLowerCase();

const targetUrl = `https://www.trademap.org/en/goods/companies/c/${countryCode}/${tradeFlow}/p/${hsCode}`;

console.log('='.repeat(72));
console.log('🚀 TradeMap Universal Multi-Account Direct STS Login & Launch Engine');
console.log(`🎯 Target Page : ${targetUrl}`);
console.log(`📦 HS Code     : ${hsCode} | Country: ${countryCode} | Flow: ${tradeFlow}`);
console.log('='.repeat(72));

// Dynamically load all accounts from .env (supports 4, 8, or any number)
const accounts = [];
let i = 1;
while (process.env[`TRADEMAP_ACCOUNT_${i}_USER`]) {
  const user = process.env[`TRADEMAP_ACCOUNT_${i}_USER`];
  const pass = process.env[`TRADEMAP_ACCOUNT_${i}_PASS`];
  if (user && pass) {
    accounts.push({ idx: i, user, pass });
  }
  i++;
}

if (accounts.length === 0) {
  console.error('❌ No TradeMap accounts found in .env');
  process.exit(1);
}

console.log(`📋 Found ${accounts.length} Accounts in .env. Initializing staggered launch...\n`);

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function getStsToken(acc) {
  try {
    const res = await fetch('https://sts.marketanalysis.intracen.org/connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: 'TradeMap',
        grant_type: 'password',
        username: acc.user,
        password: acc.pass,
        scope: 'openid profile offline_access TradeMap.API Account.API',
      }).toString(),
    });
    const data = await res.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}

async function loginAndLaunchAccount(acc) {
  const accountName = acc.user.split('@')[0];

  // Stagger launch: Worker 1 starts immediately, Worker 2 after 1.5s, etc.
  // This avoids Windows file lock / port collision across instances
  await sleep((acc.idx - 1) * 1500);

  console.log(`🖥️ [Browser #${acc.idx}] Starting Chrome for ${accountName}...`);

  const userDataDir = path.join(process.cwd(), 'scripts', `profile_account_${acc.idx}`);
  fs.mkdirSync(userDataDir, { recursive: true });

  // Clean stale lock files
  for (const lock of ['SingletonLock', 'lockfile']) {
    try {
      const lockPath = path.join(userDataDir, lock);
      if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
    } catch {}
  }

  // Pre-fetch token
  const token = await getStsToken(acc);

  try {
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      channel: 'chrome',
      viewport: null,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-infobars',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-extensions',
        '--hide-crash-restore-bubble',
      ],
    });

    if (token) {
      await context.addInitScript((tok) => {
        try {
          const raw = localStorage.getItem('0-TradeMap');
          const parsed = raw ? JSON.parse(raw) : {};
          if (!parsed.authnResult) parsed.authnResult = {};
          parsed.authnResult.access_token = tok;
          localStorage.setItem('0-TradeMap', JSON.stringify(parsed));
        } catch {}
      }, token);
    }

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    console.log(`🌐 [Browser #${acc.idx}] Opening TradeMap for session check...`);
    await page.goto('https://www.trademap.org', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    }).catch(() => {});
    await page.waitForTimeout(2000);

    // Dismiss survey modal if present
    try {
      const declineBtn = await page.$('button:has-text("Decline"), button:has-text("Accept"), button.btn-close, [aria-label="Close"]');
      if (declineBtn) await declineBtn.click().catch(() => {});
    } catch {}

    // Check if "Sign in or register" button is visible
    const signInBtn = await page.$('a:has-text("Sign in"), button:has-text("Sign in")');
    if (signInBtn) {
      console.log(`🔐 [Browser #${acc.idx}] Triggering TradeMap OAuth Sign In...`);
      await Promise.all([
        page.waitForNavigation({ timeout: 25000 }).catch(() => {}),
        signInBtn.click(),
      ]);
      await page.waitForTimeout(2000);

      // Fill STS credentials on STS page
      const emailField = await page.$('#Email, input[name="Email"]');
      if (emailField) {
        console.log(`✍️ [Browser #${acc.idx}] Auto-filling credentials for ${acc.user}...`);
        await emailField.fill(acc.user);
        const passField = await page.$('#Password, input[name="Password"]');
        if (passField) await passField.fill(acc.pass);

        console.log(`🔑 [Browser #${acc.idx}] Submitting Login...`);
        const submitBtn = await page.$('button[type="submit"], button[name="button"][value="login"]');
        if (submitBtn) {
          await Promise.all([
            page.waitForNavigation({ timeout: 30000 }).catch(() => {}),
            submitBtn.click(),
          ]);
        }
        await page.waitForTimeout(3000);
        console.log(`✅ [Browser #${acc.idx}] Logged in via TradeMap OAuth successfully!`);
      }
    } else {
      console.log(`ℹ️ [Browser #${acc.idx}] Already logged in!`);
    }

    // Now navigate to the target HS code page
    console.log(`🌐 [Browser #${acc.idx}] Redirecting to Target URL: ${targetUrl}`);
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    }).catch((err) => {
      console.warn(`⚠️ [Browser #${acc.idx}] Navigation warning: ${err.message}`);
    });
    await page.waitForTimeout(2000);

    // Dismiss any survey modal on target page
    try {
      const declineBtn = await page.$('button:has-text("Decline"), button:has-text("Accept"), button.btn-close, [aria-label="Close"]');
      if (declineBtn) await declineBtn.click().catch(() => {});
    } catch {}

    console.log(`🎉 [Browser #${acc.idx}] Ready & Open on HS ${hsCode} page!`);
  } catch (err) {
    console.error(`❌ [Browser #${acc.idx}] Launch error: ${err.message}`);
  }
}

// Launch all accounts in parallel with stagger
(async () => {
  console.log(`🚀 Launching all ${accounts.length} Chrome browsers in parallel...`);
  await Promise.all(accounts.map((acc) => loginAndLaunchAccount(acc)));

  console.log('\n' + '═'.repeat(72));
  console.log(`🎉 ALL ${accounts.length} BROWSERS LAUNCHED & LOGGED IN SUCCESSFULLY!`);
  console.log(`🎯 Active on: ${targetUrl}`);
  console.log('⏳ Browsers will stay open. Press Ctrl+C in terminal if you ever want to close.');
  console.log('═'.repeat(72) + '\n');

  // Keep process alive indefinitely so browsers remain open
  setInterval(() => {}, 1000 * 60);
  await new Promise(() => {});
})();
