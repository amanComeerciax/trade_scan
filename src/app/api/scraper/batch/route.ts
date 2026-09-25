import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { spawn, execSync } from 'child_process';

const stateFilePath = path.join(process.cwd(), 'scripts', '.batch_state.json');

export async function GET() {
  try {
    const configuredAccounts = Object.keys(process.env).filter(
      (k) => k.startsWith('TRADEMAP_ACCOUNT_') && k.endsWith('_USER')
    ).length;
    const accountCount = configuredAccounts > 0 ? configuredAccounts : 8;

    if (!fs.existsSync(stateFilePath)) {
      return NextResponse.json({
        isRunning: false,
        workerCount: accountCount,
        configuredAccountCount: accountCount,
        pendingCount: 0,
        pendingQueue: [],
        completed: [],
        failed: [],
        active: [],
        updatedAt: null,
      });
    }

    const raw = fs.readFileSync(stateFilePath, 'utf8');
    const state = JSON.parse(raw);
    state.configuredAccountCount = accountCount;
    if (!state.workerCount || state.workerCount === 0) {
      state.workerCount = accountCount;
    }
    return NextResponse.json(state);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

const COUNTRY_MAP: Record<string, { code: string; name: string }> = {
  world: { code: '000', name: 'World' },
  india: { code: '699', name: 'India' },
  germany: { code: '276', name: 'Germany' },
  vietnam: { code: '704', name: 'Vietnam' },
  usa: { code: '842', name: 'United States' },
  'united states': { code: '842', name: 'United States' },
  uae: { code: '784', name: 'United Arab Emirates' },
  'united arab emirates': { code: '784', name: 'United Arab Emirates' },
  china: { code: '156', name: 'China' },
  uk: { code: '826', name: 'United Kingdom' },
  'united kingdom': { code: '826', name: 'United Kingdom' },
  brazil: { code: '076', name: 'Brazil' },
  singapore: { code: '702', name: 'Singapore' },
  france: { code: '251', name: 'France' },
  italy: { code: '381', name: 'Italy' },
  japan: { code: '392', name: 'Japan' },
  canada: { code: '124', name: 'Canada' },
  australia: { code: '036', name: 'Australia' },
  turkey: { code: '792', name: 'Turkey' },
  indonesia: { code: '360', name: 'Indonesia' },
  malaysia: { code: '458', name: 'Malaysia' },
  'south korea': { code: '410', name: 'South Korea' },
  korea: { code: '410', name: 'South Korea' },
  thailand: { code: '764', name: 'Thailand' },
  spain: { code: '724', name: 'Spain' },
  netherlands: { code: '528', name: 'Netherlands' },
  'saudi arabia': { code: '682', name: 'Saudi Arabia' },
};

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.action === 'stop') {
      const pidFilePath = path.join(process.cwd(), 'scripts', '.batch_pid.json');
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

      // Execute dedicated stopBatch helper script
      try {
        const stopScript = path.join(process.cwd(), 'scripts', 'stopBatch.js');
        execSync(`node "${stopScript}"`, { stdio: 'ignore', timeout: 8000 });
      } catch {}

      // Guarantee immediate state reflection
      const distStatePath = path.join(process.cwd(), 'scripts', '.distributed_state.json');
      for (const fPath of [stateFilePath, distStatePath]) {
        if (fs.existsSync(fPath)) {
          try {
            const current = JSON.parse(fs.readFileSync(fPath, 'utf8'));
            current.shouldStop = true;
            current.isRunning = false;
            current.status = 'STOPPED';
            if (Array.isArray(current.active)) {
              current.active = current.active.map((w: any) => ({
                ...w,
                status: 'STOPPED',
                currentCompany: 'Stopped by user',
              }));
            }
            fs.writeFileSync(fPath, JSON.stringify(current, null, 2));
          } catch {}
        }
      }

      return NextResponse.json({
        success: true,
        isRunning: false,
        message: 'Batch job stopped and worker processes terminated.',
      });
    }

    if (body.action === 'start_extraction' || body.action === 'start_020130') {
      const hsCode = (body.hsCode || '020130').trim();
      const countryCode = (body.countryCode || '000').trim();
      const tradeFlow = (body.tradeFlow || 'exports').trim().toLowerCase();

      // Gracefully close any idle launch_browsers preview processes
      const launcherPidPath = path.join(process.cwd(), 'scripts', '.launcher_pid.json');
      if (fs.existsSync(launcherPidPath)) {
        try {
          const { pid } = JSON.parse(fs.readFileSync(launcherPidPath, 'utf8'));
          if (pid) {
            try { process.kill(pid); } catch {}
          }
          fs.unlinkSync(launcherPidPath);
        } catch {}
      }

      const pidFilePath = path.join(process.cwd(), 'scripts', '.batch_pid.json');
      // Launch 8-Chrome Parallel Engine for given HS Code
      const scriptPath = path.join(process.cwd(), 'scripts', 'multiChrome020130.js');
      const logFilePath = path.join(process.cwd(), 'scripts', 'batch_scraper.log');
      const logOut = fs.openSync(logFilePath, 'a');

      const child = spawn(
        process.execPath,
        [scriptPath, hsCode, countryCode, tradeFlow],
        {
          detached: true,
          stdio: ['ignore', logOut, logOut],
          cwd: process.cwd(),
        }
      );

      if (child.pid) {
        fs.writeFileSync(pidFilePath, JSON.stringify({ pid: child.pid }));
      }
      child.unref();

      const accountCount = Object.keys(process.env).filter(
        (k) => k.startsWith('TRADEMAP_ACCOUNT_') && k.endsWith('_USER')
      ).length || 8;

      const initialState = {
        isRunning: true,
        shouldStop: false,
        status: 'RUNNING',
        workerCount: accountCount,
        totalTasks: 200,
        completedTasks: 0,
        totalExtracted: 0,
        progressPercent: 0,
        logs: [
          `[${new Date().toLocaleTimeString()}] 🚀 Launching ${accountCount} Chrome Browsers for HS ${hsCode} (${tradeFlow}, Country: ${countryCode})...`
        ],
        updatedAt: new Date().toISOString(),
      };
      try { fs.writeFileSync(stateFilePath, JSON.stringify(initialState, null, 2)); } catch {}

      return NextResponse.json({
        success: true,
        isRunning: true,
        message: `🚀 ${accountCount}-Chrome Engine started for HS ${hsCode} (${tradeFlow})!`,
      });
    }

    if (body.action === 'launch_browsers') {
      const hsCode = (body.hsCode || '020130').trim();
      const countryCode = (body.countryCode || '000').trim();
      const tradeFlow = (body.tradeFlow || 'exports').trim().toLowerCase();

      const launcherPidPath = path.join(process.cwd(), 'scripts', '.launcher_pid.json');
      if (fs.existsSync(launcherPidPath)) {
        try {
          const { pid } = JSON.parse(fs.readFileSync(launcherPidPath, 'utf8'));
          if (pid) {
            try { process.kill(pid); } catch {}
          }
        } catch {}
      }

      const scriptPath = path.join(process.cwd(), 'scripts', 'launchAllAccounts.js');
      const child = spawn(
        process.execPath,
        [scriptPath, hsCode, countryCode, tradeFlow],
        {
          detached: true,
          stdio: 'ignore',
          cwd: process.cwd(),
        }
      );
      if (child.pid) {
        fs.writeFileSync(launcherPidPath, JSON.stringify({ pid: child.pid }));
      }
      child.unref();

      const accountCount = Object.keys(process.env).filter(
        (k) => k.startsWith('TRADEMAP_ACCOUNT_') && k.endsWith('_USER')
      ).length || 8;

      return NextResponse.json({
        success: true,
        message: `🚀 ${accountCount} Chrome browsers launched with auto-login for HS ${hsCode} (${tradeFlow})!`,
      });
    }

    const {
      hsCodes = [],
      workerCount = 4,
      countryCode = '699',
      tradeFlow = 'exports',
    } = body;

    interface TaskItem {
      hsCode: string;
      countryCode: string;
      countryName: string;
      tradeFlow: string;
      startPage: number | null;
      assignedWorkerId: number | null;
    }

    const parseLine = (line: string, assignedWorkerId?: number): TaskItem | null => {
      const parts = line.split(/[,|\t]+/).map((s) => s.trim()).filter(Boolean);
      const code = parts[0] ? parts[0].replace(/[^\w]/g, '') : '';
      if (!code) return null;

      let cCode = String(countryCode || 'WORLD');
      let cName = countryCode === '699' ? 'India' : 'World';
      let fFlow = String(tradeFlow || 'exports');

      if (parts.length >= 2) {
        const p2 = parts[1].toLowerCase();
        if (p2.includes('exp') || p2 === 'e') {
          fFlow = 'exports';
        } else if (p2.includes('imp') || p2 === 'i') {
          fFlow = 'imports';
        } else if (COUNTRY_MAP[p2]) {
          cCode = COUNTRY_MAP[p2].code;
          cName = COUNTRY_MAP[p2].name;
        } else {
          cName = parts[1];
        }
      }

      if (parts.length >= 3) {
        const p3 = parts[2].toLowerCase();
        if (p3.includes('exp') || p3 === 'e') {
          fFlow = 'exports';
        } else if (p3.includes('imp') || p3 === 'i') {
          fFlow = 'imports';
        } else if (COUNTRY_MAP[p3]) {
          cCode = COUNTRY_MAP[p3].code;
          cName = COUNTRY_MAP[p3].name;
        }
      }

      let customStartPage: number | null = null;
      const pageMatch = line.match(/(?:page|p|start)\s*[:=]?\s*(\d+)/i) || line.match(/:(\d+)$/);
      if (pageMatch) customStartPage = parseInt(pageMatch[1], 10);

      return {
        hsCode: code,
        countryCode: cCode,
        countryName: cName,
        tradeFlow: fFlow,
        startPage: customStartPage,
        assignedWorkerId: assignedWorkerId || null,
      };
    };

    let tasks: TaskItem[] = [];

    if (body.workerTasks && typeof body.workerTasks === 'object') {
      for (const [wIdStr, lines] of Object.entries(body.workerTasks)) {
        const wId = parseInt(wIdStr, 10);
        const lineList = Array.isArray(lines) ? lines : String(lines).split(/\r?\n/);
        for (const line of lineList) {
          if (typeof line === 'string' && line.trim()) {
            const parsed = parseLine(line.trim(), wId);
            if (parsed) tasks.push(parsed);
          }
        }
      }
    }

    if (tasks.length === 0) {
      const rawLines: string[] = Array.isArray(hsCodes)
        ? hsCodes.map(String)
        : String(hsCodes)
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);

      tasks = rawLines
        .map((line) => parseLine(line))
        .filter((t): t is TaskItem => Boolean(t));
    }

    if (tasks.length === 0) {
      return NextResponse.json(
        { error: 'Please provide at least one valid HS code.' },
        { status: 400 }
      );
    }

    // Check if another batch job is running
    if (fs.existsSync(stateFilePath)) {
      try {
        const current = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
        if (current.isRunning) {
          return NextResponse.json(
            { error: 'A batch scrape job is already currently running.' },
            { status: 409 }
          );
        }
      } catch {}
    }

    // Save tasks to temp file
    const tasksFilePath = path.join(process.cwd(), 'scripts', '.batch_tasks.json');
    fs.writeFileSync(tasksFilePath, JSON.stringify(tasks, null, 2));

    // Reset state files for new active run
    const initialState = {
      isRunning: true,
      shouldStop: false,
      status: 'RUNNING',
      workerCount,
      pendingCount: tasks.length,
      totalTasks: tasks.length,
      completedTasks: 0,
      totalExtracted: 0,
      progressPercent: 0,
      active: [],
      completed: [],
      failed: [],
      logs: [
        `[${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}] 🚀 Launching ${workerCount}x Parallel Batch Pipeline with ${tasks.length} task(s)...`
      ],
      updatedAt: new Date().toISOString(),
    };
    try { fs.writeFileSync(stateFilePath, JSON.stringify(initialState, null, 2)); } catch {}
    const distStatePath = path.join(process.cwd(), 'scripts', '.distributed_state.json');
    try { fs.writeFileSync(distStatePath, JSON.stringify(initialState, null, 2)); } catch {}

    // Launch distributed queue master in independent detached background process with dedicated log file
    const scriptPath = path.join(process.cwd(), 'scripts', 'distributedWorkerRunner.js');
    const logFilePath = path.join(process.cwd(), 'scripts', 'batch_scraper.log');
    const logOut = fs.openSync(logFilePath, 'a');

    const child = spawn(
      process.execPath,
      [
        scriptPath,
        `--tasksFile=${tasksFilePath}`,
        `--workers=${Math.min(Math.max(workerCount, 1), 4)}`,
        `--country=${countryCode}`,
        `--flow=${tradeFlow}`,
      ],
      {
        detached: true,
        stdio: ['ignore', logOut, logOut],
        cwd: process.cwd(),
      }
    );

    const pidFilePath = path.join(process.cwd(), 'scripts', '.batch_pid.json');
    if (child.pid) {
      fs.writeFileSync(pidFilePath, JSON.stringify({ pid: child.pid }));
    }
    child.unref();

    return NextResponse.json({
      success: true,
      message: `Batch job initiated with ${tasks.length} tasks across ${workerCount} worker(s).`,
      tasks,
      workerCount,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
