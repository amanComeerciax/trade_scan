const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function stopAll() {
  const pidFilePath = path.join(__dirname, '.batch_pid.json');
  const stateFilePath = path.join(__dirname, '.batch_state.json');
  const distStatePath = path.join(__dirname, '.distributed_state.json');

  // 1. Immediately update state files to stopped
  for (const fPath of [stateFilePath, distStatePath]) {
    if (fs.existsSync(fPath)) {
      try {
        const cur = JSON.parse(fs.readFileSync(fPath, 'utf8'));
        cur.shouldStop = true;
        cur.isRunning = false;
        cur.status = 'STOPPED';
        if (Array.isArray(cur.active)) {
          cur.active = cur.active.map((w) => ({
            ...w,
            status: 'STOPPED',
            currentCompany: 'Stopped by user',
          }));
        }
        cur.logs = [
          ...(cur.logs || []),
          `[${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}] 🛑 Batch job stopped by user.`
        ].slice(-60);
        fs.writeFileSync(fPath, JSON.stringify(cur, null, 2));
      } catch {}
    }
  }

  // 2. Kill PID if saved
  if (fs.existsSync(pidFilePath)) {
    try {
      const { pid } = JSON.parse(fs.readFileSync(pidFilePath, 'utf8'));
      if (pid) {
        if (process.platform === 'win32') {
          try { execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' }); } catch {}
        } else {
          try { process.kill(pid, 'SIGKILL'); } catch {}
        }
      }
    } catch {}
    try { fs.unlinkSync(pidFilePath); } catch {}
  }

  // 3. Find and kill any node processes running distributedWorkerRunner.js
  if (process.platform === 'win32') {
    try {
      const psScript = `Get-CimInstance Win32_Process | Where-Object CommandLine -like '*distributedWorkerRunner*' | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`;
      execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript}"`, { stdio: 'ignore', timeout: 8000 });
    } catch {}
  }
}

if (require.main === module) {
  stopAll();
  console.log('Batch stopped.');
}

module.exports = { stopAll };
