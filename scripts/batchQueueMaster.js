/**
 * 👑 TradeScan BATCH QUEUE MASTER SCHEDULER
 * ==================================================================================
 * Coordinates multiple parallel workers (Account 1, 2, 3) turn-by-turn across a
 * list of HS codes. Auto-distributes tasks, generates isolated Excels, and streams
 * live progress.
 * ==================================================================================
 */

const { BatchWorker } = require('./batchWorkerEngine');
const path = require('path');
const fs = require('fs');

class BatchQueueMaster {
  constructor(options = {}) {
    this.workerCount = Math.min(Math.max(options.workerCount || 2, 1), 3);
    this.countryCode = options.countryCode || '699';
    this.tradeFlow = options.tradeFlow || 'exports';
    this.queue = [];
    this.activeWorkers = new Map();
    this.completed = [];
    this.failed = [];
    this.recentLogs = [];
    this.isRunning = false;
    this.stateFilePath = path.join(process.cwd(), 'scripts', '.batch_state.json');
    this.onUpdateCallback = options.onUpdate || null;
  }

  appendLog(msg) {
    console.log(msg);
    this.recentLogs.push(msg);
    if (this.recentLogs.length > 50) this.recentLogs.shift();
    this.saveState();
  }

  saveState() {
    try {
      const state = {
        isRunning: this.isRunning,
        workerCount: this.workerCount,
        pendingCount: this.queue.length,
        pendingQueue: this.queue,
        completed: this.completed,
        failed: this.failed,
        active: Array.from(this.activeWorkers.values()),
        logs: this.recentLogs,
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2));
      if (this.onUpdateCallback) this.onUpdateCallback(state);
    } catch (e) {}
  }

  async run(tasksList) {
    if (this.isRunning) throw new Error('A batch job is already running.');
    this.isRunning = true;

    // Normalize each task
    this.queue = tasksList.map((item) => {
      if (typeof item === 'object' && item !== null) {
        return {
          hsCode: String(item.hsCode).trim(),
          countryCode: item.countryCode || this.countryCode,
          countryName: item.countryName || 'India',
          tradeFlow: item.tradeFlow || this.tradeFlow,
          assignedWorkerId: item.assignedWorkerId ? Number(item.assignedWorkerId) : null,
        };
      }
      return {
        hsCode: String(item).trim(),
        countryCode: this.countryCode,
        countryName: 'India',
        tradeFlow: this.tradeFlow,
        assignedWorkerId: null,
      };
    }).filter((t) => Boolean(t.hsCode));

    this.completed = [];
    this.failed = [];
    this.activeWorkers.clear();

    console.log('======================================================================');
    console.log(`🚀 TradeScan PARALLEL BATCH RUNNER STARTED`);
    console.log(`📦 Total Tasks in Queue: ${this.queue.length} items`);
    console.log(`👥 Active Workers: ${this.workerCount} parallel accounts`);
    console.log('======================================================================\n');

    this.saveState();

    // Spawn workers
    const workerPromises = [];
    for (let wId = 1; wId <= this.workerCount; wId++) {
      workerPromises.push(this.runWorkerLoop(wId));
    }

    await Promise.all(workerPromises);

    this.isRunning = false;
    this.activeWorkers.clear();
    this.saveState();

    console.log('\n======================================================================');
    console.log(`🎉 ALL BATCH TASKS COMPLETED!`);
    console.log(`✅ Success: ${this.completed.length} Tasks`);
    console.log(`❌ Failed: ${this.failed.length} Tasks`);
    console.log('======================================================================\n');

    return { completed: this.completed, failed: this.failed };
  }

  async runWorkerLoop(workerId) {
    const worker = new BatchWorker(workerId, {
      onLog: (msg) => this.appendLog(msg),
    });

    try {
      while (true) {
        // Find next task assigned to this worker, or unassigned task
        const taskIdx = this.queue.findIndex(
          (t) => !t.assignedWorkerId || t.assignedWorkerId === workerId
        );
        if (taskIdx === -1) break;

        const [task] = this.queue.splice(taskIdx, 1);
        if (!task || !task.hsCode) break;

        this.activeWorkers.set(workerId, {
          workerId,
          hsCode: task.hsCode,
          countryName: task.countryName,
          tradeFlow: task.tradeFlow,
          page: 1,
          totalPages: 1,
          totalExtracted: 0,
          status: 'running',
          startedAt: new Date().toISOString(),
        });
        this.saveState();

        try {
          const result = await worker.scrapeHsCode({
            hsCode: task.hsCode,
            countryCode: task.countryCode,
            tradeFlow: task.tradeFlow,
            onProgress: (p) => {
              this.activeWorkers.set(workerId, {
                workerId,
                hsCode: task.hsCode,
                countryName: task.countryName,
                tradeFlow: task.tradeFlow,
                page: p.page,
                totalPages: p.totalPages,
                totalExtracted: p.totalExtracted,
                status: 'running',
              });
              this.saveState();
            },
          });

          this.completed.push({
            hsCode: task.hsCode,
            countryName: task.countryName,
            tradeFlow: task.tradeFlow,
            count: result.count,
            excel: result.excel,
            completedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.error(`❌ Worker #${workerId} failed on HS ${task.hsCode}: ${err.message}`);
          this.failed.push({
            hsCode: task.hsCode,
            countryName: task.countryName,
            tradeFlow: task.tradeFlow,
            error: err.message,
            failedAt: new Date().toISOString(),
          });
        }

        this.activeWorkers.delete(workerId);
        this.saveState();
      }
    } finally {
      await worker.close();
    }
  }
}

// CLI Support
if (require.main === module) {
  const args = process.argv.slice(2);
  const tasksArg = args.find((a) => a.startsWith('--tasksFile='));
  const hsArg = args.find((a) => a.startsWith('--hsCodes='));
  const workersArg = args.find((a) => a.startsWith('--workers='));
  const countryArg = args.find((a) => a.startsWith('--country='));
  const flowArg = args.find((a) => a.startsWith('--flow='));

  let list = [];
  if (tasksArg) {
    const filePath = tasksArg.replace('--tasksFile=', '');
    if (fs.existsSync(filePath)) {
      list = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } else if (hsArg) {
    const rawCodes = hsArg.replace('--hsCodes=', '');
    list = rawCodes.split(',').map((s) => s.trim()).filter(Boolean);
  }

  const workerCount = workersArg ? parseInt(workersArg.replace('--workers=', ''), 10) : 2;
  const country = countryArg ? countryArg.replace('--country=', '') : '699';
  const flow = flowArg ? flowArg.replace('--flow=', '') : 'exports';

  const master = new BatchQueueMaster({
    workerCount,
    countryCode: country,
    tradeFlow: flow,
  });

  master.run(list).catch((err) => {
    console.error('Fatal master error:', err);
    process.exit(1);
  });
}

module.exports = { BatchQueueMaster };

