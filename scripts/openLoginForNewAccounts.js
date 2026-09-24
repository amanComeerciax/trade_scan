const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
require('dotenv').config();

const accountsToLogin = [
  {
    idx: 3,
    user: process.env.TRADEMAP_ACCOUNT_3_USER,
    pass: process.env.TRADEMAP_ACCOUNT_3_PASS,
  },
  {
    idx: 4,
    user: process.env.TRADEMAP_ACCOUNT_4_USER,
    pass: process.env.TRADEMAP_ACCOUNT_4_PASS,
  },
];

async function launchAccount(acc) {
  const profileDir = path.join(process.cwd(), 'scripts', `profile_account_${acc.idx}`);
  fs.mkdirSync(profileDir, { recursive: true });

  for (const lock of ['SingletonLock', 'lockfile']) {
    try {
      const p = path.join(profileDir, lock);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {}
  }

  console.log(`\n🚀 Launching Chrome for Account #${acc.idx} (${acc.user})...`);

  try {
    const context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      channel: 'chrome',
      viewport: null,
      args: ['--disable-blink-features=AutomationControlled', '--no-default-browser-check'],
    });

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    console.log(`🌐 [Account #${acc.idx}] Opening STS Login page...`);
    await page.goto('https://sts.marketanalysis.intracen.org/en/Account/Login', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    }).catch(() => {});

    await page.waitForTimeout(1500);

    const emailInput = await page.$('#Email');
    if (emailInput) {
      console.log(`✍️ [Account #${acc.idx}] Auto-filling credentials for ${acc.user}...`);
      await page.fill('#Email', acc.user);
      await page.fill('#Password', acc.pass);
    }

    console.log(`✅ [Account #${acc.idx}] Window open! Please login or check window. It will stay open.`);
  } catch (err) {
    console.error(`❌ [Account #${acc.idx}] Error:`, err.message);
  }
}

(async () => {
  console.log('='.repeat(60));
  console.log('🔓 Opening Login Browsers for Worker 3 & Worker 4');
  console.log('='.repeat(60));

  for (const acc of accountsToLogin) {
    await launchAccount(acc);
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log('\n⏳ Browsers are OPEN and waiting. Aap aaram se login kar lijiye!');
})();
