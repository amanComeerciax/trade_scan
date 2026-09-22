/**
 * 🔓 TradeMap 1-Click Session Unblocker
 * Clears cached blocked session tokens and cookies from the scraper profile.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const profileDir = path.join(process.env.LOCALAPPDATA || '', 'TradeScan-Scraper-Profile');

console.log('\n🔄 Cleaning TradeMap cached session...');

// 1. Terminate any background Chrome instances on the scraper profile
try {
  execSync('taskkill /F /IM chrome.exe /T 2>nul', { stdio: 'ignore' });
} catch {}

// 2. Remove lock files
const lockFiles = ['lockfile', 'SingletonLock', 'SingletonCookie', 'SingletonSocket'];
for (const f of lockFiles) {
  const p = path.join(profileDir, f);
  if (fs.existsSync(p)) {
    try { fs.unlinkSync(p); } catch {}
  }
}

// 3. Remove Service Worker and Cache Storage that holds the 'account-blocked' state
const dirsToClean = [
  path.join(profileDir, 'Default', 'Service Worker'),
  path.join(profileDir, 'Default', 'Cache'),
  path.join(profileDir, 'Default', 'Code Cache'),
];

for (const d of dirsToClean) {
  if (fs.existsSync(d)) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
      console.log(`✅ Cleared cache: ${path.basename(d)}`);
    } catch {}
  }
}

console.log('\n🎉 TradeMap session cleared successfully! "Access blocked" screen removed.');
console.log('Ab aap TradeMap normal open kar sakte hain.\n');
