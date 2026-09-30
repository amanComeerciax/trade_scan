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

const { ProxyAgent } = require('undici');

function getProxyConfig(wId) {
  const host = process.env[`PROXY_${wId}_HOST`] || process.env.PROXY_HOST;
  const port = process.env[`PROXY_${wId}_PORT`] || process.env.PROXY_PORT;
  const user = process.env[`PROXY_${wId}_USER`] || process.env.PROXY_USER;
  const pass = process.env[`PROXY_${wId}_PASSWORD`] || process.env.PROXY_PASSWORD;
  if (host && port) {
    const auth = user ? `${encodeURIComponent(user)}:${encodeURIComponent(pass || '')}@` : '';
    return {
      server: `http://${host}:${port}`,
      username: user || undefined,
      password: pass || undefined,
      dispatcher: new ProxyAgent(`http://${auth}${host}:${port}`),
    };
  }
  return null;
}

async function getStsToken(acc) {
  try {
    const proxy = getProxyConfig(acc.idx);
    const fetchOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: 'TradeMap',
        grant_type: 'password',
        username: acc.user,
        password: acc.pass,
        scope: 'openid profile offline_access TradeMap.API Account.API',
      }).toString(),
    };
    if (proxy?.dispatcher) {
      fetchOptions.dispatcher = proxy.dispatcher;
    }
    const res = await fetch('https://sts.marketanalysis.intracen.org/connect/token', fetchOptions);
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
    const proxy = getProxyConfig(acc.idx);
    function getChromeExecutable() {
      const possible = [
        process.env.CHROME_BIN,
        process.env.CHROME_PATH,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Users\\divy\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
      ];
      for (const p of possible) {
        if (p && fs.existsSync(p)) return p;
      }
      return null;
    }
    const chromeExec = getChromeExecutable();
    const launchOpts = {
      headless: false,
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
    };
    if (chromeExec) {
      launchOpts.executablePath = chromeExec;
    }
    if (proxy) {
      launchOpts.proxy = {
        server: proxy.server,
        username: proxy.username,
        password: proxy.password,
      };
    }
    const context = await chromium.launchPersistentContext(userDataDir, launchOpts);

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

    // 1. Open STS Login Page directly
    console.log(`🔐 [Browser #${acc.idx}] Opening STS Login Page (https://sts.marketanalysis.intracen.org/en/Account/Login)...`);
    await page.goto('https://sts.marketanalysis.intracen.org/en/Account/Login', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    }).catch(() => {});
    await page.waitForTimeout(2000);

    // 2. Fill Account Credentials & Check "Remember my login information"
    const emailField = await page.$('#Email, input[name="Email"]');
    if (emailField) {
      console.log(`✍️ [Browser #${acc.idx}] Typing E-mail: ${acc.user}...`);
      await emailField.fill(acc.user);
      const passField = await page.$('#Password, input[name="Password"]');
      if (passField) {
        console.log(`✍️ [Browser #${acc.idx}] Typing Password...`);
        await passField.fill(acc.pass);
      }

      const rememberCheckbox = await page.$('#RememberLogin, input[name="RememberLogin"], input[type="checkbox"]');
      if (rememberCheckbox) {
        console.log(`☑️ [Browser #${acc.idx}] Checking "Remember my login information"...`);
        await rememberCheckbox.check().catch(() => rememberCheckbox.click().catch(() => {}));
      }

      console.log(`🔑 [Browser #${acc.idx}] Submitting Login...`);
      const submitBtn = await page.$('button[type="submit"], button:has-text("Login"), button[name="button"][value="login"]');
      if (submitBtn) {
        await Promise.all([
          page.waitForNavigation({ timeout: 30000 }).catch(() => {}),
          submitBtn.click(),
        ]);
      }
      await page.waitForTimeout(2500);
      console.log(`✅ [Browser #${acc.idx}] STS Authentication complete!`);
    }

    // 3. Navigate directly to the target HS Code page
    console.log(`🌐 [Browser #${acc.idx}] Opening Target HS Page: ${targetUrl}`);
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    }).catch((err) => {
      console.warn(`⚠️ [Browser #${acc.idx}] Navigation warning: ${err.message}`);
    });
    await page.waitForTimeout(2500);

    // 4. Automatically dismiss any survey dialog ("Let us know what you think!")
    try {
      const declineBtn = await page.$('button:has-text("Decline"), button:has-text("Accept"), button.btn-close, [aria-label="Close"]');
      if (declineBtn) await declineBtn.click().catch(() => {});
    } catch {}

    // 5. Click "Sign in or register" in top bar to link TradeMap session
    const signInBtn = await page.$('a:has-text("Sign in or register"), button:has-text("Sign in or register"), a:has-text("Sign in"), button:has-text("Sign in")');
    if (signInBtn) {
      console.log(`🔄 [Browser #${acc.idx}] Clicking "Sign in or register" to complete TradeMap session handshake...`);
      await Promise.all([
        page.waitForNavigation({ timeout: 30000 }).catch(() => {}),
        signInBtn.click(),
      ]);
      await page.waitForTimeout(3000);

      // If redirected to STS page, auto-fill and submit
      const stsEmailField = await page.$('#Email, input[name="Email"]');
      if (stsEmailField) {
        await stsEmailField.fill(acc.user);
        const stsPassField = await page.$('#Password, input[name="Password"]');
        if (stsPassField) await stsPassField.fill(acc.pass);
        const stsRemember = await page.$('#RememberLogin, input[name="RememberLogin"], input[type="checkbox"]');
        if (stsRemember) await stsRemember.check().catch(() => {});
        const stsSubmit = await page.$('button[type="submit"], button:has-text("Login")');
        if (stsSubmit) {
          await Promise.all([
            page.waitForNavigation({ timeout: 30000 }).catch(() => {}),
            stsSubmit.click(),
          ]);
        }
        await page.waitForTimeout(3000);
      }

      // Ensure browser is on target HS Code page
      if (!page.url().includes(`/p/${hsCode}`)) {
        console.log(`🌐 [Browser #${acc.idx}] Navigating to Target HS Page: ${targetUrl}`);
        await page.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        }).catch(() => {});
        await page.waitForTimeout(2000);
      }

      // Dismiss survey dialog again if shown
      try {
        const declineBtn2 = await page.$('button:has-text("Decline"), button:has-text("Accept"), button.btn-close, [aria-label="Close"]');
        if (declineBtn2) await declineBtn2.click().catch(() => {});
      } catch {}

      console.log(`🎉 [Browser #${acc.idx}] Fully logged in & open on HS ${hsCode}!`);
    } else {
      console.log(`🎉 [Browser #${acc.idx}] Already logged in & open on HS ${hsCode}!`);
    }
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
