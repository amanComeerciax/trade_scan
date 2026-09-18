/**
 * 🔍 TradeMap JSON & Network Inspector
 * ================================================================
 * Ye script check karegi ki TradeMap ke background JSON me
 * Phone Number aur Contact Person kahan aata hai:
 *   1. Kya main page ke JSON me hi pehle se hai?
 *   2. Ya '+' dabane par koi specific API call hoti hai?
 * ================================================================
 */

const { chromium } = require('playwright');
const path = require('path');
const readline = require('readline');

function ask(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(query, a => { rl.close(); r(a.trim()); }));
}

async function main() {
  const profileDir = path.join(process.env.LOCALAPPDATA || '', 'TradeScan-Scraper-Profile');
  console.log('\n🔍 Starting Network Inspector...');
  console.log(`   Profile: ${profileDir}\n`);

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: false,
    args: ['--start-maximized'],
    viewport: null,
  });

  const page = await context.newPage();

  // Listen to all JSON responses
  page.on('response', async (res) => {
    const url = res.url();
    const contentType = res.headers()['content-type'] || '';

    if (contentType.includes('application/json') || url.includes('/api/')) {
      try {
        const text = await res.text();
        const json = JSON.parse(text);

        console.log('\n' + '═'.repeat(60));
        console.log(`📡 [API RESPONSE] ${res.status()} ${url}`);
        console.log('═'.repeat(60));

        if (json.records && Array.isArray(json.records) && json.records.length > 0) {
          console.log(`📦 Received ${json.records.length} records!`);
          console.log('🔑 First record all keys:', Object.keys(json.records[0]));
          console.log('📄 Sample record fields:');
          console.log(JSON.stringify(json.records[0], null, 2));

          // Check for phone/contact keys
          const sampleStr = JSON.stringify(json.records[0]);
          const hasPhone = sampleStr.toLowerCase().includes('phone') || sampleStr.toLowerCase().includes('tel');
          const hasContact = sampleStr.toLowerCase().includes('contact') || sampleStr.toLowerCase().includes('person');
          console.log(`\n🔎 Analysis:`);
          console.log(`   Phone field present in main JSON?   -> ${hasPhone ? '✅ YES!' : '❌ NO'}`);
          console.log(`   Contact field present in main JSON? -> ${hasContact ? '✅ YES!' : '❌ NO'}`);
        } else {
          console.log('📄 Response data:');
          console.log(JSON.stringify(json, null, 2).slice(0, 1000));
        }
      } catch (e) {}
    }
  });

  console.log('🌐 Opening TradeMap...');
  await page.goto('https://www.trademap.org', { waitUntil: 'domcontentloaded' }).catch(() => {});

  console.log('\n👉 BROWSER OPEN HO GAYA HAI.');
  console.log('👉 Browser me 0902 page open karein aur kisi 1 company ke "+" icon par click karein.');
  console.log('👉 Yahan terminal me real-time JSON print hoga!\n');

  await ask('👉 Jab check karna band karna ho, tab yahan ENTER dabayein: ');
  await context.close();
}

main().catch(console.error);
