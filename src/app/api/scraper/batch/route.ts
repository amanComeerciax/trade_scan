import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

const stateFilePath = path.join(process.cwd(), 'scripts', '.batch_state.json');

export async function GET() {
  try {
    if (!fs.existsSync(stateFilePath)) {
      return NextResponse.json({
        isRunning: false,
        workerCount: 0,
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
    const {
      hsCodes = [],
      workerCount = 2,
      countryCode = '699',
      tradeFlow = 'exports',
    } = body;

    const parseLine = (line: string, assignedWorkerId?: number) => {
      const parts = line.split(/[,|\t]+/).map((s) => s.trim()).filter(Boolean);
      const code = parts[0] ? parts[0].replace(/[^\w]/g, '') : '';
      if (!code) return null;

      let cCode = countryCode;
      let cName = countryCode === '699' ? 'India' : 'World';
      let fFlow = tradeFlow;

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

      return {
        hsCode: code,
        countryCode: cCode,
        countryName: cName,
        tradeFlow: fFlow,
        assignedWorkerId: assignedWorkerId || null,
      };
    };

    let tasks: { hsCode: string; countryCode: string; countryName: string; tradeFlow: string; assignedWorkerId: number | null }[] = [];

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
        .filter((t): t is { hsCode: string; countryCode: string; countryName: string; tradeFlow: string; assignedWorkerId: number | null } => Boolean(t));
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

    // Launch distributed queue master in independent detached background process with dedicated log file
    const scriptPath = path.join(process.cwd(), 'scripts', 'distributedWorkerRunner.js');
    const logFilePath = path.join(process.cwd(), 'scripts', 'batch_scraper.log');
    const logOut = fs.openSync(logFilePath, 'a');

    const child = spawn(
      process.execPath,
      [
        scriptPath,
        `--tasksFile=${tasksFilePath}`,
        `--workers=${Math.min(Math.max(workerCount, 1), 3)}`,
        `--country=${countryCode}`,
        `--flow=${tradeFlow}`,
      ],
      {
        detached: true,
        stdio: ['ignore', logOut, logOut],
        cwd: process.cwd(),
      }
    );

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
