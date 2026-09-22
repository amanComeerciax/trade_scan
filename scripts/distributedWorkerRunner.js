/**
 * 👑 TradeScan DISTRIBUTED PRODUCER-CONSUMER RUNNER (4x High-Speed Parallel Engine)
 * ==================================================================================
 * Master Producer: Analyzes searches and creates page-level tasks in MongoDB.
 * 4 Worker Consumers (Account 1, 2, 3, 4): Parallel STS workers with lease-locking,
 * live telemetry, dynamic ETA, and atomic database upserts.
 * ==================================================================================
 */

const { DistributedQueueManager } = require('./distributedQueueManager');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

require('dotenv').config();
const prisma = new PrismaClient();
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

const WORKER_CREDENTIALS = {
  1: {
    username: process.env.TRADEMAP_ACCOUNT_1_USER || 'kingamaan14@gmail.com',
    password: process.env.TRADEMAP_ACCOUNT_1_PASS || '',
  },
  2: {
    username: process.env.TRADEMAP_ACCOUNT_2_USER || 'modipriyanshi013@gmail.com',
    password: process.env.TRADEMAP_ACCOUNT_2_PASS || '',
  },
  3: {
    username: process.env.TRADEMAP_ACCOUNT_3_USER || 'trademap1235665@gmail.com',
    password: process.env.TRADEMAP_ACCOUNT_3_PASS || '',
  },
  4: {
    username: process.env.TRADEMAP_ACCOUNT_4_USER || 'deepthacker.402060@gmail.com',
    password: process.env.TRADEMAP_ACCOUNT_4_PASS || '',
  },
};

class DistributedWorkerRunner {
  constructor(options = {}) {
    this.queue = new DistributedQueueManager();
    this.activeWorkers = Math.min(Math.max(options.workerCount || 4, 1), 4);
    this.tokens = {}; // workerId -> { token, expiresAt, refreshToken }
    this.isRunning = false;
    this.shouldStop = false;
    this.recentLogs = [];
    this.startedAt = null;
    this.currentBatchId = null;
    this.totalTasksCount = 0;
    this.completedTasksCount = 0;
    this.totalRecordsExtracted = 0;
    this.completedHsList = [];
    this.stateFilePath = path.join(process.cwd(), 'scripts', '.distributed_state.json');
    this.batchStatePath = path.join(process.cwd(), 'scripts', '.batch_state.json');
    this.onUpdateCallback = options.onUpdate || null;

    // Per-worker detailed live telemetry
    this.workerStates = {};
    for (let i = 1; i <= this.activeWorkers; i++) {
      const email = WORKER_CREDENTIALS[i]?.username || `Worker #${i}`;
      this.workerStates[i] = {
        workerId: i,
        email: email,
        displayAccount: email.split('@')[0],
        status: 'IDLE', // 'IDLE' | 'STARTING' | 'FETCHING' | 'ENRICHING' | 'TASK_DONE' | 'STOPPED'
        hsCode: null,
        countryName: null,
        tradeFlow: null,
        page: 0,
        totalPages: 0,
        currentRecord: 0,
        totalOnPage: 0,
        extractedThisTask: 0,
        totalExtracted: 0,
        currentCompany: 'Waiting for queue task...',
        updatedAt: Date.now(),
      };
    }
  }

  log(msg) {
    const time = new Date().toLocaleTimeString();
    const formatted = `[${time}] ${msg}`;
    console.log(formatted);
    this.recentLogs.push(formatted);
    if (this.recentLogs.length > 60) this.recentLogs.shift();
    this.saveState();
  }

