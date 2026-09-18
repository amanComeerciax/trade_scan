const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const profileDir = path.join(process.env.LOCALAPPDATA || '', 'TradeScan-Scraper-Profile');

console.log('Unlocking Chrome Profile directory:', profileDir);

// 1. Kill any chrome processes with TradeScan profile
try {
  const wmicOutput = execSync('wmic process where "name=\'chrome.exe\'" get processid,commandline', { encoding: 'utf8' });
  const lines = wmicOutput.split('\n');
  for (const line of lines) {
    if (line.includes('TradeScan-Scraper-Profile')) {
      const match = line.trim().match(/(\d+)$/);
      if (match) {
        const pid = match[1];
        console.log(`Terminating orphan Chrome PID ${pid}...`);
        try { execSync(`taskkill /F /PID ${pid}`); } catch {}
      }
    }
  }
} catch (e) {
  // fallback: taskkill /im chrome.exe /f can be harsh if user has personal chrome open, so only target scraper if possible
}

// 2. Remove Lockfile if left behind
const lockFiles = ['lockfile', 'SingletonLock', 'SingletonCookie', 'SingletonSocket'];
for (const f of lockFiles) {
  const p = path.join(profileDir, f);
  if (fs.existsSync(p)) {
    try {
      fs.unlinkSync(p);
      console.log(`Removed lock file: ${f}`);
    } catch (e) {
      console.log(`Could not delete ${f}:`, e.message);
    }
  }
}

console.log('Profile unlocked successfully!');
