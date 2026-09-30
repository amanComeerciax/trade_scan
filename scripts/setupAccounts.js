const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

const workerId = process.argv[2] || '1';
const profileDir = path.join(os.homedir(), 'AppData', 'Local', `TradeScan-Profile-Worker-${workerId}`);

console.log('======================================================================');
console.log(`🔐 TradeScan Account Setup Utility - Worker Account #${workerId}`);
console.log(`📁 Profile Directory: ${profileDir}`);
console.log('======================================================================');

if (!fs.existsSync(profileDir)) {
  fs.mkdirSync(profileDir, { recursive: true });
}

async function setup() {
  console.log(`\n🚀 Launching Chrome for Worker #${workerId}...`);
  console.log(`👉 Please log in to your TradeMap account in the opened browser window.`);
  console.log(`👉 Once logged in, this window will automatically detect your active session!\n`);

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    channel: 'chrome',
    viewport: { width: 1280, height: 800 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--start-maximized',
      '--no-sandbox',
    ]
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://www.trademap.org/en/goods/companies', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  console.log('⏳ Monitoring login status (press Ctrl+C when done)...');

  let loggedIn = false;
  const checkInterval = setInterval(async () => {
    try {
      const storageState = await page.evaluate(() => {
        let bearer = null;
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && (key.startsWith('oidc.user') || key.includes('TradeMap'))) {
            try {
              const val = JSON.parse(sessionStorage.getItem(key));
              if (val && val.access_token) return { token: val.access_token, user: val.profile?.name || val.profile?.email };
            } catch (e) {}
          }
        }
        return null;
      });

      if (storageState && storageState.token && !loggedIn) {
        loggedIn = true;
        console.log(`\n✅ SUCCESS! Worker #${workerId} is LOGGED IN!`);
        console.log(`👤 User/Profile: ${storageState.user || 'TradeMap Authorized User'}`);
        console.log(`🔑 Bearer Token: Active and saved to Worker #${workerId} profile!`);
        console.log(`\n🎉 You can now close this browser window or press Ctrl+C.`);
      }
    } catch (e) {
      // Browser might be navigating or closed
    }
  }, 2500);

  // Keep alive until browser closed
  context.on('close', () => {
    clearInterval(checkInterval);
    console.log(`\n🚪 Browser closed. Worker #${workerId} setup complete.`);
    process.exit(0);
  });
}

setup().catch(err => {
  console.error('❌ Error during setup:', err.message);
  process.exit(1);
});