  saveState(extra = {}) {
    try {
      const now = Date.now();
      const elapsedSeconds = this.startedAt ? Math.max(1, Math.round((now - this.startedAt) / 1000)) : 0;
      
      let etaSeconds = 0;
      let progressPercent = 0;
      let speedRecordsPerMin = 0;

      if (this.totalTasksCount > 0) {
        progressPercent = Math.min(100, Math.round((this.completedTasksCount / this.totalTasksCount) * 100));
        const remainingTasks = Math.max(0, this.totalTasksCount - this.completedTasksCount);
        
        if (this.completedTasksCount > 0 && remainingTasks > 0) {
          const avgSecPerTask = elapsedSeconds / this.completedTasksCount;
          etaSeconds = Math.round((remainingTasks * avgSecPerTask) / Math.max(1, this.activeWorkers));
        } else if (remainingTasks > 0) {
          // Initial estimate: ~4 sec per task across workers
          etaSeconds = Math.round((remainingTasks * 4) / Math.max(1, this.activeWorkers));
        }
      }

      if (elapsedSeconds > 5 && this.totalRecordsExtracted > 0) {
        speedRecordsPerMin = Math.round((this.totalRecordsExtracted / elapsedSeconds) * 60);
      }

      if (fs.existsSync(this.batchStatePath)) {
        try {
          const cur = JSON.parse(fs.readFileSync(this.batchStatePath, 'utf8'));
          if (cur.shouldStop) {
            this.shouldStop = true;
            this.isRunning = false;
          }
        } catch {}
      }

      const state = {
        isRunning: this.shouldStop ? false : this.isRunning,
        shouldStop: Boolean(this.shouldStop),
        batchId: this.currentBatchId,
        startedAt: this.startedAt,
        elapsedSeconds,
        etaSeconds,
        progressPercent,
        speedRecordsPerMin,
        totalTasks: this.totalTasksCount,
        completedTasks: this.completedTasksCount,
        pendingCount: Math.max(0, this.totalTasksCount - this.completedTasksCount),
        totalExtracted: this.totalRecordsExtracted,
        workerCount: this.activeWorkers,
        active: activeWorkersList,
        completed: this.completedHsList,
        failed: [],
        logs: this.recentLogs,
        updatedAt: new Date().toISOString(),
        ...extra,
      };

      fs.writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2));
      fs.writeFileSync(this.batchStatePath, JSON.stringify(state, null, 2));
      if (this.onUpdateCallback) this.onUpdateCallback(state);
    } catch {}
  }

  /**
   * TradeMap STS Direct OAuth2 Token
   */
  async getOrRefreshToken(workerId) {
    const creds = WORKER_CREDENTIALS[workerId] || WORKER_CREDENTIALS[1];
    const cached = this.tokens[workerId];

    if (cached && cached.token && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    // Refresh token flow
    if (cached && cached.refreshToken) {
      try {
        const res = await fetch('https://sts.marketanalysis.intracen.org/connect/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: 'TradeMap',
            grant_type: 'refresh_token',
            refresh_token: cached.refreshToken,
          }).toString(),
        });
        const data = await res.json();
        if (data.access_token) {
          this.tokens[workerId] = {
            token: data.access_token,
            refreshToken: data.refresh_token || cached.refreshToken,
            expiresAt: Date.now() + ((data.expires_in || 3600) - 120) * 1000,
          };
          return data.access_token;
        }
      } catch {}
    }

    // Password grant flow
    this.log(`🔐 Worker #${workerId} (${creds.username}) authenticating via TradeMap STS...`);
    const res = await fetch('https://sts.marketanalysis.intracen.org/connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: 'TradeMap',
        grant_type: 'password',
        username: creds.username,
        password: creds.password,
        scope: 'openid profile offline_access TradeMap.API Account.API',
      }).toString(),
    });

    const data = await res.json();
    if (!data.access_token) {
      throw new Error(`Auth failed for Account #${workerId}: ${data.error_description || data.error}`);
    }

    this.tokens[workerId] = {
      token: data.access_token,
      refreshToken: data.refresh_token || null,
      expiresAt: Date.now() + ((data.expires_in || 3600) - 120) * 1000,
    };

    this.log(`🔑 Worker #${workerId}: STS Token active!`);
    return data.access_token;
  }

  /**
   * PRODUCER: Splits user search items into page-level tasks in MongoDB
   */
  async produceTasks(searchesList, batchId) {
    this.log(`📦 [Master Producer] Calculating pages for ${searchesList.length} search criteria...`);
    const masterToken = await this.getOrRefreshToken(1);
    const tasksToEnqueue = [];

    for (const search of searchesList) {
      const hsCode = String(search.hsCode).trim();
      const countryCode = String(search.countryCode || '699').trim();
      const countryName = search.countryName || 'India';
      const tradeFlow = search.tradeFlow || 'exports';

      try {
        const flow = tradeFlow.toUpperCase().startsWith('E') ? 'E' : 'I';
        const cCode = countryCode || '000';
        const url = `https://www.trademap.org/api/companies?tradeFlow=${flow}&product=${encodeURIComponent(hsCode)}&productType=p&country=${encodeURIComponent(cCode)}&page=1&pageSize=100&sortBy=companyName&sortDir=asc`;
        const res = await fetch(url, {
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Authorization': `Bearer ${masterToken}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          },
        });

        const data = await res.json();
        const list = data.records || [];
        const totalRecords = data.nbRecords !== undefined ? data.nbRecords : list.length;
        const totalPages = data.nbPages !== undefined ? data.nbPages : (totalRecords > 0 ? Math.ceil(totalRecords / 100) : 0);

        this.log(`🔎 [Master Producer] HS ${hsCode} (${tradeFlow}, ${countryName}): Found ${totalRecords} records across ${totalPages} page(s)`);

        if (totalPages === 0) {
          this.log(`⚠️ HS ${hsCode} has 0 records. Skipping.`);
          continue;
        }

        for (let p = 1; p <= totalPages; p++) {
          tasksToEnqueue.push({
            hsCode,
            countryCode,
            countryName,
            tradeFlow,
            page: p,
            totalPages,
          });
        }
      } catch (err) {
        this.log(`❌ Error inspecting HS ${hsCode}: ${err.message}. Enqueuing fallback Page 1.`);
        tasksToEnqueue.push({
          hsCode,
          countryCode,
          countryName,
          tradeFlow,
          page: 1,
          totalPages: 1,
        });
      }
    }

    const count = await this.queue.enqueueBatchTasks({ batchId, tasks: tasksToEnqueue });
    this.totalTasksCount = count;
    this.log(`✅ [Master Producer] Successfully loaded ${count} discrete tasks into MongoDB Queue!`);
    this.saveState();
    return count;
  }

  /**
   * Fetch company contact details (Phone, Director, Role)
   */
  async fetchCompanyContact(token, companyId, sourceId = 1) {
    if (!companyId) return null;
    const url = `https://www.trademap.org/api/companies/contact?companyId=${encodeURIComponent(companyId)}&sourceId=${sourceId}`;
    try {
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        },
      });
      if (res.status === 200) return await res.json().catch(() => null);
      return null;
    } catch {
      return null;
    }
  }

  cleanDirectorName(name) {
    if (!name) return null;
    let clean = name.trim();
    if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(clean)) return null;
    if (/^(\+?\d[\d\s\-().]{5,}\d)$/.test(clean)) return null;
    clean = clean.replace(/^(Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Shri|Prof\.?)\s+/i, '');
    return clean.length >= 2 ? clean : null;
  }

  cleanPhone(phone) {
    if (!phone) return null;
    let clean = phone.trim().replace(/\s+/g, ' ');
    if (clean.includes('/')) clean = clean.split('/')[0].trim();
    if (clean.includes(',')) clean = clean.split(',')[0].trim();
    if (clean.includes(';')) clean = clean.split(';')[0].trim();
    if (clean.length < 6) return null;
    return clean;
  }

  /**
   * Atomically Upsert Company into MongoDB
   */
  async upsertCompany(data, hsCode, tradeFlowStr) {
    const trademapId = data.id ? String(data.id) : null;
    const cleanName = data.name.trim();
    const finalCountry = data.country || 'India';

    const payload = {
      ...(trademapId ? { trademapId } : {}),
      city: data.city || null,
      address: data.address || null,
      phone: data.phone || null,
      contactName: data.contactName || null,
      contactRole: data.contactRole || (data.contactName ? 'Director' : null),
      website: data.website || null,
      sourceUrl: data.sourceUrl || null,
      tradeFlow: tradeFlowStr,
      source: 'TradeMap Direct STS API',
    };

    let company = null;
    try {
      if (trademapId) {
        company = await prisma.company.upsert({
          where: { trademapId },
          update: payload,
          create: { name: cleanName, country: finalCountry, ...payload },
        });
      } else {
        company = await prisma.company.upsert({
          where: { name_country: { name: cleanName, country: finalCountry } },
          update: payload,
          create: { name: cleanName, country: finalCountry, ...payload },
        });
      }
    } catch (upsertErr) {
      company = (trademapId ? await prisma.company.findUnique({ where: { trademapId } }) : null) ||
                await prisma.company.findFirst({ where: { name: cleanName, country: finalCountry } });
    }

    if (!company) return null;

    const existingProd = await prisma.companyProduct.findFirst({
      where: { companyId: company.id, hsCode, tradeType: tradeFlowStr },
    });
    if (!existingProd) {
      await prisma.companyProduct.create({
        data: {
          companyId: company.id,
          hsCode,
          productCategory: `HS ${hsCode} Goods`,
          tradeType: tradeFlowStr,
        },
      }).catch(() => {});
    }

    return company;
  }

  /**
   * CONSUMER: Independent Worker Loop for Account #1, 2, 3, or 4
   */
  async runWorkerLoop(workerId, batchId) {
    this.log(`👷 Worker #${workerId} started parallel consumer loop.`);
    if (this.workerStates[workerId]) {
      this.workerStates[workerId].status = 'STARTING';
      this.saveState();
    }

    while (this.isRunning && !this.shouldStop) {
      // Check for stop request from UI
      if (this.shouldStop) break;
      if (fs.existsSync(this.batchStatePath)) {
        try {
          const cur = JSON.parse(fs.readFileSync(this.batchStatePath, 'utf8'));
          if (cur.shouldStop) {
            this.shouldStop = true;
            this.isRunning = false;
            this.log(`🛑 Stop signal received. Worker #${workerId} stopping.`);
            if (this.workerStates[workerId]) {
              this.workerStates[workerId].status = 'STOPPED';
              this.workerStates[workerId].currentCompany = 'Stopped by user';
            }
            this.saveState();
            break;
          }
        } catch {}
      }
      if (this.shouldStop || !this.isRunning) break;

      // 1. Claim next task atomically from MongoDB Queue
      const task = await this.queue.claimNextTask(workerId, batchId);

      if (!task) {
        // Check if entire batch is finished
        const stats = await this.queue.getBatchStats(batchId);
        if (stats.isFinished) {
          this.log(`🏁 Worker #${workerId}: No more tasks in batch. Consumer completed.`);
          if (this.workerStates[workerId]) {
            this.workerStates[workerId].status = 'IDLE';
            this.workerStates[workerId].currentCompany = 'All tasks completed.';
          }
          this.saveState();
          break;
        }
        if (this.workerStates[workerId]) {
          this.workerStates[workerId].status = 'IDLE';
          this.workerStates[workerId].currentCompany = 'Waiting for queue tasks...';
        }
        this.saveState();
        await sleep(2000);
        continue;
      }

      // Update worker live status
      if (this.workerStates[workerId]) {
        this.workerStates[workerId].status = 'FETCHING';
        this.workerStates[workerId].hsCode = task.hsCode;
        this.workerStates[workerId].countryName = task.countryName;
        this.workerStates[workerId].tradeFlow = task.tradeFlow;
        this.workerStates[workerId].page = task.page;
        this.workerStates[workerId].totalPages = task.totalPages;
        this.workerStates[workerId].currentCompany = `Fetching HS ${task.hsCode} Page ${task.page}...`;
        this.workerStates[workerId].extractedThisTask = 0;
        this.workerStates[workerId].updatedAt = Date.now();
      }
      this.saveState();

      this.log(`📥 Worker #${workerId} CLAIMED: HS ${task.hsCode} | Page ${task.page}/${task.totalPages} (${task.tradeFlow})`);

      try {
        const token = await this.getOrRefreshToken(workerId);
        const flow = task.tradeFlow.toUpperCase().startsWith('E') ? 'E' : 'I';
        const cCode = task.countryCode || '000';
        const url = `https://www.trademap.org/api/companies?tradeFlow=${flow}&product=${encodeURIComponent(task.hsCode)}&productType=p&country=${encodeURIComponent(cCode)}&page=${task.page}&pageSize=100&sortBy=companyName&sortDir=asc`;

        const res = await fetch(url, {
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          },
        });

        if (res.status === 401) {
          delete this.tokens[workerId];
          throw new Error('Token expired');
        }

        if (res.status === 403) {
          const errText = await res.text().catch(() => '');
          this.log(`⚠️ Worker #${workerId} PAUSED: Received 403 Forbidden (${errText.slice(0, 60)}). Deactivating this worker.`);
          if (this.workerStates[workerId]) {
            this.workerStates[workerId].status = 'DISABLED';
            this.workerStates[workerId].currentCompany = 'Access restricted (403)';
          }
          await this.queue.failTask(task._id, 'Access forbidden (403)');
          this.saveState();
          break;
        }

        const rawText = await res.text();
        if (rawText.includes('Forbidden:') || rawText.includes('blacklisted') || rawText.includes('account-blocked')) {
          this.log(`⚠️ Worker #${workerId} PAUSED: Received TradeMap blacklist response. Deactivating this worker.`);
          if (this.workerStates[workerId]) {
            this.workerStates[workerId].status = 'DISABLED';
            this.workerStates[workerId].currentCompany = 'Blacklisted by TradeMap WAF';
          }
          await this.queue.failTask(task._id, 'Blacklisted by TradeMap');
          this.saveState();
          break;
        }

        let data = {};
        try {
          data = JSON.parse(rawText);
        } catch (jsonErr) {
          throw new Error(`Invalid response format from TradeMap: ${rawText.slice(0, 80)}`);
        }

        const rawCompanies = data.records || [];
        this.log(`📊 Worker #${workerId}: Received ${rawCompanies.length} companies for HS ${task.hsCode} (Page ${task.page})`);

        if (this.workerStates[workerId]) {
          this.workerStates[workerId].status = 'ENRICHING';
          this.workerStates[workerId].totalOnPage = rawCompanies.length;
        }
        this.saveState();

        let extractedCount = 0;
        for (let i = 0; i < rawCompanies.length; i++) {
          // Re-check stop signal during long loops
          if (this.shouldStop) break;
          if (i % 5 === 0 && fs.existsSync(this.batchStatePath)) {
            try {
              const cur = JSON.parse(fs.readFileSync(this.batchStatePath, 'utf8'));
              if (cur.shouldStop) {
                this.shouldStop = true;
                this.isRunning = false;
                break;
              }
            } catch {}
          }
          if (this.shouldStop) break;

          const raw = rawCompanies[i];
          const tradeFlowStr = task.tradeFlow === 'imports' ? 'Importer' : 'Exporter';

          let phone = this.cleanPhone(raw.phone || raw.telephone);
          let contactName = null;
          let contactRole = null;

          // Enrich contact details
          const contact = await this.fetchCompanyContact(token, raw.id, raw.sourceId || 1);
          if (contact) {
            contactName = this.cleanDirectorName(contact.name || contact.contactPerson);
            contactRole = contact.role || contact.contactRole || (contactName ? 'Director' : null);
            if (contact.phone) phone = this.cleanPhone(contact.phone) || phone;
          }

          const parsed = {
            id: raw.id,
            name: raw.name || raw.company,
            country: task.countryName,
            city: raw.city || null,
            address: raw.address || raw.city || null,
            phone: phone || null,
            contactName: contactName || null,
            contactRole: contactRole || null,
            website: raw.website || null,
            sourceUrl: `https://www.trademap.org/Company_SelProduct_TS.aspx`,
          };

          await this.upsertCompany(parsed, task.hsCode, tradeFlowStr);
          extractedCount++;

          if (this.workerStates[workerId]) {
            this.workerStates[workerId].currentRecord = i + 1;
            this.workerStates[workerId].extractedThisTask = extractedCount;
            this.workerStates[workerId].currentCompany = parsed.name;
          }

          // Periodic state save every 10 records for smooth live telemetry
          if (i % 8 === 0 || i === rawCompanies.length - 1) {
            this.saveState();
          }

          await sleep(180);
        }

        // Mark task complete
        await this.queue.completeTask(task._id, extractedCount);
        this.completedTasksCount++;
        this.totalRecordsExtracted += extractedCount;

        if (this.workerStates[workerId]) {
          this.workerStates[workerId].status = 'TASK_DONE';
          this.workerStates[workerId].totalExtracted = (this.workerStates[workerId].totalExtracted || 0) + extractedCount;
          this.workerStates[workerId].currentCompany = `Completed ${extractedCount} verified profiles`;
        }
        this.saveState();

        this.log(`✅ Worker #${workerId} COMPLETED: HS ${task.hsCode} Page ${task.page} (${extractedCount} companies saved)`);
      } catch (err) {
        this.log(`⚠️ Worker #${workerId} FAILED on HS ${task.hsCode} Page ${task.page}: ${err.message}`);
        await this.queue.failTask(task._id, err.message);
        if (this.workerStates[workerId]) {
          this.workerStates[workerId].status = 'IDLE';
          this.workerStates[workerId].currentCompany = `Error: ${err.message}`;
        }
        this.saveState();
        await sleep(3000);
      }
    }
  }

  /**
   * Generate Consolidated Excel for finished batch
   */
  async generateBatchExcels(searchesList) {
    const exportDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
    const generatedFiles = [];

    for (const search of searchesList) {
      const hsCode = String(search.hsCode).trim();
      const tradeFlow = search.tradeFlow || 'exports';
      const countryName = search.countryName || 'India';

      const products = await prisma.companyProduct.findMany({
        where: { hsCode },
        include: { company: true },
      });

      if (products.length === 0) continue;

      const rows = products.map((p, idx) => {
        const c = p.company;
        return {
          '#': idx + 1,
          'Company Name': c.name,
          'Trade Flow': p.tradeType || c.tradeFlow || 'Both',
          'Country': c.country,
          'City': c.city || 'N/A',
          'Key Contact Person': c.contactName || 'N/A',
          'Role / Designation': c.contactRole || 'Director',
          'Phone Number': c.phone || 'N/A',
          'Website': c.website || 'N/A',
          'HS Code': p.hsCode,
          'Product Category': p.productCategory,
          'Extracted At': c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'N/A',
        };
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, `HS_${hsCode}`);

      const filename = `TradeScan_${hsCode}_${tradeFlow}_${countryName.replace(/\s+/g, '_')}_${Date.now()}.xlsx`;
      const filePath = path.join(exportDir, filename);
      XLSX.writeFile(wb, filePath);

      generatedFiles.push({ hsCode, filePath, total: rows.length, filename });
      this.completedHsList.push({
        hsCode,
        countryName,
        tradeFlow,
        count: rows.length,
        filename,
      });
      this.log(`📁 Generated Excel for HS ${hsCode}: ${filename} (${rows.length} rows)`);
      this.saveState();
    }

    return generatedFiles;
  }

  /**
   * Main Entry Point
   */
  async runDistributedBatch(searchesList) {
    if (this.isRunning) throw new Error('A distributed batch job is already running.');
    this.isRunning = true;
    this.startedAt = Date.now();

    const batchId = `batch_${Date.now()}`;
    this.currentBatchId = batchId;

    this.log('======================================================================');
    this.log(`🚀 STARTING DISTRIBUTED QUEUE BATCH: ${batchId}`);
    this.log(`👥 Active Worker Accounts: ${this.activeWorkers} (4x Parallel Pipeline)`);
    this.log('======================================================================\n');
    this.saveState();

    try {
      // Step 1: Master Producer generates tasks
      const totalTasks = await this.produceTasks(searchesList, batchId);
      if (totalTasks === 0) {
        this.log('⚠️ No tasks created. Exiting batch.');
        this.isRunning = false;
        this.saveState();
        return { batchId, totalTasks: 0, files: [] };
      }

      // Step 2: Spawn 4 Consumer Workers in parallel
      const workerPromises = [];
      for (let wId = 1; wId <= this.activeWorkers; wId++) {
        workerPromises.push(this.runWorkerLoop(wId, batchId));
      }

      await Promise.all(workerPromises);

      if (this.shouldStop) {
        this.log('\n🛑 Batch execution was stopped by user. Cleaning up...');
        this.isRunning = false;
        this.saveState({
          isComplete: false,
          shouldStop: true,
          status: 'STOPPED',
          etaSeconds: 0,
        });
        return { batchId, totalTasks: this.totalTasksCount, stopped: true };
      }

      // Step 3: Generate Excel reports
      this.log('\n📦 All workers finished! Generating consolidated Excel exports...');
      const files = await this.generateBatchExcels(searchesList);

      const finalStats = await this.queue.getBatchStats(batchId);
      this.log('\n======================================================================');
      this.log(`🎉 DISTRIBUTED BATCH FINISHED!`);
      this.log(`✅ Completed Tasks: ${finalStats.completed}/${finalStats.total}`);
      this.log(`❌ Failed Tasks: ${finalStats.failed}/${finalStats.total}`);
      this.log(`📊 Total Records Extracted: ${finalStats.totalRecordsExtracted}`);
      this.log('======================================================================\n');

      this.isRunning = false;
      this.saveState({
        isComplete: true,
        etaSeconds: 0,
        progressPercent: 100,
        completed: this.completedHsList,
      });
      return { batchId, stats: finalStats, files };
    } catch (err) {
      this.log(`❌ Distributed Batch Error: ${err.message}`);
      this.isRunning = false;
      this.saveState({ isError: true, error: err.message });
      throw err;
    }
  }
}

module.exports = { DistributedWorkerRunner };

if (require.main === module) {
  const args = process.argv.slice(2);
  let tasksFile = null;
  let workers = 4;

  for (const arg of args) {
    if (arg.startsWith('--tasksFile=')) tasksFile = arg.split('=')[1];
    if (arg.startsWith('--workers=')) workers = parseInt(arg.split('=')[1], 10) || 4;
  }

  let tasks = [
    { hsCode: '0101', countryCode: '699', countryName: 'India', tradeFlow: 'exports' },
  ];

  if (tasksFile && fs.existsSync(tasksFile)) {
    try {
      tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
    } catch {}
  }

  const runner = new DistributedWorkerRunner({ workerCount: workers });
  runner.runDistributedBatch(tasks).then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
